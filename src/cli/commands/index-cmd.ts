/**
 * Index command — end-to-end pipeline: scan -> manifest check -> chunk -> embed -> store.
 *
 * Pipeline flow (per type):
 *   1. Resolve path and open vector collections
 *   2. Handle --clear (wipe storage + manifest)
 *   3. Load manifest (incremental cache)
 *   4. For each type in [code, text, image]:
 *      a. Scan files of that type
 *      b. Detect changed/new/deleted files against manifest
 *      c. Remove deleted files' chunks from the appropriate collection
 *      d. Chunk changed/new files
 *      e. Batch embed with the correct model
 *      f. Insert embeddings into the appropriate collection
 *   5. Optimize collections THEN save manifest (order matters)
 *   6. Dispose pipelines and output results
 *
 * Model routing:
 *   code  -> jinaai/jina-embeddings-v2-base-code, col-768
 *   text  -> nomic-ai/nomic-embed-text-v1.5, col-768  (prefix: "search_document: ")
 *   image -> Xenova/clip-vit-base-patch16, col-512     (one vector per file)
 */

import * as path from 'path';
import * as fsp from 'fs/promises';
import { rmSync } from 'fs';
import type { FileType, ScannedFile } from '../../types.js';

const BATCH_SIZE = 32;

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Shared pipeline helper ─────────────────────────────────────────────────────

/**
 * Shared embedding pipeline: diff files against manifest, chunk, embed, insert into col768.
 * Used by both code and text pipelines (they differ only in chunker, model, prefix, tokenizer).
 */
