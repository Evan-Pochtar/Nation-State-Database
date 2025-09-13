# Nation-State Database

This repository contains a lightweight, high-performance SvelteKit prototype that renders a fullscreen, black-and-white SVG world map. Selecting a country opens a resizable information panel on the left and triggers a smooth D3-driven zoom on the right, highlighting the chosen nation while preserving its geographic context. The project serves as a proof-of-concept for a modern, static-asset-only nation information UI. No database. No server-side geometry processing. Map rendering is fully client-side.

The prototype currently retrieves basic country information from several APIs, including Wikipedia, RestCountries, and the World Bank for economic data. Future development will expand this with better visualizations, descriptive content, and historical context.

Currently, the JSON file containing finalized country descriptions is not included in the repository but will be added once completed.

## Features

* Fullscreen topojson and GeoJSON SVG map.
* D3 zoom/pan with constrained bounds.
* Resizable left info panel with keyboard access.
* Country data from local JSON, Wikipedia, RestCountries, World Bank.
* Local caching and optional POST persistence to `/api`.

## Required files

* `data/countries-map.json` (topojson) - required, included in repository.
* `data/countries-data.json` - optional local metadata/descriptions, will be created automatically by the server
* Optional server endpoint to accept `POST /api` if persistence is desired.

## Run

```bash
npm install
npm run dev
```

## Notes

Component works without server persistence. Add `countries-data.json` to avoid external API calls.

## License

This project is open source. Please check the LICENSE file for details.
