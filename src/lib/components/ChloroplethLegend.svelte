<script lang="ts">
	import { fly } from 'svelte/transition';
	import type { ChloroplethData, DataType } from '$lib/utils/types';
	import { formatDataValue, getDataLabel } from '$lib/utils/chloroplethUtils';

	export let chloroplethData: ChloroplethData | null = null;
	export let dataType: DataType;
	export let visible: boolean = false;

	$: gradientStops = chloroplethData ? generateGradientStops(chloroplethData) : [];
	$: legendValues = chloroplethData ? generateLegendValues(chloroplethData) : [];

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

	function generateLegendValues(data: ChloroplethData): Array<{ value: number; label: string }> {
		const values = [
			{ value: data.min, label: formatDataValue(data.min, dataType) },
			{ value: (data.min + data.max) / 2, label: formatDataValue((data.min + data.max) / 2, dataType) },
			{ value: data.max, label: formatDataValue(data.max, dataType) }
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

<style>
	@keyframes pulse-glow {
		0%,
		100% {
			box-shadow: 0 0 20px rgba(56, 189, 248, 0.2);
		}
		50% {
			box-shadow: 0 0 30px rgba(56, 189, 248, 0.4);
		}
	}
</style>
