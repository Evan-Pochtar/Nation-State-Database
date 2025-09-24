<script lang="ts">
	import { fly } from 'svelte/transition';

	export let settingsOpen = false;
	export let currentProjection = 'naturalEarth1';

	export let onToggle: (() => void) | undefined;
	export let onProjectionChange: ((projection: string) => void) | undefined;

	const projections = [
		{ id: 'naturalEarth1', name: 'Natural Earth', description: 'Balanced world view' },
		{ id: 'mercator', name: 'Mercator', description: 'Navigation standard' },
		{ id: 'equalEarth', name: 'Equal Earth', description: 'Area-accurate' }
	];

	function selectProjection(projectionId: string) {
		currentProjection = projectionId;
		onProjectionChange?.(projectionId);
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
			class="absolute top-0 left-[60px] w-80 overflow-hidden rounded-2xl border border-sky-400/30 bg-gradient-to-br from-slate-900/95 to-black/98 shadow-[0_20px_40px_rgba(0,0,0,0.6),0_0_0_1px_rgba(56,189,248,0.1),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-[20px]"
			transition:fly={{ x: -20, duration: 300, opacity: 0 }}
		>
			<div class="flex items-center gap-3 border-b border-sky-400/20 px-6 py-5 pb-4">
				<div class="h-px flex-1 bg-gradient-to-r from-transparent via-sky-400/40 to-transparent"></div>
				<h3 class="m-0 text-[11px] font-semibold tracking-[0.1em] whitespace-nowrap text-sky-400/90">MAP PROJECTION</h3>
				<div class="h-px flex-1 bg-gradient-to-r from-transparent via-sky-400/40 to-transparent"></div>
			</div>

			<div class="flex flex-col gap-0.5 p-2">
				{#each projections as projection}
					<button
						class="relative flex cursor-pointer items-center gap-3 overflow-hidden rounded-lg border-none bg-transparent px-4 py-3 text-left transition-all duration-200 hover:bg-sky-400/8"
						class:projection-selected={currentProjection === projection.id}
						on:click={() => selectProjection(projection.id)}
					>
						<div
							class="flex h-2 w-2 flex-shrink-0 items-center justify-center rounded-full border-2 border-slate-400/40 transition-all duration-200"
							class:option-indicator-selected={currentProjection === projection.id}
						>
							<div
								class="h-1 w-1 rounded-full bg-emerald-500/80 opacity-0 transition-opacity duration-200"
								class:opacity-100={currentProjection === projection.id}
							></div>
						</div>
						<div class="flex-1">
							<div class="mb-0.5 text-[13px] font-medium text-slate-50/90">{projection.name}</div>
							<div class="text-[11px] font-normal text-slate-400/70">{projection.description}</div>
						</div>
						<div class="option-glow"></div>
					</button>
				{/each}
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

	.projection-selected .option-glow {
		opacity: 1;
	}

	@keyframes rotate {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes scan {
		0%,
		100% {
			opacity: 0.3;
		}
		50% {
			opacity: 1;
		}
	}
</style>
