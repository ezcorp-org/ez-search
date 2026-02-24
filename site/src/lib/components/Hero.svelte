<script lang="ts">
	let copied = $state(false);

	async function copyInstall() {
		await navigator.clipboard.writeText('npm install -g ez-search');
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<section class="relative pt-32 pb-24 md:pt-40 md:pb-32 px-6 overflow-hidden">
	<div class="absolute inset-0 pointer-events-none">
		<div class="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-ez-yellow/5 rounded-full blur-[120px]"></div>
		<div class="absolute top-1/3 left-1/3 w-[300px] h-[300px] bg-ez-blue/5 rounded-full blur-[100px]"></div>
	</div>

	<div class="relative mx-auto max-w-[1200px] text-center">
		<h1 class="text-5xl md:text-7xl font-bold tracking-tight mb-6">
			Make it <span class="text-ez-yellow">EZ.</span>
		</h1>

		<p class="text-lg md:text-xl text-muted max-w-2xl mx-auto mb-10 leading-relaxed">
			Semantic codebase search with zero cloud dependencies.
			Local ML, private by default, built for AI coding assistants.
		</p>

		<div class="inline-flex items-center gap-3 bg-card border border-card-border rounded-lg px-5 py-3 mb-10 font-mono text-sm">
			<span class="text-muted">$</span>
			<code>npm install -g ez-search</code>
			<button
				onclick={copyInstall}
				class="text-muted hover:text-light transition-colors ml-2 cursor-pointer"
				aria-label="Copy install command"
			>
				{#if copied}
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
				{/if}
			</button>
		</div>

		<div class="flex flex-col sm:flex-row items-center justify-center gap-4">
			<a
				href="#cta"
				class="bg-ez-yellow text-dark px-8 py-3 rounded-lg font-semibold hover:brightness-110 transition-all"
			>Get Started</a>
			<a
				href="https://github.com/ezcorp-org/ez-search"
				target="_blank"
				rel="noopener noreferrer"
				class="border border-card-border text-light px-8 py-3 rounded-lg font-semibold hover:border-muted transition-all"
			>View on GitHub</a>
		</div>
	</div>
</section>
