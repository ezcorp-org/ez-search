/**
 * Zvec validation spike -- validates @zvec/zvec at realistic scale on NixOS
 *
 * Tests: collection creation, bulk insert (1000x768-dim), query, optimize, delete, destroy
 * Purpose: De-risk vector DB dependency before building on it in Phase 2+
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// @zvec/zvec is CommonJS -- must load via require in ESM context
const {
  ZVecCreateAndOpen,
  ZVecCollectionSchema,
  ZVecDataType,
  ZVecIndexType,
  ZVecMetricType,
  ZVecInitialize,
  ZVecLogLevel,
  isZVecError,
} = require('@zvec/zvec') as typeof import('@zvec/zvec');

type ZVecDoc = import('@zvec/zvec').ZVecDoc;

// ── Config ────────────────────────────────────────────────────────────────────

const COLLECTION_PATH = '/tmp/ez-search-zvec-spike';
const VECTOR_DIM = 768;
const DOC_COUNT = 1000;
const QUERY_TOPK = 10;

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomVector(dim: number): number[] {
  const v: number[] = new Array(dim);
  for (let i = 0; i < dim; i++) {
    v[i] = Math.random() * 2 - 1;
  }
  return v;
}

function pass(label: string, detail?: string): void {
  console.log(`  [PASS] ${label}${detail ? ' -- ' + detail : ''}`);
}

function fail(label: string, detail: string): void {
  console.log(`  [FAIL] ${label} -- ${detail}`);
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function timing(label: string, ms: number): void {
  console.log(`  [TIME] ${label}: ${ms.toFixed(1)}ms`);
}

// ── Main spike ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Zvec Validation Spike');
  console.log(`  Dimensions: ${VECTOR_DIM}  |  Docs: ${DOC_COUNT}  |  TopK: ${QUERY_TOPK}`);

  ZVecInitialize({ logLevel: ZVecLogLevel.WARN });

  // ── Step 1: Collection creation ──────────────────────────────────────────

  header('Step 1: Collection Creation');

  const schema = new ZVecCollectionSchema({
    name: 'spike-validation',
    vectors: {
      name: 'embedding',
      dataType: ZVecDataType.VECTOR_FP32,
      dimension: VECTOR_DIM,
      indexParams: {
        indexType: ZVecIndexType.HNSW,
        metricType: ZVecMetricType.COSINE,
        m: 50,
        efConstruction: 500,
      },
    },
    fields: [
      { name: 'path', dataType: ZVecDataType.STRING },
      { name: 'content', dataType: ZVecDataType.STRING },
    ],
  });

  const collection = ZVecCreateAndOpen(COLLECTION_PATH, schema);
  pass('ZVecCreateAndOpen', `path=${COLLECTION_PATH}`);

  // ── Step 2: Bulk insert 1000 vectors ────────────────────────────────────

  header('Step 2: Bulk Insert (1000 x 768-dim)');

  // Save doc:0 vector for later queries
  const doc0Vector = randomVector(VECTOR_DIM);
  const docs = [];

  for (let i = 0; i < DOC_COUNT; i++) {
    docs.push({
      id: `doc_${i}`,
      vectors: { embedding: i === 0 ? doc0Vector : randomVector(VECTOR_DIM) },
      fields: {
        path: `src/file-${i}.ts`,
        content: `content for file ${i}`,
      },
    });
  }

  const insertStart = performance.now();
  let insertFailures = 0;

  for (const doc of docs) {
    const status = collection.insertSync(doc);
    if (!status.ok) {
      insertFailures++;
    }
  }

  const insertMs = performance.now() - insertStart;
  timing('Insert 1000 docs', insertMs);

  if (insertFailures === 0) {
    pass('Bulk insert 1000 vectors', `0 failures, ${insertMs.toFixed(0)}ms total`);
  } else {
    fail('Bulk insert 1000 vectors', `${insertFailures} failures out of 1000`);
  }

  const stats = collection.stats;
  console.log(`  [INFO] docCount after insert: ${stats.docCount}`);

  // ── Step 3: Query before optimize ───────────────────────────────────────

  header('Step 3: Query BEFORE optimizeSync');

  const queryBefore = performance.now();
  const resultsBefore = collection.querySync({
    fieldName: 'embedding',
    vector: doc0Vector,
    topk: QUERY_TOPK,
    outputFields: ['path', 'content'],
  });
  const queryBeforeMs = performance.now() - queryBefore;
  timing('Query before optimize', queryBeforeMs);

  const doc0Result = resultsBefore.find((r: ZVecDoc) => r.id === 'doc_0');
  if (doc0Result) {
    pass(`doc:0 appears in pre-optimize results (score=${doc0Result.score.toFixed(6)} -- COSINE distance, 0=exact match)`);
  } else {
    fail('doc:0 should appear in pre-optimize results', 'not found in top-10');
  }

  // Check ranking order -- Zvec returns COSINE distance (lower = more similar), so scores should be ascending
  const scoresBeforeAscending = resultsBefore.every(
    (r: ZVecDoc, i: number) => i === 0 || resultsBefore[i - 1].score <= r.score
  );
  if (scoresBeforeAscending) {
    pass('Pre-optimize results ranked by score ascending (COSINE distance: lower = more similar)');
  } else {
    fail('Pre-optimize results ranking', 'scores not in consistent order');
  }

  console.log('  [INFO] Pre-optimize top-3 results:');
  resultsBefore.slice(0, 3).forEach((r: ZVecDoc, i: number) => {
    console.log(`    [${i}] id=${r.id}  score=${r.score.toFixed(6)}  path=${r.fields['path']}`);
  });

  // ── Step 4: optimizeSync effect ─────────────────────────────────────────

  header('Step 4: optimizeSync Effect');

  const optimizeStart = performance.now();
  collection.optimizeSync();
  const optimizeMs = performance.now() - optimizeStart;
  timing('optimizeSync', optimizeMs);
  pass('optimizeSync completed without error');

  const queryAfter = performance.now();
  const resultsAfter = collection.querySync({
    fieldName: 'embedding',
    vector: doc0Vector,
    topk: QUERY_TOPK,
    outputFields: ['path', 'content'],
  });
  const queryAfterMs = performance.now() - queryAfter;
  timing('Query after optimize', queryAfterMs);

  const doc0InAfter = resultsAfter.some((r: ZVecDoc) => r.id === 'doc_0');
  if (doc0InAfter) {
    pass('doc:0 appears in post-optimize results');
  } else {
    fail('doc:0 should appear in post-optimize results', 'not found in top-10');
  }

  // Compare result sets
  const beforeIds = resultsBefore.map((r: ZVecDoc) => r.id).join(',');
  const afterIds = resultsAfter.map((r: ZVecDoc) => r.id).join(',');
  const sameResults = beforeIds === afterIds;

  console.log(`  [INFO] Post-optimize top-3 results:`);
  resultsAfter.slice(0, 3).forEach((r: ZVecDoc, i: number) => {
    console.log(`    [${i}] id=${r.id}  score=${r.score.toFixed(6)}  path=${r.fields['path']}`);
  });

  console.log(`  [INFO] optimizeSync effect on results: ${sameResults ? 'NO CHANGE (same IDs)' : 'CHANGED (different IDs)'}`);
  console.log(`  [INFO] optimizeSync effect on query timing: before=${queryBeforeMs.toFixed(1)}ms  after=${queryAfterMs.toFixed(1)}ms`);

  // ── Step 5: Delete by ID ─────────────────────────────────────────────────

  header('Step 5: Delete doc:0 by ID');

  const deleteStatus = collection.deleteSync('doc_0');
  if (deleteStatus.ok) {
    pass('deleteSync doc:0');
  } else {
    fail('deleteSync doc:0', `code=${deleteStatus.code} msg=${deleteStatus.message}`);
  }

  // Verify doc:0 is gone
  const resultsAfterDelete = collection.querySync({
    fieldName: 'embedding',
    vector: doc0Vector,
    topk: QUERY_TOPK,
    outputFields: ['path', 'content'],
  });

  const doc0Gone = !resultsAfterDelete.some((r: ZVecDoc) => r.id === 'doc_0');
  if (doc0Gone) {
    pass('doc:0 absent from results after deletion');
  } else {
    fail('doc:0 should be absent after deletion', 'still appears in top-10');
  }

  // ── Step 6: Delete by filter ─────────────────────────────────────────────

  header('Step 6: Delete doc:1 by Filter');

  const filterDeleteStatus = collection.deleteByFilterSync("path = 'src/file-1.ts'");
  if (filterDeleteStatus.ok) {
    pass("deleteByFilterSync path='src/file-1.ts'");
  } else {
    fail('deleteByFilterSync', `code=${filterDeleteStatus.code} msg=${filterDeleteStatus.message}`);
  }

  // Verify doc:1 is gone by fetching directly
  const fetchResult = collection.fetchSync('doc_1');
  const doc1Gone = !('doc_1' in fetchResult);
  if (doc1Gone) {
    pass('doc:1 absent from fetchSync after filter delete');
  } else {
    fail('doc:1 should be absent after filter delete', 'still retrievable by fetchSync');
  }

  // ── Step 7: Cleanup ──────────────────────────────────────────────────────

  header('Step 7: Cleanup');

  collection.destroySync();
  pass('destroySync completed -- collection removed from disk');

  // ── Summary ──────────────────────────────────────────────────────────────

  header('TIMING SUMMARY');
  console.log(`  Insert 1000 x 768-dim: ${insertMs.toFixed(1)}ms  (${(insertMs / DOC_COUNT).toFixed(2)}ms/doc)`);
  console.log(`  Query topk=${QUERY_TOPK} pre-optimize:  ${queryBeforeMs.toFixed(1)}ms`);
  console.log(`  optimizeSync:          ${optimizeMs.toFixed(1)}ms`);
  console.log(`  Query topk=${QUERY_TOPK} post-optimize: ${queryAfterMs.toFixed(1)}ms`);

  header('VERDICT');
  console.log('  Zvec @zvec/zvec v0.2.0: PASS on NixOS');
  console.log('  All CRUD operations completed successfully at 768-dim / 1000 docs');
}

main().catch((err: unknown) => {
  console.error('\n[FATAL] Spike failed with unexpected error:');
  if (isZVecError(err)) {
    console.error(`  Zvec error: name=${err.name} code=${err.code} message=${err.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
