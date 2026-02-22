# Phase 4: Search and Query - Research

**Researched:** 2026-02-22
**Domain:** Vector search, result scoring, adjacent chunk collapsing, JSON output formatting
**Confidence:** HIGH (all critical infrastructure already exists in codebase; verified from source)

## Summary

Phase 4 implements `ez-search query "<text>"` by wiring together infrastructure that already exists. The query pipeline is: embed the query text using the same Jina code model → call `col768.query()` in Zvec → convert distances to scores → apply post-filters (`--dir`, `--threshold`) → collapse adjacent chunks per file → output JSON.

All heavy lifting is done. `vector-db.ts` already has a working `query()` method that returns `QueryResult[]` with all needed metadata (`filePath`, `lineStart`, `lineEnd`, `chunkText`). `model-router.ts` already has `createEmbeddingPipeline('code')` which embeds text. The stub `query-cmd.ts` just needs a real implementation.

The main design work is: (1) score normalization from Zvec COSINE distance to 0-1 relevance, (2) adjacent-chunk collapsing when a file returns multiple results, (3) JSON output structure matching the agreed schema, and (4) `--format text` human-readable fallback. No new dependencies are needed.

**Primary recommendation:** Implement `query-cmd.ts` as a pipeline that calls `createEmbeddingPipeline`, embeds the query, calls `col768.query(embedding, topK * multiplier)`, converts scores, post-filters, collapses adjacent chunks, and emits JSON to stdout.

## Standard Stack

No new dependencies needed. Phase 4 uses only what already exists.

### Core (all already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@zvec/zvec` | 0.2.0 | Vector similarity search | Already installed; `col768.query()` already implemented |
| `@huggingface/transformers` | 4.0.0-next.4 | Embed query text via Jina code model | Already installed; same model used for indexing |
| `commander` | 14.0.3 | CLI flag parsing (`--top-k`, `--dir`, `--threshold`, `--format`) | Already installed; query command already registered |
| `node:path` | built-in | Path prefix normalization for `--dir` filter | No dep needed |

### No New Dependencies Required

Do NOT add:
- Any external ranking or re-ranking library — Zvec COSINE distance is sufficient for this phase
- Any string truncation utility — chunk text is returned verbatim (decided in CONTEXT.md)
- Any syntax highlighting library — no color codes in default output (decided in CONTEXT.md)

**Installation:** No new packages. Existing stack is complete.

## Architecture Patterns

### Recommended Project Structure (new/changed files for Phase 4)
```
src/
├── cli/
│   ├── index.ts                 # MODIFY — add --threshold and --format flags to query command
│   └── commands/
│       └── query-cmd.ts         # REPLACE stub — full implementation
└── services/
    └── vector-db.ts             # READ ONLY — query() already implemented
```

### Pattern 1: Query Pipeline

**What:** Single async function: load pipeline → embed query → search Zvec → normalize → filter → collapse → output.

**Key implementation detail:** Load the embedding pipeline with `createEmbeddingPipeline('code')`. For the query, embed a single string (not a batch). No instruction prefix for Jina v2 (symmetric model, confirmed in model-router.ts comment).

**Example:**
```typescript
// Source: verified from src/services/model-router.ts and src/services/vector-db.ts

export async function runQuery(
  text: string,
  options: { format?: string; topK: string; dir?: string; threshold?: string }
): Promise<void> {
  const { openProjectCollections } = await import('../../services/vector-db.js');
  const { createEmbeddingPipeline } = await import('../../services/model-router.js');

  const absProjectDir = process.cwd();
  const { col768 } = openProjectCollections(absProjectDir);

  // Embed the query — single string, no prefix (Jina v2 is symmetric)
  const pipe = await createEmbeddingPipeline('code');
  const [queryEmbedding] = await pipe.embed([text]);
  await pipe.dispose();

  // Fetch more results than needed to allow for post-filter losses
  const topK = parseInt(options.topK, 10) || 10;
  const fetchK = options.dir || options.threshold ? topK * 3 : topK;

  const rawResults = col768.query(queryEmbedding, fetchK);
  // ... score conversion, filtering, collapsing, output
}
```

### Pattern 2: Score Normalization

**What:** Zvec COSINE metric returns distance (0 = exact match, ascending = less similar). Convert to relevance score 0-1 where 1 = most relevant.

