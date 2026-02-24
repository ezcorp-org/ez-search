<script lang="ts">
	import { onMount } from 'svelte';

	let section: HTMLElement;

	onMount(() => {
		section.classList.add('is-hidden');
		const observer = new IntersectionObserver(
			([entry]) => { if (entry.isIntersecting) section.classList.remove('is-hidden'); },
			{ threshold: 0.2 }
		);
		observer.observe(section);
		return () => observer.disconnect();
	});

	const steps = [
		{
			num: '1',
			label: 'Index',
			command: 'ez-search index .',
			description: 'Point it at your project. It chunks your code, docs, and images, then generates embeddings locally.'
		},
		{
			num: '2',
			label: 'Query',
			command: 'ez-search query "..."',
			description: 'Ask in plain English. Semantic search finds relevant code even when keywords don\'t match.'
		},
		{
			num: '3',
			label: 'Results',
			command: 'ez-search status',
			description: 'Get ranked results with file paths, line numbers, and relevance scores. JSON output for AI assistants, human-readable text for you.'
		}
	];
</script>

<section
	id="how-it-works"
	bind:this={section}
	class="fade-section py-24 md:py-32 px-6"
	aria-label="How ez-search works"
>
	<div class="mx-auto max-w-[1200px]">
		<h2 class="text-3xl md:text-4xl font-bold text-center mb-16">
			Three commands. <span class="text-muted">That's it.</span>
		</h2>

		<div class="grid md:grid-cols-3 gap-8 relative">
			<div class="hidden md:block absolute top-16 left-[20%] right-[20%] h-px bg-gradient-to-r from-transparent via-card-border to-transparent"></div>

			{#each steps as step}
				<div class="text-center">
					<div class="text-5xl font-bold text-ez-yellow mb-3">{step.num}</div>
					<div class="text-lg font-semibold mb-3">{step.label}</div>
					<code class="inline-block bg-card border border-card-border rounded-lg px-4 py-2 font-mono text-sm text-ez-green mb-4">
						{step.command}
					</code>
					<p class="text-body text-sm leading-relaxed max-w-xs mx-auto">{step.description}</p>
				</div>
			{/each}
		</div>
	</div>
</section>
