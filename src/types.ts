export type FileType = 'code' | 'text' | 'image';

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  type: FileType;
  sizeBytes: number;
  mtimeMs: number;
}

export interface ScanOptions {
  useIgnoreFiles: boolean;
  typeFilter?: FileType;
}

export type ModelBackend = 'webgpu' | 'cpu';

export type CollectionName = 'col-768' | 'col-512';

export const EXTENSION_MAP: Record<string, FileType> = {
  // Code
  '.ts': 'code',
  '.tsx': 'code',
  '.js': 'code',
  '.jsx': 'code',
  '.py': 'code',
  '.go': 'code',
  '.rs': 'code',
  '.java': 'code',
  '.c': 'code',
  '.cpp': 'code',
  '.h': 'code',
  '.hpp': 'code',
  '.rb': 'code',
  '.php': 'code',
  '.swift': 'code',
  '.kt': 'code',
  '.scala': 'code',
  '.sh': 'code',
  '.bash': 'code',
  '.zsh': 'code',
  '.css': 'code',
  '.scss': 'code',
  '.html': 'code',
  // Text
  '.md': 'text',
  '.mdx': 'text',
  '.txt': 'text',
  '.rst': 'text',
  // Image
  '.jpg': 'image',
  '.jpeg': 'image',
  '.png': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.svg': 'image',
};

export const BUILTIN_EXCLUSIONS: string[] = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.cache',
  'coverage',
  '.nyc_output',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  '.DS_Store',
  'Thumbs.db',
  '*.min.js',
  '*.min.css',
  '*.map',
  '.ez-search',
];
