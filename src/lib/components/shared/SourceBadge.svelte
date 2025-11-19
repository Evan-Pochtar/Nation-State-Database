<script lang="ts">
	import type { SourceValue } from '$lib/utils/types';
	import { onMount } from 'svelte';

	let {
		source,
		show = false
	}: {
		source: SourceValue | null | undefined;
		show: boolean;
	} = $props();

	let showDropdown = $state(false);
	let dropdownContainer: HTMLSpanElement | null = $state(null);
	let portalTarget: HTMLDivElement | null = $state(null);

	function extractDomain(url: string): string {
		try {
			const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
			const hostname = urlObj.hostname.replace('www.', '');
			const parts = hostname.split('.');
			if (parts.length >= 2) {
				return parts[parts.length - 2];
			}
			return hostname;
		} catch {
			return url;
		}
	}

	function toggleDropdown(e: Event) {
		e.stopPropagation();
		showDropdown = !showDropdown;
	}

	function handleClickOutside(event: MouseEvent) {
		if (showDropdown && dropdownContainer && !dropdownContainer.contains(event.target as Node)) {
			if (portalTarget && !portalTarget.contains(event.target as Node)) {
				showDropdown = false;
			}
		}
	}

	onMount(() => {
		portalTarget = document.createElement('div');
		portalTarget.style.position = 'fixed';
		portalTarget.style.zIndex = '99999';
		portalTarget.style.pointerEvents = 'none';

		document.body.appendChild(portalTarget);
		document.addEventListener('click', handleClickOutside);
		return () => {
			document.removeEventListener('click', handleClickOutside);
			if (portalTarget && document.body.contains(portalTarget)) {
				document.body.removeChild(portalTarget);
			}
		};
	});
</script>

{#if show && source}
	<span class="ml-1 font-normal opacity-60">
		({#if typeof source === 'string'}
			{source}
		{:else if source.urls && source.urls.length > 0}
			<span class="relative inline-block" bind:this={dropdownContainer}>
				<a
					href={source.url ?? '#'}
					target="_blank"
					rel="noopener noreferrer"
					class="font-semibold text-lightBlue underline hover:text-cyan-300"
				>
					{source.label}
				</a>
				<button
					class="shrink-0 items-center justify-center rounded-md p-1 text-gray-400 transition-all duration-200 hover:bg-blue-100 hover:text-blue-600"
					onclick={toggleDropdown}
					aria-label="button"
				>
					<svg
						class="h-3 w-3 transition-transform duration-200 {showDropdown ? 'rotate-90' : ''}"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
					</svg>
				</button>
			</span>
		{:else}
			<a
				href={source.url ?? '#'}
				target="_blank"
				rel="noopener noreferrer"
				class="font-semibold text-lightBlue underline hover:text-cyan-300"
			>
				{source.label}
			</a>
		{/if})
	</span>
{/if}

{#if showDropdown && portalTarget && dropdownContainer && source && typeof source !== 'string' && source.urls}
	{@const rect = dropdownContainer.getBoundingClientRect()}
	{@const dropdownWidth = 120}
	<div
		style="
			position: fixed;
			top: {rect.bottom + 4}px;
			left: {rect.right - dropdownWidth}px;
			z-index: 99999;
			pointer-events: auto;
			p[]
		"
		class="min-w-[120px] rounded-lg border border-cyan-500/30 bg-black/95 opacity-90 shadow-xl shadow-black/50 backdrop-blur-sm"
	>
		{#each source.urls as url}
			<a
				href={url.startsWith('http') ? url : `https://${url}`}
				target="_blank"
				rel="noopener noreferrer"
				class="block px-3 py-1.5 text-xs text-cyan-200 transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-cyan-500/20"
				onclick={() => (showDropdown = false)}
			>
				{extractDomain(url)}
			</a>
		{/each}
	</div>
{/if}
