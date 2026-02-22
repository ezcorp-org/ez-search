# Phase 2: Foundation and Infrastructure - Research

**Researched:** 2026-02-22
**Domain:** CLI scaffolding, file scanning, vector DB layout, model router, lazy loading
**Confidence:** HIGH (most claims verified via live npm, official docs, and spike artifacts)

---

## Summary

Phase 2 builds four independently-testable modules: CLI skeleton, file scanner, vector DB wrapper, and model router. All core technical choices were de-risked in Phase 1 (Zvec, Transformers.js). This phase is primarily about wiring them into a coherent structure with the correct initialization order, storage layout, and UX patterns.

The standard stack is commander.js v14 for CLI parsing, the `ignore` package for gitignore-compatible filtering, Node.js built-in `fs.promises` + async generator for directory walking, and `@inquirer/prompts` for interactive model selection. Progress display uses `cli-progress` for download bars.

Lazy loading is the dominant architecture concern: heavy imports (Transformers.js, Zvec) must NOT appear at the top level of the CLI entry point — they must live inside command action handlers so that `--help` and `ez-search status` remain sub-200ms.

**Primary recommendation:** Dynamic `import()` inside command action handlers, not static top-level imports, for Transformers.js and Zvec. All infrastructure modules are ESM-compatible without workarounds since the project is already `"type": "module"`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `commander` | 14.0.3 | CLI parsing, subcommands, option definitions | Industry standard, TypeScript support, ESM+CJS exports |
| `ignore` | 7.0.5 | Parse and apply `.gitignore` / `.cursorignore` rules | Exact gitignore spec compliance; used by ESLint and Prettier |
| `@inquirer/prompts` | 8.3.0 | Interactive model selection prompt | Modern rewrite of Inquirer, ESM-native, full TypeScript types |
| `cli-progress` | 3.12.0 | Download progress bar (%, speed, ETA) | Most feature-complete Node.js progress library; multi-bar support |
| Node.js `crypto` (built-in) | — | Short hash for project path identifier | Built-in, no dependency; `crypto.hash('sha256', path).slice(0, 8)` |
| Node.js `fs/promises` (built-in) | — | Async directory walking | No dependency; `opendir` generator is streaming and cancellable |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@zvec/zvec` | 0.2.0 | Vector DB wrapper (already in package.json) | VectorDB service; each collection is a path on disk |
| `@huggingface/transformers` | 4.0.0-next.4 | Embedding model loading (already in package.json) | Model router; lazy-loaded inside command handlers |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ignore` (manual parse) | `globby` | globby is ESM-only (fine for us), but provides gitignore integration automatically; however, we need the ignore instance to be reusable for filtering mid-walk, not just as a glob filter — `ignore` gives more control |
| `cli-progress` | `ora` spinner | ora is for indeterminate spinners; cli-progress is for determinate download bars with ETA and percentage |
| `@inquirer/prompts` | legacy `inquirer` | Legacy `inquirer` is no longer actively developed; `@inquirer/prompts` is the current official package |

### Installation

```bash
npm install commander ignore @inquirer/prompts cli-progress
npm install --save-dev @types/cli-progress
```

Note: `commander`, `@inquirer/prompts`, and `ignore` all ship their own TypeScript types — no `@types/` packages needed for them.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── cli/
│   ├── index.ts          # Entry point — commander setup, NO heavy imports here
│   ├── commands/
│   │   ├── index-cmd.ts  # `index` command handler
│   │   ├── query-cmd.ts  # `query` command handler
│   │   └── status-cmd.ts # `status` command handler
├── services/
│   ├── file-scanner.ts   # Scanner module (walk + ignore filtering)
│   ├── vector-db.ts      # Zvec wrapper (open/create/query collections)
│   └── model-router.ts   # Transformers.js pipeline factory + WebGPU fallback
├── config/
│   ├── loader.ts         # Config file merge (project + user home)
│   └── paths.ts          # Storage path resolution (project hash, ~/.ez-search/)
└── types.ts              # Shared TypeScript types
```

### Pattern 1: Lazy Loading via Dynamic Import

**What:** Heavy modules (Transformers.js, Zvec) are imported with `import()` inside command action handlers, not at the top level.

**When to use:** Any import that triggers ONNX model loading, native bindings, or heavy initialization.

**Example:**

```typescript
// src/cli/index.ts — CORRECT: no heavy imports at top level
import { Command } from 'commander';

