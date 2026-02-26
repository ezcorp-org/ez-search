/**
 * Accuracy tests — pass/fail thresholds for semantic search quality.
 *
 * Runs the full harness (real models, real corpus) and asserts per-type metrics
 * meet minimum thresholds. Use `bun test tests/accuracy/` to run.
 *
 * These tests are intentionally separated from the fast unit/integration tests
 * because they require model downloads and take minutes to complete.
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { runHarness, type HarnessResult } from './harness.js';

// ── Thresholds (calibrate after first real run) ──────────────────────────────

const THRESHOLDS = {
  code: { mrr: 0.80, p1: 0.70, recall3: 0.80 },
  text: { mrr: 0.80, p1: 0.70, recall3: 0.80 },
  image: { mrr: 0.60, p1: 0.50, recall3: 0.50 },
};

// ── Test suite ───────────────────────────────────────────────────────────────

let result: HarnessResult;

// 5-minute timeout for model loading + indexing + queries
beforeAll(async () => {
  result = await runHarness();
}, 300_000);

describe('code search accuracy', () => {
  test(`MRR >= ${THRESHOLDS.code.mrr}`, () => {
    expect(result.code.aggregate.mrr).toBeGreaterThanOrEqual(THRESHOLDS.code.mrr);
  });

  test(`P@1 >= ${THRESHOLDS.code.p1}`, () => {
    expect(result.code.aggregate.p1).toBeGreaterThanOrEqual(THRESHOLDS.code.p1);
  });

  test(`Recall@3 >= ${THRESHOLDS.code.recall3}`, () => {
    expect(result.code.aggregate.recall3).toBeGreaterThanOrEqual(THRESHOLDS.code.recall3);
  });
});

describe('hybrid code search accuracy', () => {
  test('hybrid MRR >= semantic MRR', () => {
    expect(result.codeHybrid.aggregate.mrr).toBeGreaterThanOrEqual(result.code.aggregate.mrr);
  });
});

describe('text search accuracy', () => {
  test(`MRR >= ${THRESHOLDS.text.mrr}`, () => {
    expect(result.text.aggregate.mrr).toBeGreaterThanOrEqual(THRESHOLDS.text.mrr);
  });

  test(`P@1 >= ${THRESHOLDS.text.p1}`, () => {
    expect(result.text.aggregate.p1).toBeGreaterThanOrEqual(THRESHOLDS.text.p1);
  });

  test(`Recall@3 >= ${THRESHOLDS.text.recall3}`, () => {
    expect(result.text.aggregate.recall3).toBeGreaterThanOrEqual(THRESHOLDS.text.recall3);
  });
});

describe('image search accuracy', () => {
  test(`MRR >= ${THRESHOLDS.image.mrr}`, () => {
    expect(result.image.aggregate.mrr).toBeGreaterThanOrEqual(THRESHOLDS.image.mrr);
  });

  test(`P@1 >= ${THRESHOLDS.image.p1}`, () => {
    expect(result.image.aggregate.p1).toBeGreaterThanOrEqual(THRESHOLDS.image.p1);
  });

  test(`Recall@3 >= ${THRESHOLDS.image.recall3}`, () => {
    expect(result.image.aggregate.recall3).toBeGreaterThanOrEqual(THRESHOLDS.image.recall3);
  });
});
