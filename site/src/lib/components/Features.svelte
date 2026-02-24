<script lang="ts">
	import { onMount } from 'svelte';

	let visible = $state(false);
	let section: HTMLElement;

	onMount(() => {
		const observer = new IntersectionObserver(
			([entry]) => { if (entry.isIntersecting) visible = true; },
			{ threshold: 0.1 }
		);
		observer.observe(section);
		return () => observer.disconnect();
	});

	const features = [
		{
			title: 'Privacy First',
			description: 'Your code never leaves your machine. No cloud, no API keys, no telemetry. Period.',
			icon: 'shield',
			accent: 'text-ez-green'
		},
		{
			title: 'Three Pipelines',
			description: 'Code, text, and images. Each with a specialized ML model optimized for that data type.',
			icon: 'layers',
			accent: 'text-ez-purple'
		},
		{
			title: 'Blazing Fast',
			description: 'WebGPU acceleration with automatic CPU fallback. Incremental indexing only re-embeds what changed.',
			icon: 'zap',
			accent: 'text-ez-yellow'
		},
		{
			title: 'AI-Ready',
			description: 'Built as a retrieval engine for Claude Code and other AI assistants. JSON output by default.',
			icon: 'brain',
			accent: 'text-ez-blue'
		},
		{
			title: 'Smart Chunking',
			description: 'Respects code boundaries. Sliding window for code, paragraph-aware for docs. No dumb line splits.',
			icon: 'scissors',
			accent: 'text-ez-purple'
		},
		{
			title: 'Zero Config',
			description: 'Convention over configuration. Respects .gitignore. Just index and query.',
			icon: 'check',
			accent: 'text-ez-green'
		}
	];
</script>

{#snippet icon(name: string, cls: string)}
	{#if name === 'shield'}
		<svg class={cls} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>
	{:else if name === 'layers'}
		<svg class={cls} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.84z"/><path d="m2 12 8.58 3.91a2 2 0 0 0 1.66 0L20.73 12"/><path d="m2 17 8.58 3.91a2 2 0 0 0 1.66 0L20.73 17"/></svg>
	{:else if name === 'zap'}
		<svg class={cls} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>
	{:else if name === 'brain'}
		<svg class={cls} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/></svg>
	{:else if name === 'scissors'}
		<svg class={cls} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/></svg>
	{:else if name === 'check'}
		<svg class={cls} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
	{/if}
{/snippet}

<section
	id="features"
	bind:this={section}
	class="py-24 md:py-32 px-6 transition-all duration-700 {visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}"
	aria-label="Features"
>
	<div class="mx-auto max-w-[1200px]">
		<h2 class="text-3xl md:text-4xl font-bold text-center mb-16">
			Everything you need. <span class="text-muted">Nothing you don't.</span>
		</h2>

		<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
			{#each features as feature}
				<div class="group bg-card border border-card-border rounded-xl p-6 hover:border-muted/50 transition-all duration-300">
					<div class="mb-4 {feature.accent}">
						{@render icon(feature.icon, feature.accent)}
					</div>
					<h3 class="text-lg font-semibold mb-2">{feature.title}</h3>
					<p class="text-muted text-sm leading-relaxed">{feature.description}</p>
				</div>
			{/each}
		</div>
	</div>
</section>
