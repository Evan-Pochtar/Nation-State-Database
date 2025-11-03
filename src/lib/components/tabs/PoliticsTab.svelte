<script lang="ts">
	import type { CountryData } from '$lib/utils/types';
	import { getSource } from '$lib/utils/helpers';
	import SectionHeader from '$lib/components/shared/SectionHeader.svelte';

	let {
		selectedInfo = null,
		showSources = false
	}: {
		selectedInfo: CountryData | null;
		showSources: boolean;
	} = $props();
</script>

<div class="rounded-xl bg-transparent p-0">
	<SectionHeader title="Politics" source={getSource('politics', selectedInfo)} {showSources} />
	<p class="text-[14px] leading-[1.7] whitespace-pre-wrap text-white">
		{selectedInfo?.politics}
	</p>
</div>
