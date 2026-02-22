import { describe, test, expect, spyOn, beforeEach, afterEach } from 'bun:test';
import { emitError, type ErrorCode } from '../../src/cli/errors';

class ExitError extends Error {
  code: number;
  constructor(code: number) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}

describe('emitError', () => {
  let exitSpy: ReturnType<typeof spyOn>;
  let stdoutSpy: ReturnType<typeof spyOn>;
  let stderrSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    exitSpy = spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new ExitError(code ?? 1);
    });
    stdoutSpy = spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  test('JSON format writes structured JSON to stdout', () => {
    try {
      emitError({ code: 'NO_INDEX', message: 'No index found', suggestion: 'Run index first' }, 'json');
    } catch (_) {}

    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const written = (stdoutSpy.mock.calls[0] as string[])[0];
    const parsed = JSON.parse(written.trim());
    expect(parsed).toEqual({
      error: true,
      code: 'NO_INDEX',
      message: 'No index found',
      suggestion: 'Run index first',
    });
  });

  test('text format writes human-readable to stderr', () => {
    try {
      emitError({ code: 'EMPTY_DIR', message: 'Directory is empty', suggestion: 'Add files' }, 'text');
    } catch (_) {}

    expect(stderrSpy).toHaveBeenCalledTimes(1);
    const written = (stderrSpy.mock.calls[0] as string[])[0];
    expect(written).toContain('Directory is empty');
    expect(written).toContain('Add files');
  });

  test('default exit code is 1', () => {
    try {
      emitError({ code: 'GENERAL_ERROR', message: 'fail', suggestion: 'retry' }, 'json');
    } catch (e) {
      expect((e as ExitError).code).toBe(1);
    }
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  test('custom exit code is respected', () => {
    try {
      emitError({ code: 'GENERAL_ERROR', message: 'fail', suggestion: 'retry' }, 'json', 2);
    } catch (e) {
      expect((e as ExitError).code).toBe(2);
    }
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  test.each([
    'NO_INDEX',
    'EMPTY_DIR',
    'UNSUPPORTED_TYPE',
    'CORRUPT_MANIFEST',
    'GENERAL_ERROR',
  ] as ErrorCode[])('error code %s works in JSON format', (code) => {
    try {
      emitError({ code, message: `msg-${code}`, suggestion: `sug-${code}` }, 'json');
    } catch (_) {}

    const written = (stdoutSpy.mock.calls[0] as string[])[0];
    const parsed = JSON.parse(written.trim());
    expect(parsed.code).toBe(code);
    expect(parsed.error).toBe(true);
  });
});
