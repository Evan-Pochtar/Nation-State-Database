<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import * as d3 from 'd3';
	import { feature } from 'topojson-client';

	type GeoFeature = GeoJSON.Feature<GeoJSON.Geometry, Record<string, any>>;
	type CountryData = {
		capital: string;
		population: string;
		short: string;
		politics: string;
		economics: string;
	};

	let countries: GeoFeature[] = [];
	let selectedFeature: GeoFeature | null = null;
	let selectedName: string | null = null;

	let leftWidth = 360;
	let tempLeftWidth = 360;
	let dragging = false;

	const HANDLE_WIDTH = 6;

	let outerWidth = 1600;
	let outerHeight = 900;
	let rightWidth = outerWidth;
	let rightHeight = outerHeight;

	let projection: d3.GeoProjection;
	let pathGenerator: d3.GeoPath<any, GeoFeature>;

	let focusProjection: d3.GeoProjection | undefined;
	let focusPathGenerator: d3.GeoPath<any, GeoFeature> | null = null;

	let animHandle: number | null = null;
	let isAnimating = false;

	let now = new Date();
	let clockTimer: number;
	const CLOCK_TICK = 50;

	const countryInfoMapByName: Record<string, CountryData> = {};

	let infoCache: Record<string, { data?: CountryData; loading: boolean; error?: string }> = {};

	let svgEl: SVGSVGElement | null = null;
	let mapGroup: SVGGElement | null = null;
	let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;

	let resizeTimeout: number;
	let currentTransform = d3.zoomIdentity;
	let isZooming = false;

	function throttledResize() {
		if (resizeTimeout) clearTimeout(resizeTimeout);
		resizeTimeout = window.setTimeout(() => {
			handleResize();
		}, 100);
	}

	onMount(async () => {
		clockTimer = window.setInterval(() => (now = new Date()), CLOCK_TICK);

		try {
			const resp = await fetch('/data/countries-map.json');
			if (!resp.ok) {
				console.error('Failed to load topojson');
				return;
			}
			const topo = await resp.json();

			const objects = topo.objects;
			const objectKey = Object.keys(objects)[0];
			const geo = feature(topo as any, objects[objectKey]) as
				| GeoJSON.FeatureCollection
				| GeoJSON.Feature
				| null;

			if (geo && geo.type === 'FeatureCollection') {
				countries = geo.features as GeoFeature[];
			} else if (geo) {
				countries = [geo as GeoFeature];
			} else {
				countries = [];
			}

			console.log(`Loaded ${countries.length} countries`);

			handleResize();
			window.addEventListener('resize', throttledResize);
		} catch (error) {
			console.error('Error loading map data:', error);
		}
	});

	onDestroy(() => {
		window.removeEventListener('resize', throttledResize);
		if (resizeTimeout) clearTimeout(resizeTimeout);
		clearInterval(clockTimer);
		if (animHandle != null) cancelAnimationFrame(animHandle);
		if (svgEl && zoomBehavior) {
			d3.select(svgEl).on('.zoom', null);
			zoomBehavior = null;
		}
	});

	function handleResize() {
		outerWidth = window.innerWidth;
		outerHeight = window.innerHeight;

		rightWidth = selectedFeature
			? Math.max(400, outerWidth - leftWidth - HANDLE_WIDTH)
			: outerWidth;
		rightHeight = outerHeight;

		if (countries.length > 0) {
			const worldFeature: GeoJSON.FeatureCollection = {
				type: 'FeatureCollection',
				features: countries
			};

			projection = d3.geoNaturalEarth1();
			projection.fitSize([outerWidth, outerHeight], worldFeature as any);
			pathGenerator = d3.geoPath().projection(projection as any);

			if (selectedFeature) {
				setupFocusProjection();
			}
		}

		initZoom();
	}

	function setupFocusProjection() {
		if (!selectedFeature) return;

		try {
			const bounds = d3.geoBounds(selectedFeature as any);
			if (!bounds || bounds[0][0] === undefined || bounds[1][0] === undefined) {
				console.error('Invalid bounds for selected feature');
				return;
			}

			let proj: d3.GeoProjection;
			proj = d3.geoMercator();

			const currentRightWidth = dragging ? Math.max(300, outerWidth - tempLeftWidth - HANDLE_WIDTH) : rightWidth;
			const minDim = Math.min(Math.max(300, currentRightWidth), Math.max(300, rightHeight));
			const paddingPx = Math.max(20, Math.min(80, Math.round(minDim * 0.06)));

			const left = paddingPx;
			const top = paddingPx;
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

			console.log('Focus projection setup complete for', getCountryName(selectedFeature));
		} catch (error) {
			console.error('Error setting up focus projection:', error);

			const fallback = d3.geoMercator();
			const currentRightWidth = dragging ? Math.max(300, outerWidth - tempLeftWidth - HANDLE_WIDTH) : rightWidth;
			fallback.fitSize(
				[Math.max(100, currentRightWidth * 0.8), Math.max(100, rightHeight * 0.8)],
				selectedFeature as any
			);
			focusProjection = fallback;
			focusPathGenerator = d3.geoPath().projection(focusProjection as any);
		}

		if (!isZooming) {
			initZoom();
		}
	}

	function getCountryName(f: GeoFeature): string {
		const p = f.properties ?? {};
		return (p.name as string) ?? 'Unknown Country';
	}

	async function fetchCountryInfoByName(name: string | '') {
		if (!name) return;
		if (infoCache[name]?.data || infoCache[name]?.loading) return;

		infoCache[name] = { loading: true };

		try {
			let localEntry: any = null;
			try {
				const localResp = await fetch('/data/countries-data.json');
				if (localResp.ok) {
					const localJson = await localResp.json();

					if (Array.isArray(localJson)) {
						localEntry = localJson.find((e) => e.name === name) ?? null;
					} else if (localJson && typeof localJson === 'object') {
						localEntry = localJson[name] ?? null;
						if (!localEntry) {
							localEntry = Object.values(localJson).find((e: any) => e.name === name) ?? null;
						}
					}
				} else {
					console.warn('No local countries-data.json accessible:', localResp.status);
				}
			} catch (err) {
				console.warn('Error loading /data/countries-data.json', err);
				localEntry = null;
			}

			let summary: string | null = null;
			if (localEntry) {
				summary = localEntry.summary ?? null;
			}

			let wikiExtract: string | null = null;
			if (!summary) {
				try {
					const controller = new AbortController();
					const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

					const endpoint = 'https://en.wikipedia.org/w/api.php';
					const params = new URLSearchParams({
						action: 'query',
						format: 'json',
						origin: '*',
						prop: 'extracts',
						titles: name,
						exintro: '1',
						explaintext: '1',
						exsectionformat: 'plain'
					});

					const res = await fetch(`${endpoint}?${params.toString()}`, {
						signal: controller.signal
					});
					clearTimeout(timeoutId);
					
					if (!res.ok) throw new Error(`Wikipedia API error ${res.status}`);
					const json = await res.json();
					const pages = json?.query?.pages;
					if (!pages) throw new Error('no page data returned');

					const page = Object.values(pages)[0] as any;
					if (!page || page.missing) {
						wikiExtract = 'No summary available.';
					} else {
						wikiExtract = page.extract || 'No summary available.';
					}

					summary = wikiExtract;
				} catch (err) {
					console.warn('Wikipedia fetch failed, falling back to placeholder summary', err);
					summary = 'No summary available.';
				}
			}

			const data: CountryData = {
				capital: localEntry?.capital ?? countryInfoMapByName[name]?.capital ?? '—',
				population: localEntry?.population ?? countryInfoMapByName[name]?.population ?? '—',
				short: summary ?? countryInfoMapByName[name]?.short ?? '—',
				politics:
					localEntry?.politics ?? countryInfoMapByName[name]?.politics ?? 'Data not provided.',
				economics:
					localEntry?.economics ?? countryInfoMapByName[name]?.economics ?? 'Data not provided.'
			};

			Promise.resolve().then(async () => {
				try {
					if (!localEntry) {
						await fetch('/api', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ name: name, summary })
						});
					} else {
						const hadSummary = localEntry.summary;
						if (!hadSummary && summary) {
							await fetch('/api/countries', {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({ name: localEntry.name ?? name, summary })
							});
						}
					}
				} catch (err) {
					console.warn('Failed to persist country summary to /api/countries', err);
				}
			});

			infoCache[name] = { data, loading: false };
		} catch (err: any) {
			infoCache[name] = { loading: false, error: String(err) };
			console.error('Error fetching country info for', name, err);
		}
	}

	function onCountryClick(f: GeoFeature) {
		if (!f || isAnimating) return;

		selectedFeature = f;
		selectedName = getCountryName(f);

		setupFocusProjection();
		handleResize();

		fetchCountryInfoByName(selectedName);

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
		tempLeftWidth = leftWidth;
		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', handlePointerUp, { once: true });
	}

	function handlePointerMove(e: PointerEvent) {
		if (!dragging) return;
		tempLeftWidth = Math.max(240, Math.min(800, e.clientX));
	}

	function handlePointerUp() {
		if (!dragging) return;
		dragging = false;
		leftWidth = tempLeftWidth;
		rightWidth = Math.max(300, outerWidth - leftWidth - HANDLE_WIDTH);
		setupFocusProjection();
		window.removeEventListener('pointermove', handlePointerMove);
	}

	$: selectedLoading = selectedName ? (infoCache[selectedName]?.loading ?? false) : false;
	$: selectedInfo = selectedName ? (infoCache[selectedName]?.data ?? null) : null;

	function formatClock(d: Date) {
		const pad2 = (n: number) => String(n).padStart(2, '0');
		const pad3 = (n: number) => String(n).padStart(3, '0');
		const Y = d.getFullYear();
		const M = pad2(d.getMonth() + 1);
		const D = pad2(d.getDate());
		const hh = pad2(d.getHours());
		const mm = pad2(d.getMinutes());
		const ss = pad2(d.getSeconds());
		const ms = pad3(d.getMilliseconds());
		return `${Y}-${M}-${D} ${hh}:${mm}:${ss}.${ms} UTC${getOffsetString(d)}`;
	}

	function getOffsetString(d: Date) {
		const off = -d.getTimezoneOffset();
		const sign = off >= 0 ? '+' : '-';
		const abs = Math.abs(off);
		const hh = String(Math.floor(abs / 60)).padStart(2, '0');
		const mm = String(abs % 60).padStart(2, '0');
		return `${sign}${hh}:${mm}`;
	}

	function buildZoomBehavior() {
		return d3
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent([1, 15])
			.on('start', () => {
				isZooming = true;
			})
			.on('zoom', (event: any) => {
				if (!mapGroup || !svgEl) return;

				const t = event.transform;
				currentTransform = t;
				const k = t.k;
				let tx = t.x;
				let ty = t.y;

				const bbox = mapGroup.getBBox();
				const vb = svgEl.viewBox.baseVal;
				const viewW = vb && vb.width ? vb.width : svgEl.clientWidth;
				const viewH = vb && vb.height ? vb.height : svgEl.clientHeight;

				const txMin = viewW - (bbox.x + bbox.width) * k;
				const txMax = -bbox.x * k;
				const tyMin = viewH - (bbox.y + bbox.height) * k;
				const tyMax = -bbox.y * k;

				if (txMin > txMax) {
					tx = (txMin + txMax) / 2;
				} else {
					tx = Math.min(Math.max(tx, txMin), txMax);
				}

				if (tyMin > tyMax) {
					ty = (tyMin + tyMax) / 2;
				} else {
					ty = Math.min(Math.max(ty, tyMin), tyMax);
				}

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

		d3.select(svgEl).on('dblclick.zoom', () => {
			resetZoom();
		});
	}

	function resetZoom() {
		if (!svgEl || !zoomBehavior || !mapGroup) return;

		const vb = svgEl.viewBox.baseVal;
		const viewW = vb && vb.width ? vb.width : svgEl.clientWidth;
		const viewH = vb && vb.height ? vb.height : svgEl.clientHeight;
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
</script>

<div class="map-shell" tabindex="-1">
	{#if selectedFeature}
		<div 
			class="left-panel" 
			style="width: {leftWidth}px;" 
			aria-hidden="false"
		>
			<div class="panel-inner">
				<div
					style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;"
				>
					<div>
						<div class="country-title">{selectedName}</div>
						<div class="meta" style="margin-top:6px;">
							{#if selectedName}
								<span>{selectedName}</span>
							{/if}
						</div>
					</div>
					<div>
						<button class="close-btn" on:click={closePanel} aria-label="Close info panel">✕</button>
					</div>
				</div>

				{#if selectedLoading}
					<div class="section">
						<div class="label">Loading</div>
						<div class="section-content">Fetching data for {selectedName}…</div>
					</div>
				{:else if selectedInfo}
					<div class="section">
						<div class="label">Overview</div>
						<div class="section-content">{selectedInfo.short}</div>
					</div>

					<div class="section">
						<div class="label">Politics</div>
						<div class="section-content">{selectedInfo.politics}</div>
					</div>

					<div class="section">
						<div class="label">Economy</div>
						<div class="section-content">{selectedInfo.economics}</div>
					</div>

					<div class="section">
						<div class="label">Key Facts</div>
						<div class="meta">
							Capital: {selectedInfo.capital} · Population: {selectedInfo.population}
						</div>
					</div>
				{:else}
					<div class="section">
						<div class="label">No Extended Data</div>
						<div class="meta">Additional information for this country is not yet available.</div>
					</div>
				{/if}
			</div>
		</div>

		<div
			class="split-handle"
			class:dragging
			on:pointerdown={handlePointerDown}
			role="separator"
			aria-orientation="vertical"
		>
			{#if dragging}
				<div class="drag-preview-line" style="left: {tempLeftWidth - leftWidth}px;"></div>
			{/if}
		</div>
	{/if}

	<div
		class="right-panel"
		style="width: {selectedFeature ? `calc(100% - ${leftWidth + HANDLE_WIDTH}px)` : '100%'};"
	>
		{#if !selectedFeature}
			<svg
				viewBox={`0 0 ${outerWidth} ${outerHeight}`}
				preserveAspectRatio="xMidYMid meet"
				style="width: 100%; height: 100%;"
				bind:this={svgEl}
			>
				<g bind:this={mapGroup} style="will-change: transform;">
					{#if countries.length && pathGenerator}
						{#each countries as c (getCountryName(c))}
							<path
								d={pathGenerator(c as any)}
								class="country clickable"
								on:click={() => onCountryClick(c)}
								role="button"
								tabindex="0"
								aria-label={getCountryName(c)}
								on:keydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										onCountryClick(c);
									}
								}}
							/>
						{/each}
					{/if}
				</g>
			</svg>

			<div class="zoom-hint">Click on any country to zoom in and view details</div>
		{:else}
			<svg
				viewBox={`0 0 ${rightWidth} ${rightHeight}`}
				preserveAspectRatio="xMidYMid meet"
				style="width: 100%; height: 100%;"
				bind:this={svgEl}
			>
				<g bind:this={mapGroup} style="will-change: transform;">
					{#if countries.length && focusPathGenerator}
						{#each countries as c (getCountryName(c))}
							{#if c !== selectedFeature}
								<path
									d={focusPathGenerator(c as any)}
									class="country focus-background clickable"
									on:click={() => onCountryClick(c)}
									role="button"
									tabindex="0"
									aria-label={getCountryName(c)}
									on:keydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											onCountryClick(c);
										}
									}}
								/>
							{/if}
						{/each}

						<path d={focusPathGenerator(selectedFeature as any)} class="focus-country" />
					{/if}
				</g>
			</svg>
		{/if}

		<div class="clock" aria-hidden="false">{formatClock(now)}</div>
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		background: #0a0a0a;
		color: #ffffff;
		font-family:
			'Inter',
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			Roboto,
			sans-serif;
		overflow: hidden;
	}

	.map-shell {
		position: fixed;
		inset: 0;
		height: 100vh;
		width: 100vw;
		display: flex;
		overflow: hidden;
		background: radial-gradient(ellipse at center, #1a1a2e 0%, #0a0a0a 100%);
	}

	.left-panel {
		background: linear-gradient(135deg, rgba(16, 16, 30, 0.95), rgba(8, 8, 16, 0.98));
		color: #ffffff;
		border-right: 1px solid rgba(0, 255, 255, 0.2);
		transition: width 400ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
		z-index: 20;
		backdrop-filter: blur(20px);
		box-shadow: 0 0 50px rgba(0, 255, 255, 0.1);
		min-width: 240px;
	}

	.panel-inner {
		padding: 24px;
		height: 100%;
		overflow-y: auto;
	}

	.close-btn {
		background: linear-gradient(135deg, rgba(0, 255, 255, 0.1), rgba(0, 200, 255, 0.2));
		color: #00ffff;
		border: 1px solid rgba(0, 255, 255, 0.3);
		padding: 8px 12px;
		cursor: pointer;
		font-weight: 600;
		transition: all 200ms ease;
		border-radius: 6px;
		font-size: 14px;
		backdrop-filter: blur(10px);
	}

	.close-btn:hover {
		background: linear-gradient(135deg, rgba(0, 255, 255, 0.2), rgba(0, 200, 255, 0.3));
		transform: scale(1.05);
		box-shadow: 0 0 20px rgba(0, 255, 255, 0.4);
	}

	.close-btn:active {
		transform: scale(0.98);
	}

	.split-handle {
		width: 6px;
		cursor: ew-resize;
		background: linear-gradient(180deg, rgba(0, 255, 255, 0.3), rgba(0, 200, 255, 0.5));
		z-index: 25;
		transition: all 300ms ease;
		box-shadow: 0 0 10px rgba(0, 255, 255, 0.3);
		position: relative;
		overflow: visible;
	}

	.split-handle:hover {
		background: linear-gradient(180deg, rgba(0, 255, 255, 0.5), rgba(0, 200, 255, 0.7));
		box-shadow: 0 0 20px rgba(0, 255, 255, 0.5);
	}

	.split-handle.dragging {
		background: linear-gradient(180deg, rgba(255, 255, 0, 0.5), rgba(255, 200, 0, 0.7));
		box-shadow: 0 0 30px rgba(255, 255, 0, 0.6);
	}

	.drag-preview-line {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		background: rgba(255, 255, 255, 0.8);
		border-left: 2px dashed rgba(0, 255, 255, 0.8);
		box-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
		pointer-events: none;
		z-index: 30;
		animation: dash 1s linear infinite;
	}

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

	.right-panel {
		background: #000000;
		color: #ffffff;
		flex: 1;
		position: relative;
		overflow: hidden;
	}

	svg {
		display: block;
		transition: all 800ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
	}

	.country {
		fill: rgba(255, 255, 255, 0.08);
		stroke: rgba(255, 255, 255, 0.4);
		stroke-width: 0.5px;
		transition: all 300ms ease;
		filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.2));
		will-change: transform;
	}

	.country.clickable {
		cursor: pointer;
		fill: rgba(255, 255, 255, 0.12);
	}

	.country.clickable:hover {
		stroke: rgba(255, 255, 255, 0.8);
		stroke-width: 1.5px;
		fill: rgba(255, 255, 255, 0.2);
		filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.4));
	}

	.focus-country {
		fill: rgba(0, 255, 255, 0.08);
		stroke: rgba(0, 255, 255, 0.95);
		stroke-width: 3px;
		filter: drop-shadow(0 0 20px rgba(0, 255, 255, 0.6));
		animation: pulse 2s infinite ease-in-out;
		will-change: transform;
	}

	.focus-background {
		fill: rgba(255, 255, 255, 0.02);
		stroke: rgba(255, 255, 255, 0.15);
		stroke-width: 0.3px;
		will-change: transform;
	}

	@keyframes pulse {
		0%,
		100% {
			stroke-width: 3px;
			opacity: 0.9;
			filter: drop-shadow(0 0 20px rgba(0, 255, 255, 0.6));
		}
		50% {
			stroke-width: 4px;
			opacity: 1;
			filter: drop-shadow(0 0 30px rgba(0, 255, 255, 0.8));
		}
	}

	.clock {
		position: absolute;
		top: 20px;
		right: 20px;
		z-index: 50;
		background: linear-gradient(135deg, rgba(16, 16, 16, 0.9), rgba(8, 8, 8, 0.95));
		border: 1px solid rgba(255, 255, 255, 0.2);
		padding: 12px 16px;
		font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
		font-size: 14px;
		line-height: 1;
		user-select: none;
		border-radius: 8px;
		backdrop-filter: blur(15px);
		color: #ffffff;
		box-shadow: 0 0 30px rgba(255, 255, 255, 0.1);
	}

	.country-title {
		font-size: 20px;
		font-weight: 700;
		color: #ffffff;
		margin-bottom: 8px;
		text-shadow: 0 0 10px rgba(255, 255, 255, 0.2);
	}

	.meta {
		font-size: 14px;
		opacity: 0.7;
		color: #cccccc;
	}

	.section {
		margin-top: 20px;
		font-size: 14px;
		line-height: 1.6;
		opacity: 0.95;
	}

	.label {
		font-weight: 700;
		font-size: 13px;
		color: #ffffff;
		opacity: 0.9;
		margin-bottom: 8px;
		display: block;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.section-content {
		color: rgba(255, 255, 255, 0.85);
		line-height: 1.5;
	}

	.zoom-hint {
		position: absolute;
		bottom: 20px;
		left: 20px;
		z-index: 50;
		background: linear-gradient(135deg, rgba(16, 16, 16, 0.8), rgba(8, 8, 8, 0.9));
		border: 1px solid rgba(255, 255, 255, 0.1);
		padding: 8px 12px;
		font-size: 12px;
		color: rgba(255, 255, 255, 0.6);
		border-radius: 6px;
		backdrop-filter: blur(10px);
	}
</style>
