# ez-search Site

SvelteKit marketing site deployed to Cloudflare Pages.

## Commands

- **Type check:** `bun run check`
- **Build:** `bun run build`
- **Dev server:** `bun run dev`

## Documentation Sync Rule (CRITICAL)

The `/docs` page content lives entirely in `src/lib/data/docs-content.ts`. This file MUST be updated whenever any of the following change:

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

**After any API change in `src/`, always check if `src/lib/data/docs-content.ts` needs updating.**

## Styling Conventions

- Dark theme: `bg-dark` (#0A0A0A), `text-light` (#FAFAFA)
- Accent colors: `ez-yellow`, `ez-blue`, `ez-green`, `ez-purple`
- Cards: `bg-card border border-card-border rounded-xl`
- Code blocks: `bg-[#0D0D0D] border border-card-border rounded-xl font-mono text-sm`
- Fonts: Inter (sans), JetBrains Mono (mono)
- Responsive: mobile-first, `md:` for tablet, `lg:` for desktop
- Components use Svelte 5 runes (`$state`, `$props`, `$effect`)
