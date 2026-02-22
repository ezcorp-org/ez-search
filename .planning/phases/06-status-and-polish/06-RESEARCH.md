# Phase 6: Status and Polish - Research

**Researched:** 2026-02-23
**Domain:** CLI status reporting, error handling normalization, disk size calculation
**Confidence:** HIGH

---

## Summary

Phase 6 is predominantly a codebase integration task — no new external dependencies are needed. The work is: (1) implement `runStatus()` which is currently a stub, (2) normalize error output across all three commands to the agreed structured format, and (3) add `--format` to the `status` CLI registration.

All the primitives needed already exist: `loadManifest`, `resolveProjectStoragePath`, `EXTENSION_MAP`, `MANIFEST_FILENAME`. The status command reads the manifest from `<cwd>/.ez-search-cache`, derives per-type counts by inspecting file extensions against `EXTENSION_MAP`, computes `lastIndexed` from the manifest file's mtime, calculates disk size via recursive `readdir+stat`, and detects staleness by comparing current file mtimes against manifest entries.

The error-handling work touches `index-cmd.ts` and `query-cmd.ts` to replace the current ad-hoc `{ status: 'error', message }` / bare `Error: msg` patterns with the new structured `{ error: true, code, message, suggestion }` format. A shared `formatError()` utility should be extracted to enforce the contract across all commands.

**Primary recommendation:** Extract a shared error utility first, then implement `runStatus()`, then update `index-cmd` and `query-cmd` catch blocks to use the shared utility.

---

## Standard Stack

No new dependencies required. All work uses existing packages.

### Core (already installed)
| Library | Purpose | Notes |
|---------|---------|-------|
| `node:fs/promises` | Recursive dir size, manifest stat | `readdir({recursive:true})` available on Node 20+ (project requires 20+) |
| `node:path` | Path manipulation | Already used everywhere |
| `commander` | CLI flag registration | `status` command needs `--format` option added |

### Supporting (already in codebase)
| Module | Purpose |
|--------|---------|
| `src/services/manifest-cache.ts` | `loadManifest`, `MANIFEST_FILENAME`, `saveManifest` |
| `src/config/paths.ts` | `resolveProjectStoragePath` |
| `src/types.ts` | `EXTENSION_MAP`, `FileType` |

### New file needed
| File | Purpose |
|------|---------|
| `src/cli/errors.ts` | Shared structured error formatting utility |

**Installation:** No `npm install` needed.

---

## Architecture Patterns

### Recommended Project Structure (additions only)
```
src/
├── cli/
│   ├── errors.ts          # NEW: shared error formatting
│   ├── index.ts           # MODIFY: add --format to status command
│   └── commands/
│       ├── status-cmd.ts  # IMPLEMENT: replace stub
│       ├── index-cmd.ts   # MODIFY: error format in catch block
│       └── query-cmd.ts   # MODIFY: error format in catch block
```

### Pattern 1: Shared Error Utility
**What:** A module-level function that produces both JSON and text error output and sets exit code.
**When to use:** Every `catch` block in every command handler.

```typescript
// src/cli/errors.ts

export type ErrorCode =
  | 'NO_INDEX'
  | 'EMPTY_DIR'
  | 'UNSUPPORTED_TYPE'
  | 'CORRUPT_MANIFEST'
  | 'GENERAL_ERROR';

export interface StructuredError {
  error: true;
  code: ErrorCode;
  message: string;
  suggestion: string;
}

export function emitError(
  opts: { code: ErrorCode; message: string; suggestion: string },
  format: 'json' | 'text',
  exitCode: number = 1
): never {
  if (format === 'text') {
    console.error(`Error: ${opts.message}. Try: ${opts.suggestion}`);
  } else {
    console.log(JSON.stringify({ error: true, code: opts.code, message: opts.message, suggestion: opts.suggestion }));
  }
  process.exit(exitCode);
}
```

