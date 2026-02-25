<script lang="ts">
	import type { LibParam } from '$lib/data/docs-content';

	interface Props {
		params: LibParam[];
	}

	let { params }: Props = $props();
</script>

<!-- Desktop table -->
<div class="hidden md:block bg-card border border-card-border rounded-xl overflow-hidden">
	<table class="w-full text-sm">
		<thead>
			<tr class="border-b border-card-border text-muted text-left">
				<th class="px-4 py-3 font-medium">Parameter</th>
				<th class="px-4 py-3 font-medium">Type</th>
				<th class="px-4 py-3 font-medium">Description</th>
			</tr>
		</thead>
		<tbody>
			{#each params as param}
				<tr class="border-b border-card-border last:border-0">
					<td class="px-4 py-3 font-mono text-ez-blue whitespace-nowrap">
						{param.name}{#if !param.required}<span class="text-muted">?</span>{/if}
					</td>
					<td class="px-4 py-3 font-mono text-ez-purple whitespace-nowrap">{param.type}</td>
					<td class="px-4 py-3 text-body">{param.description}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<!-- Mobile cards -->
<div class="md:hidden space-y-3">
	{#each params as param}
		<div class="bg-card border border-card-border rounded-xl p-4 space-y-2">
			<div class="font-mono text-ez-blue text-sm">
				{param.name}{#if !param.required}<span class="text-muted">?</span>{/if}
			</div>
			<div class="font-mono text-ez-purple text-xs">{param.type}</div>
			<div class="text-body text-sm">{param.description}</div>
		</div>
	{/each}
</div>