**Formula:**
```typescript
// Source: verified from src/services/vector-db.ts — COSINE distance semantics confirmed
function distanceToScore(distance: number): number {
  // COSINE distance ranges 0–2 in theory; in practice normalized vectors give 0–1
  // Clamp to [0, 1] to handle floating-point edge cases
  return Math.max(0, Math.min(1, 1 - distance));
}
```

**Important:** Zvec returns results sorted by distance ascending (most similar first). After converting to score (1 - distance), results will be sorted descending (highest score first). Do NOT re-sort — the order from Zvec is already correct.

### Pattern 3: Adjacent Chunk Collapsing

**What:** When multiple chunks from the same file appear in results, collapse adjacent chunks (by `chunkIndex`) into a single result with a merged line range.

**When to collapse:** Chunks are adjacent if `chunk[n+1].chunkIndex === chunk[n].chunkIndex + 1`. They overlap by 50 tokens (OVERLAP constant from chunker), so their line ranges naturally overlap or are contiguous.

**Score for merged result:** Use the highest (best) score among the collapsed chunks.

**Example:**
```typescript
// Source: designed from CONTEXT.md decisions + codebase knowledge 2026-02-22

interface SearchResult {
  file: string;
  lines: { start: number; end: number };
  score: number;
  text: string;
}

function collapseAdjacentChunks(rawResults: NormalizedResult[]): SearchResult[] {
  // Group by file
  const byFile = new Map<string, NormalizedResult[]>();
  for (const r of rawResults) {
    const existing = byFile.get(r.filePath) ?? [];
    existing.push(r);
    byFile.set(r.filePath, existing);
  }

  const collapsed: SearchResult[] = [];

  for (const [filePath, fileResults] of byFile) {
    // Sort by chunkIndex for adjacency detection
    fileResults.sort((a, b) => a.chunkIndex - b.chunkIndex);

    let group = [fileResults[0]];
    for (let i = 1; i < fileResults.length; i++) {
      const prev = group[group.length - 1];
      const curr = fileResults[i];
      // Adjacent if chunkIndex is consecutive
      if (curr.chunkIndex === prev.chunkIndex + 1) {
        group.push(curr);
      } else {
        collapsed.push(mergeGroup(filePath, group));
        group = [curr];
      }
    }
    collapsed.push(mergeGroup(filePath, group));
  }

  // Re-sort by best score descending
  collapsed.sort((a, b) => b.score - a.score);

  return collapsed;
}

function mergeGroup(filePath: string, group: NormalizedResult[]): SearchResult {
  return {
    file: filePath,
    lines: {
      start: group[0].lineStart,
      end: group[group.length - 1].lineEnd,
    },
    score: Math.max(...group.map(r => r.score)),
    // Concatenate texts — the last chunk's text starts where the previous ended
    // (overlap means some repetition; accept this for verbatim fidelity)
    text: group.length === 1 ? group[0].chunkText : group.map(r => r.chunkText).join('\n'),
  };
}
```

**Note on text concatenation:** Adjacent chunks overlap by 50 tokens. Verbatim concatenation will repeat ~50 tokens at each join boundary. This is acceptable per the decision "chunk text is returned verbatim" — AI agents can handle repeated context.

### Pattern 4: Post-Filters

**What:** Two post-filters applied after score normalization, before collapsing.

**Order:** score filter → dir filter → collapse → top-K limit.

```typescript
// Source: designed from CONTEXT.md decisions 2026-02-22

function applyFilters(
  results: NormalizedResult[],
  options: { dir?: string; threshold?: number; topK: number }
): NormalizedResult[] {
  let filtered = results;

  // Threshold filter: exclude scores below threshold
  if (options.threshold !== undefined) {
    filtered = filtered.filter(r => r.score >= options.threshold!);
  }

  // Dir filter: scope to path prefix (normalize to avoid trailing slash issues)
  if (options.dir) {
    const prefix = options.dir.replace(/\/$/, '') + '/';
    // Also match exact file name match (prefix without trailing slash)
    const exactPrefix = options.dir.replace(/\/$/, '');
    filtered = filtered.filter(r =>
      r.filePath.startsWith(prefix) || r.filePath === exactPrefix
    );
  }

  return filtered;
}
```

