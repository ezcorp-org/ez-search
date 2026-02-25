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

- **Type check site:** `cd site && bun run check`
- **Build site:** `cd site && bun run build`
- **Dev server:** `cd site && bun run dev`
- **Run tests:** `bun test`
- **Build package:** `bun run build`

## Documentation Sync Rule (CRITICAL)

The `/docs` page content lives entirely in `site/src/lib/data/docs-content.ts`. This file MUST be updated whenever any of the following change:

| Change | What to update in docs-content.ts |
|--------|-----------------------------------|
| CLI flag added/removed/renamed | `cliCommands[]` flags array |
| CLI command added | Add new entry to `cliCommands[]`, new sidebar item, new section in `+page.svelte` |
| Library function signature changed | `libraryFunctions[]` signature + params |
| Library function added | Add new entry to `libraryFunctions[]`, sidebar, and page |
| Type definition changed | `typeDefinitions[]` code string |
| New type exported | Add to `typeDefinitions[]` |
| Error code added | `errorCodes[]` table |
| File extension support changed | `fileTypeGroups[]` extensions |
| Built-in exclusion added | `builtInExclusions[]` |
| Package version bumped | Version comment at top of file |

**After any API change in `src/`, always check if `site/src/lib/data/docs-content.ts` needs updating.**

## Styling Conventions (Site)

- Dark theme: `bg-dark` (#0A0A0A), `text-light` (#FAFAFA)
- Accent colors: `ez-yellow`, `ez-blue`, `ez-green`, `ez-purple`
- Cards: `bg-card border border-card-border rounded-xl`
- Code blocks: `bg-[#0D0D0D] border border-card-border rounded-xl font-mono text-sm`
- Fonts: Inter (sans), JetBrains Mono (mono)
- Responsive: mobile-first, `md:` for tablet, `lg:` for desktop
- Components use Svelte 5 runes (`$state`, `$props`, `$effect`)
