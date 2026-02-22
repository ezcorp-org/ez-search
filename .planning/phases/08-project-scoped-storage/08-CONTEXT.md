# Phase 8: Project-Scoped Storage - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Move index data from `~/.ez-search/<project>-<hash>/` into `<project>/.ez-search/`. Shared model weights move to `~/.cache/ez-search/models/`. Old hash-based storage code is deleted entirely — clean break, no migration.

</domain>

<decisions>
## Implementation Decisions

### Storage layout
- Project-local storage at `<project>/.ez-search/`
- Reorganize internal directory structure (Claude's discretion on exact layout — current flat layout of col-768/, col-512/, manifest.json, schema-version.json can be improved)
- Shared model weights move from `~/.ez-search/models/` to `~/.cache/ez-search/models/` (XDG-compliant)

### Migration & backwards compatibility
- Clean break — no auto-migration, no fallback reads from old paths
- Old hash-based path logic (`~/.ez-search/<project>-<hash>/`) removed entirely from source
- Users re-index fresh into `.ez-search/`; old data stays at `~/.ez-search/` until manually deleted
- No cleanup command or flag — users delete `~/.ez-search/` themselves if desired

### Git integration
- Auto-add `.ez-search/` to `.gitignore` on first index run
- Print one-line notice: "Added .ez-search/ to .gitignore"
- Create `.gitignore` if none exists (with just `.ez-search/`)
- Also add `.ez-search/` to the scanner's built-in always-excluded list (defense in depth alongside .gitignore)

### Multi-project isolation
- Add `--root <path>` flag to all commands (index, query, status) to explicitly target a different project's index
- Other multi-project decisions (CWD vs git-root discovery, nesting, parent-walking) at Claude's discretion

### Claude's Discretion
- Internal directory structure reorganization within `.ez-search/`
- Whether to walk up to git root or use CWD for `.ez-search/` placement
- Whether nested `.ez-search/` directories are allowed in sub-packages
- Whether query/status auto-discover `.ez-search/` by walking parent directories
- Removal of hash utility and related dead code

</decisions>

<specifics>
## Specific Ideas

- `.ez-search/` naming mirrors `.git/` convention — familiar to developers
- `~/.cache/ez-search/models/` follows XDG base directory spec for cache data
- Defense in depth: scanner built-in exclusion + .gitignore entry prevents indexing own data

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-project-scoped-storage*
*Context gathered: 2026-02-23*
