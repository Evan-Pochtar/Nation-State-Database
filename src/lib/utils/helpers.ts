import type { SourceValue, DataSources, CountryData } from '$lib/utils/types';

export function formatNumber(n: number | undefined): string {
	if (!n && n !== 0) return '—';
	if (n < 0) return '-' + formatNumber(-n);
	const abs = Math.abs(Math.round(n));
	if (abs >= 1_000_000_000) return (abs / 1_000_000_000).toFixed(2) + 'B';
	if (abs >= 1_000_000) return (abs / 1_000_000).toFixed(2) + 'M';
	if (abs >= 1_000) return (abs / 1_000).toFixed(2) + 'K';
	return String(abs);
}

export function formatGDP(val: number | undefined) {
	if (!val && val !== 0) return '—';
	const full = Number(val).toLocaleString('en-US', { maximumFractionDigits: 0 });
	const abbr = formatNumber(val);
	return `$${full} · ${abbr}`;
}

export function formatLanguages(langs: unknown): string {
	if (!langs) return '—';
	if (Array.isArray(langs)) return langs.join(', ');
	if (typeof langs === 'string') return langs;
	if (typeof langs === 'object') return Object.values(langs as Record<string, any>).join(', ');
	return String(langs);
}

export function formatValue(value: number, type: string): string {
	if (value === null || value === undefined) return 'N/A';

	switch (type) {
		case 'gdpPerCapita':
			return `$${formatNumber(Math.round(value))}`;
		case 'gdpGrowth':
		case 'inflation':
		case 'unemployment':
		case 'militaryExpenditure':
		case 'researchDev':
		case 'internetUsers':
		case 'healthExpenditure':
			return `${value.toFixed(1)}%`;
		case 'exports':
		case 'imports':
		case 'currentAccount':
		case 'fdi':
		case 'tradeBalance':
			return `${formatGDP(value)}`;
		default:
			return formatNumber(value);
	}
}

export function isSourceString(s: unknown) {
	return typeof s === 'string';
}
export function sourceLabel(s: any) {
	return typeof s === 'string' ? s : (s?.label ?? '');
}
export function sourceUrl(s: any) {
	return typeof s === 'string' ? null : (s?.url ?? '#');
}
export function getSource(field: keyof DataSources, selectedInfo: CountryData | null): SourceValue | null {
	return selectedInfo?.sources?.[field] || null;
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
