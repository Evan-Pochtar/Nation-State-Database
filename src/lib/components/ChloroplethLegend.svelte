<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import type { ChloroplethData, DataType } from '$lib/utils/types';
	import { getDataLabel } from '$lib/utils/chloroplethUtils';

	export let chloroplethData: ChloroplethData | null = null;
	export let dataType: DataType;
	export let visible: boolean = false;

	$: gradientStops = chloroplethData ? generateGradientStops(chloroplethData) : [];
	$: legendValues = chloroplethData ? generateLegendValues(chloroplethData) : [];
	$: isLogScale = dataType === 'gdp' || dataType === 'gdpPerCapita';

	function generateGradientStops(data: ChloroplethData): Array<{ offset: string; color: string }> {
		const stops = [];
		const numStops = 20;

		for (let i = 0; i <= numStops; i++) {
			const t = i / numStops;
			const value = data.min + (data.max - data.min) * t;
			stops.push({
				offset: `${t * 100}%`,
				color: data.colorScale(value)
			});
		}

		return stops;
	}

	function formatValue(value: number): string {
		const displayValue = isLogScale ? Math.pow(10, value) : value;

		if (dataType === 'gdp') {
			if (displayValue >= 1e12) {
				return `$${(displayValue / 1e12).toFixed(2)}T`;
			} else if (displayValue >= 1e9) {
				return `$${(displayValue / 1e9).toFixed(2)}B`;
			} else if (displayValue >= 1e6) {
				return `$${(displayValue / 1e6).toFixed(2)}M`;
			}
			return `$${displayValue.toFixed(0)}`;
		} else if (dataType === 'gdpPerCapita') {
			return `$${displayValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
		} else {
			return displayValue.toFixed(1);
		}
	}

	function generateLegendValues(data: ChloroplethData): Array<{ value: number; label: string }> {
		const values = [
			{ value: data.min, label: formatValue(data.min) },
			{ value: (data.min + data.max) / 2, label: formatValue((data.min + data.max) / 2) },
			{ value: data.max, label: formatValue(data.max) }
		];

		return values;
	}
</script>

{#if visible && chloroplethData}
	<div
		class="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-slate-700/40 bg-gradient-to-br from-slate-900/95 to-black/98 p-4 shadow-2xl backdrop-blur-lg"
		transition:fly={{ y: 20, duration: 300 }}
	>
		<div class="flex items-center gap-4">
			<div class="min-w-[120px] text-sm font-semibold text-slate-200">
				{getDataLabel(dataType)}
				{#if isLogScale}
					<span class="block text-xs font-normal text-slate-400">(Log Scale)</span>
				{/if}
			</div>

			<div class="relative flex flex-col gap-2">
				<svg width="300" height="30" class="rounded-lg">
					<defs>
						<linearGradient id="chloropleth-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
							{#each gradientStops as stop}
								<stop offset={stop.offset} stop-color={stop.color} />
							{/each}
						</linearGradient>
					</defs>
					<rect x="0" y="5" width="300" height="20" fill="url(#chloropleth-gradient)" rx="4" class="drop-shadow-md" />
				</svg>

				<div class="flex justify-between text-xs text-slate-400">
					{#each legendValues as item}
						<span class="font-mono">{item.label}</span>
					{/each}
				</div>
			</div>

			<div class="ml-2 max-w-[120px] text-xs text-slate-500 italic">
				{#if dataType === 'gini'}
					Lower = More Equal
				{:else}
					Darker = Higher
				{/if}
			</div>
		</div>

		<div class="mt-3 border-t border-slate-700/40 pt-3 text-center text-xs text-slate-500">
			Data unavailable for countries shown in gray
		</div>
	</div>
{/if}
