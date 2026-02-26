/**
 * Incremental re-indexing benchmark — measures speedup of partial re-index vs full.
 *
 * Simulates manifest-based incremental indexing using text chunker + LexicalIndex.
 * Changes 10%, 25%, 50% of files and measures re-index time vs full index time.
 */

import { describe, test, expect } from 'bun:test';
import { chunkTextFile } from '../../src/services/text-chunker.js';
import { LexicalIndex } from '../../src/services/lexical-index.js';
import { hashText, makeChunkId } from '../../src/services/manifest-cache.js';
import { generateCodeFile, printTable, fmtMs, timeIt } from './helpers.js';

const FILE_COUNT = 1000;
const CHANGE_RATIOS = [0.10, 0.25, 0.50];

interface FileRecord {
  path: string;
  content: string;
  hash: string;
}

function generateFiles(count: number, seedOffset = 0): FileRecord[] {
  return Array.from({ length: count }, (_, i) => {
    const content = generateCodeFile(100, i + seedOffset);
    return {
      path: `src/module_${i}/handler.ts`,
      content,
      hash: hashText(content),
    };
  });
}

function fullIndex(files: FileRecord[]): LexicalIndex {
  const idx = new LexicalIndex();
  for (const file of files) {
    const chunks = chunkTextFile(file.content);
    for (const chunk of chunks) {
      const id = makeChunkId(file.path, chunk.chunkIndex);
      idx.addDocument(id, chunk.text, {
        filePath: file.path,
        chunkIndex: chunk.chunkIndex,
        lineStart: 1,
        lineEnd: 50,
      });
    }
  }
  return idx;
}

function incrementalIndex(
  idx: LexicalIndex,
  oldFiles: FileRecord[],
  newFiles: FileRecord[],
  changedIndices: Set<number>,
): void {
  for (const i of changedIndices) {
    // Remove old chunks for changed file
    const oldChunks = chunkTextFile(oldFiles[i].content);
    for (const chunk of oldChunks) {
      idx.removeDocument(makeChunkId(oldFiles[i].path, chunk.chunkIndex));
    }

    // Add new chunks
    const newChunks = chunkTextFile(newFiles[i].content);
    for (const chunk of newChunks) {
      const id = makeChunkId(newFiles[i].path, chunk.chunkIndex);
      idx.addDocument(id, chunk.text, {
        filePath: newFiles[i].path,
        chunkIndex: chunk.chunkIndex,
        lineStart: 1,
        lineEnd: 50,
      });
    }
  }
}

describe('incremental re-indexing speed', () => {
  // Pre-generate files once
  const originalFiles = generateFiles(FILE_COUNT);

  test('full index baseline', async () => {
    const duration = await timeIt(() => { fullIndex(originalFiles); });
    console.log(`\n  Full index: ${FILE_COUNT} files in ${fmtMs(duration)}`);
  }, 30_000);

  for (const ratio of CHANGE_RATIOS) {
    test(`${Math.round(ratio * 100)}% changed (${Math.round(FILE_COUNT * ratio)} files)`, async () => {
      const changeCount = Math.round(FILE_COUNT * ratio);

      // Build initial index
      const idx = fullIndex(originalFiles);

      // Generate modified versions of changed files
      const modifiedFiles = [...originalFiles];
      const changedIndices = new Set<number>();
      for (let i = 0; i < changeCount; i++) {
        changedIndices.add(i);
        const content = generateCodeFile(100, i + 999_000); // different seed
        modifiedFiles[i] = {
          path: originalFiles[i].path,
          content,
          hash: hashText(content),
        };
      }

      // Measure full re-index
      const fullDuration = await timeIt(() => { fullIndex(modifiedFiles); });

      // Measure incremental re-index
      const incrDuration = await timeIt(() => {
        incrementalIndex(idx, originalFiles, modifiedFiles, changedIndices);
      });

      const speedup = fullDuration / incrDuration;

      console.log(`\n  Incremental vs full: ${Math.round(ratio * 100)}% changed`);
      printTable(
        ['Metric', 'Value'],
        [
          ['Changed files', changeCount],
          ['Full re-index', fmtMs(fullDuration)],
          ['Incremental', fmtMs(incrDuration)],
          ['Speedup', `${speedup.toFixed(2)}x`],
        ],
      );

      // Incremental should be faster than full when changing < 100%
      expect(incrDuration).toBeLessThan(fullDuration);
    }, 30_000);
  }
});
