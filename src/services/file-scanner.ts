import { readFileSync, existsSync } from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import ignore, { type Ignore } from 'ignore';
import {
  type ScannedFile,
  type ScanOptions,
  EXTENSION_MAP,
  BUILTIN_EXCLUSIONS,
} from '../types.js';

export async function* scanFiles(
  rootDir: string,
  opts: ScanOptions,
): AsyncGenerator<ScannedFile> {
  const absRoot = path.resolve(rootDir);
  const ig = ignore();

  // Built-in exclusions are always active
  ig.add(BUILTIN_EXCLUSIONS);

  if (opts.useIgnoreFiles) {
    for (const ignoreFile of ['.gitignore', '.cursorignore']) {
      const ignoreFilePath = path.join(absRoot, ignoreFile);
      if (existsSync(ignoreFilePath)) {
        const contents = readFileSync(ignoreFilePath, 'utf8');
        ig.add(contents);
      }
    }
  }

  yield* walkDir(absRoot, absRoot, ig, opts);
}

async function* walkDir(
  dir: string,
  rootDir: string,
  ig: Ignore,
  opts: ScanOptions,
): AsyncGenerator<ScannedFile> {
  const dirHandle = await fsp.opendir(dir);

  for await (const entry of dirHandle) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(rootDir, fullPath);

    // Skip symlinks entirely
    if (entry.isSymbolicLink()) {
      continue;
    }

    if (entry.isDirectory()) {
      // Check both with and without trailing slash (gitignore semantics)
      if (ig.ignores(relPath + '/') || ig.ignores(relPath)) {
        continue;
      }
      yield* walkDir(fullPath, rootDir, ig, opts);
    } else if (entry.isFile()) {
      if (ig.ignores(relPath)) {
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      const fileType = EXTENSION_MAP[ext];

      // Skip unknown extensions
      if (!fileType) {
        continue;
      }

      // Apply type filter if set
      if (opts.typeFilter && fileType !== opts.typeFilter) {
        continue;
      }

      const stat = await fsp.stat(fullPath);

      yield {
        absolutePath: fullPath,
        relativePath: relPath,
        type: fileType,
        sizeBytes: stat.size,
        mtimeMs: stat.mtimeMs,
      };
    }
  }
}
