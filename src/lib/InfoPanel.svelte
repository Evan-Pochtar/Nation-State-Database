<script lang="ts">
	import { slide } from 'svelte/transition';
	import type { SourceValue, DataSources, CountryData } from '$lib/types';
	import { formatNumber, formatGDP, formatLanguages, isSourceString, sourceLabel, sourceUrl } from '$lib/utils/format';
	import { cardClass, buttonClass, labelClass } from '$lib/styles';

	export let selectedInfo: CountryData | null = null;
	export let selectedName: string | null = null;
	export let loading: boolean = false;
	export let compact: boolean = false;
	export let showSources: boolean = false;
	export let activeTab: string = 'overview';
	export let leftWidth: number = 350;

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
					<button
						on:click={onToggleSources}
						aria-pressed={showSources}
						aria-label="Toggle source attribution"
						title="Toggle source attribution"
						class={`transition-color flex h-10 min-w-[40px] cursor-pointer items-center justify-center rounded-lg border border-white/15 px-2 py-2 font-semibold backdrop-blur-[10px] duration-500 ${showSources ? 'bg-gradient-to-br from-cyan-400/10 to-sky-400/20 text-cyan-300' : 'bg-gradient-to-br from-white/5 to-white/10 text-white/70'}`}
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
							<path
								d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
							/>
						</svg>
					</button>
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
					{#each [['overview', selectedInfo.summary, getSource('summary')], ['politics', selectedInfo.politics, getSource('politics')], ['economics', selectedInfo.economics, getSource('economics')]] as [tab, content, source]}
						{#if activeTab === tab}
							<div class="rounded-xl bg-transparent p-0">
								<div class="mb-2 text-[13px] font-bold tracking-[0.5px] text-cyan-200 uppercase">
									{tab.charAt(0).toUpperCase() + tab.slice(1)}
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
								<p class="text-[14px] leading-[1.7] whitespace-pre-wrap text-white">
									{content}
								</p>
							</div>
						{/if}
					{/each}
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
