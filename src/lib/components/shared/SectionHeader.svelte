<script lang="ts">
	import SourceBadge from './SourceBadge.svelte';
	import type { SourceValue } from '$lib/utils/types';

	let {
		title,
		source,
		showSources = false
	}: {
		title: string;
		source?: SourceValue | null;
		showSources?: boolean;
	} = $props();
</script>

<div class="text-section-header mb-4">
	{title}
	<SourceBadge {source} show={showSources} />
</div>
