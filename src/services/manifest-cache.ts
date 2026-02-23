/**
 * Manifest cache service — tracks which files have been indexed and their chunk records.
 *
 * Provides fast incremental indexing:
 *   - mtime+size fast path avoids SHA-256 hashing for unchanged files
 *   - SHA-256 confirmation catches same-size edits
 *   - Atomic write (tmp+rename) prevents corrupt cache on crash
 */

import crypto from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'fs';
import * as path from 'path';

// ── Constants ─────────────────────────────────────────────────────────────────

export const MANIFEST_VERSION = 1;
export const MANIFEST_FILENAME = '.ez-search-cache';

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

// ── Load / Save ───────────────────────────────────────────────────────────────

/**
 * Load the manifest from projectDir. Returns an empty manifest if the file
 * doesn't exist, has corrupt JSON, or has a mismatched version.
 */
export function loadManifest(projectDir: string): Manifest {
  const filePath = path.join(projectDir, MANIFEST_FILENAME);
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
 * Write manifest atomically: write to `.ez-search-cache.tmp` then rename.
 * This prevents partial writes on crash.
 */
export function saveManifest(projectDir: string, manifest: Manifest): void {
  const filePath = path.join(projectDir, MANIFEST_FILENAME);
  const tmpPath = filePath + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(manifest));
  renameSync(tmpPath, filePath);
}

/**
 * Delete the manifest cache file if it exists.
 */
export function clearManifest(projectDir: string): void {
  const filePath = path.join(projectDir, MANIFEST_FILENAME);
  try {
    unlinkSync(filePath);
  } catch {
    // File doesn't exist — nothing to clear
  }
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
