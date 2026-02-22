# Agent-Friendly ez-search — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make ez-search usable by any shell-capable AI agent with a single command, plus a skill file for discovery.

**Architecture:** Auto-index on query (detect NO_INDEX → run index pipeline → return results with indexing stats). Extract staleness calculation to shared service for reuse between status and query commands. Skill file as standalone markdown.

**Tech Stack:** TypeScript/Bun, Commander.js CLI, existing ez-search services

---

### Task 1: Extract `calcStaleness` to shared service

The staleness calculation currently lives in `status-cmd.ts:60-94`. Query needs it too. Extract to a shared service.

**Files:**
- Create: `src/services/staleness.ts`
- Modify: `src/cli/commands/status-cmd.ts:60-94`
- Test: `tests/unit/staleness.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/staleness.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { createTempDir, cleanupTempDir, writeFile } from '../helpers/fixtures.js';
import { saveManifest, loadManifest, hashText } from '../../src/services/manifest-cache';

describe('calcStaleness', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('returns 0 for empty manifest and empty directory', async () => {
    const { calcStaleness } = await import('../../src/services/staleness');
    const manifest = loadManifest(tmpDir);
    const result = await calcStaleness(tmpDir, manifest, true);
    expect(result).toBe(0);
  });

  test('detects new file not in manifest', async () => {
    const { calcStaleness } = await import('../../src/services/staleness');
    writeFile(tmpDir, 'hello.ts', 'console.log("hi")');
    const manifest = loadManifest(tmpDir); // empty manifest
    const result = await calcStaleness(tmpDir, manifest, true);
    expect(result).toBe(1);
  });

  test('detects deleted file in manifest but not on disk', async () => {
    const { calcStaleness } = await import('../../src/services/staleness');
    // Create a manifest with a file entry, but don't create the file
    const manifest = loadManifest(tmpDir);
    manifest.files['gone.ts'] = {
      mtime: Date.now(),
      size: 10,
      hash: 'abc123',
      chunks: [],
    };
    const result = await calcStaleness(tmpDir, manifest, true);
    expect(result).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/staleness.test.ts`
Expected: FAIL — module `../../src/services/staleness` not found

**Step 3: Write the implementation**

```typescript
// src/services/staleness.ts
/**
 * Shared staleness calculator — counts files that are new, modified, or deleted
 * relative to the manifest.
 */

import { existsSync } from 'fs';
import * as path from 'path';
import type { Manifest } from './manifest-cache.js';

/**
 * Count stale files: new files not in manifest, modified files, and deleted files.
 */
export async function calcStaleness(
  projectDir: string,
  manifest: Manifest,
  useIgnoreFiles: boolean,
): Promise<number> {
  const { scanFiles } = await import('./file-scanner.js');

  const scannedFiles = new Map<string, { mtimeMs: number }>();
  for await (const file of scanFiles(projectDir, { useIgnoreFiles })) {
    scannedFiles.set(file.relativePath, { mtimeMs: file.mtimeMs });
  }

  let stale = 0;

  // New or modified files
  for (const [relPath, scanned] of scannedFiles) {
    const entry = manifest.files[relPath];
    if (!entry) {
      stale++;
    } else if (entry.mtime !== scanned.mtimeMs) {
      stale++;
    }
  }

  // Deleted files (in manifest but no longer on disk)
  for (const relPath of Object.keys(manifest.files)) {
    if (!existsSync(path.join(projectDir, relPath))) {
      stale++;
    }
  }

  return stale;
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/staleness.test.ts`
Expected: PASS

**Step 5: Update status-cmd.ts to use shared service**

In `src/cli/commands/status-cmd.ts`:
- Remove the `calcStaleness` function (lines 60-94)
- Add import: `import { calcStaleness } from '../../services/staleness.js';`
- The call site at line 187 stays the same

**Step 6: Run full test suite**

Run: `bun test`
Expected: All tests pass (existing + new)

**Step 7: Also export the `Manifest` type from manifest-cache**

Check if `Manifest` is already exported from `src/services/manifest-cache.ts`. The staleness module needs to import it for the type signature. If not exported, add `export` to the interface declaration.

**Step 8: Commit**

