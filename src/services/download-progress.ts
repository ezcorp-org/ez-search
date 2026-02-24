/**
 * Default progress callback for Transformers.js model downloads.
 *
 * Transformers.js fires download/progress events even for cached models, so we
 * check the cache directory to decide the label:
 *   - Cache miss → "Downloading <model> — <file> XX%" (TTY) or single line (non-TTY)
 *   - Cache hit  → "Loading <model>..." (TTY only, silent in non-TTY)
 *
 * TTY mode uses \r + ANSI clear for in-place updates.
 * Non-TTY mode prints a single line per download to avoid noise.
 */

import * as fs from 'fs';
import * as path from 'path';
import { resolveModelCachePath } from '../config/paths.js';

function isModelCached(modelId: string): boolean {
  const modelDir = path.join(resolveModelCachePath(), ...modelId.split('/'));
  try {
    return fs.statSync(modelDir).isDirectory();
  } catch {
    return false;
  }
}

export function createDownloadProgressCallback(modelId: string): (progress: unknown) => void {
  const isTTY = !!process.stderr.isTTY;
  const cached = isModelCached(modelId);

  // Cached models: brief loading indicator (TTY only — no noise for pipes)
  if (cached) {
    if (!isTTY) return () => {};
    let shown = false;
    return (event: unknown) => {
      if (!event || typeof event !== 'object') return;
      const e = event as { status?: string };
      if (!shown && e.status === 'initiate') {
        shown = true;
        process.stderr.write(`\r\x1b[KLoading ${modelId}...`);
      }
      if (e.status === 'ready') {
        process.stderr.write('\r\x1b[K');
      }
    };
  }

  // Uncached models: show download progress
  if (isTTY) {
    const downloading = new Set<string>();
    return (event: unknown) => {
      if (!event || typeof event !== 'object') return;
      const e = event as { status?: string; file?: string; progress?: number };
      if (e.status === 'download' && e.file) {
        if (!downloading.has(e.file)) {
          downloading.add(e.file);
          process.stderr.write(`\r\x1b[KDownloading ${modelId} — ${e.file}...`);
        } else if (typeof e.progress === 'number') {
          process.stderr.write(`\r\x1b[KDownloading ${modelId} — ${e.file} ${Math.round(e.progress)}%`);
        }
      } else if (e.status === 'done' && e.file) {
        downloading.delete(e.file);
      }
      if (e.status === 'ready') {
        process.stderr.write('\r\x1b[K');
      }
    };
  }

  // Non-TTY: single log line per model download (no ANSI, no overwriting)
  let announced = false;
  return (event: unknown) => {
    if (!event || typeof event !== 'object') return;
    const e = event as { status?: string };
    if (!announced && e.status === 'download') {
      announced = true;
      process.stderr.write(`Downloading ${modelId}...\n`);
    }
    if (e.status === 'ready') {
      process.stderr.write(`Loaded ${modelId}\n`);
    }
  };
}
