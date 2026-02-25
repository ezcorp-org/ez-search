<script lang="ts">
	import Nav from '$lib/components/Nav.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import DocsSidebar from '$lib/components/docs/DocsSidebar.svelte';
	import DocsSection from '$lib/components/docs/DocsSection.svelte';
	import CodeBlock from '$lib/components/docs/CodeBlock.svelte';
	import FlagTable from '$lib/components/docs/FlagTable.svelte';
	import ParamTable from '$lib/components/docs/ParamTable.svelte';
	import {
		cliCommands,
		libraryFunctions,
		typeDefinitions,
		errorCodes,
		fileTypeGroups,
		quickStartSteps,
		storageContent,
		errorHandlingExample,
		builtInExclusions,
	} from '$lib/data/docs-content';
</script>

<svelte:head>
	<title>Documentation — ez-search | CLI & Library API Reference</title>
	<meta name="description" content="Complete reference for ez-search CLI commands and JavaScript/TypeScript library API. Learn how to index, query, and manage semantic search for your codebase." />
	<link rel="canonical" href="https://ez-search.ezcorp.org/docs" />

	<!-- Open Graph -->
	<meta property="og:type" content="article" />
	<meta property="og:url" content="https://ez-search.ezcorp.org/docs" />
	<meta property="og:site_name" content="ez-search" />
	<meta property="og:locale" content="en_US" />
	<meta property="og:title" content="Documentation — ez-search | CLI & Library API Reference" />
	<meta property="og:description" content="Complete reference for ez-search CLI commands and JavaScript/TypeScript library API. Learn how to index, query, and manage semantic search for your codebase." />
	<meta property="og:image" content="https://ez-search.ezcorp.org/og-image.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="ez-search Documentation — CLI & Library API Reference" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Documentation — ez-search | CLI & Library API Reference" />
	<meta name="twitter:description" content="Complete reference for ez-search CLI commands and JavaScript/TypeScript library API." />
	<meta name="twitter:image" content="https://ez-search.ezcorp.org/og-image.png" />
	<meta name="twitter:image:alt" content="ez-search Documentation — CLI & Library API Reference" />

	<!-- JSON-LD -->
	{@html `<script type="application/ld+json">${JSON.stringify({
		"@context": "https://schema.org",
		"@type": "TechArticle",
		"headline": "ez-search Documentation — CLI & Library API Reference",
		"description": "Complete reference for ez-search CLI commands and JavaScript/TypeScript library API.",
		"url": "https://ez-search.ezcorp.org/docs",
		"image": "https://ez-search.ezcorp.org/og-image.png",
		"author": {
			"@type": "Organization",
			"name": "EZCorp",
			"url": "https://ez-search.ezcorp.org"
		},
		"publisher": {
			"@type": "Organization",
			"name": "EZCorp",
			"url": "https://ez-search.ezcorp.org"
		},
		"about": {
			"@type": "SoftwareApplication",
			"name": "ez-search",
			"applicationCategory": "DeveloperApplication"
		}
	})}</script>`}
</svelte:head>

<Nav />

