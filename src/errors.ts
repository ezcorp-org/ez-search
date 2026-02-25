/**
 * Library error class for programmatic use.
 *
 * Thrown by library functions instead of calling process.exit().
 * CLI catches these and converts to formatted output + exit codes.
 */

export type ErrorCode =
  | 'NO_INDEX'
  | 'EMPTY_DIR'
  | 'UNSUPPORTED_TYPE'
  | 'CORRUPT_MANIFEST'
  | 'GENERAL_ERROR';

export class EzSearchError extends Error {
  readonly code: ErrorCode;
  readonly suggestion: string;

  constructor(code: ErrorCode, message: string, suggestion: string) {
    super(message);
    this.name = 'EzSearchError';
    this.code = code;
    this.suggestion = suggestion;
  }
}
