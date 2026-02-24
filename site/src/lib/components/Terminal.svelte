<script lang="ts">
	import { onMount } from 'svelte';
	import TerminalAnimation from './TerminalAnimation.svelte';

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
</script>

<section
	bind:this={section}
	class="py-24 md:py-32 px-6 transition-all duration-700 {visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}"
	aria-label="Terminal demo"
>
	<div class="mx-auto max-w-[800px]">
		<h2 class="text-3xl md:text-4xl font-bold text-center mb-12">
			See it in action.
		</h2>

		<div class="rounded-xl overflow-hidden border border-card-border bg-[#0D0D0D] shadow-2xl">
			<!-- Terminal chrome -->
			<div class="flex items-center gap-2 px-4 py-3 bg-card border-b border-card-border">
				<div class="w-3 h-3 rounded-full bg-[#FF5F57]"></div>
				<div class="w-3 h-3 rounded-full bg-[#FFBD2E]"></div>
				<div class="w-3 h-3 rounded-full bg-[#28C840]"></div>
				<span class="ml-3 text-xs text-muted">ez-search</span>
			</div>

			<TerminalAnimation />
		</div>
	</div>
</section>
