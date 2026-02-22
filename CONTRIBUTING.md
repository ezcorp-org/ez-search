# Contributing to ez-search

Thanks for your interest in contributing. This document covers the basics.

## Development Setup

```bash
git clone https://github.com/ezcorp-org/ez-search.git
cd ez-search
npm install
```

Run from source without building:

```bash
npx tsx src/cli/index.ts index .
npx tsx src/cli/index.ts query "search term"
```

Build and run the compiled version:

```bash
npm run build
node dist/cli/index.js index .
```

## Running Tests

```bash
bun test              # all tests
bun test tests/unit/  # unit tests only
```

## Project Structure

```
src/
  cli/
    index.ts              # CLI entry point (commander setup)
    commands/
      index-cmd.ts        # index command implementation
      query-cmd.ts        # query command implementation
      status-cmd.ts       # status command implementation
    errors.ts             # structured error output
  config/
    paths.ts              # path resolution (.ez-search/, model cache)
  services/
    model-router.ts       # embedding pipeline creation (WebGPU/CPU)
    image-embedder.ts     # CLIP image embedding pipeline
    chunker.ts            # code chunking (token-window sliding)
    text-chunker.ts       # text/PDF chunking (paragraph-boundary)
    file-scanner.ts       # directory traversal with ignore support
    manifest-cache.ts     # incremental indexing manifest
    vector-db.ts          # Zvec collection management
    query-utils.ts        # result normalization and collapsing
  types.ts                # shared types and extension map
```

## Guidelines

- **TypeScript ESM** -- the project uses ES modules throughout. All imports use `.js` extensions.
- **Lazy loading** -- ML models and heavy dependencies are dynamically imported at the point of use, not at startup. This keeps CLI cold start fast.
- **No cloud dependencies** -- ez-search is local-only by design. Don't add features that require network access for core functionality.
- **Machine-readable output** -- JSON is the default output format. Any new command output should be parseable by AI assistants.
- **Incremental by default** -- indexing should skip unchanged content. New features should respect the manifest cache.

## Submitting Changes

1. Fork the repository and create a branch from `main`.
2. Make your changes with clear commit messages.
3. Add or update tests for any new functionality.
4. Ensure all tests pass with `bun test`.
5. Open a pull request against `main`.

## Reporting Issues

Open an issue on GitHub with:
- What you expected to happen
- What actually happened
- Your Node.js version (`node -v`) and OS
- The command you ran and its output