async function runTextEmbeddingPipeline(opts: {
  type: 'code' | 'text';
  files: ScannedFile[];
  col768: Awaited<ReturnType<(typeof import('../../services/vector-db.js'))['openProjectCollections']>>['col768'];
  manifest: Awaited<ReturnType<(typeof import('../../services/manifest-cache.js'))['loadManifest']>>;
  hashContent: (buf: Buffer) => string;
  hashText: (text: string) => string;
  makeChunkId: (relPath: string, idx: number) => string;
}): Promise<{ filesIndexed: number; filesSkipped: number; chunksCreated: number; chunksReused: number; chunksRemoved: number }> {
  const { type, files, col768, manifest, hashContent, hashText, makeChunkId } = opts;

  let filesIndexed = 0;
  let filesSkipped = 0;
  let chunksCreated = 0;
  let chunksReused = 0;
  let chunksRemoved = 0;

  // Determine which files need processing (mtime+size fast path, hash confirmation)
  const filesToProcess: ScannedFile[] = [];

  for (const file of files) {
    const existing = manifest.files[file.relativePath];
    if (existing && existing.mtime === file.mtimeMs && existing.size === file.sizeBytes) {
      filesSkipped++;
      chunksReused += existing.chunks.length;
      continue;
    }

    if (existing) {
      const buf = await fsp.readFile(file.absolutePath);
      const newHash = hashContent(buf);
      if (newHash === existing.hash) {
        manifest.files[file.relativePath] = { ...existing, mtime: file.mtimeMs, size: file.sizeBytes };
        filesSkipped++;
        chunksReused += existing.chunks.length;
        continue;
      }
    }

    filesToProcess.push(file);
  }

  if (filesToProcess.length === 0) {
    return { filesIndexed, filesSkipped, chunksCreated, chunksReused, chunksRemoved };
  }

  // Load chunker and model (lazy, once per pipeline run)
  let tokenizer: Awaited<ReturnType<(typeof import('../../services/chunker.js'))['loadTokenizer']>> | null = null;
  let pipe: Awaited<ReturnType<(typeof import('../../services/model-router.js'))['createEmbeddingPipeline']>> | null = null;

  const allPendingChunks: PendingChunk[] = [];

  type NewFileEntry = {
    relPath: string;
    mtime: number;
    size: number;
    hash: string;
    chunks: Array<{ id: string; lineStart: number; lineEnd: number; tokenCount: number; textHash: string }>;
  };
  const newFileEntries: NewFileEntry[] = [];

  for (const file of filesToProcess) {
    const ext = path.extname(file.absolutePath).toLowerCase();
    let content: string;

    if (ext === '.pdf') {
      // PDF: read as buffer, extract text via pdf-parse
      const buf = await fsp.readFile(file.absolutePath);
      const fileHash = hashContent(buf);

      const { extractPdfText, chunkTextFile } = await import('../../services/text-chunker.js');
      const rawText = await extractPdfText(buf);
      const chunks = chunkTextFile(rawText);

      const existingEntry = manifest.files[file.relativePath];
      const existingChunks = existingEntry?.chunks ?? [];

      for (let i = chunks.length; i < existingChunks.length; i++) {
        col768.remove(existingChunks[i].id);
        chunksRemoved++;
      }

      const chunkRecords: NewFileEntry['chunks'] = [];

      for (const chunk of chunks) {
        const chunkId = makeChunkId(file.relativePath, chunk.chunkIndex);
        const chunkTextHash = hashText(chunk.text);
        const oldChunk = existingChunks[chunk.chunkIndex];

        chunkRecords.push({ id: chunkId, lineStart: 0, lineEnd: 0, tokenCount: 0, textHash: chunkTextHash });

        if (oldChunk && oldChunk.textHash === chunkTextHash) {
          chunksReused++;
        } else {
          allPendingChunks.push({
            relPath: file.relativePath,
            chunkId,
            text: chunk.text,
            lineStart: 0,
            lineEnd: 0,
            chunkIndex: chunk.chunkIndex,
            tokenCount: 0,
            textHash: chunkTextHash,
          });
        }
      }

      newFileEntries.push({ relPath: file.relativePath, mtime: file.mtimeMs, size: file.sizeBytes, hash: fileHash, chunks: chunkRecords });
      filesIndexed++;
      continue;
    }

    // Non-PDF: read as UTF-8
    content = await fsp.readFile(file.absolutePath, 'utf8');
    const fileHash = hashContent(Buffer.from(content));
    const existingEntry = manifest.files[file.relativePath];
    const existingChunks = existingEntry?.chunks ?? [];

    if (type === 'code') {
      // Code: use Jina tokenizer + sliding-window chunker
      if (!tokenizer) {
        const { loadTokenizer } = await import('../../services/chunker.js');
        tokenizer = await loadTokenizer();
      }
      const { chunkFile } = await import('../../services/chunker.js');
      const chunks = chunkFile(content, tokenizer);

      for (let i = chunks.length; i < existingChunks.length; i++) {
        col768.remove(existingChunks[i].id);
        chunksRemoved++;
      }

      const chunkRecords: NewFileEntry['chunks'] = [];

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
          chunksReused++;
        } else {
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

      newFileEntries.push({ relPath: file.relativePath, mtime: file.mtimeMs, size: file.sizeBytes, hash: fileHash, chunks: chunkRecords });
    } else {
      // Text (non-PDF): paragraph-boundary chunking for Nomic
      const { chunkTextFile } = await import('../../services/text-chunker.js');
      const chunks = chunkTextFile(content);

      for (let i = chunks.length; i < existingChunks.length; i++) {
        col768.remove(existingChunks[i].id);
        chunksRemoved++;
      }

      const chunkRecords: NewFileEntry['chunks'] = [];

      for (const chunk of chunks) {
        const chunkId = makeChunkId(file.relativePath, chunk.chunkIndex);
        const chunkTextHash = hashText(chunk.text);
        const oldChunk = existingChunks[chunk.chunkIndex];

        chunkRecords.push({ id: chunkId, lineStart: 0, lineEnd: 0, tokenCount: 0, textHash: chunkTextHash });

        if (oldChunk && oldChunk.textHash === chunkTextHash) {
          chunksReused++;
        } else {
          allPendingChunks.push({
            relPath: file.relativePath,
            chunkId,
            text: chunk.text,
            lineStart: 0,
            lineEnd: 0,
            chunkIndex: chunk.chunkIndex,
            tokenCount: 0,
            textHash: chunkTextHash,
          });
        }
      }

      newFileEntries.push({ relPath: file.relativePath, mtime: file.mtimeMs, size: file.sizeBytes, hash: fileHash, chunks: chunkRecords });
    }

    filesIndexed++;
  }

  // Embed all pending chunks
  if (allPendingChunks.length > 0) {
    const { createEmbeddingPipeline } = await import('../../services/model-router.js');
    pipe = await createEmbeddingPipeline(type);

    // Nomic requires "search_document: " prefix on indexed documents
    const prefix = type === 'text' ? 'search_document: ' : '';

    for (let batchStart = 0; batchStart < allPendingChunks.length; batchStart += BATCH_SIZE) {
      const batch = allPendingChunks.slice(batchStart, batchStart + BATCH_SIZE);
      const texts = batch.map((c) => prefix + c.text);
      const embeddings = await pipe.embed(texts);

      for (let i = 0; i < batch.length; i++) {
        const chunk = batch[i];
        col768.insert(chunk.chunkId, embeddings[i], {
          filePath: chunk.relPath,
          chunkIndex: chunk.chunkIndex,
          modelId: pipe.modelId,
          lineStart: chunk.lineStart,
          lineEnd: chunk.lineEnd,
          chunkText: chunk.text,  // store without prefix
        });
        chunksCreated++;
      }
    }

    await pipe.dispose();
  }

  // Commit new file entries to manifest
  for (const entry of newFileEntries) {
    manifest.files[entry.relPath] = {
      mtime: entry.mtime,
      size: entry.size,
      hash: entry.hash,
      chunks: entry.chunks,
    };
  }

  return { filesIndexed, filesSkipped, chunksCreated, chunksReused, chunksRemoved };
}

