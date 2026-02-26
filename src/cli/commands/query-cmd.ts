/**
 * Query command — multi-collection search with hybrid (semantic + BM25), semantic, or keyword modes.
 *
 * Pipeline:
 *   1. Resolve project directory (cwd or explicit projectDir)
 *   2. Validate search mode (hybrid | semantic | keyword)
 *   3. Load manifest for totalIndexed count
 *   4. For keyword/hybrid modes, load lexical index
 *   5. For semantic/hybrid modes, open vector collections + embed query
 *   6. Fuse results via RRF (hybrid mode) or pass through (single mode)
 *   7. Apply --threshold and --dir filters, collapse adjacent chunks
 *   8. Output grouped JSON or text
 *
 * col-768: Qwen3 code+text embeddings (same model, different instruct prefixes)
 * col-512: CLIP image embeddings (separate vector space)
 */

import type { CollapsedResult, ImageResult, NormalizedResult } from '../../services/query-utils.js';
import { EzSearchError } from '../../errors.js';
import { fileTypeFromPath, type SearchMode } from '../../types.js';

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
  mode: SearchMode;
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
  mode?: string;
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

  // Validate mode
  const VALID_MODES: SearchMode[] = ['hybrid', 'semantic', 'keyword'];
  const mode: SearchMode = (options.mode as SearchMode) ?? 'hybrid';
  if (!VALID_MODES.includes(mode)) {
    throw new EzSearchError('INVALID_MODE', `Invalid search mode: "${options.mode}". Must be one of: hybrid, semantic, keyword`, 'Use --mode hybrid, --mode semantic, or --mode keyword');
  }

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

  // 3. Load lexical index (for hybrid/keyword modes)
  const needsLexical = mode !== 'semantic';
  let lexicalIndex: import('../../services/lexical-index.js').LexicalIndex | null = null;

  if (needsLexical) {
    const { existsSync, readFileSync } = await import('fs');
    const { join } = await import('path');
    const lexicalPath = join(projectDir, '.ez-search', 'lexical-index.json');

    if (existsSync(lexicalPath)) {
      const { LexicalIndex } = await import('../../services/lexical-index.js');
      try {
        lexicalIndex = LexicalIndex.fromJSON(readFileSync(lexicalPath, 'utf-8'));
      } catch {
        lexicalIndex = null;
      }
    }

    // Fallback warning for missing lexical index (needsLexical is true here, so mode is hybrid/keyword)
    if (!lexicalIndex && !silent) {
      process.stderr.write('Warning: lexical index not found, falling back to semantic search. Re-index to enable keyword/hybrid modes.\n');
    }
  }

  // Effective mode: fall back to semantic if lexical index unavailable
  const effectiveMode: SearchMode = (needsLexical && !lexicalIndex) ? 'semantic' : mode;

  // 4. Open vector collections (skip for pure keyword mode)
  const needsVectors = effectiveMode !== 'keyword';
  const needsImages = typesToQuery.includes('image');
  let col768: ReturnType<Awaited<typeof import('../../services/vector-db.js')>['openCollection']> | null = null;
  let col512: ReturnType<Awaited<typeof import('../../services/vector-db.js')>['openCollection']> | null = null;
  if (needsVectors) {
    const { openCollection } = await import('../../services/vector-db.js');
    col768 = openCollection(projectDir, 'col-768');
    if (needsImages) col512 = openCollection(projectDir, 'col-512');
  }

  try {

  // ── Helpers ──────────────────────────────────────────────────────────────

  const { normalizeResults, normalizeImageResults, filterAndCollapse, filterImageResults } = await import('../../services/query-utils.js');

  const hasPostFilters = options.dir !== undefined || threshold !== undefined;
  // Over-fetch for optional post-filters (dir, threshold, chunk collapsing)
  const fetchCount = topK * 5 * (hasPostFilters ? 3 : 1);

  // ── Execute per-type queries sequentially (memory conservation) ──────────

  let codeResults: CollapsedResult[] = [];
  let textResults: CollapsedResult[] = [];
  let imageResults: ImageResult[] = [];

  if (typesToQuery.includes('code')) {
    codeResults = await queryCodeOrText('code', text, {
      effectiveMode, col768, lexicalIndex, fetchCount, threshold, dir: options.dir, topK, silent,
      instructPrefix: `Instruct: Given a search query, retrieve relevant code snippets\nQuery: ${text}`,
      normalizeResults, filterAndCollapse,
    });
  }

  if (typesToQuery.includes('text')) {
    textResults = await queryCodeOrText('text', text, {
      effectiveMode, col768, lexicalIndex, fetchCount, threshold, dir: options.dir, topK, silent,
      instructPrefix: `Instruct: Given a search query, retrieve relevant text passages\nQuery: ${text}`,
      normalizeResults, filterAndCollapse,
    });
  }

  // Images: always semantic-only, unaffected by mode
  if (needsImages && col512) {
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
    mode: effectiveMode,
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
        mode: result.mode,
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
    if (col768) col768.close();
    if (col512) col512.close();
    const { releaseAllPipelines } = await import('../../services/model-router.js');
    await releaseAllPipelines();
  }
}

// ── Shared code/text query helper ─────────────────────────────────────────────

/**
 * Runs semantic, keyword, or hybrid query for code or text type.
 * Extracted to reduce duplication between code and text query blocks.
 */
