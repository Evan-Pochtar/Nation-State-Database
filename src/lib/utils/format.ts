export function formatNumber(n: number | undefined) {
	if (!n && n !== 0) return '—';
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

export function isSourceString(s: unknown) {
	return typeof s === 'string';
}
export function sourceLabel(s: any) {
	return typeof s === 'string' ? s : (s?.label ?? '');
}
export function sourceUrl(s: any) {
	return typeof s === 'string' ? null : (s?.url ?? '#');
}
