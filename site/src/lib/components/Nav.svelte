<script lang="ts">
	let scrolled = $state(false);

	function onScroll() {
		scrolled = window.scrollY > 20;
	}
</script>

<svelte:window onscroll={onScroll} />

<nav
	class="fixed top-0 left-0 right-0 z-50 transition-all duration-300 {scrolled
		? 'bg-dark/80 backdrop-blur-lg border-b border-card-border'
		: ''}"
	aria-label="Main navigation"
>
	<div class="mx-auto max-w-[1200px] px-6 py-4 flex items-center justify-between">
		<a href="/" class="text-xl font-bold">
			<span class="text-ez-yellow">ez</span><span class="text-light">-search</span>
		</a>

		<div class="hidden md:flex items-center gap-8">
			<a href="#features" class="text-muted hover:text-light transition-colors text-sm">Features</a>
			<a href="#how-it-works" class="text-muted hover:text-light transition-colors text-sm">How It Works</a>
			<a
				href="https://github.com/ezcorp-org/ez-search"
				target="_blank"
				rel="noopener noreferrer"
				class="text-muted hover:text-light transition-colors text-sm"
			>GitHub</a>
			<a
				href="#cta"
				class="bg-ez-yellow text-dark px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition-all"
			>Get Started</a>
		</div>
	</div>
</nav>
