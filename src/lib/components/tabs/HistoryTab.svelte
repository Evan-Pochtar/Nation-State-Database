<script lang="ts">
	import { fetchHistoryDataModule } from '$lib/utils/getInfo';
	import type { CountryData } from '$lib/utils/types';
	import LoadingState from '$lib/components/shared/LoadingState.svelte';
	import SectionHeader from '$lib/components/shared/SectionHeader.svelte';
	import TabButton from '$lib/components/shared/TabButton.svelte';

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

	let activeSection = $state('overview');
	let historyData: any = $state(null);
	let isLoading = $state(false);
	let lastLoadedCountry = $state('');

	function fetchHistoryData(name: string) {
		return fetchHistoryDataModule({
			name,
			selectedInfo,
			getInfoCache: () => infoCache,
			setInfoCache: (newCache) => (infoCache = newCache),
			setSelectedInfo: (newSelected) => (selectedInfo = newSelected)
		});
	}

	function setSection(section: string) {
		activeSection = section;
	}

	$effect(() => {
		if (!selectedName) {
			historyData = null;
			lastLoadedCountry = '';
			isLoading = false;
			return;
		}

		const cachedData = infoCache[selectedName]?.data;

		if (cachedData?.history && typeof cachedData.history !== 'string') {
			historyData = cachedData.history;
			lastLoadedCountry = selectedName;
			isLoading = false;
		} else if (lastLoadedCountry !== selectedName && !infoCache[selectedName]?.loading && !isLoading) {
			isLoading = true;
			lastLoadedCountry = selectedName;
			fetchHistoryData(selectedName)
				.then(() => {
					const updatedData = infoCache[selectedName]?.data;
					if (updatedData?.history && typeof updatedData.history !== 'string') {
						historyData = updatedData.history;
					}
					isLoading = false;
				})
				.catch(() => {
					isLoading = false;
				});
		}
	});
</script>

