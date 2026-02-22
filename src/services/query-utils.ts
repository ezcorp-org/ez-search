/**
 * Query utilities — pure functions extracted from query-cmd for testability.
 *
 * normalizeResults: maps raw vector DB results to a uniform shape.
 * filterAndCollapse: filters, collapses adjacent chunks, sorts, and slices.
 */

import type { QueryResult } from './vector-db.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type NormalizedResult = {
  filePath: string;
  chunkIndex: number;
  lineStart: number;
  lineEnd: number;
  chunkText: string;
  modelId: string;
  score: number;
};

export type CollapsedResult = {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  score: number;
  chunkText: string;
};

export interface FilterOptions {
  threshold?: number;
  dir?: string;
  topK: number;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Map raw vector DB query results to a normalized shape with a score derived
 * from distance: score = round(max(0, min(1, 1 - distance)) * 10000) / 10000
 */
export function normalizeResults(rawResults: QueryResult[]): NormalizedResult[] {
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

/**
 * Filter by modelId, threshold, dir prefix; collapse adjacent chunks;
 * sort by score descending; slice to topK.
 */
export function filterAndCollapse(
  results: NormalizedResult[],
  modelFilter: (id: string) => boolean,
  options: FilterOptions,
): CollapsedResult[] {
  const { threshold, dir, topK } = options;

  // Filter by modelId
  let filtered = results.filter((r) => modelFilter(r.modelId));

  // Apply --threshold
  if (threshold !== undefined) {
    filtered = filtered.filter((r) => r.score >= threshold);
  }

  // Apply --dir
  if (dir !== undefined) {
    const normalizedDir = dir.replace(/^\.\//, '').replace(/\/$/, '');
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