const program = new Command();

program
  .command('index <path>')
  .description('Index files at path')
  .action(async (targetPath, options) => {
    // Heavy imports only happen when 'index' command is actually run
    const { runIndex } = await import('./commands/index-cmd.js');
    await runIndex(targetPath, options);
  });

program.parse();
```

```typescript
// src/cli/commands/index-cmd.ts — heavy imports live here
import { createRequire } from 'module';
import { env, pipeline } from '@huggingface/transformers';
// ... zvec via createRequire etc.
```

**Why:** Commander parses arguments and runs action handlers. If heavy imports are at the top of `index.ts`, they execute during argument parsing — before the user's subcommand is known. Dynamic `import()` inside the action delays execution until after parsing.

### Pattern 2: File Scanner with Multi-Source Ignores

**What:** Stack multiple `ignore` instances — one for built-ins, one for `.gitignore`, one for `.cursorignore`. When `--no-ignore` is passed, skip the gitignore/cursorignore instances only (built-in exclusions can be disabled separately or kept).

**When to use:** File scanning in the `index` command.

**Example:**

```typescript
// Source: https://github.com/kaelzhang/node-ignore
import ignore from 'ignore';
import { readFileSync, existsSync } from 'fs';

function buildIgnoreFilter(rootDir: string, useIgnoreFiles: boolean) {
  const ig = ignore();

  // Built-in exclusions always applied (unless --no-ignore also covers these)
  ig.add(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
          '*.lock', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
          '.DS_Store', '*.min.js', '*.min.css']);

  if (useIgnoreFiles) {
    for (const filename of ['.gitignore', '.cursorignore']) {
      const filePath = `${rootDir}/${filename}`;
      if (existsSync(filePath)) {
        ig.add(readFileSync(filePath).toString());
      }
    }
  }

  return ig;
}
```

**Critical path note:** `ignore` requires paths **relative to the root** with no leading `./`. Pass `path.relative(rootDir, absolutePath)`.

### Pattern 3: Async Generator Directory Walk

**What:** Use `fs.promises.opendir()` as an async generator for streaming, cancellable directory traversal.

**When to use:** File scanning — avoids loading all paths into memory before filtering.

**Example:**

```typescript
import { promises as fs } from 'fs';
import path from 'path';

async function* walkDir(dir: string, rootDir: string, ignoreFilter: ReturnType<typeof ignore>): AsyncGenerator<string> {
  for await (const entry of await fs.opendir(dir)) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(rootDir, fullPath);

    // Skip symlinks to avoid cycles (decided: skip symlinks in Phase 2)
    if (entry.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      if (!ignoreFilter.ignores(relPath + '/')) {
        yield* walkDir(fullPath, rootDir, ignoreFilter);
      }
    } else if (entry.isFile()) {
      if (!ignoreFilter.ignores(relPath)) {
        yield fullPath;
      }
    }
  }
}
```

### Pattern 4: Zvec Multi-Collection Layout

**What:** Each model type gets its own Zvec collection directory under the project's storage dir.

**When to use:** VectorDB service initialization.

**Verified disk structure (from live test):**

```
~/.ez-search/<project-name>-<hash>/
├── col-768/            # 768-dim collection (code + text models)
│   ├── 0               # HNSW index shard
│   ├── del.0           # deletion markers
│   ├── idmap.0/        # RocksDB id mapping
│   └── manifest.0
└── col-512/            # 512-dim collection (image models, future)
    └── ...