<div class="rounded-xl bg-transparent p-0">
	<SectionHeader title="Historical Timeline" source={historyData?.source} {showSources} />

	{#if (selectedName && infoCache[selectedName]?.loading) || isLoading}
		<LoadingState message="LOADING HISTORICAL DATA..." submessage="Timeline V3.2" />
	{:else if selectedName && infoCache[selectedName]?.error}
		<div class="rounded-lg border border-red-700/30 bg-red-900/20 p-4 text-red-200">
			<div class="font-semibold">Unable to Load Historical Data</div>
			<div class="mt-1 text-sm opacity-80">
				{infoCache[selectedName]?.error}
			</div>
		</div>
	{:else if historyData}
		<div class="mb-4 flex flex-wrap gap-1">
			{#each [['overview', 'Overview'], ['ancient', 'Ancient'], ['medieval', 'Medieval'], ['feudal', 'Feudal'], ['isolation', 'Isolation'], ['pre-colonial', 'Pre-Colonial'], ['colonial', 'Colonial'], ['imperial', 'Imperial'], ['independence', 'Independence'], ['modern', 'Modern'], ['timeline', 'Timeline']] as [key, label]}
				{#if historyData[key]}
					<TabButton active={activeSection === key} onclick={() => setSection(key)}>
						{label}
					</TabButton>
				{/if}
			{/each}
		</div>

		{#if activeSection === 'overview' && historyData.overview}
			<div class="space-y-4">
				<div
					class="relative overflow-hidden rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-900/10 via-black/40 to-blue-900/10 p-6 backdrop-blur-sm"
				>
					<div class="absolute inset-0 opacity-5">
						<div
							class="absolute inset-0 bg-[linear-gradient(to_right,#0891b2_1px,transparent_1px),linear-gradient(to_bottom,#0891b2_1px,transparent_1px)] bg-size-[20px_20px]"
						></div>
					</div>
					<div class="relative z-10">
						<h3 class="mb-3 text-center text-lg font-bold text-cyan-300">Historical Overview</h3>
						<p class="leading-relaxed text-white/80">{historyData.overview}</p>
					</div>
				</div>

				{#if historyData.keyFacts}
					<div class="grid gap-3 sm:grid-cols-2">
						{#each historyData.keyFacts as fact}
							<div
								class="group relative overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-white/5 to-white/10 p-4 transition-all hover:border-cyan-400/30 hover:from-cyan-900/20 hover:to-blue-900/20"
							>
								<div
									class="absolute inset-0 translate-y-full bg-gradient-to-t from-cyan-500/10 to-transparent transition-transform duration-500 group-hover:translate-y-0"
								></div>
								<div class="relative z-10">
									<div class="mb-1 text-xs font-semibold tracking-wide text-cyan-400 uppercase">{fact.label}</div>
									<div class="text-sm text-white/90">{fact.value}</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{:else if activeSection === 'timeline' && historyData.timeline}
			<div class="relative space-y-4">
				<div
					class="absolute top-0 bottom-0 left-4 w-px bg-gradient-to-b from-cyan-500/50 via-cyan-500/20 to-transparent"
				></div>
				{#each historyData.timeline as event, i}
					<div class="animate-fade-in relative pl-10" style="animation-delay: {i * 0.1}s">
						<div class="absolute top-2 left-2 h-5 w-5 rounded-full border-2 border-cyan-500 bg-black">
							<div class="absolute inset-1 animate-ping rounded-full bg-cyan-400 opacity-75"></div>
						</div>
						<div
							class="rounded-lg border border-white/10 bg-gradient-to-br from-white/5 to-white/10 p-4 transition-all hover:border-cyan-400/30 hover:from-cyan-900/20 hover:to-blue-900/20"
						>
							<div class="mb-1 flex items-center gap-2">
								<span class="font-mono text-sm font-bold text-cyan-300">{event.year}</span>
								{#if event.era}
									<span class="rounded bg-cyan-500/20 px-2 py-0.5 text-xs text-cyan-300">{event.era}</span>
								{/if}
							</div>
							<h4 class="mb-2 font-semibold text-white">{event.title}</h4>
							<p class="text-sm leading-relaxed text-white/70">{event.description}</p>
						</div>
					</div>
				{/each}
			</div>
		{:else if activeSection !== 'overview' && activeSection !== 'timeline' && historyData[activeSection]}
			<div
				class="relative overflow-hidden rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-900/10 via-black/40 to-blue-900/10 p-6 backdrop-blur-sm"
			>
				<div class="absolute inset-0 opacity-5">
					<div
						class="absolute inset-0 bg-[linear-gradient(to_right,#0891b2_1px,transparent_1px),linear-gradient(to_bottom,#0891b2_1px,transparent_1px)] bg-size-[20px_20px]"
					></div>
				</div>
				<div class="relative z-10">
					<h3 class="mb-3 text-center text-lg font-bold text-cyan-300 capitalize">{activeSection} Period</h3>
					{#if historyData[activeSection].period}
						<div class="mb-3 text-center font-mono text-sm text-cyan-400">{historyData[activeSection].period}</div>
					{/if}
					<p class="mb-8 leading-relaxed text-white/80">{historyData[activeSection].description}</p>

					{#if historyData[activeSection].keyEvents !== undefined && historyData[activeSection].keyEvents.length > 0}
						<div class="space-y-3">
							<div class="text-center font-semibold text-cyan-300">Key Events</div>
							{#each historyData[activeSection].keyEvents as event}
								<div class="rounded-lg border border-white/10 bg-black/30 p-3">
									<div class="mb-1 font-mono text-xs text-cyan-400">{event.year}</div>
									<div class="text-sm font-medium text-white">{event.title}</div>
									{#if event.description}
										<div class="mt-1 text-sm text-white/60">{event.description}</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}

					{#if historyData[activeSection].notableFigures !== undefined && historyData[activeSection].notableFigures.length > 0}
						<div class="mt-8 space-y-2">
							<div class="text-center font-semibold text-cyan-300">Notable Figures</div>
							<div class="flex flex-wrap justify-center gap-2">
								{#each historyData[activeSection].notableFigures as figure}
									<div class="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-sm text-cyan-300">
										{figure}
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	{:else}
		<div class="py-8 text-center text-white/50">
			<div>Historical data not available</div>
			<div class="mt-1 text-xs">Please select a country to view its history</div>
		</div>
	{/if}
</div>