The `never` return type lets TypeScript understand control flow ends, eliminating the need for dummy returns after error calls.

### Pattern 2: Status Command Data Collection
**What:** Read manifest from cwd, derive all stats without opening Zvec collections.
**When to use:** `runStatus()` implementation.

```typescript
// src/cli/commands/status-cmd.ts

import * as path from 'path';
import * as fsp from 'fs/promises';
import { existsSync, statSync } from 'fs';

export async function runStatus(options: { format?: string }): Promise<void> {
  const projectDir = process.cwd();

  // 1. Check manifest exists — if not, emit NO_INDEX error
  const { MANIFEST_FILENAME, loadManifest } = await import('../../services/manifest-cache.js');
  const manifestPath = path.join(projectDir, MANIFEST_FILENAME);

  if (!existsSync(manifestPath)) {
    const { emitError } = await import('../errors.js');
    emitError(
      { code: 'NO_INDEX', message: 'No index found in current directory', suggestion: 'Run: ez-search index .' },
      options.format === 'text' ? 'text' : 'json',
      2  // exit code 2 = no index
    );
  }

  // 2. Load manifest (safely — loadManifest never throws)
  const manifest = loadManifest(projectDir);

  // 3. lastIndexed = mtime of the manifest file (ISO 8601)
  const manifestStat = statSync(manifestPath);
  const lastIndexed = new Date(manifestStat.mtimeMs).toISOString();

  // 4. Per-type counts from manifest entries
  // (see Pattern 3 below)

  // 5. Index size = recursive stat of storagePath
  const { resolveProjectStoragePath } = await import('../../config/paths.js');
  const storagePath = resolveProjectStoragePath(projectDir);
  const indexSizeBytes = await calcDirSize(storagePath);

  // 6. Staleness: scan cwd, compare to manifest
  const staleCount = await calcStaleness(projectDir, manifest, options);

  // 7. Output
}
```

### Pattern 3: Per-Type Count Derivation
**What:** Derive per-type file/chunk counts from manifest by looking up each file path's extension in `EXTENSION_MAP`.
**When to use:** `runStatus()` body.

```typescript
import { EXTENSION_MAP } from '../../types.js';

type TypeBreakdown = { files: number; chunks: number };
const breakdown: Record<'code' | 'text' | 'image', TypeBreakdown> = {
  code:  { files: 0, chunks: 0 },
  text:  { files: 0, chunks: 0 },
  image: { files: 0, chunks: 0 },
};

for (const [relPath, entry] of Object.entries(manifest.files)) {
  const ext = path.extname(relPath).toLowerCase();
  const type = EXTENSION_MAP[ext];
  if (type) {
    breakdown[type].files++;
    breakdown[type].chunks += entry.chunks.length;
  }
}

const totalFileCount = Object.values(breakdown).reduce((s, b) => s + b.files, 0);
const totalChunkCount = Object.values(breakdown).reduce((s, b) => s + b.chunks, 0);

// Only include types that have at least 1 file
const modelTypes = (Object.keys(breakdown) as Array<'code' | 'text' | 'image'>)
  .filter(t => breakdown[t].files > 0);
```

### Pattern 4: Recursive Directory Size
**What:** Sum file sizes recursively using `readdir({recursive:true, withFileTypes:true})`.
**When to use:** `runStatus()` for `indexSizeBytes`.

```typescript
async function calcDirSize(dir: string): Promise<number> {
  if (!existsSync(dir)) return 0;
  try {
    const entries = await fsp.readdir(dir, { recursive: true, withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      if (entry.isFile()) {
        const full = path.join(entry.parentPath, entry.name);
        const s = await fsp.stat(full);
        total += s.size;
      }
    }
    return total;
  } catch {
    return 0;  // storage dir may be partially corrupt — don't hard-fail
  }
}
```

**Verified:** `entry.parentPath` is the correct property in Node 22 (not `entry.path`, though both exist). Tested against real storage directory: matches `du -sb` byte count.

