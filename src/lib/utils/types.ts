export type GeoFeature = GeoJSON.Feature<GeoJSON.Geometry, Record<string, any>>;
export type SourceValue = string | { label: string; url?: string };

export type DataSources = {
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

export type CountryData = {
	name: string;
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
	summary: string;
	politics: string;
	economics?: any;
	history?: any;
	sources?: DataSources;
};

export interface HistoryData {
	name: string;
	overview?: string;
	source?: {
		label: string;
		url: string;
	};
	keyFacts?: Array<{
		label: string;
		value: string;
	}>;
	ancient?: {
		period: string;
		description: string;
		keyEvents?: Array<{
			year: string;
			title: string;
			description?: string;
		}>;
		notableFigures?: string[];
	};
	colonial?: {
		period: string;
		description: string;
		keyEvents?: Array<{
			year: string;
			title: string;
			description?: string;
		}>;
		notableFigures?: string[];
	};
	independence?: {
		period: string;
		description: string;
		keyEvents?: Array<{
			year: string;
			title: string;
			description?: string;
		}>;
		notableFigures?: string[];
	};
	modern?: {
		period: string;
		description: string;
		keyEvents?: Array<{
			year: string;
			title: string;
			description?: string;
		}>;
		notableFigures?: string[];
	};
	timeline?: Array<{
		year: string;
		era: string;
		title: string;
		description: string;
	}>;
}
