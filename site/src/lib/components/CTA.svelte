<script lang="ts">
	import InstallTabs from './InstallTabs.svelte';
</script>

<section
	id="cta"
	class="relative py-24 md:py-32 px-6 overflow-hidden"
	aria-label="Get started with ez-search"
>
	<div class="absolute inset-0 pointer-events-none">
		<div class="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-ez-yellow/5 rounded-full blur-[120px]"></div>
		<div class="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-ez-purple/5 rounded-full blur-[100px]"></div>
	</div>

	<div class="relative mx-auto max-w-[1200px] text-center">
		<h2 class="text-3xl md:text-4xl font-bold mb-8">
			Ready to make search <span class="text-ez-yellow">EZ</span>?
		</h2>

		<div class="mb-8">
			<InstallTabs />
		</div>

		<div class="mb-8">
			<a
				href="https://github.com/ezcorp-org/ez-search"
				target="_blank"
				rel="noopener noreferrer"
				class="text-muted hover:text-light transition-colors text-sm inline-flex items-center gap-2"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
				Star on GitHub
			</a>
		</div>

		<p class="text-muted text-sm">
			Free, open source, ISC licensed. Works with Node.js 20+.
		</p>
	</div>
</section>
