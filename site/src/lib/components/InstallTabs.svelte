<script lang="ts">
	type Pm = 'npm' | 'yarn' | 'pnpm' | 'bun';

	let active: Pm = $state('npm');
	let copied = $state(false);

	const commands: Record<Pm, string> = {
		npm: 'npm install -g ez-search',
		yarn: 'yarn global add ez-search',
		pnpm: 'pnpm add -g ez-search',
		bun: 'bun add -g ez-search',
	};

	const pms: Pm[] = ['npm', 'yarn', 'pnpm', 'bun'];

	async function copy() {
		await navigator.clipboard.writeText(commands[active]);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<div class="inline-flex flex-col items-center">
	<!-- Package manager tabs -->
	<div class="flex gap-1 mb-2">
		{#each pms as pm}
			<button
				onclick={() => { active = pm; copied = false; }}
				class="px-3 py-1 rounded-md text-xs font-mono transition-colors cursor-pointer
					{active === pm
						? 'bg-card-border/60 text-light'
						: 'text-muted/60 hover:text-muted'}"
				aria-pressed={active === pm}
			>{pm}</button>
		{/each}
	</div>

	<!-- Command with copy -->
	<div class="inline-flex items-center gap-2 sm:gap-3 bg-card border border-card-border rounded-lg px-3 sm:px-5 py-3 font-mono text-xs sm:text-sm">
		<span class="text-muted">$</span>
		<code>{commands[active]}</code>
		<button
			onclick={copy}
			class="flex items-center gap-1 text-muted hover:text-light transition-colors ml-2 cursor-pointer"
			aria-label="Copy install command"
		>
			{#if copied}
				<svg class="text-ez-green" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
				<span class="text-ez-green text-xs">Copied!</span>
			{:else}
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
			{/if}
		</button>
	</div>
</div>
