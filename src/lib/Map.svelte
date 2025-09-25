<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { feature, neighbors } from 'topojson-client';
	import * as d3 from 'd3';
	import type { GeoFeature, CountryData } from '$lib/utils/types';
	import { fetchCountryInfoByName } from '$lib/utils/getInfo';
	import InfoPanel from '$lib/InfoPanel.svelte';
	import MapSettings from '$lib/components/MapSettings.svelte';

	let countries: GeoFeature[] = [];
	let selectedFeature: GeoFeature | null = null;
	let selectedName: string | null = null;
	let activeTab: string = 'overview';
	let currentProjection: string = 'naturalEarth1';
	let settingsOpen = false;

	let currentTheme: 'dark' | 'light' | 'colorful' = 'dark';

	let leftPct = 0.36,
		tempLeftPct = leftPct,
		leftWidth = 0,
		tempLeftWidth = 0;
	const MIN_PCT = 0.2,
		MAX_PCT = 0.75,
		MIN_LEFT_PX = 450,
		MAX_LEFT_PX = 900,
		COMPACT_THRESHOLD = 700,
		HANDLE_WIDTH = 6;
	let dragging = false;
	$: compact = leftWidth <= COMPACT_THRESHOLD;
	$: selectedLoading = selectedName ? (infoCache[selectedName]?.loading ?? false) : false;
	$: selectedInfo = selectedName ? (infoCache[selectedName]?.data ?? null) : null;

	let outerWidth = 1600,
		outerHeight = 900,
		rightWidth = outerWidth,
		rightHeight = outerHeight;

	let projection: d3.GeoProjection, pathGenerator: d3.GeoPath<any, GeoFeature>;
	let focusProjection: d3.GeoProjection | undefined,
		focusPathGenerator: d3.GeoPath<any, GeoFeature> | null = null;

	let animHandle: number | null = null,
		isAnimating = false;

	let infoCache: Record<string, { data?: CountryData; loading: boolean; error?: string }> = {};
	let svgEl: SVGSVGElement | null = null,
		mapGroup: SVGGElement | null = null;

	let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
	let resizeTimeout: number,
		currentTransform = d3.zoomIdentity,
		isZooming = false,
		showSources = false;

	let topoData: any = null;
	let topoObjectKey: string | null = null;
	let countryColorMap: string[] = [];

	function getProjection(type: string): d3.GeoProjection {
		switch (type) {
			case 'mercator':
				return d3.geoMercator();
			case 'equalEarth':
				return d3.geoEqualEarth();
			case 'naturalEarth1':
			default:
				return d3.geoNaturalEarth1();
		}
	}

	function handleProjectionChange(projection: string) {
		currentProjection = projection;
		handleResize();
		if (selectedFeature) setupFocusProjection();
		resetZoom();
		initZoom();
	}

	function handleThemeChange(theme: 'dark' | 'light' | 'colorful') {
		currentTheme = theme;
		if (theme === 'colorful' && topoData && topoObjectKey) {
			buildColorfulPalette();
		}
	}

	function throttledResize() {
		if (resizeTimeout) clearTimeout(resizeTimeout);
		resizeTimeout = window.setTimeout(handleResize, 100);
	}

	onMount(async () => {
		try {
			const resp = await fetch('/data/countries-map.json');
			if (!resp.ok) {
				console.error('Failed to load topojson');
				return;
			}
			const topo = await resp.json();
			topoData = topo;
			const objects = topo.objects;
			const objectKey = Object.keys(objects)[0];
			topoObjectKey = objectKey;
			const geo = feature(topo as any, objects[objectKey]) as GeoJSON.FeatureCollection | GeoJSON.Feature | null;

			countries = geo?.type === 'FeatureCollection' ? (geo.features as GeoFeature[]) : geo ? [geo as GeoFeature] : [];
			buildColorfulPalette();
			handleResize();
			window.addEventListener('resize', throttledResize);
		} catch (error) {
			console.error('Error loading map data:', error);
		}
	});

	onDestroy(() => {
		window.removeEventListener('resize', throttledResize);
		if (resizeTimeout) clearTimeout(resizeTimeout);
		if (animHandle != null) cancelAnimationFrame(animHandle);
		if (svgEl && zoomBehavior) {
			d3.select(svgEl).on('.zoom', null);
			zoomBehavior = null;
		}
		document.body.style.userSelect = '';
		(document.body as any).style.webkitUserSelect = '';
	});

	function handleResize() {
		outerWidth = window.innerWidth;
		outerHeight = window.innerHeight;
		const desired = Math.round(Math.max(MIN_LEFT_PX, Math.min(MAX_LEFT_PX, Math.round(leftPct * outerWidth))));
		leftWidth = desired;
		const effectiveLeft = dragging ? Math.max(MIN_LEFT_PX, Math.min(MAX_LEFT_PX, tempLeftWidth || desired)) : leftWidth;
		rightWidth = selectedFeature ? Math.max(300, outerWidth - effectiveLeft - HANDLE_WIDTH) : outerWidth;
		rightHeight = outerHeight;

		if (countries.length > 0) {
			const worldFeature: GeoJSON.FeatureCollection = {
				type: 'FeatureCollection',
				features: countries
			};
			projection = getProjection(currentProjection);
			projection.fitSize([outerWidth, outerHeight], worldFeature as any);
			pathGenerator = d3.geoPath().projection(projection as any);
			if (selectedFeature) setupFocusProjection();
		}
		initZoom();
	}

	function setupFocusProjection() {
		if (!selectedFeature) return;
		try {
			let proj = getProjection(currentProjection === 'orthographic' ? 'mercator' : currentProjection);

			const currentRightWidth = dragging ? Math.max(300, outerWidth - tempLeftWidth - HANDLE_WIDTH) : rightWidth;
			const minDim = Math.min(Math.max(300, currentRightWidth), Math.max(300, rightHeight));
			const paddingPx = Math.max(20, Math.min(80, Math.round(minDim * 0.06)));
			const left = paddingPx,
				top = paddingPx;
			const right = Math.max(currentRightWidth - paddingPx, left + 10);
			const bottom = Math.max(rightHeight - paddingPx, top + 10);
			proj.fitExtent(
				[
					[left, top],
					[right, bottom]
				],
				selectedFeature as any
			);

			focusProjection = proj;
			focusPathGenerator = d3.geoPath().projection(focusProjection as any);
		} catch (error) {
			const fallback = d3.geoMercator();
			const currentRightWidth = dragging ? Math.max(300, outerWidth - tempLeftWidth - HANDLE_WIDTH) : rightWidth;
			fallback.fitSize(
				[Math.max(100, currentRightWidth * 0.8), Math.max(100, rightHeight * 0.8)],
				selectedFeature as any
			);
			focusProjection = fallback;
			focusPathGenerator = d3.geoPath().projection(focusProjection as any);
		}
		if (!isZooming) initZoom();
	}

	function getCountryName(f: GeoFeature): string {
		return f.properties?.name ?? 'Unknown Country';
	}

	function getCountryIndex(f: GeoFeature) {
		for (let i = 0; i < countries.length; i++) {
			if (countries[i] === f) return i;
			if (
				countries[i]?.properties?.iso_a3 &&
				f?.properties?.iso_a3 &&
				countries[i].properties.iso_a3 === f.properties.iso_a3
			)
				return i;
			if (countries[i]?.properties?.name && f?.properties?.name && countries[i].properties.name === f.properties.name)
				return i;
		}
		return -1;
	}

	async function onCountryClick(f: GeoFeature) {
		if (!f || isAnimating) return;
		selectedFeature = f;
		selectedName = getCountryName(f);
		setupFocusProjection();
		handleResize();
		infoCache = (await fetchCountryInfoByName(selectedName, infoCache)) ?? infoCache;
		isAnimating = true;
		setTimeout(() => {
			isAnimating = false;
		}, 800);
	}

	async function closePanel() {
		selectedFeature = null;
		selectedName = null;
		focusProjection = undefined;
		focusPathGenerator = null;
		await tick();
		handleResize();
		resetZoom();
		initZoom();
	}

	function handlePointerDown() {
		if (!selectedFeature) return;
		dragging = true;
		tempLeftPct = leftPct;
		tempLeftWidth = leftWidth;
		document.body.style.userSelect = 'none';
		(document.body as any).style.webkitUserSelect = 'none';

		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', handlePointerUp, { once: true });
		window.addEventListener('pointercancel', handlePointerUp, { once: true });
	}

	function handlePointerMove(e: PointerEvent) {
		if (!dragging) return;
		const pct = Math.max(MIN_PCT, Math.min(MAX_PCT, e.clientX / outerWidth));
		tempLeftPct = pct;
		tempLeftWidth = Math.round(pct * outerWidth);
		rightWidth = Math.max(300, outerWidth - tempLeftWidth - HANDLE_WIDTH);
	}

	function handlePointerUp() {
		if (!dragging) return;
		dragging = false;
		leftPct = tempLeftPct;
		leftWidth = tempLeftWidth;
		rightWidth = Math.max(300, outerWidth - leftWidth - HANDLE_WIDTH);
		setupFocusProjection();
		document.body.style.userSelect = '';
		(document.body as any).style.webkitUserSelect = '';
		window.removeEventListener('pointermove', handlePointerMove);
	}

	function buildZoomBehavior() {
		return d3
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent([1, 100])
			.on('start', () => {
				isZooming = true;
			})
			.on('zoom', (event: any) => {
				if (!mapGroup || !svgEl) return;
				const t = event.transform;
				currentTransform = t;
				const k = t.k;
				let tx = t.x,
					ty = t.y;
				const bbox = mapGroup.getBBox();
				const vb = svgEl.viewBox.baseVal;
				const viewW = vb?.width || svgEl.clientWidth;
				const viewH = vb?.height || svgEl.clientHeight;
				const txMin = viewW - (bbox.x + bbox.width) * k;
				const txMax = -bbox.x * k;
				const tyMin = viewH - (bbox.y + bbox.height) * k;
				const tyMax = -bbox.y * k;
				tx = txMin > txMax ? (txMin + txMax) / 2 : Math.min(Math.max(tx, txMin), txMax);
				ty = tyMin > tyMax ? (tyMin + tyMax) / 2 : Math.min(Math.max(ty, tyMin), tyMax);
				mapGroup.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${k})`;
			})
			.on('end', () => {
				isZooming = false;
			});
	}

	function initZoom() {
		if (!svgEl || !mapGroup) return;
		d3.select(svgEl).on('.zoom', null);
		zoomBehavior = buildZoomBehavior();
		d3.select(svgEl).call(zoomBehavior as any);
		d3.select(svgEl).on('dblclick.zoom', resetZoom);
	}

	function resetZoom() {
		if (!svgEl || !zoomBehavior || !mapGroup) return;
		const vb = svgEl.viewBox.baseVal;
		const viewW = vb?.width || svgEl.clientWidth;
		const viewH = vb?.height || svgEl.clientHeight;
		const bbox = mapGroup.getBBox();
		const sx = viewW / (bbox.width || viewW);
		const sy = viewH / (bbox.height || viewH);
		const s = Math.min(1, Math.max(0.4, Math.min(sx, sy)));
		const tx = (viewW - (bbox.x + bbox.width) * s + -bbox.x * s) / 2;
		const ty = (viewH - (bbox.y + bbox.height) * s + -bbox.y * s) / 2;
		currentTransform = d3.zoomIdentity.translate(tx, ty).scale(s);
		d3.select(svgEl)
			.transition()
			.duration(350)
			.call((zoomBehavior as any).transform, currentTransform);
	}

	function buildColorfulPalette() {
		if (!topoData || !topoObjectKey) {
			countryColorMap = new Array(countries.length).fill('#E6EEF8');
			return;
		}
		try {
			const geoms = topoData.objects[topoObjectKey].geometries;
			const neigh = neighbors(geoms);
			const palette = ['#FBF0E6', '#E7F5EF', '#E7F0FF', '#F4ECF8', '#FFF0F6', '#EBF9FF', '#FFF8E6', '#F3FBF3'];

			const assigned: string[] = new Array(geoms.length).fill('#E6EEF8');

			for (let i = 0; i < geoms.length; i++) {
				const used = new Set<string>();
				const nbs = neigh[i] || [];
				for (const nb of nbs) {
					if (assigned[nb]) used.add(assigned[nb]);
				}
				let pick = palette.find((c) => !used.has(c));
				if (!pick) pick = palette[i % palette.length];
				assigned[i] = pick;
			}

			countryColorMap = assigned.slice(0, countries.length);
		} catch (e) {
			console.error('Failed to build colorful palette', e);
			countryColorMap = new Array(countries.length).fill('#E6EEF8');
		}
	}
</script>

<div
	class={`bg-gradient-radial fixed inset-0 flex h-screen w-screen overflow-hidden font-sans ` +
		(currentTheme === 'dark'
			? 'from-slate-800 to-black text-white'
			: currentTheme === 'light'
				? 'from-slate-50 to-white text-slate-900'
				: 'from-sky-900 to-sky-800 text-white')}
	tabindex="-1"
>
	{#if selectedFeature}
		<InfoPanel
			{selectedInfo}
			{selectedName}
			loading={selectedLoading}
			{compact}
			{showSources}
			{activeTab}
			{leftWidth}
			{infoCache}
			onToggleSources={() => (showSources = !showSources)}
			onClose={closePanel}
			onChangeTab={(t) => (activeTab = t)}
		/>

		<div
			class="relative z-25 w-[5px] cursor-ew-resize overflow-visible bg-gradient-to-b from-cyan-400/30 to-sky-400/50 opacity-50 shadow-[0_0_10px] transition-all duration-300"
			on:pointerdown={handlePointerDown}
			role="separator"
			aria-orientation="vertical"
		>
			{#if dragging}
				<div
					class="pointer-events-none absolute top-0 bottom-0 z-30 w-[2px] border-l-2 border-dashed border-teal-300 bg-white/80"
					style="left: {tempLeftWidth - leftWidth}px; animation: dash 1s linear infinite;"
				></div>
			{/if}
		</div>
	{/if}

	<div
		class="relative flex-1 overflow-hidden"
		style="width: {selectedFeature ? `calc(100% - ${leftWidth + HANDLE_WIDTH}px)` : '100%'};"
	>
		{#if !selectedFeature}
			<MapSettings
				{settingsOpen}
				{currentProjection}
				{currentTheme}
				onProjectionChange={handleProjectionChange}
				onToggle={() => (settingsOpen = !settingsOpen)}
				onThemeChange={handleThemeChange}
			/>
			<svg
				viewBox={`0 0 ${outerWidth} ${outerHeight}`}
				preserveAspectRatio="xMidYMid meet"
				class="block h-full w-full transition-all duration-[800ms]"
				bind:this={svgEl}
			>
				{#if currentTheme === 'colorful' || currentTheme === 'light'}
					<rect x="0" y="0" width={outerWidth} height={outerHeight} fill="oklch(82.8% 0.111 230.318)" opacity="0.75"
					></rect>
				{/if}

				<g bind:this={mapGroup} style="will-change: transform;">
					{#if countries.length && pathGenerator}
						{#each countries as c, i (getCountryName(c))}
							{#if currentTheme === 'colorful'}
								<path
									d={pathGenerator(c as any)}
									style={`fill: ${countryColorMap[i] ?? '#E6EEF8'}; stroke: #000; stroke-width: 1.2; stroke-linejoin: round;`}
									on:click={() => onCountryClick(c)}
									on:keydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											onCountryClick(c);
										}
									}}
									tabindex="0"
									role="button"
									aria-label={getCountryName(c)}
									class="cursor-pointer transition-all duration-150"
								/>
							{:else if currentTheme === 'light'}
								<path
									d={pathGenerator(c as any)}
									style="fill: #E6EEF8; stroke: #000; stroke-width: 1.0; stroke-linejoin: round;"
									on:click={() => onCountryClick(c)}
									on:keydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											onCountryClick(c);
										}
									}}
									tabindex="0"
									role="button"
									aria-label={getCountryName(c)}
									class="cursor-pointer transition-all duration-150"
								/>
							{:else}
								<path
									d={pathGenerator(c as any)}
									class="cursor-pointer fill-white/[0.08] stroke-white/40 stroke-[0.5px] drop-shadow-[0_0_2px_rgba(255,255,255,0.2)] transition-all duration-300 will-change-transform hover:fill-white/20 hover:stroke-white/80 hover:stroke-[1.5px] hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]"
									on:click={() => onCountryClick(c)}
									on:keydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											onCountryClick(c);
										}
									}}
									tabindex="0"
									role="button"
									aria-label={getCountryName(c)}
								/>
							{/if}
						{/each}
					{/if}
				</g>
			</svg>

			<div
				class="absolute bottom-5 left-5 z-50 rounded-md border border-white/10 bg-gradient-to-br from-gray-900/80 to-black/90 px-3 py-2 text-xs text-white/60 backdrop-blur-[10px]"
			>
				Click on any country to zoom in and view details
			</div>
		{:else}
			<svg
				viewBox={`0 0 ${rightWidth} ${rightHeight}`}
				preserveAspectRatio="xMidYMid meet"
				class="block h-full w-full transition-all duration-[800ms]"
				bind:this={svgEl}
			>
				{#if currentTheme === 'colorful' || currentTheme === 'light'}
					<rect x="0" y="0" width={outerWidth} height={outerHeight} fill="oklch(74.6% 0.16 232.661)" opacity="0.2"
					></rect>
				{/if}

				<g bind:this={mapGroup} style="will-change: transform;">
					{#if countries.length && focusPathGenerator}
						{#each countries as c, i (getCountryName(c))}
							{#if c !== selectedFeature}
								{#if currentTheme === 'colorful'}
									<path
										d={focusPathGenerator(c as any)}
										style={`fill: ${countryColorMap[i] ?? '#E6EEF8'}; stroke: #000; stroke-width: 1.0; stroke-linejoin: round;`}
										on:click={() => onCountryClick(c)}
										on:keydown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault();
												onCountryClick(c);
											}
										}}
										tabindex="0"
										role="button"
										aria-label={getCountryName(c)}
										class="cursor-pointer transition-all duration-150"
									/>
								{:else if currentTheme === 'light'}
									<path
										d={focusPathGenerator(c as any)}
										style="fill: #E6EEF8; stroke: #000; stroke-width: 0.8; stroke-linejoin: round;"
										on:click={() => onCountryClick(c)}
										on:keydown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault();
												onCountryClick(c);
											}
										}}
										tabindex="0"
										role="button"
										aria-label={getCountryName(c)}
										class="cursor-pointer transition-all duration-150"
									/>
								{:else}
									<path
										d={focusPathGenerator(c as any)}
										class="cursor-pointer fill-white/[0.02] stroke-white/15 stroke-[0.3px] will-change-transform"
										on:click={() => onCountryClick(c)}
										on:keydown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault();
												onCountryClick(c);
											}
										}}
										tabindex="0"
										role="button"
										aria-label={getCountryName(c)}
									/>
								{/if}
							{/if}
						{/each}

						{#if selectedFeature}
							{#key getCountryIndex(selectedFeature)}
								{@const idx = getCountryIndex(selectedFeature)}
								{#if idx >= 0}
									{#if currentTheme === 'colorful'}
										<path
											d={focusPathGenerator(selectedFeature as any)}
											style={`fill: ${countryColorMap[idx] ?? '#E6EEF8'}; stroke: #000; stroke-width: 1.8; stroke-linejoin: round; filter: drop-shadow(0 0 8px rgba(0,0,0,0.28));`}
											on:click={() => selectedFeature && onCountryClick(selectedFeature)}
											on:keydown={(e) => {
												if (e.key === 'Enter' || e.key === ' ') {
													e.preventDefault();
													selectedFeature && onCountryClick(selectedFeature);
												}
											}}
											tabindex="0"
											role="button"
											aria-label={getCountryName(selectedFeature)}
											class="cursor-pointer transition-all duration-150"
										/>
									{:else if currentTheme === 'light'}
										<path
											d={focusPathGenerator(selectedFeature as any)}
											style="fill: #DCEAF6; stroke: #000; stroke-width: 1.8; stroke-linejoin: round; filter: drop-shadow(0 0 6px rgba(0,0,0,0.18));"
											on:click={() => selectedFeature && onCountryClick(selectedFeature)}
											on:keydown={(e) => {
												if (e.key === 'Enter' || e.key === ' ') {
													e.preventDefault();
													selectedFeature && onCountryClick(selectedFeature);
												}
											}}
											tabindex="0"
											role="button"
											aria-label={getCountryName(selectedFeature)}
											class="cursor-pointer transition-all duration-150"
										/>
									{:else}
										<path
											d={focusPathGenerator(selectedFeature as any)}
											class="animate-pulse fill-darkCyan stroke-cyan-400/95 stroke-[3px] drop-shadow-[0_0_20px_rgba(0,255,255,0.6)]"
										/>
									{/if}
								{:else}
									<path
										d={focusPathGenerator(selectedFeature as any)}
										class="animate-pulse fill-darkCyan stroke-cyan-400/95 stroke-[3px] drop-shadow-[0_0_20px_rgba(0,255,255,0.6)]"
									/>
								{/if}
							{/key}
						{/if}
					{/if}
				</g>
			</svg>
		{/if}
	</div>
</div>

<style global>
	@keyframes dash {
		0% {
			border-left-color: rgba(0, 255, 255, 0.8);
		}
		50% {
			border-left-color: rgba(0, 255, 255, 0.4);
		}
		100% {
			border-left-color: rgba(0, 255, 255, 0.8);
		}
	}
</style>
