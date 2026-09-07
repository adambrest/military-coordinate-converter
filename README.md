# Military Coordinate Converter

[Open the app](https://adambrest.github.io/military-coordinate-converter/)

Convert latitude/longitude, global WGS 84 MGRS, and military grids for Singapore, Taiwan, Thailand, Brunei and Australia.

## Use

Paste a coordinate or Maps link. For a shortened grid reference, select its AO on the map. Global references include letter prefixes; crossing an AO boundary forces full prefixes.

Conversion, grid overlays and landmark context work offline after the app is cached. Street maps need internet. Singapore and Brunei presets use different datums from global WGS 84.

## Australia datum

WGS 84 / GDA2020 use one approximate Zone 56S conversion (spheroids: WGS 84 / GRS80); epoch-dependent shifts are not modelled. The issued-map datum remains unconfirmed. The [government training-area map](https://www.agriculture.gov.au/sites/default/files/documents/e2022-0197-map-shoalwater-bay.pdf) uses GDA2020 / MGA 56.

## Map sources

Map context is approximate.

- Basemap: [OpenStreetMap](https://www.openstreetmap.org/copyright); offline land: [Natural Earth](https://www.naturalearthdata.com/)
- Bruce Highway: [Queensland Government](https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Basemaps/FoundationData/MapServer/23)
- Thailand Route 323: [OpenStreetMap](https://www.openstreetmap.org/copyright)
- Camp landmarks: [Tilpal](https://mapcarta.com/W1436392763) and [Growl](https://en-gb.topographic-map.com/map-lvgsb3/Camp-Growl/)

Map: [Leaflet](https://leafletjs.com/). Global grids: [mgrs](https://github.com/proj4js/mgrs). Bundled licences are in `vendor/`.