### Pattern 5: Staleness Detection
**What:** Count files whose current mtime differs from what's in the manifest, plus new files not yet indexed.
**When to use:** `runStatus()` for `staleFileCount`.

```typescript
async function calcStaleness(
  projectDir: string,
  manifest: Manifest,
  options: { ignore: boolean }
): Promise<number> {
  const { scanFiles } = await import('../../services/file-scanner.js');
  let stale = 0;
  for await (const file of scanFiles(projectDir, { useIgnoreFiles: options.ignore })) {
    const entry = manifest.files[file.relativePath];
    if (!entry) {
      stale++;  // new unindexed file
    } else if (entry.mtime !== file.mtimeMs) {
      stale++;  // modified since indexed
    }
  }
  return stale;
}
```

**Important:** staleness detection should respect the same `--no-ignore` flag as the index command, so `runStatus()` should accept `options.ignore` (defaulting to `true`) for consistency. The CLI already wires `--no-ignore` → `options.ignore = false` via Commander.

### Anti-Patterns to Avoid

- **Opening Zvec collections in status command:** `openProjectCollections()` calls `mkdirSync` and creates empty collections if they don't exist. Status must NOT call this — it should only check for directory existence using `existsSync`.
- **Calling `loadManifest` before checking file existence:** `loadManifest` silently returns an empty manifest when the file is missing. Always `existsSync(manifestPath)` first to distinguish "no index" from "empty index".
- **Writing to stderr for JSON error format:** The agent-first design requires errors to go to stdout as JSON (same channel as normal output) so agents can parse them regardless of stream. Text format errors go to stderr. This matches existing query-cmd pattern.
- **Using `process.exit()` inside catch blocks without a shared utility:** Leads to inconsistent formats across commands. Use the shared `emitError` utility.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File type from path | Custom extension parser | `EXTENSION_MAP` from `src/types.ts` | Already comprehensive, single source of truth |
| Storage path calculation | Custom hash logic | `resolveProjectStoragePath` from `src/config/paths.ts` | Already used by index-cmd and query-cmd |
| Manifest reading | Custom JSON parse | `loadManifest` from `src/services/manifest-cache.ts` | Handles version mismatch, corrupt JSON, missing file |
| File scanning for staleness | Custom walk | `scanFiles` from `src/services/file-scanner.ts` | Already handles .gitignore, .cursorignore, BUILTIN_EXCLUSIONS |
| Recursive directory size | Shell `du` via child_process | Node `readdir({recursive:true}) + stat` | No subprocess, works cross-platform, tested |

**Key insight:** Every piece of infrastructure for status already exists. The status command is a data aggregation layer over existing services.

---

## Common Pitfalls

### Pitfall 1: Corrupt Manifest Returns Empty, Not Error
**What goes wrong:** `loadManifest` never throws — it returns `{ version, files: {} }` when the file is corrupt or version-mismatched. Calling it on a corrupt file gives a "no files indexed" result, not a corruption signal.
**Why it happens:** The design choice was resilience over explicitness.
**How to avoid:** Before calling `loadManifest`, separately read and parse the raw file to detect corruption. OR: check if the file exists AND the returned manifest has zero files despite the file being non-empty — that signals version mismatch or corruption.
**Warning signs:** `existsSync(manifestPath)` returns true but `Object.keys(manifest.files).length === 0` and the file size is > 10 bytes.
**Resolution per CONTEXT.md:** For corrupt manifest, report what's readable (use the returned empty manifest), emit a warning field in the JSON, suggest `ez-search index --clear .`

### Pitfall 2: storagePath Always Gets Created
**What goes wrong:** Calling `openProjectCollections` in status would create the `~/.ez-search/<project>/` directory and empty Zvec collections even when no index exists.
**How to avoid:** Use `resolveProjectStoragePath` (path calculation only, no side effects) and `existsSync` to check directory presence. Never call `openProjectCollections` from status.