```

```typescript
// Source: spike/zvec-spike.ts + live disk test
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ZVecCreateAndOpen, ZVecCollectionSchema, ZVecDataType, ZVecIndexType, ZVecMetricType } = require('@zvec/zvec');

function openCollection(storagePath: string, name: string, dim: number) {
  const schema = new ZVecCollectionSchema({
    name,
    vectors: {
      name: 'embedding',
      dataType: ZVecDataType.VECTOR_FP32,
      dimension: dim,
      indexParams: {
        indexType: ZVecIndexType.HNSW,
        metricType: ZVecMetricType.COSINE,
        m: 50,
        efConstruction: 500,
      },
    },
    fields: [
      { name: 'filePath', dataType: ZVecDataType.STRING },
      { name: 'chunkIndex', dataType: ZVecDataType.INT32 },
    ],
  });
  return ZVecCreateAndOpen(storagePath, schema);
}
```

### Pattern 5: Project Path Hashing

**What:** Deterministic 8-char hash of the absolute project path to uniquely identify the storage directory.

**Example:**

```typescript
import crypto from 'node:crypto';
import path from 'path';
import os from 'os';

function resolveProjectStoragePath(projectDir: string): string {
  const absPath = path.resolve(projectDir);
  const projectName = path.basename(absPath);
  const hash = crypto.hash('sha256', absPath).slice(0, 8);
  return path.join(os.homedir(), '.ez-search', `${projectName}-${hash}`);
}
```

### Pattern 6: Model Router with WebGPU-to-CPU Fallback

**What:** Try WebGPU first; catch and fall back to CPU q8. This pattern is proven from Phase 1 spike.

**Example:**

```typescript
// Source: spike/transformers-spike.ts (confirmed working on NixOS)
import { pipeline, env } from '@huggingface/transformers';

async function createPipeline(modelId: string, cacheDir: string) {
  env.cacheDir = cacheDir;
  env.allowRemoteModels = true;

  try {
    const pipe = await pipeline('feature-extraction', modelId, {
      device: 'webgpu',
      dtype: 'fp32',
      progress_callback: makeProgressCallback(),
    });
    console.error('Using WebGPU');
    return { pipe, backend: 'webgpu' as const };
  } catch {
    const pipe = await pipeline('feature-extraction', modelId, {
      device: 'cpu',    // NOT 'wasm' — wasm is browser-only
      dtype: 'q8',
      progress_callback: makeProgressCallback(),
    });
    console.error('Using CPU');
    return { pipe, backend: 'cpu' as const };
  }
}
```

### Pattern 7: Download Progress Bar

**What:** Use `progress_callback` from Transformers.js to feed `cli-progress` bars during model download.

**Example:**

```typescript
import cliProgress from 'cli-progress';

function makeProgressCallback(barContainer: cliProgress.MultiBar) {
  const bars = new Map<string, cliProgress.SingleBar>();

  return (info: ProgressInfo) => {
    if (info.status === 'initiate') {
      const bar = barContainer.create(100, 0, { filename: info.file });
      bars.set(info.file, bar);
    } else if (info.status === 'progress') {
      bars.get(info.file)?.update(info.progress);
    } else if (info.status === 'done') {
      bars.get(info.file)?.update(100);
    }
  };
}
```

**Warning:** Progress callbacks occasionally arrive without `status`/`name`/`file` fields (known Transformers.js issue #1401). Guard all access.

### Pattern 8: Interactive Model Selection

**What:** Use `@inquirer/prompts` checkbox with `checked: true` on all items by default.

**Example:**

```typescript
import { checkbox } from '@inquirer/prompts';

