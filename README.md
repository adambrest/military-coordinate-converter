# Military Coordinate Converter

[Open the app](https://adambrest.github.io/military-coordinate-converter/)

Convert latitude/longitude, global WGS 84 MGRS, and military grids for Singapore, Taiwan, Thailand, Brunei and Australia.

## Use

Paste a coordinate or Maps link. For a short grid reference, select its AO on the map. References crossing AOs keep their full prefixes.

Conversion and AO grids work offline after caching; street maps need internet. Check the datum in Settings against your issued map.

## Map sources

Map context is approximate.

- Streets and Route 323: [OpenStreetMap](https://www.openstreetmap.org/copyright)
- Offline land and coastline: [Natural Earth](https://www.naturalearthdata.com/)
- Bruce Highway: [Queensland Government](https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Basemaps/FoundationData/MapServer/23)
- Camp references: [Tilpal](https://mapcarta.com/W1436392763), [Growl](https://en-gb.topographic-map.com/map-lvgsb3/Camp-Growl/)

Map: [Leaflet](https://leafletjs.com/). Global grids: [mgrs](https://github.com/proj4js/mgrs). Bundled licences are in `vendor/`.
