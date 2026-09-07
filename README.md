# Military Coordinate Converter

[Open the app](https://adambrest.github.io/military-coordinate-converter/)

Convert latitude/longitude, global WGS 84 MGRS, and military grids for Singapore, Taiwan, Thailand, Brunei and Australia.

## Use

Start with Auto-detect: paste coordinates or a Maps link, or type and leave the field to detect. Enter detects and adds another row. Examples at Mount Echo Park: UTM `48N 368831.814 143329.716`, MGRS `48N UG 6883 4332`. For an ambiguous grid, choose its country; select an AO only when needed. Complete references need no AO selection. References crossing AOs keep their full prefixes.

Global coordinates (WGS 84) offers MGRS, UTM and Web Mercator formats. UTM/Garmin input assumes WGS 84; ambiguous `S` needs `UTM 51S` (southern hemisphere) or `51S band` (latitude band). Web Mercator metres need an `EPSG:3857` label or its format selection.

Conversion and AO grids work offline after caching; street maps need internet. Check the datum in Settings against your issued map.

Raw WGS 84 can use a 100 km square or a larger grid zone; larger zones require square letters. Output precision is configurable in Settings.

## Map sources

Map context is approximate.

- Streets and Route 323: [OpenStreetMap](https://www.openstreetmap.org/copyright)
- Offline land, coastline and Taiwan boundary: [Natural Earth](https://www.naturalearthdata.com/)
- Bruce Highway: [Queensland Government](https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Basemaps/FoundationData/MapServer/23)
- Camp references: [Tilpal](https://mapcarta.com/W1436392763), [Growl](https://en-gb.topographic-map.com/map-lvgsb3/Camp-Growl/)

Map: [Leaflet](https://leafletjs.com/). Global grids: [mgrs](https://github.com/proj4js/mgrs). Bundled licences are in `vendor/`.

Usage analytics: [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/).
