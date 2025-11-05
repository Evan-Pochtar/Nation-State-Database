<script lang="ts">
	import { fly } from 'svelte/transition';
	import ColorfulPreview from '$lib/assets/img/colorful.png';
	import LightPreview from '$lib/assets/img/light.png';
	import DarkPreview from '$lib/assets/img/dark.png';
	import GiniPreview from '$lib/assets/img/gini-preview.png';
	import GDPPreview from '$lib/assets/img/gdp-preview.png';
	import GDPPerCapitaPreview from '$lib/assets/img/gdp-per-capita-preview.png';
	import type { ProjectionType, ThemeType } from '$lib/utils/types';

	let {
		settingsOpen = false,
		currentProjection = 'naturalEarth1',
		currentTheme = 'dark',
		onToggle,
		onProjectionChange,
		onThemeChange
	}: {
		settingsOpen: boolean;
		currentProjection: ProjectionType;
		currentTheme: ThemeType;
		onToggle: (() => void) | undefined;
		onProjectionChange: ((projection: ProjectionType) => void) | undefined;
		onThemeChange: ((theme: ThemeType) => void) | undefined;
	} = $props();

	const projections = [
		{ id: 'naturalEarth1', name: 'Natural Earth', description: 'Balanced world view' },
		{ id: 'mercator', name: 'Mercator', description: 'Navigation standard' },
		{ id: 'equalEarth', name: 'Equal Earth', description: 'Area-accurate' }
	];

	const baseThemes = [
		{ id: 'dark', name: 'Dark', preview: DarkPreview },
		{ id: 'light', name: 'Light', preview: LightPreview },
		{ id: 'colorful', name: 'Colorful', preview: ColorfulPreview }
	];

	const dataThemes = [
		{ id: 'gini', name: 'Gini Index', preview: GiniPreview, description: 'Income inequality' },
		{ id: 'gdp', name: 'GDP', preview: GDPPreview, description: 'Total economic output' },
		{
			id: 'gdpPerCapita',
			name: 'GDP per Capita',
			preview: GDPPerCapitaPreview,
			description: 'Economic output per person'
		}
	];

	function selectProjection(projectionId: ProjectionType) {
		currentProjection = projectionId;
		onProjectionChange?.(projectionId);
	}

	function setTheme(t: ThemeType) {
		currentTheme = t;
		onThemeChange?.(t);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && settingsOpen) {
			onToggle?.();
		}
	}

	const isDataTheme = $derived(['gini', 'gdp', 'gdpPerCapita'].includes(currentTheme));
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="fixed top-5 left-5 z-100">
	<button
		class="relative flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl border border-sky-400/30 bg-gradient-to-br from-slate-900/90 to-black/95 shadow-[0_4px_12px_rgba(0,0,0,0.4),0_0_0_1px_rgba(56,189,248,0.1),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-400/60 hover:shadow-[0_8px_25px_rgba(0,0,0,0.5),0_0_20px_rgba(56,189,248,0.3),inset_0_1px_0_rgba(255,255,255,0.2)]"
		class:settings-btn-active={settingsOpen}
		onclick={onToggle}
		aria-label="Map Settings"
		aria-expanded={settingsOpen}
	>
		<div
			class="relative z-2 text-slate-400/90 transition-all duration-300 hover:text-sky-400/90"
			class:settings-icon-active={settingsOpen}
		>
			<div class="transition-transform duration-600 ease-in-out" class:rotate-240={settingsOpen}>
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M19.4 13.5a7.97 7.97 0 000-3l2.1-1.6-2-3.4-2.4.6a8 8 0 00-2.6-1.5L14 2h-4l-.5 2.1a8 8 0 00-2.6 1.5L4.5 5.9 2.5 9.3 4.6 10.9a7.97 7.97 0 000 3L2.5 15.8l2 3.4 2.4-.6a8 8 0 002.6 1.5L10 22h4l.5-2.1a8 8 0 002.6-1.5l2.4.6 2-3.4-2.1-1.6z"
						fill="currentColor"
						opacity="0.5"
					/>
					<circle cx="12" cy="12" r="3.25" stroke="currentColor" stroke-width="1.5" fill="none" />
				</svg>
			</div>
		</div>
		<div class="glow-ring"></div>
	</button>

	{#if settingsOpen}
		<div
			class="absolute top-0 left-[72px] max-h-[calc(100vh-80px)] w-[440px] overflow-x-hidden overflow-y-auto rounded-3xl border border-sky-400/20 bg-gradient-to-br from-slate-900/95 to-black/98 p-4 shadow-2xl backdrop-blur-lg"
			transition:fly={{ x: -20, duration: 300 }}
		>
			<div class="mb-3 flex items-center gap-3 border-b border-slate-700/40 px-2 pb-3">
				<div class="h-px flex-1 bg-gradient-to-r from-transparent via-sky-400/30 to-transparent"></div>
				<h3 class="m-0 text-xs font-semibold tracking-wide text-sky-400/90">MAP PROJECTION</h3>
				<div class="h-px flex-1 bg-gradient-to-r from-transparent via-sky-400/30 to-transparent"></div>
			</div>

			<div class="mb-3 flex flex-col gap-1">
				{#each projections as projection}
					<button
						type="button"
						class="flex cursor-pointer items-center gap-3 rounded-lg px-4 py-3 text-left transition hover:bg-sky-400/6 focus:outline-none"
						onclick={() => selectProjection(projection.id as ProjectionType)}
						aria-pressed={currentProjection === projection.id}
					>
						<div class="flex h-2 w-2 items-center justify-center rounded-full border-2 border-slate-400/40">
							<div
								class={`h-1 w-1 rounded-full ${currentProjection === projection.id ? 'bg-emerald-400/90' : 'opacity-0'}`}
							></div>
						</div>
						<div class="flex-1">
							<div class="text-sm font-medium text-slate-50/90">{projection.name}</div>
							<div class="text-xs text-slate-400/70">{projection.description}</div>
						</div>
					</button>
				{/each}
			</div>

			<div class="border-t border-slate-700/30 pt-4">
				<div class="mb-3 flex items-center gap-3 border-b border-slate-700/40 px-2 pb-3">
					<div class="h-px flex-1 bg-gradient-to-r from-transparent via-sky-400/30 to-transparent"></div>
					<h3 class="m-0 text-xs font-semibold tracking-wide text-sky-400/90">BASE THEMES</h3>
					<div class="h-px flex-1 bg-gradient-to-r from-transparent via-sky-400/30 to-transparent"></div>
				</div>

				<div class="mb-4 flex items-center justify-center gap-4">
					{#each baseThemes as theme}
						<button
							type="button"
							class="group flex cursor-pointer flex-col items-center gap-2 transition-transform hover:scale-105 focus:outline-none"
							onclick={() => setTheme(theme.id as any)}
							aria-pressed={currentTheme === theme.id}
						>
							<div class="relative">
								<img
									src={theme.preview}
									alt="{theme.name} preview"
									class="h-20 w-20 rounded-md object-cover shadow-md transition-all"
									class:border={currentTheme === theme.id}
									class:border-emerald-400={currentTheme === theme.id}
									class:shadow-[0_0_20px_rgba(34,197,94,0.3)]={currentTheme === theme.id}
									class:border-0={currentTheme !== theme.id}
								/>
								{#if currentTheme === theme.id}
									<div
										class="animate-scale-in absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400"
									>
										<svg
											class="h-3 w-3 text-slate-900"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="3"
										>
											<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
										</svg>
									</div>
								{/if}
							</div>
							<div
								class="text-sm transition-colors"
								class:text-emerald-400={currentTheme === theme.id}
								class:text-slate-400={currentTheme !== theme.id}
								class:font-semibold={currentTheme === theme.id}
							>
								{theme.name}
							</div>
						</button>
					{/each}
				</div>

				<div class="mt-4 border-t border-slate-700/30 pt-4">
					<div class="mb-3 flex items-center gap-3 border-b border-slate-700/40 px-2 pb-3">
						<div class="h-px flex-1 bg-gradient-to-r from-transparent via-purple-400/30 to-transparent"></div>
						<h3 class="m-0 text-xs font-semibold tracking-wide text-purple-400/90">DATA VISUALIZATIONS</h3>
						<div class="h-px flex-1 bg-gradient-to-r from-transparent via-purple-400/30 to-transparent"></div>
					</div>

					<div class="flex flex-col gap-3">
						{#each dataThemes as theme}
							<button
								type="button"
								class="group flex cursor-pointer items-start gap-3 rounded-lg p-3 text-left transition-all hover:bg-purple-400/6 focus:outline-none bg-purple-400/10={currentTheme ===
									theme.id} border-purple-400/60={currentTheme === theme.id} border-l-2={currentTheme === theme.id}"
								onclick={() => setTheme(theme.id as any)}
								aria-pressed={currentTheme === theme.id}
							>
								<div class="relative shrink-0">
									<img
										src={theme.preview}
										alt="{theme.name} preview"
										class="h-16 w-16 rounded border object-cover shadow-sm transition-all border-purple-400/60={currentTheme ===
											theme.id} border-slate-600/40={currentTheme !== theme.id}"
									/>
									{#if currentTheme === theme.id}
										<div
											class="animate-scale-in absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-purple-400"
										>
											<svg
												class="h-2.5 w-2.5 text-white"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
												stroke-width="3"
											>
												<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
											</svg>
										</div>
									{/if}
								</div>
								<div class="min-w-0 flex-1">
									<div
										class="mb-1 text-sm font-medium transition-colors text-purple-400={currentTheme ===
											theme.id} text-slate-50/90={currentTheme !== theme.id}"
									>
										{theme.name}
									</div>
									<div class="text-xs text-slate-400/70">{theme.description}</div>
									{#if currentTheme === theme.id}
										<div class="mt-2 flex items-center gap-1.5 text-xs text-purple-400/80">
											<div class="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-400/80"></div>
											Active visualization
										</div>
									{/if}
								</div>
							</button>
						{/each}
					</div>

					{#if isDataTheme}
						<div class="mt-4 rounded-lg border border-purple-400/20 bg-purple-400/5 p-3">
							<div class="flex items-start gap-2">
								<svg
									class="mt-0.5 h-4 w-4 shrink-0 text-purple-400/80"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								<div class="text-xs leading-relaxed text-slate-300/80">
									Data shown uses the most recent available year from World Bank and REST Countries APIs.
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.settings-btn-active {
		border-color: rgba(34, 197, 94, 0.8) !important;
		background: linear-gradient(135deg, rgba(6, 78, 59, 0.9) 0%, rgba(0, 0, 0, 0.95) 100%) !important;
		box-shadow:
			0 8px 25px rgba(0, 0, 0, 0.5),
			0 0 30px rgba(34, 197, 94, 0.4),
			inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
	}

	.settings-icon-active {
		color: rgba(34, 197, 94, 0.9) !important;
	}

	.glow-ring {
		position: absolute;
		top: -2px;
		left: -2px;
		right: -2px;
		bottom: -2px;
		border-radius: 14px;
		background: conic-gradient(
			from 0deg,
			rgba(56, 189, 248, 0.2) 0deg,
			rgba(34, 197, 94, 0.2) 120deg,
			rgba(168, 85, 247, 0.2) 240deg,
			rgba(56, 189, 248, 0.2) 360deg
		);
		opacity: 0;
		transition: opacity 0.3s ease;
		animation: rotate 8s linear infinite;
	}

	.rotate-240 {
		transform: rotate(240deg);
	}
</style>
