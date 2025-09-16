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
	gdp: number;
	summary: string;
	politics: string;
	economics: any;
	sources?: DataSources;
};
