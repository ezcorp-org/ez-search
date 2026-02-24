<script lang="ts">
	import { onMount } from 'svelte';

	interface Line {
		text: string;
		type: 'command' | 'output' | 'heading' | 'file' | 'code' | 'progress' | 'blank';
	}

	interface Props {
		sequence: Line[];
		active?: boolean;
	}

	let { sequence, active = true }: Props = $props();

	let displayedLines: Line[] = $state([]);
	let typingLine = $state('');
	let isTypingCommand = $state(false);
	let showCursor = $state(true);
	let running = false;
	let viewport: HTMLElement;

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

	function stop() {
		running = false;
		displayedLines = [];
		typingLine = '';
		isTypingCommand = false;
	}

	// React to active prop changes — restart or stop animation
	$effect(() => {
		if (active) {
			stop();
			// Small delay to ensure clean state before restarting
			setTimeout(() => runSequence(), 50);
		} else {
			stop();
		}
	});

	onMount(() => {
		const cursorInterval = setInterval(() => {
			showCursor = !showCursor;
		}, 530);

		const handleVisibility = () => {
			if (document.hidden) {
				running = false;
			} else if (active) {
				running = true;
				runSequence();
			}
		};
		document.addEventListener('visibilitychange', handleVisibility);

		return () => {
			running = false;
			clearInterval(cursorInterval);
			document.removeEventListener('visibilitychange', handleVisibility);
		};
	});
</script>

<div bind:this={viewport} class="font-mono text-xs sm:text-sm leading-6 p-4 sm:p-6 h-[340px] overflow-y-auto overflow-x-auto">
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
