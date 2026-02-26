/**
 * Query latency benchmark — measures p50/p95/p99 lexical query latency.
 *
 * Builds LexicalIndex instances with 1K, 5K, and 10K documents,
 * then runs 100 queries against each to measure latency distribution.
 */

import { describe, test } from 'bun:test';
import { LexicalIndex } from '../../src/services/lexical-index.js';
import { generateCodeFile, generateTextDocument, percentiles, printTable, fmtMs } from './helpers.js';

const QUERY_COUNT = 100;
const QUERIES = [
  'handleRequest', 'parseConfig', 'getUserData', 'validateInput', 'processItem',
  'buildQuery', 'formatOutput', 'loadModule', 'saveResult', 'computeHash',
  'error handling', 'database connection', 'authentication token', 'middleware chain',
  'search index', 'vector embedding', 'query result', 'file parser', 'config loader',
  'response handler',
];

function buildIndex(docCount: number): LexicalIndex {
  const idx = new LexicalIndex();
  for (let i = 0; i < docCount; i++) {
    const content = i % 2 === 0
      ? generateCodeFile(50, i)
      : generateTextDocument(800, i);
    idx.addDocument(`doc_${i}`, content, {
      filePath: `src/file_${i}.ts`,
      chunkIndex: 0,
      lineStart: 1,
      lineEnd: 50,
    });
  }
  return idx;
}

describe('query latency (keyword mode)', () => {
  const docCounts = [1_000, 5_000, 10_000];

  for (const count of docCounts) {
    test(`${count} docs, ${QUERY_COUNT} queries`, () => {
      console.log(`\n  Building index with ${count} docs...`);
      const buildStart = performance.now();
      const idx = buildIndex(count);
      const buildMs = performance.now() - buildStart;
      console.log(`  Index built in ${fmtMs(buildMs)}`);

      // Run queries and collect latencies
      const latencies: number[] = [];
      for (let i = 0; i < QUERY_COUNT; i++) {
        const q = QUERIES[i % QUERIES.length];
        const start = performance.now();
        idx.query(q, 10);
        latencies.push(performance.now() - start);
      }

      const stats = percentiles(latencies);

      console.log(`\n  Query latency: ${count} docs, ${QUERY_COUNT} queries`);
      printTable(
        ['Metric', 'Value'],
        [
          ['Docs', count],
          ['Queries', QUERY_COUNT],
          ['p50', fmtMs(stats.p50)],
          ['p95', fmtMs(stats.p95)],
          ['p99', fmtMs(stats.p99)],
          ['mean', fmtMs(stats.mean)],
          ['min', fmtMs(stats.min)],
          ['max', fmtMs(stats.max)],
        ],
      );
    }, 30_000);
  }
});
