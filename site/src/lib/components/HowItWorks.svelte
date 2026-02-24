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
</script>

<section
	id="how-it-works"
	bind:this={section}
	class="fade-section py-24 md:py-32 px-6"
	aria-label="How ez-search works"
>
	<div class="mx-auto max-w-[600px] text-center">
		<h2 class="text-3xl md:text-4xl font-bold mb-6">
			One command. <span class="text-muted">That's it.</span>
		</h2>

		<code class="inline-block bg-card border border-card-border rounded-lg px-6 py-3 font-mono text-sm sm:text-base text-ez-green mb-6">
			ez-search query "error handling in auth"
		</code>

		<p class="text-body text-sm sm:text-base leading-relaxed max-w-md mx-auto">
			Auto-indexes on first run. No setup, no config, no extra steps. Just search your codebase by meaning.
		</p>
	</div>
</section>
