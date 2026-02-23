/**
 * Manifest cache service — tracks which files have been indexed and their chunk records.
 *
 * Manifest is stored at <projectDir>/.ez-search/manifest.json.
 *
 * Provides fast incremental indexing:
 *   - mtime+size fast path avoids SHA-256 hashing for unchanged files
 *   - SHA-256 confirmation catches same-size edits
 *   - Atomic write (tmp+rename) prevents corrupt cache on crash
 */

import crypto from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs';
import * as path from 'path';
import { resolveProjectStoragePath } from '../config/paths.js';

// ── Constants ─────────────────────────────────────────────────────────────────

export const MANIFEST_VERSION = 2;
export const MANIFEST_FILENAME = 'manifest.json';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChunkRecord {
  id: string;
  lineStart: number;
  lineEnd: number;
  tokenCount: number;
  textHash: string;
}

export interface ManifestEntry {
  mtime: number;
  size: number;
  hash: string;
  chunks: ChunkRecord[];
}

export interface Manifest {
  version: number;
  files: Record<string, ManifestEntry>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function manifestPath(projectDir: string): string {
  return path.join(resolveProjectStoragePath(projectDir), MANIFEST_FILENAME);
}

// ── Load / Save ───────────────────────────────────────────────────────────────

/**
 * Load the manifest from projectDir. Returns an empty manifest if the file
 * doesn't exist, has corrupt JSON, or has a mismatched version.
 */
export function loadManifest(projectDir: string): Manifest {
  const filePath = manifestPath(projectDir);
  if (!existsSync(filePath)) {
    return { version: MANIFEST_VERSION, files: {} };
  }

  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Manifest;
    if (parsed.version !== MANIFEST_VERSION) {
      return { version: MANIFEST_VERSION, files: {} };
    }
    return parsed;
  } catch {
    return { version: MANIFEST_VERSION, files: {} };
  }
}

/**
 * Write manifest atomically: write to `manifest.json.tmp` then rename.
 * This prevents partial writes on crash.
 * Creates <projectDir>/.ez-search/ if it doesn't exist.
 */
export function saveManifest(projectDir: string, manifest: Manifest): void {
  const storageDir = resolveProjectStoragePath(projectDir);
  mkdirSync(storageDir, { recursive: true });
  const filePath = manifestPath(projectDir);
  const tmpPath = filePath + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(manifest));
  renameSync(tmpPath, filePath);
}

// ── Hashing ───────────────────────────────────────────────────────────────────

/**
 * SHA-256 hash of raw binary content, truncated to 16 hex chars.
 */
export function hashContent(content: Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * SHA-256 hash of a UTF-8 string, truncated to 16 hex chars.
 */
export function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

// ── Chunk ID ──────────────────────────────────────────────────────────────────

/**
 * Generate a stable chunk ID from a relative file path and chunk index.
 * Uses underscore separator — no colons (Zvec constraint).
 *
 * Format: <12-char path hash>_<4-digit index>
 * Example: "a3f9c2d14b7e_0003"
 */
export function makeChunkId(relativeFilePath: string, chunkIndex: number): string {
  const pathHash = crypto
    .createHash('sha256')
    .update(relativeFilePath)
    .digest('hex')
    .slice(0, 12);
  return pathHash + '_' + String(chunkIndex).padStart(4, '0');
}