<div class="pt-20 mx-auto max-w-[1200px] px-6 lg:flex lg:gap-10">
	<DocsSidebar />

	<main class="flex-1 min-w-0 py-10 space-y-16">
		<!-- ── Installation ─────────────────────────────────────────── -->
		<DocsSection id="installation" title="Installation">
			<p class="text-body mb-4">Install ez-search globally to use the CLI, or as a project dependency for the library API.</p>
			<div class="space-y-3">
				<div>
					<p class="text-sm text-muted mb-2">Global (CLI)</p>
					<CodeBlock code="npm install -g @ez-corp/ez-search" />
				</div>
				<div>
					<p class="text-sm text-muted mb-2">Project dependency (Library)</p>
					<CodeBlock code="npm install @ez-corp/ez-search" />
				</div>
			</div>
			<p class="text-sm text-muted mt-4">Requires Node.js >= 20. ESM only.</p>
		</DocsSection>

		<!-- ── Quick Start ──────────────────────────────────────────── -->
		<DocsSection id="quick-start" title="Quick Start">
			<div class="space-y-6">
				{#each quickStartSteps as { step, label, code }}
					<div>
						<p class="text-sm text-body mb-2">
							<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-ez-yellow/10 text-ez-yellow text-xs font-bold mr-2">{step}</span>
							{label}
						</p>
						<CodeBlock {code} />
					</div>
				{/each}
			</div>
		</DocsSection>

		<!-- ── CLI Commands ──────────────────────────────────────────── -->
		{#each cliCommands as cmd}
			<DocsSection id="cli-{cmd.name}" title="ez-search {cmd.name}">
				<p class="text-body mb-4">{cmd.description}</p>
				<CodeBlock code={cmd.signature} />

				{#if cmd.flags.length > 0}
					<h4 class="text-sm font-semibold text-light mt-6 mb-3">Flags</h4>
					<FlagTable flags={cmd.flags} />
				{/if}

				{#if cmd.examples.length > 0}
					<h4 class="text-sm font-semibold text-light mt-6 mb-3">Examples</h4>
					<div class="space-y-4">
						{#each cmd.examples as example}
							<div>
								<p class="text-sm text-muted mb-2">{example.label}</p>
								<CodeBlock code={example.code} />
							</div>
						{/each}
					</div>
				{/if}
			</DocsSection>
		{/each}

		<!-- ── Library Functions ──────────────────────────────────────── -->
		{#each libraryFunctions as fn}
			<DocsSection id="api-{fn.name}" title="{fn.name}()">
				<p class="text-body mb-4">{fn.description}</p>
				<CodeBlock code={fn.signature} lang="ts" />

				<h4 class="text-sm font-semibold text-light mt-6 mb-3">Parameters</h4>
				<ParamTable params={fn.params} />

				<h4 class="text-sm font-semibold text-light mt-6 mb-3">Returns</h4>
				<p class="text-body">
					<code class="font-mono text-ez-purple text-sm">{fn.returnType}</code>
					— {fn.returnDescription}
				</p>

				{#if fn.examples.length > 0}
					<h4 class="text-sm font-semibold text-light mt-6 mb-3">Examples</h4>
					<div class="space-y-4">
						{#each fn.examples as example}
							<div>
								<p class="text-sm text-muted mb-2">{example.label}</p>
								<CodeBlock code={example.code} lang="ts" />
							</div>
						{/each}
					</div>
				{/if}
			</DocsSection>
		{/each}

		<!-- ── Error Handling ─────────────────────────────────────────── -->
		<DocsSection id="error-handling" title="Error Handling">
			<p class="text-body mb-4">
				Library functions throw <code class="font-mono text-ez-purple text-sm">EzSearchError</code> on failure.
				Each error includes a machine-readable code and a human-readable suggestion.
			</p>
			<CodeBlock code={errorHandlingExample} lang="ts" />

			<h4 class="text-sm font-semibold text-light mt-6 mb-3">Error Codes</h4>
			<div class="hidden md:block bg-card border border-card-border rounded-xl overflow-hidden">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-card-border text-muted text-left">
							<th class="px-4 py-3 font-medium">Code</th>
							<th class="px-4 py-3 font-medium">Meaning</th>
							<th class="px-4 py-3 font-medium">Suggestion</th>
						</tr>
					</thead>
					<tbody>
						{#each errorCodes as { code, meaning, suggestion }}
							<tr class="border-b border-card-border last:border-0">
								<td class="px-4 py-3 font-mono text-ez-green whitespace-nowrap">{code}</td>
								<td class="px-4 py-3 text-body">{meaning}</td>
								<td class="px-4 py-3 text-muted">{suggestion}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="md:hidden space-y-3">
				{#each errorCodes as { code, meaning, suggestion }}
					<div class="bg-card border border-card-border rounded-xl p-4 space-y-2">
						<div class="font-mono text-ez-green text-sm">{code}</div>
						<div class="text-body text-sm">{meaning}</div>
						<div class="text-muted text-xs">{suggestion}</div>
					</div>
				{/each}
			</div>
		</DocsSection>

		<!-- ── Types Reference ────────────────────────────────────────── -->
		<DocsSection id="types" title="Types">
			<p class="text-body mb-6">All types are exported from the package and available for TypeScript projects.</p>
			<div class="space-y-6">
				{#each typeDefinitions as typeDef}
					<div>
						<h4 class="font-mono text-ez-purple text-sm font-medium mb-2">{typeDef.name}</h4>
						<CodeBlock code={typeDef.code} lang="ts" />
					</div>
				{/each}
			</div>
		</DocsSection>

		<!-- ── Supported File Types ───────────────────────────────────── -->
		<DocsSection id="file-types" title="Supported File Types">
			<p class="text-body mb-4">ez-search categorizes files into three types based on extension.</p>
			<div class="bg-card border border-card-border rounded-xl overflow-hidden">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-card-border text-muted text-left">
							<th class="px-4 py-3 font-medium">Type</th>
							<th class="px-4 py-3 font-medium">Extensions</th>
						</tr>
					</thead>
					<tbody>
						{#each fileTypeGroups as group}
							<tr class="border-b border-card-border last:border-0">
								<td class="px-4 py-3 font-mono text-ez-purple whitespace-nowrap">{group.type}</td>
								<td class="px-4 py-3 text-body">
									<span class="font-mono text-sm">{group.extensions.join('  ')}</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<h4 class="text-sm font-semibold text-light mt-6 mb-3">Built-in Exclusions</h4>
			<p class="text-body mb-3">These paths and patterns are always excluded from indexing:</p>
			<div class="flex flex-wrap gap-2">
				{#each builtInExclusions as exc}
					<span class="font-mono text-xs bg-card border border-card-border rounded-md px-2 py-1 text-muted">{exc}</span>
				{/each}
			</div>
		</DocsSection>

		<!-- ── Storage ────────────────────────────────────────────────── -->
		<DocsSection id="storage" title={storageContent.title}>
			<p class="text-body mb-4">{storageContent.description}</p>
			<CodeBlock code={storageContent.structure} />

			<ul class="mt-4 space-y-2 text-sm text-body">
				{#each storageContent.notes as note}
					<li class="flex gap-2">
						<span class="text-muted shrink-0">-</span>
						<span>{note}</span>
					</li>
				{/each}
			</ul>
		</DocsSection>
	</main>
</div>

<Footer />
