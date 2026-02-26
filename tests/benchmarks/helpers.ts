/**
 * Shared benchmark helpers — percentile computation, table formatting, synthetic data generation.
 */

// ── Percentile computation ──────────────────────────────────────────────────

/** Compute p50/p95/p99 from an array of numeric timings (in ms). */
export function percentiles(timings: number[]): { p50: number; p95: number; p99: number; mean: number; min: number; max: number } {
  const sorted = [...timings].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return { p50: 0, p95: 0, p99: 0, mean: 0, min: 0, max: 0 };

  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  return {
    p50: sorted[Math.floor(n * 0.5)],
    p95: sorted[Math.floor(n * 0.95)],
    p99: sorted[Math.floor(n * 0.99)],
    mean: Math.round(mean * 1000) / 1000,
    min: sorted[0],
    max: sorted[n - 1],
  };
}

// ── Table formatting ────────────────────────────────────────────────────────

/** Print a simple table with header + rows. Values are right-aligned. */
export function printTable(header: string[], rows: (string | number)[][]): void {
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map(r => String(r[i]).length)),
  );

  const sep = widths.map(w => '-'.repeat(w + 2)).join('+');
  const fmtRow = (cells: (string | number)[]) =>
    cells.map((c, i) => ` ${String(c).padStart(widths[i])} `).join('|');

  console.log(sep);
  console.log(fmtRow(header));
  console.log(sep);
  for (const row of rows) {
    console.log(fmtRow(row));
  }
  console.log(sep);
}

// ── Synthetic code generation ───────────────────────────────────────────────

const KEYWORDS = ['function', 'const', 'let', 'if', 'else', 'return', 'for', 'while', 'class', 'import'];
const IDENTIFIERS = ['handleRequest', 'getUserData', 'parseConfig', 'validateInput', 'processItem',
  'buildQuery', 'formatOutput', 'loadModule', 'saveResult', 'computeHash'];
const TYPES = ['string', 'number', 'boolean', 'void', 'Promise', 'Record', 'Map', 'Set', 'Array'];

/** Generate a synthetic TypeScript-like code file with ~lineCount lines. */
export function generateCodeFile(lineCount: number, seed: number): string {
  let state = seed;
  const rand = () => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state; };
  const pick = <T>(arr: T[]) => arr[rand() % arr.length];

  const lines: string[] = [];
  lines.push(`// Auto-generated file (seed=${seed})`);
  lines.push(`import { ${pick(IDENTIFIERS)} } from './${pick(IDENTIFIERS)}';`);
  lines.push('');

  for (let i = 3; i < lineCount; i++) {
    const indent = '  '.repeat(rand() % 3);
    const kw = pick(KEYWORDS);
    const id = pick(IDENTIFIERS);
    const tp = pick(TYPES);

    switch (kw) {
      case 'function':
        lines.push(`${indent}export function ${id}_${rand() % 1000}(arg: ${tp}): ${pick(TYPES)} {`);
        break;
      case 'const':
        lines.push(`${indent}const ${id}_${rand() % 1000}: ${tp} = ${rand() % 100};`);
        break;
      case 'if':
        lines.push(`${indent}if (${id}_${rand() % 1000} !== undefined) {`);
        break;
      case 'return':
        lines.push(`${indent}return ${id}_${rand() % 1000};`);
        break;
      default:
        lines.push(`${indent}${kw} ${id}_${rand() % 1000} = ${rand() % 1000};`);
    }
  }

  return lines.join('\n');
}

/** Generate a synthetic text document (~charCount characters). */
export function generateTextDocument(charCount: number, seed: number): string {
  const words = ['the', 'search', 'index', 'query', 'result', 'document', 'token',
    'embedding', 'vector', 'score', 'rank', 'fusion', 'lexical', 'semantic',
    'chunk', 'file', 'function', 'module', 'service', 'handler', 'parser',
    'config', 'error', 'response', 'request', 'middleware', 'database'];

  let state = seed;
  const rand = () => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state; };
  const pick = <T>(arr: T[]) => arr[rand() % arr.length];

  let text = '';
  while (text.length < charCount) {
    const sentLen = 8 + (rand() % 12);
    const sentence = Array.from({ length: sentLen }, () => pick(words)).join(' ') + '. ';
    text += sentence;
    if (rand() % 5 === 0) text += '\n\n';
  }
  return text.slice(0, charCount);
}

// ── Timing helper ───────────────────────────────────────────────────────────

/** Time an async or sync function, return duration in ms. */
export async function timeIt(fn: () => void | Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  return Math.round((performance.now() - start) * 1000) / 1000;
}

/** Format milliseconds for display. */
export function fmtMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}us`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
