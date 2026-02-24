---
phase: quick
plan: 002
type: execute
wave: 1
depends_on: []
files_modified:
  - site/package.json
  - site/svelte.config.js
  - site/vite.config.ts
  - site/tailwind.config.ts
  - site/src/app.html
  - site/src/app.css
  - site/src/routes/+page.svelte
  - site/src/routes/+layout.svelte
  - site/src/lib/components/Hero.svelte
  - site/src/lib/components/Problem.svelte
  - site/src/lib/components/HowItWorks.svelte
  - site/src/lib/components/Features.svelte
  - site/src/lib/components/Terminal.svelte
  - site/src/lib/components/CTA.svelte
  - site/src/lib/components/Footer.svelte
  - site/src/lib/components/Nav.svelte
  - site/src/lib/components/TerminalAnimation.svelte
  - site/static/favicon.svg
  - site/wrangler.toml
autonomous: false

must_haves:
  truths:
    - "Visitor sees a compelling hero with tagline, one-liner, and install command"
    - "Visitor understands the problem ez-search solves and why it matters"
    - "Visitor sees an animated terminal demo showing index/query/results flow"
    - "Visitor can see all key features: privacy, speed, three pipelines, incremental indexing, AI-ready"
    - "Visitor has a clear install CTA with copy-to-clipboard npm command"
    - "Page renders in dark mode by default with EZCorp brand colors"
    - "Page is fully responsive (mobile, tablet, desktop)"
    - "Page has proper meta tags, OG images, and structured data for SEO"
  artifacts:
    - path: "site/src/routes/+page.svelte"
      provides: "Landing page composition"
    - path: "site/src/lib/components/TerminalAnimation.svelte"
      provides: "Animated terminal demo"
    - path: "site/svelte.config.js"
      provides: "SvelteKit + Cloudflare adapter config"
  key_links:
    - from: "site/src/routes/+page.svelte"
      to: "site/src/lib/components/*.svelte"
      via: "component imports"
    - from: "site/svelte.config.js"
      to: "@sveltejs/adapter-cloudflare"
      via: "adapter config"
---

<objective>
Build a landing page for ez-search: a privacy-first semantic codebase search CLI tool.

Purpose: Convert developer visitors into ez-search users by clearly communicating the value prop (local ML-powered semantic search, zero cloud dependencies) with an engaging, on-brand experience.

