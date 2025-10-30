<script lang="ts">
	import { onMount } from 'svelte';
	import { fetchEconomicDataModule, indicators } from '$lib/utils/getInfo';
	import type { CountryData } from '$lib/utils/types';
	import { formatValue } from '$lib/utils/helpers';

	let {
		selectedInfo = null,
		selectedName = '',
		showSources = false,
		infoCache = {}
	}: {
		selectedInfo: CountryData | null;
		selectedName: string | null;
		showSources: boolean;
		infoCache: Record<string, { data?: CountryData; loading: boolean; error?: string }>;
	} = $props();

	let activeEconomicChart = $state('gdpPerCapita');
	let chartData: any[] = $state([]);

	function getLatestValue(indicatorId?: string): any {
		if (!indicatorId || !selectedInfo?.cca2ID) return null;
		const cachedData = selectedInfo;
		if (!cachedData?.economics || typeof cachedData.economics === 'string' || !cachedData.economics[indicatorId])
			return null;
		const data = cachedData.economics[indicatorId];
		return data && data.length ? data[data.length - 1] : null;
	}

	function fetchEconomicData(cca2ID: string) {
		return fetchEconomicDataModule({
			cca2ID,
			selectedInfo,
			getInfoCache: () => infoCache,
			setInfoCache: (newCache) => (infoCache = newCache),
			setSelectedInfo: (newSelected) => (selectedInfo = newSelected),
			persist: true
		});
	}

	function updateChartData() {
		if (!selectedInfo?.cca2ID) {
			chartData = [];
			return;
		}

		const entryName = selectedInfo?.name ?? selectedInfo?.officialName ?? selectedInfo.cca2ID;
		const cachedData = infoCache[entryName]?.data;

		if (!cachedData?.economics || typeof cachedData.economics === 'string') {
			chartData = [];
			return;
		}

		const indicatorId = indicators[activeEconomicChart as keyof typeof indicators];
		const data = cachedData.economics[indicatorId] || [];
		chartData = data.slice(-10);
	}

	function setEconomicChart(chart: string) {
		activeEconomicChart = chart;
		updateChartData();
	}

	onMount(() => {
		updateChartData();
		fetchEconomicData(selectedInfo ? selectedInfo.cca2ID : 'UNKNOWN');
	});

	$effect(() => {
		const info = selectedInfo;
		const name = selectedName;
		const chart = activeEconomicChart;

		if (info && name) {
			updateChartData();
		}
	});
</script>

