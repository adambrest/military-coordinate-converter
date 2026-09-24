# Singapore offline map feasibility

An area download is not enabled with the current providers. Existing browser caching is a small, evictable cache of viewed tiles (1,400 tiles shared across layers), not a guaranteed offline map. The app shell and coordinate calculations work offline after installation. GPX contains points and routes, not a basemap.

## Planning sizes

These are **calculated estimates, not measured packages**. Bounds: 1.15–1.48° N, 103.59–104.10° E, covering the main island and nearby southern/northeastern islands plus surrounding water. This is not all Singapore territory: distant islands such as Pedra Branca require separate coverage. Counts include every XYZ tile intersecting that rectangle at zooms 0 through the stated maximum. No polygon clipping or deduplication is assumed.

Assume an average compressed tile of 20–60 kB **per layer**, with 256×256 raster tiles. Actual imagery and map compression can fall outside that range. MB/GB are decimal and exclude archive/browser storage overhead.

| Maximum zoom | Approx. ground resolution | Tiles per layer | Each layer | Satellite + topo + street |
| --- | --- | ---: | ---: | ---: |
| 15 | 4.8 m/pixel | 2,031 | 41–122 MB | 122–366 MB |
| 16 | 2.4 m/pixel | 7,765 | 155–466 MB | 466 MB–1.40 GB |
| 17 | 1.2 m/pixel | 30,392 | 608 MB–1.82 GB | 1.82–5.47 GB |
| 18 | 0.6 m/pixel | 120,285 | 2.41–7.22 GB | 7.22–21.65 GB |

Zoom 18 is illustrative: OpenTopoMap currently stops at native zoom 17, and satellite detail varies with coverage. Zooming beyond native detail enlarges the same tiles rather than adding information. A maximum zoom adds roughly four times as many tiles, so an exercise-area download is substantially smaller than this country rectangle. Raster street coverage through zoom 19 alone would contain 478,893 tiles, approximately 9.58–28.73 GB under these assumptions.

Formula: x=floor((longitude+180)/360 × 2^z); y=floor((1−asinh(tan(latitude))/π)/2 × 2^z). Sum the inclusive x-count × y-count at each zoom.

## Provider requirements and implementation path

- The current [OSM public tile server policy](https://operations.osmfoundation.org/policies/tiles/) prohibits prefetch/bulk downloads and offline-area features. Its open data license does not grant unrestricted use of that hosted tile service. Automatic tile warming has been removed.
- [Esri offline layers](https://doc.arcgis.com/en/arcgis-online/manage-data/take-maps-offline.htm) require a service with export/offline support enabled and the applicable account/licensing permissions. The current live World Imagery tile URL should not be treated as an offline export entitlement.
- Topographic tiles need explicit hosting/download terms suitable for bulk distribution; an attribution license alone does not establish server capacity or download permission.

A robust next implementation would use licensed downloadable packages or self-hosted tiles, sample actual encoded tile sizes, and present a selected-area/maximum-detail estimate before download. Store versioned packages separately from the rolling browser tile cache, verify completeness, support resume/delete, and check storage quota and persistence. Vector street/topo maps can reduce duplication across zoom levels; imagery remains raster. Provider selection and package production are required before promising a reliable country download.
