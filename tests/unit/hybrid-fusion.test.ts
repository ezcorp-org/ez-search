import { describe, test, expect } from 'bun:test';
import { rrfFuse, type RankedItem } from '../../src/services/hybrid-fusion.js';

function makeItem(id: string, score: number, overrides: Partial<RankedItem> = {}): RankedItem {
  return {
    id,
    filePath: `src/${id}.ts`,
    chunkIndex: 0,
    lineStart: 1,
    lineEnd: 10,
    chunkText: `code for ${id}`,
    score,
    ...overrides,
  };
}

describe('rrfFuse', () => {
  test('overlapping lists: docs in both get boosted to top', () => {
    const semantic = [makeItem('a', 0.9), makeItem('b', 0.8), makeItem('c', 0.7)];
    const lexical = [makeItem('c', 0.9), makeItem('a', 0.8), makeItem('d', 0.7)];

    const fused = rrfFuse(semantic, lexical);

    // 'a' and 'c' appear in both lists → should have highest fused scores
    const ids = fused.map((r) => r.id);
    expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('d'));
    expect(ids.indexOf('c')).toBeLessThan(ids.indexOf('d'));
  });

  test('disjoint lists: all docs included', () => {
    const semantic = [makeItem('a', 0.9), makeItem('b', 0.8)];
    const lexical = [makeItem('c', 0.9), makeItem('d', 0.8)];

    const fused = rrfFuse(semantic, lexical);
    const ids = new Set(fused.map((r) => r.id));
    expect(ids).toEqual(new Set(['a', 'b', 'c', 'd']));
  });

  test('empty lexical list → semantic passthrough', () => {
    const semantic = [makeItem('a', 0.9), makeItem('b', 0.8)];
    const fused = rrfFuse(semantic, []);

    expect(fused).toHaveLength(2);
    expect(fused[0].id).toBe('a');
    expect(fused[1].id).toBe('b');
  });

  test('empty semantic list → lexical passthrough', () => {
    const lexical = [makeItem('a', 0.9), makeItem('b', 0.8)];
    const fused = rrfFuse([], lexical);

    expect(fused).toHaveLength(2);
    expect(fused[0].id).toBe('a');
    expect(fused[1].id).toBe('b');
  });

  test('scores normalized to 0-1: max score = 1.0', () => {
    const semantic = [makeItem('a', 0.9)];
    const lexical = [makeItem('a', 0.9)];

    const fused = rrfFuse(semantic, lexical);
    expect(fused[0].fusedScore).toBe(1.0);
  });

  test('both empty → []', () => {
    expect(rrfFuse([], [])).toEqual([]);
  });

  test('tie-breaking: same RRF score does not crash', () => {
    const semantic = [makeItem('a', 0.9), makeItem('b', 0.8)];
    const lexical = [makeItem('b', 0.9), makeItem('a', 0.8)];

    // Both a and b have the same RRF score (rank 1 in one, rank 2 in other)
    const fused = rrfFuse(semantic, lexical);
    expect(fused).toHaveLength(2);
    expect(fused[0].fusedScore).toBe(fused[1].fusedScore);
  });

  test('custom k value produces valid results', () => {
    const semantic = [makeItem('a', 0.9), makeItem('b', 0.8)];
    const lexical = [makeItem('a', 0.9)];

    const fused = rrfFuse(semantic, lexical, { k: 10 });
    expect(fused.length).toBeGreaterThan(0);
    for (const r of fused) {
      expect(r.fusedScore).toBeGreaterThanOrEqual(0);
      expect(r.fusedScore).toBeLessThanOrEqual(1);
    }
  });

  test('metadata preserved from best-ranked source', () => {
    const semantic = [makeItem('a', 0.9, { chunkText: 'semantic text', lineStart: 1, lineEnd: 10 })];
    const lexical = [
      makeItem('b', 0.9, { chunkText: 'lexical first' }),
      makeItem('a', 0.8, { chunkText: 'lexical text', lineStart: 100, lineEnd: 200 }),
    ];

    const fused = rrfFuse(semantic, lexical);
    const docA = fused.find((r) => r.id === 'a')!;
    // 'a' is rank 1 in semantic, rank 2 in lexical → semantic metadata wins
    expect(docA.chunkText).toBe('semantic text');

    const docB = fused.find((r) => r.id === 'b')!;
    // 'b' only in lexical → lexical metadata
    expect(docB.chunkText).toBe('lexical first');
  });

  test('all fused scores are between 0 and 1', () => {
    const semantic = Array.from({ length: 20 }, (_, i) => makeItem(`s${i}`, 0.9 - i * 0.04));
    const lexical = Array.from({ length: 15 }, (_, i) => makeItem(`l${i}`, 0.95 - i * 0.05));

    const fused = rrfFuse(semantic, lexical);
    for (const r of fused) {
      expect(r.fusedScore).toBeGreaterThanOrEqual(0);
      expect(r.fusedScore).toBeLessThanOrEqual(1);
    }
  });
});
