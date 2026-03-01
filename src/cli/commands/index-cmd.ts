/**
 * Index command — end-to-end pipeline: scan -> manifest check -> chunk -> embed -> store.
 *
 * Pipeline flow (per type):
 *   1. Resolve path and open vector collection
 *   2. Handle --clear (wipe storage + manifest)
 *   3. Load manifest (incremental cache)
 *   4. For each type in [code, text, image]:
 *      a. Scan files of that type
 *      b. Detect changed/new/deleted files against manifest
 *      c. Remove deleted files' chunks from col-768
 *      d. Chunk changed/new files
 *      e. Batch embed with the correct model
 *      f. Insert embeddings into col-768
 *   5. Optimize collection THEN save manifest (order matters)
 *   6. Dispose pipelines and output results
 *
 * Model routing:
 *   code  -> onnx-community/Qwen3-Embedding-0.6B-ONNX, col-768
 *   text  -> onnx-community/Qwen3-Embedding-0.6B-ONNX, col-768
 *   image -> Xenova/clip-vit-base-patch16, col-512
 */

import * as path from 'path';
import * as fsp from 'fs/promises';
import { rmSync } from 'fs';
import type { FileType, ScannedFile } from '../../types.js';
import { type ProgressReporter } from '../progress.js';
import { EzSearchError } from '../../errors.js';

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
  progress: ProgressReporter;
  lexicalIndex?: import('../../services/lexical-index.js').LexicalIndex;
  model?: string;
}): Promise<{ filesIndexed: number; filesSkipped: number; chunksCreated: number; chunksReused: number; chunksRemoved: number }> {
  const { type, files, col768, manifest, hashContent, hashText, makeChunkId, progress, lexicalIndex, model } = opts;

  let filesIndexed = 0;
  let filesSkipped = 0;
  let chunksCreated = 0;
  let chunksReused = 0;
  let chunksRemoved = 0;

  // Determine which files need processing (mtime+size fast path, hash confirmation)
  const filesToProcess: ScannedFile[] = [];

  for (let fi = 0; fi < files.length; fi++) {
    const file = files[fi];
    progress.update(`${type}: checking files`, fi + 1, files.length);
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
        lexicalIndex?.removeDocument(existingChunks[i].id);
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
          lexicalIndex?.addDocument(chunkId, chunk.text, { filePath: file.relativePath, chunkIndex: chunk.chunkIndex, lineStart: 0, lineEnd: 0 });
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
        lexicalIndex?.removeDocument(existingChunks[i].id);
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
          lexicalIndex?.addDocument(chunkId, chunk.text, { filePath: file.relativePath, chunkIndex: chunk.chunkIndex, lineStart: chunk.lineStart, lineEnd: chunk.lineEnd });
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
      // Text (non-PDF): paragraph-boundary chunking for Qwen3
      const { chunkTextFile } = await import('../../services/text-chunker.js');
      const chunks = chunkTextFile(content);

      for (let i = chunks.length; i < existingChunks.length; i++) {
        col768.remove(existingChunks[i].id);
        lexicalIndex?.removeDocument(existingChunks[i].id);
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
          lexicalIndex?.addDocument(chunkId, chunk.text, { filePath: file.relativePath, chunkIndex: chunk.chunkIndex, lineStart: 0, lineEnd: 0 });
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
    progress.update(`${type}: loading model...`);
    const { createEmbeddingPipeline } = await import('../../services/model-router.js');
    pipe = await createEmbeddingPipeline(type, { modelId: model });

    const totalBatches = Math.ceil(allPendingChunks.length / BATCH_SIZE);

    for (let batchStart = 0; batchStart < allPendingChunks.length; batchStart += BATCH_SIZE) {
      const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
      progress.update(`${type}: embedding`, batchNum, totalBatches);
      const batch = allPendingChunks.slice(batchStart, batchStart + BATCH_SIZE);
      const texts = batch.map((c) => c.text);
      const embeddings = await pipe.embed(texts);

      for (let i = 0; i < batch.length; i++) {
        const chunk = batch[i];
        col768.insert(chunk.chunkId, embeddings[i], {
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

    await pipe.dispose(); // no-op with pipeline cache; actual cleanup in releaseAllPipelines()
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
  options: { ignore: boolean; type?: string; quiet?: boolean; clear?: boolean; format?: string; _silent?: boolean; model?: string; clipModel?: string }
): Promise<IndexStats> {
  const startTime = Date.now();
  const silent = options._silent ?? false;
  const { ProgressReporter } = await import('../progress.js');
  const progress = new ProgressReporter({
    quiet: options.quiet || silent,
    json: options.format === 'json',
  });

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

    // 4b. Load or create lexical index
    const { existsSync, readFileSync, writeFileSync } = await import('fs');
    const { LexicalIndex } = await import('../../services/lexical-index.js');
    const lexicalPath = path.join(storagePath, 'lexical-index.json');
    let lexicalIndex: InstanceType<typeof LexicalIndex>;
    if (!options.clear && existsSync(lexicalPath)) {
      try {
        lexicalIndex = LexicalIndex.fromJSON(readFileSync(lexicalPath, 'utf-8'));
      } catch {
        lexicalIndex = new LexicalIndex();
      }
    } else {
      lexicalIndex = new LexicalIndex();
    }

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

    for (const fileType of typesToIndex) {
      // Scan files of this type
      const scannedFiles: ScannedFile[] = [];
      for await (const file of scanFiles(absPath, { useIgnoreFiles: options.ignore, typeFilter: fileType })) {
        scannedFiles.push(file);
        progress.update(`scanning ${fileType} files... ${scannedFiles.length} found`);
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
            lexicalIndex.removeDocument(chunk.id);
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
          progress,
          lexicalIndex,
          model: options.model,
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
        // Image pipeline: one vector per file, goes into col-512 (CLIP)
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
          progress.update('image: loading model...');
          const { createImageEmbeddingPipeline } = await import('../../services/image-embedder.js');
          const imagePipeline = await createImageEmbeddingPipeline({ modelId: options.clipModel });

          for (let imgIdx = 0; imgIdx < filesToProcess.length; imgIdx++) {
            const file = filesToProcess[imgIdx];
            progress.update('image: embedding', imgIdx + 1, filesToProcess.length);
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
          typeFileCounts['image'] = (typeFileCounts['image'] ?? 0) + filesToProcess.length;
        }
      }
    }

    // 5b. Check for empty directory (no supported files found)
    if (totalFilesScanned === 0) {
      throw new EzSearchError('EMPTY_DIR', 'No supported files found in directory', 'Ensure the directory contains supported file types (.ts, .js, .py, .go, .rs, .c, .cpp, .md, .txt, .jpg, .png, .webp)');
    }

    // 6. Optimize, close collections, save lexical index, THEN save manifest
    progress.update('optimizing index...');
    col768.optimize();
    col512.optimize();
    col768.close();
    col512.close();
    const { releaseAllPipelines } = await import('../../services/model-router.js');
    await releaseAllPipelines();
    writeFileSync(lexicalPath, lexicalIndex.toJSON());
    saveManifest(absPath, manifest);
    progress.done();

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

    if (!options.quiet && !silent) {
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
    progress.done();
    if (err instanceof EzSearchError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new EzSearchError('GENERAL_ERROR', message, 'Check the error above and retry');
  }
}
