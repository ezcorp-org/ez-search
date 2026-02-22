/**
 * Shared staleness calculator — counts files that are new, modified, or deleted
 * relative to the manifest.
 */

import { existsSync } from 'fs';
import * as path from 'path';
import type { Manifest } from './manifest-cache.js';

/**
 * Count stale files: new files not in manifest, modified files, and deleted files.
 */
export async function calcStaleness(
  projectDir: string,
  manifest: Manifest,
  useIgnoreFiles: boolean,
): Promise<number> {
  const { scanFiles } = await import('./file-scanner.js');

  const scannedFiles = new Map<string, { mtimeMs: number }>();
  for await (const file of scanFiles(projectDir, { useIgnoreFiles })) {
    scannedFiles.set(file.relativePath, { mtimeMs: file.mtimeMs });
  }

  let stale = 0;

  // New or modified files
  for (const [relPath, scanned] of scannedFiles) {
    const entry = manifest.files[relPath];
    if (!entry) {
      // New file not in manifest
      stale++;
    } else if (entry.mtime !== scanned.mtimeMs) {
      // mtime differs → potentially modified
      stale++;
    }
  }

  // Deleted files (in manifest but no longer on disk)
  for (const relPath of Object.keys(manifest.files)) {
    if (!existsSync(path.join(projectDir, relPath))) {
      stale++;
    }
  }

  return stale;
}
