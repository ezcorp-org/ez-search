# ez-search

Semantic codebase search CLI + JS/TS library. ESM-only, Node >= 20.

## Project Structure

```
src/              # Core package (CLI + library API)
  index.ts        # Library entry — exports index(), query(), status()
  errors.ts       # EzSearchError class + ErrorCode type
  types.ts        # FileType, EXTENSION_MAP, ScannedFile
  cli/            # CLI commands (commander-based)
site/             # SvelteKit marketing site (Cloudflare Pages)
  src/routes/     # / (landing) and /docs (documentation)
  src/lib/data/docs-content.ts  # Single source of truth for all docs
tests/            # Bun test suite
```

## Commands

- **Run tests:** `bun test`
- **Build package:** `bun run build`
