/**
 * RRF fusion overhead benchmark — measures rrfFuse() execution time vs baseline sorting.
 *
 * Generates ranked lists of 100, 500, and 1000 items and compares
 * fusion time to a simple sort baseline.
 */

import { describe, test } from 'bun:test';
import { rrfFuse, type RankedItem } from '../../src/services/hybrid-fusion.js';
import { percentiles, printTable, fmtMs } from './helpers.js';

const LIST_SIZES = [100, 500, 1000];
const ITERATIONS = 200;

function generateRankedList(size: number, prefix: string, seed: number): RankedItem[] {
  let state = seed;
  const rand = () => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state; };

  return Array.from({ length: size }, (_, i) => ({
    id: `${prefix}_${i}`,
    filePath: `src/${prefix}_${i}.ts`,
    chunkIndex: 0,
    lineStart: 1,
    lineEnd: 50,
    chunkText: `chunk content for ${prefix}_${i}`,
    score: 1 - (i / size) + (rand() % 100) / 10000, // decreasing with jitter
  }));
}

describe('RRF fusion overhead', () => {
  for (const size of LIST_SIZES) {
    test(`${size} items per list, ${ITERATIONS} iterations`, () => {
      // Pre-generate lists with ~50% overlap in IDs
      const semantic = generateRankedList(size, 'sem', 42);
      const lexical = generateRankedList(size, 'lex', 99);
      // Create overlap: rename half of lexical IDs to match semantic
      for (let i = 0; i < Math.floor(size / 2); i++) {
        lexical[i] = { ...lexical[i], id: semantic[i].id };
      }

      // -- RRF fusion timing --
      const fusionLatencies: number[] = [];
      for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now();
        rrfFuse(semantic, lexical);
        fusionLatencies.push(performance.now() - start);
      }

      // -- Baseline: just concatenate + sort by score --
      const baselineLatencies: number[] = [];
      for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now();
        const combined = [...semantic, ...lexical];
        combined.sort((a, b) => b.score - a.score);
        baselineLatencies.push(performance.now() - start);
      }

      const fusionStats = percentiles(fusionLatencies);
      const baselineStats = percentiles(baselineLatencies);
      const overhead = fusionStats.mean / baselineStats.mean;

      console.log(`\n  RRF fusion overhead: ${size} items per list`);
      printTable(
        ['Metric', 'RRF Fusion', 'Baseline Sort'],
        [
          ['p50', fmtMs(fusionStats.p50), fmtMs(baselineStats.p50)],
          ['p95', fmtMs(fusionStats.p95), fmtMs(baselineStats.p95)],
          ['p99', fmtMs(fusionStats.p99), fmtMs(baselineStats.p99)],
          ['mean', fmtMs(fusionStats.mean), fmtMs(baselineStats.mean)],
          ['overhead', `${overhead.toFixed(2)}x`, '1.00x'],
        ],
      );
    }, 30_000);
  }
});
