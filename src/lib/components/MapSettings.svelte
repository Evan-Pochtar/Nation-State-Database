<script lang="ts">
	import { fly } from 'svelte/transition';
	import ColorfulPreview from '$lib/assets/img/colorful.png';
	import LightPreview from '$lib/assets/img/light.png';
	import DarkPreview from '$lib/assets/img/dark.png';

	export let settingsOpen = false;
	export let currentProjection = 'naturalEarth1';
	export let currentTheme: 'dark' | 'light' | 'colorful' = 'dark';

	export let onToggle: (() => void) | undefined;
	export let onProjectionChange: ((projection: string) => void) | undefined;
	export let onThemeChange: ((theme: 'dark' | 'light' | 'colorful') => void) | undefined;

	const projections = [
		{ id: 'naturalEarth1', name: 'Natural Earth', description: 'Balanced world view' },
		{ id: 'mercator', name: 'Mercator', description: 'Navigation standard' },
		{ id: 'equalEarth', name: 'Equal Earth', description: 'Area-accurate' }
	];

	function selectProjection(projectionId: string) {
		currentProjection = projectionId;
		onProjectionChange?.(projectionId);
	}

	function setTheme(t: 'dark' | 'light' | 'colorful') {
		currentTheme = t;
		onThemeChange?.(t);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && settingsOpen) {
			onToggle?.();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="fixed top-5 left-5 z-[100]">
	<button
		class="relative flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl border border-sky-400/30 bg-gradient-to-br from-slate-900/90 to-black/95 shadow-[0_4px_12px_rgba(0,0,0,0.4),0_0_0_1px_rgba(56,189,248,0.1),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-[12px] transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-400/60 hover:shadow-[0_8px_25px_rgba(0,0,0,0.5),0_0_20px_rgba(56,189,248,0.3),inset_0_1px_0_rgba(255,255,255,0.2)]"
		class:settings-btn-active={settingsOpen}
		on:click={onToggle}
		aria-label="Map Settings"
		aria-expanded={settingsOpen}
	>
		<div
			class="relative z-[2] text-slate-400/90 transition-all duration-300 hover:text-sky-400/90"
			class:settings-icon-active={settingsOpen}
		>
			<div
				class="transition-transform duration-[600ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
				class:rotate-240={settingsOpen}
			>
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
			class="absolute top-0 left-[72px] w-96 overflow-hidden rounded-3xl border border-sky-400/20 bg-gradient-to-br from-slate-900/95 to-black/98 p-4 shadow-2xl backdrop-blur-lg"
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
						on:click={() => selectProjection(projection.id)}
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
					<h3 class="m-0 text-xs font-semibold tracking-wide text-sky-400/90">MAP COLORS</h3>
					<div class="h-px flex-1 bg-gradient-to-r from-transparent via-sky-400/30 to-transparent"></div>
				</div>

				<div class="flex items-center justify-center gap-6">
					<button
						type="button"
						class="flex cursor-pointer flex-col items-center gap-2 focus:outline-none"
						on:click={() => setTheme('dark')}
						aria-pressed={currentTheme === 'dark'}
					>
						<img
							src={DarkPreview}
							alt="dark preview"
							class="h-20 w-20 rounded-md border border-white/10 object-cover shadow-md"
						/>
						<div class={`text-sm ${currentTheme === 'dark' ? 'text-white' : 'text-slate-400'}`}>Dark</div>
					</button>

					<button
						type="button"
						class="flex cursor-pointer flex-col items-center gap-2 focus:outline-none"
						on:click={() => setTheme('light')}
						aria-pressed={currentTheme === 'light'}
					>
						<img
							src={LightPreview}
							alt="light preview"
							class="h-20 w-20 rounded-md border border-slate-300/20 object-cover shadow-md"
						/>
						<div class={`text-sm ${currentTheme === 'light' ? 'text-white' : 'text-slate-400'}`}>Light</div>
					</button>

					<button
						type="button"
						class="flex cursor-pointer flex-col items-center gap-2 focus:outline-none"
						on:click={() => setTheme('colorful')}
						aria-pressed={currentTheme === 'colorful'}
					>
						<img
							src={ColorfulPreview}
							alt="colorful preview"
							class="h-20 w-20 rounded-md border border-white/10 object-cover shadow-md"
						/>
						<div class={`text-sm ${currentTheme === 'colorful' ? 'text-white' : 'text-slate-400'}`}>Colorful</div>
					</button>
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

	.projection-selected {
		background: rgba(34, 197, 94, 0.1) !important;
		border: 1px solid rgba(34, 197, 94, 0.3);
	}

	.option-indicator-selected {
		border-color: rgba(34, 197, 94, 0.8) !important;
		background: rgba(34, 197, 94, 0.2);
	}

	.option-glow {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: linear-gradient(90deg, transparent 0%, rgba(34, 197, 94, 0.1) 50%, transparent 100%);
		opacity: 0;
		transition: opacity 0.3s ease;
	}

	@keyframes rotate {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>