<div class="rounded-xl bg-transparent p-0">
	<div class="mb-4 text-[13px] font-bold tracking-[0.5px] text-cyan-200 uppercase">
		Economic Data
		{#if showSources}
			<span class="ml-1 text-[10px] font-normal opacity-60">
				(<a
					href="https://api.worldbank.org"
					target="_blank"
					rel="noopener noreferrer"
					class="font-semibold text-lightBlue underline">World Bank</a
				>)
			</span>
		{/if}
	</div>
	{#if selectedName ? infoCache[selectedName]?.loading : false}
		<div
			class="relative overflow-hidden rounded-xl border border-cyan-500/20 bg-gradient-to-br from-black/40 via-cyan-900/10 to-black/40 p-8 backdrop-blur-sm"
		>
			<div class="pointer-events-none absolute inset-0 opacity-10">
				<div
					class="animate-pulse-slow absolute top-0 left-0 h-full w-full bg-gradient-to-b from-transparent via-white/5 to-transparent"
				></div>
				<div
					class="bg-size[4px_4px] absolute inset-0 bg-[linear-gradient(to_right,#000_1px,transparent_1px),linear-gradient(to_bottom,#000_1px,transparent_1px)]"
				></div>
			</div>

			<div class="relative z-10 flex flex-col items-center justify-center py-12">
				<div class="relative">
					<div class="animate-spin-slow h-22 w-22 rounded-full border-2 border-cyan-400/30"></div>
					<div
						class="absolute top-1/2 left-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-cyan-500/20"
					>
						<div class="h-10 w-10 animate-spin rounded-full border-t-2 border-cyan-300"></div>
					</div>
				</div>

				<div class="mt-3 text-center">
					<div class="mb-1 animate-pulse font-mono text-sm text-cyan-300">FETCHING ECONOMIC DATA...</div>
				</div>

				<div class="animate-bounce-slow absolute -top-4 -left-4 font-mono text-xs text-cyan-400/30">$ECO_LOAD</div>
				<div class="animate-bounce-slow absolute -right-4 -bottom-4 font-mono text-xs text-emerald-400/30">
					> WorldBank V2.1
				</div>
			</div>
		</div>
	{:else if selectedName ? infoCache[selectedName]?.error : true}
		<div class="rounded-lg border border-red-700/30 bg-red-900/20 p-4 text-red-200">
			<div class="font-semibold">Unable to Load Economic Data</div>
			<div class="mt-1 text-sm opacity-80">
				{selectedName ? infoCache[selectedName]?.error : 'Cannot Find Selected Country'}
			</div>
		</div>
	{:else if selectedInfo && selectedInfo.economics && typeof selectedInfo.economics !== 'string'}
		<div class="mb-4 flex flex-wrap gap-1">
			{#each [['gdpPerCapita', 'GDP/Capita'], ['gdpGrowth', 'GDP Growth'], ['inflation', 'Inflation'], ['unemployment', 'Unemployment']] as [key, label]}
				<button
					onclick={() => setEconomicChart(key)}
					class={`rounded px-3 py-1 text-xs transition-all ${
						activeEconomicChart === key
							? 'border border-cyan-400/50 bg-cyan-400/20 text-cyan-300'
							: 'border border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
					}`}
				>
					{label}
				</button>
			{/each}
		</div>
		<div class="mb-6 rounded-lg border border-white/10 bg-black/20 p-4">
			{#if chartData.length > 0}
				<div class="mb-2 text-sm font-semibold text-white">
					{chartData[0]?.indicator || 'Economic Indicator'}
					<span class="text-xs text-white/60">({chartData[0]?.year} - {chartData[chartData.length - 1]?.year})</span>
				</div>
				<div class="relative h-48 w-full">
					<svg viewBox="0 0 400 160" class="h-full w-full">
						{#each Array(5) as _, i}
							<line
								x1="40"
								y1={30 + i * 25}
								x2="380"
								y2={30 + i * 25}
								stroke="rgba(255,255,255,0.1)"
								stroke-width="1"
							/>
						{/each}
						{#if chartData.length > 1}
							{@const maxVal = Math.max(...chartData.map((d) => d.value))}
							{@const minVal = Math.min(...chartData.map((d) => d.value))}
							{@const range = maxVal - minVal || 1}
							<path
								d={`M ${chartData
									.map(
										(d, i) => `${40 + (i / (chartData.length - 1)) * 340},${155 - ((d.value - minVal) / range) * 125}`
									)
									.join(' L ')}`}
								fill="none"
								stroke="#22d3ee"
								stroke-width="2"
								opacity="0.8"
							/>
							{#each chartData as point, i}
								<circle
									cx={40 + (i / (chartData.length - 1)) * 340}
									cy={155 - ((point.value - minVal) / range) * 125}
									r="3"
									fill="#0891b2"
									opacity="0.9"
								>
									<title>{point.year}: {formatValue(point.value, activeEconomicChart)}</title>
								</circle>
							{/each}
							<text x="35" y="35" text-anchor="end" fill="rgba(255,255,255,0.6)" font-size="10">
								{formatValue(maxVal, activeEconomicChart)}
							</text>
							<text x="35" y="155" text-anchor="end" fill="rgba(255,255,255,0.6)" font-size="10">
								{formatValue(minVal, activeEconomicChart)}
							</text>
						{/if}
					</svg>
				</div>
				<div class="mt-2 text-right">
					<span class="text-xl font-bold text-cyan-300">
						{formatValue(chartData[chartData.length - 1]?.value, activeEconomicChart)}
					</span>
					<span class="ml-2 text-xs text-white/60">
						({chartData[chartData.length - 1]?.year})
					</span>
				</div>
			{:else}
				<div class="flex h-48 items-center justify-center text-white/50">
					<div class="text-center">
						<div>No data available for this indicator</div>
					</div>
				</div>
			{/if}
		</div>

		<div class="flex flex-wrap gap-3">
			{#each [['exports', 'Exports'], ['imports', 'Imports'], ['currentAccount', 'Current Account'], ['fdi', 'Foreign Investment'], ['militaryExpenditure', 'Military Spending as % of GDP'], ['researchDev', 'R&D Spending as % of GDP'], ['internetUsers', 'Internet Users'], ['healthExpenditure', 'Health Spending as % of GDP']] as [key, label]}
				{@const latest = getLatestValue((indicators as any)[key])}
				{#if latest}
					<div
						class="w-[calc(50%-0.375rem)] grow rounded-lg border border-white/10 bg-gradient-to-br from-white/5 to-white/10 p-3 sm:w-[calc(50%-0.375rem)]"
					>
						<div class="mb-1 flex items-center gap-2">
							<span class="text-xs font-medium text-white/80">{label}</span>
						</div>
						<div class="text-sm font-bold text-white">
							{formatValue(latest.value, key)}
						</div>
						<div class="text-xs text-white/50">
							{latest.year}
						</div>
					</div>
				{/if}
			{/each}
		</div>

		{@const exports = getLatestValue(indicators.exports)}
		{@const imports = getLatestValue(indicators.imports)}
		{#if exports && imports}
			<div
				class="mt-3 rounded-lg border border-emerald-700/30 bg-gradient-to-br from-emerald-900/20 to-blue-900/20 p-4"
			>
				<div class="mb-2 flex items-center gap-2">
					<span class="font-semibold text-white">Trade Balance</span>
				</div>
				<div class="text-lg font-bold text-white">
					{formatValue(exports.value - imports.value, 'tradeBalance')}
				</div>
				<div class="mt-1 text-xs text-white/60">
					{exports.value > imports.value ? 'Trade Surplus' : 'Trade Deficit'} ({exports.year})
				</div>
			</div>
		{/if}
	{:else}
		<div class="py-8 text-center text-white/50">
			<div>Economic data not available</div>
			<div class="mt-1 text-xs">World Bank data may not be available for this country</div>
		</div>
	{/if}
</div>

<style>
	@keyframes pulse-slow {
		0%,
		100% {
			opacity: 0.5;
		}
		50% {
			opacity: 0.8;
		}
	}
	@keyframes spin-slow {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes bounce-slow {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-4px);
		}
	}
	.animate-pulse-slow {
		animation: pulse-slow 3s ease-in-out infinite;
	}
	.animate-spin-slow {
		animation: spin-slow 8s linear infinite;
	}
	.animate-bounce-slow {
		animation: bounce-slow 4s ease-in-out infinite;
	}
</style>
