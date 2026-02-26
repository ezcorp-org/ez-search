/**
 * Indexing throughput benchmark — measures chunking speed for synthetic code files.
 *
 * Uses the text chunker (no ML model required) to measure pure JS chunking throughput.
 * Tests 100, 500, and 1000 synthetic files of ~100 lines each.
 */

import { describe, test } from 'bun:test';
import { chunkTextFile } from '../../src/services/text-chunker.js';
import { generateCodeFile, printTable, fmtMs, timeIt } from './helpers.js';

describe('indexing throughput', () => {
  const fileCounts = [100, 500, 1000];

  for (const count of fileCounts) {
    test(`chunk ${count} files (~100 lines each)`, async () => {
      // Pre-generate files so generation time is excluded
      const files = Array.from({ length: count }, (_, i) => generateCodeFile(100, i));

      let totalChunks = 0;
      const duration = await timeIt(() => {
        for (const content of files) {
          const chunks = chunkTextFile(content);
          totalChunks += chunks.length;
        }
      });

      const filesPerSec = Math.round(count / (duration / 1000));
      const chunksPerSec = Math.round(totalChunks / (duration / 1000));

      console.log(`\n  Indexing throughput: ${count} files`);
      printTable(
        ['Metric', 'Value'],
        [
          ['Files', count],
          ['Total chunks', totalChunks],
          ['Duration', fmtMs(duration)],
          ['Files/sec', filesPerSec],
          ['Chunks/sec', chunksPerSec],
        ],
      );
    }, 30_000);
  }
});
