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
	bind:this={section}
	class="fade-section py-24 md:py-32 px-6"
	aria-label="The problem ez-search solves"
>
	<div class="mx-auto max-w-[1200px]">
		<h2 class="text-3xl md:text-4xl font-bold text-center mb-16">
			grep is dead. <span class="text-muted">Long live semantic search.</span>
		</h2>

		<div class="grid md:grid-cols-2 gap-8 md:gap-12">
			<div class="bg-card border border-card-border rounded-xl p-8">
				<div class="text-sm font-semibold text-muted uppercase tracking-wider mb-4">The problem</div>
				<p class="text-body leading-relaxed">
					You search for "authentication logic" but grep only finds literal matches.
					You know the code exists, but you can't describe it in grep syntax.
					Your AI assistant can't find relevant context either.
				</p>
			</div>

			<div class="bg-card border border-ez-blue/20 rounded-xl p-8">
				<div class="text-sm font-semibold text-ez-blue uppercase tracking-wider mb-4">The solution</div>
				<p class="text-body leading-relaxed">
					ez-search understands meaning, not just text. Ask "how are users authenticated"
					and find the auth middleware, the JWT validation, the session handler &mdash;
					even if none contain the word "authentication."
				</p>
			</div>
		</div>
	</div>
</section>
