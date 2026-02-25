<script lang="ts">
	interface Props {
		code: string;
		lang?: string;
	}

	let { code, lang }: Props = $props();
	let copied = $state(false);

	async function copy() {
		await navigator.clipboard.writeText(code);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<div class="relative group">
	<pre
		class="bg-[#0D0D0D] border border-card-border rounded-xl font-mono text-sm p-4 overflow-x-auto"
	><code>{code}</code></pre>
	<button
		onclick={copy}
		class="absolute top-3 right-3 flex items-center gap-1 text-muted hover:text-light transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
		aria-label="Copy code"
	>
		{#if copied}
			<svg class="text-ez-green" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
			<span class="text-ez-green text-xs">Copied!</span>
		{:else}
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
		{/if}
	</button>
</div>
