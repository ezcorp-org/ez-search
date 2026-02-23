/**
 * Shared structured error utility for all CLI commands.
 *
 * JSON errors go to stdout (same channel as normal output for agent parsing).
 * Text errors go to stderr.
 */

export type ErrorCode =
  | 'NO_INDEX'
  | 'EMPTY_DIR'
  | 'UNSUPPORTED_TYPE'
  | 'CORRUPT_MANIFEST'
  | 'GENERAL_ERROR';

export interface StructuredError {
  error: true;
  code: ErrorCode;
  message: string;
  suggestion: string;
}

/**
 * Emit a structured error and exit the process.
 *
 * @param opts      - Error details
 * @param format    - 'json' writes structured JSON to stdout; 'text' writes human-readable to stderr
 * @param exitCode  - Exit code (defaults to 1)
 * @returns never   - Control flow ends here
 */
export function emitError(
  opts: { code: ErrorCode; message: string; suggestion: string },
  format: 'json' | 'text',
  exitCode = 1
): never {
  const { code, message, suggestion } = opts;

  if (format === 'text') {
    process.stderr.write(`Error: ${message}. Try: ${suggestion}\n`);
  } else {
    const structured: StructuredError = { error: true, code, message, suggestion };
    process.stdout.write(JSON.stringify(structured) + '\n');
  }

  process.exit(exitCode);
}