### Pitfall 3: Manifest mtime as lastIndexed Is File-System Dependent
**What goes wrong:** On some file systems or after `cp` operations, mtime may not reflect the actual index time.
**Why acceptable:** This is the simplest approach and correct for normal use (saveManifest uses atomic rename which updates mtime). The alternative — adding a `lastIndexed` field to `Manifest` — would require a Manifest version bump and migration logic.
**Mitigation:** Document this in code comments. If a future version needs a reliable timestamp, bump `MANIFEST_VERSION` and add the field.

### Pitfall 4: Missing --format on Status CLI Registration
**What goes wrong:** `status` command in `src/cli/index.ts` currently has no options — just `.action(async () => ...)`. The `options` object won't have a `format` property.
**How to avoid:** Add `.option('--format <mode>', 'output format: json (default) or text')` before `.action(...)`, and pass `options` to `runStatus`.

### Pitfall 5: Error Handling in index-cmd Currently Uses Wrong Format
**What goes wrong:** The existing catch block in `index-cmd` outputs `{ status: 'error', message }` — not the new structured format. Agents matching on `error: true` will miss these errors.
**How to avoid:** Update `index-cmd` and `query-cmd` catch blocks to use the shared `emitError` utility with appropriate error codes.

### Pitfall 6: Staleness Scan Is Slow on Large Codebases
**What goes wrong:** Running `scanFiles` (which stats every file) for staleness detection on a large project could be slow.
**Mitigation:** The existing scanner already skips `node_modules`, `dist`, etc. via BUILTIN_EXCLUSIONS. This is acceptable for Phase 6. If performance is a problem, it would be a future optimization.

---

## Code Examples

### Complete Status Output Shape (JSON)
```json
{
  "fileCount": 42,
  "chunkCount": 187,
  "lastIndexed": "2026-02-23T08:45:00.000Z",
  "modelTypes": ["code", "text"],
  "indexSizeBytes": 8286530,
  "storagePath": "/home/user/.ez-search/myproject-a1b2c3d4",
  "staleFileCount": 3,
  "byType": {
    "code": { "files": 35, "chunks": 150 },
    "text": { "files": 7, "chunks": 37 },
    "image": { "files": 0, "chunks": 0 }
  }
}
```

### Complete Status Output Shape (text format)
```
Index: /home/user/.ez-search/myproject-a1b2c3d4
Files: 42 (code: 35, text: 7)
Chunks: 187
Last indexed: 2026-02-23T08:45:00.000Z
Index size: 8.3 MB
Stale files: 3
```

### Error Output Shape (JSON, no index)
```json
{ "error": true, "code": "NO_INDEX", "message": "No index found in current directory", "suggestion": "Run: ez-search index ." }
```

### Error Output Shape (text, no index)
```
Error: No index found in current directory. Try: ez-search index .
```

### Corrupt Manifest (JSON, partial data available)
```json
{
  "fileCount": 0,
  "chunkCount": 0,
  "lastIndexed": "2026-02-23T08:45:00.000Z",
  "modelTypes": [],
  "indexSizeBytes": 8286530,
  "storagePath": "/home/user/.ez-search/myproject-a1b2c3d4",
  "staleFileCount": 0,
  "warning": "Manifest appears corrupt or version-mismatched. Reported data may be incomplete.",
  "suggestion": "Run: ez-search index --clear ."
}
```

### Missing Vector Collections (JSON, inconsistency)
```json
{
  "error": true,
  "code": "CORRUPT_MANIFEST",
  "message": "Manifest exists but vector collections are missing",
  "suggestion": "Run: ez-search index --clear ."
}
```

---

## What Needs to Change vs. What's New

### New code
| File | What | Why |
|------|------|-----|
| `src/cli/errors.ts` | Shared `emitError()` utility | Enforces structured error contract across all commands |
| `src/cli/commands/status-cmd.ts` | Full implementation replacing stub | Currently just `console.log('status command stub')` |

