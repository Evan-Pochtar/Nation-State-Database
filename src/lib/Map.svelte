<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { feature, neighbors } from 'topojson-client';
	import * as d3 from 'd3';
	import { fetchCountryInfoByName, batchLoadCountryData, getLoadProgress } from '$lib/utils/getInfo';
	import InfoPanel from '$lib/InfoPanel.svelte';
	import MapSettings from '$lib/components/MapSettings.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ChloroplethLegend from '$lib/components/chloropleth/ChloroplethLegend.svelte';
	import DataLoadingIndicator from '$lib/components/chloropleth/DataLoadingIndicator.svelte';
	import ChloroplethTooltip from '$lib/components/chloropleth/ChloroplethTooltip.svelte';
	import { LAYOUT, ANIMATION_DELAYS, TIMEOUTS } from '$lib/utils/constants';
	import type { GeoFeature, ChloroplethData, DataType, InfoCache, ThemeType, ProjectionType } from '$lib/utils/types';
	import {
		buildChloroplethData,
		getChloroplethColor,
		getGDPPerCapita,
		getGDP,
		getGini
	} from '$lib/utils/chloroplethUtils';

	// === STATE MANAGEMENT ===
	let countries: GeoFeature[] = $state([]);
	let selectedFeature: GeoFeature | null = $state(null);
	let selectedName: string | null = $state(null);
	let activeTab: string = $state('overview');
	let currentProjection: ProjectionType = $state('naturalEarth1');
	let settingsOpen = $state(false);

	// Resizing state
	let leftPct = 0.36;
	let leftWidth = $state(0);
	let tempLeftWidth = $state(0);
	const { MIN_PCT, MAX_PCT, MIN_LEFT_WIDTH, MAX_LEFT_WIDTH, COMPACT_THRESHOLD, HANDLE_WIDTH } = LAYOUT;
	let dragging = $state(false);
	let outerWidth = $state(1600);
	let outerHeight = $state(900);

	// D3 projection
	let projection: d3.GeoProjection;
	let pathGenerator: d3.GeoPath<any, GeoFeature> = $state(d3.geoPath<any, GeoFeature>());

	// Cache
	let infoCache: InfoCache = $state({});
	let countryNameCache = new WeakMap<GeoFeature, string>();
	let pathStrings: string[] = $state([]);

	// SVG refs & SVG Zoom
	let svgEl: SVGSVGElement | null = $state(null);
	let mapGroup: SVGGElement | null = $state(null);
	let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;

	// UI state
	let hoveredCountry: number | null = $state(null);
	let showSources = $state(false);
	let copyLinkSuccess = $state(false);
	let copyLinkTimeout: number | null = null;
	let currentTheme: ThemeType = $state('dark');
	let chloroplethData: ChloroplethData | null = $state(null);
	let showLegend = $state(false);
	let dataLoading = $state(false);
	let dataLoadProgress = $state({ loaded: 0, total: 0, percentage: 0 });
	let isAnimating = false;

	// Tooltip
	let tooltipVisible = $state(false);
	let tooltipCountry = $state('');
	let tooltipValue: number | null = $state(null);
	let tooltipX = $state(0);
	let tooltipY = $state(0);

	// Topology data
	let topoData: any = null;
	let topoObjectKey: string | null = null;
	let countryColorMap: string[] = [];

	// === DERIVED VALUES ===
	const isChloroplethTheme = $derived(['gini', 'gdp', 'gdpPerCapita'].includes(currentTheme));
	const compact = $derived(leftWidth <= COMPACT_THRESHOLD);
	const selectedLoading = $derived(selectedName ? (infoCache[selectedName]?.loading ?? false) : false);
	const selectedInfo = $derived(selectedName ? (infoCache[selectedName]?.data ?? null) : null);

	// === HELPER FUNCTIONS ===
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

	function getCountryName(f: GeoFeature): string {
		if (!countryNameCache.has(f)) {
			countryNameCache.set(f, f.properties?.name ?? 'Unknown Country');
		}
		return countryNameCache.get(f)!;
	}

	function getCountryStroke(isSelected: boolean, isHovered: boolean): { color: string; width: number } {
		if (isChloroplethTheme) {
			return {
				color: isSelected ? '#fbbf24' : isHovered ? '#fff' : '#1e293b',
				width: isSelected ? 2.5 : isHovered ? 1.8 : 0.8
			};
		}
		if (currentTheme === 'dark') {
			return {
				color: isSelected ? 'rgba(34, 211, 238, 0.9)' : isHovered ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.4)',
				width: isSelected ? 2 : isHovered ? 1 : 0.5
			};
		} else if (currentTheme === 'colorful') {
			return { color: '#000', width: isHovered ? 2 : 1.2 };
		} else {
			return { color: '#000', width: isHovered ? 2 : 1 };
		}
	}

	function getCountryFillColor(index: number, isSelected: boolean = false, isHovered: boolean = false): string {
		if (isChloroplethTheme && chloroplethData) {
			return getChloroplethColor(index, chloroplethData, '#475569');
		}
		if (currentTheme === 'colorful') {
			return countryColorMap[index] ?? '#E6EEF8';
		} else if (currentTheme === 'light') {
			return isSelected ? '#DCEAF6' : '#E6EEF8';
		} else {
			if (isSelected) {
				return 'rgba(34, 211, 238, 0.25)';
			}
			return isHovered ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)';
		}
	}

	function buildColorfulPalette() {
		if (!topoData || !topoObjectKey) {
			countryColorMap = new Array(countries.length).fill('#D0DCE8');
			return;
		}
		if (countryColorMap.length === countries.length && countryColorMap.some((c) => c !== '#D0DCE8')) {
			return;
		}
		const geoms = topoData.objects[topoObjectKey].geometries;
		const neigh = neighbors(geoms);
		const palette = ['#E8D4C0', '#C8E6D7', '#C8DEFF', '#E0D4E8', '#FFD8EA', '#D0F0FF', '#FFE8C0', '#D8F0D8'];
		const assigned: string[] = new Array(geoms.length).fill('#D0DCE8');
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
	}

	// === RESIZE HANDLING ===
	function handleResize() {
		outerWidth = window.innerWidth;
		outerHeight = window.innerHeight;

		const desired = Math.max(MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, Math.round(leftPct * outerWidth)));
		leftWidth = desired;

		if (countries.length > 0) {
			const worldFeature: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: countries };
			projection = getProjection(currentProjection);
			projection.fitSize([outerWidth, outerHeight], worldFeature as any);
			pathGenerator = d3.geoPath().projection(projection as any);

			if (pathStrings.length === 0) {
				pathStrings = countries.map((c) => {
					try {
						return pathGenerator(c as any) || '';
					} catch (e) {
						return '';
					}
				});
			}
		}
	}

	// === INTERACTION HANDLERS ===
	async function onCountryClick(f: GeoFeature, index: number) {
		if (!f || isAnimating || !svgEl || !zoomBehavior) return;

		isAnimating = true;
		selectedName = getCountryName(f);
		selectedFeature = f;

		if (!infoCache[selectedName]?.data) {
			fetchCountryInfoByName(selectedName, infoCache).then((cache) => {
				infoCache = cache || infoCache;
			});
		}

		const bounds = pathGenerator.bounds(f as any);
		const dx = bounds[1][0] - bounds[0][0];
		const dy = bounds[1][1] - bounds[0][1];
		const x = (bounds[0][0] + bounds[1][0]) / 2;
		const y = (bounds[0][1] + bounds[1][1]) / 2;

		const scale = Math.min(8, 0.9 / Math.max(dx / outerWidth, dy / outerHeight));
		const translate: [number, number] = [outerWidth / 2 - scale * x, outerHeight / 2 - scale * y];

		d3.select(svgEl)
			.transition()
			.duration(ANIMATION_DELAYS.ZOOM)
			.call(zoomBehavior.transform as any, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale))
			.on('end', () => {
				isAnimating = false;
			});
	}

	async function closePanel() {
		selectedFeature = null;
		selectedName = null;
		updateURL(null);

		resetZoom();
	}

	function handleMapClick(e: MouseEvent) {
		if (isAnimating || !e.target || !(e.target instanceof SVGPathElement)) return;
		const index = parseInt(e.target.dataset.index || '-1');
		if (index >= 0 && index < countries.length) {
			onCountryClick(countries[index], index);
		}
	}

	function handleMapKeydown(e: KeyboardEvent) {
		if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof SVGPathElement) {
			e.preventDefault();
			const index = parseInt(e.target.dataset.index || '-1');
			if (index >= 0 && index < countries.length) {
				onCountryClick(countries[index], index);
			}
		}
	}

	function handleMapHover(e: PointerEvent) {
		const target = e.target as Element | null;
		if (target instanceof SVGPathElement) {
			const index = parseInt(target.dataset.index || '-1');
			hoveredCountry = index >= 0 ? index : null;

			if (isChloroplethTheme && hoveredCountry !== null && hoveredCountry >= 0) {
				const country = countries[hoveredCountry];
				const name = getCountryName(country);
				const cachedData = infoCache[name]?.data;

				if (cachedData) {
					tooltipCountry = name;
					tooltipX = e.clientX;
					tooltipY = e.clientY;

					switch (currentTheme) {
						case 'gini':
							tooltipValue = getGini(cachedData);
							break;
						case 'gdpPerCapita':
							tooltipValue = getGDPPerCapita(cachedData);
							break;
						case 'gdp':
							tooltipValue = getGDP(cachedData);
							break;
						default:
							tooltipValue = null;
					}
					tooltipVisible = true;
				} else {
					tooltipVisible = false;
				}
			} else {
				tooltipVisible = false;
			}
		} else {
			hoveredCountry = null;
			tooltipVisible = false;
		}
	}

	function handleMouseMove(e: MouseEvent) {
		if (tooltipVisible && isChloroplethTheme) {
			tooltipX = e.clientX;
			tooltipY = e.clientY;
		}
	}

	function hoverReset() {
		hoveredCountry = null;
		tooltipVisible = false;
	}

	// === DRAG HANDLERS ===
	function handlePointerDown() {
		if (!selectedFeature) return;
		dragging = true;
		tempLeftWidth = leftWidth;
		document.body.style.userSelect = 'none';

		window.addEventListener('pointermove', handlePointerMove, { passive: true });
		window.addEventListener('pointerup', handlePointerUp, { once: true });
		window.addEventListener('pointercancel', handlePointerUp, { once: true });
	}

	function handlePointerMove(e: PointerEvent) {
		if (!dragging) return;
		const pct = Math.max(MIN_PCT, Math.min(MAX_PCT, e.clientX / outerWidth));
		tempLeftWidth = Math.round(pct * outerWidth);
	}

	function handlePointerUp() {
		if (!dragging) return;
		dragging = false;
		leftPct = tempLeftWidth / outerWidth;
		leftWidth = tempLeftWidth;
		handleResize();
		document.body.style.userSelect = '';
		window.removeEventListener('pointermove', handlePointerMove);
	}

	// === ZOOM ===
	function buildZoomBehavior() {
		return d3
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent([1, 20])
			.translateExtent([
				[0, 0],
				[outerWidth, outerHeight]
			])
			.extent([
				[0, 0],
				[outerWidth, outerHeight]
			])
			.on('zoom', (event: any) => {
				if (!mapGroup) return;
				const t = event.transform;
				mapGroup.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`;
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
		if (!svgEl || !zoomBehavior) return;
		d3.select(svgEl)
			.transition()
			.duration(ANIMATION_DELAYS.RESET_ZOOM)
			.call((zoomBehavior as any).transform, d3.zoomIdentity);
	}

	// === SETTINGS ===
	function handleProjectionChange(projection: ProjectionType) {
		currentProjection = projection;
		pathStrings = [];
		handleResize();
		resetZoom();
		initZoom();
	}

	function handleThemeChange(theme: 'dark' | 'light' | 'colorful' | 'gini' | 'gdp' | 'gdpPerCapita') {
		currentTheme = theme;
		if (theme === 'colorful' && topoData && topoObjectKey && countryColorMap.length === 0) {
			buildColorfulPalette();
		}
	}

	function toggleSettings() {
		settingsOpen = !settingsOpen;
	}

	// === URL & COPY ===
	function updateURL(countryName: string | null) {
		if (countryName) {
			goto(`/${encodeURIComponent(countryName)}`, { replaceState: false, noScroll: true, keepFocus: true });
		} else {
			goto('/', { replaceState: false, noScroll: true, keepFocus: true });
		}
	}

	function handleCopyLink() {
		if (!selectedName) return;
		const url = `${window.location.origin}/${encodeURIComponent(selectedName)}`;
		navigator.clipboard.writeText(url).then(() => {
			copyLinkSuccess = true;
			if (copyLinkTimeout) clearTimeout(copyLinkTimeout);
			copyLinkTimeout = window.setTimeout(() => {
				copyLinkSuccess = false;
			}, TIMEOUTS.COPY_LINK_SUCCESS);
		});
	}

	// === EFFECTS ===
	$effect(() => {
		if (isChloroplethTheme && countries.length > 0) {
			const progress = getLoadProgress(countries, infoCache);
			dataLoadProgress = progress;
			if (progress.percentage >= 50 || Object.keys(infoCache).length > countries.length * 0.5) {
				chloroplethData = buildChloroplethData(countries, infoCache, currentTheme as DataType);
				showLegend = true;
				dataLoading = false;
			} else if (!dataLoading) {
				dataLoading = true;
				batchLoadCountryData(countries, infoCache).then((newCache) => {
					infoCache = newCache;
					dataLoading = false;
				});
			}
		} else {
			chloroplethData = null;
			showLegend = false;
		}
	});

	// === LIFECYCLE ===
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

			handleResize();
			initZoom();

			const urlCountry = page.params.country || page.url.pathname.split('/')[1];
			if (urlCountry) {
				const decodedCountry = decodeURIComponent(urlCountry);
				const matchingCountry = countries.find((c) => getCountryName(c).toLowerCase() === decodedCountry.toLowerCase());
				if (matchingCountry) {
					await tick();
					const index = countries.indexOf(matchingCountry);
					onCountryClick(matchingCountry, index);
				}
			}
		} catch (error) {
			console.error('Error loading map data:', error);
		}
	});

	onDestroy(() => {
		if (copyLinkTimeout) clearTimeout(copyLinkTimeout);
		if (svgEl && zoomBehavior) {
			d3.select(svgEl).on('.zoom', null);
			zoomBehavior = null;
		}
		document.body.style.userSelect = '';

		countryNameCache = new WeakMap();
		pathStrings = [];
		infoCache = {};
	});
</script>

<svelte:window on:resize={handleResize} />

<div
	class={`bg-gradient-radial fixed inset-0 flex h-screen w-screen overflow-hidden font-sans ` +
		(currentTheme === 'dark'
			? 'from-slate-800 to-black text-white'
			: currentTheme === 'light'
				? 'from-slate-50 to-white text-slate-900'
				: 'from-sky-900 to-sky-800 text-white')}
	onmousemove={handleMouseMove}
	role="application"
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
			{copyLinkSuccess}
			onToggleSources={() => (showSources = !showSources)}
			onClose={closePanel}
			onChangeTab={(t) => (activeTab = t)}
			onCopyLink={handleCopyLink}
		/>

		<div
			class="relative z-25 w-[5px] cursor-ew-resize bg-gradient-to-b from-cyan-400/30 to-sky-400/50 opacity-50 transition-opacity duration-300"
			onpointerdown={handlePointerDown}
			role="separator"
			aria-orientation="vertical"
		>
			{#if dragging}
				<div
					class="pointer-events-none absolute inset-y-0 w-0.5 border-l-2 border-dashed border-teal-300 bg-white/80"
					style="left: {tempLeftWidth - leftWidth}px;"
				></div>
			{/if}
		</div>
	{/if}

	<div
		class="relative flex-1 overflow-hidden"
		style="width: {selectedFeature
			? `calc(100% - ${leftWidth + HANDLE_WIDTH}px)`
			: '100%'}; transition: width 150ms ease-out;"
	>
		{#if !selectedFeature}
			<MapSettings
				{settingsOpen}
				{currentProjection}
				{currentTheme}
				onProjectionChange={handleProjectionChange}
				onToggle={toggleSettings}
				onThemeChange={handleThemeChange}
			/>
			<DataLoadingIndicator
				visible={dataLoading && isChloroplethTheme}
				loaded={dataLoadProgress.loaded}
				total={dataLoadProgress.total}
				percentage={dataLoadProgress.percentage}
			/>
			<ChloroplethLegend
				{chloroplethData}
				dataType={currentTheme as DataType}
				visible={showLegend && isChloroplethTheme && !selectedFeature}
			/>
			<ChloroplethTooltip
				visible={tooltipVisible && isChloroplethTheme && !selectedFeature}
				countryName={tooltipCountry}
				value={tooltipValue}
				dataType={currentTheme as DataType}
				x={tooltipX}
				y={tooltipY}
			/>
			<div class="glass-panel-dark absolute bottom-5 left-5 z-50 px-3 py-2 text-xs text-white/60">
				Click on any country to zoom in and view details
			</div>
		{/if}

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<svg
			viewBox={`0 0 ${outerWidth} ${outerHeight}`}
			preserveAspectRatio="xMidYMid slice"
			class="block h-full w-full"
			bind:this={svgEl}
			onclick={handleMapClick}
			onkeydown={handleMapKeydown}
			onpointerover={handleMapHover}
			onfocus={hoverReset}
			onmouseleave={hoverReset}
		>
			<rect x="0" y="0" width={outerWidth} height={outerHeight}>
				{#if currentTheme === 'colorful' || currentTheme === 'light'}
					<animate attributeName="fill" values="oklch(77% 0.11 228)" dur="0.1s" fill="freeze" />
				{:else if isChloroplethTheme}
					<animate attributeName="fill" values="#0f172a" dur="0.1s" fill="freeze" />
				{:else}
					<animate attributeName="fill" values="transparent" dur="0.1s" fill="freeze" />
				{/if}
			</rect>

			<g bind:this={mapGroup}>
				{#if countries.length}
					{#each countries as c, i (getCountryName(c))}
						{@const isSelected = c === selectedFeature}
						{@const isHovered = hoveredCountry === i}
						{@const fillColor = getCountryFillColor(i, isSelected, isHovered)}
						{@const stroke = getCountryStroke(isSelected, isHovered)}

						<path
							d={pathStrings[i] || ''}
							data-index={i}
							fill={fillColor}
							stroke={stroke.color}
							stroke-width={stroke.width}
							stroke-linejoin="round"
							opacity={isHovered ? 0.9 : isSelected ? 0.95 : 1}
							role="button"
							aria-label={getCountryName(c)}
							class="cursor-pointer transition-opacity duration-200"
							class:animate-pulse={isSelected && !isChloroplethTheme}
							class:drop-shadow-[0_0_20px_rgba(251,191,36,0.6)]={isSelected && isChloroplethTheme}
						/>
					{/each}
				{/if}
			</g>
		</svg>
	</div>
</div>

<style global>
	@keyframes dash {
		0%,
		100% {
			border-left-color: rgba(0, 255, 255, 0.8);
		}
		50% {
			border-left-color: rgba(0, 255, 255, 0.4);
		}
	}

	svg g {
		transform-origin: 0 0;
	}

	svg path {
		vector-effect: non-scaling-stroke;
	}
</style>
