---
phase: 03-code-indexing-pipeline
plan: "01"
subsystem: indexing-infrastructure
tags: [manifest-cache, incremental-indexing, vector-db, schema-versioning, file-scanner]

dependency-graph:
  requires: [02-foundation-and-infrastructure]
  provides: [manifest-cache-service, vector-db-schema-v2, scanner-mtime]
  affects: [03-02-chunker, 03-03-index-command, 03-04-incremental-update]

tech-stack:
  added: []
  patterns: [atomic-write-tmp-rename, sha256-fingerprinting, schema-version-sidecar, fast-path-mtime-check]

key-files:
  created:
    - src/services/manifest-cache.ts
  modified:
    - src/types.ts
    - src/services/file-scanner.ts
    - src/services/vector-db.ts

decisions:
  - "Manifest uses version=1 constant — on mismatch return empty manifest (no migration)"
  - "makeChunkId uses underscore separator (no colons) to satisfy Zvec ID constraint"
  - "ensureSchemaVersion wipes col-768 and col-512 on any version mismatch, including corrupt JSON"
  - "hashContent/hashText truncated to 16 hex chars (64-bit collision resistance sufficient for cache)"

metrics:
  duration: "7 min"
  completed: "2026-02-23"
---

# Phase 3 Plan 01: Foundation Updates and Manifest Cache Summary

**One-liner:** Manifest cache with SHA-256 + mtime fast path, atomic write, and vector DB schema v2 with chunkText and auto-wipe on version mismatch.

## What Was Built

### Task 1: Update types, scanner, and vector-db

**src/types.ts** — Added `mtimeMs: number` to `ScannedFile` interface after `sizeBytes`. This field flows through the scanner into the manifest cache for fast change detection.

**src/services/file-scanner.ts** — Yields `mtimeMs: stat.mtimeMs` from the existing `fsp.stat()` call. Zero additional I/O.

**src/services/vector-db.ts:**
- Added `SCHEMA_VERSION = 2` constant
- Added `chunkText: STRING` field to `buildSchema()` (after `lineEnd`)
- Added `ensureSchemaVersion(storageDir)` — reads `schema-version.json`, wipes `col-768` and `col-512` on version mismatch, writes updated version file
- Called `ensureSchemaVersion()` in `openProjectCollections()` after `mkdirSync`
- Updated `insert()` to store `chunkText`
- Updated `query()` to retrieve `chunkText` in `outputFields` and return it in metadata

### Task 2: Create manifest cache service

**src/services/manifest-cache.ts** — Full manifest cache implementation:

| Export | Purpose |
|--------|---------|
| `loadManifest(projectDir)` | Load cache; returns `{ version: 1, files: {} }` on missing/corrupt/version-mismatch |
| `saveManifest(projectDir, manifest)` | Atomic write via `.ez-search-cache.tmp` → rename |
| `clearManifest(projectDir)` | Delete cache file, silent if absent |
| `hashContent(buffer)` | SHA-256 of Buffer, 16 hex chars |
| `hashText(string)` | SHA-256 of string, 16 hex chars |
| `makeChunkId(relPath, index)` | `<12-char hash>_<4-digit index>` — no colons |
| `ChunkRecord` | `{ id, lineStart, lineEnd, tokenCount, textHash }` |
| `ManifestEntry` | `{ mtime, size, hash, chunks[] }` |
| `Manifest` | `{ version, files: Record<string, ManifestEntry> }` |

## Decisions Made

1. **Manifest version mismatch → empty manifest** — No migration logic; simpler and safer to re-index than to handle partial compatibility.
2. **makeChunkId underscore separator** — Colons rejected by Zvec (confirmed in Phase 1). Format: `a3f9c2d14b7e_0003`.
3. **Hash truncated to 16 chars** — 64-bit collision resistance is sufficient for a local file cache; saves storage in the manifest JSON.
4. **ensureSchemaVersion wipes on any error** — Corrupt `schema-version.json` treated same as version mismatch; always write a clean version file afterward.

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

```
npx tsc --noEmit          → 0 errors
grep mtimeMs types.ts     → line 8: mtimeMs: number
grep mtimeMs scanner.ts   → line 83: mtimeMs: stat.mtimeMs
grep chunkText vector-db  → schema (96), insert (144), outputFields (158), return (170)
grep SCHEMA_VERSION       → const=2 (32), check (110), write (120)
grep export manifest-cache → 6 functions, 3 types, 2 constants
```

## Next Phase Readiness

Phase 3 Plan 02 (chunker) can now:
- Import `makeChunkId` for stable chunk IDs
- Import `ChunkRecord`, `ManifestEntry`, `Manifest` for manifest updates
- Import `hashText` to fingerprint chunk content
- Trust `ScannedFile.mtimeMs` is available from the scanner
- Insert chunks with `chunkText` into vector DB (schema v2 is ready)