```bash
git add src/services/staleness.ts tests/unit/staleness.test.ts src/cli/commands/status-cmd.ts src/services/manifest-cache.ts
git commit -m "refactor: extract calcStaleness to shared service"
```

---

### Task 2: Make `runIndex` return stats

Currently `runIndex` returns `Promise<void>` and logs output. It needs to return stats so `query-cmd` can include them in auto-index output.

**Files:**
- Modify: `src/cli/commands/index-cmd.ts:300-303, 510-553`

**Step 1: Define return type and modify signature**

At `src/cli/commands/index-cmd.ts`, change the function signature and return the stats object:

```typescript
// Line 300: change return type
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
): Promise<IndexStats | undefined> {
```

At the end of the function (after the output block, ~line 552), add:

```typescript
    return output as IndexStats;
```

The `catch` block calls `emitError` which does `process.exit`, so no return needed there.

**Step 2: Run full test suite to verify no regressions**

Run: `bun test`
Expected: All tests pass — adding a return value is backward-compatible

**Step 3: Commit**

```bash
git add src/cli/commands/index-cmd.ts
git commit -m "refactor: make runIndex return stats object"
```

---

### Task 3: Add auto-index to query command

The core feature. When `query` detects no index, auto-index before querying.

**Files:**
- Modify: `src/cli/commands/query-cmd.ts:23-50`
- Modify: `src/cli/index.ts:28-39` (add `--no-auto-index` option)
- Test: `tests/e2e/cli.test.ts`

**Step 1: Write the failing e2e test**

Add to `tests/e2e/cli.test.ts`:

```typescript
test('ez-search query auto-indexes when no index exists', async () => {
  // Create a temp dir with a TypeScript file
  const filePath = path.join(tmpDir, 'hello.ts');
  fs.writeFileSync(filePath, 'export function greet() { return "hello"; }');

  // Query without indexing first — should auto-index
  const { stdout, exitCode } = await runCLI(['query', 'greet function'], tmpDir);

  expect(exitCode).toBe(0);
  const parsed = JSON.parse(stdout);
  // Should have indexing stats
  expect(parsed.indexing).toBeDefined();
  expect(parsed.indexing.status).toBe('ok');
  expect(parsed.indexing.filesIndexed).toBeGreaterThanOrEqual(1);
  // Should have query results
  expect(parsed.query).toBe('greet function');
}, 120_000); // generous timeout for model loading

test('ez-search query --no-auto-index fails with NO_INDEX on unindexed dir', async () => {
  const filePath = path.join(tmpDir, 'hello.ts');
  fs.writeFileSync(filePath, 'export function greet() { return "hello"; }');

  const { stdout, exitCode } = await runCLI(['query', 'greet', '--no-auto-index'], tmpDir);

  expect(exitCode).not.toBe(0);
  const parsed = JSON.parse(stdout);
  expect(parsed.error).toBe(true);
  expect(parsed.code).toBe('NO_INDEX');
});
```

Add missing imports to the test file if needed: `import * as fs from 'fs';` and `import * as path from 'path';`

**Step 2: Run test to verify it fails**

Run: `bun test tests/e2e/cli.test.ts`
Expected: FAIL — `--no-auto-index` not recognized, auto-index not implemented

**Step 3: Add `--no-auto-index` flag to CLI**

In `src/cli/index.ts`, add option to query command (after line 35):

```typescript
  .option('--no-auto-index', 'disable automatic indexing when no index exists')
```

Update the action's options type to include `autoIndex: boolean` (Commander converts `--no-auto-index` to `autoIndex: false`).

**Step 4: Implement auto-index in query-cmd.ts**

Replace the NO_INDEX guard at lines 43-50 with auto-index logic:

```typescript
    // Guard: no indexed content — auto-index or fail
    if (totalIndexed === 0) {
      if (options.autoIndex === false) {
        const { emitError } = await import('../errors.js');
        emitError(
          { code: 'NO_INDEX', message: 'No indexed content found', suggestion: 'Run `ez-search index .` first' },
          options.format === 'text' ? 'text' : 'json'
        );
      }

      // Auto-index the project
      const { runIndex } = await import('./index-cmd.js');
      const indexStats = await runIndex('.', { ignore: true, quiet: true });

      // Reload manifest after indexing
      const freshManifest = loadManifest(projectDir);
      Object.assign(manifest, freshManifest);

      // Store indexing stats for output
      autoIndexResult = indexStats;

      // Recount totalIndexed
      totalIndexed = Object.keys(manifest.files).length;

      // If still no content after indexing, error out
      if (totalIndexed === 0) {
        const { emitError } = await import('../errors.js');
        emitError(
          { code: 'EMPTY_DIR', message: 'No supported files found to index', suggestion: 'Ensure the directory contains supported file types' },
          options.format === 'text' ? 'text' : 'json'
        );
      }
    }
```

Declare `autoIndexResult` near the top of the try block:

```typescript
    let autoIndexResult: Awaited<ReturnType<typeof import('./index-cmd.js').runIndex>> | undefined;
```

Actually, use the `IndexStats` type:

```typescript
    let autoIndexResult: import('./index-cmd.js').IndexStats | undefined;
```

Add `autoIndex` to the options type in the function signature:

```typescript
export async function runQuery(
  text: string,
  options: { format?: string; topK: string; dir?: string; threshold?: string; type?: string; autoIndex?: boolean }
): Promise<void> {
```

**Step 5: Include indexing stats in JSON output**

In the JSON output block (~line 193), add the indexing field:

```typescript
      const output: Record<string, unknown> = {
        query: text,
        totalIndexed,
        searchScope: options.dir ?? '.',
      };

      if (autoIndexResult) {
        output['indexing'] = {
          status: autoIndexResult.status,
          filesIndexed: autoIndexResult.filesIndexed,
          durationMs: autoIndexResult.durationMs,
        };
      }
```

For text format, add a line before results if auto-indexed:

```typescript
    if (options.format === 'text') {
      if (autoIndexResult) {
        console.log(`Auto-indexed ${autoIndexResult.filesIndexed} files in ${(autoIndexResult.durationMs / 1000).toFixed(1)}s\n`);
      }
      // ... rest of text output
```

**Step 6: Run tests**

Run: `bun test`
Expected: All tests pass including new e2e tests

**Step 7: Commit**

```bash
git add src/cli/index.ts src/cli/commands/query-cmd.ts tests/e2e/cli.test.ts
git commit -m "feat: auto-index on query when no index exists"
```

---

### Task 4: Add stale index detection to query output

**Files:**
- Modify: `src/cli/commands/query-cmd.ts`
- Test: `tests/e2e/cli.test.ts`

**Step 1: Write the failing test**

Add to `tests/e2e/cli.test.ts`:

```typescript
test('ez-search query includes stale info when index is outdated', async () => {
  // Create file, index it
  const filePath = path.join(tmpDir, 'hello.ts');
  fs.writeFileSync(filePath, 'export function greet() { return "hello"; }');
  await runCLI(['index', '.'], tmpDir);

  // Add a new file (making index stale)
  fs.writeFileSync(path.join(tmpDir, 'world.ts'), 'export function world() { return "world"; }');

  // Query — should report staleness
  const { stdout, exitCode } = await runCLI(['query', 'greet', '--no-auto-index'], tmpDir);

  expect(exitCode).toBe(0);
  const parsed = JSON.parse(stdout);
  expect(parsed.stale).toBe(true);
  expect(parsed.staleFileCount).toBeGreaterThanOrEqual(1);
}, 120_000);
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/e2e/cli.test.ts`
Expected: FAIL — `stale` field not in output

**Step 3: Implement stale detection in query-cmd.ts**

After the manifest load and type detection (before the query pipelines), add:

```typescript
    // Stale index detection
    const { calcStaleness } = await import('../../services/staleness.js');
    const staleFileCount = await calcStaleness(projectDir, manifest, true);
    const isStale = staleFileCount > 0;
```

In the JSON output block, add:

```typescript
      if (isStale) {
        output['stale'] = true;
        output['staleFileCount'] = staleFileCount;
      }
```

In the text output, add after auto-index message:

```typescript
      if (isStale) {
        console.log(`Warning: ${staleFileCount} file(s) changed since last index. Run \`ez-search index .\` to update.\n`);
      }
