/**
 * Query command — full semantic search pipeline.
 *
 * Pipeline:
 *   1. Resolve project directory (cwd)
 *   2. Open vector collections via openProjectCollections
 *   3. Load manifest for totalIndexed count
 *   4. Create Jina code embedding pipeline
 *   5. Embed the query text
 *   6. Fetch from Zvec (3x topK when --dir or --threshold active)
 *   7. Normalize COSINE distances to 0-1 scores
 *   8. Apply --threshold filter
 *   9. Apply --dir filter
 *  10. Collapse adjacent chunks from same file
 *  11. Slice to topK
 *  12. Dispose pipeline
 *  13. Output JSON (default) or text (--format text)
 */

export async function runQuery(
  text: string,
  options: { format?: string; topK: string; dir?: string; threshold?: string }
): Promise<void> {
  const topK = parseInt(options.topK, 10);
  const threshold = options.threshold !== undefined ? parseFloat(options.threshold) : undefined;

  try {
    // 1. Resolve project directory
    const projectDir = process.cwd();

    // 2. Open vector collections
    const { openProjectCollections } = await import('../../services/vector-db.js');
    const { col768 } = openProjectCollections(projectDir);

    // 3. Load manifest for totalIndexed count
    const { loadManifest } = await import('../../services/manifest-cache.js');
    const manifest = loadManifest(projectDir);
    const totalIndexed = Object.keys(manifest.files).length;

    // 4. Create embedding pipeline
    const { createEmbeddingPipeline } = await import('../../services/model-router.js');
    const pipe = await createEmbeddingPipeline('code');

    // 5. Embed the query text
    const [queryEmbedding] = await pipe.embed([text]);

    // 6. Determine fetch count — over-fetch when post-filters are active
    const hasPostFilters = options.dir !== undefined || threshold !== undefined;
    const fetchCount = hasPostFilters ? topK * 3 : topK;

    // 7. Query Zvec
    let rawResults: Awaited<ReturnType<typeof col768.query>>;
    try {
      rawResults = col768.query(queryEmbedding, fetchCount);
    } catch {
      // Empty collection or other Zvec error — return empty results
      rawResults = [];
    }

    // 8. Normalize COSINE distances to 0-1 scores
    // Zvec COSINE: distance 0 = exact match. Convert: score = 1 - distance, clamped to [0,1].
    type NormalizedResult = {
      filePath: string;
      chunkIndex: number;
      lineStart: number;
      lineEnd: number;
      chunkText: string;
      score: number;
    };

    const normalized: NormalizedResult[] = rawResults.map((r) => ({
      filePath: String(r.metadata['filePath'] ?? ''),
      chunkIndex: Number(r.metadata['chunkIndex'] ?? 0),
      lineStart: Number(r.metadata['lineStart'] ?? 0),
      lineEnd: Number(r.metadata['lineEnd'] ?? 0),
      chunkText: String(r.metadata['chunkText'] ?? ''),
      score: Math.round(Math.max(0, Math.min(1, 1 - r.distance)) * 10000) / 10000,
    }));

    // 9. Apply --threshold filter
    const afterThreshold =
      threshold !== undefined ? normalized.filter((r) => r.score >= threshold) : normalized;

    // 10. Apply --dir filter — strip leading ./ and trailing /
    let afterDir = afterThreshold;
    if (options.dir !== undefined) {
      const normalizedDir = options.dir.replace(/^\.\//, '').replace(/\/$/, '');
      afterDir = afterThreshold.filter((r) => r.filePath.startsWith(normalizedDir));
    }

    // 11. Collapse adjacent chunks from the same file
    // Group by filePath, sort by chunkIndex, merge consecutive runs
    const byFile = new Map<string, NormalizedResult[]>();
    for (const r of afterDir) {
      const group = byFile.get(r.filePath);
      if (group) {
        group.push(r);
      } else {
        byFile.set(r.filePath, [r]);
      }
    }

    type CollapsedResult = {
      filePath: string;
      lineStart: number;
      lineEnd: number;
      score: number;
      chunkText: string;
    };

    const collapsed: CollapsedResult[] = [];

    for (const [, chunks] of byFile) {
      // Sort by chunkIndex ascending
      chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

      // Merge consecutive runs (chunkIndex differs by exactly 1)
      let runStart = 0;
      while (runStart < chunks.length) {
        let runEnd = runStart;
        while (
          runEnd + 1 < chunks.length &&
          chunks[runEnd + 1].chunkIndex === chunks[runEnd].chunkIndex + 1
        ) {
          runEnd++;
        }

        // Merge run [runStart..runEnd]
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

    // Sort collapsed results by score descending
    collapsed.sort((a, b) => b.score - a.score);

    // 12. Slice to topK
    const final = collapsed.slice(0, topK);

    // 13. Dispose pipeline
    await pipe.dispose();

    // 14. Build and output result
    const hasResults = final.length > 0;

    if (options.format === 'text') {
      if (!hasResults) {
        console.log('No results found.');
        return;
      }
      for (const r of final) {
        console.log(`File: ${r.filePath} | Lines: ${r.lineStart}-${r.lineEnd} | Relevance: ${r.score}`);
        for (const line of r.chunkText.split('\n')) {
          console.log(`    ${line}`);
        }
      }
    } else {
      const output: Record<string, unknown> = {
        query: text,
        results: final.map((r) => ({
          file: r.filePath,
          lines: { start: r.lineStart, end: r.lineEnd },
          score: r.score,
          text: r.chunkText,
        })),
        totalIndexed,
        searchScope: options.dir ?? '.',
      };
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
