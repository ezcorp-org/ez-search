import { describe, test, expect } from 'bun:test';
import type { QueryResult } from '../../src/services/vector-db.js';
import {
  normalizeResults,
  filterAndCollapse,
  filterImageResults,
  type NormalizedResult,
} from '../../src/services/query-utils.js';

function makeResult(overrides: Partial<NormalizedResult> = {}): NormalizedResult {
  return {
    filePath: 'src/foo.ts',
    chunkIndex: 0,
    lineStart: 1,
    lineEnd: 10,
    chunkText: 'some code',
    modelId: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
    score: 0.9,
    ...overrides,
  };
}

function makeQueryResult(
  distance: number,
  metadata: Record<string, string | number> = {},
): QueryResult {
  return {
    id: 'vec-1',
    distance,
    metadata: {
      filePath: 'src/foo.ts',
      chunkIndex: 0,
      lineStart: 1,
      lineEnd: 10,
      chunkText: 'some code',
      modelId: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
      ...metadata,
    },
  };
}

describe('normalizeResults', () => {
  describe('converts raw distance to score', () => {
    test('distance 0 -> score 1', () => {
      const [result] = normalizeResults([makeQueryResult(0)]);
      expect(result.score).toBe(1);
    });

    test('distance 1 -> score 0', () => {
      const [result] = normalizeResults([makeQueryResult(1)]);
      expect(result.score).toBe(0);
    });

    test('distance 0.3 -> score 0.7', () => {
      const [result] = normalizeResults([makeQueryResult(0.3)]);
      expect(result.score).toBe(0.7);
    });

    test('distance -0.5 -> score 1 (clamped)', () => {
      const [result] = normalizeResults([makeQueryResult(-0.5)]);
      expect(result.score).toBe(1);
    });

    test('distance 1.5 -> score 0 (clamped)', () => {
      const [result] = normalizeResults([makeQueryResult(1.5)]);
      expect(result.score).toBe(0);
    });
  });

  test('extracts all metadata fields correctly', () => {
    const [result] = normalizeResults([
      makeQueryResult(0.2, {
        filePath: 'lib/bar.ts',
        chunkIndex: 3,
        lineStart: 20,
        lineEnd: 40,
        chunkText: 'function bar() {}',
        modelId: 'openai-v3',
      }),
    ]);
    expect(result.filePath).toBe('lib/bar.ts');
    expect(result.chunkIndex).toBe(3);
    expect(result.lineStart).toBe(20);
    expect(result.lineEnd).toBe(40);
    expect(result.chunkText).toBe('function bar() {}');
    expect(result.modelId).toBe('openai-v3');
    expect(result.score).toBe(0.8);
  });
});

describe('filterAndCollapse', () => {
  const acceptAll = () => true;

  test('filters by modelId function', () => {
    const results = [
      makeResult({ modelId: 'onnx-community/Qwen3-Embedding-0.6B-ONNX', score: 0.9 }),
      makeResult({ modelId: 'openai-v3', score: 0.8 }),
    ];
    const collapsed = filterAndCollapse(results, (id) => id.includes('Qwen3-Embedding'), { topK: 10 });
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].score).toBe(0.9);
  });

  test('applies threshold filter', () => {
    const results = [
      makeResult({ score: 0.9, chunkIndex: 0 }),
      makeResult({ score: 0.3, chunkIndex: 1 }),
    ];
    const collapsed = filterAndCollapse(results, acceptAll, { threshold: 0.5, topK: 10 });
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].score).toBe(0.9);
  });

  test('applies dir prefix filter and normalizes ./ and trailing /', () => {
    const results = [
      makeResult({ filePath: 'src/foo.ts' }),
      makeResult({ filePath: 'lib/bar.ts', chunkIndex: 1 }),
    ];

    // With ./src/ (leading ./ and trailing /)
    const collapsed = filterAndCollapse(results, acceptAll, { dir: './src/', topK: 10 });
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].filePath).toBe('src/foo.ts');
  });

  test('collapses adjacent chunks (same file, consecutive chunkIndex)', () => {
    const results = [
      makeResult({ filePath: 'src/foo.ts', chunkIndex: 0 }),
      makeResult({ filePath: 'src/foo.ts', chunkIndex: 1 }),
      makeResult({ filePath: 'src/foo.ts', chunkIndex: 2 }),
    ];
    const collapsed = filterAndCollapse(results, acceptAll, { topK: 10 });
    expect(collapsed).toHaveLength(1);
  });

  test('collapsed chunk uses min lineStart, max lineEnd, max score, joined text', () => {
    const results = [
      makeResult({ chunkIndex: 0, lineStart: 5, lineEnd: 10, score: 0.7, chunkText: 'line A' }),
      makeResult({ chunkIndex: 1, lineStart: 11, lineEnd: 20, score: 0.9, chunkText: 'line B' }),
      makeResult({ chunkIndex: 2, lineStart: 21, lineEnd: 30, score: 0.8, chunkText: 'line C' }),
    ];
    const collapsed = filterAndCollapse(results, acceptAll, { topK: 10 });
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].lineStart).toBe(5);
    expect(collapsed[0].lineEnd).toBe(30);
    expect(collapsed[0].score).toBe(0.9);
    expect(collapsed[0].chunkText).toBe('line A\nline B\nline C');
  });

  test('sorts by score descending', () => {
    const results = [
      makeResult({ filePath: 'a.ts', chunkIndex: 0, score: 0.5 }),
      makeResult({ filePath: 'b.ts', chunkIndex: 0, score: 0.9 }),
      makeResult({ filePath: 'c.ts', chunkIndex: 0, score: 0.7 }),
    ];
    const collapsed = filterAndCollapse(results, acceptAll, { topK: 10 });
    expect(collapsed.map((r) => r.score)).toEqual([0.9, 0.7, 0.5]);
  });

  test('slices to topK', () => {
    const results = [
      makeResult({ filePath: 'a.ts', chunkIndex: 0, score: 0.9 }),
      makeResult({ filePath: 'b.ts', chunkIndex: 0, score: 0.8 }),
      makeResult({ filePath: 'c.ts', chunkIndex: 0, score: 0.7 }),
    ];
    const collapsed = filterAndCollapse(results, acceptAll, { topK: 2 });
    expect(collapsed).toHaveLength(2);
    expect(collapsed[0].score).toBe(0.9);
    expect(collapsed[1].score).toBe(0.8);
  });

  test('non-adjacent chunks from same file stay separate', () => {
    const results = [
      makeResult({ filePath: 'src/foo.ts', chunkIndex: 0, score: 0.9 }),
      makeResult({ filePath: 'src/foo.ts', chunkIndex: 5, score: 0.8 }),
    ];
    const collapsed = filterAndCollapse(results, acceptAll, { topK: 10 });
    expect(collapsed).toHaveLength(2);
  });
});

