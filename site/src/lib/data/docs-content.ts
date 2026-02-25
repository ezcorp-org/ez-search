// Documents @ez-corp/ez-search v1.2.0 — update when API changes

// ── Sidebar ─────────────────────────────────────────────────────────────────

export interface SidebarGroup {
  title: string;
  items: { id: string; title: string }[];
}

export const sidebarSections: SidebarGroup[] = [
  {
    title: 'Getting Started',
    items: [
      { id: 'installation', title: 'Installation' },
      { id: 'quick-start', title: 'Quick Start' },
    ],
  },
  {
    title: 'CLI Reference',
    items: [
      { id: 'cli-index', title: 'ez-search index' },
      { id: 'cli-query', title: 'ez-search query' },
      { id: 'cli-status', title: 'ez-search status' },
    ],
  },
  {
    title: 'Library API',
    items: [
      { id: 'api-index', title: 'index()' },
      { id: 'api-query', title: 'query()' },
      { id: 'api-status', title: 'status()' },
      { id: 'error-handling', title: 'Error Handling' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { id: 'types', title: 'Types' },
      { id: 'file-types', title: 'Supported File Types' },
      { id: 'storage', title: 'Storage' },
    ],
  },
];

// ── CLI Commands ────────────────────────────────────────────────────────────

export interface CliFlag {
  flag: string;
  alias?: string;
  description: string;
  default?: string;
}

export interface CliCommand {
  name: string;
  signature: string;
  description: string;
  flags: CliFlag[];
  examples: { label: string; code: string }[];
}

export const cliCommands: CliCommand[] = [
  {
    name: 'index',
    signature: 'ez-search index <path>',
    description: 'Index a directory for semantic search. Scans files, splits them into chunks, and generates embeddings stored locally in .ez-search/.',
    flags: [
      { flag: '--no-ignore', description: 'Disable .gitignore and .cursorignore filtering' },
      { flag: '--type <type>', description: 'Filter files by type: code | text | image' },
      { flag: '--quiet', alias: '-q', description: 'Suppress status output' },
      { flag: '--clear', description: 'Remove existing index before indexing' },
      { flag: '--format <mode>', description: 'Output format: json (default) or text', default: 'json' },
    ],
    examples: [
      { label: 'Index the current directory', code: 'ez-search index .' },
      { label: 'Index only code files', code: 'ez-search index . --type code' },
      { label: 'Fresh re-index with quiet output', code: 'ez-search index . --clear -q' },
    ],
  },
  {
    name: 'query',
    signature: 'ez-search query <text>',
    description: 'Search the index with a natural language query. Returns ranked results grouped by type (code, text, image).',
    flags: [
      { flag: '--top-k <n>', alias: '-k', description: 'Number of results to return', default: '10' },
      { flag: '--dir <path>', description: 'Scope search to a subdirectory' },
      { flag: '--threshold <score>', description: 'Minimum relevance score (0-1) to include' },
      { flag: '--type <type>', description: 'Search specific type only: code | text | image' },
      { flag: '--no-auto-index', description: 'Disable automatic indexing when no index exists' },
      { flag: '--format <mode>', description: 'Output format: json (default) or text', default: 'json' },
    ],
    examples: [
      { label: 'Search for authentication logic', code: 'ez-search query "authentication logic"' },
      { label: 'Top 5 code results in src/', code: 'ez-search query "error handling" --type code -k 5 --dir src' },
      { label: 'High-confidence results only', code: 'ez-search query "database connection" --threshold 0.7' },
    ],
  },
  {
    name: 'status',
    signature: 'ez-search status',
    description: 'Show indexing status for the current directory, including file counts, staleness, and per-type breakdown.',
    flags: [
      { flag: '--no-ignore', description: 'Disable .gitignore and .cursorignore filtering' },
      { flag: '--format <mode>', description: 'Output format: json (default) or text', default: 'json' },
    ],
    examples: [
      { label: 'Check index status', code: 'ez-search status' },
      { label: 'Status as text', code: 'ez-search status --format text' },
    ],
  },
];

// ── Library Functions ───────────────────────────────────────────────────────

export interface LibParam {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export interface LibFunction {
  name: string;
  signature: string;
  description: string;
  params: LibParam[];
  returnType: string;
  returnDescription: string;
  examples: { label: string; code: string }[];
}

export const libraryFunctions: LibFunction[] = [
  {
    name: 'index',
    signature: `async function index(
  targetPath: string,
  options?: IndexOptions
): Promise<IndexStats>`,
    description: 'Index a directory for semantic search. Returns statistics about what was scanned, indexed, and stored.',
    params: [
      { name: 'targetPath', type: 'string', description: 'Directory to index', required: true },
      { name: 'options.ignore', type: 'boolean', description: 'Respect .gitignore (default: true)', required: false },
      { name: 'options.type', type: "'code' | 'text' | 'image'", description: 'Filter by file type', required: false },
      { name: 'options.clear', type: 'boolean', description: 'Wipe existing index before indexing', required: false },
    ],
    returnType: 'Promise<IndexStats>',
    returnDescription: 'Statistics about indexed files, chunks created/reused, and duration.',
    examples: [
      {
        label: 'Basic indexing',
        code: `import { index } from '@ez-corp/ez-search';

const stats = await index('/path/to/project');
console.log(\`Indexed \${stats.filesIndexed} files in \${stats.durationMs}ms\`);`,
      },
      {
        label: 'Index only code files with fresh start',
        code: `const stats = await index('.', { type: 'code', clear: true });`,
      },
    ],
  },
  {
    name: 'query',
    signature: `async function query(
  text: string,
  options?: QueryOptions
): Promise<QueryResult>`,
    description: 'Search the index with a natural language query. Returns grouped results with code, text, and image arrays.',
    params: [
      { name: 'text', type: 'string', description: 'Natural language search query', required: true },
      { name: 'options.projectDir', type: 'string', description: 'Project directory (default: cwd)', required: false },
      { name: 'options.topK', type: 'number', description: 'Results per type (default: 10)', required: false },
      { name: 'options.dir', type: 'string', description: 'Scope to a subdirectory', required: false },
      { name: 'options.threshold', type: 'number', description: 'Minimum relevance 0-1', required: false },
      { name: 'options.type', type: "'code' | 'text' | 'image'", description: 'Search specific type only', required: false },
      { name: 'options.autoIndex', type: 'boolean', description: 'Auto-index if missing (default: true)', required: false },
    ],
    returnType: 'Promise<QueryResult>',
    returnDescription: 'Results grouped by type, with scores and file locations.',
    examples: [
      {
        label: 'Search and display code results',
        code: `import { query } from '@ez-corp/ez-search';

const results = await query('authentication logic', {
  projectDir: '/path/to/project',
  topK: 5,
});

for (const match of results.code) {
  console.log(\`\${match.file}:\${match.lines.start}-\${match.lines.end} (score: \${match.score})\`);
}`,
      },
      {
        label: 'Search with threshold filter',
        code: `const results = await query('database connection', {
  threshold: 0.7,
  type: 'code',
});`,
      },
    ],
  },
  {
    name: 'status',
    signature: `async function status(
  options?: StatusOptions
): Promise<StatusResult>`,
    description: 'Get indexing status for a project directory. Returns file/chunk counts, staleness info, and per-type breakdown.',
    params: [
      { name: 'options.projectDir', type: 'string', description: 'Project directory (default: cwd)', required: false },
      { name: 'options.ignore', type: 'boolean', description: 'Respect .gitignore (default: true)', required: false },
    ],
    returnType: 'Promise<StatusResult>',
    returnDescription: 'Index status with file counts, storage size, and type breakdown.',
    examples: [
      {
        label: 'Check index health',
        code: `import { status } from '@ez-corp/ez-search';

const info = await status({ projectDir: '/path/to/project' });
console.log(\`\${info.fileCount} files, \${info.chunkCount} chunks\`);
console.log(\`Last indexed: \${info.lastIndexed}\`);

if (info.staleFileCount > 0) {
  console.warn(\`\${info.staleFileCount} files have changed since last index\`);
}`,
      },
    ],
  },
];

// ── Type Definitions ────────────────────────────────────────────────────────

export interface TypeDef {
  name: string;
  code: string;
}

export const typeDefinitions: TypeDef[] = [
  {
    name: 'IndexStats',
    code: `interface IndexStats {
  status: string;
  path: string;
  filesScanned: number;
  filesIndexed: number;
  filesSkipped: number;
  chunksCreated: number;
  chunksReused: number;
  chunksRemoved: number;
  durationMs: number;
  storageDir: string;
}`,
  },
  {
    name: 'IndexOptions',
    code: `interface IndexOptions {
  ignore?: boolean;
  type?: 'code' | 'text' | 'image';
  clear?: boolean;
}`,
  },
  {
    name: 'QueryResult',
    code: `interface QueryResult {
  query: string;
  totalIndexed: number;
  searchScope: string;
  indexing?: { status: string; filesIndexed: number; durationMs: number };
  stale?: boolean;
  staleFileCount?: number;
  code: CodeQueryResult[];
  text: TextQueryResult[];
  image: ImageQueryResult[];
}`,
  },
  {
    name: 'CodeQueryResult',
    code: `interface CodeQueryResult {
  file: string;
  lines: { start: number; end: number };
  score: number;
  text: string;
}`,
  },
  {
    name: 'TextQueryResult',
    code: `interface TextQueryResult {
  file: string;
  score: number;
  text: string;
}`,
  },
  {
    name: 'ImageQueryResult',
    code: `interface ImageQueryResult {
  file: string;
  score: number;
}`,
  },
  {
    name: 'QueryOptions',
    code: `interface QueryOptions {
  projectDir?: string;
  topK?: number;
  dir?: string;
  threshold?: number;
  type?: 'code' | 'text' | 'image';
  autoIndex?: boolean;
}`,
  },
  {
    name: 'StatusResult',
    code: `interface StatusResult {
  fileCount: number;
  chunkCount: number;
  lastIndexed: string;
  modelTypes: string[];
  indexSizeBytes: number;
  storagePath: string;
  staleFileCount: number;
  byType: Record<'code' | 'text' | 'image', TypeBreakdown>;
  warning?: string;
  suggestion?: string;
}`,
  },
  {
    name: 'TypeBreakdown',
    code: `interface TypeBreakdown {
  files: number;
  chunks: number;
}`,
  },
  {
    name: 'StatusOptions',
    code: `interface StatusOptions {
  projectDir?: string;
  ignore?: boolean;
}`,
  },
  {
    name: 'EzSearchError',
    code: `class EzSearchError extends Error {
  readonly code: ErrorCode;
  readonly suggestion: string;

  constructor(code: ErrorCode, message: string, suggestion: string);
}`,
  },
  {
    name: 'ErrorCode',
    code: `type ErrorCode =
  | 'NO_INDEX'
  | 'EMPTY_DIR'
  | 'UNSUPPORTED_TYPE'
  | 'CORRUPT_MANIFEST'
  | 'GENERAL_ERROR';`,
  },
  {
    name: 'FileType',
    code: `type FileType = 'code' | 'text' | 'image';`,
  },
];

// ── Error Codes Table ───────────────────────────────────────────────────────

export interface ErrorCodeEntry {
  code: string;
  meaning: string;
  suggestion: string;
}

export const errorCodes: ErrorCodeEntry[] = [
  { code: 'NO_INDEX', meaning: 'No index found for the project', suggestion: 'Run index() or ez-search index first' },
  { code: 'EMPTY_DIR', meaning: 'No supported files found in directory', suggestion: 'Check the path and file extensions' },
  { code: 'UNSUPPORTED_TYPE', meaning: 'Invalid file type filter', suggestion: 'Use "code", "text", or "image"' },
  { code: 'CORRUPT_MANIFEST', meaning: 'Index manifest exists but data is missing', suggestion: 'Re-index with --clear flag' },
  { code: 'GENERAL_ERROR', meaning: 'Unexpected error during operation', suggestion: 'Check the error message for details' },
];

// ── File Types Table ────────────────────────────────────────────────────────

export interface FileTypeGroup {
  type: string;
  extensions: string[];
}

export const fileTypeGroups: FileTypeGroup[] = [
  {
    type: 'Code',
    extensions: [
      '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
      '.c', '.cpp', '.h', '.hpp', '.rb', '.php', '.swift', '.kt',
      '.scala', '.sh', '.bash', '.zsh', '.css', '.scss', '.html',
      '.json', '.yaml', '.yml', '.toml',
    ],
  },
  {
    type: 'Text',
    extensions: ['.md', '.mdx', '.txt', '.rst', '.csv', '.pdf'],
  },
  {
    type: 'Image',
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
  },
];

// ── Static Content ──────────────────────────────────────────────────────────

export const quickStartSteps = [
  { step: 1, label: 'Install', code: 'npm install -g @ez-corp/ez-search' },
  { step: 2, label: 'Index', code: 'ez-search index .' },
  { step: 3, label: 'Search', code: 'ez-search query "authentication logic"' },
];

export const storageContent = {
  title: 'Storage',
  description: 'ez-search stores all index data locally in a .ez-search/ directory at the root of your project.',
  structure: `.ez-search/
├── manifest.json    # File metadata and hashes
├── code.bin         # Code embedding vectors
├── text.bin         # Text embedding vectors
└── image.bin        # Image embedding vectors`,
  notes: [
    'Add .ez-search/ to your .gitignore — it should not be committed.',
    'Delete .ez-search/ to remove all index data. Re-run ez-search index to rebuild.',
    'Index data is machine-local. Embeddings are not portable across different machines.',
  ],
};

export const errorHandlingExample = `import { index, EzSearchError } from '@ez-corp/ez-search';

try {
  await index('/path/to/project');
} catch (err) {
  if (err instanceof EzSearchError) {
    console.error(\`[\${err.code}] \${err.message}\`);
    console.error(\`Suggestion: \${err.suggestion}\`);
  } else {
    throw err;
  }
}`;

export const builtInExclusions = [
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  '.cache', 'coverage', '.nyc_output', '*.lock', '.DS_Store',
  'Thumbs.db', '*.min.js', '*.min.css', '*.map', '.ez-search',
];
