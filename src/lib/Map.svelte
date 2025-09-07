<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import * as d3 from 'd3';
	import { feature } from 'topojson-client';

	type GeoFeature = GeoJSON.Feature<GeoJSON.Geometry, Record<string, any>>;
	type CountryData = {
		officialName: string;
		cca2ID: string;
		flag: string;
		coatOfArms: string;
		independent: boolean;
		region: string;
		subregion: string;
		capital: string;
		area: number;
		population: number;
		languages: string[];
		gini: number;
		gdp: number;
		summary: string;
		politics: string;
		economics: string;
	};

	let countries: GeoFeature[] = [];
	let selectedFeature: GeoFeature | null = null;
	let selectedName: string | null = null;

	let leftPct = 0.36;
	let tempLeftPct = leftPct;
	let leftWidth = 0;
	let tempLeftWidth = 0;
	const MIN_PCT = 0.2;
	const MAX_PCT = 0.75;
	const MIN_LEFT_PX = 320;
	const MAX_LEFT_PX = 900;
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

	let infoCache: Record<string, { data?: CountryData; loading: boolean; error?: string }> = {};

	let svgEl: SVGSVGElement | null = null;
	let mapGroup: SVGGElement | null = null;
	let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
	let activeTab: 'overview' | 'politics' | 'economics' = 'overview';

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

		const desired = Math.round(
			Math.max(MIN_LEFT_PX, Math.min(MAX_LEFT_PX, Math.round(leftPct * outerWidth)))
		);
		leftWidth = desired;
		const effectiveLeft = dragging
			? Math.max(MIN_LEFT_PX, Math.min(MAX_LEFT_PX, tempLeftWidth || desired))
			: leftWidth;

		rightWidth = selectedFeature
			? Math.max(300, outerWidth - effectiveLeft - HANDLE_WIDTH)
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

			const currentRightWidth = dragging
				? Math.max(300, outerWidth - tempLeftWidth - HANDLE_WIDTH)
				: rightWidth;
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
			const currentRightWidth = dragging
				? Math.max(300, outerWidth - tempLeftWidth - HANDLE_WIDTH)
				: rightWidth;
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

			console.log('Local entry for', name, localEntry);

			let cca2ID: string | null = null;
			let officialName: string | null = null;
			let summary: string | null = null;
			let flag: string | null = null;
			let coatOfArms: string | null = null;
			let capital: string | null = null;
			let independent: boolean | null = null;
			let region: string | null = null;
			let subregion: string | null = null;
			let area: number | null = null;
			let languages: string[] | null = null;
			let population: number | null = null;
			let gini: number | null = null;
			let gdp: number | null = null;
			if (localEntry) {
				cca2ID = localEntry.cca2ID ?? null;
				officialName = localEntry.officialName ?? null;
				summary = localEntry.summary ?? null;
				flag = localEntry.flag ?? null;
				coatOfArms = localEntry.coatOfArms ?? null;
				capital = localEntry.capital ?? null;
				independent = localEntry.independent ?? null;
				region = localEntry.region ?? null;
				subregion = localEntry.subregion ?? null;
				area = localEntry.area ?? null;
				languages = localEntry.languages ?? null;
				population = localEntry.population ?? null;
				gini = localEntry.gini ?? null;
				gdp = localEntry.gdp ?? null;
			}

			let wikiExtract: string | null = null;
			if (!summary) {
				try {
					const controller = new AbortController();
					const timeoutId = setTimeout(() => controller.abort(), 5000);

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

			if (!cca2ID) {
				try {
					const controller = new AbortController();
					const timeoutId = setTimeout(() => controller.abort(), 5000);

					const res = await fetch(
						'https://restcountries.com/v3.1/name/' + encodeURIComponent(name),
						{
							signal: controller.signal
						}
					);
					clearTimeout(timeoutId);

					if (!res.ok) throw new Error(`Wikipedia API error ${res.status}`);
					const json = await res.json();
					console.log(json[0]);

					cca2ID = json[0].cca2 ?? 'UNKNOWN';
					officialName = json[0].name.official ?? 'UNKNOWN';
					flag = json[0].flags.svg ?? 'UNKNOWN';
					coatOfArms = json[0].coatOfArms.svg ?? 'UNKNOWN';
					capital = json[0].capital[0] ?? '—';
					independent = json[0].independent ?? false;
					region = json[0].region ?? 'UNKNOWN';
					subregion = json[0].subregion ?? 'UNKNOWN';
					area = json[0].area ?? 0;
					languages = json[0].languages ?? [];
					population = json[0].population ?? 0;
					gini = json[0].gini[Object.keys(json[0].gini ?? {})[0]] ?? 0;
				} catch (err) {
					console.warn('RestCountries fetch failed, falling back to placeholder information', err);
				}
			}

			const data: CountryData = {
				cca2ID: cca2ID ?? 'UNKNOWN',
				officialName: officialName ?? 'UNKNOWN',
				flag: flag ?? 'UNKNOWN',
				coatOfArms: coatOfArms ?? 'UNKNOWN',
				independent: independent ?? false,
				region: region ?? 'UNKNOWN',
				subregion: subregion ?? 'UNKNOWN',
				area: area ?? 0,
				languages: languages ?? [],
				capital: capital ?? '—',
				population: population ?? 0,
				gini: gini ?? 0,
				gdp: localEntry?.gdp ?? 0,
				summary: summary ?? '—',
				politics: localEntry?.politics ?? 'Data not provided.',
				economics: localEntry?.economics ?? 'Data not provided.'
			};

			Promise.resolve().then(async () => {
				try {
					if (!localEntry) {
						await fetch('/api', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								name,
								summary,
								cca2ID,
								officialName,
								flag,
								coatOfArms,
								independent,
								region,
								subregion,
								area,
								languages,
								capital,
								population,
								gini,
								gdp
							})
						});
					} else {
						const hadSummary = localEntry.summary;
						const hadcca2ID = localEntry.cca2ID;
						if (!hadSummary && !hadcca2ID && summary) {
							await fetch('/api', {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({
									name: localEntry.name ?? name,
									summary,
									cca2ID,
									officialName,
									flag,
									coatOfArms,
									independent,
									region,
									subregion,
									area,
									languages,
									capital,
									population,
									gini,
									gdp
								})
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
		tempLeftPct = leftPct;
		tempLeftWidth = leftWidth;
		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', handlePointerUp, { once: true });
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

	function setTab(t: 'overview' | 'politics' | 'economics') {
		activeTab = t;
		requestAnimationFrame(() => {
			const rp = document.querySelector('.read-panel');
			if (rp) (rp as HTMLElement).scrollTop = 0;
		});
	}

	function formatNumber(n: number | undefined) {
		if (!n && n !== 0) return '—';
		const abs = Math.abs(Math.round(n));
		if (abs >= 1_000_000_000) return (abs / 1_000_000_000).toFixed(2) + 'B';
		if (abs >= 1_000_000) return (abs / 1_000_000).toFixed(2) + 'M';
		if (abs >= 1_000) return (abs / 1_000).toFixed(2) + 'K';
		return String(abs);
	}

	function formatGDP(val: number | undefined) {
		if (!val && val !== 0) return '—';
		const full = Number(val).toLocaleString('en-US', { maximumFractionDigits: 0 });
		const abbr = formatNumber(val);
		return `$${full} · ${abbr}`;
	}

	function formatLanguages(langs: unknown): string {
		if (!langs) return '—';
		if (Array.isArray(langs)) return langs.join(', ');
		if (typeof langs === 'string') return langs;
		if (typeof langs === 'object') return Object.values(langs as Record<string, any>).join(', ');
		return String(langs);
	}
</script>

<div class="map-shell" tabindex="-1">
	{#if selectedFeature}
		<div class="left-panel" style="width: {leftWidth}px;" aria-hidden="false">
			<div class="panel-inner">
				{#if selectedLoading}
					<div class="info-loading">
						<div class="loader" aria-hidden="true"></div>
						<div class="loading-text">Fetching data for {selectedName}…</div>
					</div>
				{:else if selectedInfo}
					<header class="info-header">
						<div class="media big" aria-hidden="false">
							<img class="media-img flag big" src={selectedInfo.flag} alt="{selectedName} flag" />
							<img
								class="media-img coa big"
								src={selectedInfo.coatOfArms}
								alt="{selectedName} coat of arms"
							/>
						</div>

						<div class="title-block">
							<div class="country-title neon">{selectedInfo.officialName ?? selectedName}</div>
							<div class="sub-meta">
								<span class="region-chip">{selectedInfo.region}</span>
								{#if selectedInfo.subregion}<span class="region-chip subtle"
										>{selectedInfo.subregion}</span
									>{/if}
								<span class="meta small">Capital: {selectedInfo.capital}</span>
								<span class="meta small">Population: {formatNumber(selectedInfo.population)}</span>
							</div>
						</div>

						<div style="margin-left:12px;">
							<button
								class="close-btn panel-close"
								on:click={closePanel}
								aria-label="Close info panel">✕</button
							>
						</div>
					</header>

					<section class="stats" aria-label="Key facts">
						<div class="stat-grid">
							<div class="stat">
								<div class="stat-label">Area</div>
								<div class="stat-value">{formatNumber(selectedInfo.area)} km²</div>
							</div>

							<div class="stat">
								<div class="stat-label">GDP (USD)</div>
								<div class="stat-value">{formatGDP(selectedInfo.gdp)}</div>
							</div>

							<div class="stat">
								<div class="stat-label">Gini</div>
								<div class="stat-value">{selectedInfo.gini ?? '—'}</div>
							</div>

							<div class="stat">
								<div class="stat-label">Languages</div>
								<div class="stat-value">{formatLanguages(selectedInfo.languages)}</div>
							</div>
						</div>
					</section>

					<nav class="tab-controls" aria-label="Country sections">
						<button
							class="tab"
							role="tab"
							aria-selected={activeTab === 'overview'}
							on:click={() => setTab('overview')}>Overview</button
						>
						<button
							class="tab"
							role="tab"
							aria-selected={activeTab === 'politics'}
							on:click={() => setTab('politics')}>Politics</button
						>
						<button
							class="tab"
							role="tab"
							aria-selected={activeTab === 'economics'}
							on:click={() => setTab('economics')}>Economy</button
						>
					</nav>

					<section class="read-panel" aria-live="polite">
						<div class="read-content">
							{#if activeTab === 'overview'}
								<div class="panel-section" aria-hidden="false">
									<div class="label">Overview</div>
									<p class="section-content">{selectedInfo.summary}</p>
								</div>
							{:else if activeTab === 'politics'}
								<div class="panel-section" aria-hidden="false">
									<div class="label">Politics</div>
									<p class="section-content">{selectedInfo.politics}</p>
								</div>
							{:else}
								<div class="panel-section" aria-hidden="false">
									<div class="label">Economy</div>
									<p class="section-content">{selectedInfo.economics}</p>
								</div>
							{/if}
						</div>
					</section>
				{:else}
					<div class="no-data">
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
		min-width: 320px;
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

	.panel-inner {
		padding: 20px 22px;
		display: flex;
		flex-direction: column;
		gap: 18px;
		animation: panelFadeIn 360ms cubic-bezier(0.2, 0.9, 0.2, 1);
	}

	@keyframes panelFadeIn {
		from {
			opacity: 0;
			transform: translateX(-6px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	.info-header {
		display: flex;
		gap: 18px;
		align-items: flex-start;
		flex-wrap: wrap;
	}

	.media {
		display: flex;
		gap: 10px;
		align-items: center;
	}

	.media-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		filter: saturate(0.95) contrast(1.02);
	}

	.media-img.coa {
		width: 56px;
		height: 56px;
		border-radius: 6px;
	}

	.title-block {
		flex: 1;
		min-width: 0;
	}

	.country-title.neon {
		font-size: 20px;
		letter-spacing: 0.2px;
		color: #e6ffff;
		text-shadow:
			0 0 8px rgba(0, 255, 255, 0.12),
			0 2px 20px rgba(0, 255, 255, 0.04);
		animation: subtleGlow 3s ease-in-out infinite;
	}

	@keyframes subtleGlow {
		0%,
		100% {
			text-shadow: 0 0 6px rgba(0, 255, 255, 0.06);
		}
		50% {
			text-shadow: 0 0 12px rgba(0, 255, 255, 0.12);
		}
	}

	.sub-meta {
		margin-top: 6px;
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}

	.region-chip {
		font-size: 12px;
		padding: 6px 8px;
		border-radius: 999px;
		background: linear-gradient(135deg, rgba(0, 255, 255, 0.06), rgba(0, 200, 255, 0.02));
		border: 1px solid rgba(0, 255, 255, 0.06);
		color: #ccfbff;
		opacity: 0.95;
	}

	.region-chip.subtle {
		opacity: 0.6;
		background: transparent;
		border-color: rgba(255, 255, 255, 0.04);
		color: #bfc9d1;
	}

	.stats {
		margin-top: 14px;
	}

	.stat-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}

	.stat {
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(0, 0, 0, 0.03));
		border: 1px solid rgba(0, 255, 255, 0.04);
		padding: 10px;
		border-radius: 10px;
		backdrop-filter: blur(6px);
		box-shadow: 0 6px 18px rgba(0, 255, 255, 0.02);
	}

	.stat-label {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: rgba(255, 255, 255, 0.6);
		margin-bottom: 6px;
	}
	.stat-value {
		font-weight: 700;
		font-size: 14px;
		color: #ffffff;
	}

	.panel-section {
		padding: 12px;
		border-radius: 10px;
		background: linear-gradient(180deg, rgba(0, 0, 0, 0.02), rgba(255, 255, 255, 0.01));
		border: 1px solid rgba(0, 255, 255, 0.03);
		transition:
			transform 300ms cubic-bezier(0.2, 0.9, 0.2, 1),
			box-shadow 300ms;
		overflow: hidden;
	}

	.panel-section[aria-hidden='false'] {
		max-height: 2000px;
		box-shadow: 0 18px 48px rgba(0, 255, 255, 0.03);
		transform: translateY(-2px);
	}

	.panel-section .label {
		font-weight: 700;
		font-size: 13px;
		margin-bottom: 8px;
		color: #eaffff;
	}

	.section-content {
		color: rgba(255, 255, 255, 0.86);
		font-size: 13px;
		line-height: 1.6;
		white-space: pre-wrap;
	}

	.info-loading {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 30px 10px;
	}

	.loader {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: 4px solid rgba(255, 255, 255, 0.06);
		border-top-color: rgba(0, 255, 255, 0.7);
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.loading-text {
		color: rgba(255, 255, 255, 0.75);
		font-weight: 600;
	}

	.no-data {
		padding: 18px;
		color: rgba(255, 255, 255, 0.9);
	}

	.info-header {
		align-items: flex-start;
		gap: 18px;
	}
	.media.big {
		display: flex;
		gap: 12px;
		align-items: center;
		margin-right: 6px;
	}
	.media.big {
		display: flex;
		gap: 12px;
		align-items: center;
	}
	@media (max-width: 700px) {
		.media.big {
			flex-direction: column;
			gap: 8px;
			align-items: center;
			width: 100%;
		}
		.title-block {
			width: 100%;
		}
	}

	.media-img.flag.big {
		width: 240px;
		height: 140px;
		object-fit: cover;
		border-radius: 8px;
	}
	.media-img.coa.big {
		width: 140px;
		height: 140px;
		object-fit: contain;
		background: rgba(0, 0, 0, 0.02);
		padding: 8px;
		border-radius: 10px;
		align-self: center;
	}

	.title-block {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.sub-meta {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
		margin-top: 4px;
	}
	.meta.small {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.6);
		margin-left: 6px;
	}

	.panel-close {
		padding: 8px 10px;
		height: 40px;
		align-self: flex-start;
	}

	.tab-controls {
		display: flex;
		gap: 8px;
		margin-top: 10px;
	}
	.tab {
		padding: 8px 12px;
		border-radius: 10px;
		background: linear-gradient(90deg, rgba(255, 255, 255, 0.01), rgba(0, 0, 0, 0.02));
		border: 1px solid rgba(0, 255, 255, 0.04);
		cursor: pointer;
		font-weight: 700;
		color: #dffbff;
		transition:
			transform 160ms ease,
			box-shadow 160ms ease;
	}
	.tab[aria-selected='true'] {
		background: linear-gradient(90deg, rgba(0, 255, 255, 0.06), rgba(0, 200, 255, 0.02));
		box-shadow: 0 10px 30px rgba(0, 255, 255, 0.03);
		transform: translateY(-3px);
	}

	.read-panel {
		margin-top: 12px;
		max-height: 46vh;
		overflow: auto;
		padding: 12px;
		border-radius: 10px;
		background: linear-gradient(180deg, rgba(0, 0, 0, 0.02), rgba(255, 255, 255, 0.01));
		border: 1px solid rgba(0, 255, 255, 0.03);
		box-shadow: 0 8px 30px rgba(0, 255, 255, 0.02);
	}
	.read-content {
		padding-right: 6px;
	}
	.panel-section {
		background: transparent;
		padding: 0;
		border: none;
	}
	.section-content {
		color: rgba(255, 255, 255, 0.9);
		font-size: 14px;
		line-height: 1.7;
		white-space: pre-wrap;
	}
</style>
