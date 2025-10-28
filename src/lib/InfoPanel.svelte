<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import type { CountryData } from '$lib/utils/types';
	import { formatNumber, formatLanguages, isSourceString, sourceLabel, sourceUrl, getSource } from '$lib/utils/helpers';
	import { cardClass, buttonClass, labelClass } from '$lib/utils/styles';
	import EconomicsTab from './components/EconomicsTab.svelte';
	import PoliticsTab from './components/PoliticsTab.svelte';
	import OverviewTab from './components/OverviewTab.svelte';
	import HistoryTab from './components/HistoryTab.svelte';

	let {
		selectedInfo = null,
		selectedName = '',
		loading = false,
		compact = false,
		showSources = false,
		activeTab = 'overview',
		leftWidth = 350,
		infoCache = {},
		copyLinkSuccess = false,
		onToggleSources,
		onClose,
		onChangeTab,
		onCopyLink
	}: {
		selectedInfo: CountryData | null;
		selectedName: string | null;
		loading: boolean;
		compact: boolean;
		showSources: boolean;
		activeTab: string;
		leftWidth: number;
		infoCache: Record<string, { data?: CountryData; loading: boolean; error?: string }>;
		copyLinkSuccess: boolean;
		onToggleSources: (() => void) | undefined;
		onClose: (() => void) | undefined;
		onChangeTab: ((t: string) => void) | undefined;
		onCopyLink: (() => void) | undefined;
	} = $props();

	function setTab(t: typeof activeTab) {
		if (t === activeTab) return;
		onChangeTab?.(t);
		requestAnimationFrame(() => {
			const rp = document.querySelector('.read-panel');
			if (rp) (rp as HTMLElement).scrollTop = 0;
		});
	}
</script>

<div
	in:fly={{ x: -leftWidth, duration: 150, easing: cubicOut }}
	out:fly={{ x: -leftWidth, duration: 120, easing: cubicOut }}
	class="z-20 min-w-[320px] border-r border-darkCyan bg-gradient-to-br from-slate-950 to-zinc-950 shadow-[0_0_50px] shadow-cyan-400/10 backdrop-blur-[20px]"
	style="width: {leftWidth}px; will-change: transform; transform: translateZ(0);"
	aria-hidden="false"
