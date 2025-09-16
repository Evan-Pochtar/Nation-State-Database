import type { SourceValue, DataSources, CountryData } from '$lib/utils/types';

export async function fetchCountryInfoByName(
	name: string | '',
	infoCache:
		| Record<string, { data?: CountryData | undefined; loading: boolean; error?: string | undefined }>
		| undefined
) {
	if (!infoCache) infoCache = {};
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
		const economics = localEntry?.economics ?? null;
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
				const restData =
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
			name,
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
			economics: economics ?? 'Data not provided.',
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
							economics,
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

	return infoCache;
}

export function normalizeSources(raw: any, nameForWikipediaHint?: string): DataSources {
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
