<script lang="ts">
	import { onMount, onDestroy, tick, untrack } from 'svelte';
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

	let pathCache = new Map<string, string>();
	let hoveredCountry: number | null = null;
	let zoomRAF: number | null = null;

	const projectionCache = new Map<string, () => d3.GeoProjection>();
	function getProjection(type: string): d3.GeoProjection {
		if (!projectionCache.has(type)) {
			projectionCache.set(type, () => {
				switch (type) {
					case 'mercator':
						return d3.geoMercator();
					case 'equalEarth':
						return d3.geoEqualEarth();
					case 'naturalEarth1':
					default:
						return d3.geoNaturalEarth1();
				}
			});
		}
		return projectionCache.get(type)!();
	}

	function handleProjectionChange(projection: string) {
		currentProjection = projection;
		pathCache.clear();
		handleResize();
		if (selectedFeature) setupFocusProjection();
		resetZoom();
		initZoom();
	}

	function handleThemeChange(theme: 'dark' | 'light' | 'colorful') {
		currentTheme = theme;
		if (theme === 'colorful' && topoData && topoObjectKey && countryColorMap.length === 0) {
			buildColorfulPalette();
		}
	}

	let resizeRAF: number | null = null;
	function throttledResize() {
		if (resizeTimeout) clearTimeout(resizeTimeout);
		if (resizeRAF) cancelAnimationFrame(resizeRAF);

		resizeRAF = requestAnimationFrame(() => {
			resizeTimeout = window.setTimeout(handleResize, 100);
		});
	}

	onMount(async () => {
		initZoom();
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
			window.addEventListener('resize', throttledResize, { passive: true });
		} catch (error) {
			console.error('Error loading map data:', error);
		}
	});

	onDestroy(() => {
		window.removeEventListener('resize', throttledResize);
		if (resizeTimeout) clearTimeout(resizeTimeout);
		if (resizeRAF) cancelAnimationFrame(resizeRAF);
		if (animHandle != null) cancelAnimationFrame(animHandle);
		if (zoomRAF) cancelAnimationFrame(zoomRAF);
		if (svgEl && zoomBehavior) {
			d3.select(svgEl).on('.zoom', null);
			zoomBehavior = null;
		}
		document.body.style.userSelect = '';
		(document.body as any).style.webkitUserSelect = '';
		pathCache.clear();
		projectionCache.clear();
	});

	let dimensionsCache = { leftWidth: 0, rightWidth: 0, rightHeight: 0 };
	function handleResize() {
		outerWidth = window.innerWidth;
		outerHeight = window.innerHeight;
		const desired = Math.max(MIN_LEFT_PX, Math.min(MAX_LEFT_PX, Math.round(leftPct * outerWidth)));
		leftWidth = desired;
		const effectiveLeft = dragging ? Math.max(MIN_LEFT_PX, Math.min(MAX_LEFT_PX, tempLeftWidth || desired)) : leftWidth;
		rightWidth = selectedFeature ? Math.max(300, outerWidth - effectiveLeft - HANDLE_WIDTH) : outerWidth;
		rightHeight = outerHeight;
		dimensionsCache = { leftWidth, rightWidth, rightHeight };

		if (countries.length > 0) {
			const worldFeature: GeoJSON.FeatureCollection = {
				type: 'FeatureCollection',
				features: countries
			};
			projection = getProjection(currentProjection);
			projection.fitSize([outerWidth, outerHeight], worldFeature as any);
			pathGenerator = d3.geoPath().projection(projection as any);
			pathCache.clear();
			if (selectedFeature) setupFocusProjection();
		}
	}

	let lastFocusParams = { width: 0, height: 0, feature: null as GeoFeature | null };
	function setupFocusProjection() {
		if (!selectedFeature) return;

		const currentRightWidth = dragging ? Math.max(300, outerWidth - tempLeftWidth - HANDLE_WIDTH) : rightWidth;
		if (
			lastFocusParams.feature === selectedFeature &&
			Math.abs(lastFocusParams.width - currentRightWidth) < 10 &&
			Math.abs(lastFocusParams.height - rightHeight) < 10
		) {
			return;
		}

		lastFocusParams = { width: currentRightWidth, height: rightHeight, feature: selectedFeature };

		try {
			let proj = getProjection(currentProjection === 'orthographic' ? 'mercator' : currentProjection);
			const worldFeature: GeoJSON.FeatureCollection = {
				type: 'FeatureCollection',
				features: countries
			};
			proj.fitSize([currentRightWidth, rightHeight], worldFeature as any);
			const worldScale = proj.scale();

			const minDim = Math.min(Math.max(300, currentRightWidth), Math.max(300, rightHeight));
			const paddingPx = Math.max(20, Math.min(80, minDim * 0.06));
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

			const countryScale = proj.scale();
			if (countryScale < worldScale * 0.9) {
				proj.scale(worldScale * 0.9);
				const bounds = d3
					.geoPath()
					.projection(proj)
					.bounds(selectedFeature as any);
				const dx = (bounds[0][0] + bounds[1][0]) / 2;
				const dy = (bounds[0][1] + bounds[1][1]) / 2;
				const x = currentRightWidth / 2 - dx;
				const y = rightHeight / 2 - dy;
				proj.translate([x, y]);
			}

			focusProjection = proj;
			focusPathGenerator = d3.geoPath().projection(focusProjection as any);
			pathCache.clear();
		} catch (error) {
			const fallback = d3.geoMercator();
			fallback.fitSize(
				[Math.max(100, currentRightWidth * 0.8), Math.max(100, rightHeight * 0.8)],
				selectedFeature as any
			);
			focusProjection = fallback;
			focusPathGenerator = d3.geoPath().projection(focusProjection as any);
		}
	}

	const countryNameCache = new WeakMap<GeoFeature, string>();
	function getCountryName(f: GeoFeature): string {
		if (!countryNameCache.has(f)) {
			countryNameCache.set(f, f.properties?.name ?? 'Unknown Country');
		}
		return countryNameCache.get(f)!;
	}
	const countryIndexCache = new WeakMap<GeoFeature, number>();

	function getCountryIndex(f: GeoFeature) {
		if (countryIndexCache.has(f)) {
			return countryIndexCache.get(f)!;
		}

		for (let i = 0; i < countries.length; i++) {
			if (countries[i] === f) {
				countryIndexCache.set(f, i);
				return i;
			}
			if (
				countries[i]?.properties?.iso_a3 &&
				f?.properties?.iso_a3 &&
				countries[i].properties.iso_a3 === f.properties.iso_a3
			) {
				countryIndexCache.set(f, i);
				return i;
			}
			if (countries[i]?.properties?.name && f?.properties?.name && countries[i].properties.name === f.properties.name) {
				countryIndexCache.set(f, i);
				return i;
			}
		}
		return -1;
	}

	function getPath(country: GeoFeature, generator: d3.GeoPath<any, GeoFeature>, index: number): string {
		const key = `${index}-${generator === pathGenerator ? 'main' : 'focus'}`;
		if (!pathCache.has(key)) {
			pathCache.set(key, generator(country as any) || '');
		}
		return pathCache.get(key)!;
	}

	function handleMapClick(e: MouseEvent) {
		if (isAnimating || !e.target || !(e.target instanceof SVGPathElement)) return;
		const index = parseInt(e.target.dataset.index || '-1');
		if (index >= 0 && index < countries.length) {
			onCountryClick(countries[index]);
		}
	}

	function handleMapKeydown(e: KeyboardEvent) {
		if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof SVGPathElement) {
			e.preventDefault();
			const index = parseInt(e.target.dataset.index || '-1');
			if (index >= 0 && index < countries.length) {
				onCountryClick(countries[index]);
			}
		}
	}

	function handleMapHover(e: PointerEvent) {
		const target = e.target as Element | null;
		if (target instanceof SVGPathElement) {
			const index = parseInt(target.dataset.index || '-1');
			hoveredCountry = index >= 0 ? index : null;
		} else {
			hoveredCountry = null;
		}
	}

	async function onCountryClick(f: GeoFeature) {
		if (!f || isAnimating) return;
		selectedFeature = f;
		selectedName = getCountryName(f);
		setupFocusProjection();
		handleResize();
		fetchCountryInfoByName(selectedName, infoCache).then((result) => {
			if (result) infoCache = result;
		});

		isAnimating = true;
		setTimeout(() => {
			isAnimating = false;
		}, 400);
	}

	async function closePanel() {
		selectedFeature = null;
		selectedName = null;
		focusProjection = undefined;
		focusPathGenerator = null;
		pathCache.clear();
		lastFocusParams = { width: 0, height: 0, feature: null };

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

		window.addEventListener('pointermove', handlePointerMove, { passive: true });
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

				if (zoomRAF) cancelAnimationFrame(zoomRAF);

				zoomRAF = requestAnimationFrame(() => {
					const t = event.transform;
					currentTransform = t;
					const k = t.k;
					let tx = t.x,
						ty = t.y;
					if (mapGroup) {
						const bbox = mapGroup.getBBox();
						const vb = svgEl!.viewBox.baseVal;
						const viewW = vb?.width || svgEl!.clientWidth;
						const viewH = vb?.height || svgEl!.clientHeight;
						const txMin = viewW - (bbox.x + bbox.width) * k;
						const txMax = -bbox.x * k;
						const tyMin = viewH - (bbox.y + bbox.height) * k;
						const tyMax = -bbox.y * k;
						tx = txMin > txMax ? (txMin + txMax) / 2 : Math.min(Math.max(tx, txMin), txMax);
						ty = tyMin > tyMax ? (tyMin + tyMax) / 2 : Math.min(Math.max(ty, tyMin), tyMax);
					}

					mapGroup!.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale3d(${k}, ${k}, 1)`;
				});
			})
			.on('end', () => {
				isZooming = false;
				if (zoomRAF) {
					cancelAnimationFrame(zoomRAF);
					zoomRAF = null;
				}
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
			countryColorMap = new Array(countries.length).fill('#D0DCE8');
			return;
		}

		if (countryColorMap.length === countries.length && countryColorMap.some((c) => c !== '#D0DCE8')) {
			return;
		}

		try {
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
		} catch (e) {
			console.error('Failed to build colorful palette', e);
			countryColorMap = new Array(countries.length).fill('#D0DCE8');
		}
	}

	function toggleSettings() {
		settingsOpen = !settingsOpen;
	}

	function hoverReset() {
		hoveredCountry = null;
	}
</script>

<div
	class={`bg-gradient-radial fixed inset-0 flex h-screen w-screen overflow-hidden font-sans ` +
		(currentTheme === 'dark'
			? 'from-slate-800 to-black text-white'
			: currentTheme === 'light'
				? 'from-slate-50 to-white text-slate-900'
				: 'from-sky-900 to-sky-800 text-white')}
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
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		{#if !selectedFeature}
			<MapSettings
				{settingsOpen}
				{currentProjection}
				{currentTheme}
				onProjectionChange={handleProjectionChange}
				onToggle={toggleSettings}
				onThemeChange={handleThemeChange}
			/>
			<svg
				viewBox={`0 0 ${outerWidth} ${outerHeight}`}
				preserveAspectRatio="xMidYMid meet"
				class="block h-full w-full"
				bind:this={svgEl}
				on:click={handleMapClick}
				on:keydown={handleMapKeydown}
				on:pointerover={handleMapHover}
				on:focus={hoverReset}
				on:mouseleave={hoverReset}
				style="contain: paint layout;"
			>
				{#if currentTheme === 'colorful' || currentTheme === 'light'}
					<defs>
						<linearGradient id="waterBase" x1="0%" y1="0%" x2="0%" y2="100%">
							{#if currentTheme === 'colorful'}
								<stop offset="0%" stop-color="oklch(84% 0.12 235)" />
								<stop offset="50%" stop-color="oklch(81% 0.115 232)" />
								<stop offset="100%" stop-color="oklch(77% 0.11 228)" />
							{:else}
								<stop offset="0%" stop-color="oklch(87% 0.08 235)" />
								<stop offset="50%" stop-color="oklch(84% 0.09 232)" />
								<stop offset="100%" stop-color="oklch(80% 0.10 230)" />
							{/if}
						</linearGradient>
					</defs>
					<rect x="0" y="0" width="100%" height="100%" fill={'url(#waterBase)'}></rect>
				{/if}

				<g bind:this={mapGroup} style="will-change: transform; transform-origin: 0 0;">
					{#if countries.length && pathGenerator}
						{#each countries as c, i (i)}
							{#if currentTheme === 'colorful'}
								<path
									d={getPath(c, pathGenerator, i)}
									data-index={i}
									style={`fill: ${countryColorMap[i] ?? '#E6EEF8'}; stroke: #000; stroke-width: ${hoveredCountry === i ? 2 : 1.2}; stroke-linejoin: round; opacity: ${hoveredCountry === i ? 0.9 : 1};`}
									role="button"
									aria-label={getCountryName(c)}
									class="cursor-pointer"
								/>
							{:else if currentTheme === 'light'}
								<path
									d={getPath(c, pathGenerator, i)}
									data-index={i}
									style={`fill: #E6EEF8; stroke: #000; stroke-width: ${hoveredCountry === i ? 2 : 1}; stroke-linejoin: round; opacity: ${hoveredCountry === i ? 0.9 : 1};`}
									role="button"
									aria-label={getCountryName(c)}
									class="cursor-pointer"
								/>
							{:else}
								<path
									d={getPath(c, pathGenerator, i)}
									data-index={i}
									class="cursor-pointer stroke-white/40"
									style={`fill: ${hoveredCountry === i ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)'}; stroke-width: 0.5px;`}
									role="button"
									aria-label={getCountryName(c)}
								/>
							{/if}
						{/each}
					{/if}
				</g>
			</svg>
		{:else}
			<svg
				viewBox={`0 0 ${rightWidth} ${rightHeight}`}
				preserveAspectRatio="xMidYMid meet"
				class="block h-full w-full"
				bind:this={svgEl}
				on:click={handleMapClick}
				on:keydown={handleMapKeydown}
				on:pointerover={handleMapHover}
				on:focus={hoverReset}
				on:mouseleave={hoverReset}
				style="contain: paint layout;"
			>
				{#if currentTheme === 'colorful' || currentTheme === 'light'}
					<rect x="0" y="0" width={rightWidth} height={rightHeight} fill="oklch(74.6% 0.16 232.661)" opacity="0.2"
					></rect>
				{/if}

				<g bind:this={mapGroup} style="will-change: transform; transform-origin: 0 0;">
					{#if countries.length && focusPathGenerator}
						{#each countries as c, i (i)}
							{#if c !== selectedFeature}
								{#if currentTheme === 'colorful'}
									<path
										d={getPath(c, focusPathGenerator, i)}
										data-index={i}
										style={`fill: ${countryColorMap[i] ?? '#E6EEF8'}; stroke: #000; stroke-width: ${hoveredCountry === i ? 1.5 : 1}; stroke-linejoin: round; opacity: ${hoveredCountry === i ? 0.9 : 1};`}
										role="button"
										aria-label={getCountryName(c)}
										class="cursor-pointer"
									/>
								{:else if currentTheme === 'light'}
									<path
										d={getPath(c, focusPathGenerator, i)}
										data-index={i}
										style={`fill: #E6EEF8; stroke: #000; stroke-width: ${hoveredCountry === i ? 1.5 : 0.8}; stroke-linejoin: round; opacity: ${hoveredCountry === i ? 0.9 : 1};`}
										role="button"
										aria-label={getCountryName(c)}
										class="cursor-pointer"
									/>
								{:else}
									<path
										d={getPath(c, focusPathGenerator, i)}
										data-index={i}
										class="cursor-pointer stroke-white/50"
										style={`fill: rgba(255,255,255,0.02); stroke-width: 0.3px;`}
										role="button"
										aria-label={getCountryName(c)}
									/>
								{/if}
							{/if}
						{/each}

						{#if selectedFeature}
							{@const idx = getCountryIndex(selectedFeature)}
							{#if idx >= 0}
								{#if currentTheme === 'colorful'}
									<path
										d={getPath(selectedFeature, focusPathGenerator, idx)}
										data-index={idx}
										style={`fill: ${countryColorMap[idx] ?? '#E6EEF8'}; stroke: #000; stroke-width: 1.8; stroke-linejoin: round; opacity: 0.95;`}
										role="button"
										aria-label={getCountryName(selectedFeature)}
										class="cursor-pointer"
									/>
								{:else if currentTheme === 'light'}
									<path
										d={getPath(selectedFeature, focusPathGenerator, idx)}
										data-index={idx}
										style="fill: #DCEAF6; stroke: #000; stroke-width: 1.8; stroke-linejoin: round;"
										role="button"
										aria-label={getCountryName(selectedFeature)}
										class="cursor-pointer"
									/>
								{:else}
									<path
										d={getPath(selectedFeature, focusPathGenerator, idx)}
										class="animate-pulse fill-darkCyan stroke-cyan-400/95 stroke-[3px]"
									/>
								{/if}
							{:else}
								<path
									d={getPath(selectedFeature, focusPathGenerator, -1)}
									class="animate-pulse fill-darkCyan stroke-cyan-400/95 stroke-[3px]"
								/>
							{/if}
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

	svg {
		-webkit-transform: translateZ(0);
		transform: translateZ(0);
	}

	svg g {
		-webkit-backface-visibility: hidden;
		backface-visibility: hidden;
	}

	svg path {
		vector-effect: non-scaling-stroke;
		will-change: transform, opacity;
		transition: none;
	}
</style>
