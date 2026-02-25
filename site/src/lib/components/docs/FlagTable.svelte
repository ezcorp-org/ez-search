<script lang="ts">
	import type { CliFlag } from '$lib/data/docs-content';

	interface Props {
		flags: CliFlag[];
	}

	let { flags }: Props = $props();
</script>

<!-- Desktop table -->
<div class="hidden md:block bg-card border border-card-border rounded-xl overflow-hidden">
	<table class="w-full text-sm">
		<thead>
			<tr class="border-b border-card-border text-muted text-left">
				<th class="px-4 py-3 font-medium">Flag</th>
				<th class="px-4 py-3 font-medium">Description</th>
				<th class="px-4 py-3 font-medium">Default</th>
			</tr>
		</thead>
		<tbody>
			{#each flags as flag}
				<tr class="border-b border-card-border last:border-0">
					<td class="px-4 py-3 font-mono text-ez-green whitespace-nowrap">
						{flag.flag}{#if flag.alias}<span class="text-muted">, {flag.alias}</span>{/if}
					</td>
					<td class="px-4 py-3 text-body">{flag.description}</td>
					<td class="px-4 py-3 font-mono text-muted">{flag.default ?? '—'}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<!-- Mobile cards -->
<div class="md:hidden space-y-3">
	{#each flags as flag}
		<div class="bg-card border border-card-border rounded-xl p-4 space-y-2">
			<div class="font-mono text-ez-green text-sm">
				{flag.flag}{#if flag.alias}<span class="text-muted">, {flag.alias}</span>{/if}
			</div>
			<div class="text-body text-sm">{flag.description}</div>
			{#if flag.default}
				<div class="text-xs text-muted">Default: <span class="font-mono">{flag.default}</span></div>
			{/if}
		</div>
	{/each}
</div>