const selected = await checkbox({
  message: 'Select models to install (space to toggle, enter to confirm):',
  choices: [
    { value: 'jinaai/jina-embeddings-v2-base-code', name: 'Code model (768-dim, ~130MB)', checked: true },
    { value: 'nomic-ai/nomic-embed-text-v1.5',      name: 'Text model (768-dim, ~140MB)', checked: true },
  ],
});
```

### Anti-Patterns to Avoid

- **Static import of Transformers.js at CLI entry:** `import { pipeline } from '@huggingface/transformers'` at the top of `src/cli/index.ts` will cause model scanning to start on every `--help` or `status` call.
- **`device: 'wasm'` in Node.js:** `wasm` is browser-only. Use `device: 'cpu'` for Node.js CPU fallback.
- **`require('@zvec/zvec')` in ESM without createRequire:** Will throw `require is not defined`. Use `createRequire(import.meta.url)`.
- **Passing absolute paths to `ignore`:** The `ignore` package requires relative paths with no leading `./`. Absolute paths or `./`-prefixed paths will throw.
- **Colons in Zvec document IDs:** Zvec rejects IDs containing colons. Use `file_123` or `file-abc`, never `file:123`.
- **Skipping `optimizeSync` after bulk inserts:** Query performance degrades 10x without it. Always call after inserting a batch.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| .gitignore rule parsing | Custom regex matcher | `ignore` package | gitignore spec has ~20 edge cases (anchoring, negation, `**` vs `*`) |
| CLI argument/option parsing | `process.argv` slice | `commander` | Error messages, auto-help, TypeScript types |
| Download progress bar | Process.stdout.write loops | `cli-progress` | ETA calculation, multi-bar, cursor management, resize handling |
| Interactive checkboxes | readline raw mode | `@inquirer/prompts` | Raw mode TTY management, ANSI rendering, ctrl+c handling |
| Project path uniqueness | Name collision guessing | `crypto.hash` SHA-256 truncated | Deterministic, collision-free across different paths with the same basename |
| WebGPU fallback detection | `navigator.gpu` checks | try/catch around `device: 'webgpu'` | Transformers.js throws on unavailable WebGPU; catching is the documented pattern |

**Key insight:** The gitignore spec is deceptively complex. The `ignore` package has 500+ unit tests for edge cases. Do not reimplement it.

---

## Common Pitfalls

### Pitfall 1: Cold Start Regression from Top-Level Imports

**What goes wrong:** `--help` or `status` takes 2–5 seconds because Transformers.js or Zvec native bindings load at module parse time.

**Why it happens:** Static `import` statements execute eagerly at module initialization. Even if the function that uses the pipeline is never called, the module-level side effects of `@huggingface/transformers` and `@zvec/zvec` (native binary loading) run.

**How to avoid:** Keep `src/cli/index.ts` import-free of heavy modules. Use dynamic `import()` inside action handlers only.

**Warning signs:** Timing `ez-search --help` with `time ez-search --help` takes >500ms.

### Pitfall 2: `ignore` Path Format Errors

**What goes wrong:** `ignore` silently fails to match (or throws) when paths start with `./` or are absolute.

**Why it happens:** The `ignore` package strictly requires paths relative to the `.gitignore` root, with no leading `./`.

**How to avoid:** Always call `path.relative(rootDir, absolutePath)` before passing to `ig.ignores()`.

**Warning signs:** Files in `node_modules` still appear in the scan results even though the rule is set.

### Pitfall 3: Directory-level Ignore vs File-level Ignore

**What goes wrong:** Walking into `node_modules/` even though it's in `.gitignore`.

**Why it happens:** If you only check `ig.ignores(relPath)` for files, you miss the directory check that would prune the traversal before descending.

**How to avoid:** For directories, check `ig.ignores(relPath + '/')` (trailing slash signals directory in gitignore). Short-circuit the recursion if matched.

### Pitfall 4: `env.cacheDir` Must Be Set Before First `pipeline()` Call

**What goes wrong:** Models download to the wrong location if `cacheDir` is set after the first pipeline call.

**Why it happens:** The first `pipeline()` call initializes the cache. Subsequent `cacheDir` assignments have no effect on the already-initialized model.

**How to avoid:** Set `env.cacheDir` immediately after importing `env`, before any `pipeline()` call.

### Pitfall 5: ZVecCreateAndOpen Fails if Path Directory Does Not Exist

**What goes wrong:** `ZVecCreateAndOpen('/home/user/.ez-search/myproject-a1b2c3d4/col-768', schema)` throws if `~/.ez-search/myproject-a1b2c3d4/` doesn't exist yet.

**Why it happens:** Zvec creates the collection directory but not its parent.

**How to avoid:** Call `fs.mkdirSync(parentDir, { recursive: true })` before `ZVecCreateAndOpen`.

### Pitfall 6: Commander v14 Requires Node.js v20+

**What goes wrong:** Commander 14 fails to run on older Node.js versions.

**Why it happens:** Breaking change in commander v14.

**How to avoid:** The project runs Node.js v22 (confirmed), so this is not a problem. Add `"engines": { "node": ">=20" }` to `package.json` as a guard.

### Pitfall 7: Progress Callback Missing Fields

**What goes wrong:** `TypeError: Cannot read property 'file' of undefined` inside progress callback.

**Why it happens:** Transformers.js occasionally emits progress events without `status`, `name`, or `file` fields (issue #1401).

**How to avoid:** Guard all field accesses: `if (info.status === 'progress' && info.file && info.progress != null)`.

---

## Code Examples

### CLI Entry Point Skeleton (Lazy Loading)

```typescript
// src/cli/index.ts
// Source: commander.js README + lazy loading pattern
import { Command } from 'commander';