describe('filterImageResults', () => {
  const acceptAll = () => true;

  function makeImageNormalized(overrides: Partial<NormalizedResult> = {}): NormalizedResult {
    return {
      filePath: 'photos/cat.jpg',
      chunkIndex: 0,
      lineStart: 0,
      lineEnd: 0,
      chunkText: '',
      modelId: 'Xenova/siglip-base-patch16-224',
      score: 0.5,
      ...overrides,
    };
  }

  test('filters by modelId function', () => {
    const results = [
      makeImageNormalized({ modelId: 'Xenova/siglip-base-patch16-224', score: 0.6 }),
      makeImageNormalized({ modelId: 'nomic-v1', score: 0.8, filePath: 'doc.md' }),
    ];
    const filtered = filterImageResults(results, (id) => id.includes('siglip'), { topK: 10 });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].filePath).toBe('photos/cat.jpg');
  });

  test('applies threshold filter', () => {
    const results = [
      makeImageNormalized({ score: 0.7, filePath: 'a.png' }),
      makeImageNormalized({ score: 0.2, filePath: 'b.png' }),
    ];
    const filtered = filterImageResults(results, acceptAll, { threshold: 0.5, topK: 10 });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].filePath).toBe('a.png');
  });

  test('applies dir prefix filter with normalization', () => {
    const results = [
      makeImageNormalized({ filePath: 'screenshots/ui.png' }),
      makeImageNormalized({ filePath: 'photos/dog.jpg' }),
    ];
    const filtered = filterImageResults(results, acceptAll, { dir: './screenshots/', topK: 10 });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].filePath).toBe('screenshots/ui.png');
  });

  test('deduplicates by filePath keeping highest score', () => {
    const results = [
      makeImageNormalized({ filePath: 'cat.jpg', score: 0.3 }),
      makeImageNormalized({ filePath: 'cat.jpg', score: 0.8 }),
      makeImageNormalized({ filePath: 'cat.jpg', score: 0.5 }),
    ];
    const filtered = filterImageResults(results, acceptAll, { topK: 10 });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].score).toBe(0.8);
  });

  test('sorts by score descending', () => {
    const results = [
      makeImageNormalized({ filePath: 'a.png', score: 0.3 }),
      makeImageNormalized({ filePath: 'b.png', score: 0.9 }),
      makeImageNormalized({ filePath: 'c.png', score: 0.6 }),
    ];
    const filtered = filterImageResults(results, acceptAll, { topK: 10 });
    expect(filtered.map((r) => r.score)).toEqual([0.9, 0.6, 0.3]);
  });

  test('slices to topK', () => {
    const results = [
      makeImageNormalized({ filePath: 'a.png', score: 0.9 }),
      makeImageNormalized({ filePath: 'b.png', score: 0.7 }),
      makeImageNormalized({ filePath: 'c.png', score: 0.5 }),
    ];
    const filtered = filterImageResults(results, acceptAll, { topK: 2 });
    expect(filtered).toHaveLength(2);
    expect(filtered[0].filePath).toBe('a.png');
    expect(filtered[1].filePath).toBe('b.png');
  });

  test('returns only filePath and score (no chunk fields)', () => {
    const results = [makeImageNormalized()];
    const filtered = filterImageResults(results, acceptAll, { topK: 10 });
    expect(filtered).toHaveLength(1);
    expect(Object.keys(filtered[0]).sort()).toEqual(['filePath', 'score']);
  });

  test('returns empty array when no results match', () => {
    const results = [makeImageNormalized({ modelId: 'onnx-community/Qwen3-Embedding-0.6B-ONNX' })];
    const filtered = filterImageResults(results, (id) => id.includes('siglip'), { topK: 10 });
    expect(filtered).toEqual([]);
  });

  test('handles empty input', () => {
    const filtered = filterImageResults([], acceptAll, { topK: 10 });
    expect(filtered).toEqual([]);
  });
});
