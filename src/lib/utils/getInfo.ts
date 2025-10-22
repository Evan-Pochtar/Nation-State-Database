import type { DataSources, CountryData, GeoFeature } from '$lib/utils/types';
import { normalizeSources } from '$lib/utils/helpers';

export const indicators = {
	gdpPerCapita: 'NY.GDP.PCAP.CD',
	gdpGrowth: 'NY.GDP.MKTP.KD.ZG',
	inflation: 'FP.CPI.TOTL.ZG',
	unemployment: 'SL.UEM.TOTL.ZS',
	exports: 'NE.EXP.GNFS.CD',
	imports: 'NE.IMP.GNFS.CD',
	currentAccount: 'BN.CAB.XOKA.CD',
	fdi: 'BX.KLT.DINV.CD.WD',
	tradeBalance: 'NE.RSB.GNFS.CD',
	militaryExpenditure: 'MS.MIL.XPND.GD.ZS',
	researchDev: 'GB.XPD.RSDV.GD.ZS',
	internetUsers: 'IT.NET.USER.ZS',
	schoolEnrollment: 'SE.TER.ENRR',
	healthExpenditure: 'SH.XPD.CHEX.GD.ZS'
};

const inFlight = new Map<string, Promise<void>>();
const historyInFlight = new Map<string, Promise<void>>();

const latestOnlySet = new Set([
	indicators.exports,
	indicators.imports,
	indicators.currentAccount,
	indicators.fdi,
	indicators.tradeBalance,
	indicators.militaryExpenditure,
	indicators.researchDev,
	indicators.internetUsers,
	indicators.healthExpenditure
]);

let countriesDataCache: any = null;
let countriesDataPromise: Promise<any> | null = null;
async function getCountriesData(): Promise<any> {
	if (countriesDataCache) return countriesDataCache;
	if (countriesDataPromise) return countriesDataPromise;

	countriesDataPromise = (async () => {
		try {
			const localResp = await fetch('/data/countries-data.json');
			if (!localResp.ok) {
				console.warn('No local countries-data.json accessible:', localResp.status);
				return null;
			}
			const localJson = await localResp.json();
			countriesDataCache = localJson;
			return localJson;
		} catch (err) {
			console.warn('Error loading /data/countries-data.json', err);
			return null;
		}
	})();

	return countriesDataPromise;
}

export async function preloadCountryData(): Promise<void> {
	await getCountriesData();
}

export async function fetchCountryInfoByName(
	name: string | '',
	infoCache:
		| Record<string, { data?: CountryData | undefined; loading: boolean; error?: string | undefined }>
		| undefined
) {
	if (!infoCache) infoCache = {};
	if (!name || infoCache[name]?.data) return infoCache;
	if (infoCache[name]?.loading) return infoCache;

	infoCache[name] = { loading: true };
	try {
		const countriesData = await getCountriesData();
		let localEntry: any = null;

		if (countriesData) {
			localEntry = Array.isArray(countriesData)
				? (countriesData.find((e) => e.name === name) ?? null)
				: (countriesData[name] ?? Object.values(countriesData).find((e: any) => e.name === name) ?? null);
		}

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
		const economics = localEntry?.economics ?? null;
		let sources = normalizeSources(localEntry?.sources ?? {}, name);

		if (!summary || !cca2ID) {
			if (!summary) {
				try {
					const controller = new AbortController();
					const timeoutId = setTimeout(() => controller.abort(), 3000);
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

					if (res.ok) {
						const json = await res.json();
						const pages = json?.query?.pages;
						if (pages) {
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
						}
					}
				} catch (err) {
					console.warn('Wikipedia fetch failed', err);
					summary = 'No summary available.';
				}
			}

			if (!cca2ID) {
				try {
					const controller = new AbortController();
					const timeoutId = setTimeout(() => controller.abort(), 3000);
					const res = await fetch('https://restcountries.com/v3.1/name/' + encodeURIComponent(name), {
						signal: controller.signal
					});
					clearTimeout(timeoutId);

					if (res.ok) {
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

						if (restData) {
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
						}
					}
				} catch (err) {
					console.warn('RestCountries fetch failed', err);
				}
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
			summary: summary ?? '—',
			politics: localEntry?.politics ?? 'Data not provided.',
			economics: economics ?? 'Data not provided.',
			sources
		};

		if (!localEntry || (!localEntry.summary && !localEntry.cca2ID && summary)) {
			Promise.resolve().then(async () => {
				try {
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
							economics,
							sources
						})
					});
				} catch (err) {
					console.warn('Failed to persist country data', err);
				}
			});
		}
		infoCache[name] = { data, loading: false };
	} catch (err: any) {
		infoCache[name] = { loading: false, error: String(err) };
		console.error('Error fetching country info for', name, err);
	}
	return infoCache;
}