>
	<div class="flex h-full flex-col gap-4 overflow-y-auto p-6" style="will-change: contents;">
		{#if loading}
			<div class="flex items-center gap-3 px-2 py-8" in:fade={{ duration: 100 }}>
				<div
					class="h-9 w-9 animate-spin rounded-full border-4 border-white/5 border-t-teal-300"
					aria-hidden="true"
				></div>
				<div class="font-semibold text-white/75">
					Fetching data for {selectedName}…
				</div>
			</div>
		{:else if selectedInfo}
			<div in:fade={{ duration: 150 }}>
				<header class={`relative ${compact ? 'flex flex-col items-start gap-2' : 'flex flex-wrap items-start gap-4'}`}>
					<div class={`flex ${compact ? 'w-full items-start gap-3' : 'items-center gap-3'}`}>
						<div class="relative inline-block">
							<img
								class="h-32 w-auto rounded-lg object-contain contrast-[1.02] saturate-[0.95]"
								src={selectedInfo.flag}
								alt="{selectedName} flag"
								loading="eager"
							/>
							{#if showSources && getSource('flag', selectedInfo)}
								<div
									class="absolute right-1 bottom-1 rounded border border-teal-800 bg-stone-950 px-2 py-0.5 text-[10px] font-medium text-white shadow-[0_2px_8px] shadow-black/50 backdrop-blur-[10px]"
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
									class="h-32 w-auto rounded-lg bg-black/2 object-contain p-2"
									src={selectedInfo.coatOfArms}
									alt="{selectedName} coat of arms"
									loading="eager"
								/>
								{#if showSources && getSource('coatOfArms', selectedInfo)}
									<div
										class="absolute right-1 bottom-1 rounded border border-teal-800 bg-stone-950 px-2 py-0.5 text-[10px] font-medium text-white shadow-[0_2px_8px] shadow-black/50 backdrop-blur-[10px]"
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
								class="rounded-full border border-darkCyan bg-gradient-to-br from-cyan-400/6 to-sky-400/2 px-2 py-1 text-xs text-lightBlue opacity-95"
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
												class="font-semibold text-lightBlue underline"
												>{sourceLabel(getSource('region', selectedInfo))}</a
											>)
										{/if}
									</span>
								{/if}
							</span>
							{#if selectedInfo.subregion}
								<span
									class="rounded-full border border-white/4 bg-transparent px-2 py-1 text-xs text-slate-300 opacity-60"
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
							<span class="ml-1 text-xs text-gray-300 opacity-70">
								Capital: {selectedInfo.capital}
								{#if showSources && getSource('capital', selectedInfo)}
									<span class="ml-1 text-[0.75em] font-normal opacity-60">
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
						</div>
					</div>

					<div class={`${compact ? 'absolute top-2 right-3 z-50 flex items-start gap-2' : 'flex items-start gap-2'}`}>
						<div class="relative">
							<button
								onclick={onToggleSources}
								aria-pressed={showSources}
								aria-label="Toggle source attribution"
								aria-describedby="toggle-sources-tooltip"
								class={`peer transition-color flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-lg border border-white/15 px-2 py-2 font-semibold backdrop-blur-[10px] duration-500 ${showSources ? 'bg-gradient-to-br from-cyan-400/10 to-sky-400/20 text-cyan-300' : 'bg-gradient-to-br from-white/5 to-white/10 text-white/70'}`}
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

						<div class="relative">
							<button
								onclick={onCopyLink}
								aria-label="Copy link to country"
								aria-describedby="copy-link-tooltip"
								class={`peer group flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-lg border px-2 py-2 font-semibold backdrop-blur-[10px] transition-all duration-300 ${copyLinkSuccess ? 'border-emerald-500/50 bg-gradient-to-br from-emerald-400/20 to-emerald-500/10 text-emerald-300' : 'border-white/15 bg-gradient-to-br from-white/5 to-white/10 text-white/70 hover:border-cyan-400/30 hover:from-cyan-400/10 hover:to-sky-400/10 hover:text-cyan-300'}`}
							>
								<svg
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									class={`transition-all duration-300 ${copyLinkSuccess ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}`}
									aria-hidden="true"
								>
									<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
									<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
								</svg>
								<svg
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.5"
									stroke-linecap="round"
									stroke-linejoin="round"
									class={`absolute transition-all duration-300 ${copyLinkSuccess ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}
									aria-hidden="true"
								>
									<polyline points="20 6 9 17 4 12" />
								</svg>
							</button>

							<div
								id="copy-link-tooltip"
								role="tooltip"
								class={`pointer-events-none absolute top-full right-0 mt-2 w-max max-w-xs rounded-md border px-3 py-1.5 text-sm font-medium shadow-[0_6px_30px] backdrop-blur-[6px] transition-all duration-300 will-change-transform ${copyLinkSuccess ? 'translate-y-0 scale-100 border-emerald-500/30 bg-gradient-to-br from-emerald-900/90 to-emerald-950/90 text-emerald-200 opacity-100 shadow-emerald-500/20' : 'translate-y-1 scale-95 border-white/10 bg-gradient-to-br from-black/80 to-slate-900/80 text-white/90 opacity-0 shadow-cyan-500/10 group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:scale-100 group-focus-visible:opacity-100'}`}
								aria-hidden="false"
							>
								{copyLinkSuccess ? 'Link Copied!' : 'Copy link to country'}
							</div>
						</div>

						<button
							onclick={onClose}
							aria-label="Close info panel"
							class="flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-lg border border-teal-800 bg-gradient-to-br from-cyan-400/10 to-sky-400/20 px-2 py-2 font-semibold text-cyan-300 backdrop-blur-[10px] transition-transform duration-200 hover:scale-105"
							>✕</button
						>
					</div>
				</header>

				<section class="mt-3" aria-label="Key facts">
					<div class="grid grid-cols-2 gap-2">
						{#each [['Area', formatNumber(selectedInfo.area) + ' km²', getSource('area', selectedInfo)], ['Population', formatNumber(selectedInfo.population), getSource('population', selectedInfo)], ['Gini', selectedInfo.gini ?? '—', getSource('gini', selectedInfo)], ['Languages', formatLanguages(selectedInfo.languages), getSource('languages', selectedInfo)]] as [label, value, source]}
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
					{#each [['overview', 'Overview'], ['economics', 'Economy'], ['history', 'History']] as [tab, label]}
						<button role="tab" aria-selected={activeTab === tab} onclick={() => setTab(tab)} class={buttonClass}
							>{label}</button
						>
					{/each}
				</nav>

				<section
					class="read-panel mt-3 overflow-auto rounded-xl border border-darkCyan bg-gradient-to-b from-black/2 to-white/1 p-3 shadow-[0_8px_30px] shadow-cyan-400/2"
					aria-live="polite"
				>
					<div class="pr-1">
						{#if activeTab === 'overview'}
							<OverviewTab {selectedInfo} {showSources} />
						{:else if activeTab === 'economics'}
							<EconomicsTab {selectedInfo} {selectedName} {showSources} {infoCache} />
						{:else if activeTab === 'history'}
							<HistoryTab {selectedInfo} {selectedName} {showSources} {infoCache} />
						{/if}
					</div>
				</section>
			</div>
		{:else}
			<div class="p-4 text-white" in:fade={{ duration: 150 }}>
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
