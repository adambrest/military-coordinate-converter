# Bundled dependencies

- Proj4js 2.15.0 (`../proj4.js`) — [source](https://github.com/proj4js/proj4js/tree/v2.15.0), MIT ([license](proj4-LICENSE.md)).
- Leaflet 1.9.4 — [source](https://github.com/Leaflet/Leaflet/tree/v1.9.4), BSD-2-Clause (`leaflet-LICENSE`).
- mgrs 2.2.0 — [source](https://github.com/proj4js/mgrs), MIT (`mgrs-LICENSE.md`).
- `land.geojson` — [Natural Earth 1:110m land](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson), public domain.
- `countries.geojson` — [Natural Earth 1:110m countries](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson), public domain. Retains country geometry, English names and label positions/zoom levels for the point picker's offline overview.

Street tiles are requested from OpenStreetMap. Satellite tiles come from Esri World Imagery. Neither is bundled in the repository. The app prefetches a small set around its approximate opening location and caches requested tiles in its service worker, with a shared limit of 1,400 tiles. Prefetching is skipped when the browser reports data-saving mode or a very slow connection. Map point selection still requires internet access.

The point picker also requests [Esri World Imagery](https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer) for the current satellite view. Attribution: Esri, Vantor, Earthstar Geographics, and the GIS User Community. Provider terms apply separately from the app's reuse permission.

Shared landmark positions in `map-context.js` are approximate orientation aids. Brunei additions use public map listings for [Jalan Aman](https://mapcarta.com/W1029646988) (OpenStreetMap-derived) and [Lakiun](https://brunei.worldplaces.me/military-bases/52929146-lakiun-camp.html). They are not surveyed camp boundaries.

- `shoalwater.geojson` — public [Queensland landmark-area data](https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Location/Places/FeatureServer/17), filtered to Shoalwater Bay Training Area and requested in latitude/longitude. © State of Queensland (Department of Natural Resources and Mines, Manufacturing, and Regional and Rural Development). Simplified for map context; it is separate from the converter preset’s supported bounds.

- `html2canvas.min.js`: html2canvas 1.4.1, vendored from https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js for local/offline map image export. MIT license in `html2canvas.LICENSE`. Configuration reference: https://html2canvas.hertzen.com/configuration.
