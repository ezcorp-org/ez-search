<script lang="ts">
	import { onMount } from 'svelte';
	import TerminalAnimation from './TerminalAnimation.svelte';
	import ImageResults from './ImageResults.svelte';

	type Tab = 'code' | 'documents' | 'images';

	let activeTab: Tab = $state('code');
	let section: HTMLElement;
	let visible = $state(false);

	const codeSequence = [
		{ text: '$ ez-search query "error handling in auth"', type: 'command' as const },
		{ text: '', type: 'blank' as const },
		{ text: '## Code', type: 'heading' as const },
		{ text: 'File: src/auth/middleware.ts | Lines: 23-45 | Relevance: 0.92', type: 'file' as const },
		{ text: '    try {', type: 'code' as const },
		{ text: '      const token = extractToken(req);', type: 'code' as const },
		{ text: '      const user = await verifyJWT(token);', type: 'code' as const },
		{ text: '      req.user = user;', type: 'code' as const },
		{ text: '    } catch (err) {', type: 'code' as const },
		{ text: "      return res.status(401).json({ error: 'Invalid token' });", type: 'code' as const },
		{ text: '    }', type: 'code' as const },
		{ text: '', type: 'blank' as const },
		{ text: 'File: src/auth/validate.ts | Lines: 8-19 | Relevance: 0.85', type: 'file' as const },
		{ text: '    if (!token || token.expired) {', type: 'code' as const },
		{ text: "      throw new AuthError('Token expired or missing');", type: 'code' as const },
		{ text: '    }', type: 'code' as const },
	];

	const documentsSequence = [
		{ text: '$ ez-search query "deployment architecture" --type text', type: 'command' as const },
		{ text: '', type: 'blank' as const },
		{ text: '## Text', type: 'heading' as const },
		{ text: 'File: docs/architecture.md | Relevance: 0.94', type: 'file' as const },
		{ text: '    ## Deployment Architecture', type: 'code' as const },
		{ text: '    The application uses a multi-region deployment with', type: 'code' as const },
		{ text: '    edge workers handling request routing...', type: 'code' as const },
		{ text: '', type: 'blank' as const },
		{ text: 'File: README.pdf | Page: 12 | Relevance: 0.81', type: 'file' as const },
		{ text: '    Production deployments require a minimum of three', type: 'code' as const },
		{ text: '    nodes configured in an active-passive failover...', type: 'code' as const },
		{ text: '', type: 'blank' as const },
		{ text: 'File: notes/decisions.md | Relevance: 0.73', type: 'file' as const },
		{ text: '    ADR-007: We chose Cloudflare Workers over Lambda', type: 'code' as const },
		{ text: '    for lower cold-start latency at the edge...', type: 'code' as const },
	];

	const tabs: { id: Tab; label: string; icon: string; color: string; glowColor: string }[] = [
		{ id: 'code', label: 'Code', icon: '{ }', color: 'bg-ez-green/15 text-ez-green border-ez-green/30', glowColor: 'shadow-[0_0_12px_rgba(0,204,102,0.3)]' },
		{ id: 'documents', label: 'Documents', icon: '📄', color: 'bg-ez-blue/15 text-ez-blue border-ez-blue/30', glowColor: 'shadow-[0_0_12px_rgba(0,102,255,0.3)]' },
		{ id: 'images', label: 'Images', icon: '🖼', color: 'bg-ez-purple/15 text-ez-purple border-ez-purple/30', glowColor: 'shadow-[0_0_12px_rgba(139,92,246,0.3)]' },
	];

	// Key to force remount of ImageResults when switching back to images tab
	let imageKey = $state(0);

	function selectTab(tab: Tab) {
		if (tab === activeTab) return;
		activeTab = tab;
		if (tab === 'images') imageKey++;
	}

	onMount(() => {
		section.classList.add('is-hidden');
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					section.classList.remove('is-hidden');
					visible = true;
				}
			},
			{ threshold: 0.1 }
		);
		observer.observe(section);
		return () => observer.disconnect();
	});
</script>

<section
	bind:this={section}
	class="fade-section py-24 md:py-32 px-6"
	aria-label="Search showcase"
>
	<div class="mx-auto max-w-[800px]">
		<h2 class="text-3xl md:text-4xl font-bold text-center mb-12">
			See it in action.
		</h2>

		<!-- Tab bar -->
		<div class="flex justify-center gap-2 mb-6">
			{#each tabs as tab}
				<button
					onclick={() => selectTab(tab.id)}
					class="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-all duration-200
						{activeTab === tab.id
							? `${tab.color} ${tab.glowColor}`
							: 'bg-card/50 text-muted border-card-border hover:text-body hover:border-card-border/80'}"
					aria-pressed={activeTab === tab.id}
				>
					<span class="text-xs">{tab.icon}</span>
					{tab.label}
				</button>
			{/each}
		</div>

		<!-- Terminal chrome -->
		<div class="rounded-xl overflow-hidden border border-card-border bg-[#0D0D0D] shadow-2xl">
			<div class="flex items-center gap-2 px-4 py-3 bg-card border-b border-card-border">
				<div class="w-3 h-3 rounded-full bg-[#FF5F57]"></div>
				<div class="w-3 h-3 rounded-full bg-[#FFBD2E]"></div>
				<div class="w-3 h-3 rounded-full bg-[#28C840]"></div>
				<span class="ml-3 text-xs text-muted">ez-search</span>
			</div>

			<!-- Tab content with crossfade -->
			<div class="relative">
				{#if activeTab === 'code'}
					<div class="animate-fadeIn">
						<TerminalAnimation sequence={codeSequence} active={visible && activeTab === 'code'} />
					</div>
				{:else if activeTab === 'documents'}
					<div class="animate-fadeIn">
						<TerminalAnimation sequence={documentsSequence} active={visible && activeTab === 'documents'} />
					</div>
				{:else}
					<div class="animate-fadeIn">
						{#key imageKey}
							<ImageResults />
						{/key}
					</div>
				{/if}
			</div>
		</div>
	</div>
</section>

<style>
	.animate-fadeIn {
		animation: fadeIn 200ms ease-out;
	}
	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}
</style>
