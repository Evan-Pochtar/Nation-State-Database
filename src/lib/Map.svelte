<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { slide } from 'svelte/transition';
	import type { GeoFeature, SourceValue, DataSources, CountryData } from '$lib/types';
	import * as d3 from 'd3';
	import { feature } from 'topojson-client';

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
			const geo = feature(topo as any, objects[objectKey]) as
				| GeoJSON.FeatureCollection
				| GeoJSON.Feature
				| null;

			countries =
				geo?.type === 'FeatureCollection'
					? (geo.features as GeoFeature[])
					: geo
						? [geo as GeoFeature]
						: [];
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

			const currentRightWidth = dragging
				? Math.max(300, outerWidth - tempLeftWidth - HANDLE_WIDTH)
				: rightWidth;
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
						: (localJson[name] ??
							Object.values(localJson).find((e: any) => e.name === name) ??
							null);
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
					const res = await fetch(
						'https://restcountries.com/v3.1/name/' + encodeURIComponent(name),
						{ signal: controller.signal }
					);
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
					const shouldPersist =
						!localEntry || (!localEntry.summary && !localEntry.cca2ID && summary);
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

	function setTab(t: string) {
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

	function getSource(field: keyof DataSources): SourceValue | null {
		return selectedInfo?.sources?.[field] || null;
	}

	function isSourceString(s: unknown) {
		return typeof s === 'string';
	}
	function sourceLabel(s: any) {
		return typeof s === 'string' ? s : (s?.label ?? '');
	}
	function sourceUrl(s: any) {
		return typeof s === 'string' ? null : (s?.url ?? '#');
	}

	const cardClass =
		'rounded-xl border border-[rgba(0,255,255,0.04)] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(0,0,0,0.03))] p-2 shadow-[0_6px_18px_rgba(0,255,255,0.02)] backdrop-blur-[6px]';
	const buttonClass =
		'cursor-pointer rounded-lg border border-[rgba(0,255,255,0.04)] bg-[linear-gradient(90deg,rgba(255,255,255,0.01),rgba(0,0,0,0.02))] px-3 py-2 font-extrabold text-[#dffbff] transition-transform duration-160';
	const labelClass = 'mb-1 text-[11px] tracking-[0.6px] text-[rgba(255,255,255,0.6)] uppercase';
</script>

<div
	class="fixed inset-0 flex h-screen w-screen overflow-hidden bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#0a0a0a_100%)] font-sans text-white"
	tabindex="-1"
>
	{#if selectedFeature}
		<div
			in:slide={{ duration: 260 }}
			out:slide={{ duration: 220 }}
			class="z-20 min-w-[320px] border-r border-[rgba(0,255,255,0.2)] bg-[linear-gradient(135deg,rgba(16,16,30,0.95),rgba(8,8,16,0.98))] shadow-[0_0_50px_rgba(0,255,255,0.1)] backdrop-blur-[20px] transition-[width] duration-400 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]"
			style="width: {leftWidth}px;"
			aria-hidden="false"
		>
			<div class="flex h-full flex-col gap-4 overflow-y-auto p-6">
				{#if selectedLoading}
					<div class="flex items-center gap-3 px-2 py-8">
						<div
							class="h-9 w-9 animate-spin rounded-full border-4 border-[rgba(255,255,255,0.06)] border-t-[rgba(0,255,255,0.7)]"
							aria-hidden="true"
						></div>
						<div class="font-semibold text-[rgba(255,255,255,0.75)]">
							Fetching data for {selectedName}…
						</div>
					</div>
				{:else if selectedInfo}
					<header
						class={`relative ${compact ? 'flex flex-col items-start gap-2' : 'flex flex-wrap items-start gap-4'}`}
					>
						<div class={`flex ${compact ? 'w-full items-start gap-3' : 'items-center gap-3'}`}>
							<div class="relative inline-block">
								<img
									class="h-32 w-auto rounded-lg object-contain contrast-[1.02] saturate-[0.95]"
									src={selectedInfo.flag}
									alt="{selectedName} flag"
								/>
								{#if showSources && getSource('flag')}
									<div
										class="absolute right-1 bottom-1 rounded border border-[rgba(0,255,255,0.3)] bg-[rgba(0,0,0,0.8)] px-2 py-[2px] text-[10px] font-medium text-[rgba(255,255,255,0.9)] shadow-[0_2px_8px_rgba(0,0,0,0.5)] backdrop-blur-[10px]"
									>
										{#if isSourceString(getSource('flag'))}
											({sourceLabel(getSource('flag'))})
										{:else}
											(<a
												href={sourceUrl(getSource('flag'))}
												target="_blank"
												rel="noopener noreferrer"
												class="ml-1 font-semibold text-[#bfefff] underline"
												>{sourceLabel(getSource('flag'))}</a
											>)
										{/if}
									</div>
								{/if}
							</div>
							{#if selectedInfo.coatOfArms !== 'UNKNOWN'}
								<div class="relative inline-block">
									<img
										class="h-32 w-auto rounded-lg bg-[rgba(0,0,0,0.02)] object-contain p-2"
										src={selectedInfo.coatOfArms}
										alt="{selectedName} coat of arms"
									/>
									{#if showSources && getSource('coatOfArms')}
										<div
											class="absolute right-1 bottom-1 rounded border border-[rgba(0,255,255,0.3)] bg-[rgba(0,0,0,0.8)] px-2 py-[2px] text-[10px] font-medium text-[rgba(255,255,255,0.9)] shadow-[0_2px_8px_rgba(0,0,0,0.5)] backdrop-blur-[10px]"
										>
											{#if isSourceString(getSource('coatOfArms'))}
												({sourceLabel(getSource('coatOfArms'))})
											{:else}
												(<a
													href={sourceUrl(getSource('coatOfArms'))}
													target="_blank"
													rel="noopener noreferrer"
													class="ml-1 font-semibold text-[#bfefff] underline"
													>{sourceLabel(getSource('coatOfArms'))}</a
												>)
											{/if}
										</div>
									{/if}
								</div>
							{/if}
						</div>

						<div class={`${compact ? 'mt-1 w-full pr-12' : 'flex min-w-0 flex-1 flex-col gap-2'}`}>
							<div class="text-[20px] leading-tight font-extrabold text-[#e6ffff]">
								{selectedInfo.officialName ?? selectedName}
								{#if showSources && getSource('officialName')}
									<span class="ml-1 text-[0.8em] font-normal opacity-60">
										{#if isSourceString(getSource('officialName'))}
											({sourceLabel(getSource('officialName'))})
										{:else}
											(<a
												href={sourceUrl(getSource('officialName'))}
												target="_blank"
												rel="noopener noreferrer"
												class="ml-1 font-semibold text-[#bfefff] underline"
												>{sourceLabel(getSource('officialName'))}</a
											>)
										{/if}
									</span>
								{/if}
							</div>

							<div class="mt-1 flex flex-wrap items-center gap-2">
								<span
									class="rounded-full border border-[rgba(0,255,255,0.06)] bg-[linear-gradient(135deg,rgba(0,255,255,0.06),rgba(0,200,255,0.02))] px-2 py-1 text-[12px] text-[#ccfbff] opacity-95"
								>
									{selectedInfo.region}
									{#if showSources && getSource('region')}
										<span class="ml-1 font-normal opacity-70"
											>·
											{#if isSourceString(getSource('region'))}
												({sourceLabel(getSource('region'))})
											{:else}
												(<a
													href={sourceUrl(getSource('region'))}
													target="_blank"
													rel="noopener noreferrer"
													class="ml-1 font-semibold text-[#bfefff] underline"
													>{sourceLabel(getSource('region'))}</a
												>)
											{/if}
										</span>
									{/if}
								</span>
								{#if selectedInfo.subregion}
									<span
										class="rounded-full border border-[rgba(255,255,255,0.04)] bg-transparent px-2 py-1 text-[12px] text-[#bfc9d1] opacity-60"
									>
										{selectedInfo.subregion}
										{#if showSources && getSource('subregion')}
											<span class="ml-1 font-normal opacity-70"
												>·
												{#if isSourceString(getSource('subregion'))}
													({sourceLabel(getSource('subregion'))})
												{:else}
													(<a
														href={sourceUrl(getSource('subregion'))}
														target="_blank"
														rel="noopener noreferrer"
														class="ml-1 font-semibold text-[#bfefff] underline"
														>{sourceLabel(getSource('subregion'))}</a
													>)
												{/if}
											</span>
										{/if}
									</span>
								{/if}
								<span class="ml-1 text-[14px] text-[#cccccc] opacity-70">
									Capital: {selectedInfo.capital}
									{#if showSources && getSource('capital')}
										<span class="ml-1 text-[0.8em] font-normal opacity-60">
											{#if isSourceString(getSource('capital'))}
												({sourceLabel(getSource('capital'))})
											{:else}
												(<a
													href={sourceUrl(getSource('capital'))}
													target="_blank"
													rel="noopener noreferrer"
													class="ml-1 font-semibold text-[#bfefff] underline"
													>{sourceLabel(getSource('capital'))}</a
												>)
											{/if}
										</span>
									{/if}
								</span>
								<span class="ml-1 text-[14px] text-[#cccccc] opacity-70">
									Population: {formatNumber(selectedInfo.population)}
									{#if showSources && getSource('population')}
										<span class="ml-1 text-[0.8em] font-normal opacity-60">
											{#if isSourceString(getSource('population'))}
												({sourceLabel(getSource('population'))})
											{:else}
												(<a
													href={sourceUrl(getSource('population'))}
													target="_blank"
													rel="noopener noreferrer"
													class="ml-1 font-semibold text-[#bfefff] underline"
													>{sourceLabel(getSource('population'))}</a
												>)
											{/if}
										</span>
									{/if}
								</span>
							</div>
						</div>

						<div
							class={`${compact ? 'absolute top-2 right-3 z-50 flex items-start gap-2' : 'flex items-start gap-2'}`}
						>
							<button
								on:click={() => (showSources = !showSources)}
								aria-pressed={showSources}
								aria-label="Toggle source attribution"
								title="Toggle source attribution"
								class={`transition-color flex h-10 min-w-[40px] cursor-pointer items-center justify-center rounded-lg border border-[rgba(255,255,255,0.15)] px-2 py-2 font-semibold backdrop-blur-[10px] duration-500 ${showSources ? 'bg-[linear-gradient(135deg,rgba(0,255,255,0.1),rgba(0,200,255,0.2))] text-[#00ffff]' : 'bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.1))] text-[rgba(255,255,255,0.7)]'}`}
							>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
									<path
										d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
									/>
								</svg>
							</button>
							<button
								on:click={closePanel}
								aria-label="Close info panel"
								class="flex h-10 min-w-[40px] cursor-pointer items-center justify-center rounded-lg border border-[rgba(0,255,255,0.3)] bg-[linear-gradient(135deg,rgba(0,255,255,0.1),rgba(0,200,255,0.2))] px-2 py-2 font-semibold text-[#00ffff] backdrop-blur-[10px] transition-transform duration-200"
								>✕</button
							>
						</div>
					</header>

					<section class="mt-3" aria-label="Key facts">
						<div class="grid grid-cols-2 gap-2">
							{#each [['Area', formatNumber(selectedInfo.area) + ' km²', getSource('area')], ['GDP (USD)', formatGDP(selectedInfo.gdp), getSource('gdp')], ['Gini', selectedInfo.gini ?? '—', getSource('gini')], ['Languages', formatLanguages(selectedInfo.languages), getSource('languages')]] as [label, value, source]}
								<div class={cardClass}>
									<div class={labelClass}>
										{label}
										{#if showSources && source}
											<span class="ml-1 text-[10px] font-normal opacity-60">
												{#if isSourceString(source)}
													({sourceLabel(source)})
												{:else}
													(<a
														href={sourceUrl(source)}
														target="_blank"
														rel="noopener noreferrer"
														class="ml-1 font-semibold text-[#bfefff] underline"
														>{sourceLabel(source)}</a
													>)
												{/if}
											</span>
										{/if}
									</div>
									<div class="text-[14px] font-extrabold text-white">{value}</div>
								</div>
							{/each}
						</div>
					</section>

					<nav class="mt-2 flex gap-2" aria-label="Country sections">
						{#each [['overview', 'Overview'], ['politics', 'Politics'], ['economics', 'Economy']] as [tab, label]}
							<button
								role="tab"
								aria-selected={activeTab === tab}
								on:click={() => setTab(tab)}
								class={buttonClass}>{label}</button
							>
						{/each}
					</nav>

					<section
						class="mt-3 overflow-auto rounded-xl border border-[rgba(0,255,255,0.03)] bg-[linear-gradient(180deg,rgba(0,0,0,0.02),rgba(255,255,255,0.01))] p-3 shadow-[0_8px_30px_rgba(0,255,255,0.02)]"
						aria-live="polite"
					>
						<div class="pr-1">
							{#each [['overview', selectedInfo.summary, getSource('summary')], ['politics', selectedInfo.politics, getSource('politics')], ['economics', selectedInfo.economics, getSource('economics')]] as [tab, content, source]}
								{#if activeTab === tab}
									<div class="rounded-xl bg-transparent p-0">
										<div
											class="mb-2 text-[13px] font-bold tracking-[0.5px] text-[#eaffff] uppercase"
										>
											{tab.charAt(0).toUpperCase() + tab.slice(1)}
											{#if showSources && source}
												<span class="ml-1 text-[10px] font-normal opacity-60">
													{#if isSourceString(source)}
														({sourceLabel(source)})
													{:else}
														(<a
															href={sourceUrl(source)}
															target="_blank"
															rel="noopener noreferrer"
															class="ml-1 font-semibold text-[#bfefff] underline"
															>{sourceLabel(source)}</a
														>)
													{/if}
												</span>
											{/if}
										</div>
										<p
											class="text-[14px] leading-[1.7] whitespace-pre-wrap text-[rgba(255,255,255,0.9)]"
										>
											{content}
										</p>
									</div>
								{/if}
							{/each}
						</div>
					</section>
				{:else}
					<div class="p-4 text-[rgba(255,255,255,0.9)]">
						<div class="font-bold">No Extended Data</div>
						<div class="text-[rgba(255,255,255,0.7)]">
							Additional information for this country is not yet available.
						</div>
					</div>
				{/if}
			</div>
		</div>

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
							class="animate-pulse fill-[rgba(0,255,255,0.08)] stroke-[rgba(0,255,255,0.95)] stroke-[3px] filter-[drop-shadow(0_0_20px_rgba(0,255,255,0.6))]"
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
	.svelte-slide-out {
		opacity: 0;
		transform-origin: left center;
	}
</style>