// ── Main command ───────────────────────────────────────────────────────────────

export interface IndexStats {
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
}

export async function runIndex(
  targetPath: string,
  options: { ignore: boolean; type?: string; quiet?: boolean; clear?: boolean; format?: string }
): Promise<IndexStats> {
  const startTime = Date.now();

  try {
    // 1. Resolve path
    const absPath = path.resolve(targetPath);

    // 2. Open vector collections
    const { openProjectCollections } = await import('../../services/vector-db.js');
    let { col768, col512, storagePath } = openProjectCollections(absPath);

    // 3. Handle --clear
    // rmSync removes .ez-search/ entirely (including manifest.json inside it)
    if (options.clear) {
      col768.close();
      col512.close();
      rmSync(storagePath, { recursive: true, force: true });
      const reopened = openProjectCollections(absPath);
      col768 = reopened.col768;
      col512 = reopened.col512;
      storagePath = reopened.storagePath;
    }

    // 4. Load manifest and helpers
    const { loadManifest, saveManifest, hashContent, hashText, makeChunkId } = await import('../../services/manifest-cache.js');
    const manifest = loadManifest(absPath);

    // 5. Determine which types to index
    const typesToIndex: FileType[] = options.type
      ? [options.type as FileType]
      : ['code', 'text', 'image'];

    const { scanFiles } = await import('../../services/file-scanner.js');

    // Aggregate stats
    let totalFilesScanned = 0;
    let totalFilesIndexed = 0;
    let totalFilesSkipped = 0;
    let totalChunksCreated = 0;
    let totalChunksReused = 0;
    let totalChunksRemoved = 0;
    const allDeletedPaths: string[] = [];

    // Per-type file counts for text output
    const typeFileCounts: Partial<Record<FileType, number>> = {};

    let imageFilesProcessed = false;

    for (const fileType of typesToIndex) {
      // Scan files of this type
      const scannedFiles: ScannedFile[] = [];
      for await (const file of scanFiles(absPath, { useIgnoreFiles: options.ignore, typeFilter: fileType })) {
        scannedFiles.push(file);
      }

      totalFilesScanned += scannedFiles.length;

      if (scannedFiles.length === 0) {
        continue;
      }

      // Deletion detection: manifest entries with this file's extension
      const scannedSet = new Set(scannedFiles.map((f) => f.relativePath));

      if (fileType === 'code' || fileType === 'text') {
        // Find manifest entries whose last extension matches this type's extensions
        // Simpler: find entries NOT in current scan that belong to this type
        // We only delete entries whose path is in the scanned set for OTHER types?
        // Actually: we track all types in the same manifest. We need to scope deletions
        // to files that WERE of this type (by extension). Use EXTENSION_MAP.
        const { EXTENSION_MAP } = await import('../../types.js');
        const deletedPaths = Object.keys(manifest.files).filter((relPath) => {
          if (scannedSet.has(relPath)) return false;
          const ext = path.extname(relPath).toLowerCase();
          return EXTENSION_MAP[ext] === fileType;
        });

        for (const deletedPath of deletedPaths) {
          const entry = manifest.files[deletedPath];
          for (const chunk of entry.chunks) {
            col768.remove(chunk.id);
            totalChunksRemoved++;
          }
          delete manifest.files[deletedPath];
          allDeletedPaths.push(deletedPath);
        }

        // Run code/text embedding pipeline
        const result = await runTextEmbeddingPipeline({
          type: fileType,
          files: scannedFiles,
          col768,
          manifest,
          hashContent,
          hashText,
          makeChunkId,
        });

        totalFilesIndexed += result.filesIndexed;
        totalFilesSkipped += result.filesSkipped;
        totalChunksCreated += result.chunksCreated;
        totalChunksReused += result.chunksReused;
        totalChunksRemoved += result.chunksRemoved;

        if (result.filesIndexed > 0) {
          typeFileCounts[fileType] = (typeFileCounts[fileType] ?? 0) + result.filesIndexed;
        }
      } else if (fileType === 'image') {
        // Image pipeline: one vector per file, goes into col-512
        const { EXTENSION_MAP } = await import('../../types.js');
        const deletedPaths = Object.keys(manifest.files).filter((relPath) => {
          if (scannedSet.has(relPath)) return false;
          const ext = path.extname(relPath).toLowerCase();
          return EXTENSION_MAP[ext] === 'image';
        });

        for (const deletedPath of deletedPaths) {
          const entry = manifest.files[deletedPath];
          for (const chunk of entry.chunks) {
            col512.remove(chunk.id);
            totalChunksRemoved++;
          }
          delete manifest.files[deletedPath];
          allDeletedPaths.push(deletedPath);
        }

        // Determine which image files need (re-)embedding
        const filesToProcess: ScannedFile[] = [];
        for (const file of scannedFiles) {
          const existing = manifest.files[file.relativePath];
          if (existing && existing.mtime === file.mtimeMs && existing.size === file.sizeBytes) {
            totalFilesSkipped++;
            totalChunksReused += existing.chunks.length;
            continue;
          }

          if (existing) {
            const buf = await fsp.readFile(file.absolutePath);
            const newHash = hashContent(buf);
            if (newHash === existing.hash) {
              manifest.files[file.relativePath] = { ...existing, mtime: file.mtimeMs, size: file.sizeBytes };
              totalFilesSkipped++;
              totalChunksReused += existing.chunks.length;
              continue;
            }
          }

          filesToProcess.push(file);
        }

        if (filesToProcess.length > 0) {
          // Load CLIP pipeline once for the batch
          const { createImageEmbeddingPipeline } = await import('../../services/image-embedder.js');
          const imagePipeline = await createImageEmbeddingPipeline();

          for (const file of filesToProcess) {
            const buf = await fsp.readFile(file.absolutePath);
            const fileHash = hashContent(buf);

            const embedding = await imagePipeline.embedImage(buf);
            const chunkId = makeChunkId(file.relativePath, 0);

            col512.insert(chunkId, embedding, {
              filePath: file.relativePath,
              chunkIndex: 0,
              modelId: imagePipeline.modelId,
              lineStart: 0,
              lineEnd: 0,
              chunkText: '',
            });
            totalChunksCreated++;

            manifest.files[file.relativePath] = {
              mtime: file.mtimeMs,
              size: file.sizeBytes,
              hash: fileHash,
              chunks: [{ id: chunkId, lineStart: 0, lineEnd: 0, tokenCount: 0, textHash: '' }],
            };
            totalFilesIndexed++;
          }

          await imagePipeline.dispose();
          imageFilesProcessed = true;
          typeFileCounts['image'] = (typeFileCounts['image'] ?? 0) + filesToProcess.length;
        }
      }
    }

    // 5b. Check for empty directory (no supported files found)
    if (totalFilesScanned === 0) {
      const { emitError } = await import('../errors.js');
      const format: 'json' | 'text' = options.format === 'text' ? 'text' : 'json';
      emitError(
        { code: 'EMPTY_DIR', message: 'No supported files found in directory', suggestion: 'Ensure the directory contains supported file types (.ts, .js, .py, .go, .rs, .c, .cpp, .md, .txt, .jpg, .png, .webp)' },
        format
      );
    }

    // 6. Optimize, close collections, THEN save manifest
    col768.optimize();
    col768.close();
    if (imageFilesProcessed) {
      col512.optimize();
    }
    col512.close();
    saveManifest(absPath, manifest);

    // 7. Output results
    const durationMs = Date.now() - startTime;
    const hasChanges = totalFilesIndexed > 0 || allDeletedPaths.length > 0;

    const output = {
      status: hasChanges ? 'ok' : 'no_changes',
      path: absPath,
      filesScanned: totalFilesScanned,
      filesIndexed: totalFilesIndexed,
      filesSkipped: totalFilesSkipped,
      chunksCreated: totalChunksCreated,
      chunksReused: totalChunksReused,
      chunksRemoved: totalChunksRemoved,
      durationMs,
      storageDir: storagePath,
    };

    if (!options.quiet) {
      if (options.format === 'text') {
        const secs = (durationMs / 1000).toFixed(1);
        if (!hasChanges) {
          console.log(`No changes detected. ${totalFilesScanned} files scanned in ${secs}s.`);
        } else {
          const parts: string[] = [];

          // Show per-type breakdown if multiple types indexed
          if (Object.keys(typeFileCounts).length > 1) {
            const typeParts = Object.entries(typeFileCounts).map(
              ([t, count]) => `${count} ${t} file${count !== 1 ? 's' : ''}`
            );
            parts.push(`indexed ${typeParts.join(', ')}`);
          } else if (totalFilesIndexed > 0) {
            parts.push(`indexed ${totalFilesIndexed} file${totalFilesIndexed !== 1 ? 's' : ''}`);
          }

          if (allDeletedPaths.length > 0) {
            parts.push(`removed ${allDeletedPaths.length} deleted file${allDeletedPaths.length !== 1 ? 's' : ''}`);
          }
          if (totalChunksCreated > 0) {
            parts.push(`${totalChunksCreated} new chunk${totalChunksCreated !== 1 ? 's' : ''}`);
          }

          console.log(`${parts.join(', ')} in ${secs}s (${totalChunksReused} chunks reused, ${storagePath})`);
        }
      } else {
        console.log(JSON.stringify(output));
      }
    }

    return output as IndexStats;
  } catch (err) {
    const { emitError } = await import('../errors.js');
    const message = err instanceof Error ? err.message : String(err);
    return emitError(
      { code: 'GENERAL_ERROR', message, suggestion: 'Check the error above and retry' },
      options.format === 'text' ? 'text' : 'json'
    );
  }
}
