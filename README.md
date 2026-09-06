# Military Coordinate Converter

[Open the app](https://adambrest.github.io/military-coordinate-converter/)

An offline-capable converter for WGS 84 latitude/longitude and Singapore, Taiwan, Thailand, Brunei and Australia military grids.

## Use

Choose **From** and **To**, enter or paste coordinates, then press **Convert**. Results can be copied, opened in Maps or downloaded as GPX.

For shortened Taiwan, Thailand and Australia references, confirm the 100 km square on the AO map. Pasting a nearby WGS 84 coordinate can select the square automatically. Output keeps full references outside the confirmed square.

Install through your browser's **Add to Home Screen** or **Install app** option. Updates are checked every minute while visible and when returning online; use **Update available** to apply them.

**Feedback** opens a GitHub issue. To receive feedback by email, watch this repository for Issues and enable email notifications in GitHub settings.

## Files

This is a static HTML/JavaScript app: no build step, Python or package installation is required.

- `index.html` — interface and conversion logic
- `proj4.js` — coordinate projections
- `australia-map.js` — bundled offline land and highway geometry
- `sw.js`, `version.js` — offline cache and updates
- `manifest.webmanifest`, `icons/` — installation and app icons

Serve the folder with any local HTTP server to develop. GitHub Pages publishes `main`; bump `version.js` when changing app assets.

## Map sources

Australia uses WGS 84 / UTM 56S across the Shoalwater Bay area, including its western extension. It is not an Australia-wide grid. The area spans several 100 km squares; the [official boundary map](https://www.legislation.gov.au/F2024L00990/asmade/2024-08-14/text/original/pdf) uses GDA2020 / MGA 56, a different reference frame from this app's WGS 84 convention.

- Coastline: simplified [Natural Earth land](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/), public domain; small offshore islands omitted.
- A1/Bruce Highway: [Queensland Foundation Data](https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Basemaps/FoundationData/MapServer/23), © State of Queensland (Department of Resources) 2024.
- Thailand Route 323: [OpenStreetMap](https://www.openstreetmap.org/copyright), © OpenStreetMap contributors, ODbL.
- Approximate camp landmarks: [Tilpal](https://mapcarta.com/W1436392763) and [Growl](https://en-gb.topographic-map.com/map-lvgsb3/Camp-Growl/). Map features are for orientation, not surveyed control points.
