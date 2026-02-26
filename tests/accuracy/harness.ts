/**
 * Accuracy test harness — indexes corpus with real models, runs queries, computes metrics.
 *
 * Operates at the service layer (not CLI) for isolation and speed.
 * Creates a temp directory, copies the corpus, indexes all three content types,
 * queries each ground-truth entry, and returns per-type aggregate metrics.
 */

import { mkdtempSync, readFileSync, rmSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { queriesByType } from './ground-truth.js';
import { computeQueryMetrics, aggregateMetrics, type QueryMetrics, type AggregateMetrics } from './metrics.js';
import { loadTokenizer, chunkFile } from '../../src/services/chunker.js';
import { chunkTextFile } from '../../src/services/text-chunker.js';
import { createEmbeddingPipeline, type EmbeddingPipeline } from '../../src/services/model-router.js';
import { createImageEmbeddingPipeline, createClipTextPipeline, type ImageEmbeddingPipeline, type ClipTextPipeline } from '../../src/services/image-embedder.js';
import { openProjectCollections, type ProjectCollections } from '../../src/services/vector-db.js';
import { normalizeResults, normalizeImageResults, filterAndCollapse, filterImageResults } from '../../src/services/query-utils.js';
import { LexicalIndex } from '../../src/services/lexical-index.js';
import { rrfFuse } from '../../src/services/hybrid-fusion.js';
import { fileTypeFromPath } from '../../src/types.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HarnessResult {
  code: { aggregate: AggregateMetrics; queries: QueryMetrics[] };
  codeHybrid: { aggregate: AggregateMetrics; queries: QueryMetrics[] };
  codeKeyword: { aggregate: AggregateMetrics; queries: QueryMetrics[] };
  text: { aggregate: AggregateMetrics; queries: QueryMetrics[] };
  image: { aggregate: AggregateMetrics; queries: QueryMetrics[] };
}

interface Pipelines {
  codePipeline: EmbeddingPipeline;
  textPipeline: EmbeddingPipeline;
  imagePipeline: ImageEmbeddingPipeline;
  clipTextPipeline: ClipTextPipeline;
  tokenizer: Awaited<ReturnType<typeof loadTokenizer>>;
  lexicalIndex: LexicalIndex;
}

// ── Corpus layout ─────────────────────────────────────────────────────────────

const CORPUS_DIR = path.join(import.meta.dir, 'corpus');

