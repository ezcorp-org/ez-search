/**
 * Query command — single-collection grouped semantic search.
 *
 * Pipeline:
 *   1. Resolve project directory (cwd)
 *   2. Open vector collection (col-768 for all types)
 *   3. Load manifest for totalIndexed count
 *   4. For each requested type:
 *      a. code:  embed with Qwen3 (instruct prefix), query col-768, filter by Qwen3 modelId
 *      b. text:  embed with Qwen3 (instruct prefix), query col-768, filter by Qwen3 modelId
 *      c. image: embed with SigLIP text encoder, query col-768, filter by siglip modelId
 *   5. Apply --threshold and --dir filters per type
 *   6. Collapse adjacent chunks per type
 *   7. Sort by score desc, slice to topK per type
 *   8. Output grouped JSON { code: [...], text: [...], image: [...] } or text with ## headers
 *
 * col-768 holds ALL vectors (code, text, image); they are distinguished by modelId metadata.
 */

import type { CollapsedResult, ImageResult } from '../../services/query-utils.js';

export async function runQuery(
  text: string,
  options: { format?: string; topK: string; dir?: string; threshold?: string; type?: string; autoIndex?: boolean }
): Promise<void> {
  const topK = parseInt(options.topK, 10);
  const threshold = options.threshold !== undefined ? parseFloat(options.threshold) : undefined;

  try {
    // 1. Resolve project directory
    const projectDir = process.cwd();

    // 2. Load manifest
    const { loadManifest } = await import('../../services/manifest-cache.js');
    let manifest = loadManifest(projectDir);
    let totalIndexed = Object.keys(manifest.files).length;
    let autoIndexResult: import('./index-cmd.js').IndexStats | undefined;

    // Guard: no indexed content — auto-index or fail
    if (totalIndexed === 0) {
      if (options.autoIndex === false) {
        const { emitError } = await import('../errors.js');
        emitError(
          { code: 'NO_INDEX', message: 'No indexed content found', suggestion: 'Run `ez-search index .` first' },
          options.format === 'text' ? 'text' : 'json'
        );
      }

      // Auto-index the project
      process.stderr.write(process.stderr.isTTY ? '\r\x1b[Kauto-indexing project...' : 'auto-indexing project...\n');
      const { runIndex } = await import('./index-cmd.js');
      autoIndexResult = await runIndex('.', { ignore: true });
      if (process.stderr.isTTY) process.stderr.write('\r\x1b[K');

      // Reload manifest after indexing
      manifest = loadManifest(projectDir);
      totalIndexed = Object.keys(manifest.files).length;

      // If still no content after indexing, error out
      if (totalIndexed === 0) {
        const { emitError } = await import('../errors.js');
        emitError(
          { code: 'EMPTY_DIR', message: 'No supported files found to index', suggestion: 'Ensure the directory contains supported file types' },
          options.format === 'text' ? 'text' : 'json'
        );
      }
    }

    // Stale index detection (skip if we just auto-indexed — it's fresh)
    let staleFileCount = 0;
    if (!autoIndexResult) {
      const { calcStaleness } = await import('../../services/staleness.js');
      staleFileCount = await calcStaleness(projectDir, manifest, true);
    }
    const isStale = staleFileCount > 0;

    // 3. Determine which types to search (auto-detect from manifest)
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
      const { emitError } = await import('../errors.js');
      emitError(
        { code: 'NO_INDEX', message: 'No indexed content found', suggestion: 'Run `ez-search index .` first' },
        options.format === 'text' ? 'text' : 'json'
      );
    }

    // 4. Open vector collections as needed
    const { openCollection } = await import('../../services/vector-db.js');
    const col768 = openCollection(projectDir, 'col-768');

    try {

    // ── Helpers ──────────────────────────────────────────────────────────────

    const { normalizeResults, filterAndCollapse, filterImageResults } = await import('../../services/query-utils.js');

    const hasPostFilters = options.dir !== undefined || threshold !== undefined;
    // Over-fetch for mixed col-768 + optional post-filters
    const fetchCount = topK * 5 * (hasPostFilters ? 3 : 1);

    // ── Execute per-type queries sequentially (memory conservation) ──────────

    const { createEmbeddingPipeline } = await import('../../services/model-router.js');

    let codeResults: CollapsedResult[] = [];
    let textResults: CollapsedResult[] = [];
    let imageResults: ImageResult[] = [];

    if (typesToQuery.includes('code')) {
      // Code: Qwen3 embedding, filter for Qwen3 modelId
      let pipe: Awaited<ReturnType<typeof createEmbeddingPipeline>> | null = null;
      try {
        process.stderr.write(process.stderr.isTTY ? '\r\x1b[Kcode: loading model...' : 'code: loading model...\n');
        pipe = await createEmbeddingPipeline('code');
        if (process.stderr.isTTY) process.stderr.write('\r\x1b[K');
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
        process.stderr.write(`[query] code pipeline error: ${err instanceof Error ? err.message : String(err)}\n`);
      } finally {
        if (pipe) await pipe.dispose();
      }
    }

    if (typesToQuery.includes('text')) {
      // Text: Qwen3 embedding with instruct prefix, filter for Qwen3 modelId
      let pipe: Awaited<ReturnType<typeof createEmbeddingPipeline>> | null = null;
      try {
        process.stderr.write(process.stderr.isTTY ? '\r\x1b[Ktext: loading model...' : 'text: loading model...\n');
        pipe = await createEmbeddingPipeline('text');
        if (process.stderr.isTTY) process.stderr.write('\r\x1b[K');
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
        process.stderr.write(`[query] text pipeline error: ${err instanceof Error ? err.message : String(err)}\n`);
      } finally {
        if (pipe) await pipe.dispose();
      }
    }

    if (typesToQuery.includes('image')) {
      // Image: SigLIP text embedding, query col-768, filter for siglip modelId
      let pipe: import('../../services/image-embedder.js').SiglipTextPipeline | null = null;
      try {
        process.stderr.write(process.stderr.isTTY ? '\r\x1b[Kimage: loading model...' : 'image: loading model...\n');
        const { createSiglipTextPipeline } = await import('../../services/image-embedder.js');
        pipe = await createSiglipTextPipeline();
        if (process.stderr.isTTY) process.stderr.write('\r\x1b[K');
        const [queryEmbedding] = await pipe.embedText([text]);

        let rawResults: Awaited<ReturnType<typeof col768.query>>;
        try {
          rawResults = col768.query(queryEmbedding, fetchCount);
        } catch {
          rawResults = [];
        }

        const normalized = normalizeResults(rawResults);
        imageResults = filterImageResults(normalized, (id) => id.includes('siglip'), { threshold, dir: options.dir, topK });
      } catch (err) {
        process.stderr.write(`[query] image pipeline error: ${err instanceof Error ? err.message : String(err)}\n`);
      } finally {
        if (pipe) await pipe.dispose();
      }
    }

    // ── Output ────────────────────────────────────────────────────────────────

    const hasCodeResults = codeResults.length > 0;
    const hasTextResults = textResults.length > 0;
    const hasImageResults = imageResults.length > 0;
    const hasResults = hasCodeResults || hasTextResults || hasImageResults;

    if (options.format === 'text') {
      if (autoIndexResult) {
        console.log(`Auto-indexed ${autoIndexResult.filesIndexed} files in ${(autoIndexResult.durationMs / 1000).toFixed(1)}s\n`);
      }

      if (isStale) {
        console.log(`Warning: ${staleFileCount} file(s) changed since last index. Run \`ez-search index .\` to update.\n`);
      }

      if (!hasResults) {
        console.log('No results found.');
        return;
      }

      if (hasCodeResults) {
        console.log('## Code\n');
        for (const r of codeResults) {
          console.log(`File: ${r.filePath} | Lines: ${r.lineStart}-${r.lineEnd} | Relevance: ${r.score}`);
          for (const line of r.chunkText.split('\n')) {
            console.log(`    ${line}`);
          }
          console.log();
        }
      }

      if (hasTextResults) {
        console.log('## Text\n');
        for (const r of textResults) {
          console.log(`File: ${r.filePath} | Relevance: ${r.score}`);
          for (const line of r.chunkText.split('\n')) {
            console.log(`    ${line}`);
          }
          console.log();
        }
      }

      if (hasImageResults) {
        console.log('## Images\n');
        for (const r of imageResults) {
          console.log(`File: ${r.filePath} | Relevance: ${r.score}`);
          console.log();
        }
      }
    } else {
      // JSON grouped envelope
      const output: Record<string, unknown> = {
        query: text,
        totalIndexed,
        searchScope: options.dir ?? '.',
      };

      if (autoIndexResult) {
        output['indexing'] = {
          status: autoIndexResult.status,
          filesIndexed: autoIndexResult.filesIndexed,
          durationMs: autoIndexResult.durationMs,
        };
      }

      if (isStale) {
        output['stale'] = true;
        output['staleFileCount'] = staleFileCount;
      }

      if (hasCodeResults) {
        output['code'] = codeResults.map((r) => ({
          file: r.filePath,
          lines: { start: r.lineStart, end: r.lineEnd },
          score: r.score,
          text: r.chunkText,
        }));
      }

      if (hasTextResults) {
        output['text'] = textResults.map((r) => ({
          file: r.filePath,
          score: r.score,
          text: r.chunkText,
        }));
      }

      if (hasImageResults) {
        output['image'] = imageResults.map((r) => ({
          file: r.filePath,
          score: r.score,
        }));
      }

      if (!hasResults) {
        output['message'] = 'No results found';
      }

      console.log(JSON.stringify(output));
    }

    } finally {
      col768.close();
    }
  } catch (err) {
    const { emitError } = await import('../errors.js');
    const message = err instanceof Error ? err.message : String(err);
    emitError(
      { code: 'GENERAL_ERROR', message, suggestion: 'Check the error above and retry' },
      options.format === 'text' ? 'text' : 'json'
    );
  }
}
