<script lang="ts">
	import { slide } from 'svelte/transition';
	import { normalizeSources } from '$lib/utils/getInfo';
	import type { SourceValue, DataSources, CountryData } from '$lib/utils/types';
	import {
		formatNumber,
		formatGDP,
		formatLanguages,
		formatValue,
		isSourceString,
		sourceLabel,
		sourceUrl
	} from '$lib/utils/format';
	import { cardClass, buttonClass, labelClass } from '$lib/utils/styles';

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

	function getSource(field: keyof DataSources): SourceValue | null {
		return selectedInfo?.sources?.[field] || null;
	}

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
						{#if showSources && getSource('flag')}
							<div
								class="absolute right-1 bottom-1 rounded border border-teal-800 bg-stone-950 px-2 py-[2px] text-[10px] font-medium text-white shadow-[0_2px_8px] shadow-black/50 backdrop-blur-[10px]"
							>
								{#if isSourceString(getSource('flag'))}
									({sourceLabel(getSource('flag'))})
								{:else}
									(<a
										href={sourceUrl(getSource('flag'))}
										target="_blank"
										rel="noopener noreferrer"
										class="font-semibold text-lightBlue underline">{sourceLabel(getSource('flag'))}</a
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
							{#if showSources && getSource('coatOfArms')}
								<div
									class="absolute right-1 bottom-1 rounded border border-teal-800 bg-stone-950 px-2 py-[2px] text-[10px] font-medium text-white shadow-[0_2px_8px] shadow-black/50 backdrop-blur-[10px]"
								>
									{#if isSourceString(getSource('coatOfArms'))}
										({sourceLabel(getSource('coatOfArms'))})
									{:else}
										(<a
											href={sourceUrl(getSource('coatOfArms'))}
											target="_blank"
											rel="noopener noreferrer"
											class="font-semibold text-lightBlue underline">{sourceLabel(getSource('coatOfArms'))}</a
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
						{#if showSources && getSource('officialName')}
							<span class="ml-1 text-[0.8em] font-normal opacity-60">
								{#if isSourceString(getSource('officialName'))}
									({sourceLabel(getSource('officialName'))})
								{:else}
									(<a
										href={sourceUrl(getSource('officialName'))}
										target="_blank"
										rel="noopener noreferrer"
										class="font-semibold text-lightBlue underline">{sourceLabel(getSource('officialName'))}</a
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
							{#if showSources && getSource('region')}
								<span class="ml-1 font-normal opacity-70"
									>·
									{#if isSourceString(getSource('region'))}
										({sourceLabel(getSource('region'))})
									{:else}
										(<a
											href={sourceUrl(getSource('region'))}
											target="_blank"
											rel="noopener noreferrer"
											class="font-semibold text-lightBlue underline">{sourceLabel(getSource('region'))}</a
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
								{#if showSources && getSource('subregion')}
									<span class="ml-1 font-normal opacity-70"
										>·
										{#if isSourceString(getSource('subregion'))}
											({sourceLabel(getSource('subregion'))})
										{:else}
											(<a
												href={sourceUrl(getSource('subregion'))}
												target="_blank"
												rel="noopener noreferrer"
												class="font-semibold text-lightBlue underline">{sourceLabel(getSource('subregion'))}</a
											>)
										{/if}
									</span>
								{/if}
							</span>
						{/if}
						<span class="ml-1 text-[14px] text-gray-300 opacity-70">
							Capital: {selectedInfo.capital}
							{#if showSources && getSource('capital')}
								<span class="ml-1 text-[0.8em] font-normal opacity-60">
									{#if isSourceString(getSource('capital'))}
										({sourceLabel(getSource('capital'))})
									{:else}
										(<a
											href={sourceUrl(getSource('capital'))}
											target="_blank"
											rel="noopener noreferrer"
											class="font-semibold text-lightBlue underline">{sourceLabel(getSource('capital'))}</a
										>)
									{/if}
								</span>
							{/if}
						</span>
						<span class="ml-1 text-[14px] text-gray-300 opacity-70">
							Population: {formatNumber(selectedInfo.population)}
							{#if showSources && getSource('population')}
								<span class="ml-1 text-[0.8em] font-normal opacity-60">
									{#if isSourceString(getSource('population'))}
										({sourceLabel(getSource('population'))})
									{:else}
										(<a
											href={sourceUrl(getSource('population'))}
											target="_blank"
											rel="noopener noreferrer"
											class="font-semibold text-lightBlue underline">{sourceLabel(getSource('population'))}</a
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
					{#each [['Area', formatNumber(selectedInfo.area) + ' km²', getSource('area')], ['GDP (USD)', formatGDP(selectedInfo.gdp), getSource('gdp')], ['Gini', selectedInfo.gini ?? '—', getSource('gini')], ['Languages', formatLanguages(selectedInfo.languages), getSource('languages')]] as [label, value, source]}
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
						<div class="rounded-xl bg-transparent p-0">
							<div class="mb-2 text-[13px] font-bold tracking-[0.5px] text-cyan-200 uppercase">
								Overview
								{#if showSources && getSource('summary')}
									<span class="ml-1 text-[10px] font-normal opacity-60">
										{#if isSourceString(getSource('summary'))}
											({sourceLabel(getSource('summary'))})
										{:else}
											(<a
												href={sourceUrl(getSource('summary'))}
												target="_blank"
												rel="noopener noreferrer"
												class="font-semibold text-lightBlue underline">{sourceLabel(getSource('summary'))}</a
											>)
										{/if}
									</span>
								{/if}
							</div>
							<p class="text-[14px] leading-[1.7] whitespace-pre-wrap text-white">
								{selectedInfo.summary}
							</p>
						</div>
					{:else if activeTab === 'politics'}
						<div class="rounded-xl bg-transparent p-0">
							<div class="mb-2 text-[13px] font-bold tracking-[0.5px] text-cyan-200 uppercase">
								Politics
								{#if showSources && getSource('politics')}
									<span class="ml-1 text-[10px] font-normal opacity-60">
										{#if isSourceString(getSource('politics'))}
											({sourceLabel(getSource('politics'))})
										{:else}
											(<a
												href={sourceUrl(getSource('politics'))}
												target="_blank"
												rel="noopener noreferrer"
												class="font-semibold text-lightBlue underline">{sourceLabel(getSource('politics'))}</a
											>)
										{/if}
									</span>
								{/if}
							</div>
							<p class="text-[14px] leading-[1.7] whitespace-pre-wrap text-white">
								{selectedInfo.politics}
							</p>
						</div>
					{:else if activeTab === 'economics'}
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
								<div class="flex items-center gap-3 py-8">
									<div class="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-cyan-300"></div>
									<span class="text-white/70">Loading economic data...</span>
								</div>
							{:else if selectedName ? infoCache[selectedName]?.error : true}
								<div class="rounded-lg border border-red-700/30 bg-red-900/20 p-4 text-red-200">
									<div class="font-semibold">Unable to Load Economic Data</div>
									<div class="mt-1 text-sm opacity-80">
										{selectedName ? infoCache[selectedName]?.error : 'Cannot Find Selected Country'}
									</div>
								</div>
							{:else if selectedInfo.economics && typeof selectedInfo.economics !== 'string'}
								<div class="mb-4 flex flex-wrap gap-1">
									{#each [['gdpPerCapita', 'GDP/Capita'], ['gdpGrowth', 'GDP Growth'], ['inflation', 'Inflation'], ['unemployment', 'Unemployment']] as [key, label]}
										<button
											on:click={() => setEconomicChart(key)}
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
											<span class="text-xs text-white/60"
												>({chartData[0]?.year} - {chartData[chartData.length - 1]?.year})</span
											>
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
																(d, i) =>
																	`${40 + (i / (chartData.length - 1)) * 340},${155 - ((d.value - minVal) / range) * 125}`
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
												class="w-[calc(50%-0.375rem)] flex-grow rounded-lg border border-white/10 bg-gradient-to-br from-white/5 to-white/10 p-3 sm:w-[calc(50%-0.375rem)]"
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
											<span>⚖️</span>
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
