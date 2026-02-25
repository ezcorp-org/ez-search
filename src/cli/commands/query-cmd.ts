/**
 * Query command — multi-collection grouped semantic search.
 *
 * Pipeline:
 *   1. Resolve project directory (cwd or explicit projectDir)
 *   2. Open vector collections (col-768 for code+text, col-512 for images)
 *   3. Load manifest for totalIndexed count
 *   4. For each requested type:
 *      a. code:  embed with Qwen3 (instruct prefix), query col-768, filter by Qwen3 modelId
 *      b. text:  embed with Qwen3 (instruct prefix), query col-768, filter by Qwen3 modelId
 *      c. image: embed with CLIP text encoder, query col-512
 *   5. Apply --threshold and --dir filters per type
 *   6. Collapse adjacent chunks per type
 *   7. Sort by score desc, slice to topK per type
 *   8. Output grouped JSON { code: [...], text: [...], image: [...] } or text with ## headers
 *
 * col-768: Qwen3 code+text embeddings (same model, different instruct prefixes)
 * col-512: CLIP image embeddings (separate vector space)
 */

import type { CollapsedResult, ImageResult } from '../../services/query-utils.js';
import { EzSearchError } from '../../errors.js';

// ── Return types ──────────────────────────────────────────────────────────────

export interface CodeQueryResult {
  file: string;
  lines: { start: number; end: number };
  score: number;
  text: string;
}

export interface TextQueryResult {
  file: string;
  score: number;
  text: string;
}

export interface ImageQueryResult {
  file: string;
  score: number;
}

export interface QueryResult {
  query: string;
  totalIndexed: number;
  searchScope: string;
  indexing?: { status: string; filesIndexed: number; durationMs: number };
  stale?: boolean;
  staleFileCount?: number;
  code: CodeQueryResult[];
  text: TextQueryResult[];
  image: ImageQueryResult[];
}

export interface QueryOptions {
  format?: string;
  topK: string;
  dir?: string;
  threshold?: string;
  type?: string;
  autoIndex?: boolean;
  _silent?: boolean;
  _projectDir?: string;
}

