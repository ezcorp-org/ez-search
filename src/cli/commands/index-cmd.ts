/**
 * Index command — end-to-end pipeline: scan -> manifest check -> chunk -> embed -> store.
 *
 * Pipeline flow:
 *   1. Resolve path and open vector collections
 *   2. Handle --clear (wipe storage + manifest)
 *   3. Load manifest (incremental cache)
 *   4. Scan code files via file-scanner
 *   5. Detect changed/new/deleted files against manifest
 *   6. Remove deleted files' chunks from Zvec
 *   7. Chunk changed/new files via chunker (token-accurate, 500/50 sliding window)
 *   8. Chunk-level diff: only re-embed chunks whose text actually changed
 *   9. Batch embed in groups of 32 via model-router (jinaai/jina-embeddings-v2-base-code)
 *  10. Insert embeddings into col-768 with metadata
 *  11. Call optimize() after all inserts/deletes
 *  12. Save manifest AFTER optimize succeeds
 *  13. Dispose pipeline and output results
 *
 * Outputs JSON to stdout by default; --pretty for human-readable; --quiet for silent.
 */

import * as path from 'path';
import * as fsp from 'fs/promises';
import { rmSync } from 'fs';
import type { FileType } from '../../types.js';

const BATCH_SIZE = 32;

