<script lang="ts">
	import { sidebarSections } from '$lib/data/docs-content';

	let activeId = $state('installation');
	let mobileOpen = $state(false);

	function setupScrollSpy() {
		const sectionIds = sidebarSections.flatMap((g) => g.items.map((i) => i.id));
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						activeId = entry.target.id;
					}
				}
			},
			{ rootMargin: '-80px 0px -60% 0px' }
		);

		for (const id of sectionIds) {
			const el = document.getElementById(id);
			if (el) observer.observe(el);
		}

		return () => observer.disconnect();
	}

	$effect(() => {
		const cleanup = setupScrollSpy();
		return cleanup;
	});

	function handleClick() {
		mobileOpen = false;
	}
</script>

<!-- Desktop sidebar -->
<aside class="hidden lg:block w-[220px] shrink-0">
	<nav class="sticky top-24 h-[calc(100vh-6rem)] overflow-y-auto pb-8" aria-label="Documentation navigation">
		{#each sidebarSections as group}
			<div class="mb-6">
				<h4 class="text-xs font-semibold text-muted uppercase tracking-wider mb-2">{group.title}</h4>
				<ul class="space-y-1">
					{#each group.items as item}
						<li>
							<a
								href="#{item.id}"
								class="block text-sm py-1 transition-colors {activeId === item.id
									? 'text-ez-yellow font-medium'
									: 'text-muted hover:text-light'}"
							>{item.title}</a>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</nav>
</aside>

<!-- Mobile floating button -->
<div class="lg:hidden fixed bottom-6 right-6 z-40">
	<button
		onclick={() => (mobileOpen = !mobileOpen)}
		class="bg-card border border-card-border rounded-full px-4 py-2 text-sm text-muted hover:text-light transition-colors shadow-lg cursor-pointer"
		aria-label="Toggle table of contents"
		aria-expanded={mobileOpen}
	>
		On this page
	</button>
</div>

<!-- Mobile slide-over -->
{#if mobileOpen}
	<!-- Backdrop -->
	<button
		class="lg:hidden fixed inset-0 z-40 bg-dark/60 backdrop-blur-sm cursor-default"
		onclick={() => (mobileOpen = false)}
		aria-label="Close navigation"
	></button>

	<!-- Panel -->
	<nav
		class="lg:hidden fixed right-0 top-0 bottom-0 z-50 w-72 bg-card border-l border-card-border p-6 overflow-y-auto"
		aria-label="Documentation navigation"
	>
		<div class="flex items-center justify-between mb-6">
			<h3 class="text-sm font-semibold text-light">On this page</h3>
			<button
				onclick={() => (mobileOpen = false)}
				class="text-muted hover:text-light cursor-pointer"
				aria-label="Close navigation"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
			</button>
		</div>
		{#each sidebarSections as group}
			<div class="mb-6">
				<h4 class="text-xs font-semibold text-muted uppercase tracking-wider mb-2">{group.title}</h4>
				<ul class="space-y-1">
					{#each group.items as item}
						<li>
							<a
								href="#{item.id}"
								onclick={handleClick}
								class="block text-sm py-1 transition-colors {activeId === item.id
									? 'text-ez-yellow font-medium'
									: 'text-muted hover:text-light'}"
							>{item.title}</a>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</nav>
{/if}
