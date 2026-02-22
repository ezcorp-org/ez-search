/**
 * Status command — shows index state for the current directory.
 *
 * Outputs:
 *   JSON (default): { fileCount, chunkCount, lastIndexed, modelTypes, indexSizeBytes,
 *                     storagePath, staleFileCount, byType }
 *   Text (--format text): compact human-readable summary
 *
 * Error exits:
 *   code 2 — NO_INDEX: no manifest in current directory
 *   code 1 — CORRUPT_MANIFEST: manifest exists but vector storage is missing
 */

import * as path from 'path';
import * as fsp from 'fs/promises';
import { existsSync, statSync } from 'fs';
import { emitError } from '../errors.js';
import { calcStaleness } from '../../services/staleness.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Format bytes into a human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Recursively sum the size of all files in a directory.
 * Returns 0 if the directory doesn't exist or on any error.
 */
async function calcDirSize(dir: string): Promise<number> {
  try {
    if (!existsSync(dir)) return 0;
    const entries = await fsp.readdir(dir, { recursive: true, withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      if (entry.isFile()) {
        try {
          const fullPath = path.join((entry as unknown as { parentPath: string }).parentPath ?? dir, entry.name);
          const stat = await fsp.stat(fullPath);
          total += stat.size;
        } catch {
          // Skip unreadable files
        }
      }
    }
    return total;
  } catch {
    return 0;
  }
}

// ── Main command ───────────────────────────────────────────────────────────────

export async function runStatus(options: { format?: string; ignore?: boolean } = {}): Promise<void> {
  const format = options.format === 'text' ? 'text' : 'json';
  const useIgnoreFiles = options.ignore !== false; // default true; --no-ignore sets false

  const projectDir = process.cwd();

  // 1. Check manifest exists
  const { resolveProjectStoragePath } = await import('../../config/paths.js');
  const { MANIFEST_FILENAME, loadManifest } = await import('../../services/manifest-cache.js');
  const manifestPath = path.join(resolveProjectStoragePath(projectDir), MANIFEST_FILENAME);

  if (!existsSync(manifestPath)) {
    emitError(
      {
        code: 'NO_INDEX',
        message: 'No index found in current directory',
        suggestion: 'Run: ez-search index .',
      },
      format,
      2
    );
  }

  // 2. Load manifest
  const manifest = loadManifest(projectDir);

  // Detect corruption: file exists but parsed manifest has no entries and file is non-trivial
  let warning: string | undefined;
  let warningSuggestion: string | undefined;

  const manifestStat = statSync(manifestPath);
  if (Object.keys(manifest.files).length === 0 && manifestStat.size > 10) {
    warning = 'Manifest appears corrupt or version-mismatched. Reported data may be incomplete.';
    warningSuggestion = 'Run: ez-search index --clear .';
  }

  // 3. Get lastIndexed from manifest file mtime
  const lastIndexed = new Date(manifestStat.mtimeMs).toISOString();

  // 4. Per-type counts
  const { EXTENSION_MAP } = await import('../../types.js');

  type TypeKey = 'code' | 'text' | 'image';
  const byType: Record<TypeKey, { files: number; chunks: number }> = {
    code: { files: 0, chunks: 0 },
    text: { files: 0, chunks: 0 },
    image: { files: 0, chunks: 0 },
  };

  let totalChunkCount = 0;

  for (const [relPath, entry] of Object.entries(manifest.files)) {
    const ext = path.extname(relPath).toLowerCase();
    const fileType = EXTENSION_MAP[ext] as TypeKey | undefined;
    if (fileType && fileType in byType) {
      byType[fileType].files++;
      byType[fileType].chunks += entry.chunks.length;
    }
    totalChunkCount += entry.chunks.length;
  }

  const fileCount = Object.keys(manifest.files).length;
  const chunkCount = totalChunkCount;

  // Derive modelTypes from non-zero types
  const modelTypes: TypeKey[] = (['code', 'text', 'image'] as TypeKey[]).filter(
    (t) => byType[t].files > 0
  );

  // 5. Resolve storage path and check it exists
  const storagePath = resolveProjectStoragePath(projectDir);

  if (!existsSync(storagePath) && !warning) {
    // Manifest exists but vector storage is missing — corrupt state
    emitError(
      {
        code: 'CORRUPT_MANIFEST',
        message: 'Manifest exists but vector storage is missing',
        suggestion: 'Run: ez-search index --clear .',
      },
      format,
      1
    );
  }

  // 6. Calculate index size
  const indexSizeBytes = await calcDirSize(storagePath);

  // 7. Calculate staleness
  const staleFileCount = await calcStaleness(projectDir, manifest, useIgnoreFiles);

  // 8. Output
  if (format === 'text') {
    const lines: string[] = [
      `Index: ${storagePath}`,
      `Files: ${fileCount} (code: ${byType.code.files}, text: ${byType.text.files}, image: ${byType.image.files})`,
      `Chunks: ${chunkCount}`,
      `Last indexed: ${lastIndexed}`,
      `Index size: ${formatBytes(indexSizeBytes)}`,
      `Stale files: ${staleFileCount}`,
    ];
    if (warning) {
      lines.push(`Warning: ${warning}`);
    }
    console.log(lines.join('\n'));
  } else {
    const output: Record<string, unknown> = {
      fileCount,
      chunkCount,
      lastIndexed,
      modelTypes,
      indexSizeBytes,
      storagePath,
      staleFileCount,
      byType,
    };
    if (warning) {
      output['warning'] = warning;
      output['suggestion'] = warningSuggestion;
    }
    console.log(JSON.stringify(output));
  }
}
