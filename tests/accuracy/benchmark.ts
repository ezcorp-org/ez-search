/**
 * Standalone benchmark script — run, display, save, and compare accuracy metrics.
 *
 * Usage:
 *   bun run tests/accuracy/benchmark.ts              # run + print results
 *   bun run tests/accuracy/benchmark.ts --save        # run + save baseline
 *   bun run tests/accuracy/benchmark.ts --compare     # run + compare vs baseline
 *   bun run tests/accuracy/benchmark.ts --compare --save  # compare then update baseline
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import * as path from 'path';
import { runHarness, type HarnessResult } from './harness.js';
import type { AggregateMetrics, QueryMetrics } from './metrics.js';

const BASELINE_PATH = path.join(import.meta.dir, 'baselines', 'baseline.json');

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));
const shouldSave = args.has('--save');
const shouldCompare = args.has('--compare');

// ── Formatting ───────────────────────────────────────────────────────────────

function pct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

function delta(current: number, baseline: number): string {
  const diff = current - baseline;
  const sign = diff >= 0 ? '+' : '';
  const color = diff >= 0 ? '\x1b[32m' : '\x1b[31m';
  return `${color}${sign}${(diff * 100).toFixed(1)}%\x1b[0m`;
}

function printQueryDetails(queries: QueryMetrics[]): void {
  for (const q of queries) {
    const icon = q.hit ? '\x1b[32m+\x1b[0m' : '\x1b[31m-\x1b[0m';
    const top1 = q.retrieved[0] ?? '(none)';
    console.log(`  ${icon} "${q.query}"`);
    console.log(`    top-1: ${top1}  |  expected: ${q.relevant.join(', ')}  |  MRR: ${pct(q.mrr)}`);
  }
}

function printAggregate(label: string, agg: AggregateMetrics, baseline?: AggregateMetrics): void {
  console.log(`\n── ${label} (${agg.count} queries) ──`);
  if (baseline) {
    console.log(`  MRR:      ${pct(agg.mrr)}  (${delta(agg.mrr, baseline.mrr)})`);
    console.log(`  P@1:      ${pct(agg.p1)}  (${delta(agg.p1, baseline.p1)})`);
    console.log(`  Recall@3: ${pct(agg.recall3)}  (${delta(agg.recall3, baseline.recall3)})`);
    console.log(`  nDCG@3:   ${pct(agg.ndcg3)}  (${delta(agg.ndcg3, baseline.ndcg3)})`);
  } else {
    console.log(`  MRR:      ${pct(agg.mrr)}`);
    console.log(`  P@1:      ${pct(agg.p1)}`);
    console.log(`  Recall@3: ${pct(agg.recall3)}`);
    console.log(`  nDCG@3:   ${pct(agg.ndcg3)}`);
  }
}

// ── Baseline I/O ─────────────────────────────────────────────────────────────

interface BaselineData {
  timestamp: string;
  code: AggregateMetrics;
  text: AggregateMetrics;
  image: AggregateMetrics;
}

function loadBaseline(): BaselineData | undefined {
  if (!existsSync(BASELINE_PATH)) return undefined;
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) as BaselineData;
  } catch {
    return undefined;
  }
}

function saveBaseline(result: HarnessResult): void {
  const data: BaselineData = {
    timestamp: new Date().toISOString(),
    code: result.code.aggregate,
    text: result.text.aggregate,
    image: result.image.aggregate,
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(data, null, 2) + '\n');
  console.log(`\nBaseline saved to ${BASELINE_PATH}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Running accuracy benchmark...\n');

  const result = await runHarness();
  const baseline = shouldCompare ? loadBaseline() : undefined;

  if (shouldCompare && !baseline) {
    console.log('\x1b[33mNo baseline found — showing absolute metrics only.\x1b[0m');
  }

  // Per-query details
  console.log('\n=== Per-Query Results ===');

  console.log('\n  Code:');
  printQueryDetails(result.code.queries);

  console.log('\n  Text:');
  printQueryDetails(result.text.queries);

  console.log('\n  Image:');
  printQueryDetails(result.image.queries);

  // Aggregates
  console.log('\n=== Aggregate Metrics ===');
  printAggregate('Code', result.code.aggregate, baseline?.code);
  printAggregate('Text', result.text.aggregate, baseline?.text);
  printAggregate('Image', result.image.aggregate, baseline?.image);

  if (shouldSave) {
    saveBaseline(result);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