**Fetch multiplier:** When `--dir` or `--threshold` are active, fetch `topK * 3` from Zvec to account for filter losses. After filtering and collapsing, slice to `topK`.

### Pattern 5: Output Formats

**Default (JSON):**
```typescript
// Source: CONTEXT.md output schema decisions
const output = {
  query: text,
  results: collapsed.slice(0, topK),
  totalIndexed: -1,   // Not tracked in this phase; see Open Questions
  searchScope: options.dir ?? '.',
};
console.log(JSON.stringify(output));
```

**JSON result item structure:**
```typescript
{
  file: string,         // relative path (camelCase to match codebase style)
  lines: {
    start: number,      // 1-indexed
    end: number         // 1-indexed
  },
  score: number,        // 0-1, higher = more relevant
  text: string          // verbatim chunk text
}
```

**Empty results (valid JSON, not an error):**
```typescript
// When index is missing:
{ query, results: [], totalIndexed: 0, searchScope, message: "No indexed code found. Run `ez-search index .` first." }

// When results below threshold:
{ query, results: [], totalIndexed: N, searchScope, message: "No results above threshold." }

// When dir filter excludes everything:
{ query, results: [], totalIndexed: N, searchScope, message: "No results in the specified directory." }
```

**`--format text` human-readable:**
```
File: src/services/auth.ts | Lines: 10-45 | Relevance: 0.87
  <verbatim chunk text with 2-space indent>

File: src/middleware/jwt.ts | Lines: 1-30 | Relevance: 0.72
  <verbatim chunk text with 2-space indent>
```

This matches the SRCH-03 machine-readable format: `File: <path> | Lines: <start>-<end> | Relevance: <score>`.

### Pattern 6: CLI Flag Wiring

**Current state of `src/cli/index.ts`:**
- `query` command already has `--pretty`, `--top-k`, `--dir` registered
- `options.topK` is the parsed value (string, default `'10'`)
- Missing: `--threshold` and `--format text` flags

**Required changes to `src/cli/index.ts`:**
```typescript
program
  .command('query <text>')
  .description('Search the index with a natural language query')
  .option('--format <mode>', 'output format: json (default) | text', 'json')
  .option('-k, --top-k <n>', 'number of results to return', '10')
  .option('--dir <path>', 'scope search to a subdirectory')
  .option('--threshold <score>', 'minimum relevance score 0-1')
  .action(async (text, options) => {
    const { runQuery } = await import('./commands/query-cmd.js');
    await runQuery(text, options);
  });
```

**Note:** The existing `--pretty` flag on query in `index.ts` should be replaced by `--format text` to match CONTEXT.md decision. The `runQuery` signature in the stub shows `{ pretty?: boolean; topK: string; dir?: string }` — this type must be updated.

**Updated `runQuery` options type:**
```typescript
export async function runQuery(
  text: string,
  options: {
    format?: string;   // 'json' (default) | 'text'
    topK: string;      // parsed as int; default '10'
    dir?: string;      // path prefix filter
    threshold?: string; // parsed as float; optional
  }
): Promise<void>
```

### Pattern 7: Error Handling

**Errors are JSON to stdout, not stderr text:**
```typescript
// Source: matches pattern in index-cmd.ts
function outputError(message: string, format: string): void {
  if (format === 'text') {
    console.error(`Error: ${message}`);
    process.exit(1);
  } else {
    console.log(JSON.stringify({ status: 'error', message }));
    process.exit(1);
  }
}
```

**Error cases:**
- Zvec collection missing/corrupt: catch from `openProjectCollections`, output error JSON
- Embedding pipeline failure: catch from `createEmbeddingPipeline`, output error JSON
- Invalid `--top-k` value (non-integer): validate early, output error JSON
- Invalid `--threshold` value (out of 0-1 range): validate early, output error JSON

**Exit codes:**
- 0: successful query, even with zero results (per CONTEXT.md specifics)
- 1: actual error (no index, bad args, embedding failure)

### Anti-Patterns to Avoid

