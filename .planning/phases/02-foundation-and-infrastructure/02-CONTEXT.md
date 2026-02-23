# Phase 2: Foundation and Infrastructure - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Project skeleton with CLI scaffold, file scanner, vector DB wrapper, and model router — all independently testable modules. Ready for pipeline integration in Phase 3. Does not include indexing logic, query logic, or multi-model routing.

</domain>

<decisions>
## Implementation Decisions

### CLI design
- Subcommand structure: `ez-search index .`, `ez-search query "..."`, `ez-search status`
- Informative by default: brief status lines ("Scanning 142 files..."), -q flag for silence
- JSON output by default for query results; --pretty flag for human-readable format
- Optional project-level config: `.ez-search.json` in project root, with personal overrides in `~/.ez-search/`

### File scanning behavior
- Hardcoded extension-based file type mapping (.ts/.js/.py = code, .md/.txt = text, .jpg/.png = image)
- Users can filter to specific types within the hardcoded mappings (e.g., `--type code`)
- Sensible built-in exclusions (node_modules, .git, dist, build, lock files) even without .gitignore
- Respects .gitignore and .cursorignore on top of built-in exclusions; `--no-ignore` disables all
- Large files: warn but include (no hard cutoff)

### Storage layout
- Index data stored in user home: `~/.ez-search/<project-name>-<hash>/`
- Project identified by directory name + short hash of absolute path (human-browsable)
- Models shared globally: `~/.ez-search/models/` — download once, use across all projects
- Config layering: project-level `.ez-search.json` (committed, shared with team) + `~/.ez-search/` for personal overrides

### Model loading UX
- Progress bar during model download (percentage, speed, ETA)
- Always display active backend: "Using CPU" or "Using WebGPU"
- On first use, prompt user to select which models to install — all models selected by default, user can deselect specific ones
- Model loading is lazy (only when index/query runs) to keep --help and status fast

### Claude's Discretion
- Symlink handling strategy (skip vs follow with cycle detection)
- Lazy loading implementation details
- Exact built-in exclusion list
- Config file schema and merge behavior
- Progress bar library choice
- Model selection prompt UX details

</decisions>

<specifics>
## Specific Ideas

- JSON-first output aligns with the tool's primary use case as a retrieval engine for AI assistants
- The model selection prompt should default to "all models" with individual deselection, not the other way around
- Backend display ("Using CPU" / "Using WebGPU") should appear on every run, not just first time

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-foundation-and-infrastructure*
*Context gathered: 2026-02-22*
