/**
 * LexicalIndex performance benchmark — measures addDocument, query, and serialization.
 *
 * Tests with 1K, 5K, and 10K documents to show scaling characteristics.
 */

import { describe, test } from 'bun:test';
import { LexicalIndex } from '../../src/services/lexical-index.js';
import { generateCodeFile, generateTextDocument, percentiles, printTable, fmtMs, timeIt } from './helpers.js';

const DOC_COUNTS = [1_000, 5_000, 10_000];

const SAMPLE_QUERIES = [
  'handleRequest', 'parseConfig', 'database connection',
  'error handling', 'validateInput', 'search index query',
];

describe('LexicalIndex performance', () => {
  for (const count of DOC_COUNTS) {
    test(`${count} documents`, async () => {
      const idx = new LexicalIndex();

      // -- addDocument throughput --
      const addLatencies: number[] = [];
      for (let i = 0; i < count; i++) {
        const content = i % 2 === 0
          ? generateCodeFile(50, i)
          : generateTextDocument(800, i);

        const start = performance.now();
        idx.addDocument(`doc_${i}`, content, {
          filePath: `src/file_${i}.ts`,
          chunkIndex: 0,
          lineStart: 1,
          lineEnd: 50,
        });
        addLatencies.push(performance.now() - start);
      }

      const addStats = percentiles(addLatencies);
      const totalAddMs = addLatencies.reduce((s, v) => s + v, 0);

      // -- Query latency --
      const queryLatencies: number[] = [];
      for (let i = 0; i < 50; i++) {
        const q = SAMPLE_QUERIES[i % SAMPLE_QUERIES.length];
        const start = performance.now();
        idx.query(q, 10);
        queryLatencies.push(performance.now() - start);
      }

      const queryStats = percentiles(queryLatencies);

      // -- Serialization --
      let json = '';
      const serializeMs = await timeIt(() => { json = idx.toJSON(); });

      let restored: LexicalIndex | undefined;
      const deserializeMs = await timeIt(() => { restored = LexicalIndex.fromJSON(json); });

      const jsonSizeKb = Math.round(json.length / 1024);

      console.log(`\n  LexicalIndex performance: ${count} docs`);
      printTable(
        ['Metric', 'Value'],
        [
          ['Documents', count],
          ['addDocument total', fmtMs(totalAddMs)],
          ['addDocument p50', fmtMs(addStats.p50)],
          ['addDocument p95', fmtMs(addStats.p95)],
          ['Query p50', fmtMs(queryStats.p50)],
          ['Query p95', fmtMs(queryStats.p95)],
          ['Query p99', fmtMs(queryStats.p99)],
          ['toJSON', fmtMs(serializeMs)],
          ['fromJSON', fmtMs(deserializeMs)],
          ['JSON size', `${jsonSizeKb}KB`],
        ],
      );
    }, 30_000);
  }
});