export async function fetchEconomicDataModule(params: {
	cca2ID: string;
	selectedInfo: CountryData | null;
	getInfoCache: () => Record<string, { data?: CountryData; loading: boolean; error?: string }>;
	setInfoCache: (newCache: Record<string, { data?: CountryData; loading: boolean; error?: string }>) => void;
	setSelectedInfo?: (newInfo: CountryData) => void;
	persist?: boolean;
}) {
	const { cca2ID, selectedInfo, getInfoCache, setInfoCache, setSelectedInfo, persist = true } = params;
	if (!cca2ID || cca2ID === 'UNKNOWN') return;

	const entryName = selectedInfo?.name ?? selectedInfo?.officialName ?? cca2ID;
	if (inFlight.has(entryName)) return inFlight.get(entryName)!;

	const job = (async () => {
		try {
			setInfoCache(
				(() => {
					const prev = getInfoCache();
					const next = { ...prev };
					next[entryName] = { ...(next[entryName] ?? { loading: false }), loading: true };
					return next;
				})()
			);

			const cache = getInfoCache();
			if (cache[entryName]?.data?.economics && cache[entryName].data.economics !== 'Data not provided.') {
				setInfoCache(
					(() => {
						const prev = getInfoCache();
						const next = { ...prev };
						next[entryName] = { ...(next[entryName] ?? {}), loading: false };
						return next;
					})()
				);
				return;
			}

			const countriesData = await getCountriesData();
			let localEntry: any = null;
			let sources: DataSources = {};
			if (countriesData) {
				localEntry = Array.isArray(countriesData)
					? (countriesData.find((e: any) => e.name === entryName) ?? null)
					: (countriesData[entryName] ?? Object.values(countriesData).find((e: any) => e.name === entryName) ?? null);
			}

			sources = normalizeSources(localEntry?.sources ?? {}, entryName);

			if (localEntry && Object.prototype.hasOwnProperty.call(localEntry, 'economics') && localEntry.economics) {
				setInfoCache(
					(() => {
						const prev = getInfoCache();
						const next = { ...prev };
						next[entryName] = {
							...(next[entryName] ?? {}),
							data: {
								...(next[entryName]?.data ?? selectedInfo ?? {}),
								economics: localEntry.economics
							} as CountryData,
							loading: false
						};
						return next;
					})()
				);

				if (setSelectedInfo && selectedInfo) {
					setSelectedInfo({ ...selectedInfo, economics: localEntry.economics });
				}
				return;
			}

			const allData: Record<string, any[]> = {};
			const timeSeriesIndicators = Object.values(indicators).filter((id) => !latestOnlySet.has(id));
			const latestOnlyIndicators = Object.values(indicators).filter((id) => latestOnlySet.has(id));
			if (timeSeriesIndicators.length > 0) {
				const batch = ['NY.GDP.PCAP.CD', 'NY.GDP.MKTP.KD.ZG', 'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS'];
				const indicatorString = batch.join(';');
				const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(cca2ID)}/indicator/${indicatorString}?source=2&format=json&date=2014:2024`;
				try {
					const res = await fetch(url);
					if (!res.ok) throw new Error(`WorldBank API error ${res.status}`);
					const json = await res.json();
					if (!Array.isArray(json) || !json[1]) throw new Error('No data returned');
					json[1].forEach((item: any) => {
						const id = item.indicator.id;
						if (item.value !== null) {
							if (!allData[id]) allData[id] = [];
							allData[id].push({ year: parseInt(item.date, 10), value: item.value, indicator: item.indicator.value });
						}
					});
				} catch (err) {
					console.warn(`Failed time series batch ${indicatorString}`, err);
				}
			}

			if (latestOnlyIndicators.length > 0) {
				const indicatorString = latestOnlyIndicators.join(';');
				const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(cca2ID)}/indicator/${indicatorString}?source=2&format=json&date=2022:2024`;
				try {
					const res = await fetch(url);
					if (!res.ok) throw new Error(`WorldBank API error ${res.status}`);
					const json = await res.json();
					if (!Array.isArray(json) || !json[1]) throw new Error('No data returned');
					const bucket: Record<string, any[]> = {};
					json[1].forEach((item: any) => {
						const id = item.indicator.id;
						if (!bucket[id]) bucket[id] = [];
						if (item.value !== null) {
							bucket[id].push({ year: parseInt(item.date, 10), value: item.value, indicator: item.indicator.value });
						}
					});
					for (const id of Object.keys(bucket)) {
						const arr = bucket[id];
						if (!arr.length) continue;
						arr.sort((a, b) => a.year - b.year);
						const latest = arr[arr.length - 1];
						allData[id] = [{ year: latest.year, value: latest.value, indicator: latest.indicator }];
					}
				} catch (err) {
					console.warn('Failed to fetch latest-only indicators', err);
				}
			}

			Object.keys(allData).forEach((k) => allData[k].sort((a: any, b: any) => a.year - b.year));

			setInfoCache(
				(() => {
					const prev = getInfoCache();
					const next = { ...prev };
					next[entryName] = {
						...(next[entryName] ?? {}),
						data: { ...(next[entryName]?.data ?? selectedInfo ?? {}), economics: allData } as CountryData,
						loading: false
					};
					return next;
				})()
			);

			if (setSelectedInfo && selectedInfo) {
				setSelectedInfo({ ...selectedInfo, economics: allData });
			}

			if (persist) {
				(async () => {
					try {
						const shouldPersist = !localEntry || (!localEntry.economics && Object.keys(allData).length > 0);
						if (!shouldPersist) return;
						const econSource = {
							label: 'World Bank',
							url: `https://api.worldbank.org/v2/country/${encodeURIComponent(cca2ID)}/indicator`
						};
						Object.assign(sources, { ...(!sources.economics ? { economics: econSource } : {}) });

						await fetch('/api', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								name: entryName,
								economics: allData,
								sources
							})
						});
					} catch (err) {
						console.warn('Failed to persist economic data', err);
					}
				})();
			}
		} catch (err) {
			console.error('Economic data fetch error:', err);
			setInfoCache(
				(() => {
					const prev = getInfoCache();
					const next = { ...prev };
					next[entryName] = { ...(next[entryName] ?? {}), loading: false, error: 'Failed to load economic data' };
					return next;
				})()
			);
		} finally {
			inFlight.delete(entryName);
		}
	})();

	inFlight.set(entryName, job);
	return job;
}

