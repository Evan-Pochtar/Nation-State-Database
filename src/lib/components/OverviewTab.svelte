<script lang="ts">
	import type { CountryData } from '$lib/utils/types';
	import { isSourceString, sourceLabel, sourceUrl, getSource } from '$lib/utils/helpers';

	let {
		selectedInfo = null,
		showSources = false
	}: {
		selectedInfo: CountryData | null;
		showSources: boolean;
	} = $props();
</script>

<div class="rounded-xl bg-transparent p-0">
	<div class="mb-2 text-[13px] font-bold tracking-[0.5px] text-cyan-200 uppercase">
		Overview
		{#if showSources && getSource('summary', selectedInfo)}
			<span class="ml-1 text-[10px] font-normal opacity-60">
				{#if isSourceString(getSource('summary', selectedInfo))}
					({sourceLabel(getSource('summary', selectedInfo))})
				{:else}
					(<a
						href={sourceUrl(getSource('summary', selectedInfo))}
						target="_blank"
						rel="noopener noreferrer"
						class="font-semibold text-lightBlue underline">{sourceLabel(getSource('summary', selectedInfo))}</a
					>)
				{/if}
			</span>
		{/if}
	</div>
	<p class="text-[14px] leading-[1.7] whitespace-pre-wrap text-white">
		{selectedInfo?.summary}
	</p>
</div>
