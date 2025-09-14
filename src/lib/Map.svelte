<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { feature } from 'topojson-client';
	import * as d3 from 'd3';
	import type { GeoFeature, SourceValue, DataSources, CountryData } from '$lib/types';
	import InfoPanel from '$lib/InfoPanel.svelte';

	let countries: GeoFeature[] = [];
	let selectedFeature: GeoFeature | null = null;
	let selectedName: string | null = null;
	let activeTab: string = 'overview';

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
			const objects = topo.objects;
			const objectKey = Object.keys(objects)[0];
			const geo = feature(topo as any, objects[objectKey]) as GeoJSON.FeatureCollection | GeoJSON.Feature | null;

			countries = geo?.type === 'FeatureCollection' ? (geo.features as GeoFeature[]) : geo ? [geo as GeoFeature] : [];
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
		if (animHandle != null) cancelAnimationFrame(animHandle);
		if (svgEl && zoomBehavior) {
			d3.select(svgEl).on('.zoom', null);
			zoomBehavior = null;
		}
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
			projection = d3.geoNaturalEarth1();
			projection.fitSize([outerWidth, outerHeight], worldFeature as any);
			pathGenerator = d3.geoPath().projection(projection as any);
			if (selectedFeature) setupFocusProjection();
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
			let proj = d3.geoMercator();

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
		if (!isZooming) initZoom();
	}

	function getCountryName(f: GeoFeature): string {
		return f.properties?.name ?? 'Unknown Country';
	}

	function normalizeSources(raw: any, nameForWikipediaHint?: string): DataSources {
		const out: DataSources = {};
		if (!raw || typeof raw !== 'object') return out;
		const entries = Object.entries(raw) as [keyof DataSources, any][];
		for (const [k, v] of entries) {
			if (typeof v === 'string') {
				if (v === 'Wikipedia' || v.toLowerCase().includes('wiki')) {
					out[k] = {
						label: v,
						url: `https://en.wikipedia.org/wiki/${encodeURIComponent(nameForWikipediaHint ?? '')}`
					};
				} else if (v.toLowerCase().includes('rest')) {
					out[k] = {
						label: v,
						url: `https://restcountries.com/v3.1/name/${encodeURIComponent(nameForWikipediaHint ?? '')}`
					};
				} else {
					out[k] = v;
				}
			} else if (v && typeof v === 'object' && ('label' in v || 'url' in v)) {
				out[k] = v as SourceValue;
			} else {
				out[k] = String(v);
			}
		}
		return out;
	}

	async function fetchCountryInfoByName(name: string | '') {
		if (!name || infoCache[name]?.data || infoCache[name]?.loading) return;
		infoCache[name] = { loading: true };

		try {
			let localEntry: any = null;
			try {
				const localResp = await fetch('/data/countries-data.json');
				if (localResp.ok) {
					const localJson = await localResp.json();
					localEntry = Array.isArray(localJson)
						? (localJson.find((e) => e.name === name) ?? null)
						: (localJson[name] ?? Object.values(localJson).find((e: any) => e.name === name) ?? null);
				} else {
					console.warn('No local countries-data.json accessible:', localResp.status);
				}
			} catch (err) {
				console.warn('Error loading /data/countries-data.json', err);
			}

			console.log('Local entry for', name, localEntry);

			let cca2ID = localEntry?.cca2ID ?? null;
			let officialName = localEntry?.officialName ?? null;
			let summary = localEntry?.summary ?? null;
			let flag = localEntry?.flag ?? null;
			let coatOfArms = localEntry?.coatOfArms ?? null;
			let capital = localEntry?.capital ?? null;
			let independent = localEntry?.independent ?? null;
			let region = localEntry?.region ?? null;
			let subregion = localEntry?.subregion ?? null;
			let area = localEntry?.area ?? null;
			let languages = localEntry?.languages ?? null;
			let population = localEntry?.population ?? null;
			let gini = localEntry?.gini ?? null;
			let gdp = localEntry?.gdp ?? null;
			let sources = normalizeSources(localEntry?.sources ?? {}, name);

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

					summary = page?.missing
						? 'No summary available.'
						: page?.extract.replace(/\n/g, '\n\n') || 'No summary available.';
					sources = {
						...sources,
						summary: {
							label: 'Wikipedia',
							url: `https://en.wikipedia.org/wiki/${encodeURIComponent(name)}`
						}
					};
				} catch (err) {
					console.warn('Wikipedia fetch failed, falling back to placeholder summary', err);
					summary = 'No summary available.';
				}
			}

			if (!cca2ID) {
				try {
					const controller = new AbortController();
					const timeoutId = setTimeout(() => controller.abort(), 5000);
					const res = await fetch('https://restcountries.com/v3.1/name/' + encodeURIComponent(name), {
						signal: controller.signal
					});
					clearTimeout(timeoutId);
					if (!res.ok) throw new Error(`RestCountries API error ${res.status}`);
					const json = await res.json();
					let restData =
						json.length === 1
							? json[0]
							: json.find(
									(c: any) =>
										c.name.common?.toLowerCase() === name.toLowerCase() ||
										c.name.official?.toLowerCase() === name.toLowerCase() ||
										c.altSpellings?.some((s: string) => s.toLowerCase() === name.toLowerCase())
								);
					if (!restData) throw new Error('no country data returned');
					console.log(restData);

					cca2ID = restData.cca2 ?? 'UNKNOWN';
					officialName = restData.name.official ?? 'UNKNOWN';
					flag = restData.flags.svg ?? 'UNKNOWN';
					coatOfArms = restData.coatOfArms.svg ?? 'UNKNOWN';
					capital = restData.capital?.[0] ?? '—';
					independent = restData.independent ?? false;
					region = restData.region ?? 'UNKNOWN';
					subregion = restData.subregion ?? 'UNKNOWN';
					area = restData.area ?? -1;
					languages = restData.languages ?? [];
					population = restData.population ?? -1;
					gini = restData.gini ? (restData.gini[Object.keys(restData.gini)[0]] ?? 0) : -1;

					const restUrl = `https://restcountries.com/v3.1/name/${encodeURIComponent(name)}`;
					const restSource = { label: 'REST Countries', url: restUrl };
					Object.assign(sources, {
						...(!sources.flag && { flag: restSource }),
						...(!sources.coatOfArms && { coatOfArms: restSource }),
						...(!sources.officialName && { officialName: restSource }),
						...(!sources.capital && { capital: restSource }),
						...(!sources.independent && { independent: restSource }),
						...(!sources.region && { region: restSource }),
						...(!sources.subregion && { subregion: restSource }),
						...(!sources.area && { area: restSource }),
						...(!sources.languages && { languages: restSource }),
						...(!sources.population && { population: restSource }),
						...(!sources.gini && { gini: restSource })
					});
				} catch (err) {
					console.warn('RestCountries fetch failed, falling back to placeholder information', err);
				}
			}

			if (!gdp && cca2ID && cca2ID !== 'UNKNOWN') {
				try {
					const controller = new AbortController();
					const timeoutId = setTimeout(() => controller.abort(), 10000);
					const res = await fetch(
						`https://api.worldbank.org/v2/country/${encodeURIComponent(cca2ID)}/indicator/NY.GDP.MKTP.CD?format=json&date=2024`,
						{ signal: controller.signal }
					);
					clearTimeout(timeoutId);

					if (!res.ok) throw new Error(`WorldBank API error ${res.status}`);
					const json = await res.json();
					console.log(json[1][0]);

					gdp = json[1][0].value ?? -1;
					const worldBankUrl = `https://api.worldbank.org/v2/country/${encodeURIComponent(cca2ID)}/indicator/NY.GDP.MKTP.CD?format=json&date=2024`;
					if (!sources.gdp) sources.gdp = { label: 'World Bank', url: worldBankUrl };
				} catch (err) {
					console.warn('WorldBank fetch failed, falling back to placeholder GDP', err);
					gdp = -1;
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
				area: area ?? -1,
				languages: languages ?? [],
				capital: capital ?? '—',
				population: population ?? -1,
				gini: gini ?? -1,
				gdp: gdp ?? -1,
				summary: summary ?? '—',
				politics: localEntry?.politics ?? 'Data not provided.',
				economics: localEntry?.economics ?? 'Data not provided.',
				sources
			};

			Promise.resolve().then(async () => {
				try {
					const shouldPersist = !localEntry || (!localEntry.summary && !localEntry.cca2ID && summary);
					if (shouldPersist) {
						await fetch('/api', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								name: localEntry?.name ?? name,
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
								gdp,
								sources
							})
						});
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
</script>

<div
	class="fixed inset-0 flex h-screen w-screen overflow-hidden bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#0a0a0a_100%)] font-sans text-white"
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
			onToggleSources={() => (showSources = !showSources)}
			onClose={closePanel}
			onChangeTab={(t) => (activeTab = t)}
		/>

		<div
			class="relative z-25 w-[6px] cursor-ew-resize overflow-visible bg-[linear-gradient(180deg,rgba(0,255,255,0.3),rgba(0,200,255,0.5))] shadow-[0_0_10px_rgba(0,255,255,0.3)] transition-all duration-300"
			on:pointerdown={handlePointerDown}
			role="separator"
			aria-orientation="vertical"
		>
			{#if dragging}
				<div
					class="pointer-events-none absolute top-0 bottom-0 z-30 w-[2px] border-l-2 border-dashed border-[rgba(0,255,255,0.8)] bg-[rgba(255,255,255,0.8)] shadow-[0_0_10px_rgba(0,255,255,0.5)]"
					style="left: {tempLeftWidth - leftWidth}px; animation: dash 1s linear infinite;"
				></div>
			{/if}
		</div>
	{/if}

	<div
		class="relative flex-1 overflow-hidden bg-black text-white"
		style="width: {selectedFeature ? `calc(100% - ${leftWidth + HANDLE_WIDTH}px)` : '100%'};"
	>
		{#if !selectedFeature}
			<svg
				viewBox={`0 0 ${outerWidth} ${outerHeight}`}
				preserveAspectRatio="xMidYMid meet"
				class="block h-full w-full transition-all duration-[800ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)]"
				bind:this={svgEl}
			>
				<g bind:this={mapGroup} style="will-change: transform;">
					{#if countries.length && pathGenerator}
						{#each countries as c (getCountryName(c))}
							<path
								d={pathGenerator(c as any)}
								class="cursor-pointer fill-[rgba(255,255,255,0.08)] stroke-[rgba(255,255,255,0.4)] stroke-[0.5px] filter-[drop-shadow(0_0_2px_rgba(255,255,255,0.2))] transition-all duration-300 will-change-transform hover:fill-[rgba(255,255,255,0.2)] hover:stroke-[rgba(255,255,255,0.8)] hover:stroke-[1.5px] hover:filter-[drop-shadow(0_0_10px_rgba(255,255,255,0.4))]"
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
			<div
				class="absolute bottom-5 left-5 z-50 rounded-md border border-[rgba(255,255,255,0.1)] bg-[linear-gradient(135deg,rgba(16,16,16,0.8),rgba(8,8,8,0.9))] px-3 py-2 text-[12px] text-[rgba(255,255,255,0.6)] backdrop-blur-[10px]"
			>
				Click on any country to zoom in and view details
			</div>
		{:else}
			<svg
				viewBox={`0 0 ${rightWidth} ${rightHeight}`}
				preserveAspectRatio="xMidYMid meet"
				class="block h-full w-full transition-all duration-[800ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)]"
				bind:this={svgEl}
			>
				<g bind:this={mapGroup} style="will-change: transform;">
					{#if countries.length && focusPathGenerator}
						{#each countries as c (getCountryName(c))}
							{#if c !== selectedFeature}
								<path
									d={focusPathGenerator(c as any)}
									class="cursor-pointer fill-[rgba(255,255,255,0.02)] stroke-[rgba(255,255,255,0.15)] stroke-[0.3px] will-change-transform"
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
						<path
							d={focusPathGenerator(selectedFeature as any)}
							class="animate-pulse fill-darkCyan stroke-[rgba(0,255,255,0.95)] stroke-[3px] filter-[drop-shadow(0_0_20px_rgba(0,255,255,0.6))]"
						/>
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
