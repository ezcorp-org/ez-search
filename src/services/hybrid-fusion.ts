/**
 * Reciprocal Rank Fusion (RRF) — combines semantic and lexical search results.
 *
 * Formula: fusedScore(d) = 1/(k + rank_semantic(d)) + 1/(k + rank_lexical(d))
 * Absent docs get 0 contribution from that list.
 * Final scores normalized to [0, 1] by dividing by max.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RankedItem {
  id: string;
  filePath: string;
  chunkIndex: number;
  lineStart: number;
  lineEnd: number;
  chunkText: string;
  score: number;
}

export interface FusedResult extends RankedItem {
  fusedScore: number;
}

// ── RRF implementation ───────────────────────────────────────────────────────

const DEFAULT_K = 60;

export function rrfFuse(
  semantic: RankedItem[],
  lexical: RankedItem[],
  opts?: { k?: number },
): FusedResult[] {
  const k = opts?.k ?? DEFAULT_K;

  if (semantic.length === 0 && lexical.length === 0) return [];

  // Build rank maps (1-indexed)
  const semanticRank = new Map<string, number>();
  for (let i = 0; i < semantic.length; i++) {
    semanticRank.set(semantic[i].id, i + 1);
  }

  const lexicalRank = new Map<string, number>();
  for (let i = 0; i < lexical.length; i++) {
    lexicalRank.set(lexical[i].id, i + 1);
  }

  // Collect all unique doc IDs with their best metadata
  const docs = new Map<string, RankedItem>();
  for (const item of semantic) {
    docs.set(item.id, item);
  }
  for (const item of lexical) {
    if (!docs.has(item.id)) {
      docs.set(item.id, item);
    } else {
      // Keep metadata from higher-ranked source
      const semRank = semanticRank.get(item.id) ?? Infinity;
      const lexRank = lexicalRank.get(item.id) ?? Infinity;
      if (lexRank < semRank) {
        docs.set(item.id, item);
      }
    }
  }

  // Compute RRF scores
  const fused: FusedResult[] = [];
  let maxScore = 0;

  for (const [id, item] of docs) {
    const semRank = semanticRank.get(id);
    const lexRank = lexicalRank.get(id);
    const score = (semRank ? 1 / (k + semRank) : 0) + (lexRank ? 1 / (k + lexRank) : 0);
    if (score > maxScore) maxScore = score;
    fused.push({ ...item, fusedScore: score });
  }

  // Normalize to [0, 1]
  if (maxScore > 0) {
    for (const item of fused) {
      item.fusedScore = Math.round((item.fusedScore / maxScore) * 10000) / 10000;
    }
  }

  // Sort by fusedScore descending
  fused.sort((a, b) => b.fusedScore - a.fusedScore);

  return fused;
}
