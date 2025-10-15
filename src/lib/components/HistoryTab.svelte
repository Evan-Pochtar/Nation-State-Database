<script lang="ts">
	import { onMount } from 'svelte';
	import { fetchHistoryDataModule } from '$lib/utils/getInfo';
	import type { CountryData } from '$lib/utils/types';

	export let selectedInfo: CountryData | null = null;
	export let selectedName: string | null = '';
	export let showSources: boolean = false;
	export let infoCache: Record<string, { data?: CountryData; loading: boolean; error?: string }> = {};

	let activeSection = 'overview';
	let historyData: any = null;

	function fetchHistoryData(name: string) {
		return fetchHistoryDataModule({
			name,
			selectedInfo,
			getInfoCache: () => infoCache,
			setInfoCache: (newCache) => (infoCache = newCache),
			setSelectedInfo: (newSelected) => (selectedInfo = newSelected),
			persist: false
		});
	}

	function setSection(section: string) {
		activeSection = section;
	}

	function updateHistoryData() {
		if (!selectedName) {
			historyData = null;
			return;
		}

		const cachedData = infoCache[selectedName]?.data;
		if (cachedData?.history && typeof cachedData.history !== 'string') {
			historyData = cachedData.history;
		} else {
			historyData = null;
		}
	}

	onMount(() => {
		updateHistoryData();
		if (selectedName) {
			fetchHistoryData(selectedName);
		}
	});

	$: if (selectedName) {
		fetchHistoryData(selectedName);
	}

	$: if (selectedInfo || selectedName || infoCache) {
		updateHistoryData();
	}
</script>

<div class="rounded-xl bg-transparent p-0">
	<div class="mb-4 text-[13px] font-bold tracking-[0.5px] text-cyan-200 uppercase">
		Historical Timeline
		{#if showSources && historyData?.source}
			<span class="ml-1 text-[10px] font-normal opacity-60">
				(<a
					href={historyData.source.url}
					target="_blank"
					rel="noopener noreferrer"
					class="font-semibold text-lightBlue underline">{historyData.source.label}</a
				>)
			</span>
		{/if}
	</div>

	{#if selectedName && infoCache[selectedName]?.loading}
		<div
			class="relative overflow-hidden rounded-xl border border-cyan-500/20 bg-gradient-to-br from-black/40 via-cyan-900/10 to-black/40 p-8 backdrop-blur-sm"
		>
			<div class="pointer-events-none absolute inset-0 opacity-10">
				<div
					class="animate-pulse-slow absolute top-0 left-0 h-full w-full bg-gradient-to-b from-transparent via-white/5 to-transparent"
				></div>
				<div
					class="absolute inset-0 bg-[linear-gradient(to_right,#000_1px,transparent_1px),linear-gradient(to_bottom,#000_1px,transparent_1px)] bg-[size:4px_4px]"
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
					<div class="mb-1 animate-pulse font-mono text-sm text-cyan-300">LOADING HISTORICAL DATA...</div>
				</div>

				<div class="animate-bounce-slow absolute -top-4 -left-4 font-mono text-xs text-cyan-400/30">$HIST_LOAD</div>
				<div class="animate-bounce-slow absolute -right-4 -bottom-4 font-mono text-xs text-emerald-400/30">
					> Timeline V3.2
				</div>
			</div>
		</div>
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
					<button
						on:click={() => setSection(key)}
						class={`rounded px-3 py-1 text-xs transition-all ${
							activeSection === key
								? 'border border-cyan-400/50 bg-cyan-400/20 text-cyan-300'
								: 'border border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
						}`}
					>
						{label}
					</button>
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
							class="absolute inset-0 bg-[linear-gradient(to_right,#0891b2_1px,transparent_1px),linear-gradient(to_bottom,#0891b2_1px,transparent_1px)] bg-[size:20px_20px]"
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
						class="absolute inset-0 bg-[linear-gradient(to_right,#0891b2_1px,transparent_1px),linear-gradient(to_bottom,#0891b2_1px,transparent_1px)] bg-[size:20px_20px]"
					></div>
				</div>
				<div class="relative z-10">
					<h3 class="mb-3 text-center text-lg font-bold text-cyan-300 capitalize">{activeSection} Period</h3>
					{#if historyData[activeSection].period}
						<div class="mb-3 text-center font-mono text-sm text-cyan-400">{historyData[activeSection].period}</div>
					{/if}
					<p class="mb-8 leading-relaxed text-white/80">{historyData[activeSection].description}</p>

					{#if historyData[activeSection].keyEvents}
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

					{#if historyData[activeSection].notableFigures}
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
	@keyframes fade-in {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
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
	.animate-fade-in {
		animation: fade-in 0.6s ease-out forwards;
		opacity: 0;
	}
</style>
