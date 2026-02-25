<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		id: string;
		title: string;
		level?: 2 | 3;
		children: Snippet;
	}

	let { id, title, level = 2, children }: Props = $props();
</script>

<section {id} class="scroll-mt-24">
	{#if level === 2}
		<h2 class="text-2xl font-bold text-light mb-6 group">
			<a href="#{id}" class="hover:text-ez-yellow transition-colors">
				{title}
				<span class="text-muted/0 group-hover:text-muted/60 transition-colors ml-2">#</span>
			</a>
		</h2>
	{:else}
		<h3 class="text-xl font-semibold text-light mb-4 group">
			<a href="#{id}" class="hover:text-ez-yellow transition-colors">
				{title}
				<span class="text-muted/0 group-hover:text-muted/60 transition-colors ml-2">#</span>
			</a>
		</h3>
	{/if}
	{@render children()}
</section>
