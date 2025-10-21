import * as d3 from 'd3';
import type { CountryData, DataType, ChloroplethData } from './types';

export function extractMostRecentValue(economics: any, indicator: string): number | null {
	if (!economics || !economics[indicator] || !Array.isArray(economics[indicator])) {
		return null;
	}

	const data = economics[indicator];
	if (data.length === 0) return null;

	const sorted = [...data].sort((a, b) => b.year - a.year);
	return sorted[0]?.value ?? null;
}

export function getGDPPerCapita(country: CountryData): number | null {
	return extractMostRecentValue(country.economics, 'NY.GDP.PCAP.CD');
}

export function getGDP(country: CountryData): number | null {
	const gdpPerCapita = extractMostRecentValue(country.economics, 'NY.GDP.PCAP.CD');
	if (gdpPerCapita === null || !country.population || country.population <= 0) {
		return null;
	}
	return gdpPerCapita * country.population;
}

export function getGini(country: CountryData): number | null {
	if (typeof country.gini === 'number' && country.gini > 0) {
		return country.gini;
	}
	return null;
}

export function buildChloroplethData(
	countries: any[],
	infoCache: Record<string, { data?: CountryData; loading: boolean; error?: string }>,
	dataType: DataType
): ChloroplethData {
	const values = new Map<string, number>();
	let min = Infinity;
	let max = -Infinity;

	countries.forEach((country, idx) => {
		const name = country.properties?.name;
		if (!name) return;

		const cachedData = infoCache[name]?.data;
		if (!cachedData) return;

		let value: number | null = null;

		switch (dataType) {
			case 'gdpPerCapita':
				value = getGDPPerCapita(cachedData);
				break;
			case 'gdp':
				value = getGDP(cachedData);
				break;
			case 'gini':
				value = getGini(cachedData);
				break;
		}

		if (value !== null && !isNaN(value) && value > 0) {
			// Apply log transformation for GDP data
			if (dataType === 'gdp' || dataType === 'gdpPerCapita') {
				value = Math.log10(value);
			}

			values.set(idx.toString(), value);
			if (value < min) min = value;
			if (value > max) max = value;
		}
	});

	if (min === Infinity) min = 0;
	if (max === -Infinity) max = 100;
	if (min === max) max = min + 1;
	let colorScale: d3.ScaleSequential<string>;

	switch (dataType) {
		case 'gini':
			colorScale = d3.scaleSequential(d3.interpolateRdYlGn).domain([max, min]);
			break;
		case 'gdp':
		case 'gdpPerCapita':
			colorScale = d3.scaleSequential(d3.interpolateViridis).domain([min, max]);
			break;
	}

	return {
		min,
		max,
		values,
		colorScale
	};
}

export function getChloroplethColor(
	index: number,
	chloroplethData: ChloroplethData | null,
	fallback: string = '#64748b'
): string {
	if (!chloroplethData) return fallback;

	const value = chloroplethData.values.get(index.toString());
	if (value === undefined) return fallback;

	return chloroplethData.colorScale(value);
}

export function formatDataValue(value: number, dataType: DataType, isLogScale: boolean = false): string {
	let displayValue = value;
	if (isLogScale && (dataType === 'gdp' || dataType === 'gdpPerCapita')) {
		displayValue = Math.pow(10, value);
	}

	switch (dataType) {
		case 'gdp':
			if (displayValue >= 1e12) {
				return `$${(displayValue / 1e12).toFixed(2)}T`;
			} else if (displayValue >= 1e9) {
				return `$${(displayValue / 1e9).toFixed(2)}B`;
			} else if (displayValue >= 1e6) {
				return `$${(displayValue / 1e6).toFixed(2)}M`;
			}
			return `$${displayValue.toFixed(0)}`;
		case 'gdpPerCapita':
			return `$${displayValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
		case 'gini':
			return displayValue.toFixed(1);
	}
}

export function getDataLabel(dataType: DataType): string {
	switch (dataType) {
		case 'gdp':
			return 'GDP (Total)';
		case 'gdpPerCapita':
			return 'GDP per Capita';
		case 'gini':
			return 'Gini Index';
	}
}
