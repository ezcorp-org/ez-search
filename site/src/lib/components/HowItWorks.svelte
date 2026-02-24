<script lang="ts">
	import { onMount } from 'svelte';

	let section: HTMLElement;
	let visible = $state(false);
	let typed = $state(false);
	let showCursor = $state(true);
	let showOutput = $state(false);

	const command = 'ez-search query "error handling in auth"';
	let displayedChars = $state(0);

	onMount(() => {
		section.classList.add('is-hidden');
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					section.classList.remove('is-hidden');
					visible = true;
					startTyping();
				}
			},
			{ threshold: 0.3 }
		);
		observer.observe(section);
		return () => observer.disconnect();
	});

	function startTyping() {
		let i = 0;
		const interval = setInterval(() => {
			i++;
			displayedChars = i;
			if (i >= command.length) {
				clearInterval(interval);
				typed = true;
				setTimeout(() => {
					showOutput = true;
					setTimeout(() => { showCursor = false; }, 400);
				}, 500);
			}
		}, 35);
	}
</script>

<section
	id="how-it-works"
	bind:this={section}
	class="fade-section relative py-28 md:py-40 px-6 overflow-hidden"
	aria-label="How ez-search works"
>
	<!-- Background glow -->
	<div class="absolute inset-0 pointer-events-none">
		<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-ez-green/[0.04] rounded-full blur-[150px]"></div>
	</div>

	<div class="relative mx-auto max-w-[700px] text-center">
		<h2 class="text-4xl md:text-5xl lg:text-6xl font-bold mb-10 tracking-tight">
			One command.<br />
			<span class="text-muted">That's it.</span>
		</h2>

		<!-- Terminal card -->
		<div class="terminal-card rounded-2xl overflow-hidden border border-ez-green/20 shadow-[0_0_60px_rgba(0,204,102,0.08)] mb-10">
			<!-- Title bar -->
			<div class="flex items-center gap-2 px-5 py-3.5 bg-[#111] border-b border-white/[0.06]">
				<div class="w-3 h-3 rounded-full bg-[#FF5F57]/80"></div>
				<div class="w-3 h-3 rounded-full bg-[#FFBD2E]/80"></div>
				<div class="w-3 h-3 rounded-full bg-[#28C840]/80"></div>
				<span class="ml-3 text-xs text-muted/60 font-mono">~/my-project</span>
			</div>

			<!-- Terminal body -->
			<div class="bg-[#0C0C0C] px-6 py-6 text-left font-mono text-sm sm:text-base">
				<!-- Command line -->
				<div class="flex items-start gap-2">
					<span class="text-ez-green/70 select-none shrink-0">$</span>
					<span class="text-ez-green">
						{command.slice(0, displayedChars)}{#if showCursor}<span class="cursor">_</span>{/if}
					</span>
				</div>

				<!-- Output -->
				{#if showOutput}
					<div class="output-reveal mt-5 pt-4 border-t border-white/[0.04] space-y-3">
						<div class="text-muted/50 text-xs uppercase tracking-widest">Auto-indexing 142 files...</div>

						<div class="space-y-2">
							<div class="flex items-baseline gap-3">
								<span class="text-ez-yellow text-xs font-semibold shrink-0">0.92</span>
								<span class="text-body/80 text-sm">src/auth/middleware.ts <span class="text-muted/40">:23-45</span></span>
							</div>
							<div class="flex items-baseline gap-3">
								<span class="text-ez-yellow/70 text-xs font-semibold shrink-0">0.85</span>
								<span class="text-body/80 text-sm">src/auth/validate.ts <span class="text-muted/40">:8-19</span></span>
							</div>
							<div class="flex items-baseline gap-3">
								<span class="text-ez-yellow/50 text-xs font-semibold shrink-0">0.73</span>
								<span class="text-body/80 text-sm">src/middleware/session.ts <span class="text-muted/40">:31-52</span></span>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>

		<p class="text-body/80 text-base sm:text-lg leading-relaxed max-w-lg mx-auto">
			Auto-indexes on first run. No setup, no config, no extra steps.<br class="hidden sm:block" />
			Just search your codebase by meaning.
		</p>
	</div>
</section>

<style>
	.terminal-card {
		background: linear-gradient(180deg, #111 0%, #0C0C0C 100%);
		transition: box-shadow 0.6s ease;
	}

	.terminal-card:hover {
		box-shadow: 0 0 80px rgba(0, 204, 102, 0.12), 0 0 30px rgba(0, 204, 102, 0.06);
	}

	.cursor {
		animation: blink 0.6s step-end infinite;
	}

	@keyframes blink {
		50% { opacity: 0; }
	}

	.output-reveal {
		animation: revealUp 0.4s ease-out;
	}

	@keyframes revealUp {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