export async function runQuery(
  text: string,
  options: QueryOptions
): Promise<QueryResult> {
  const topK = parseInt(options.topK, 10);
  const threshold = options.threshold !== undefined ? parseFloat(options.threshold) : undefined;
  const silent = options._silent ?? false;
  const projectDir = options._projectDir ?? process.cwd();

  // 1. Load manifest
  const { loadManifest } = await import('../../services/manifest-cache.js');
  let manifest = loadManifest(projectDir);
  let totalIndexed = Object.keys(manifest.files).length;
  let autoIndexResult: import('./index-cmd.js').IndexStats | undefined;

  // Guard: no indexed content — auto-index or fail
  if (totalIndexed === 0) {
    if (options.autoIndex === false) {
      throw new EzSearchError('NO_INDEX', 'No indexed content found', 'Run `ez-search index .` first');
    }

    // Auto-index the project
    if (!silent) {
      process.stderr.write(process.stderr.isTTY ? '\r\x1b[Kauto-indexing project...' : 'auto-indexing project...\n');
    }
    const { runIndex } = await import('./index-cmd.js');
    autoIndexResult = await runIndex(projectDir, { ignore: true, _silent: silent });
    if (!silent && process.stderr.isTTY) process.stderr.write('\r\x1b[K');

    // Reload manifest after indexing
    manifest = loadManifest(projectDir);
    totalIndexed = Object.keys(manifest.files).length;

    // If still no content after indexing, error out
    if (totalIndexed === 0) {
      throw new EzSearchError('EMPTY_DIR', 'No supported files found to index', 'Ensure the directory contains supported file types');
    }
  }

  // Stale index detection (skip if we just auto-indexed — it's fresh)
  let staleFileCount = 0;
  if (!autoIndexResult) {
    const { calcStaleness } = await import('../../services/staleness.js');
    staleFileCount = await calcStaleness(projectDir, manifest, true);
  }
  const isStale = staleFileCount > 0;

  // 2. Determine which types to search (auto-detect from manifest)
  type QueryType = 'code' | 'text' | 'image';
  let typesToQuery: QueryType[];

  if (options.type) {
    typesToQuery = [options.type as QueryType];
  } else {
    // Pre-detect indexed types from manifest: only load models for types that have data.
    const { EXTENSION_MAP } = await import('../../types.js');
    const indexedTypes = new Set<string>();
    for (const filePath of Object.keys(manifest.files)) {
      const ext = '.' + filePath.split('.').pop()?.toLowerCase();
      const fileType = EXTENSION_MAP[ext];
      if (fileType) indexedTypes.add(fileType);
    }
    typesToQuery = [];
    if (indexedTypes.has('code')) typesToQuery.push('code');
    if (indexedTypes.has('text')) typesToQuery.push('text');
    if (indexedTypes.has('image')) typesToQuery.push('image');
  }

  // Early exit when manifest exists but has no queryable types
  if (typesToQuery.length === 0) {
    throw new EzSearchError('NO_INDEX', 'No indexed content found', 'Run `ez-search index .` first');
  }

  // 3. Open vector collections as needed
  const { openCollection } = await import('../../services/vector-db.js');
  const col768 = openCollection(projectDir, 'col-768');
  const needsImages = typesToQuery.includes('image');
  const col512 = needsImages ? openCollection(projectDir, 'col-512') : null;

  try {

  // ── Helpers ──────────────────────────────────────────────────────────────

  const { normalizeResults, normalizeImageResults, filterAndCollapse, filterImageResults } = await import('../../services/query-utils.js');

  const hasPostFilters = options.dir !== undefined || threshold !== undefined;
  // Over-fetch for optional post-filters (dir, threshold, chunk collapsing)
  const fetchCount = topK * 5 * (hasPostFilters ? 3 : 1);

  // ── Execute per-type queries sequentially (memory conservation) ──────────

  const { createEmbeddingPipeline } = await import('../../services/model-router.js');

  let codeResults: CollapsedResult[] = [];
  let textResults: CollapsedResult[] = [];
  let imageResults: ImageResult[] = [];

  if (typesToQuery.includes('code')) {
    // Code: Qwen3 embedding with instruct prefix, query col-768
    let pipe: Awaited<ReturnType<typeof createEmbeddingPipeline>> | null = null;
    try {
      if (!silent) process.stderr.write(process.stderr.isTTY ? '\r\x1b[Kcode: loading model...' : 'code: loading model...\n');
      pipe = await createEmbeddingPipeline('code');
      if (!silent && process.stderr.isTTY) process.stderr.write('\r\x1b[K');
      const prefixedQuery = `Instruct: Given a search query, retrieve relevant code snippets\nQuery: ${text}`;
      const [queryEmbedding] = await pipe.embed([prefixedQuery]);

      let rawResults: Awaited<ReturnType<typeof col768.query>>;
      try {
        rawResults = col768.query(queryEmbedding, fetchCount);
      } catch {
        rawResults = [];
      }

      const normalized = normalizeResults(rawResults);
      codeResults = filterAndCollapse(normalized, (id) => id.includes('Qwen3-Embedding'), { threshold, dir: options.dir, topK });
    } catch (err) {
      if (!silent) process.stderr.write(`[query] code pipeline error: ${err instanceof Error ? err.message : String(err)}\n`);
    } finally {
      if (pipe) await pipe.dispose(); // no-op with pipeline cache
    }
  }

  if (typesToQuery.includes('text')) {
    // Text: Qwen3 embedding with instruct prefix, query col-768
    let pipe: Awaited<ReturnType<typeof createEmbeddingPipeline>> | null = null;
    try {
      pipe = await createEmbeddingPipeline('text');
      if (!pipe.cached && !silent) {
        process.stderr.write(process.stderr.isTTY ? '\r\x1b[Ktext: loading model...' : 'text: loading model...\n');
      }
      if (!silent && process.stderr.isTTY) process.stderr.write('\r\x1b[K');
      const prefixedQuery = `Instruct: Given a search query, retrieve relevant text passages\nQuery: ${text}`;
      const [queryEmbedding] = await pipe.embed([prefixedQuery]);

      let rawResults: Awaited<ReturnType<typeof col768.query>>;
      try {
        rawResults = col768.query(queryEmbedding, fetchCount);
      } catch {
        rawResults = [];
      }

      const normalized = normalizeResults(rawResults);
      textResults = filterAndCollapse(normalized, (id) => id.includes('Qwen3-Embedding'), { threshold, dir: options.dir, topK });
    } catch (err) {
      if (!silent) process.stderr.write(`[query] text pipeline error: ${err instanceof Error ? err.message : String(err)}\n`);
    } finally {
      if (pipe) await pipe.dispose(); // no-op with pipeline cache
    }
  }

  if (needsImages && col512) {
    // Image: CLIP text embedding with prompt ensembling, query col-512
    let pipe: import('../../services/image-embedder.js').ClipTextPipeline | null = null;
    try {
      if (!silent) process.stderr.write(process.stderr.isTTY ? '\r\x1b[Kimage: loading model...' : 'image: loading model...\n');
      const { createClipTextPipeline } = await import('../../services/image-embedder.js');
      pipe = await createClipTextPipeline();
      if (!silent && process.stderr.isTTY) process.stderr.write('\r\x1b[K');

      // Prompt ensembling: embed 4 variants and average for better retrieval
      const templates = [
        `a photo of ${text}`,
        `an image of ${text}`,
        `a picture of ${text}`,
        text,
      ];
      const embeddings = await pipe.embedText(templates);
      const averaged = new Float32Array(512);
      for (const emb of embeddings) {
        for (let i = 0; i < 512; i++) averaged[i] += emb[i];
      }
      for (let i = 0; i < 512; i++) averaged[i] /= embeddings.length;
      // L2-normalize the averaged vector
      let norm = 0;
      for (let i = 0; i < 512; i++) norm += averaged[i] * averaged[i];
      norm = Math.sqrt(norm);
      if (norm > 0) for (let i = 0; i < 512; i++) averaged[i] /= norm;

      let rawResults: Awaited<ReturnType<typeof col512.query>>;
      try {
        rawResults = col512.query(averaged, fetchCount);
      } catch {
        rawResults = [];
      }

      const normalized = normalizeImageResults(rawResults);
      imageResults = filterImageResults(normalized, () => true, { threshold, dir: options.dir, topK });
    } catch (err) {
      if (!silent) process.stderr.write(`[query] image pipeline error: ${err instanceof Error ? err.message : String(err)}\n`);
    } finally {
      if (pipe) await pipe.dispose();
    }
  }

  // ── Build result ──────────────────────────────────────────────────────────

  const result: QueryResult = {
    query: text,
    totalIndexed,
    searchScope: options.dir ?? '.',
    code: codeResults.map((r) => ({
      file: r.filePath,
      lines: { start: r.lineStart, end: r.lineEnd },
      score: r.score,
      text: r.chunkText,
    })),
    text: textResults.map((r) => ({
      file: r.filePath,
      score: r.score,
      text: r.chunkText,
    })),
    image: imageResults.map((r) => ({
      file: r.filePath,
      score: r.score,
    })),
  };

  if (autoIndexResult) {
    result.indexing = {
      status: autoIndexResult.status,
      filesIndexed: autoIndexResult.filesIndexed,
      durationMs: autoIndexResult.durationMs,
    };
  }

  if (isStale) {
    result.stale = true;
    result.staleFileCount = staleFileCount;
  }

  // ── CLI Output (skipped in library mode) ────────────────────────────────

  if (!silent) {
    const hasResults = result.code.length > 0 || result.text.length > 0 || result.image.length > 0;

    if (options.format === 'text') {
      if (autoIndexResult) {
        console.log(`Auto-indexed ${autoIndexResult.filesIndexed} files in ${(autoIndexResult.durationMs / 1000).toFixed(1)}s\n`);
      }

      if (isStale) {
        console.log(`Warning: ${staleFileCount} file(s) changed since last index. Run \`ez-search index .\` to update.\n`);
      }

      if (!hasResults) {
        console.log('No results found.');
      } else {
        if (result.code.length > 0) {
          console.log('## Code\n');
          for (const r of result.code) {
            console.log(`File: ${r.file} | Lines: ${r.lines.start}-${r.lines.end} | Relevance: ${r.score}`);
            for (const line of r.text.split('\n')) {
              console.log(`    ${line}`);
            }
            console.log();
          }
        }

        if (result.text.length > 0) {
          console.log('## Text\n');
          for (const r of result.text) {
            console.log(`File: ${r.file} | Relevance: ${r.score}`);
            for (const line of r.text.split('\n')) {
              console.log(`    ${line}`);
            }
            console.log();
          }
        }

        if (result.image.length > 0) {
          console.log('## Images\n');
          for (const r of result.image) {
            console.log(`File: ${r.file} | Relevance: ${r.score}`);
            console.log();
          }
        }
      }
    } else {
      // JSON grouped envelope (backward-compatible with CLI output)
      const output: Record<string, unknown> = {
        query: result.query,
        totalIndexed: result.totalIndexed,
        searchScope: result.searchScope,
      };

      if (result.indexing) output['indexing'] = result.indexing;
      if (result.stale) {
        output['stale'] = true;
        output['staleFileCount'] = result.staleFileCount;
      }
      if (result.code.length > 0) output['code'] = result.code;
      if (result.text.length > 0) output['text'] = result.text;
      if (result.image.length > 0) output['image'] = result.image;
      if (!hasResults) output['message'] = 'No results found';

      console.log(JSON.stringify(output));
    }
  }

  return result;

  } finally {
    col768.close();
    if (col512) col512.close();
    const { releaseAllPipelines } = await import('../../services/model-router.js');
    await releaseAllPipelines();
  }
}