async function queryCodeOrText(
  type: 'code' | 'text',
  queryText: string,
  opts: {
    effectiveMode: SearchMode;
    col768: ReturnType<Awaited<typeof import('../../services/vector-db.js')>['openCollection']> | null;
    lexicalIndex: import('../../services/lexical-index.js').LexicalIndex | null;
    fetchCount: number;
    threshold?: number;
    dir?: string;
    topK: number;
    silent: boolean;
    instructPrefix: string;
    normalizeResults: typeof import('../../services/query-utils.js').normalizeResults;
    filterAndCollapse: typeof import('../../services/query-utils.js').filterAndCollapse;
  },
): Promise<CollapsedResult[]> {
  const { effectiveMode, col768, lexicalIndex, fetchCount, threshold, dir, topK, silent, instructPrefix, normalizeResults: normalize, filterAndCollapse: collapse } = opts;

  try {
    // ── Semantic results ──────────────────────────────────────────────────
    let semanticNormalized: NormalizedResult[] = [];

    if (effectiveMode !== 'keyword' && col768) {
      const { createEmbeddingPipeline } = await import('../../services/model-router.js');
      let pipe: Awaited<ReturnType<typeof createEmbeddingPipeline>> | null = null;
      try {
        if (!silent) process.stderr.write(process.stderr.isTTY ? `\r\x1b[K${type}: loading model...` : `${type}: loading model...\n`);
        pipe = await createEmbeddingPipeline(type);
        if (!silent && process.stderr.isTTY) process.stderr.write('\r\x1b[K');
        const [queryEmbedding] = await pipe.embed([instructPrefix]);

        let rawResults: Awaited<ReturnType<typeof col768.query>>;
        try {
          rawResults = col768.query(queryEmbedding, fetchCount);
        } catch {
          rawResults = [];
        }

        semanticNormalized = normalize(rawResults)
          .filter((r) => r.modelId.includes('Qwen3-Embedding'))
          .filter((r) => fileTypeFromPath(r.filePath) === type);
      } finally {
        if (pipe) await pipe.dispose();
      }
    }

    // ── Lexical results ───────────────────────────────────────────────────
    let lexicalNormalized: NormalizedResult[] = [];

    if (effectiveMode !== 'semantic' && lexicalIndex) {
      const lexResults = lexicalIndex.query(queryText, fetchCount);
      lexicalNormalized = lexResults.map((r) => ({
        filePath: r.filePath,
        chunkIndex: r.chunkIndex,
        lineStart: r.lineStart,
        lineEnd: r.lineEnd,
        chunkText: r.chunkText,
        modelId: 'minisearch-bm25',
        score: r.score,
      })).filter((r) => fileTypeFromPath(r.filePath) === type);
    }

    // ── Mode branching ────────────────────────────────────────────────────
    if (effectiveMode === 'hybrid' && semanticNormalized.length > 0 && lexicalNormalized.length > 0) {
      // Fuse via RRF then filter/collapse
      const { rrfFuse: fuse } = await import('../../services/hybrid-fusion.js');

      const semanticRanked = semanticNormalized.map((r) => ({
        id: `${r.filePath}:${r.chunkIndex}`,
        filePath: r.filePath,
        chunkIndex: r.chunkIndex,
        lineStart: r.lineStart,
        lineEnd: r.lineEnd,
        chunkText: r.chunkText,
        score: r.score,
      }));

      const lexicalRanked = lexicalNormalized.map((r) => ({
        id: `${r.filePath}:${r.chunkIndex}`,
        filePath: r.filePath,
        chunkIndex: r.chunkIndex,
        lineStart: r.lineStart,
        lineEnd: r.lineEnd,
        chunkText: r.chunkText,
        score: r.score,
      }));

      const fused = fuse(semanticRanked, lexicalRanked);

      // Convert fused results back to NormalizedResult for filterAndCollapse
      const fusedNormalized: NormalizedResult[] = fused.map((r) => ({
        filePath: r.filePath,
        chunkIndex: r.chunkIndex,
        lineStart: r.lineStart,
        lineEnd: r.lineEnd,
        chunkText: r.chunkText,
        modelId: 'hybrid-rrf',
        score: r.fusedScore,
      }));

      return collapse(fusedNormalized, () => true, { threshold, dir, topK });
    }

    if (effectiveMode === 'keyword' || (effectiveMode === 'hybrid' && semanticNormalized.length === 0)) {
      // Keyword-only: normalize lexical scores to [0,1] and filter/collapse
      if (lexicalNormalized.length === 0) return [];

      const maxScore = Math.max(...lexicalNormalized.map((r) => r.score));
      const normalized: NormalizedResult[] = lexicalNormalized.map((r) => ({
        ...r,
        score: maxScore > 0 ? Math.round((r.score / maxScore) * 10000) / 10000 : 0,
      }));

      return collapse(normalized, () => true, { threshold, dir, topK });
    }

    // Semantic-only (or hybrid with no lexical results)
    return collapse(semanticNormalized, (id) => id.includes('Qwen3-Embedding'), { threshold, dir, topK });

  } catch (err) {
    if (!silent) process.stderr.write(`[query] ${type} pipeline error: ${err instanceof Error ? err.message : String(err)}\n`);
    return [];
  }
}
