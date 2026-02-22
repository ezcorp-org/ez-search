---
phase: 02-foundation-and-infrastructure
plan: 01
subsystem: cli
tags: [commander, typescript, lazy-loading, dynamic-import, path-resolution, crypto]

# Dependency graph
requires:
  - phase: 01-validation-spike
    provides: Confirmed Zvec and Transformers.js viability on NixOS; established model IDs and ESM patterns
provides:
  - Commander-based CLI with index, query, status subcommands and lazy-loaded action handlers
  - src/types.ts with FileType, ScannedFile, ScanOptions, ModelBackend, CollectionName, EXTENSION_MAP, BUILTIN_EXCLUSIONS
  - src/config/paths.ts with resolveProjectStoragePath (basename+8char-sha256-hash) and resolveModelCachePath
  - CLI entry in under 22ms (compiled) via dynamic import() to defer heavy module loading
affects:
  - 02-02 (file scanner uses ScanOptions, FileType, ScannedFile, EXTENSION_MAP, BUILTIN_EXCLUSIONS)
  - 02-03 (embedding service imports ModelBackend, CollectionName)
  - 03 (index-cmd wires options.ignore to scanFiles useIgnoreFiles)

# Tech tracking
tech-stack:
  added: [commander, ignore, "@inquirer/prompts", cli-progress, "@types/cli-progress"]
  patterns:
    - Dynamic import() in commander action handlers for lazy loading of heavy modules
    - Path hashing via sha256 first 8 chars for project storage disambiguation

key-files:
  created:
    - src/types.ts
    - src/config/paths.ts
    - src/cli/index.ts
    - src/cli/commands/index-cmd.ts
    - src/cli/commands/query-cmd.ts
    - src/cli/commands/status-cmd.ts
  modified:
    - package.json
    - tsconfig.json

key-decisions:
  - "Dynamic import() in action handlers: heavy modules never loaded at CLI entry level"
  - "Commander --no-ignore convention: yields options.ignore = false (boolean) when flag used"
  - "tsconfig rootDir = src (not .): ensures clean dist/ output without spike/ or planning files"

patterns-established:
  - "Lazy loading pattern: all command implementations behind dynamic import('./commands/xxx.js')"
  - "Path resolution: ~/.ez-search/<basename>-<8char-hash>/ for project storage"
  - "BUILTIN_EXCLUSIONS constant centralized in types.ts for reuse across scanner and index"

# Metrics
duration: 2min
completed: 2026-02-23
---

# Phase 02 Plan 01: CLI scaffold with lazy-loaded commands, shared types, and path resolution

**Commander CLI skeleton with dynamic import() action handlers, shared TypeScript types (FileType/ScannedFile/ScanOptions), and sha256-based project storage path resolution -- compiled --help runs in 22ms**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-23T01:06:09Z
- **Completed:** 2026-02-23T01:07:55Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Project scaffold with commander CLI: index, query, and status subcommands fully registered with all options
- Shared types module establishing FileType, ScannedFile, ScanOptions, EXTENSION_MAP, and BUILTIN_EXCLUSIONS
- Path resolution utilities using sha256 (8-char) for project storage disambiguation under ~/.ez-search/
- Lazy loading via dynamic import() in all action handlers -- compiled --help completes in 22ms (well under 200ms)
- --no-ignore flag correctly parsed as options.ignore = false per commander convention

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies, shared types, and path utilities** - `00d5f93` (feat)
2. **Task 2: CLI entry point with lazy-loaded command stubs** - `bb87385` (feat)

## Files Created/Modified

- `src/types.ts` - FileType, ScannedFile, ScanOptions, ModelBackend, CollectionName, EXTENSION_MAP, BUILTIN_EXCLUSIONS
- `src/config/paths.ts` - resolveProjectStoragePath (sha256 hash) and resolveModelCachePath
- `src/cli/index.ts` - Commander program with dynamic import() action handlers, shebang, no heavy imports
- `src/cli/commands/index-cmd.ts` - Index command stub: --no-ignore, --type, --quiet, --clear
- `src/cli/commands/query-cmd.ts` - Query command stub: --pretty, --top-k, --dir
- `src/cli/commands/status-cmd.ts` - Status command stub
- `package.json` - Added engines>=20, bin field, build/start scripts, 4 new deps
- `tsconfig.json` - rootDir=src, include=src/**/* exclude=spike and dist

## Decisions Made

- Used `crypto.createHash('sha256').update(resolved).digest('hex').slice(0, 8)` rather than `crypto.hash()` (Node 21.7+ only) for broader compatibility with node>=20 engines field
- tsconfig rootDir changed from `.` to `src` to prevent spike/ files from appearing in dist/
- Commander's `--no-ignore` name automatically creates `options.ignore` boolean (true=use ignore files, false=disable) per commander's negation convention

## Deviations from Plan

None - plan executed exactly as written.

The plan suggested `crypto.hash('sha256', ...)` (Node 21.7+ API) but the engines field specifies `>=20`. Used `crypto.createHash()` instead which is available on all Node 20+ versions. This is a minor compatibility improvement, not a deviation.

## Issues Encountered

- tsx baseline startup is ~290ms (transpiler overhead), so `time npx tsx ... --help` appears over 200ms. Compiled binary via `node dist/cli/index.js --help` runs in 22ms. The 200ms requirement applies to the distributed binary, not the dev tsx runner.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 02-02 (file scanner) can import ScanOptions, FileType, ScannedFile, EXTENSION_MAP, BUILTIN_EXCLUSIONS from src/types.ts
- Phase 02-03 (embedding service) can import ModelBackend, CollectionName from src/types.ts and resolveModelCachePath from src/config/paths.ts
- Phase 03 index-cmd implementation can wire options.ignore to scanFiles({ useIgnoreFiles: options.ignore }) per INFRA-05
- No blockers

---
*Phase: 02-foundation-and-infrastructure*
*Completed: 2026-02-23*
