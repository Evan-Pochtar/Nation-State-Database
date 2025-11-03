<script lang="ts">
	import { onMount } from 'svelte';
	import { fetchEconomicDataModule, indicators } from '$lib/utils/getInfo';
	import type { CountryData } from '$lib/utils/types';
	import { formatEconomicValue } from '$lib/utils/helpers';
	import LoadingState from '$lib/components/shared/LoadingState.svelte';
	import SectionHeader from '$lib/components/shared/SectionHeader.svelte';
	import TabButton from '$lib/components/shared/TabButton.svelte';
	import StatCard from '$lib/components/shared/StatCard.svelte';

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
	<SectionHeader
		title="Economic Data"
		source={{ label: 'World Bank', url: 'https://api.worldbank.org' }}
		{showSources}
	/>
	{#if selectedName ? infoCache[selectedName]?.loading : false}
		<LoadingState message="FETCHING ECONOMIC DATA..." submessage="WorldBank V2.1" />
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
				<TabButton active={activeEconomicChart === key} onclick={() => setEconomicChart(key)}>
					{label}
				</TabButton>
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
									<title>{point.year}: {formatEconomicValue(point.value, activeEconomicChart)}</title>
								</circle>
							{/each}
							<text x="35" y="35" text-anchor="end" fill="rgba(255,255,255,0.6)" font-size="10">
								{formatEconomicValue(maxVal, activeEconomicChart)}
							</text>
							<text x="35" y="155" text-anchor="end" fill="rgba(255,255,255,0.6)" font-size="10">
								{formatEconomicValue(minVal, activeEconomicChart)}
							</text>
						{/if}
					</svg>
				</div>
				<div class="mt-2 text-right">
					<span class="text-xl font-bold text-cyan-300">
						{formatEconomicValue(chartData[chartData.length - 1]?.value, activeEconomicChart)}
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
					<StatCard {label} value={formatEconomicValue(latest.value, key)} year={latest.year} />
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
					{formatEconomicValue(exports.value - imports.value, 'tradeBalance')}
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