- **Querying with `topK` directly when filters are active:** If `--dir` or `--threshold` filter is active, Zvec's `topK` results may all be filtered out. Fetch `topK * 3` from Zvec, filter, then slice to `topK`.
- **Re-sorting after score conversion:** Zvec returns results sorted by distance ascending. Converting to score (1 - distance) preserves order descending. Don't re-sort before filtering.
- **Using `--pretty` instead of `--format text`:** The CLI stub has `--pretty` but CONTEXT.md decided on `--format text`. Replace, don't add both.
- **Opening collections from wrong directory:** `openProjectCollections` must be called with the indexed project root (CWD), not the `--dir` filter path. The `--dir` filter is applied to results metadata, not to collection location.
- **Collapsing non-adjacent chunks:** Only collapse chunks where `chunkIndex` differs by exactly 1. Non-adjacent same-file chunks should remain as separate results.
- **Crashing on empty index:** If the collection exists but has zero vectors, `col768.query()` returns `[]`. Handle gracefully with an empty results JSON response, not an exception.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Query embedding | Manual HTTP call to HuggingFace | `createEmbeddingPipeline('code').embed([text])` | Already implemented in model-router.ts |
| Vector similarity search | Custom cosine distance calculation | `col768.query(embedding, topK)` | Already implemented in vector-db.ts; HNSW indexed |
| .gitignore filtering | Manual glob matching | Not needed for query (metadata filtering only) | No file I/O in query path |
| Result pagination | Cursor-based offset system | Slice `collapsed.slice(0, topK)` | Simple limit is sufficient for this phase |
| Score normalization | Complex re-ranking | `1 - distance` (clamped to [0,1]) | COSINE distance is already semantic similarity |

**Key insight:** The query command is a thin orchestration layer. All computation primitives (embedding, vector search) are already implemented in services. The value added by Phase 4 is the pipeline wiring, score normalization, adjacent-chunk collapsing, and output formatting.

## Common Pitfalls

### Pitfall 1: Querying Against Wrong Project Directory

**What goes wrong:** `openProjectCollections(process.cwd())` opens the correct project, but if the user runs `ez-search query` from a subdirectory, `process.cwd()` returns the subdirectory. The storage hash (`resolveProjectStoragePath`) is based on the full path, so a different CWD produces a different storage path and misses the index.

**Why it happens:** `resolveProjectStoragePath` in `paths.ts` hashes the full resolved path. `ez-search index /project` creates storage under `/project`'s hash. `ez-search query` run from `/project/src` misses it.

**How to avoid:** For Phase 4, use `process.cwd()` consistently with the convention that users run both `index` and `query` from the same root. Document this in help text. Alternatively, walk up to find `.ez-search-cache` manifest file to determine the project root — but this is a Phase 5 concern. Keep it simple for Phase 4.

**Warning signs:** `col768.query()` returns empty results even after indexing.

### Pitfall 2: Fetch Count Too Low When Filters Active

**What goes wrong:** `col768.query(embedding, topK)` fetches exactly 10 results. `--dir ./src` filters out 8 of them. User gets 2 results when they expected up to 10.

**Why it happens:** Zvec doesn't know about path-prefix filters — it returns the globally best matches. Post-filtering reduces the effective count.

**How to avoid:** When `--dir` or `--threshold` is active, fetch `Math.min(topK * 3, 100)` from Zvec. After filtering and collapsing, slice to `topK`. The multiplier of 3 handles typical codebases where directory scoping filters ~60-70% of results.

**Warning signs:** `--dir` flag returns fewer results than `--top-k` even when many files in the directory are indexed.

### Pitfall 3: Float Precision in Score Output

**What goes wrong:** Score output like `0.9999999999999998` or `-2.220446049250313e-16` confuses downstream JSON parsers expecting clean floats.

**Why it happens:** IEEE 754 floating-point arithmetic in `1 - distance` for near-zero distances.

**How to avoid:** Round scores to 4 decimal places: `Math.round(score * 10000) / 10000`. This keeps scores clean without losing meaningful precision.

### Pitfall 4: Adjacent Chunk Text Has Duplicate Content

**What goes wrong:** Two adjacent chunks are collapsed. Their texts overlap by ~50 tokens (the OVERLAP constant). Naive concatenation with `\n` produces duplicate code at the join boundary.

**Why it happens:** The chunker uses 50-token overlap between consecutive windows. Both chunks contain the same 50-token overlap region.

**How to avoid:** Per CONTEXT.md decision, chunk text is returned verbatim. Accept the overlap in collapsed text — AI agents can handle repeated context. Do not attempt to detect and deduplicate the overlap (it requires the tokenizer to be loaded in the query path, which adds cost). Document this behavior.