Output: A complete SvelteKit site in `site/` ready to deploy to Cloudflare Pages. Three agents execute in sequence: frontend dev builds, UI/UX reviewer refines, SEO expert adds discoverability.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@README.md (product features, CLI reference, how it works)
@package.json (package name, version, repo URL)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Scaffold SvelteKit project and build complete landing page</name>
  <files>
    site/package.json
    site/svelte.config.js
    site/vite.config.ts
    site/src/app.html
    site/src/app.css
    site/src/routes/+page.svelte
    site/src/routes/+layout.svelte
    site/src/lib/components/Nav.svelte
    site/src/lib/components/Hero.svelte
    site/src/lib/components/Problem.svelte
    site/src/lib/components/HowItWorks.svelte
    site/src/lib/components/Features.svelte
    site/src/lib/components/Terminal.svelte
    site/src/lib/components/TerminalAnimation.svelte
    site/src/lib/components/CTA.svelte
    site/src/lib/components/Footer.svelte
    site/static/favicon.svg
    site/wrangler.toml
  </files>
  <action>
    **Agent role: Frontend Developer**

    **Step 1: Scaffold SvelteKit project in `site/`**

    Run from repo root:
    ```bash
    cd site && npx sv create . --template minimal --types ts
    ```
    Then install dependencies:
    ```bash
    npm install @sveltejs/adapter-cloudflare
    npm install -D tailwindcss @tailwindcss/vite
    ```

    Configure `svelte.config.js` to use `adapter-cloudflare` (not adapter-auto).

    Configure `vite.config.ts` to include the `@tailwindcss/vite` plugin.

    Set up `src/app.css` with Tailwind v4 import (`@import "tailwindcss"`) and define CSS custom properties for the brand palette:
    - `--color-dark: #0A0A0A`
    - `--color-light: #FAFAFA`
    - `--color-ez-yellow: #F4C430`
    - `--color-ez-blue: #0066FF`
    - `--color-ez-green: #00CC66`
    - `--color-ez-purple: #8B5CF6`

    Use Tailwind v4's `@theme` directive to register these as theme colors so they work as `bg-ez-yellow`, `text-ez-blue`, etc.

    Import Inter (400, 500, 600, 700) and JetBrains Mono (400, 500) from Google Fonts in `app.html`. Set Inter as default sans, JetBrains Mono as default mono in Tailwind theme.

    **Step 2: Build layout and page sections**

    `+layout.svelte`: Dark background (`bg-[#0A0A0A]`), light text (`text-[#FAFAFA]`), smooth scroll behavior, import app.css.

    `+page.svelte`: Compose all section components in order: Nav, Hero, Problem, HowItWorks, Features, Terminal, CTA, Footer. Use `<svelte:head>` for basic title and description meta.

    **Step 3: Build each section component**

    **Nav.svelte:**
    - Sticky top nav, transparent/blur backdrop
    - "ez-search" wordmark left (styled: "ez" in EZ Yellow, "-search" in light)
    - Links: Features, How It Works, GitHub (external to https://github.com/ezcorp-org/ez-search)
    - "Get Started" button (EZ Yellow, scrolls to CTA section)

    **Hero.svelte:**
    - Large tagline: "Make it EZ." in bold with EZ Yellow accent
    - Subtitle: "Semantic codebase search with zero cloud dependencies. Local ML, private by default, built for AI coding assistants."
    - Install command block with monospace font and copy-to-clipboard button:
      ```
      npm install -g ez-search
      ```
    - Two CTAs: "Get Started" (primary, EZ Yellow) and "View on GitHub" (outline)
    - Subtle gradient or glow effect behind the hero text using EZ Yellow/Blue

    **Problem.svelte:**
    - Heading: "grep is dead. Long live semantic search."
    - Two-column layout (stacks on mobile):
      - Left: The problem - "You search for 'authentication logic' but grep only finds literal matches. You know the code exists, but you can't describe it in grep syntax. Your AI assistant can't find relevant context either."
      - Right: The solution - "ez-search understands meaning, not just text. Ask 'how are users authenticated' and find the auth middleware, the JWT validation, the session handler -- even if none contain the word 'authentication'."
    - Use subtle EZ Blue accent for the solution side

    **HowItWorks.svelte:**
    - Heading: "Three commands. That's it."
    - Three-step horizontal layout (vertical on mobile), each with:
      1. Step number (large, EZ Yellow), "Index" label, command `ez-search index .`, description "Point it at your project. It chunks your code, docs, and images, then generates embeddings locally."
      2. Step number, "Query" label, command `ez-search query "..."`, description "Ask in plain English. Semantic search finds relevant code even when keywords don't match."
      3. Step number, "Results" label, command `ez-search status`, description "Get ranked results with file paths, line numbers, and relevance scores. JSON output for AI assistants, human-readable text for you."
    - Subtle connecting line/arrow between steps

    **Features.svelte:**
    - Heading: "Everything you need. Nothing you don't."
    - 2x3 grid of feature cards (responsive: 1 col mobile, 2 col tablet, 3 col desktop):
      1. **Privacy First** (icon: shield/lock) - "Your code never leaves your machine. No cloud, no API keys, no telemetry. Period."
      2. **Three Pipelines** (icon: layers) - "Code, text, and images. Each with a specialized ML model optimized for that data type."
      3. **Blazing Fast** (icon: zap) - "WebGPU acceleration with automatic CPU fallback. Incremental indexing only re-embeds what changed."
      4. **AI-Ready** (icon: robot/brain) - "Built as a retrieval engine for Claude Code and other AI assistants. JSON output by default."
      5. **Smart Chunking** (icon: scissors) - "Respects code boundaries. Sliding window for code, paragraph-aware for docs. No dumb line splits."
      6. **Zero Config** (icon: check-circle) - "Convention over configuration. Respects .gitignore. Just index and query."
    - Cards: dark card bg (#111 or similar), subtle border, hover glow effect with the feature's accent color
    - Use inline SVG icons (simple, 24x24, stroke-based). Do NOT use any icon library.

    **Terminal.svelte + TerminalAnimation.svelte:**
    - Terminal.svelte: Wrapper with terminal chrome (dots, title bar "ez-search")
    - TerminalAnimation.svelte: Typewriter animation that cycles through a demo session:
      ```
      $ ez-search index .
      Indexing 142 files...
      [========================================] 100%
      Indexed: 89 code, 41 text, 12 images

      $ ez-search query "error handling in auth"

      ## Code
      File: src/auth/middleware.ts | Lines: 23-45 | Relevance: 0.92
          try {
            const token = extractToken(req);
            const user = await verifyJWT(token);
            req.user = user;
          } catch (err) {
            return res.status(401).json({ error: 'Invalid token' });
          }

      File: src/auth/validate.ts | Lines: 8-19 | Relevance: 0.85
          if (!token || token.expired) {
            throw new AuthError('Token expired or missing');
          }
      ```
    - Use Svelte's `onMount` + `setInterval`/`setTimeout` for the typewriter effect
    - Type speed: ~40ms per character for commands, instant-reveal for output blocks (with slight delay between lines)
    - Loop the animation with a pause between cycles
    - Green text for commands (`text-ez-green`), white for output, yellow for file paths, blue for scores
    - The terminal should be visible via Intersection Observer -- only start animating when scrolled into view

    **CTA.svelte:**
    - Heading: "Ready to make search EZ?"
    - Large install command block (same copy-to-clipboard as hero)
    - "Star on GitHub" secondary link
    - Brief note: "Free, open source, ISC licensed. Works with Node.js 20+."
    - Background: subtle gradient using EZ Yellow/Purple at low opacity

    **Footer.svelte:**
    - Three columns: Product (Features, How It Works, GitHub), Resources (README, npm package, Issues), EZCorp (link to github org)
    - npm link: https://www.npmjs.com/package/@ez-corp/ez-search
    - GitHub issues: https://github.com/ezcorp-org/ez-search/issues
    - Copyright line: "2026 EZCorp. Make it EZ."
    - Keep it minimal

    **Step 4: Create favicon**
    - Simple SVG favicon: "EZ" text in EZ Yellow on transparent/dark background

    **Step 5: Cloudflare config**
    - `wrangler.toml` with basic Pages config: `name = "ez-search"`, `compatibility_date` set to today

    **Step 6: Micro-animations and polish**
    - Scroll-triggered fade-in for each section (use Intersection Observer, add Svelte transition classes)
    - Smooth scroll for nav anchor links
    - Copy-to-clipboard: show brief "Copied!" tooltip feedback
    - Hover effects on feature cards (subtle border glow)
    - Keep animations subtle and performant (CSS transforms/opacity only, no layout thrash)

    **Design constraints:**
    - Dark mode ONLY for v1 (no light mode toggle needed)
    - Max content width: 1200px, centered
    - Section vertical padding: generous (py-20 to py-32)
    - All text must meet WCAG AA contrast on dark background
    - Mobile-first responsive: test at 375px, 768px, 1024px, 1440px breakpoints
  </action>
  <verify>
    Run `cd site && npm run build` -- build succeeds with zero errors.
    Run `cd site && npm run dev` -- dev server starts, page loads at localhost:5173.
    All 7 sections render visually on the page.
    Terminal animation plays through the demo sequence.
    Copy-to-clipboard works on the install command.
    Page is responsive (check at narrow viewport).
  </verify>
  <done>
    Complete landing page renders with all sections (Nav, Hero, Problem, HowItWorks, Features, Terminal, CTA, Footer), terminal typewriter animation works, copy-to-clipboard works, page builds for Cloudflare without errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: UI/UX review and visual refinement pass</name>
  <files>
    site/src/lib/components/Hero.svelte
    site/src/lib/components/Problem.svelte
    site/src/lib/components/HowItWorks.svelte
    site/src/lib/components/Features.svelte
    site/src/lib/components/Terminal.svelte
    site/src/lib/components/TerminalAnimation.svelte
    site/src/lib/components/CTA.svelte
    site/src/lib/components/Footer.svelte
    site/src/lib/components/Nav.svelte
    site/src/routes/+layout.svelte
    site/src/app.css
  </files>
  <action>
    **Agent role: UI/UX Reviewer**

    Start the dev server (`cd site && npm run dev`) and review the page systematically. Fix issues directly in code.

    **Review checklist and fix each issue found:**

    1. **Visual hierarchy**: Hero headline must be the largest text on the page. Section headings should follow a clear size progression (h1 > h2 > h3). Body text should be 16-18px. Check that nothing competes with the hero for attention.

    2. **Spacing consistency**: Sections should have consistent vertical rhythm. Check padding between sections is uniform (py-24 or py-32). Inner element spacing should use a consistent scale. Remove any awkward gaps or cramped areas.

    3. **Color usage**: EZ Yellow should be used sparingly as accent (CTAs, highlights, step numbers), not for large text blocks. Verify text contrast meets WCAG AA (light gray on dark: use #E5E7EB or brighter, not #9CA3AF for body text). Feature card backgrounds should be distinct from page background.

    4. **Typography**: Verify Inter loads and renders for all body text. Verify JetBrains Mono renders for all code/terminal content. Check line-height is comfortable (1.6-1.7 for body, 1.2-1.3 for headlines). Check that no text is too wide (max ~70ch for readability).

    5. **Responsive behavior**: Check at 375px (mobile), 768px (tablet), 1024px (laptop), 1440px (desktop). Fix: nav should collapse or simplify on mobile. Feature grid should stack properly. Terminal should not overflow. HowItWorks steps should stack vertically on mobile. All padding should reduce on mobile.

    6. **Interactive elements**: Verify all buttons have visible hover/focus states. Copy button should have clear feedback. Nav links should have hover states. GitHub link should open in new tab. Scroll-to-section should be smooth.

    7. **Animation quality**: Terminal typewriter should feel natural (not too fast, not too slow). Scroll fade-ins should be subtle (200-300ms, ease-out). No janky animations or layout shifts. Animations should only trigger once (not re-trigger on scroll back).

    8. **Terminal component**: The terminal demo is the centerpiece. Ensure: proper padding inside terminal window, text doesn't overflow, colored syntax highlighting is readable, the chrome (title bar dots) looks authentic, there's a visible cursor during typing.

    9. **CTA effectiveness**: Install command must be immediately visible and copyable. "Get Started" buttons must stand out. The page should have exactly two install command blocks (hero + CTA section) -- not more.

    10. **Overall polish**: No orphaned words in headlines. No widows in paragraphs. Consistent border-radius across components. Consistent shadow/glow treatment. Page should feel cohesive and professional while maintaining the casual EZCorp brand voice.

    Fix all issues found directly in the component files. Focus on CSS/Tailwind class adjustments, spacing tweaks, and responsive fixes. Do not restructure the component architecture.
  </action>
  <verify>
    Run `cd site && npm run build` -- still builds cleanly after changes.
    Dev server shows refined page with no visual regressions.
    Page looks polished at all four breakpoints (375, 768, 1024, 1440).
    All interactive elements (copy, scroll, hover) work correctly.
  </verify>
  <done>
    Landing page passes all 10 UI/UX checklist items. Visual hierarchy is clear, spacing is consistent, colors meet contrast requirements, responsive layout works at all breakpoints, animations are smooth, terminal demo is polished.
  </done>
</task>

<task type="auto">
  <name>Task 3: SEO, meta tags, structured data, and performance</name>
  <files>
    site/src/routes/+page.svelte
    site/src/routes/+layout.svelte
    site/src/app.html
    site/static/robots.txt
    site/static/sitemap.xml
  </files>
  <action>
    **Agent role: SEO and Marketing Expert**

    **Step 1: Meta tags and Open Graph**

    In `+page.svelte` `<svelte:head>`, add comprehensive meta tags:
    ```
    title: "ez-search -- Semantic Codebase Search CLI | Local, Private, AI-Ready"
    description: "Search your codebase by meaning, not keywords. ez-search is a privacy-first CLI that runs ML locally -- no cloud, no API keys. Built for developers and AI coding assistants."
    ```

    Open Graph tags:
    - `og:title`: "ez-search -- Make Codebase Search EZ"
    - `og:description`: same as meta description
    - `og:type`: "website"
    - `og:url`: "https://ez-search.dev" (placeholder, update when domain confirmed)
    - `og:image`: skip for now (no OG image asset yet), add a TODO comment
    - `og:site_name`: "ez-search"

    Twitter Card tags:
    - `twitter:card`: "summary_large_image"
    - `twitter:title`, `twitter:description`: same as OG

    **Step 2: Structured data (JSON-LD)**

    Add JSON-LD script in `+page.svelte` `<svelte:head>`:

    SoftwareApplication schema:
    ```json
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "ez-search",
      "description": "Semantic codebase search with zero cloud dependencies",
      "applicationCategory": "DeveloperApplication",
      "operatingSystem": "Cross-platform (Node.js)",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD"
      },
      "author": {
        "@type": "Organization",
        "name": "EZCorp"
      },
      "softwareVersion": "1.0.10",
      "license": "https://opensource.org/licenses/ISC",
      "url": "https://github.com/ezcorp-org/ez-search",
      "downloadUrl": "https://www.npmjs.com/package/@ez-corp/ez-search",
      "codeRepository": "https://github.com/ezcorp-org/ez-search"
    }
    ```

    **Step 3: Semantic HTML audit**

    Review all components and ensure:
    - Page has exactly one `<h1>` (in Hero)
    - Sections use `<section>` with meaningful `aria-label` attributes
    - Heading hierarchy: h1 (hero) > h2 (section titles) > h3 (subsection)
    - Nav uses `<nav>` with `aria-label="Main navigation"`
    - Footer uses `<footer>` element
    - Install command blocks use `<code>` inside `<pre>`
    - Links have descriptive text (no "click here")
    - External links have `rel="noopener noreferrer"`
    - Images (if any) have alt text
    - Interactive elements are keyboard accessible

    **Step 4: robots.txt and sitemap**

    Create `site/static/robots.txt`:
    ```
    User-agent: *
    Allow: /
    Sitemap: https://ez-search.dev/sitemap.xml
    ```

    Create `site/static/sitemap.xml`:
    ```xml
    <?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url>
        <loc>https://ez-search.dev/</loc>
        <changefreq>weekly</changefreq>
        <priority>1.0</priority>
      </url>
    </urlset>
    ```

    **Step 5: Performance basics**

    - Ensure Google Fonts uses `display=swap` for font loading
    - Add `<link rel="preconnect" href="https://fonts.googleapis.com">` and `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` in app.html
    - Verify no render-blocking resources beyond essential CSS
    - Add `loading="lazy"` to any images below the fold (if any exist)
    - Ensure the terminal animation does not run when tab is not visible (use `document.hidden` check)

    **Step 6: Keyword optimization in content**

    Review copy in all sections. Ensure these target keywords appear naturally:
    - Primary: "semantic code search", "codebase search", "code search CLI"
    - Secondary: "local code search", "private code search", "AI code search", "semantic search tool"
    - Long-tail: "search codebase by meaning", "grep alternative for code", "semantic search for developers"

    Do NOT keyword-stuff. The existing copy should already cover most of these. Only add a keyword if it fits naturally and improves clarity. The brand voice (casual, developer-friendly) takes priority over SEO.
  </action>
  <verify>
    Run `cd site && npm run build` -- still builds cleanly.
    View page source: meta tags, OG tags, Twitter cards, and JSON-LD are present.
    HTML has correct heading hierarchy (one h1, sections with h2).
    robots.txt and sitemap.xml are accessible in static/.
    All external links have rel="noopener noreferrer".
    Page title and description are set correctly.
  </verify>
  <done>
    Page has complete SEO meta tags (title, description, OG, Twitter Card), JSON-LD structured data for SoftwareApplication, semantic HTML with proper heading hierarchy and ARIA labels, robots.txt, sitemap.xml, font preconnects, and natural keyword placement in copy.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Complete ez-search landing page with all sections, animations, responsive design, and SEO optimization</what-built>
  <how-to-verify>
    1. Run `cd site && npm run dev` and open http://localhost:5173
    2. Check hero section: tagline, install command, CTAs visible
    3. Scroll through all sections: Problem, How It Works, Features, Terminal, CTA, Footer
    4. Watch the terminal animation play through the demo
    5. Click "copy" on the install command -- verify clipboard
    6. Resize browser to mobile width (~375px) -- verify responsive layout
    7. Check nav links scroll to correct sections
    8. Right-click > View Page Source -- verify meta tags and JSON-LD
    9. Run `cd site && npm run build` -- verify clean production build
  </how-to-verify>
  <resume-signal>Type "approved" or describe any issues to fix</resume-signal>
</task>

</tasks>

<verification>
- `cd site && npm run build` produces a clean build with no errors or warnings
- Dev server renders complete page with all 7 content sections
- Terminal typewriter animation plays and loops correctly
- Copy-to-clipboard works on install commands
- Page is responsive at 375px, 768px, 1024px, 1440px
- View source shows meta tags, OG tags, JSON-LD structured data
- All nav links and CTAs function correctly
- robots.txt and sitemap.xml are present in build output
</verification>

<success_criteria>
A polished, brand-consistent landing page for ez-search that:
1. Clearly communicates the value prop (semantic search, local/private, AI-ready)
2. Has an engaging terminal demo animation
3. Provides clear install CTAs with copy-to-clipboard
4. Is fully responsive and accessible
5. Has complete SEO optimization (meta, structured data, semantic HTML)
6. Builds cleanly for Cloudflare Pages deployment
</success_criteria>

<output>
After completion, create `.planning/quick/002-landing-page-sveltekit-cloudflare/002-SUMMARY.md`
</output>
