# Phase 4: Search and Query - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Natural language query over indexed codebase returning ranked, machine-parseable results. Users run `ez-search query "..."` and get code snippets with file paths, line ranges, and relevance scores. Multi-model query routing and status reporting are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Result presentation
- Each result includes: file path, line range (start-end), relevance score, and the full chunk text
- Chunk text is returned verbatim (no truncation) — AI agents need full context to reason about code
- Results grouped by file when multiple chunks from the same file appear (adjacent chunks collapsed with continuous line range)
- No syntax highlighting or color codes in default output — agents parse plain text

### Output modes
- Default output is JSON (primary consumer is AI agents, not humans)
- JSON structure per result: `{ file, lines: { start, end }, score, text }`
- Top-level wrapper: `{ query, results: [...], totalIndexed, searchScope }`
- `--format text` flag for human-readable fallback (file:lines format with indented code)
- Scores are 0-1 (1 = most relevant), converted from Zvec cosine distance

### Query behavior
- Query text embedded using same Jina code model used for indexing (consistency)
- No instruction prefix needed for Jina v2 query embedding (symmetric model)
- No similarity threshold by default — return top-k and let the caller decide relevance
- Empty results return valid JSON with empty results array and a `message` field ("No indexed code found. Run `ez-search index .` first." or "No results above threshold.")
- `--threshold 0.5` optional flag to filter low-relevance results (score < threshold excluded)

### Scoping and filtering
- `--dir ./src` scopes search to files whose path starts with the given prefix
- Scoping is a post-filter on results (query runs against full index, filter by path prefix)
- `--top-k N` limits results (default 10)
- No file-type filtering in this phase (only code model indexed; multi-model filtering is Phase 5)

### Claude's Discretion
- Exact JSON field naming conventions (camelCase vs snake_case — match existing codebase style)
- Error output format (stderr vs JSON error object)
- Whether to add `--quiet` flag for suppressing metadata
- Internal query pipeline architecture

</decisions>

<specifics>
## Specific Ideas

- Primary use case: AI coding assistants calling ez-search as a retrieval tool — output must be trivially parseable
- Should work well piped into other tools: `ez-search query "auth" | jq '.results[].file'`
- Exit code 0 for successful query (even with zero results), non-zero for actual errors (no index, bad args)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-search-and-query*
*Context gathered: 2026-02-22*