### Modifications to existing code
| File | What | Why |
|------|------|-----|
| `src/cli/index.ts` | Add `--format` and `--no-ignore` options to `status` command, pass `options` to `runStatus` | Status command needs both flags |
| `src/cli/commands/index-cmd.ts` | Update catch block to use `emitError` with structured format | Current format is `{ status: 'error', message }` — wrong contract |
| `src/cli/commands/query-cmd.ts` | Update catch block to use `emitError` with structured format | Current format is `{ query, error: message }` — wrong contract |

### No changes needed
| File | Why |
|------|-----|
| `src/services/manifest-cache.ts` | Manifest format is sufficient; `loadManifest` already handles corruption |
| `src/services/vector-db.ts` | Status doesn't open Zvec collections |
| `src/types.ts` | `EXTENSION_MAP` and `FileType` already cover all needed type lookups |
| `src/config/paths.ts` | `resolveProjectStoragePath` already does exactly what's needed |

---

## Edge Case Behavior Matrix

| Scenario | Detection | Response |
|----------|-----------|----------|
| No manifest file | `!existsSync(manifestPath)` | NO_INDEX error, exit 2 |
| Manifest exists, zero files, file non-empty | `files === {}` + file size > 10 bytes | CORRUPT_MANIFEST warning (partial data response) |
| Manifest valid, storagePath missing | `!existsSync(storagePath)` | CORRUPT_MANIFEST error, suggest `--clear` |
| Manifest valid, `col-768` dir missing | `!existsSync(col768Dir)` | CORRUPT_MANIFEST error, suggest `--clear` |
| Manifest valid, storagePath exists | Normal | Return status object, exit 0 |
| Scan produces zero files (empty dir) | staleFileCount logic; totalFileCount === 0 in manifest | Already handled by NO_INDEX if no manifest. If manifest exists with 0 files, warn. |

---

## Open Questions

1. **Should `staleFileCount` also count deleted files?**
   - What we know: The context says "number of files changed since last index (via manifest mtime comparison)". Deleted files are in the manifest but not on disk.
   - What's unclear: Whether "changed" includes deletions.
   - Recommendation: Yes, include deleted files in staleFileCount. A deleted file is an unsynced change. Detection: iterate `manifest.files`, check if each file still exists on disk.

2. **Should `byType` include zero-count types or only active types?**
   - What we know: `modelTypes` is specified as "array of active types". The `byType` breakdown shape is underdefined for zero types.
   - Recommendation: Include all three types in `byType` (even zeros) for predictable agent parsing. Only include non-zero types in `modelTypes` array.

3. **Should status accept `--type` filter?**
   - Not specified in CONTEXT.md decisions.
   - Recommendation: No. Status is an overview command. Adding `--type` would complicate staleness calculation for no clear agent benefit.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `src/services/manifest-cache.ts`, `src/config/paths.ts`, `src/types.ts`, `src/cli/commands/index-cmd.ts`, `src/cli/commands/query-cmd.ts`, `src/cli/index.ts` — all read in full
- Node.js 22 runtime test: `readdir({recursive:true, withFileTypes:true})` + `entry.parentPath` — verified against real storage directory (byte count matched `du -sb`)

### Secondary (MEDIUM confidence)
- Phase 5 summary (`05-03-SUMMARY.md`) — confirms current index-cmd and query-cmd structure
- Phase 6 CONTEXT.md — locked decisions used directly

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in codebase, verified by reading source
- Architecture: HIGH — data flow traced through existing code; no speculative claims
- Pitfalls: HIGH — derived from actual code behavior (loadManifest never throws, openProjectCollections always creates dirs)
- Code examples: HIGH — patterns derived directly from existing command implementations

**Research date:** 2026-02-23
**Valid until:** Stable — only changes if manifest-cache.ts or vector-db.ts interfaces change
