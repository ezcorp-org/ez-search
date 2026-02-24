/**
 * Default progress callback for Transformers.js model downloads.
 *
 * Transformers.js fires download/progress events even for cached models, so we
 * check the cache directory to decide the label:
 *   - Cache miss → "Downloading <model> — <file> XX%"
 *   - Cache hit  → "Loading <model>..."
 *
 * Output goes to stderr and only when running in a TTY.
 */

import * as fs from 'fs';
import * as path from 'path';
import { resolveModelCachePath } from '../config/paths.js';

function isModelCached(modelId: string): boolean {
  // Transformers.js stores models under <cacheDir>/<org>/<repo>/
  // e.g. ~/.ez-search/models/onnx-community/Qwen3-Embedding-0.6B-ONNX/
  const modelDir = path.join(resolveModelCachePath(), ...modelId.split('/'));
  try {
    return fs.statSync(modelDir).isDirectory();
  } catch {
    return false;
  }
}

export function createDownloadProgressCallback(modelId: string): (progress: unknown) => void {
  const isTTY = !!process.stderr.isTTY;
  if (!isTTY) return () => {};

  const cached = isModelCached(modelId);

  // For cached models, show a single "Loading..." and clear on ready
  if (cached) {
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

  // For uncached models, show per-file download progress
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
