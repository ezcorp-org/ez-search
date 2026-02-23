/**
 * Query command — multi-collection grouped semantic search.
 *
 * Pipeline:
 *   1. Resolve project directory (cwd)
 *   2. Open vector collections (col-768 for code/text, col-512 for images)
 *   3. Load manifest for totalIndexed count
 *   4. For each requested type:
 *      a. code:  embed with Jina, over-fetch topK*5 from col-768, filter by jina modelId
 *      b. text:  embed with Nomic ("search_query: " prefix), over-fetch topK*5 from col-768, filter by nomic modelId
 *      c. image: not supported (text-to-image search deferred to Phase 6)
 *   5. Apply --threshold and --dir filters per type
 *   6. Collapse adjacent chunks per type
 *   7. Sort by score desc, slice to topK per type
 *   8. Output grouped JSON { code: [...], text: [...] } or text with ## headers
 *
 * col-768 holds BOTH code and text vectors; they are distinguished by modelId metadata.
 * Over-fetch topK*5 ensures enough candidates after modelId filtering.
 */

export async function runQuery(
  text: string,
  options: { format?: string; topK: string; dir?: string; threshold?: string; type?: string }
): Promise<void> {
  const topK = parseInt(options.topK, 10);
  const threshold = options.threshold !== undefined ? parseFloat(options.threshold) : undefined;

  try {
    // 1. Resolve project directory
    const projectDir = process.cwd();

    // 2. Open vector collections
    const { openProjectCollections } = await import('../../services/vector-db.js');
    const { col768 } = openProjectCollections(projectDir);

    // 3. Load manifest
    const { loadManifest } = await import('../../services/manifest-cache.js');
    const manifest = loadManifest(projectDir);
    const totalIndexed = Object.keys(manifest.files).length;

    // 4. Determine which types to search
    type QueryType = 'code' | 'text' | 'image';
    const typesToQuery: QueryType[] = options.type
      ? [options.type as QueryType]
      : ['code', 'text'];

    // Handle unsupported image query
    if (options.type === 'image') {
      const msg = 'Image search requires image query input (not yet supported)';
      if (options.format === 'text') {
        process.stderr.write(msg + '\n');
      } else {
        console.log(JSON.stringify({ query: text, error: msg }));
      }
      return;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    const hasPostFilters = options.dir !== undefined || threshold !== undefined;
    // Over-fetch for mixed col-768 + optional post-filters
    const fetchCount = topK * 5 * (hasPostFilters ? 3 : 1);

    type NormalizedResult = {
      filePath: string;
      chunkIndex: number;
      lineStart: number;
      lineEnd: number;
      chunkText: string;
      modelId: string;
      score: number;
    };

    function normalizeResults(rawResults: Awaited<ReturnType<typeof col768.query>>): NormalizedResult[] {
      return rawResults.map((r) => ({
        filePath: String(r.metadata['filePath'] ?? ''),
        chunkIndex: Number(r.metadata['chunkIndex'] ?? 0),
        lineStart: Number(r.metadata['lineStart'] ?? 0),
        lineEnd: Number(r.metadata['lineEnd'] ?? 0),
        chunkText: String(r.metadata['chunkText'] ?? ''),
        modelId: String(r.metadata['modelId'] ?? ''),
        score: Math.round(Math.max(0, Math.min(1, 1 - r.distance)) * 10000) / 10000,
      }));
    }

    function filterAndCollapse(results: NormalizedResult[], modelFilter: (id: string) => boolean): CollapsedResult[] {
      // Filter by modelId
      let filtered = results.filter((r) => modelFilter(r.modelId));

      // Apply --threshold
      if (threshold !== undefined) {
        filtered = filtered.filter((r) => r.score >= threshold);
      }

      // Apply --dir
      if (options.dir !== undefined) {
        const normalizedDir = options.dir.replace(/^\.\//, '').replace(/\/$/, '');
        filtered = filtered.filter((r) => r.filePath.startsWith(normalizedDir));
      }

      // Collapse adjacent chunks
      const byFile = new Map<string, NormalizedResult[]>();
      for (const r of filtered) {
        const group = byFile.get(r.filePath);
        if (group) {
          group.push(r);
        } else {
          byFile.set(r.filePath, [r]);
        }
      }

      const collapsed: CollapsedResult[] = [];

      for (const [, chunks] of byFile) {
        chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

        let runStart = 0;
        while (runStart < chunks.length) {
          let runEnd = runStart;
          while (
            runEnd + 1 < chunks.length &&
            chunks[runEnd + 1].chunkIndex === chunks[runEnd].chunkIndex + 1
          ) {
            runEnd++;
          }

          const run = chunks.slice(runStart, runEnd + 1);
          collapsed.push({
            filePath: run[0].filePath,
            lineStart: Math.min(...run.map((r) => r.lineStart)),
            lineEnd: Math.max(...run.map((r) => r.lineEnd)),
            score: Math.max(...run.map((r) => r.score)),
            chunkText: run.map((r) => r.chunkText).join('\n'),
          });

          runStart = runEnd + 1;
        }
      }

      collapsed.sort((a, b) => b.score - a.score);
      return collapsed.slice(0, topK);
    }

    type CollapsedResult = {
      filePath: string;
      lineStart: number;
      lineEnd: number;
      score: number;
      chunkText: string;
    };

    // ── Execute per-type queries sequentially (memory conservation) ──────────

    const { createEmbeddingPipeline } = await import('../../services/model-router.js');

    let codeResults: CollapsedResult[] = [];
    let textResults: CollapsedResult[] = [];

    if (typesToQuery.includes('code')) {
      // Code: Jina embedding, filter for jina modelId
      let pipe: Awaited<ReturnType<typeof createEmbeddingPipeline>> | null = null;
      try {
        pipe = await createEmbeddingPipeline('code');
        const [queryEmbedding] = await pipe.embed([text]);

        let rawResults: Awaited<ReturnType<typeof col768.query>>;
        try {
          rawResults = col768.query(queryEmbedding, fetchCount);
        } catch {
          rawResults = [];
        }

        const normalized = normalizeResults(rawResults);
        codeResults = filterAndCollapse(normalized, (id) => id.includes('jina') || id.startsWith('jinaai/'));
      } catch (err) {
        process.stderr.write(`[query] code pipeline error: ${err instanceof Error ? err.message : String(err)}\n`);
      } finally {
        if (pipe) await pipe.dispose();
      }
    }

    if (typesToQuery.includes('text')) {
      // Text: Nomic embedding with "search_query: " prefix, filter for nomic modelId
      let pipe: Awaited<ReturnType<typeof createEmbeddingPipeline>> | null = null;
      try {
        pipe = await createEmbeddingPipeline('text');
        const prefixedQuery = `search_query: ${text}`;
        const [queryEmbedding] = await pipe.embed([prefixedQuery]);

        let rawResults: Awaited<ReturnType<typeof col768.query>>;
        try {
          rawResults = col768.query(queryEmbedding, fetchCount);
        } catch {
          rawResults = [];
        }

        const normalized = normalizeResults(rawResults);
        textResults = filterAndCollapse(normalized, (id) => id.includes('nomic'));
      } catch (err) {
        process.stderr.write(`[query] text pipeline error: ${err instanceof Error ? err.message : String(err)}\n`);
      } finally {
        if (pipe) await pipe.dispose();
      }
    }

    // ── Output ────────────────────────────────────────────────────────────────

    const hasCodeResults = codeResults.length > 0;
    const hasTextResults = textResults.length > 0;
    const hasResults = hasCodeResults || hasTextResults;

    if (options.format === 'text') {
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
    } else {
      // JSON grouped envelope
      const output: Record<string, unknown> = {
        query: text,
        totalIndexed,
        searchScope: options.dir ?? '.',
      };

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

      if (!hasResults) {
        output['message'] = 'No results found';
      }

      console.log(JSON.stringify(output, null, 2));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (options.format === 'text') {
      console.error(`Error: ${message}`);
    } else {
      console.log(JSON.stringify({ query: text, error: message }));
    }
  }
}
