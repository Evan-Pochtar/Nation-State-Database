<script lang="ts">
	import type { SourceValue } from '$lib/utils/types';

	let {
		source,
		show = false
	}: {
		source: SourceValue | null | undefined;
		show: boolean;
	} = $props();
</script>

{#if show && source}
	<span class="ml-1 text-[10px] font-normal opacity-60">
		({#if typeof source === 'string'}
			{source}
		{:else}
			<a
				href={source.url ?? '#'}
				target="_blank"
				rel="noopener noreferrer"
				class="font-semibold text-lightBlue underline hover:text-cyan-300"
			>
				{source.label}
			</a>
		{/if})
	</span>
{/if}
