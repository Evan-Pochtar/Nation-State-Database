<script lang="ts">
	import { fade } from 'svelte/transition';
	import type { DataType } from '$lib/utils/types';
	import { formatDataValue, getDataLabel } from '$lib/utils/chloroplethUtils';

	let {
		visible = false,
		countryName = '',
		value = null,
		dataType,
		x = 0,
		y = 0
	}: {
		visible: boolean;
		countryName: string;
		value: number | null;
		dataType: DataType;
		x: number;
		y: number;
	} = $props();

	let formattedValue = $derived(value !== null ? formatDataValue(value, dataType) : 'No data');
	let dataLabel = $derived(getDataLabel(dataType));
</script>

{#if visible && countryName}
	<div
		class="pointer-events-none fixed z-200"
		style="left: {x}px; top: {y}px; transform: translate(-50%, -120%);"
		transition:fade={{ duration: 150 }}
	>
		<div
			class="min-w-[180px] rounded-xl border border-purple-400/40 bg-gradient-to-br from-slate-900/98 to-black px-4 py-3 shadow-2xl backdrop-blur-lg"
		>
			<div class="mb-1 text-sm font-semibold text-slate-100">
				{countryName}
			</div>

			<div class="flex items-baseline gap-2">
				<span class="text-xs text-slate-400">{dataLabel}:</span>
				<span
					class="font-mono text-sm font-medium"
					class:text-purple-400={value !== null}
					class:text-slate-500={value === null}
				>
					{formattedValue}
				</span>
			</div>

			{#if dataType === 'gini' && value !== null}
				<div class="mt-2 border-t border-slate-700/40 pt-2 text-xs text-slate-500">
					{#if value < 30}
						Low inequality
					{:else if value < 40}
						Moderate inequality
					{:else}
						High inequality
					{/if}
				</div>
			{/if}
		</div>

		<div class="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full">
			<div
				class="h-0 w-0 border-t-[6px] border-r-[6px] border-l-[6px] border-t-slate-900/98 border-r-transparent border-l-transparent"
			></div>
		</div>
	</div>
{/if}
