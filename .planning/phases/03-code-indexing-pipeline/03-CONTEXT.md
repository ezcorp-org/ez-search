# Phase 3: Code Indexing Pipeline - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

End-to-end code indexing: scan code files, chunk source code, generate embeddings via Jina code model, store vectors in Zvec, with incremental caching so re-runs on unchanged codebases complete near-instantly. Supports `--type code` to force pipeline and `--clear` to wipe index. Search/query is Phase 4.

</domain>

<decisions>
## Implementation Decisions

### Chunking strategy
- Fixed token window (~500 tokens) with sliding overlap — no syntax-aware splitting
- Files under the window size become a single chunk (no windowing needed)
- Overlap size: Claude's discretion based on research into code embedding model behavior
- Whether to prepend file context (path, language) to chunk text before embedding: Claude's discretion based on Jina model research

### Incremental caching behavior
- Change detection strategy: Claude's discretion (mtime+size fast check vs always hash — pick the pragmatic approach)
- Deleted files: auto-remove their chunks from the vector store on the next `ez-search index` run
- Changed files: diff chunks — compare old and new chunks, only re-embed the ones that actually changed (don't re-index entire file)
- Manifest cache location: in the project root as a `.ez-search-cache` file (visible to user, gitignore-able)

### Index command UX
- No interactive prompts anywhere — tool is built primarily for AI agent consumption
- `--clear` executes immediately, no confirmation prompt
- Output is JSON by default (structured, agent-parseable)
- Add a `--human` or `--pretty` flag for human-readable output
- Indexing progress/feedback style: Claude's discretion, optimized for agent use (consider that agents don't need progress bars)
- "No changes" output format: Claude's discretion, but must be consistent with the normal output JSON schema

### Chunk metadata & identity
- What metadata to store per chunk: Claude's discretion, optimized for an AI-agent-first CLI tool (file path + line range is minimum; consider storing raw text, language, content hash based on what agents need)
- Search results return both: file pointers (path + line range) AND stored chunk text — agent gets everything in one call
- Chunk ID scheme in Zvec: Claude's discretion (pick what works best with incremental diff updates and Zvec's ID constraints — no colons)
- Line number freshness: Claude's discretion (stored at index time vs recalculated on query)

### Claude's Discretion
- Token overlap size for chunks
- Whether to prefix chunks with file context before embedding
- Change detection strategy (mtime+size first vs always hash)
- Indexing progress/feedback format
- "No changes" output wording
- Chunk metadata fields beyond the minimum
- Chunk ID scheme in Zvec
- Line number storage vs recalculation approach

</decisions>

<specifics>
## Specific Ideas

- Tool is built primarily for AI agent consumption — JSON output by default, no interactive prompts, no confirmation dialogs
- Manifest cache lives in project root (`.ez-search-cache`) so users can gitignore it
- Chunk diffing on file changes — don't re-embed unchanged chunks within a modified file
- Auto-cleanup of deleted file chunks — no orphaned data

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-code-indexing-pipeline*
*Context gathered: 2026-02-22*