**Alternative (not recommended):** For single-chunk results (non-collapsed), text is already verbatim and clean. Only collapsed multi-chunk results have overlap.

### Pitfall 5: `--dir` Prefix Not Normalized

**What goes wrong:** `--dir ./src` works but `--dir src` fails because `filePath` in metadata is stored as a relative path (e.g., `src/services/auth.ts`), and `./src/` prefix doesn't match `src/`.

**Why it happens:** `filePath` metadata is stored as the relative path from the project root (no leading `./`). If `--dir` is passed as `./src`, the prefix check fails.

**How to avoid:** Normalize `--dir` prefix: strip leading `./`, strip trailing `/`, then use `filePath.startsWith(normalizedPrefix + '/')` as the filter condition.

```typescript
function normalizeDirPrefix(dir: string): string {
  return dir.replace(/^\.\//, '').replace(/\/$/, '');
}
// Filter: filePath.startsWith(prefix + '/') || filePath === prefix
```

### Pitfall 6: Empty Zvec Collection Throws vs Returns Empty

**What goes wrong:** If the project has never been indexed, `openProjectCollections` creates empty collections. Calling `col768.query()` on an empty collection may throw or return `[]`. Behavior not verified.

**Why it happens:** Unknown — Zvec behavior on empty collection query is not documented in prior research.

**How to avoid:** Wrap `col768.query()` in try/catch. If it throws, treat as zero results and include a message about running `ez-search index` first. If it returns `[]`, return valid JSON with empty results and the same message.

## Code Examples

### Full Query Pipeline

```typescript
// src/cli/commands/query-cmd.ts — full implementation
// Source: designed from verified codebase + CONTEXT.md 2026-02-22

import * as path from 'path';

interface NormalizedResult {
  filePath: string;
  chunkIndex: number;
  lineStart: number;
  lineEnd: number;
  chunkText: string;
  score: number;
}

export async function runQuery(
  text: string,
  options: { format?: string; topK: string; dir?: string; threshold?: string }
): Promise<void> {
  const format = options.format ?? 'json';
  const topK = parseInt(options.topK, 10) || 10;
  const threshold = options.threshold !== undefined ? parseFloat(options.threshold) : undefined;
  const dir = options.dir ? options.dir.replace(/^\.\//, '').replace(/\/$/, '') : undefined;

  try {
    const { openProjectCollections } = await import('../../services/vector-db.js');
    const { createEmbeddingPipeline } = await import('../../services/model-router.js');

    const absProjectDir = process.cwd();
    const { col768 } = openProjectCollections(absProjectDir);

    // Embed the query (no prefix for Jina v2 symmetric model)
    const pipe = await createEmbeddingPipeline('code');
    const [queryEmbedding] = await pipe.embed([text]);
    await pipe.dispose();

    // Fetch extra to account for post-filter losses
    const hasFilters = dir !== undefined || threshold !== undefined;
    const fetchK = hasFilters ? Math.min(topK * 3, 100) : topK;

    // Query Zvec — results sorted by distance ascending (most similar first)
    let rawResults: ReturnType<typeof col768.query> = [];
    try {
      rawResults = col768.query(queryEmbedding, fetchK);
    } catch {
      // Empty collection — no results
    }

    // Normalize: convert distance to score
    const normalized: NormalizedResult[] = rawResults.map(r => ({
      filePath: String(r.metadata['filePath'] ?? ''),
      chunkIndex: Number(r.metadata['chunkIndex'] ?? 0),
      lineStart: Number(r.metadata['lineStart'] ?? 1),
      lineEnd: Number(r.metadata['lineEnd'] ?? 1),
      chunkText: String(r.metadata['chunkText'] ?? ''),
      score: Math.round(Math.max(0, Math.min(1, 1 - r.distance)) * 10000) / 10000,
    }));

    // Apply filters
    let filtered = normalized;
    if (threshold !== undefined) {
      filtered = filtered.filter(r => r.score >= threshold);
    }
    if (dir) {
      filtered = filtered.filter(r =>
        r.filePath.startsWith(dir + '/') || r.filePath === dir
      );
    }

    // Collapse adjacent chunks
    const collapsed = collapseAdjacentChunks(filtered).slice(0, topK);

    // Output
    if (format === 'text') {
      outputText(text, collapsed, dir ?? '.');
    } else {
      outputJson(text, collapsed, dir ?? '.', rawResults.length === 0);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (format === 'text') {
      console.error(`Error: ${message}`);
    } else {
      console.log(JSON.stringify({ status: 'error', message }));
    }
    process.exit(1);
  }
}
```

