<script lang="ts">
	import { slide } from 'svelte/transition';
	import { normalizeSources } from '$lib/utils/getInfo';
	import type { SourceValue, DataSources, CountryData } from '$lib/utils/types';
	import {
		formatNumber,
		formatGDP,
		formatLanguages,
		isSourceString,
		sourceLabel,
		sourceUrl,
		getSource
	} from '$lib/utils/helpers';
	import { cardClass, buttonClass, labelClass } from '$lib/utils/styles';
	import EconomicsTab from './components/EconomicsTab.svelte';
	import PoliticsTab from './components/PoliticsTab.svelte';
	import OverviewTab from './components/OverviewTab.svelte';

	export let selectedInfo: CountryData | null = null;
	export let selectedName: string | null = '';
	export let loading: boolean = false;
	export let compact: boolean = false;
	export let showSources: boolean = false;
	export let activeTab: string = 'overview';
	export let leftWidth: number = 350;
	export let infoCache: Record<string, { data?: CountryData; loading: boolean; error?: string }> = {};

	let activeEconomicChart = 'gdpPerCapita';
	let chartData: any[] = [];

	const indicators = {
		gdpPerCapita: 'NY.GDP.PCAP.CD',
		gdpGrowth: 'NY.GDP.MKTP.KD.ZG',
		inflation: 'FP.CPI.TOTL.ZG',
		unemployment: 'SL.UEM.TOTL.ZS',
		exports: 'NE.EXP.GNFS.CD',
		imports: 'NE.IMP.GNFS.CD',
		currentAccount: 'BN.CAB.XOKA.CD',
		fdi: 'BX.KLT.DINV.CD.WD',
		tradeBalance: 'NE.RSB.GNFS.CD',
		militaryExpenditure: 'MS.MIL.XPND.GD.ZS',
		researchDev: 'GB.XPD.RSDV.GD.ZS',
		internetUsers: 'IT.NET.USER.ZS',
		schoolEnrollment: 'SE.TER.ENRR',
		healthExpenditure: 'SH.XPD.CHEX.GD.ZS'
	};

	const latestOnlyMap = new Set([
		indicators.exports,
		indicators.imports,
		indicators.currentAccount,
		indicators.fdi,
		indicators.tradeBalance,
		indicators.militaryExpenditure,
		indicators.researchDev,
		indicators.internetUsers,
		indicators.healthExpenditure
	]);

	export let onToggleSources: (() => void) | undefined;
	export let onClose: (() => void) | undefined;
	export let onChangeTab: ((t: string) => void) | undefined;

	function setTab(t: typeof activeTab) {
		if (t === activeTab) return;
		onChangeTab?.(t);
		requestAnimationFrame(() => {
			const rp = document.querySelector('.read-panel');
			if (rp) (rp as HTMLElement).scrollTop = 0;
		});

		if (t === 'economics' && selectedInfo?.cca2ID) {
			fetchEconomicData(selectedInfo.cca2ID);
		}
	}

	async function fetchEconomicData(cca2ID: string) {
		if (!cca2ID || cca2ID === 'UNKNOWN') return;

		const entryName = selectedInfo?.name ?? selectedInfo?.officialName ?? cca2ID;
		if (!infoCache[entryName]) {
			infoCache[entryName] = { loading: true };
		}
		infoCache[entryName] = { ...infoCache[entryName], loading: true };
		infoCache = infoCache;

		try {
			if (infoCache[entryName].data?.economics && infoCache[entryName].data?.economics !== 'Data not provided.') {
				console.log('Economic Information found in infoCache.');
				infoCache[entryName] = { ...infoCache[entryName], loading: false };
				infoCache = infoCache;
				updateChartData();
				return;
			}

			let localEntry: any = null;
			let sources: DataSources = {};
			try {
				const localResp = await fetch('/data/countries-data.json');
				if (localResp.ok) {
					const localJson = await localResp.json();
					localEntry = Array.isArray(localJson)
						? (localJson.find((e: any) => e.name === entryName) ?? null)
						: (localJson[entryName] ?? Object.values(localJson).find((e: any) => e.name === entryName) ?? null);
				}
			} catch (err) {
				console.warn('Error loading /data/countries-data.json', err);
			}
			sources = normalizeSources(localEntry?.sources ?? {}, entryName);
			if (localEntry && Object.prototype.hasOwnProperty.call(localEntry, 'economics') && localEntry.economics) {
				console.log('Economic Information found in localEntry.');
				if (!infoCache[entryName].data) {
					infoCache[entryName].data = { ...selectedInfo } as CountryData;
				}
				infoCache[entryName].data.economics = localEntry.economics;
				infoCache[entryName] = { ...infoCache[entryName], loading: false };
				infoCache = infoCache;

				updateChartData();
				return;
			}

			console.log('Searching for Economic Data...');
			let allData: Record<string, any[]> = {};
			const timeSeriesIndicators = Object.values(indicators).filter((id) => !latestOnlyMap.has(id));
			const latestOnlyIndicators = Object.values(indicators).filter((id) => latestOnlyMap.has(id));
			if (timeSeriesIndicators.length > 0) {
				const timeSeriesBatches = [['NY.GDP.PCAP.CD', 'NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS']];
				for (const batch of timeSeriesBatches) {
					const indicatorString = batch.join(';');
					const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(cca2ID)}/indicator/${indicatorString}?source=2&format=json&date=2014:2024`;

					try {
						const res = await fetch(url);
						if (!res.ok) continue;
						const json = await res.json();
						if (!Array.isArray(json) || !json[1]) continue;

						json[1].forEach((item: any) => {
							const id = item.indicator.id;
							if (item.value !== null) {
								if (!allData[id]) allData[id] = [];
								allData[id].push({
									year: parseInt(item.date, 10),
									value: item.value,
									indicator: item.indicator.value
								});
							}
						});
					} catch (err) {
						console.warn(`Failed to fetch time series batch ${indicatorString}`, err);
					}
				}
			}

			if (latestOnlyIndicators.length > 0) {
				const latestOnlyBatch = latestOnlyIndicators;
				const indicatorString = latestOnlyBatch.join(';');
				const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(cca2ID)}/indicator/${indicatorString}?source=2&format=json&date=2022:2024`;

				try {
					const res = await fetch(url);
					if (!res.ok) throw new Error(`WorldBank API error ${res.status}`);
					const json = await res.json();
					if (!Array.isArray(json) || !json[1]) throw new Error('No data returned');

					const bucket: Record<string, any[]> = {};
					json[1].forEach((item: any) => {
						const id = item.indicator.id;
						if (!bucket[id]) bucket[id] = [];
						if (item.value !== null) {
							bucket[id].push({
								year: parseInt(item.date, 10),
								value: item.value,
								indicator: item.indicator.value
							});
						}
					});

					for (const id of Object.keys(bucket)) {
						const arr = bucket[id];
						if (!arr.length) continue;
						arr.sort((a, b) => a.year - b.year);
						const latest = arr[arr.length - 1];
						allData[id] = [{ year: latest.year, value: latest.value, indicator: latest.indicator }];
					}
				} catch (err) {
					console.warn(`Failed to fetch latest-only indicators`, err);
				}
			}

			Object.keys(allData).forEach((k) => {
				allData[k].sort((a: any, b: any) => a.year - b.year);
			});

			if (!infoCache[entryName].data) {
				infoCache[entryName].data = { ...selectedInfo } as CountryData;
			}
			infoCache[entryName].data.economics = allData;
			infoCache[entryName] = { ...infoCache[entryName], loading: false };
			infoCache = infoCache;
			if (selectedInfo) {
				selectedInfo.economics = allData;
			}

			Promise.resolve().then(async () => {
				try {
					const shouldPersist = !localEntry || (!localEntry.economics && Object.keys(allData).length > 0);
					if (!shouldPersist) return;

					const econSource = {
						label: 'World Bank',
						url: `https://api.worldbank.org/v2/country/${encodeURIComponent(cca2ID)}/indicator`
					};
					Object.assign(sources, { ...(!sources.economics ? { economics: econSource } : {}) });

					await fetch('/api', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							name: entryName,
							economics: allData,
							sources
						})
					});
				} catch (err) {
					console.warn('Failed to persist economic data', err);
				}
			});

			updateChartData();
		} catch (err) {
			console.error('Economic data fetch error:', err);
			infoCache[entryName] = { ...infoCache[entryName], loading: false, error: 'Failed to load economic data' };
			infoCache = infoCache;
		}
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

	function getLatestValue(indicatorId?: string): any {
		if (!indicatorId || !selectedInfo?.cca2ID) return null;
		const cachedData = selectedInfo;
		if (!cachedData?.economics || typeof cachedData.economics === 'string' || !cachedData.economics[indicatorId])
			return null;
		const data = cachedData.economics[indicatorId];
		return data && data.length ? data[data.length - 1] : null;
	}

	$: if (selectedInfo?.cca2ID && activeTab === 'economics') {
		fetchEconomicData(selectedInfo.cca2ID);
	}

	$: if (selectedInfo?.cca2ID) {
		updateChartData();
	}