const program = new Command();

program
  .name('ez-search')
  .description('Semantic codebase search')
  .version('0.1.0');

program
  .command('index <path>')
  .description('Index files at the given path')
  .option('--no-ignore', 'Disable .gitignore/.cursorignore exclusion')
  .option('-q, --quiet', 'Suppress status output')
  .action(async (targetPath, options) => {
    const { runIndex } = await import('./commands/index-cmd.js');
    await runIndex(targetPath, options);
  });

program
  .command('query <text>')
  .description('Query the index semantically')
  .option('--pretty', 'Human-readable output (default: JSON)')
  .option('-n, --top <n>', 'Number of results', '10')
  .action(async (text, options) => {
    const { runQuery } = await import('./commands/query-cmd.js');
    await runQuery(text, options);
  });

program
  .command('status')
  .description('Show index status')
  .action(async () => {
    const { runStatus } = await import('./commands/status-cmd.js');
    await runStatus();
  });

program.parse();
```

### File Scanner Core

```typescript
// src/services/file-scanner.ts
import ignore from 'ignore';
import { readFileSync, existsSync } from 'fs';
import { promises as fsp } from 'fs';
import path from 'path';

const BUILTIN_EXCLUSIONS = [
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  '.cache', 'coverage', '.nyc_output',
  '*.lock', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  '.DS_Store', 'Thumbs.db',
  '*.min.js', '*.min.css', '*.map',
];

const EXTENSION_MAP: Record<string, 'code' | 'text' | 'image'> = {
  '.ts': 'code', '.tsx': 'code', '.js': 'code', '.jsx': 'code',
  '.py': 'code', '.go': 'code', '.rs': 'code', '.java': 'code',
  '.c': 'code', '.cpp': 'code', '.h': 'code',
  '.md': 'text', '.txt': 'text', '.rst': 'text', '.mdx': 'text',
  '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image', '.webp': 'image',
};

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  type: 'code' | 'text' | 'image';
  sizeBytes: number;
}

export interface ScanOptions {
  useIgnoreFiles: boolean;  // false when --no-ignore
  typeFilter?: 'code' | 'text' | 'image';  // --type flag
}

