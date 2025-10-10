import type { CountryData } from '$lib/utils/types';
import { fetchCountryInfoByName, fetchEconomicDataModule } from './getInfo';

type Options = { persist?: boolean; delayMs?: number };

function normalizeName(s?: string) {
	return (s ?? '').trim().toLowerCase();
}

function findLocalEntryByName(name: string, localJson: any) {
	if (!localJson) return null;
	const n = normalizeName(name);
	// array or object
	const candidates = Array.isArray(localJson) ? localJson : Object.values(localJson);
	for (const entry of candidates) {
		if (!entry) continue;
		// check various name fields
		const checks = [
			entry.name,
			entry.officialName,
			entry.cca2ID,
			entry.cca3ID,
			entry.altNames,
			entry.altSpellings,
			entry.title,
			entry.country
		].flatMap((v: any) => (Array.isArray(v) ? v : [v]).filter(Boolean));
		for (const c of checks) {
			if (normalizeName(String(c)) === n) return entry;
		}
		// fallback: compare by includes for longer names
		if (normalizeName(entry.name).includes(n) || n.includes(normalizeName(entry.name))) return entry;
	}
	return null;
}

function hasEconomics(entry: any) {
	if (!entry) return false;
	if (!entry.economics) return false;
	if (typeof entry.economics === 'object' && Object.keys(entry.economics).length > 0) {
		// ensure there's at least one numeric / year entry under an indicator
		return Object.values(entry.economics).some((v: any) => (Array.isArray(v) ? v.length > 0 : Boolean(v)));
	}
	return false;
}

export async function gatherAllCountriesData(opts: Options = {}) {
	const persist = opts.persist ?? true;
	const delayMs = opts.delayMs ?? 0;

	// load map file and extract names
	const mapResp = await fetch('/data/countries-map.json');
	if (!mapResp.ok) throw new Error('Failed to load /data/countries-map.json');
	const mapJson: any = await mapResp.json();

	let mapNames: string[] = [];
	if (Array.isArray(mapJson)) {
		mapNames = mapJson.map((e) => e.name ?? e.properties?.name).filter(Boolean);
	} else if (mapJson?.features && Array.isArray(mapJson.features)) {
		mapNames = mapJson.features
			.map((f: any) => f.properties?.name ?? f.properties?.ADMIN ?? f.properties?.NAME ?? f.properties?.admin)
			.filter(Boolean);
	} else if (mapJson?.objects) {
		for (const o of Object.values(mapJson.objects)) {
			if ((o as { geometries?: any[] })?.geometries && Array.isArray((o as { geometries?: any[] }).geometries)) {
				for (const g of (o as { geometries?: any[] }).geometries ?? []) {
					const n = g.properties?.name ?? g.properties?.ADMIN ?? g.properties?.NAME ?? g.properties?.admin;
					if (n) mapNames.push(n);
				}
			}
		}
	}
	mapNames = Array.from(new Set(mapNames)).sort();

	// in-memory cache used by getInfo/fetchEconomicDataModule
	let infoCache: Record<string, { data?: CountryData; loading: boolean; error?: string }> = {};
	const getInfoCache = () => infoCache;
	const setInfoCache = (newCache: typeof infoCache) => {
		infoCache = newCache;
	};

	const results = {
		totalCountriesInMap: mapNames.length,
		skippedFullyPopulated: 0,
		fetchedSummaries: 0,
		fetchedEconomics: 0,
		errors: [] as { name: string; error: any }[]
	};

	// process sequentially
	for (const name of mapNames) {
		try {
			// always re-load the local countries-data.json to get latest persisted state
			let localJson: any = null;
			try {
				const dataResp = await fetch('/data/countries-data.json');
				if (dataResp.ok) localJson = await dataResp.json();
			} catch {
				localJson = null;
			}

			const localEntry = findLocalEntryByName(name, localJson);

			const needSummary =
				!localEntry ||
				!localEntry.summary ||
				localEntry.summary === 'No summary available.' ||
				localEntry.summary === '—';
			const needCca2 = !localEntry || !localEntry.cca2ID || localEntry.cca2ID === 'UNKNOWN';
			const needEconomics = !hasEconomics(localEntry);

			// if nothing to do skip
			if (!needSummary && !needCca2 && !needEconomics) {
				results.skippedFullyPopulated++;
				continue;
			}

			// First, fetch summary / metadata. This call itself checks local file and will skip if present.
			await fetchCountryInfoByName(name, infoCache);
			results.fetchedSummaries++;

			// determine the best selectedInfo and cca2ID for economics
			const selectedInfo = infoCache[name]?.data ?? localEntry ?? null;
			let cca2ID = selectedInfo?.cca2ID ?? localEntry?.cca2ID ?? null;

			// If still missing cca2ID then try to derive from officialName or cca3 if present
			if ((!cca2ID || cca2ID === 'UNKNOWN') && selectedInfo?.officialName) {
				cca2ID = selectedInfo.cca2ID ?? null;
			}

			// Only fetch economics if needed and we have a usable cca2ID
			if (needEconomics) {
				if (!cca2ID || cca2ID === 'UNKNOWN') {
					try {
						const afterResp = await fetch('/data/countries-data.json');
						if (afterResp.ok) {
							const afterJson = await afterResp.json();
							const afterEntry = findLocalEntryByName(name, afterJson);
							if (afterEntry?.cca2ID && afterEntry.cca2ID !== 'UNKNOWN') cca2ID = afterEntry.cca2ID;
						}
					} catch {
						/* empty */
					}
				}

				if (cca2ID && cca2ID !== 'UNKNOWN') {
					await fetchEconomicDataModule({
						cca2ID,
						selectedInfo: selectedInfo ?? null,
						getInfoCache,
						setInfoCache,
						persist
					});
					results.fetchedEconomics++;
				} else {
					// cannot fetch economics without a valid cca2ID
					results.errors.push({ name, error: 'No valid cca2ID available for economic fetch' });
				}
			}

			// small optional delay to reduce race conditions if user wants (defaults to 0)
			if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
		} catch (err) {
			results.errors.push({ name, error: err });
		}
	}

	return results;
}
