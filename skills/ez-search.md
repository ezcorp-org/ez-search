---
name: ez-search
description: Semantic codebase search using local vector embeddings. Use when you need to find code or documentation by meaning rather than exact text match.
---

# ez-search — Semantic Codebase Search

## When to Use

Use ez-search when you need to **find code or docs by meaning**, not exact text:
- "Find where authentication is handled"
- "Where are database connections configured"
- "Find error handling patterns"

**Do NOT use for:** exact string matches (use `grep`/`rg`), filename lookups (use `find`/`glob`), simple symbol search (use language server).

## Quick Start

```bash
# Search — auto-indexes on first run
ez-search query "authentication middleware" --format json

# Search only code files
ez-search query "database connection pool" --format json --type code

# Search with relevance threshold
ez-search query "error handling" --format json --threshold 0.5 --top-k 5

# Scope to subdirectory
ez-search query "API routes" --format json --dir src/
```

## Commands

### query (primary command for agents)

```bash
ez-search query "<natural language>" --format json [options]
```

Options:
- `--format json` — **always use this** for structured output
- `--type code|text` — restrict to code or text files
- `--top-k <n>` — number of results (default: 10)
- `--threshold <score>` — minimum relevance 0-1 (recommend: 0.5)
- `--dir <path>` — scope to subdirectory
- `--no-auto-index` — fail instead of auto-indexing

Auto-indexes on first run. Subsequent queries are fast.

### index (explicit indexing)

```bash
ez-search index . --format json [--quiet] [--clear] [--type code|text|image]
```

Use when you want to explicitly rebuild the index (e.g., after major changes).

### status

```bash
ez-search status --format json
```

Check index health: file count, staleness, storage size.

## JSON Output Format

### Query Response

```json
{
  "query": "authentication",
  "totalIndexed": 150,
  "searchScope": ".",
  "code": [
    {
      "file": "src/auth.ts",
      "lines": { "start": 10, "end": 25 },
      "score": 0.92,
      "text": "function authenticate(token: string) { ... }"
    }
  ],
  "text": [
    {
      "file": "docs/auth.md",
      "score": 0.85,
      "text": "Authentication is handled via..."
    }
  ]
}
```

When auto-indexing occurs, includes:
```json
{
  "indexing": { "status": "ok", "filesIndexed": 42, "durationMs": 3200 },
  ...
}
```

When index is stale:
```json
{
  "stale": true,
  "staleFileCount": 5,
  ...
}
```

### Error Response

```json
{
  "error": true,
  "code": "NO_INDEX",
  "message": "No indexed content found",
  "suggestion": "Run `ez-search index .` first"
}
```

Error codes: `NO_INDEX`, `EMPTY_DIR`, `UNSUPPORTED_TYPE`, `CORRUPT_MANIFEST`, `GENERAL_ERROR`

## Tips

- Scores above 0.7 are strong matches; 0.5-0.7 are relevant; below 0.5 is noise
- Use `--type code` when looking for implementations (skips docs/READMEs)
- Use `--type text` when looking for documentation or prose
- For large repos, run `ez-search index .` explicitly once to avoid query-time latency
- The index lives in `.ez-search/` at the project root — add to `.gitignore`
