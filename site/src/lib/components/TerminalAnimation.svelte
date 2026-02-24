<script lang="ts">
	import { onMount } from 'svelte';

	interface Line {
		text: string;
		type: 'command' | 'output' | 'heading' | 'file' | 'code' | 'progress' | 'blank';
	}

	const sequence: Line[] = [
		{ text: '$ ez-search index .', type: 'command' },
		{ text: 'Indexing 142 files...', type: 'output' },
		{ text: '[========================================] 100%', type: 'progress' },
		{ text: 'Indexed: 89 code, 41 text, 12 images', type: 'output' },
		{ text: '', type: 'blank' },
		{ text: '$ ez-search query "error handling in auth"', type: 'command' },
		{ text: '', type: 'blank' },
		{ text: '## Code', type: 'heading' },
		{ text: 'File: src/auth/middleware.ts | Lines: 23-45 | Relevance: 0.92', type: 'file' },
		{ text: '    try {', type: 'code' },
		{ text: '      const token = extractToken(req);', type: 'code' },
		{ text: '      const user = await verifyJWT(token);', type: 'code' },
		{ text: '      req.user = user;', type: 'code' },
		{ text: '    } catch (err) {', type: 'code' },
		{ text: "      return res.status(401).json({ error: 'Invalid token' });", type: 'code' },
		{ text: '    }', type: 'code' },
		{ text: '', type: 'blank' },
		{ text: 'File: src/auth/validate.ts | Lines: 8-19 | Relevance: 0.85', type: 'file' },
		{ text: '    if (!token || token.expired) {', type: 'code' },
		{ text: "      throw new AuthError('Token expired or missing');", type: 'code' },
		{ text: '    }', type: 'code' }
	];

	let displayedLines: Line[] = $state([]);
	let typingLine = $state('');
	let isTypingCommand = $state(false);
	let showCursor = $state(true);
	let running = false;

	function colorClass(type: Line['type']): string {
		switch (type) {
			case 'command': return 'text-ez-green';
			case 'heading': return 'text-light font-semibold';
			case 'file': return 'text-ez-yellow';
			case 'code': return 'text-body';
			case 'progress': return 'text-ez-blue';
			default: return 'text-body';
		}
	}

	async function sleep(ms: number) {
		return new Promise((r) => setTimeout(r, ms));
	}

	async function typeText(text: string) {
		isTypingCommand = true;
		typingLine = '';
		for (let i = 0; i < text.length; i++) {
			if (!running) return;
			typingLine = text.slice(0, i + 1);
			await sleep(40);
		}
		isTypingCommand = false;
	}

	async function runSequence() {
		running = true;
		displayedLines = [];
		typingLine = '';

		for (const line of sequence) {
			if (!running) return;

			if (line.type === 'command') {
				await typeText(line.text);
				displayedLines = [...displayedLines, line];
				typingLine = '';
				await sleep(400);
			} else {
				displayedLines = [...displayedLines, line];
				await sleep(line.type === 'blank' ? 100 : 60);
			}
		}

		await sleep(4000);
		if (running) runSequence();
	}

	onMount(() => {
		let started = false;

		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting && !started) {
					started = true;
					runSequence();
				}
			},
			{ threshold: 0.3 }
		);

		const el = document.getElementById('terminal-viewport');
		if (el) observer.observe(el);

		const cursorInterval = setInterval(() => {
			showCursor = !showCursor;
		}, 530);

		const handleVisibility = () => {
			if (document.hidden) {
				running = false;
			} else if (started) {
				running = true;
				runSequence();
			}
		};
		document.addEventListener('visibilitychange', handleVisibility);

		return () => {
			running = false;
			observer.disconnect();
			clearInterval(cursorInterval);
			document.removeEventListener('visibilitychange', handleVisibility);
		};
	});
</script>

<div id="terminal-viewport" class="font-mono text-xs sm:text-sm leading-6 p-4 sm:p-6 min-h-[340px] overflow-x-auto">
	{#each displayedLines as line}
		<div class={colorClass(line.type)}>
			{#if line.type === 'blank'}
				&nbsp;
			{:else}
				{line.text}
			{/if}
		</div>
	{/each}
	{#if isTypingCommand}
		<div class="text-ez-green">
			{typingLine}<span class="inline-block w-2 h-4 bg-ez-green ml-0.5 align-middle {showCursor ? 'opacity-100' : 'opacity-0'}"></span>
		</div>
	{:else}
		<div>
			<span class="inline-block w-2 h-4 bg-light ml-0.5 align-middle {showCursor ? 'opacity-100' : 'opacity-0'}"></span>
		</div>
	{/if}
</div>
