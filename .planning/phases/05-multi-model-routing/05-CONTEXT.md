# Phase 5: Multi-Model Routing - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend indexing and search to text documents (Nomic) and images (CLIP) alongside code (Jina), with automatic file type detection and routing to the correct model. The code pipeline already works end-to-end; this phase adds text and image pipelines and wires auto-detection routing for both index and query commands.

</domain>

<decisions>
## Implementation Decisions

### Cross-type search behavior
- Query searches all collections that have data by default (code + text + image)
- `--type code|text|image` flag narrows search to a single type
- Results grouped by type, ranked internally within each group (not interleaved across models)
- Scores from different models are NOT comparable; grouping avoids misleading cross-model ranking

### JSON output format
- Grouped envelope structure: `{ code: [...], text: [...], image: [...] }`
- Each section only present if that collection has data
- Type is implicit from the grouping key, no redundant type field per result

### Text output format
- Group headers (e.g., `## Code`, `## Text`, `## Images`) separate result types in human-readable output

### Claude's Discretion
- **Text file handling:** Which extensions classify as text, chunking strategy for markdown vs plain text, Nomic task prefix usage
- **Image processing:** Supported formats, resize/preprocess strategy, metadata stored per image
- **Auto-detection routing:** How the router decides code vs text vs image by extension, handling of ambiguous files (.json, .csv, .yaml)
- **Top-K distribution across types:** How --top-k allocates results when multiple types are present (per-type allocation vs total split) — optimize for coding agent consumption
- All non-discussed areas should be optimized for use as a retrieval engine for AI coding assistants

</decisions>

<specifics>
## Specific Ideas

- Tool is primarily a retrieval engine for AI coding assistants — all defaults should favor that use case
- When in doubt, prefer returning more context over less (agents can filter, humans can't un-filter)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-multi-model-routing*
*Context gathered: 2026-02-22*