</script>

<div
	in:slide={{ duration: 260 }}
	out:slide={{ duration: 220 }}
	class="z-20 min-w-[320px] border-r border-darkCyan bg-gradient-to-br from-slate-950 to-zinc-950 shadow-[0_0_50px] shadow-cyan-400/10 backdrop-blur-[20px] transition-[width] duration-400"
	style="width: {leftWidth}px;"
	aria-hidden="false"
>
	<div class="flex h-full flex-col gap-4 overflow-y-auto p-6">
		{#if loading}
			<div class="flex items-center gap-3 px-2 py-8">
				<div
					class="h-9 w-9 animate-spin rounded-full border-4 border-white/5 border-t-teal-300"
					aria-hidden="true"
				></div>
				<div class="font-semibold text-white/75">
					Fetching data for {selectedName}…
				</div>
			</div>
		{:else if selectedInfo}
			<header class={`relative ${compact ? 'flex flex-col items-start gap-2' : 'flex flex-wrap items-start gap-4'}`}>
				<div class={`flex ${compact ? 'w-full items-start gap-3' : 'items-center gap-3'}`}>
					<div class="relative inline-block">
						<img
							class="h-32 w-auto rounded-lg object-contain contrast-[1.02] saturate-[0.95]"
							src={selectedInfo.flag}
							alt="{selectedName} flag"
						/>
						{#if showSources && getSource('flag', selectedInfo)}
							<div
								class="absolute right-1 bottom-1 rounded border border-teal-800 bg-stone-950 px-2 py-[2px] text-[10px] font-medium text-white shadow-[0_2px_8px] shadow-black/50 backdrop-blur-[10px]"
							>
								{#if isSourceString(getSource('flag', selectedInfo))}
									({sourceLabel(getSource('flag', selectedInfo))})
								{:else}
									(<a
										href={sourceUrl(getSource('flag', selectedInfo))}
										target="_blank"
										rel="noopener noreferrer"
										class="font-semibold text-lightBlue underline">{sourceLabel(getSource('flag', selectedInfo))}</a
									>)
								{/if}
							</div>
						{/if}
					</div>
					{#if selectedInfo.coatOfArms !== 'UNKNOWN'}
						<div class="relative inline-block">
							<img
								class="h-32 w-auto rounded-lg bg-black/[0.02] object-contain p-2"
								src={selectedInfo.coatOfArms}
								alt="{selectedName} coat of arms"
							/>
							{#if showSources && getSource('coatOfArms', selectedInfo)}
								<div
									class="absolute right-1 bottom-1 rounded border border-teal-800 bg-stone-950 px-2 py-[2px] text-[10px] font-medium text-white shadow-[0_2px_8px] shadow-black/50 backdrop-blur-[10px]"
								>
									{#if isSourceString(getSource('coatOfArms', selectedInfo))}
										({sourceLabel(getSource('coatOfArms', selectedInfo))})
									{:else}
										(<a
											href={sourceUrl(getSource('coatOfArms', selectedInfo))}
											target="_blank"
											rel="noopener noreferrer"
											class="font-semibold text-lightBlue underline"
											>{sourceLabel(getSource('coatOfArms', selectedInfo))}</a
										>)
									{/if}
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<div class={`${compact ? 'mt-1 w-full pr-12' : 'flex min-w-0 flex-1 flex-col gap-2'}`}>
					<div class="text-[20px] leading-tight font-extrabold text-slate-100">
						{selectedInfo.officialName ?? selectedName}
						{#if showSources && getSource('officialName', selectedInfo)}
							<span class="ml-1 text-[0.8em] font-normal opacity-60">
								{#if isSourceString(getSource('officialName', selectedInfo))}
									({sourceLabel(getSource('officialName', selectedInfo))})
								{:else}
									(<a
										href={sourceUrl(getSource('officialName', selectedInfo))}
										target="_blank"
										rel="noopener noreferrer"
										class="font-semibold text-lightBlue underline"
										>{sourceLabel(getSource('officialName', selectedInfo))}</a
									>)
								{/if}
							</span>
						{/if}
					</div>

					<div class="mt-1 flex flex-wrap items-center gap-2">
						<span
							class="rounded-full border border-darkCyan bg-gradient-to-br from-cyan-400/[0.06] to-sky-400/[0.02] px-2 py-1 text-xs text-lightBlue opacity-95"
						>
							{selectedInfo.region}
							{#if showSources && getSource('region', selectedInfo)}
								<span class="ml-1 font-normal opacity-70"
									>·
									{#if isSourceString(getSource('region', selectedInfo))}
										({sourceLabel(getSource('region', selectedInfo))})
									{:else}
										(<a
											href={sourceUrl(getSource('region', selectedInfo))}
											target="_blank"
											rel="noopener noreferrer"
											class="font-semibold text-lightBlue underline">{sourceLabel(getSource('region', selectedInfo))}</a
										>)
									{/if}
								</span>
							{/if}
						</span>
						{#if selectedInfo.subregion}
							<span
								class="rounded-full border border-white/[0.04] bg-transparent px-2 py-1 text-xs text-slate-300 opacity-60"
							>
								{selectedInfo.subregion}
								{#if showSources && getSource('subregion', selectedInfo)}
									<span class="ml-1 font-normal opacity-70"
										>·
										{#if isSourceString(getSource('subregion', selectedInfo))}
											({sourceLabel(getSource('subregion', selectedInfo))})
										{:else}
											(<a
												href={sourceUrl(getSource('subregion', selectedInfo))}
												target="_blank"
												rel="noopener noreferrer"
												class="font-semibold text-lightBlue underline"
												>{sourceLabel(getSource('subregion', selectedInfo))}</a
											>)
										{/if}
									</span>
								{/if}
							</span>
						{/if}
						<span class="ml-1 text-[14px] text-gray-300 opacity-70">
							Capital: {selectedInfo.capital}
							{#if showSources && getSource('capital', selectedInfo)}
								<span class="ml-1 text-[0.8em] font-normal opacity-60">
									{#if isSourceString(getSource('capital', selectedInfo))}
										({sourceLabel(getSource('capital', selectedInfo))})
									{:else}
										(<a
											href={sourceUrl(getSource('capital', selectedInfo))}
											target="_blank"
											rel="noopener noreferrer"
											class="font-semibold text-lightBlue underline"
											>{sourceLabel(getSource('capital', selectedInfo))}</a
										>)
									{/if}
								</span>
							{/if}
						</span>
						<span class="ml-1 text-[14px] text-gray-300 opacity-70">
							Population: {formatNumber(selectedInfo.population)}
							{#if showSources && getSource('population', selectedInfo)}
								<span class="ml-1 text-[0.8em] font-normal opacity-60">
									{#if isSourceString(getSource('population', selectedInfo))}
										({sourceLabel(getSource('population', selectedInfo))})
									{:else}
										(<a
											href={sourceUrl(getSource('population', selectedInfo))}
											target="_blank"
											rel="noopener noreferrer"
											class="font-semibold text-lightBlue underline"
											>{sourceLabel(getSource('population', selectedInfo))}</a
										>)
									{/if}
								</span>
							{/if}
						</span>
					</div>
				</div>

				<div class={`${compact ? 'absolute top-2 right-3 z-50 flex items-start gap-2' : 'flex items-start gap-2'}`}>
					<div class="relative">
						<button
							on:click={onToggleSources}
							aria-pressed={showSources}
							aria-label="Toggle source attribution"
							aria-describedby="toggle-sources-tooltip"
							class={`peer transition-color flex h-10 min-w-[40px] cursor-pointer items-center justify-center rounded-lg border border-white/15 px-2 py-2 font-semibold backdrop-blur-[10px] duration-500 ${showSources ? 'bg-gradient-to-br from-cyan-400/10 to-sky-400/20 text-cyan-300' : 'bg-gradient-to-br from-white/5 to-white/10 text-white/70'}`}
						>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
								<path
									d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
								/>
							</svg>
						</button>

						<div
							id="toggle-sources-tooltip"
							role="tooltip"
							class="pointer-events-none absolute top-full right-0 mt-2 w-max max-w-xs translate-y-1 scale-95 transform rounded-md border border-white/10 bg-gradient-to-br from-black/80 to-slate-900/80 px-3 py-1.5 text-sm font-medium text-white/90 opacity-0 shadow-[0_6px_30px] shadow-cyan-500/10 backdrop-blur-[6px] transition-all duration-180 will-change-transform
								peer-hover:translate-y-0 peer-hover:scale-100 peer-hover:opacity-100 peer-focus-visible:translate-y-0 peer-focus-visible:scale-100 peer-focus-visible:opacity-100"
							aria-hidden="false"
						>
							Toggle source attribution
						</div>
					</div>

					<button
						on:click={onClose}
						aria-label="Close info panel"
						class="flex h-10 min-w-[40px] cursor-pointer items-center justify-center rounded-lg border border-teal-800 bg-gradient-to-br from-cyan-400/10 to-sky-400/20 px-2 py-2 font-semibold text-cyan-300 backdrop-blur-[10px] transition-transform duration-200"
						>✕</button
					>
				</div>
			</header>

			<section class="mt-3" aria-label="Key facts">
				<div class="grid grid-cols-2 gap-2">
					{#each [['Area', formatNumber(selectedInfo.area) + ' km²', getSource('area', selectedInfo)], ['GDP (USD)', formatGDP(selectedInfo.gdp), getSource('gdp', selectedInfo)], ['Gini', selectedInfo.gini ?? '—', getSource('gini', selectedInfo)], ['Languages', formatLanguages(selectedInfo.languages), getSource('languages', selectedInfo)]] as [label, value, source]}
						<div class={cardClass}>
							<div class={labelClass}>
								{label}
								{#if showSources && source}
									<span class="ml-1 text-[10px] font-normal opacity-60">
										{#if isSourceString(source)}
											({sourceLabel(source)})
										{:else}
											(<a
												href={sourceUrl(source)}
												target="_blank"
												rel="noopener noreferrer"
												class="font-semibold text-lightBlue underline">{sourceLabel(source)}</a
											>)
										{/if}
									</span>
								{/if}
							</div>
							<div class="text-[14px] font-extrabold text-white">{value}</div>
						</div>
					{/each}
				</div>
			</section>

			<nav class="mt-2 flex gap-2" aria-label="Country sections">
				{#each [['overview', 'Overview'], ['politics', 'Politics'], ['economics', 'Economy']] as [tab, label]}
					<button role="tab" aria-selected={activeTab === tab} on:click={() => setTab(tab)} class={buttonClass}
						>{label}</button
					>
				{/each}
			</nav>

			<section
				class="mt-3 overflow-auto rounded-xl border border-darkCyan bg-gradient-to-b from-black/[0.02] to-white/[0.01] p-3 shadow-[0_8px_30px] shadow-cyan-400/[0.02]"
				aria-live="polite"
			>
				<div class="pr-1">
					{#if activeTab === 'overview'}
						<OverviewTab {selectedInfo} {showSources} />
					{:else if activeTab === 'politics'}
						<PoliticsTab {selectedInfo} {showSources} />
					{:else if activeTab === 'economics'}
						<EconomicsTab {selectedInfo} {selectedName} {showSources} {infoCache} />
					{/if}
				</div>
			</section>
		{:else}
			<div class="p-4 text-white">
				<div class="font-bold">No Extended Data</div>
				<div class="text-white/70">Additional information for this country is not yet available.</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.svelte-slide-out {
		opacity: 0;
		transform-origin: left center;
	}
</style>
