<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import * as d3 from 'd3';
	import { feature } from 'topojson-client';

	type GeoFeature = GeoJSON.Feature<GeoJSON.Geometry, Record<string, any>>;

	type SourceValue = string | { label: string; url?: string };

	type DataSources = {
		flag?: SourceValue;
		coatOfArms?: SourceValue;
		summary?: SourceValue;
		officialName?: SourceValue;
		capital?: SourceValue;
		population?: SourceValue;
		area?: SourceValue;
		languages?: SourceValue;
		region?: SourceValue;
		subregion?: SourceValue;
		independent?: SourceValue;
		gini?: SourceValue;
		gdp?: SourceValue;
		politics?: SourceValue;
		economics?: SourceValue;
	};

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
		sources?: DataSources;
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

	let showSources = false;

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
			let sources: DataSources = {};

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
				sources = normalizeSources(localEntry.sources ?? {}, name);
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
					sources = {
						...(sources || {}),
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
						{
							signal: controller.signal
						}
					);
					clearTimeout(timeoutId);

					if (!res.ok) throw new Error(`RestCountries API error ${res.status}`);
					const json = await res.json();
					console.log(json[0]);

					cca2ID = json[0].cca2 ?? 'UNKNOWN';
					officialName = json[0].name.official ?? 'UNKNOWN';
					flag = json[0].flags.svg ?? 'UNKNOWN';
					coatOfArms = json[0].coatOfArms.svg ?? 'UNKNOWN';
					capital = json[0].capital ? json[0].capital[0] : '—';
					independent = json[0].independent ?? false;
					region = json[0].region ?? 'UNKNOWN';
					subregion = json[0].subregion ?? 'UNKNOWN';
					area = json[0].area ?? 0;
					languages = json[0].languages ?? [];
					population = json[0].population ?? 0;
					gini = json[0].gini ? (json[0].gini[Object.keys(json[0].gini ?? {})[0]] ?? 0) : 0;

					const restUrl = `https://restcountries.com/v3.1/name/${encodeURIComponent(name)}`;
					if (!sources.flag) sources.flag = { label: 'REST Countries', url: restUrl };
					if (!sources.coatOfArms) sources.coatOfArms = { label: 'REST Countries', url: restUrl };
					if (!sources.officialName)
						sources.officialName = { label: 'REST Countries', url: restUrl };
					if (!sources.capital) sources.capital = { label: 'REST Countries', url: restUrl };
					if (!sources.independent) sources.independent = { label: 'REST Countries', url: restUrl };
					if (!sources.region) sources.region = { label: 'REST Countries', url: restUrl };
					if (!sources.subregion) sources.subregion = { label: 'REST Countries', url: restUrl };
					if (!sources.area) sources.area = { label: 'REST Countries', url: restUrl };
					if (!sources.languages) sources.languages = { label: 'REST Countries', url: restUrl };
					if (!sources.population) sources.population = { label: 'REST Countries', url: restUrl };
					if (!sources.gini) sources.gini = { label: 'REST Countries', url: restUrl };
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
				economics: localEntry?.economics ?? 'Data not provided.',
				sources: sources
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
								gdp,
								sources
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
									gdp,
									sources
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

	function getSource(field: keyof DataSources): SourceValue | null {
		if (!selectedInfo?.sources) return null;
		return (selectedInfo.sources as any)[field] || null;
	}

	function toggleSources() {
		showSources = !showSources;
	}
</script>

<div
	class="fixed inset-0 flex h-screen w-screen overflow-hidden bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#0a0a0a_100%)] font-sans text-white"
	tabindex="-1"