export async function fetchHistoryDataModule(params: {
	name: string;
	selectedInfo: CountryData | null;
	getInfoCache: () => Record<string, { data?: CountryData; loading: boolean; error?: string }>;
	setInfoCache: (newCache: Record<string, { data?: CountryData; loading: boolean; error?: string }>) => void;
	setSelectedInfo?: (newInfo: CountryData) => void;
	persist?: boolean;
}) {
	const { name, selectedInfo, getInfoCache, setInfoCache, setSelectedInfo, persist = false } = params;

	if (!name) return;

	if (historyInFlight.has(name)) return historyInFlight.get(name)!;

	const job = (async () => {
		try {
			setInfoCache(
				(() => {
					const prev = getInfoCache();
					const next = { ...prev };
					next[name] = { ...(next[name] ?? { loading: false }), loading: true };
					return next;
				})()
			);

			const cache = getInfoCache();
			if (cache[name]?.data?.history && cache[name].data.history !== 'Data not provided.') {
				setInfoCache(
					(() => {
						const prev = getInfoCache();
						const next = { ...prev };
						next[name] = { ...(next[name] ?? {}), loading: false };
						return next;
					})()
				);
				return;
			}

			let historyEntry: any = null;

			try {
				const localResp = await fetch('/data/countries-history.json');
				if (localResp.ok) {
					const localJson = await localResp.json();
					historyEntry = Array.isArray(localJson)
						? (localJson.find((e: any) => e.name === name) ?? null)
						: (localJson[name] ?? null);
				} else {
					console.warn('No local countries-history.json accessible:', localResp.status);
				}
			} catch (err) {
				console.warn('Error loading /data/countries-history.json', err);
			}

			if (historyEntry) {
				setInfoCache(
					(() => {
						const prev = getInfoCache();
						const next = { ...prev };
						next[name] = {
							...(next[name] ?? {}),
							data: {
								...(next[name]?.data ?? selectedInfo ?? {}),
								history: historyEntry
							} as any,
							loading: false
						};
						return next;
					})()
				);

				if (setSelectedInfo && selectedInfo) {
					setSelectedInfo({ ...selectedInfo, history: historyEntry } as any);
				}

				if (persist) {
					Promise.resolve().then(async () => {
						try {
							await fetch('/api/history', {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({
									name,
									history: historyEntry
								})
							});
						} catch (err) {
							console.warn('Failed to persist history data', err);
						}
					});
				}
			} else {
				setInfoCache(
					(() => {
						const prev = getInfoCache();
						const next = { ...prev };
						next[name] = {
							...(next[name] ?? {}),
							loading: false,
							error: 'No history data available for this country'
						};
						return next;
					})()
				);
			}
		} catch (err) {
			console.error('History data fetch error:', err);
			setInfoCache(
				(() => {
					const prev = getInfoCache();
					const next = { ...prev };
					next[name] = { ...(next[name] ?? {}), loading: false, error: 'Failed to load history data' };
					return next;
				})()
			);
		} finally {
			historyInFlight.delete(name);
		}
	})();

	historyInFlight.set(name, job);
	return job;
}

