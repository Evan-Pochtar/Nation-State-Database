<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import type { CountryData } from '$lib/utils/types';
	import { formatNumber, formatLanguages } from '$lib/utils/helpers';
	import EconomicsTab from './components/tabs/EconomicsTab.svelte';
	import OverviewTab from './components/tabs/OverviewTab.svelte';
	import HistoryTab from './components/tabs/HistoryTab.svelte';

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
	}
</script>

<div
	in:fly={{ x: -leftWidth, duration: 100, easing: cubicOut }}
	out:fly={{ x: -leftWidth, duration: 100, easing: cubicOut }}
	class="z-20 min-w-[320px] border-r border-darkCyan bg-gradient-to-br from-slate-950 to-zinc-950 shadow-[0_0_50px] shadow-cyan-400/10 backdrop-blur-[20px]"
	style="width: {leftWidth}px;"
>
	<div class="flex h-full flex-col gap-4 overflow-y-auto p-6">
		{#if loading}
			<div class="flex items-center gap-3 px-2 py-8" in:fade={{ duration: 100 }}>
				<div class="h-9 w-9 animate-spin rounded-full border-4 border-white/5 border-t-teal-300"></div>
				<div class="font-semibold text-white/75">Fetching data for {selectedName}…</div>
			</div>
		{:else if selectedInfo}
			<div in:fade={{ duration: 150 }}>
				<header class={`relative ${compact ? 'flex flex-col items-start gap-2' : 'flex flex-wrap items-start gap-4'}`}>
					<div class={`flex ${compact ? 'w-full items-start gap-3' : 'items-center gap-3'}`}>
						<img
							class="h-32 w-auto rounded-lg object-contain"
							src={selectedInfo.flag}
							alt="{selectedName} flag"
							loading="eager"
						/>
						{#if selectedInfo.coatOfArms !== 'UNKNOWN'}
							<img
								class="h-32 w-auto rounded-lg bg-black/2 object-contain p-2"
								src={selectedInfo.coatOfArms}
								alt="{selectedName} coat of arms"
								loading="eager"
							/>
						{/if}
					</div>

					<div class={`${compact ? 'mt-1 w-full pr-12' : 'flex min-w-0 flex-1 flex-col gap-2'}`}>
						<div class="text-[20px] leading-tight font-extrabold text-slate-100">
							{selectedInfo.officialName ?? selectedName}
						</div>

						<div class="mt-1 flex flex-wrap items-center gap-2">
							<span
								class="rounded-full border border-darkCyan bg-gradient-to-br from-cyan-400/6 to-sky-400/2 px-2 py-1 text-xs text-lightBlue"
							>
								{selectedInfo.region}
							</span>
							{#if selectedInfo.subregion}
								<span
									class="rounded-full border border-white/4 bg-transparent px-2 py-1 text-xs text-slate-300 opacity-60"
								>
									{selectedInfo.subregion}
								</span>
							{/if}
							<span class="ml-1 text-xs text-gray-300 opacity-70">Capital: {selectedInfo.capital}</span>
						</div>
					</div>

					<div class={`${compact ? 'absolute top-2 right-3 z-50 flex items-start gap-2' : 'flex items-start gap-2'}`}>
						<!-- svelte-ignore a11y_consider_explicit_label -->
						<button
							onclick={onToggleSources}
							aria-pressed={showSources}
							class={`flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-lg border px-2 py-2 transition-colors duration-300 ${
								showSources
									? 'border-cyan-400/50 bg-gradient-to-br from-cyan-400/10 to-sky-400/20 text-cyan-300'
									: 'border-white/15 bg-gradient-to-br from-white/5 to-white/10 text-white/70'
							}`}
						>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
								<path
									d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
								/>
							</svg>
						</button>

						<button
							onclick={onCopyLink}
							class={`flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-lg border px-2 py-2 transition-all duration-300 ${
								copyLinkSuccess
									? 'border-emerald-500/50 bg-gradient-to-br from-emerald-400/20 to-emerald-500/10 text-emerald-300'
									: 'border-white/15 bg-gradient-to-br from-white/5 to-white/10 text-white/70'
							}`}
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width={copyLinkSuccess ? '2.5' : '2'}
								class={copyLinkSuccess ? '' : 'transition-transform'}
							>
								{#if copyLinkSuccess}
									<polyline points="20 6 9 17 4 12" />
								{:else}
									<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
									<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
								{/if}
							</svg>
						</button>

						<button
							onclick={onClose}
							class="flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-lg border border-teal-800
							bg-gradient-to-br from-cyan-400/10 to-sky-400/20 px-2 py-2 text-cyan-300 transition-transform hover:scale-105"
						>
							✕
						</button>
					</div>
				</header>

				<section class="mt-3">
					<div class="grid grid-cols-2 gap-2">
						{#each [['Area', formatNumber(selectedInfo.area) + ' km²'], ['Population', formatNumber(selectedInfo.population)], ['Gini', selectedInfo.gini > 0 ? selectedInfo.gini.toFixed(1) : '—'], ['Languages', formatLanguages(selectedInfo.languages)]] as [label, value]}
							<div
								class="rounded-xl border border-darkCyan bg-gradient-to-b from-white/[0.02] to-black/[0.03] p-2 shadow-[0_6px_18px] shadow-cyan-400/[0.02] backdrop-blur-[6px]"
							>
								<div class="mb-1 text-[11px] tracking-[0.6px] text-white/60 uppercase">{label}</div>
								<div class="text-[14px] font-extrabold text-white">{value}</div>
							</div>
						{/each}
					</div>
				</section>

				<nav class="mt-2 flex gap-2">
					{#each [['overview', 'Overview'], ['economics', 'Economy'], ['history', 'History']] as [tab, label]}
						<button
							role="tab"
							aria-selected={activeTab === tab}
							onclick={() => setTab(tab)}
							class="cursor-pointer rounded-lg border border-darkCyan bg-gradient-to-r from-white/[0.01] to-black/[0.02] px-3 py-2 font-extrabold text-cyan-50 transition-transform duration-160"
							>{label}</button
						>
					{/each}
				</nav>

				<section
					class="read-panel mt-3 overflow-auto rounded-xl border border-darkCyan bg-gradient-to-b from-black/2 to-white/1 p-3 shadow-[0_8px_30px] shadow-cyan-400/2"
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
