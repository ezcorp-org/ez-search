<script lang="ts">
	import Nav from '$lib/components/Nav.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Problem from '$lib/components/Problem.svelte';
	import HowItWorks from '$lib/components/HowItWorks.svelte';
	import Features from '$lib/components/Features.svelte';
	import Terminal from '$lib/components/Terminal.svelte';
	import CTA from '$lib/components/CTA.svelte';
	import Footer from '$lib/components/Footer.svelte';
</script>

<svelte:head>
	<title>ez-search — Semantic Codebase Search CLI | Local, Private, AI-Ready</title>
	<meta name="description" content="Search your codebase by meaning, not keywords. ez-search is a privacy-first CLI that runs ML locally — no cloud, no API keys. Built for developers and AI coding assistants." />
</svelte:head>

<Nav />
<main>
	<Hero />
	<Problem />
	<HowItWorks />
	<Features />
	<Terminal />
	<CTA />
</main>
<Footer />
