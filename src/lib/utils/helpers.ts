import type { SourceValue, DataSources, CountryData } from '$lib/utils/types';

export function formatNumber(n: number | undefined, decimals: number = 2): string {
	if (!n && n !== 0) return '—';
	const abs = Math.abs(n);

	if (abs >= 1_000_000_000_000) return (n / 1_000_000_000_000).toFixed(decimals) + 'T';
	if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(decimals) + 'B';
	if (abs >= 1_000_000) return (n / 1_000_000).toFixed(decimals) + 'M';
	if (abs >= 1_000) return (n / 1_000).toFixed(decimals) + 'K';
	return String(Math.round(abs));
}

export function formatCurrency(
	value: number | undefined,
	options: { compact?: boolean; decimals?: number } = {}
): string {
	if (!value && value !== 0) return '—';

	const { compact = false, decimals = 0 } = options;

	if (compact) {
		return `$${formatNumber(value, decimals === 0 ? 2 : decimals)}`;
	}

	return `$${value.toLocaleString('en-US', { maximumFractionDigits: decimals })}`;
}

export function formatGDP(val: number | undefined): string {
	if (!val && val !== 0) return '—';
	return `${formatCurrency(val)} · ${formatCurrency(val, { compact: true })}`;
}

export function formatPercentage(value: number | undefined, decimals: number = 1): string {
	if (value == null) return 'N/A';
	return `${value.toFixed(decimals)}%`;
}

export function formatGini(value: number | undefined): string {
	if (!value || value <= 0) return '—';
	return value.toFixed(1);
}

export function formatEconomicValue(value: number, type: string): string {
	if (value == null) return 'N/A';

	switch (type) {
		case 'gdpPerCapita':
			return formatCurrency(Math.round(value));
		case 'gdpGrowth':
		case 'inflation':
		case 'unemployment':
		case 'militaryExpenditure':
		case 'researchDev':
		case 'internetUsers':
		case 'healthExpenditure':
			return formatPercentage(value);
		case 'exports':
		case 'imports':
		case 'currentAccount':
		case 'fdi':
		case 'tradeBalance':
			return formatGDP(value);
		default:
			return formatNumber(value);
	}
}

export function formatLanguages(langs: unknown): string {
	if (!langs) return '—';
	if (Array.isArray(langs)) return langs.join(', ');
	if (typeof langs === 'string') return langs;
	if (typeof langs === 'object') return Object.values(langs as Record<string, any>).join(', ');
	return String(langs);
}

export function isSourceString(s: unknown): s is string {
	return typeof s === 'string';
}

export function sourceLabel(s: SourceValue | null): string {
	if (!s) return '';
	return typeof s === 'string' ? s : (s.label ?? '');
}

export function sourceUrl(s: SourceValue | null): string {
	if (!s || typeof s === 'string') return '#';
	return s.url ?? '#';
}

export function getSource(field: keyof DataSources, selectedInfo: CountryData | null): SourceValue | null {
	return selectedInfo?.sources?.[field] || null;
}

export function normalizeSources(raw: any, nameForWikipediaHint?: string): DataSources {
	const out: DataSources = {};
	if (!raw || typeof raw !== 'object') return out;

	for (const [k, v] of Object.entries(raw) as [keyof DataSources, any][]) {
		if (typeof v === 'string') {
			const lower = v.toLowerCase();
			if (lower.includes('wiki')) {
				out[k] = { label: v, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(nameForWikipediaHint ?? '')}` };
			} else if (lower.includes('rest')) {
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
