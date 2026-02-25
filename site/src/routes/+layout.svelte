<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
	<link rel="icon" href="/og-image.png" type="image/png" sizes="1200x630" />
	<meta name="theme-color" content="#0A0A0A" />
</svelte:head>

<div class="min-h-screen bg-dark text-light antialiased">
	{@render children()}
</div>
