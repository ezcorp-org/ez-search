/**
 * @ez-corp/ez-search — Programmatic API
 *
 * ESM-only. Requires Node >= 20.
 *
 * Exposes the same functionality as the CLI for use as a library:
 *
 *   import { index, query, status } from '@ez-corp/ez-search';
 *
 *   const stats = await index('/path/to/project');
 *   const results = await query('authentication logic', { projectDir: '/path/to/project' });
 *   const info = await status({ projectDir: '/path/to/project' });
 *
 * Library functions:
 *   - Return structured data (never write to stdout)
 *   - Throw EzSearchError on failure (never call process.exit)
 *   - Accept explicit projectDir (default: process.cwd())
 */

export { EzSearchError } from './errors.js';
export type { ErrorCode } from './errors.js';
export type { IndexStats } from './cli/commands/index-cmd.js';
export type { QueryResult, CodeQueryResult, TextQueryResult, ImageQueryResult } from './cli/commands/query-cmd.js';
export type { StatusResult, TypeBreakdown } from './cli/commands/status-cmd.js';
export type { FileType, SearchMode } from './types.js';

// ── index() ──────────────────────────────────────────────────────────────────

export interface IndexOptions {
  /** Respect .gitignore and .cursorignore (default: true) */
  ignore?: boolean;
  /** Filter by file type */
  type?: 'code' | 'text' | 'image';
  /** Wipe existing index before indexing */
  clear?: boolean;
}

/**
 * Index a directory for semantic search.
 *
 * @param targetPath - Directory to index
 * @param options    - Indexing options
 * @returns Index statistics
 * @throws {EzSearchError} EMPTY_DIR if no supported files found
 */
export async function index(
  targetPath: string,
  options: IndexOptions = {}
): Promise<import('./cli/commands/index-cmd.js').IndexStats> {
  const { runIndex } = await import('./cli/commands/index-cmd.js');
  return runIndex(targetPath, {
    ignore: options.ignore !== false,
    type: options.type,
    clear: options.clear,
    _silent: true,
  });
}

// ── query() ──────────────────────────────────────────────────────────────────

export interface QueryOptions {
  /** Project directory to search (default: process.cwd()) */
  projectDir?: string;
  /** Number of results per type (default: 10) */
  topK?: number;
  /** Scope search to a subdirectory */
  dir?: string;
  /** Minimum relevance score 0-1 */
  threshold?: number;
  /** Search specific type only */
  type?: 'code' | 'text' | 'image';
  /** Search mode: hybrid (default), semantic, or keyword */
  mode?: 'hybrid' | 'semantic' | 'keyword';
  /** Auto-index if no index exists (default: true) */
  autoIndex?: boolean;
}

/**
 * Search the index with a natural language query.
 *
 * @param text    - Search query text
 * @param options - Query options
 * @returns Grouped results with code, text, and image arrays
 * @throws {EzSearchError} NO_INDEX if no index and autoIndex is false
 */
export async function query(
  text: string,
  options: QueryOptions = {}
): Promise<import('./cli/commands/query-cmd.js').QueryResult> {
  const { runQuery } = await import('./cli/commands/query-cmd.js');
  return runQuery(text, {
    topK: String(options.topK ?? 10),
    dir: options.dir,
    threshold: options.threshold !== undefined ? String(options.threshold) : undefined,
    type: options.type,
    mode: options.mode,
    autoIndex: options.autoIndex,
    _silent: true,
    _projectDir: options.projectDir,
  });
}

// ── status() ─────────────────────────────────────────────────────────────────

export interface StatusOptions {
  /** Project directory (default: process.cwd()) */
  projectDir?: string;
  /** Respect .gitignore and .cursorignore (default: true) */
  ignore?: boolean;
}

/**
 * Get indexing status for a project directory.
 *
 * @param options - Status options
 * @returns Index status including file counts, staleness, and per-type breakdown
 * @throws {EzSearchError} NO_INDEX if no index found
 * @throws {EzSearchError} CORRUPT_MANIFEST if manifest exists but vector storage missing
 */
export async function status(
  options: StatusOptions = {}
): Promise<import('./cli/commands/status-cmd.js').StatusResult> {
  const { runStatus } = await import('./cli/commands/status-cmd.js');
  return runStatus({
    ignore: options.ignore,
    _silent: true,
    _projectDir: options.projectDir,
  });
}
