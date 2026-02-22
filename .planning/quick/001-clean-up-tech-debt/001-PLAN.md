---
phase: quick
plan: 001
type: execute
wave: 1
depends_on: []
files_modified:
  - src/services/manifest-cache.ts
  - src/cli/commands/query-cmd.ts
autonomous: true

must_haves:
  truths:
    - "clearManifest function no longer exists in manifest-cache.ts"
    - "ez-search query --type code on unindexed project emits NO_INDEX error"
    - "ez-search query (no --type) on unindexed project still emits NO_INDEX error (no regression)"
  artifacts:
    - path: "src/services/manifest-cache.ts"
      provides: "Manifest cache without dead clearManifest export"
    - path: "src/cli/commands/query-cmd.ts"
      provides: "Query command with NO_INDEX guard covering --type flag"
---

<objective>
Clean up two v1 tech debt items identified by milestone audit: remove dead clearManifest export and fix query --type edge case on unindexed projects.

Purpose: Eliminate dead code and fix a user-facing bug where --type bypasses the NO_INDEX guard.
Output: Two patched source files, no behavioral regressions.
</objective>

<context>
@src/services/manifest-cache.ts
@src/cli/commands/query-cmd.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove dead clearManifest export</name>
  <files>src/services/manifest-cache.ts</files>
  <action>
Delete the `clearManifest` function (lines 91-98) and its JSDoc comment (lines 88-90) from manifest-cache.ts. The `--clear` path now uses `rmSync` on the entire `.ez-search/` directory, making this function unused.

Before deleting, confirm no imports exist:
```bash
grep -r "clearManifest" src/
```
If any imports are found (unexpected), do NOT delete — report back instead.
  </action>
  <verify>
1. `grep -r "clearManifest" src/` returns zero matches
2. `bun build src/services/manifest-cache.ts --no-bundle` succeeds (no syntax errors)
  </verify>
  <done>clearManifest function and its JSDoc are removed from manifest-cache.ts. No module imports it.</done>
</task>

<task type="auto">
  <name>Task 2: Fix query --type NO_INDEX guard</name>
  <files>src/cli/commands/query-cmd.ts</files>
  <action>
The bug: line 66 has `if (typesToQuery.length === 0 && !options.type)` which skips the NO_INDEX guard when `--type` is explicitly passed. When a user runs `ez-search query --type code` on an unindexed project, `typesToQuery` is `['code']` (set on line 48), and the code proceeds to query a non-existent vector collection, silently returning 0 results instead of a clear error.

Fix: Add a separate guard BEFORE the type-determination block (before line 47) that checks whether the manifest has any indexed files. If the manifest is empty (`totalIndexed === 0`), emit NO_INDEX regardless of whether `--type` was passed.

Specifically, insert after line 41 (`const totalIndexed = ...`):

```typescript
    // Guard: no indexed content at all
    if (totalIndexed === 0) {
      const { emitError } = await import('../errors.js');
      emitError(
        { code: 'NO_INDEX', message: 'No indexed content found', suggestion: 'Run `ez-search index .` first' },
        options.format === 'text' ? 'text' : 'json'
      );
    }
```

Then simplify the existing guard on line 66. The `typesToQuery.length === 0 && !options.type` check can remain as-is (it catches the case where the manifest has files but none match queryable types), but remove the `&& !options.type` condition since the new totalIndexed===0 guard above now handles the truly-empty case. Updated condition:

```typescript
    if (typesToQuery.length === 0) {
```

This way:
- Empty manifest (totalIndexed===0) -> always NO_INDEX (covers --type and no --type)
- Non-empty manifest but no queryable types -> NO_INDEX (e.g., only images indexed)
- Non-empty manifest with --type for a type that exists -> proceeds normally
  </action>
  <verify>
1. `bun build src/cli/commands/query-cmd.ts --no-bundle` succeeds
2. Read through the modified file to confirm both guards are in place
3. `bun test 2>&1 | grep --line-buffered -E "(pass|fail|error)"` — existing tests still pass
  </verify>
  <done>
- `ez-search query --type code` on unindexed project emits NO_INDEX error (not silent 0 results)
- `ez-search query` (no --type) on unindexed project still emits NO_INDEX error (no regression)
- `ez-search query` on indexed project with no queryable types still emits NO_INDEX error
  </done>
</task>

</tasks>

<verification>
1. `grep -r "clearManifest" src/` returns no matches
2. `bun build src/services/manifest-cache.ts --no-bundle` succeeds
3. `bun build src/cli/commands/query-cmd.ts --no-bundle` succeeds
4. `bun test` — all existing tests pass
</verification>

<success_criteria>
- clearManifest dead code removed from manifest-cache.ts
- query --type on unindexed project emits NO_INDEX structured error
- No regressions in existing test suite
</success_criteria>

<output>
After completion, create `.planning/quick/001-clean-up-tech-debt/001-SUMMARY.md`
</output>
