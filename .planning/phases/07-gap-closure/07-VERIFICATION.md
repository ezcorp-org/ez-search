---
phase: 07-gap-closure
verified: 2026-02-23T16:00:34Z
status: passed
score: 2/2 must-haves verified
---

# Phase 7: Gap Closure Verification Report

**Phase Goal:** Close audit gaps — query only loads models for indexed types, EMPTY_DIR error fires, dead code removed
**Verified:** 2026-02-23T16:00:34Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                         | Status     | Evidence                                                                                 |
|----|-------------------------------------------------------------------------------|------------|------------------------------------------------------------------------------------------|
| 1  | Query command only loads embedding models for content types that exist in the manifest | VERIFIED | EXTENSION_MAP pre-detection at lines 48-61; conditional model loading at lines 186, 209 of query-cmd.ts; NO_INDEX early exit at line 64 |
| 2  | No dead exports, dead dependencies, or shadowed types exist in the codebase   | VERIFIED   | `CollectionName` absent from src/; local `ScannedFile` shadow absent from index-cmd.ts; `@inquirer/prompts`, `cli-progress`, `@types/cli-progress` absent from package.json; `bun run build` produces zero errors |

**Score:** 2/2 truths verified

### Required Artifacts

| Artifact                              | Expected                                   | Status   | Details                                                                                        |
|---------------------------------------|--------------------------------------------|----------|-----------------------------------------------------------------------------------------------|
| `src/types.ts`                        | No `CollectionName` export                 | VERIFIED | File has 86 lines; grep confirms no `CollectionName` anywhere in src/                        |
| `src/cli/commands/index-cmd.ts`       | No local `type ScannedFile =` shadow       | VERIFIED | Imports `ScannedFile` from `../../types.js` at line 27; no local shadow type found           |
| `package.json`                        | No `@inquirer/prompts` or `cli-progress`   | VERIFIED | Dependencies contain only: @huggingface/transformers, @zvec/zvec, commander, ignore, pdf-parse; devDependencies contain only: @types/node, tsx, typescript |

### Key Link Verification

| From                                  | To              | Via                                               | Status   | Details                                                                                                                                  |
|---------------------------------------|-----------------|---------------------------------------------------|----------|------------------------------------------------------------------------------------------------------------------------------------------|
| `src/cli/commands/query-cmd.ts`       | `manifest.files` | EXTENSION_MAP pre-detection before model loading | WIRED    | Lines 48-61: iterates `manifest.files` keys, maps extension via EXTENSION_MAP, builds `typesToQuery` set. Lines 186/209: `createEmbeddingPipeline` is only called inside `if (typesToQuery.includes('code'))` and `if (typesToQuery.includes('text'))` blocks. Line 64: NO_INDEX emitted when `typesToQuery.length === 0 && !options.type`. |
| `src/cli/commands/index-cmd.ts`       | `emitError(EMPTY_DIR)` | `totalFilesScanned === 0` check              | WIRED    | Lines 491-498: after full scan loop, if `totalFilesScanned === 0`, `emitError` is called with `EMPTY_DIR` code. This fires instead of silent success. |

### Requirements Coverage

| Requirement | Status    | Notes                                                        |
|-------------|-----------|--------------------------------------------------------------|
| SRCH-02     | SATISFIED | Query only loads models for indexed types (manifest-driven pre-detection confirmed wired and documented) |

### Anti-Patterns Found

None. No TODO/FIXME/placeholder patterns, no empty handlers, no stub returns in modified files.

### Human Verification Required

None required for this phase. All changes are structural (dead code removal, conditional logic) and fully verifiable through static analysis and the TypeScript compiler.

---

## Detailed Evidence

### Truth 1: Query manifest pre-detection

`src/cli/commands/query-cmd.ts` lines 48-70:

```typescript
// Pre-detect indexed types from manifest: only load models for types that have data.
// This avoids loading Jina when only text is indexed (or Nomic when only code is indexed).
const { EXTENSION_MAP } = await import('../../types.js');
const indexedTypes = new Set<string>();
for (const filePath of Object.keys(manifest.files)) {
  const ext = '.' + filePath.split('.').pop()?.toLowerCase();
  const fileType = EXTENSION_MAP[ext];
  if (fileType) indexedTypes.add(fileType);
}
typesToQuery = [];
if (indexedTypes.has('code')) typesToQuery.push('code');
if (indexedTypes.has('text')) typesToQuery.push('text');
// image queries from text not supported — skip even if images are indexed

// Early exit when manifest exists but has no queryable types
if (typesToQuery.length === 0 && !options.type) {
  const { emitError } = await import('../errors.js');
  emitError(
    { code: 'NO_INDEX', message: 'No indexed content found', suggestion: 'Run `ez-search index .` first' },
    options.format === 'text' ? 'text' : 'json'
  );
}
```

Model loading is conditional on the pre-detected set (lines 186, 209):

```typescript
if (typesToQuery.includes('code')) {
  // ... createEmbeddingPipeline('code') called here
}
if (typesToQuery.includes('text')) {
  // ... createEmbeddingPipeline('text') called here
}
```

### Truth 2: Dead code removal

- `src/types.ts`: 86 lines; exports `FileType`, `ScannedFile`, `ScanOptions`, `ModelBackend`, `EXTENSION_MAP`, `BUILTIN_EXCLUSIONS`. No `CollectionName` present.
- `src/cli/commands/index-cmd.ts` line 27: `import type { FileType, ScannedFile } from '../../types.js';` — uses canonical type, no shadow.
- `package.json`: 5 runtime dependencies, 3 dev dependencies; none of them are `@inquirer/prompts`, `cli-progress`, or `@types/cli-progress`.
- `bun run build` exits with no output (tsc zero errors).

---

_Verified: 2026-02-23T16:00:34Z_
_Verifier: Claude (gsd-verifier)_
