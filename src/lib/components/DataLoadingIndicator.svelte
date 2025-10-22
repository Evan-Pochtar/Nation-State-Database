<script lang="ts">
	import { fly } from 'svelte/transition';

	let {
		visible = false,
		loaded = 0,
		total = 0,
		percentage = 0
	}: {
		visible: boolean;
		loaded: number;
		total: number;
		percentage: number;
	} = $props();
</script>

{#if visible}
	<div
		class="fixed top-20 left-1/2 z-50 min-w-[320px] -translate-x-1/2 rounded-2xl border border-purple-400/30 bg-gradient-to-br from-slate-900/95 to-black/98 p-6 shadow-2xl backdrop-blur-lg"
		transition:fly={{ y: -20, duration: 300 }}
	>
		<div class="flex items-center gap-4">
			<div class="relative h-10 w-10 flex-shrink-0">
				<svg class="h-10 w-10 animate-spin text-purple-400" fill="none" viewBox="0 0 24 24">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle>
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					></path>
				</svg>
				<div class="absolute inset-0 flex items-center justify-center">
					<div class="h-2 w-2 animate-pulse rounded-full bg-purple-400"></div>
				</div>
			</div>

			<div class="flex-1">
				<div class="mb-1 text-sm font-semibold text-slate-200">Loading country data...</div>
				<div class="text-xs text-slate-400">
					{loaded} of {total} countries ({percentage}%)
				</div>

				<div class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
					<div
						class="h-full rounded-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all duration-300 ease-out"
						style="width: {percentage}%"
					></div>
				</div>
			</div>
		</div>

		<div class="mt-3 border-t border-slate-700/40 pt-3 text-center text-xs text-slate-500">
			Fetching data from World Bank and REST Countries APIs
		</div>
	</div>
{/if}

<style>
	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.animate-spin {
		animation: spin 1s linear infinite;
	}
</style>
