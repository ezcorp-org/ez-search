<script lang="ts">
	import Nav from '$lib/components/Nav.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Problem from '$lib/components/Problem.svelte';
	import HowItWorks from '$lib/components/HowItWorks.svelte';
	import Features from '$lib/components/Features.svelte';
	import Showcase from '$lib/components/Showcase.svelte';
	import CTA from '$lib/components/CTA.svelte';
	import Footer from '$lib/components/Footer.svelte';
</script>

<svelte:head>
	<title>ez-search — Semantic Codebase Search CLI | Local, Private, AI-Ready</title>
	<meta name="description" content="Search your codebase by meaning, not keywords. ez-search is a privacy-first CLI that runs ML locally — no cloud, no API keys. Built for developers and AI coding assistants." />
	<link rel="canonical" href="https://ez-search.dev/" />

	<!-- Open Graph -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://ez-search.dev/" />
	<meta property="og:site_name" content="ez-search" />
	<meta property="og:title" content="ez-search — Semantic Codebase Search CLI | Local, Private, AI-Ready" />
	<meta property="og:description" content="Search your codebase by meaning, not keywords. ez-search is a privacy-first CLI that runs ML locally — no cloud, no API keys. Built for developers and AI coding assistants." />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="ez-search — Semantic Codebase Search CLI" />
	<meta name="twitter:description" content="Search your codebase by meaning, not keywords. Privacy-first CLI with local ML — no cloud, no API keys." />

	<!-- JSON-LD Structured Data -->
	{@html `<script type="application/ld+json">${JSON.stringify({
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		"name": "ez-search",
		"description": "Semantic codebase search with zero cloud dependencies",
		"applicationCategory": "DeveloperApplication",
		"operatingSystem": "Cross-platform (Node.js)",
		"offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
		"author": { "@type": "Organization", "name": "EZCorp" },
		"softwareVersion": "1.0.10",
		"license": "https://opensource.org/licenses/ISC",
		"url": "https://github.com/ezcorp-org/ez-search",
		"downloadUrl": "https://www.npmjs.com/package/@ez-corp/ez-search",
		"codeRepository": "https://github.com/ezcorp-org/ez-search"
	})}</script>`}
</svelte:head>

<Nav />
<main>
	<Hero />
	<Problem />
	<HowItWorks />
	<Features />
	<Showcase />
	<CTA />
</main>
<Footer />