>
	{#if selectedFeature}
		<div
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
					<header class="flex flex-wrap items-start gap-4">
						<div class="flex items-center gap-3">
							<div class="relative inline-block">
								<img
									class="h-[140px] w-[240px] rounded-lg object-cover contrast-[1.02] saturate-[0.95] filter"
									src={selectedInfo.flag}
									alt="{selectedName} flag"
								/>
								{#if showSources && getSource('flag')}
									{#if typeof getSource('flag') === 'string'}
										<div
											class="absolute right-1 bottom-1 rounded border border-[rgba(0,255,255,0.3)] bg-[rgba(0,0,0,0.8)] px-2 py-[2px] text-[10px] font-medium text-[rgba(255,255,255,0.9)] shadow-[0_2px_8px_rgba(0,0,0,0.5)] backdrop-blur-[10px]"
										>
											{getSource('flag')}
										</div>
									{:else}
										<div
											class="absolute right-1 bottom-1 rounded border border-[rgba(0,255,255,0.3)] bg-[rgba(0,0,0,0.8)] px-2 py-[2px] text-[10px] font-medium text-[rgba(255,255,255,0.9)] shadow-[0_2px_8px_rgba(0,0,0,0.5)] backdrop-blur-[10px]"
										>
											<a
												href={(getSource('flag') as any).url ?? '#'}
												target="_blank"
												rel="noopener noreferrer"
												class="font-semibold text-[#bfefff] underline"
												>{(getSource('flag') as any).label}</a
											>
										</div>
									{/if}
								{/if}
							</div>

							<div class="relative inline-block">
								<img
									class="h-[140px] w-[140px] self-center rounded-lg bg-[rgba(0,0,0,0.02)] object-contain p-2"
									src={selectedInfo.coatOfArms}
									alt="{selectedName} coat of arms"
								/>
								{#if showSources && getSource('coatOfArms')}
									{#if typeof getSource('coatOfArms') === 'string'}
										<div
											class="absolute right-1 bottom-1 rounded border border-[rgba(0,255,255,0.3)] bg-[rgba(0,0,0,0.8)] px-2 py-[2px] text-[10px] font-medium text-[rgba(255,255,255,0.9)] shadow-[0_2px_8px_rgba(0,0,0,0.5)] backdrop-blur-[10px]"
										>
											{getSource('coatOfArms')}
										</div>
									{:else}
										<div
											class="absolute right-1 bottom-1 rounded border border-[rgba(0,255,255,0.3)] bg-[rgba(0,0,0,0.8)] px-2 py-[2px] text-[10px] font-medium text-[rgba(255,255,255,0.9)] shadow-[0_2px_8px_rgba(0,0,0,0.5)] backdrop-blur-[10px]"
										>
											<a
												href={(getSource('coatOfArms') as any).url ?? '#'}
												target="_blank"
												rel="noopener noreferrer"
												class="font-semibold text-[#bfefff] underline"
												>{(getSource('coatOfArms') as any).label}</a
											>
										</div>
									{/if}
								{/if}
							</div>
						</div>

						<div class="flex min-w-0 flex-1 flex-col gap-2">
							<div class="text-[20px] leading-tight font-extrabold text-[#e6ffff]">
								{selectedInfo.officialName ?? selectedName}
								{#if showSources && getSource('officialName')}
									<span class="ml-1 text-[0.8em] font-normal opacity-60">
										(
										{#if typeof getSource('officialName') === 'string'}
											{getSource('officialName')}
										{:else}
											<a
												href={(getSource('officialName') as any).url ?? '#'}
												target="_blank"
												rel="noopener noreferrer"
												class="ml-1 font-semibold text-[#bfefff] underline"
												>{(getSource('officialName') as any).label}</a
											>
										{/if}
										)
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
											{#if typeof getSource('region') === 'string'}
												{getSource('region')}
											{:else}
												<a
													href={(getSource('region') as any).url ?? '#'}
													target="_blank"
													rel="noopener noreferrer"
													class="ml-1 font-semibold text-[#bfefff] underline"
													>{(getSource('region') as any).label}</a
												>
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
												{#if typeof getSource('subregion') === 'string'}
													{getSource('subregion')}
												{:else}
													<a
														href={(getSource('subregion') as any).url ?? '#'}
														target="_blank"
														rel="noopener noreferrer"
														class="ml-1 font-semibold text-[#bfefff] underline"
														>{(getSource('subregion') as any).label}</a
													>
												{/if}
											</span>
										{/if}
									</span>
								{/if}

								<span class="ml-1 text-[14px] text-[#cccccc] opacity-70">
									Capital: {selectedInfo.capital}
									{#if showSources && getSource('capital')}
										<span class="ml-1 text-[0.8em] font-normal opacity-60"
											>(
											{#if typeof getSource('capital') === 'string'}
												{getSource('capital')}
											{:else}
												<a
													href={(getSource('capital') as any).url ?? '#'}
													target="_blank"
													rel="noopener noreferrer"
													class="ml-1 font-semibold text-[#bfefff] underline"
													>{(getSource('capital') as any).label}</a
												>
											{/if}
											)</span
										>
									{/if}
								</span>

								<span class="ml-1 text-[14px] text-[#cccccc] opacity-70">
									Population: {formatNumber(selectedInfo.population)}
									{#if showSources && getSource('population')}
										<span class="ml-1 text-[0.8em] font-normal opacity-60"
											>(
											{#if typeof getSource('population') === 'string'}
												{getSource('population')}
											{:else}
												<a
													href={(getSource('population') as any).url ?? '#'}
													target="_blank"
													rel="noopener noreferrer"
													class="ml-1 font-semibold text-[#bfefff] underline"
													>{(getSource('population') as any).label}</a
												>
											{/if}
											)</span
										>
									{/if}
								</span>
							</div>
						</div>

						<div class="flex items-start gap-2">
							<button
								on:click={toggleSources}
								aria-label="Toggle source attribution"
								title="Toggle source attribution"
								class="flex cursor-pointer items-center justify-center rounded-lg border border-[rgba(255,255,255,0.15)] bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.1))] px-2 py-2 text-[12px] text-[rgba(255,255,255,0.7)] backdrop-blur-[10px] transition-transform duration-200"
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
								class="h-10 cursor-pointer rounded-lg border border-[rgba(0,255,255,0.3)] bg-[linear-gradient(135deg,rgba(0,255,255,0.1),rgba(0,200,255,0.2))] px-2 py-2 font-semibold text-[#00ffff] backdrop-blur-[10px] transition-transform duration-200"
								>✕</button
							>
						</div>
					</header>

					<section class="mt-3" aria-label="Key facts">
						<div class="grid grid-cols-2 gap-2">
							<div
								class="rounded-xl border border-[rgba(0,255,255,0.04)] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(0,0,0,0.03))] p-2 shadow-[0_6px_18px_rgba(0,255,255,0.02)] backdrop-blur-[6px]"
							>
								<div
									class="mb-1 text-[11px] tracking-[0.6px] text-[rgba(255,255,255,0.6)] uppercase"
								>
									Area
									{#if showSources && getSource('area')}
										<span class="ml-1 text-[10px] font-normal opacity-60"
											>(
											{#if typeof getSource('area') === 'string'}
												{getSource('area')}
											{:else}
												<a
													href={(getSource('area') as any).url ?? '#'}
													target="_blank"
													rel="noopener noreferrer"
													class="ml-1 font-semibold text-[#bfefff] underline"
													>{(getSource('area') as any).label}</a
												>
											{/if}
											)</span
										>
									{/if}
								</div>
								<div class="text-[14px] font-extrabold text-white">
									{formatNumber(selectedInfo.area)} km²
								</div>
							</div>

							<div
								class="rounded-xl border border-[rgba(0,255,255,0.04)] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(0,0,0,0.03))] p-2 shadow-[0_6px_18px_rgba(0,255,255,0.02)] backdrop-blur-[6px]"
							>
								<div
									class="mb-1 text-[11px] tracking-[0.6px] text-[rgba(255,255,255,0.6)] uppercase"
								>
									GDP (USD)
									{#if showSources && getSource('gdp')}
										<span class="ml-1 text-[10px] font-normal opacity-60"
											>(
											{#if typeof getSource('gdp') === 'string'}
												{getSource('gdp')}
											{:else}
												<a
													href={(getSource('gdp') as any).url ?? '#'}
													target="_blank"
													rel="noopener noreferrer"
													class="ml-1 font-semibold text-[#bfefff] underline"
													>{(getSource('gdp') as any).label}</a
												>
											{/if}
											)</span
										>
									{/if}
								</div>
								<div class="text-[14px] font-extrabold text-white">
									{formatGDP(selectedInfo.gdp)}
								</div>
							</div>

							<div
								class="rounded-xl border border-[rgba(0,255,255,0.04)] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(0,0,0,0.03))] p-2 shadow-[0_6px_18px_rgba(0,255,255,0.02)] backdrop-blur-[6px]"
							>
								<div
									class="mb-1 text-[11px] tracking-[0.6px] text-[rgba(255,255,255,0.6)] uppercase"
								>
									Gini
									{#if showSources && getSource('gini')}
										<span class="ml-1 text-[10px] font-normal opacity-60"
											>(
											{#if typeof getSource('gini') === 'string'}
												{getSource('gini')}
											{:else}
												<a
													href={(getSource('gini') as any).url ?? '#'}
													target="_blank"
													rel="noopener noreferrer"
													class="ml-1 font-semibold text-[#bfefff] underline"
													>{(getSource('gini') as any).label}</a
												>
											{/if}
											)</span
										>
									{/if}
								</div>
								<div class="text-[14px] font-extrabold text-white">{selectedInfo.gini ?? '—'}</div>
							</div>

							<div
								class="rounded-xl border border-[rgba(0,255,255,0.04)] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(0,0,0,0.03))] p-2 shadow-[0_6px_18px_rgba(0,255,255,0.02)] backdrop-blur-[6px]"
							>
								<div
									class="mb-1 text-[11px] tracking-[0.6px] text-[rgba(255,255,255,0.6)] uppercase"
								>
									Languages
									{#if showSources && getSource('languages')}
										<span class="ml-1 text-[10px] font-normal opacity-60"
											>(
											{#if typeof getSource('languages') === 'string'}
												{getSource('languages')}
											{:else}
												<a
													href={(getSource('languages') as any).url ?? '#'}
													target="_blank"
													rel="noopener noreferrer"
													class="ml-1 font-semibold text-[#bfefff] underline"
													>{(getSource('languages') as any).label}</a
												>
											{/if}
											)</span
										>
									{/if}
								</div>
								<div class="text-[14px] font-extrabold text-white">
									{formatLanguages(selectedInfo.languages)}
								</div>
							</div>
						</div>
					</section>

					<nav class="mt-2 flex gap-2" aria-label="Country sections">
						<button
							role="tab"
							aria-selected={activeTab === 'overview'}
							on:click={() => setTab('overview')}
							class="cursor-pointer rounded-lg border border-[rgba(0,255,255,0.04)] bg-[linear-gradient(90deg,rgba(255,255,255,0.01),rgba(0,0,0,0.02))] px-3 py-2 font-extrabold text-[#dffbff] transition-transform duration-160"
							>Overview</button
						>

						<button
							role="tab"
							aria-selected={activeTab === 'politics'}
							on:click={() => setTab('politics')}
							class="cursor-pointer rounded-lg border border-[rgba(0,255,255,0.04)] bg-[linear-gradient(90deg,rgba(255,255,255,0.01),rgba(0,0,0,0.02))] px-3 py-2 font-extrabold text-[#dffbff] transition-transform duration-160"
							>Politics</button
						>

						<button
							role="tab"
							aria-selected={activeTab === 'economics'}
							on:click={() => setTab('economics')}
							class="cursor-pointer rounded-lg border border-[rgba(0,255,255,0.04)] bg-[linear-gradient(90deg,rgba(255,255,255,0.01),rgba(0,0,0,0.02))] px-3 py-2 font-extrabold text-[#dffbff] transition-transform duration-160"
							>Economy</button
						>
					</nav>

					<section
						class="mt-3 max-h-[46vh] overflow-auto rounded-xl border border-[rgba(0,255,255,0.03)] bg-[linear-gradient(180deg,rgba(0,0,0,0.02),rgba(255,255,255,0.01))] p-3 shadow-[0_8px_30px_rgba(0,255,255,0.02)]"
						aria-live="polite"
					>
						<div class="pr-1">
							{#if activeTab === 'overview'}
								<div class="rounded-xl bg-transparent p-0">
									<div class="mb-2 text-[13px] font-bold tracking-[0.5px] text-[#eaffff] uppercase">
										Overview
										{#if showSources && getSource('summary')}
											<span class="ml-1 text-[10px] font-normal opacity-60"
												>(
												{#if typeof getSource('summary') === 'string'}
													{getSource('summary')}
												{:else}
													<a
														href={(getSource('summary') as any).url ?? '#'}
														target="_blank"
														rel="noopener noreferrer"
														class="ml-1 font-semibold text-[#bfefff] underline"
														>{(getSource('summary') as any).label}</a
													>
												{/if}
												)</span
											>
										{/if}
									</div>
									<p
										class="text-[14px] leading-[1.7] whitespace-pre-wrap text-[rgba(255,255,255,0.9)]"
									>
										{selectedInfo.summary}
									</p>
								</div>
							{:else if activeTab === 'politics'}
								<div class="rounded-xl bg-transparent p-0">
									<div class="mb-2 text-[13px] font-bold tracking-[0.5px] text-[#eaffff] uppercase">
										Politics
										{#if showSources && getSource('politics')}
											<span class="ml-1 text-[10px] font-normal opacity-60"
												>(
												{#if typeof getSource('politics') === 'string'}
													{getSource('politics')}
												{:else}
													<a
														href={(getSource('politics') as any).url ?? '#'}
														target="_blank"
														rel="noopener noreferrer"
														class="ml-1 font-semibold text-[#bfefff] underline"
														>{(getSource('politics') as any).label}</a
													>
												{/if}
												)</span
											>
										{/if}
									</div>
									<p
										class="text-[14px] leading-[1.7] whitespace-pre-wrap text-[rgba(255,255,255,0.9)]"
									>
										{selectedInfo.politics}
									</p>
								</div>
							{:else}
								<div class="rounded-xl bg-transparent p-0">
									<div class="mb-2 text-[13px] font-bold tracking-[0.5px] text-[#eaffff] uppercase">
										Economy
										{#if showSources && getSource('economics')}
											<span class="ml-1 text-[10px] font-normal opacity-60"
												>(
												{#if typeof getSource('economics') === 'string'}
													{getSource('economics')}
												{:else}
													<a
														href={(getSource('economics') as any).url ?? '#'}
														target="_blank"
														rel="noopener noreferrer"
														class="ml-1 font-semibold text-[#bfefff] underline"
														>{(getSource('economics') as any).label}</a
													>
												{/if}
												)</span
											>
										{/if}
									</div>
									<p
										class="text-[14px] leading-[1.7] whitespace-pre-wrap text-[rgba(255,255,255,0.9)]"
									>
										{selectedInfo.economics}
									</p>
								</div>
							{/if}
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

		<div
			class="absolute top-5 right-5 z-50 rounded-lg border border-[rgba(255,255,255,0.2)] bg-[linear-gradient(135deg,rgba(16,16,16,0.9),rgba(8,8,8,0.95))] px-4 py-3 font-mono text-[14px] text-white shadow-[0_0_30px_rgba(255,255,255,0.1)] backdrop-blur-[15px] select-none"
			aria-hidden="false"
		>
			{formatClock(now)}
		</div>
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