```

**Step 4: Run tests**

Run: `bun test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/cli/commands/query-cmd.ts tests/e2e/cli.test.ts
git commit -m "feat: stale index detection in query output"
```

---

### Task 5: Write the skill file

**Files:**
- Create: `skills/ez-search.md`

**Step 1: Write the skill file**

```markdown
---
name: ez-search
description: Semantic codebase search using local vector embeddings. Use when you need to find code or documentation by meaning rather than exact text match.
---

# ez-search — Semantic Codebase Search

## When to Use

Use ez-search when you need to **find code or docs by meaning**, not exact text:
- "Find where authentication is handled"
- "Where are database connections configured"
- "Find error handling patterns"

**Do NOT use for:** exact string matches (use `grep`/`rg`), filename lookups (use `find`/`glob`), simple symbol search (use language server).

## Quick Start

```bash
# Search — auto-indexes on first run
ez-search query "authentication middleware" --format json

# Search only code files
ez-search query "database connection pool" --format json --type code

# Search with relevance threshold
ez-search query "error handling" --format json --threshold 0.5 --top-k 5

# Scope to subdirectory
ez-search query "API routes" --format json --dir src/
```

## Commands

### query (primary command for agents)

```bash
ez-search query "<natural language>" --format json [options]
```

Options:
- `--format json` — **always use this** for structured output
- `--type code|text` — restrict to code or text files
- `--top-k <n>` — number of results (default: 10)
- `--threshold <score>` — minimum relevance 0-1 (recommend: 0.5)
- `--dir <path>` — scope to subdirectory
- `--no-auto-index` — fail instead of auto-indexing

Auto-indexes on first run. Subsequent queries are fast.

### index (explicit indexing)

```bash
ez-search index . --format json [--quiet] [--clear] [--type code|text|image]
```

Use when you want to explicitly rebuild the index (e.g., after major changes).

### status

```bash
ez-search status --format json
```

Check index health: file count, staleness, storage size.

## JSON Output Format

### Query Response

```json
{
  "query": "authentication",
  "totalIndexed": 150,
  "searchScope": ".",
  "code": [
    {
      "file": "src/auth.ts",
      "lines": { "start": 10, "end": 25 },
      "score": 0.92,
      "text": "function authenticate(token: string) { ... }"
    }
  ],
  "text": [
    {
      "file": "docs/auth.md",
      "score": 0.85,
      "text": "Authentication is handled via..."
    }
  ]
}
```

When auto-indexing occurs, includes:
```json
{
  "indexing": { "status": "ok", "filesIndexed": 42, "durationMs": 3200 },
  ...
}
```

When index is stale:
```json
{
  "stale": true,
  "staleFileCount": 5,
  ...
}
```

### Error Response

```json
{
  "error": true,
  "code": "NO_INDEX",
  "message": "No indexed content found",
  "suggestion": "Run `ez-search index .` first"
}
```

Error codes: `NO_INDEX`, `EMPTY_DIR`, `UNSUPPORTED_TYPE`, `CORRUPT_MANIFEST`, `GENERAL_ERROR`

## Tips

- Scores above 0.7 are strong matches; 0.5-0.7 are relevant; below 0.5 is noise
- Use `--type code` when looking for implementations (skips docs/READMEs)
- Use `--type text` when looking for documentation or prose
- For large repos, run `ez-search index .` explicitly once to avoid query-time latency
- The index lives in `.ez-search/` at the project root — add to `.gitignore`
```

**Step 2: Verify the skill file is syntactically correct**

Read it back and confirm the YAML frontmatter is valid and content is well-structured.

**Step 3: Commit**

```bash
git add skills/ez-search.md
git commit -m "feat: add ez-search skill file for AI agent discovery"
```

---

### Task 6: Final validation

**Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass

**Step 2: Manual smoke test**

```bash
# In a temp directory with some source files:
cd /tmp/test-project
echo 'export function hello() { return "world"; }' > hello.ts
ez-search query "hello function" --format json
# Should auto-index, then return results with indexing stats
```

**Step 3: Verify backward compatibility**

```bash
# Existing behavior preserved:
ez-search query "test" --no-auto-index  # Should fail with NO_INDEX in unindexed dir
ez-search index . --format json         # Should work as before
ez-search status --format json          # Should work as before
```

**Step 4: Final commit if any cleanup needed, then done**
