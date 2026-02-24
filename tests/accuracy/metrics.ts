/**
 * IR evaluation metrics — pure functions, no external dependencies.
 *
 * All functions use binary relevance (a result is either relevant or not).
 * "retrieved" is an ordered list of filenames; "relevant" is a set of relevant filenames.
 */

// ── Per-query metrics ────────────────────────────────────────────────────────

/**
 * Precision@K: fraction of top-K results that are relevant.
 */
export function precisionAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  const topK = retrieved.slice(0, k);
  if (topK.length === 0) return 0;
  const hits = topK.filter((r) => relevant.has(r)).length;
  return hits / topK.length;
}

/**
 * Recall@K: fraction of relevant documents found in top-K results.
 */
export function recallAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  if (relevant.size === 0) return 1;
  const topK = retrieved.slice(0, k);
  const hits = topK.filter((r) => relevant.has(r)).length;
  return hits / relevant.size;
}

/**
 * Reciprocal Rank: 1 / position of first relevant result (0 if none found).
 */
export function reciprocalRank(retrieved: string[], relevant: Set<string>): number {
  for (let i = 0; i < retrieved.length; i++) {
    if (relevant.has(retrieved[i])) return 1 / (i + 1);
  }
  return 0;
}

/**
 * nDCG@K: normalized discounted cumulative gain with binary relevance.
 * DCG = sum of 1/log2(i+2) for relevant results at position i (0-indexed).
 * IDCG = same sum for the best possible ranking.
 */
export function ndcgAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  const topK = retrieved.slice(0, k);

  let dcg = 0;
  for (let i = 0; i < topK.length; i++) {
    if (relevant.has(topK[i])) {
      dcg += 1 / Math.log2(i + 2);
    }
  }

  // Ideal DCG: all relevant docs ranked first
  const idealHits = Math.min(relevant.size, k);
  let idcg = 0;
  for (let i = 0; i < idealHits; i++) {
    idcg += 1 / Math.log2(i + 2);
  }

  return idcg === 0 ? 0 : dcg / idcg;
}

// ── Aggregation ──────────────────────────────────────────────────────────────

export interface QueryMetrics {
  query: string;
  mrr: number;
  p1: number;
  recall3: number;
  ndcg3: number;
  retrieved: string[];
  relevant: string[];
  hit: boolean; // true if top-1 result is relevant
}

export interface AggregateMetrics {
  mrr: number;
  p1: number;
  recall3: number;
  ndcg3: number;
  count: number;
}

/**
 * Compute metrics for a single query given retrieved and relevant filenames.
 */
export function computeQueryMetrics(
  query: string,
  retrieved: string[],
  relevant: Set<string>,
): QueryMetrics {
  return {
    query,
    mrr: reciprocalRank(retrieved, relevant),
    p1: precisionAtK(retrieved, relevant, 1),
    recall3: recallAtK(retrieved, relevant, 3),
    ndcg3: ndcgAtK(retrieved, relevant, 3),
    retrieved: retrieved.slice(0, 5),
    relevant: [...relevant],
    hit: retrieved.length > 0 && relevant.has(retrieved[0]),
  };
}

/**
 * Aggregate per-query metrics into mean scores.
 */
export function aggregateMetrics(results: QueryMetrics[]): AggregateMetrics {
  if (results.length === 0) {
    return { mrr: 0, p1: 0, recall3: 0, ndcg3: 0, count: 0 };
  }
  const n = results.length;
  return {
    mrr: results.reduce((s, r) => s + r.mrr, 0) / n,
    p1: results.reduce((s, r) => s + r.p1, 0) / n,
    recall3: results.reduce((s, r) => s + r.recall3, 0) / n,
    ndcg3: results.reduce((s, r) => s + r.ndcg3, 0) / n,
    count: n,
  };
}
