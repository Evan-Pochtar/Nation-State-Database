# Nation-State Database

A high-performance interactive world map built with SvelteKit, D3.js, and Svelte 5. Click any country to explore detailed information including demographics, economics, and history—all rendered client-side with smooth animations and data visualizations.

This project serves as a comprehensive nation information platform that combines geographic visualization with clean visuals. Unlike database/server-driven applications, it operates entirely through static assets and client-side processing, making it fast and easily deployable. The interface is mainly a fullscreen interactive map that responds to user interaction with D3-powered zoom animations, while a resizable information panel presents country data including economic indicators with historical charts, political summaries, and detailed historical timelines.

The application manages data fetching from multiple sources while maintaining local caches to minimize API calls and speed up response times. Data can be optionally persisted to static JSON files (all of which is located within the repo), creating a self-improving dataset that grows more complete with each use. Multiple visualization modes include traditional geographic themes and chloropleth maps that color countries by economic metrics like GDP or income inequality, with interactive legends and tooltips.

## Required Files

- `static/data/countries-map.json` - TopoJSON map data (included)
- `static/data/countries-data.json` - Country metadata and descriptions (auto-generated, full file available)
- `static/data/countries-history.json` - Historical data (optional, needed for history tab)

## Quick Start

```bash
npm install
npm run dev
```

Visit `http://localhost:5173`.

## API Endpoints

- `POST /api` - Persists country data to `countries-data.json`
- `POST /api/history` - Persists historical data to `countries-history.json`
- `GET /api/history` - Retrieves historical data

These endpoints are optional. The app works without server-side persistence by caching data in memory.

## Technology Stack

- **SvelteKit** - Framework with file-based routing
- **Svelte 5** - UI with runes-based reactivity
- **D3.js** - Geographic projections, zoom/pan, and scales
- **TopoJSON** - Efficient map topology storage
- **Tailwind CSS** - Utility-first styling

## License

This project is open source. Please check the LICENSE file for details.