export async function* scanFiles(
  rootDir: string,
  opts: ScanOptions,
): AsyncGenerator<ScannedFile> {
  const ig = ignore().add(BUILTIN_EXCLUSIONS);

  if (opts.useIgnoreFiles) {
    for (const filename of ['.gitignore', '.cursorignore']) {
      const filePath = path.join(rootDir, filename);
      if (existsSync(filePath)) {
        ig.add(readFileSync(filePath).toString());
      }
    }
  }

  yield* walkDir(rootDir, rootDir, ig, opts);
}

async function* walkDir(
  dir: string,
  rootDir: string,
  ig: ReturnType<typeof ignore>,
  opts: ScanOptions,
): AsyncGenerator<ScannedFile> {
  for await (const entry of await fsp.opendir(dir)) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(rootDir, fullPath);

    if (entry.isSymbolicLink()) continue;  // skip symlinks — no cycle risk

    if (entry.isDirectory()) {
      if (!ig.ignores(relPath + '/') && !ig.ignores(relPath)) {
        yield* walkDir(fullPath, rootDir, ig, opts);
      }
    } else if (entry.isFile()) {
      if (ig.ignores(relPath)) continue;

      const ext = path.extname(entry.name).toLowerCase();
      const fileType = EXTENSION_MAP[ext];
      if (!fileType) continue;  // unknown extension — skip
      if (opts.typeFilter && fileType !== opts.typeFilter) continue;

      const stat = await fsp.stat(fullPath);
      yield { absolutePath: fullPath, relativePath: relPath, type: fileType, sizeBytes: stat.size };
    }
  }
}
```

### Storage Path Resolution

```typescript
// src/config/paths.ts
import crypto from 'node:crypto';
import path from 'path';
import os from 'os';

export function resolveProjectStoragePath(projectDir: string): string {
  const absPath = path.resolve(projectDir);
  const projectName = path.basename(absPath);
  // 8-char SHA-256 prefix — sufficiently unique for project dirs
  const hash = crypto.hash('sha256', absPath).slice(0, 8);
  return path.join(os.homedir(), '.ez-search', `${projectName}-${hash}`);
}

export function resolveModelCachePath(): string {
  return path.join(os.homedir(), '.ez-search', 'models');
}
```

### Zvec Collections Service

```typescript
// src/services/vector-db.ts
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const {
  ZVecCreateAndOpen, ZVecCollectionSchema, ZVecDataType,
  ZVecIndexType, ZVecMetricType, ZVecInitialize, ZVecLogLevel, isZVecError,
} = require('@zvec/zvec') as typeof import('@zvec/zvec');

ZVecInitialize({ logLevel: ZVecLogLevel.WARN });