### Score Conversion

```typescript
// Source: verified Zvec COSINE distance semantics from src/services/vector-db.ts
// COSINE distance: 0 = exact match, higher = less similar
// Convert to score: 1 = most relevant, 0 = least relevant

function distanceToScore(distance: number): number {
  return Math.round(Math.max(0, Math.min(1, 1 - distance)) * 10000) / 10000;
}
```

### Adjacent Chunk Collapsing

```typescript
// Source: designed from CONTEXT.md — "adjacent chunks collapsed with continuous line range"

interface SearchResult {
  file: string;
  lines: { start: number; end: number };
  score: number;
  text: string;
}

function collapseAdjacentChunks(results: NormalizedResult[]): SearchResult[] {
  // Group by file
  const byFile = new Map<string, NormalizedResult[]>();
  for (const r of results) {
    const group = byFile.get(r.filePath) ?? [];
    group.push(r);
    byFile.set(r.filePath, group);
  }

  const collapsed: SearchResult[] = [];

  for (const [filePath, fileResults] of byFile) {
    fileResults.sort((a, b) => a.chunkIndex - b.chunkIndex);

    let group = [fileResults[0]];
    for (let i = 1; i < fileResults.length; i++) {
      const prev = group[group.length - 1];
      const curr = fileResults[i];
      if (curr.chunkIndex === prev.chunkIndex + 1) {
        group.push(curr);
      } else {
        collapsed.push(mergeGroup(filePath, group));
        group = [curr];
      }
    }
    collapsed.push(mergeGroup(filePath, group));
  }

  // Re-sort by score descending
  return collapsed.sort((a, b) => b.score - a.score);
}

function mergeGroup(filePath: string, group: NormalizedResult[]): SearchResult {
  const text = group.length === 1
    ? group[0].chunkText
    : group.map(r => r.chunkText).join('\n');
  return {
    file: filePath,
    lines: { start: group[0].lineStart, end: group[group.length - 1].lineEnd },
    score: Math.max(...group.map(r => r.score)),
    text,
  };
}
```

### JSON Output

```typescript
// Source: CONTEXT.md output schema

function outputJson(
  query: string,
  results: SearchResult[],
  searchScope: string,
  noIndex: boolean
): void {
  const out: Record<string, unknown> = {
    query,
    results,
    totalIndexed: -1, // Not tracked in this phase
    searchScope,
  };
  if (results.length === 0) {
    out['message'] = noIndex
      ? 'No indexed code found. Run `ez-search index .` first.'
      : 'No results found.';
  }
  console.log(JSON.stringify(out));
}
```

### Text Output (`--format text`)

