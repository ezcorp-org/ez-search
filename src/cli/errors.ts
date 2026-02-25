/**
 * CLI error formatting — converts EzSearchError to formatted output + exit.
 *
 * JSON errors go to stdout (same channel as normal output for agent parsing).
 * Text errors go to stderr.
 */

import { EzSearchError } from '../errors.js';

export type { ErrorCode } from '../errors.js';
export { EzSearchError };

export interface StructuredError {
  error: true;
  code: string;
  message: string;
  suggestion: string;
}

/**
 * Emit a structured error and exit the process.
 * Used by CLI commands only — library functions throw EzSearchError instead.
 */
export function emitError(
  opts: { code: string; message: string; suggestion: string },
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
