<script lang="ts">
	import { onMount } from 'svelte';

	interface ImageResult {
		file: string;
		relevance: number;
		gradient: string;
	}

	const results: ImageResult[] = [
		{ file: 'ui/screens/login.png', relevance: 0.91, gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
		{ file: 'mockups/auth-flow.svg', relevance: 0.87, gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
		{ file: 'screenshots/signin-v2.jpg', relevance: 0.82, gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
		{ file: 'design/onboarding.png', relevance: 0.74, gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
		{ file: 'assets/social-login.svg', relevance: 0.69, gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' },
		{ file: 'wireframes/auth.png', relevance: 0.65, gradient: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)' },
	];

	let visible = $state(false);

	onMount(() => {
		// Stagger-animate cards in after a brief delay
		setTimeout(() => { visible = true; }, 100);
	});

	function badge(file: string): string {
		const ext = file.split('.').pop()?.toUpperCase() ?? '';
		return ext;
	}

	function badgeColor(file: string): string {
		const ext = file.split('.').pop();
		switch (ext) {
			case 'png': return 'bg-ez-blue/20 text-ez-blue';
			case 'svg': return 'bg-ez-purple/20 text-ez-purple';
			case 'jpg': return 'bg-ez-yellow/20 text-ez-yellow';
			default: return 'bg-muted/20 text-muted';
		}
	}
</script>

<div class="p-4 sm:p-6">
	<div class="font-mono text-xs sm:text-sm text-ez-green mb-4">
		$ ez-search query "login screen design" --type image
	</div>

	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
		{#each results as result, i}
			<div
				class="group rounded-lg border border-card-border bg-card overflow-hidden transition-all duration-200 hover:scale-[1.02] hover:border-ez-purple/40"
				style="opacity: {visible ? 1 : 0}; transform: translateY({visible ? '0' : '8px'}); transition-delay: {i * 50}ms; transition-property: opacity, transform;"
			>
				<!-- Gradient placeholder thumbnail -->
				<div
					class="h-24 sm:h-28 w-full relative"
					style="background: {result.gradient};"
				>
					<span class="absolute top-2 right-2 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded {badgeColor(result.file)}">
						{badge(result.file)}
					</span>
				</div>

				<!-- Card info -->
				<div class="px-3 py-2.5">
					<p class="font-mono text-xs text-body truncate" title={result.file}>{result.file}</p>
					<!-- Relevance bar -->
					<div class="mt-1.5 flex items-center gap-2">
						<div class="flex-1 h-1 rounded-full bg-card-border overflow-hidden">
							<div
								class="h-full rounded-full bg-ez-purple transition-all duration-500"
								style="width: {visible ? result.relevance * 100 : 0}%; transition-delay: {i * 50 + 200}ms;"
							></div>
						</div>
						<span class="text-[10px] font-mono text-muted">{result.relevance.toFixed(2)}</span>
					</div>
				</div>
			</div>
		{/each}
	</div>
</div>