const CODE_FILES = ['auth.ts', 'http-client.ts', 'sort.py', 'linked-list.rs', 'react-form.tsx', 'config.yaml'];
const TEXT_FILES = ['git-guide.md', 'api-design.md', 'deployment.txt'];
const IMAGE_FILES = ['bar-chart.png', 'login-form.png', 'terminal.png'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeId(filePath: string, chunkIndex: number): string {
  return `${filePath.replace(/[^a-zA-Z0-9._-]/g, '_')}_chunk${chunkIndex}`;
}

// ── Indexing ──────────────────────────────────────────────────────────────────

async function indexCodeFiles(
  collections: ProjectCollections,
  pipeline: EmbeddingPipeline,
  tokenizer: Awaited<ReturnType<typeof loadTokenizer>>,
  lexicalIndex: LexicalIndex,
): Promise<void> {
  for (const file of CODE_FILES) {
    const content = readFileSync(path.join(CORPUS_DIR, 'code', file), 'utf-8');
    const chunks = chunkFile(content, tokenizer);

    for (const chunk of chunks) {
      const [embedding] = await pipeline.embed([chunk.text]);
      const id = sanitizeId(file, chunk.chunkIndex);
      collections.col768.insert(id, embedding, {
        filePath: file,
        chunkIndex: chunk.chunkIndex,
        modelId: pipeline.modelId,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
        chunkText: chunk.text.slice(0, 200),
      });
      lexicalIndex.addDocument(id, chunk.text, {
        filePath: file,
        chunkIndex: chunk.chunkIndex,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
      });
    }
  }
}

async function indexTextFiles(
  collections: ProjectCollections,
  pipeline: EmbeddingPipeline,
): Promise<void> {
  for (const file of TEXT_FILES) {
    const content = readFileSync(path.join(CORPUS_DIR, 'text', file), 'utf-8');
    const chunks = chunkTextFile(content);

    for (const chunk of chunks) {
      const [embedding] = await pipeline.embed([chunk.text]);
      const id = sanitizeId(file, chunk.chunkIndex);
      collections.col768.insert(id, embedding, {
        filePath: file,
        chunkIndex: chunk.chunkIndex,
        modelId: pipeline.modelId,
        lineStart: 0,
        lineEnd: 0,
        chunkText: chunk.text.slice(0, 200),
      });
    }
  }
}

async function indexImageFiles(
  collections: ProjectCollections,
  pipeline: ImageEmbeddingPipeline,
): Promise<void> {
  for (const file of IMAGE_FILES) {
    const buf = readFileSync(path.join(CORPUS_DIR, 'image', file));
    const embedding = await pipeline.embedImage(buf);
    const id = sanitizeId(file, 0);
    collections.col512.insert(id, embedding, {
      filePath: file,
      chunkIndex: 0,
      modelId: pipeline.modelId,
      lineStart: 0,
      lineEnd: 0,
      chunkText: '',
    });
  }
}

// ── Querying ─────────────────────────────────────────────────────────────────

async function queryCode(
  collections: ProjectCollections,
  pipeline: EmbeddingPipeline,
): Promise<QueryMetrics[]> {
  const queries = queriesByType('code');
  const results: QueryMetrics[] = [];

  for (const q of queries) {
    const prefixed = `Instruct: Given a search query, retrieve relevant code snippets\nQuery: ${q.query}`;
    const [embedding] = await pipeline.embed([prefixed]);
    const raw = collections.col768.query(embedding, 15);
    const normalized = normalizeResults(raw).filter(r => fileTypeFromPath(r.filePath) === 'code');
    const collapsed = filterAndCollapse(
      normalized,
      (id) => id === pipeline.modelId,
      { topK: 5 },
    );
    const retrieved = collapsed.map((r) => r.filePath);
    results.push(computeQueryMetrics(q.query, retrieved, new Set(q.relevant)));
  }

  return results;
}

async function queryText(
  collections: ProjectCollections,
  pipeline: EmbeddingPipeline,
): Promise<QueryMetrics[]> {
  const queries = queriesByType('text');
  const results: QueryMetrics[] = [];

  for (const q of queries) {
    const prefixed = `Instruct: Given a search query, retrieve relevant text passages\nQuery: ${q.query}`;
    const [embedding] = await pipeline.embed([prefixed]);
    const raw = collections.col768.query(embedding, 15);
    const normalized = normalizeResults(raw).filter(r => fileTypeFromPath(r.filePath) === 'text');
    const collapsed = filterAndCollapse(
      normalized,
      (id) => id === pipeline.modelId,
      { topK: 5 },
    );
    const retrieved = collapsed.map((r) => r.filePath);
    results.push(computeQueryMetrics(q.query, retrieved, new Set(q.relevant)));
  }

  return results;
}

async function queryCodeHybrid(
  collections: ProjectCollections,
  pipeline: EmbeddingPipeline,
  lexicalIndex: LexicalIndex,
): Promise<QueryMetrics[]> {
  const queries = queriesByType('code');
  const results: QueryMetrics[] = [];

  for (const q of queries) {
    const prefixed = `Instruct: Given a search query, retrieve relevant code snippets\nQuery: ${q.query}`;
    const [embedding] = await pipeline.embed([prefixed]);
    const raw = collections.col768.query(embedding, 15);
    const normalized = normalizeResults(raw);
    const semanticFiltered = normalized
      .filter((r) => r.modelId === pipeline.modelId)
      .filter((r) => fileTypeFromPath(r.filePath) === 'code');

    const lexResults = lexicalIndex.query(q.query, 15);

    const semanticRanked = semanticFiltered.map((r) => ({
      id: `${r.filePath}:${r.chunkIndex}`,
      filePath: r.filePath,
      chunkIndex: r.chunkIndex,
      lineStart: r.lineStart,
      lineEnd: r.lineEnd,
      chunkText: r.chunkText,
      score: r.score,
    }));

    const lexicalRanked = lexResults.map((r) => ({
      id: r.id,
      filePath: r.filePath,
      chunkIndex: r.chunkIndex,
      lineStart: r.lineStart,
      lineEnd: r.lineEnd,
      chunkText: r.chunkText,
      score: r.score,
    }));

    const fused = rrfFuse(semanticRanked, lexicalRanked);
    const fusedNormalized = fused.map((r) => ({
      filePath: r.filePath,
      chunkIndex: r.chunkIndex,
      lineStart: r.lineStart,
      lineEnd: r.lineEnd,
      chunkText: r.chunkText,
      modelId: 'hybrid-rrf',
      score: r.fusedScore,
    }));

    const collapsed = filterAndCollapse(fusedNormalized, () => true, { topK: 5 });
    const retrieved = collapsed.map((r) => r.filePath);
    results.push(computeQueryMetrics(q.query, retrieved, new Set(q.relevant)));
  }

  return results;
}

async function queryCodeKeyword(
  lexicalIndex: LexicalIndex,
): Promise<QueryMetrics[]> {
  const queries = queriesByType('code');
  const results: QueryMetrics[] = [];

  for (const q of queries) {
    const lexResults = lexicalIndex.query(q.query, 15);

    // Normalize scores to [0,1]
    const maxScore = lexResults.length > 0 ? Math.max(...lexResults.map((r) => r.score)) : 1;
    const normalized = lexResults.map((r) => ({
      filePath: r.filePath,
      chunkIndex: r.chunkIndex,
      lineStart: r.lineStart,
      lineEnd: r.lineEnd,
      chunkText: r.chunkText,
      modelId: 'minisearch-bm25',
      score: maxScore > 0 ? Math.round((r.score / maxScore) * 10000) / 10000 : 0,
    }));

    const collapsed = filterAndCollapse(normalized, () => true, { topK: 5 });
    const retrieved = collapsed.map((r) => r.filePath);
    results.push(computeQueryMetrics(q.query, retrieved, new Set(q.relevant)));
  }

  return results;
}

async function queryImages(
  collections: ProjectCollections,
  clipText: ClipTextPipeline,
): Promise<QueryMetrics[]> {
  const queries = queriesByType('image');
  const results: QueryMetrics[] = [];

  for (const q of queries) {
    const [embedding] = await clipText.embedText([q.query]);
    const raw = collections.col512.query(embedding, 10);
    const normalized = normalizeImageResults(raw);
    const imageResults = filterImageResults(
      normalized,
      () => true,
      { topK: 5 },
    );
    const retrieved = imageResults.map((r) => r.filePath);
    results.push(computeQueryMetrics(q.query, retrieved, new Set(q.relevant)));
  }

  return results;
}

// ── Main harness ─────────────────────────────────────────────────────────────

async function loadPipelines(): Promise<Pipelines> {
  console.error('[harness] Loading models...');
  const [codePipeline, textPipeline, imagePipeline, clipTextPipeline, tokenizer] = await Promise.all([
    createEmbeddingPipeline('code'),
    createEmbeddingPipeline('text'),
    createImageEmbeddingPipeline(),
    createClipTextPipeline(),
    loadTokenizer(),
  ]);
  console.error('[harness] All models loaded');
  return { codePipeline, textPipeline, imagePipeline, clipTextPipeline, tokenizer, lexicalIndex: new LexicalIndex() };
}

async function disposePipelines(p: Pipelines): Promise<void> {
  await Promise.all([
    p.codePipeline.dispose(),
    p.textPipeline.dispose(),
    p.imagePipeline.dispose(),
    p.clipTextPipeline.dispose(),
  ]);
}

/**
 * Run the full accuracy harness: load models, index corpus, query, evaluate.
 * Returns per-type aggregate + per-query metrics.
 */
export async function runHarness(): Promise<HarnessResult> {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'ez-accuracy-'));
  let pipelines: Pipelines | undefined;
  let collections: ProjectCollections | undefined;

  try {
    // Load all models in parallel
    pipelines = await loadPipelines();

    // Open vector collections in the temp directory
    collections = openProjectCollections(tmpDir);

    // Index all content types
    console.error('[harness] Indexing code files...');
    await indexCodeFiles(collections, pipelines.codePipeline, pipelines.tokenizer, pipelines.lexicalIndex);

    console.error('[harness] Indexing text files...');
    await indexTextFiles(collections, pipelines.textPipeline);

    console.error('[harness] Indexing image files...');
    await indexImageFiles(collections, pipelines.imagePipeline);

    // Optimize for query performance
    console.error('[harness] Optimizing collections...');
    collections.col768.optimize();
    collections.col512.optimize();

    // Run queries and compute metrics
    console.error('[harness] Running code queries (semantic)...');
    const codeResults = await queryCode(collections, pipelines.codePipeline);

    console.error('[harness] Running code queries (hybrid)...');
    const codeHybridResults = await queryCodeHybrid(collections, pipelines.codePipeline, pipelines.lexicalIndex);

    console.error('[harness] Running code queries (keyword)...');
    const codeKeywordResults = await queryCodeKeyword(pipelines.lexicalIndex);

    console.error('[harness] Running text queries...');
    const textResults = await queryText(collections, pipelines.textPipeline);

    console.error('[harness] Running image queries...');
    const imageResults = await queryImages(collections, pipelines.clipTextPipeline);

    return {
      code: { aggregate: aggregateMetrics(codeResults), queries: codeResults },
      codeHybrid: { aggregate: aggregateMetrics(codeHybridResults), queries: codeHybridResults },
      codeKeyword: { aggregate: aggregateMetrics(codeKeywordResults), queries: codeKeywordResults },
      text: { aggregate: aggregateMetrics(textResults), queries: textResults },
      image: { aggregate: aggregateMetrics(imageResults), queries: imageResults },
    };
  } finally {
    // Cleanup
    if (collections) {
      try { collections.col768.close(); } catch {}
      try { collections.col512.close(); } catch {}
    }
    if (pipelines) {
      try { await disposePipelines(pipelines); } catch {}
    }
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}