export function openProjectCollections(storageDir: string) {
  // Ensure parent exists before ZVecCreateAndOpen
  mkdirSync(storageDir, { recursive: true });

  const col768Schema = new ZVecCollectionSchema({
    name: 'embeddings-768',
    vectors: {
      name: 'embedding',
      dataType: ZVecDataType.VECTOR_FP32,
      dimension: 768,
      indexParams: {
        indexType: ZVecIndexType.HNSW,
        metricType: ZVecMetricType.COSINE,
        m: 50,
        efConstruction: 500,
      },
    },
    fields: [
      { name: 'filePath', dataType: ZVecDataType.STRING },
      { name: 'modelId',  dataType: ZVecDataType.STRING },
    ],
  });

  const col768 = ZVecCreateAndOpen(path.join(storageDir, 'col-768'), col768Schema);
  return { col768 };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `inquirer` package | `@inquirer/prompts` | 2023 rewrite | Legacy `inquirer` is maintenance-only; use new package |
| `Xenova/` model mirrors | Official HuggingFace IDs (`jinaai/`, `nomic-ai/`) | ~2024 | Xenova mirrors return 401; use official IDs only |
| `device: 'wasm'` for CPU | `device: 'cpu'` | Transformers.js v3+ | `wasm` is browser-only in Node.js context |
| CJS `require` for everything | ESM `import` + `createRequire` for CJS-only packages | Node 12+ | `@zvec/zvec` is CJS; use `createRequire` in ESM projects |
| `env.cacheDir = './models'` | `env.cacheDir = path.join(os.homedir(), '.ez-search', 'models')` | This project | Models shared globally across projects |

**Deprecated/outdated:**
- `inquirer` (legacy): still works but not actively developed; all new work goes to `@inquirer/prompts`
- `globby` for gitignore integration: adds a dependency; for ez-search's walk+filter pattern, `ignore` + manual walk gives more control over tree pruning

---

## Open Questions

1. **`ignore` directory trailing-slash behavior at walk time**
   - What we know: `ignore` spec says trailing `/` means "directory only" in gitignore
   - What's unclear: Whether `ig.ignores('node_modules/')` and `ig.ignores('node_modules')` both work when the pattern is `node_modules` (no trailing slash)
   - Recommendation: Test both in the file-scanner unit tests. Check both with and without trailing slash when evaluating directories.

2. **`env.cacheDir` and the `~/.cache/huggingface/hub/` default**
   - What we know: Default is `./node_modules/@huggingface/transformers/.cache/`; `env.cacheDir` overrides it
   - What's unclear: Whether `HF_HOME` env var also influences this in v4.0.0-next.4
   - Recommendation: Set `env.cacheDir` explicitly to `~/.ez-search/models/` in the model router. Don't rely on env vars.

3. **`ZVecCreateAndOpen` re-opening an existing collection**
   - What we know: From the spike, `ZVecCreateAndOpen` with the same path and schema works to create
   - What's unclear: What happens when re-opening an existing collection with a schema that differs (e.g., after a format change)
   - Recommendation: Document the schema version in a JSON metadata file adjacent to the collection dirs. Phase 2 doesn't need migration logic but should reserve the spot.

---

## Sources

### Primary (HIGH confidence)

- Live npm registry queries (2026-02-22): `commander@14.0.3`, `ignore@7.0.5`, `@inquirer/prompts@8.3.0`, `cli-progress@3.12.0`
- `/home/dev/work/ez-search/spike/zvec-spike.ts` — confirmed CRUD patterns, ID constraints, `createRequire` pattern
- `/home/dev/work/ez-search/spike/transformers-spike.ts` — confirmed `device: 'cpu'`, official model IDs, `env.cacheDir` usage
- Live zvec disk layout test (2026-02-22) — confirmed each collection is its own directory; parent directory must exist
- [Transformers.js env API docs](https://huggingface.co/docs/transformers.js/en/api/env) — confirmed `env.cacheDir`, `env.localModelPath` properties
- [inquirer checkbox package](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/checkbox) — confirmed `checked: true` API on choices

### Secondary (MEDIUM confidence)

- [commander.js changelog](https://github.com/tj/commander.js/blob/master/CHANGELOG.md) — confirmed v14.0.0 changes, Node.js v20 requirement
- [node-ignore GitHub](https://github.com/kaelzhang/node-ignore) — confirmed API patterns, deprecated `addIgnoreFile()`
- [Transformers.js Node.js tutorial](https://huggingface.co/docs/transformers.js/en/tutorials/node) — singleton pattern, `env.cacheDir` placement

### Tertiary (LOW confidence)

- WebSearch results on cursorignore format — confirmed gitignore-compatible syntax (multiple blog sources, consistent)
- WebSearch results on progress_callback ProgressInfo union type — confirmed field names from issue tracker (#1401, #1312)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified via live npm queries
- Architecture: HIGH — patterns derived from Phase 1 spike code that was already executed successfully
- Pitfalls: HIGH — most from direct spike experience; directory-ignore and cacheDir placement from official docs
- Progress callback fields: MEDIUM — confirmed from issue tracker and type definitions, not from running code

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (stable libraries; `@huggingface/transformers` at `next` tag is more volatile)