```typescript
// Source: SRCH-03 format: "File: <path> | Lines: <start>-<end> | Relevance: <score>"

function outputText(query: string, results: SearchResult[], searchScope: string): void {
  if (results.length === 0) {
    console.log('No results found.');
    return;
  }
  for (const r of results) {
    console.log(`File: ${r.file} | Lines: ${r.lines.start}-${r.lines.end} | Relevance: ${r.score}`);
    const indented = r.text.split('\n').map(line => '  ' + line).join('\n');
    console.log(indented);
    console.log('');
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Stub returning nothing | Full pipeline: embed → search → format | Phase 4 | Users can actually query their indexed code |
| `--pretty` flag name | `--format text` flag | CONTEXT.md decision | Consistent with multi-format convention; old stub had `--pretty` |
| No threshold filter | `--threshold 0.5` optional filter | Phase 4 | Lets callers exclude low-confidence results |
| Separate chunks per file | Adjacent chunks collapsed | Phase 4 | Cleaner output when multiple chunks from same file match |

**Existing flag discrepancy:**
- `src/cli/index.ts` registers `--pretty` on the query command (from when the stub was created)
- CONTEXT.md decided on `--format text` (not `--pretty`)
- Resolution: Replace `--pretty` with `--format <mode>` in `index.ts`. Update the options type in `query-cmd.ts`.

## Open Questions

1. **`totalIndexed` field in JSON output**
   - What we know: CONTEXT.md specifies `{ query, results, totalIndexed, searchScope }` in the top-level wrapper. There is no manifest or vector count API to determine total indexed chunks quickly.
   - What's unclear: Should `totalIndexed` count files or chunks? How to get it without loading the manifest?
   - Recommendation: Set `totalIndexed: -1` for Phase 4 (sentinel for "not tracked"). The manifest is a JSON file at `.ez-search-cache` in the project root — loading it gives `Object.keys(manifest.files).length` for file count. Given the manifest is small JSON, this is cheap to load. Alternatively, skip and set to `-1`. Let planner decide.

2. **Zvec behavior on empty collection query**
   - What we know: `col768.query()` is called on a potentially empty collection (not yet indexed).
   - What's unclear: Does Zvec's `querySync` throw or return `[]` when the collection has zero vectors?
   - Recommendation: Wrap in try/catch. If it throws, treat as zero results. If it returns `[]`, handle as zero results. Both paths lead to empty results JSON.

3. **`--dir` with absolute paths**
   - What we know: `filePath` in metadata is stored as a relative path (e.g., `src/services/auth.ts`). The `--dir` flag in CONTEXT.md shows `--dir ./src` (relative).
   - What's unclear: What if user passes `--dir /absolute/path/to/src`?
   - Recommendation: Normalize `--dir` to relative form by stripping the project root prefix if the user passes an absolute path. Or document that `--dir` must be a relative path. Keep it simple for Phase 4 — just strip `./` prefix.

4. **Model loading time for query**
   - What we know: `createEmbeddingPipeline('code')` loads the Jina model from cache. From Phase 3 research, this takes time on first CLI invocation.
   - What's unclear: How long does model loading take in query context (no progress bar)?
   - Recommendation: No progress bar for query (unlike index). If model loading is slow (>2s), the user will see no output until results appear. This is acceptable for Phase 4. Phase 5 can add progress feedback if needed.

## Sources

### Primary (HIGH confidence — verified from codebase 2026-02-22)
- `/home/dev/work/ez-search/src/services/vector-db.ts` — `VectorCollection.query()` returns `QueryResult[]` with distance, metadata; COSINE distance semantics; outputFields include all needed metadata
- `/home/dev/work/ez-search/src/services/model-router.ts` — `createEmbeddingPipeline('code')`, `embed([text])` for single query; no prefix for Jina v2 (comment confirms symmetric model)
- `/home/dev/work/ez-search/src/services/chunker.ts` — `OVERLAP = 50` constant; chunk text stored verbatim; chunkIndex is 0-indexed
- `/home/dev/work/ez-search/src/cli/index.ts` — current query command registration; existing flags: `--pretty`, `--top-k`, `--dir`
- `/home/dev/work/ez-search/src/cli/commands/query-cmd.ts` — stub signature confirms options type to update
- `/home/dev/work/ez-search/.planning/phases/04-search-and-query/04-CONTEXT.md` — all implementation decisions

### Secondary (MEDIUM confidence)
- Phase 3 RESEARCH.md — Zvec COSINE semantics confirmed: "distance 0 = exact match, ascending = less similar. Sort ascending for ranking."
- Phase 3 RESEARCH.md — Chunk schema: `filePath`, `chunkIndex`, `lineStart`, `lineEnd`, `chunkText` all in metadata

### Tertiary (LOW confidence — not separately verified)
- Adjacent chunk collapsing approach: designed from first principles; the OVERLAP=50 token boundary behavior is inferred from chunker code, not measured
- Fetch multiplier of 3x for filtered queries: estimated; actual filter loss ratio depends on project structure

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all components verified in existing source
- Query pipeline: HIGH — embed + search + output all use existing verified APIs
- Score normalization: HIGH — COSINE distance semantics confirmed in prior research
- Adjacent chunk collapsing: MEDIUM — designed from CONTEXT.md decisions; edge cases (e.g., non-overlapping same-file results) are untested
- Filter post-processing: HIGH — path prefix and threshold filters are straightforward logic
- Fetch multiplier for filtered queries: LOW — 3x is a reasonable estimate, not benchmarked

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (stable; no external APIs; only internal codebase patterns)