export async function runIndex(
  targetPath: string,
  options: { ignore: boolean; type?: string; quiet?: boolean; clear?: boolean; format?: string }
): Promise<void> {
  const startTime = Date.now();

  // Early exit for unsupported type pipelines
  if (options.type === 'text') {
    console.log(JSON.stringify({ status: 'error', message: 'text pipeline not yet implemented (Phase 5)' }));
    return;
  }
  if (options.type === 'image') {
    console.log(JSON.stringify({ status: 'error', message: 'image pipeline not yet implemented (Phase 5)' }));
    return;
  }

  try {
    // 1. Resolve path
    const absPath = path.resolve(targetPath);

    // 2. Open vector collections
    const { openProjectCollections } = await import('../../services/vector-db.js');
    let { col768, storagePath } = openProjectCollections(absPath);

    // 3. Handle --clear
    if (options.clear) {
      const { clearManifest } = await import('../../services/manifest-cache.js');
      clearManifest(absPath);
      // Wipe entire storage directory and recreate fresh collections
      rmSync(storagePath, { recursive: true, force: true });
      const reopened = openProjectCollections(absPath);
      col768 = reopened.col768;
      storagePath = reopened.storagePath;
    }

    // 4. Load manifest
    const { loadManifest, saveManifest, hashContent, hashText, makeChunkId } = await import('../../services/manifest-cache.js');
    const manifest = loadManifest(absPath);

    // 5. Scan files (default to code pipeline for Phase 3)
    const { scanFiles } = await import('../../services/file-scanner.js');
    const typeFilter: FileType = (options.type as FileType | undefined) ?? 'code';
    const scannedFiles: Array<{ absolutePath: string; relativePath: string; sizeBytes: number; mtimeMs: number }> = [];

    for await (const file of scanFiles(absPath, { useIgnoreFiles: options.ignore, typeFilter })) {
      scannedFiles.push(file);
    }

    // 6. Build scanned file set for deletion detection
    const scannedSet = new Set(scannedFiles.map((f) => f.relativePath));

    // 7. Detect deletions: files in manifest but not in scan
    const deletedPaths = Object.keys(manifest.files).filter((p) => !scannedSet.has(p));

    // Track stats
    let filesIndexed = 0;
    let filesSkipped = 0;
    let chunksCreated = 0;
    let chunksReused = 0;
    let chunksRemoved = 0;

    // 8. Handle deletions
    for (const deletedPath of deletedPaths) {
      const entry = manifest.files[deletedPath];
      for (const chunk of entry.chunks) {
        col768.remove(chunk.id);
        chunksRemoved++;
      }
      delete manifest.files[deletedPath];
    }

    // 9. Determine changed/new files
    const filesToProcess: Array<{ absolutePath: string; relativePath: string; sizeBytes: number; mtimeMs: number }> = [];

    for (const file of scannedFiles) {
      const existing = manifest.files[file.relativePath];
      if (existing && existing.mtime === file.mtimeMs && existing.size === file.sizeBytes) {
        // Fast path: mtime + size unchanged → skip
        filesSkipped++;
        chunksReused += existing.chunks.length;
        continue;
      }

      if (existing) {
        // mtime or size changed — read content to check hash
        const buf = await fsp.readFile(file.absolutePath);
        const newHash = hashContent(buf);
        if (newHash === existing.hash) {
          // Only mtime changed (e.g., touch/checkout) — update mtime+size, skip re-embed
          manifest.files[file.relativePath] = { ...existing, mtime: file.mtimeMs, size: file.sizeBytes };
          filesSkipped++;
          chunksReused += existing.chunks.length;
          continue;
        }
      }

      filesToProcess.push(file);
    }

    // 10. Load tokenizer and embedding pipeline (once, lazily)
    let tokenizer: Awaited<ReturnType<(typeof import('../../services/chunker.js'))['loadTokenizer']>> | null = null;
    let pipe: Awaited<ReturnType<(typeof import('../../services/model-router.js'))['createEmbeddingPipeline']>> | null = null;

    // Collect all chunks needing embedding across all files, with their file context
    type PendingChunk = {
      relPath: string;
      chunkId: string;
      text: string;
      lineStart: number;
      lineEnd: number;
      chunkIndex: number;
      tokenCount: number;
      textHash: string;
    };

    const allPendingChunks: PendingChunk[] = [];

    // Per-file new chunk records (updated as we go)
    const newFileEntries: Array<{
      relPath: string;
      mtime: number;
      size: number;
      hash: string;
      chunks: Array<{ id: string; lineStart: number; lineEnd: number; tokenCount: number; textHash: string }>;
    }> = [];

    for (const file of filesToProcess) {
      // Load tokenizer on first use
      if (!tokenizer) {
        const { loadTokenizer } = await import('../../services/chunker.js');
        tokenizer = await loadTokenizer();
      }

      const content = await fsp.readFile(file.absolutePath, 'utf8');
      const fileHash = hashContent(Buffer.from(content));

      const { chunkFile } = await import('../../services/chunker.js');
      const chunks = chunkFile(content, tokenizer);

      const existingEntry = manifest.files[file.relativePath];
      const existingChunks = existingEntry?.chunks ?? [];

      // Remove old chunks from Zvec that no longer exist (file got shorter)
      for (let i = chunks.length; i < existingChunks.length; i++) {
        col768.remove(existingChunks[i].id);
        chunksRemoved++;
      }

      // Build chunk records and collect those needing embedding
      const chunkRecords: Array<{ id: string; lineStart: number; lineEnd: number; tokenCount: number; textHash: string }> = [];

      for (const chunk of chunks) {
        const chunkId = makeChunkId(file.relativePath, chunk.chunkIndex);
        const chunkTextHash = hashText(chunk.text);
        const oldChunk = existingChunks[chunk.chunkIndex];

        chunkRecords.push({
          id: chunkId,
          lineStart: chunk.lineStart,
          lineEnd: chunk.lineEnd,
          tokenCount: chunk.tokenCount,
          textHash: chunkTextHash,
        });

        if (oldChunk && oldChunk.textHash === chunkTextHash) {
          // Chunk text unchanged — reuse existing embedding
          chunksReused++;
        } else {
          // New or changed chunk — needs embedding
          allPendingChunks.push({
            relPath: file.relativePath,
            chunkId,
            text: chunk.text,
            lineStart: chunk.lineStart,
            lineEnd: chunk.lineEnd,
            chunkIndex: chunk.chunkIndex,
            tokenCount: chunk.tokenCount,
            textHash: chunkTextHash,
          });
        }
      }

      newFileEntries.push({
        relPath: file.relativePath,
        mtime: file.mtimeMs,
        size: file.sizeBytes,
        hash: fileHash,
        chunks: chunkRecords,
      });

      filesIndexed++;
    }

    // 11. Load embedding pipeline if needed
    if (allPendingChunks.length > 0) {
      if (!pipe) {
        const { createEmbeddingPipeline } = await import('../../services/model-router.js');
        pipe = await createEmbeddingPipeline('code');
      }

      // Process in batches of 32
      for (let batchStart = 0; batchStart < allPendingChunks.length; batchStart += BATCH_SIZE) {
        const batch = allPendingChunks.slice(batchStart, batchStart + BATCH_SIZE);
        const texts = batch.map((c) => c.text);
        const embeddings = await pipe.embed(texts);

        for (let i = 0; i < batch.length; i++) {
          const chunk = batch[i];
          const embedding = embeddings[i];

          col768.insert(chunk.chunkId, embedding, {
            filePath: chunk.relPath,
            chunkIndex: chunk.chunkIndex,
            modelId: pipe.modelId,
            lineStart: chunk.lineStart,
            lineEnd: chunk.lineEnd,
            chunkText: chunk.text,
          });
          chunksCreated++;
        }
      }
    }

    // 12. Update manifest entries for processed files
    for (const entry of newFileEntries) {
      manifest.files[entry.relPath] = {
        mtime: entry.mtime,
        size: entry.size,
        hash: entry.hash,
        chunks: entry.chunks,
      };
    }

    // 13. Optimize THEN save manifest (order matters: manifest saved only after optimize succeeds)
    col768.optimize();
    saveManifest(absPath, manifest);

    // 14. Dispose pipeline
    if (pipe) {
      await pipe.dispose();
    }

    // 15. Output results
    const durationMs = Date.now() - startTime;
    const hasChanges = filesIndexed > 0 || deletedPaths.length > 0;

    const output = {
      status: hasChanges ? 'ok' : 'no_changes',
      path: absPath,
      filesScanned: scannedFiles.length,
      filesIndexed,
      filesSkipped,
      chunksCreated,
      chunksReused,
      chunksRemoved,
      durationMs,
      storageDir: storagePath,
    };

    if (!options.quiet) {
      if (options.format === 'text') {
        const secs = (durationMs / 1000).toFixed(1);
        if (!hasChanges) {
          console.log(`No changes detected. ${scannedFiles.length} files scanned in ${secs}s.`);
        } else {
          const parts: string[] = [];
          if (filesIndexed > 0) parts.push(`indexed ${filesIndexed} file${filesIndexed !== 1 ? 's' : ''}`);
          if (deletedPaths.length > 0) parts.push(`removed ${deletedPaths.length} deleted file${deletedPaths.length !== 1 ? 's' : ''}`);
          if (chunksCreated > 0) parts.push(`${chunksCreated} new chunk${chunksCreated !== 1 ? 's' : ''}`);
          console.log(`${parts.join(', ')} in ${secs}s (${chunksReused} chunks reused, ${storagePath})`);
        }
      } else {
        console.log(JSON.stringify(output));
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (options.format === 'text') {
      console.error(`Error: ${message}`);
    } else {
      console.log(JSON.stringify({ status: 'error', message }));
    }
  }
}
