# Bundled dependencies

- Leaflet 1.9.4 — [source](https://github.com/Leaflet/Leaflet/tree/v1.9.4), BSD-2-Clause (`leaflet-LICENSE`).
- mgrs 2.2.0 — [source](https://github.com/proj4js/mgrs), MIT (`mgrs-LICENSE.md`).
- `land.geojson` — [Natural Earth 1:110m land](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson), public domain.
- `countries.geojson` — [Natural Earth 1:110m countries](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson), public domain. Retains country geometry, English names and label positions/zoom levels for the point picker's offline overview.

Street tiles are requested from OpenStreetMap only for the current view; they are not bundled or prefetched for offline use.

The point picker also requests [Esri World Imagery](https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer) for the current satellite view. Attribution: Esri, Vantor, Earthstar Geographics, and the GIS User Community. Imagery is not bundled, prefetched or cached by the app's service worker; provider terms apply separately from the app's reuse permission.

Shared landmark positions in `map-context.js` are approximate orientation aids. Brunei additions use public map listings for [Jalan Aman](https://mapcarta.com/W1029646988) (OpenStreetMap-derived) and [Lakiun](https://brunei.worldplaces.me/military-bases/52929146-lakiun-camp.html). They are not surveyed camp boundaries.