let loadingBatch = false;

export async function batchLoadCountryData(
	countries: GeoFeature[],
	infoCache: Record<string, { data?: CountryData; loading: boolean; error?: string }>
): Promise<Record<string, { data?: CountryData; loading: boolean; error?: string }>> {
	if (loadingBatch) {
		console.log('Batch loading already in progress');
		return infoCache;
	}

	loadingBatch = true;
	const cache = { ...infoCache };

	try {
		const countriesData = await getCountriesData();
		if (!countriesData) {
			console.error('Failed to load countries-data.json');
			return infoCache;
		}

		const dataMap = new Map<string, any>();
		if (Array.isArray(countriesData)) {
			countriesData.forEach((entry: any) => {
				if (entry.name) {
					dataMap.set(entry.name.toLowerCase(), entry);
				}
			});
		} else {
			Object.values(countriesData).forEach((entry: any) => {
				if (entry.name) {
					dataMap.set(entry.name.toLowerCase(), entry);
				}
			});
		}

		let loaded = 0;
		const total = countries.length;
		countries.forEach((country) => {
			const name = country.properties?.name;
			if (!name) return;
			if (cache[name]?.data) return;

			const localEntry = dataMap.get(name.toLowerCase());
			if (localEntry) {
				const sources = normalizeSources(localEntry.sources ?? {}, name);
				const data: CountryData = {
					name: localEntry.name ?? name,
					cca2ID: localEntry.cca2ID ?? 'UNKNOWN',
					officialName: localEntry.officialName ?? 'UNKNOWN',
					flag: localEntry.flag ?? 'UNKNOWN',
					coatOfArms: localEntry.coatOfArms ?? 'UNKNOWN',
					independent: localEntry.independent ?? false,
					region: localEntry.region ?? 'UNKNOWN',
					subregion: localEntry.subregion ?? 'UNKNOWN',
					area: localEntry.area ?? -1,
					languages: localEntry.languages ?? [],
					capital: localEntry.capital ?? '—',
					population: localEntry.population ?? -1,
					gini: localEntry.gini ?? -1,
					summary: localEntry.summary ?? '—',
					politics: localEntry.politics ?? 'Data not provided.',
					economics: localEntry.economics ?? 'Data not provided.',
					sources
				};
				cache[name] = { data, loading: false };
				loaded++;
			} else {
				cache[name] = {
					loading: false,
					error: 'No data available for this country'
				};
			}
		});
		console.log(`Loaded data for ${loaded}/${total} countries from local JSON`);
	} catch (err) {
		console.error('Error batch loading country data:', err);
	} finally {
		loadingBatch = false;
	}

	return cache;
}

export function getLoadProgress(
	countries: GeoFeature[],
	infoCache: Record<string, { data?: CountryData; loading: boolean; error?: string }>
): { loaded: number; total: number; percentage: number } {
	const total = countries.length;
	const loaded = countries.filter((c) => {
		const name = c.properties?.name;
		return name && infoCache[name]?.data;
	}).length;

	return {
		loaded,
		total,
		percentage: total > 0 ? Math.round((loaded / total) * 100) : 0
	};
}
