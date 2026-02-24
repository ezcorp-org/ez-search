<script lang="ts">
	import InstallTabs from './InstallTabs.svelte';
</script>

<section class="relative pt-32 pb-24 md:pt-40 md:pb-32 px-6 overflow-hidden">
	<div class="absolute inset-0 pointer-events-none">
		<div class="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-ez-yellow/5 rounded-full blur-[120px]"></div>
		<div class="absolute top-1/3 left-1/3 w-[300px] h-[300px] bg-ez-blue/5 rounded-full blur-[100px]"></div>
	</div>

	<div class="relative mx-auto max-w-[1200px] text-center">
		<h1 class="text-5xl md:text-7xl font-bold tracking-tight mb-6">
			Make it <span class="glass-slot"><span class="search-glass"><img src="/favicon.svg" alt="EZ" class="hero-logo" /></span></span>
		</h1>

		<p class="text-lg md:text-xl text-body max-w-2xl mx-auto mb-10 leading-relaxed">
			Semantic codebase search with zero cloud dependencies.
			Local ML, private by default, built for AI coding assistants.
		</p>

		<div class="mb-10">
			<InstallTabs />
		</div>

		<div class="flex flex-col sm:flex-row items-center justify-center gap-4">
			<a
				href="#cta"
				class="bg-ez-yellow text-dark px-8 py-3 rounded-lg font-semibold hover:brightness-110 transition-all"
			>Get Started</a>
			<a
				href="https://github.com/ezcorp-org/ez-search"
				target="_blank"
				rel="noopener noreferrer"
				class="border border-card-border text-light px-8 py-3 rounded-lg font-semibold hover:border-muted transition-all"
			>View on GitHub</a>
		</div>
	</div>
</section>

<style>
	.hero-logo {
		width: 1.8em;
		height: 1.8em;
	}

	/* Reserves inline space for the icon so text never moves */
	.glass-slot {
		display: inline-block;
		width: 1.8em;
		height: 1.8em;
		position: relative;
		vertical-align: -0.55em;
	}

	/* Icon is positioned absolutely so its animation doesn't affect layout */
	.search-glass {
		position: absolute;
		left: 0;
		top: 11px;
	}

	@media (prefers-reduced-motion: no-preference) {
		.search-glass {
			animation: searchSwing 1.2s cubic-bezier(0.22, 1, 0.36, 1) both;
		}

		@keyframes searchSwing {
			0% {
				transform: translate(-140px, -80vh) rotate(-180deg) scale(0.5);
				opacity: 0;
			}
			5% {
				opacity: 1;
			}
			33% {
				transform: translate(120px, -30vh) rotate(120deg) scale(0.7);
			}
			66% {
				transform: translate(-60px, -8vh) rotate(-45deg) scale(0.9);
			}
			100% {
				transform: translate(0, 0) rotate(0deg) scale(1);
				opacity: 1;
			}
		}
	}
</style>
