<script lang="ts">
	let scrolled = $state(false);
	let menuOpen = $state(false);

	function onScroll() {
		scrolled = window.scrollY > 20;
	}

	function closeMenu() {
		menuOpen = false;
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
		<a href="/" class="flex items-center gap-2 text-xl font-bold">
			<img src="/favicon.svg" alt="" width="28" height="28" class="shrink-0" />
			<span><span class="text-ez-yellow">ez</span><span class="text-light">-search</span></span>
		</a>

		<!-- Desktop nav -->
		<div class="hidden md:flex items-center gap-8">
			<a href="/docs" class="text-muted hover:text-light transition-colors text-sm">Docs</a>
			<a href="/#features" class="text-muted hover:text-light transition-colors text-sm">Features</a>
			<a href="/#how-it-works" class="text-muted hover:text-light transition-colors text-sm">How It Works</a>
			<a
				href="https://github.com/ezcorp-org/ez-search"
				target="_blank"
				rel="noopener noreferrer"
				class="text-muted hover:text-light transition-colors text-sm"
			>GitHub</a>
			<a
				href="https://discord.ezcorp.org"
				target="_blank"
				rel="noopener noreferrer"
				class="text-muted hover:text-light transition-colors text-sm"
			>Discord</a>
			<a
				href="/#cta"
				class="bg-ez-yellow text-dark px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition-all"
			>Get Started</a>
		</div>

		<!-- Mobile hamburger -->
		<button
			class="md:hidden text-light cursor-pointer"
			onclick={() => (menuOpen = !menuOpen)}
			aria-label={menuOpen ? 'Close menu' : 'Open menu'}
			aria-expanded={menuOpen}
		>
			{#if menuOpen}
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
			{:else}
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
			{/if}
		</button>
	</div>

	<!-- Mobile menu -->
	{#if menuOpen}
		<div class="md:hidden bg-dark/95 backdrop-blur-lg border-b border-card-border px-6 pb-6 flex flex-col gap-4">
			<a href="/docs" onclick={closeMenu} class="text-body hover:text-light transition-colors text-sm py-2">Docs</a>
			<a href="/#features" onclick={closeMenu} class="text-body hover:text-light transition-colors text-sm py-2">Features</a>
			<a href="/#how-it-works" onclick={closeMenu} class="text-body hover:text-light transition-colors text-sm py-2">How It Works</a>
			<a
				href="https://github.com/ezcorp-org/ez-search"
				target="_blank"
				rel="noopener noreferrer"
				onclick={closeMenu}
				class="text-body hover:text-light transition-colors text-sm py-2"
			>GitHub</a>
			<a
				href="https://discord.ezcorp.org"
				target="_blank"
				rel="noopener noreferrer"
				onclick={closeMenu}
				class="text-body hover:text-light transition-colors text-sm py-2"
			>Discord</a>
			<a
				href="/#cta"
				onclick={closeMenu}
				class="bg-ez-yellow text-dark px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition-all text-center"
			>Get Started</a>
		</div>
	{/if}
</nav>
