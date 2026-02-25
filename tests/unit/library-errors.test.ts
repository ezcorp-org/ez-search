/**
 * Library API — error handling tests.
 *
 * Verifies that library functions throw EzSearchError (not process.exit)
 * with correct error codes for known error conditions.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createTempDir, cleanupTempDir } from '../helpers/fixtures.js';

describe('Library error handling', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('index() throws EzSearchError for empty directory', async () => {
    const { index, EzSearchError } = await import('../../src/index.js');
    try {
      await index(tmpDir);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(EzSearchError);
      // EMPTY_DIR when vector DB is available; GENERAL_ERROR if zvec binary missing
      const code = (err as InstanceType<typeof EzSearchError>).code;
      expect(['EMPTY_DIR', 'GENERAL_ERROR']).toContain(code);
    }
  });

  test('status() throws EzSearchError with NO_INDEX for unindexed directory', async () => {
    const { status, EzSearchError } = await import('../../src/index.js');
    try {
      await status({ projectDir: tmpDir });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(EzSearchError);
      expect((err as InstanceType<typeof EzSearchError>).code).toBe('NO_INDEX');
    }
  });

  test('query() throws EzSearchError with NO_INDEX when autoIndex is false', async () => {
    const { query, EzSearchError } = await import('../../src/index.js');
    try {
      await query('test query', { projectDir: tmpDir, autoIndex: false });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(EzSearchError);
      expect((err as InstanceType<typeof EzSearchError>).code).toBe('NO_INDEX');
    }
  });

  test('library functions do not call process.exit', async () => {
    const { status, EzSearchError } = await import('../../src/index.js');

    // Spy on process.exit to ensure library functions throw instead of exiting
    const originalExit = process.exit;
    let exitCalled = false;
    process.exit = (() => {
      exitCalled = true;
    }) as never;

    try {
      await status({ projectDir: tmpDir });
    } catch {
      // Expected to throw
    } finally {
      process.exit = originalExit;
    }

    expect(exitCalled).toBe(false);
  });

  test('library functions do not write to stdout on error', async () => {
    const { status } = await import('../../src/index.js');

    const originalWrite = process.stdout.write;
    let stdoutWritten = false;
    process.stdout.write = ((...args: unknown[]) => {
      stdoutWritten = true;
      return true;
    }) as typeof process.stdout.write;

    try {
      await status({ projectDir: tmpDir });
    } catch {
      // Expected to throw
    } finally {
      process.stdout.write = originalWrite;
    }

    expect(stdoutWritten).toBe(false);
  });
});
