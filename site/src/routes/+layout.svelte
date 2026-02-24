<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<div class="min-h-screen bg-dark text-light antialiased">
	{@render children()}
</div>
