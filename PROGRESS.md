# Mike Golf Romeo — progress and handoff

## Current instruction
Work in the ORIGINAL repository and folder. User canceled MapTiler and the separate-repository plan. Rebrand the existing app, add GPX import, ordered-route distance, and a dedicated map-first Point Picker with copy/export and kilometer grid overlays. Keep OSM/Esri and nonintrusive IP/timezone location estimates.

## Consolidation
No second GitHub repository was created or deployed. The temporary sibling clone contained only this journal and an unused MapTiler dependency installation; no feature code. That dependency is not being merged. Original remote remains adambrest/military-coordinate-converter to preserve the existing site URL.

## Plan
1. GPX parser/export, segmented horizontal distance, meaningful tests.
2. Leaflet Point Picker workspace: multi-selection, names, formats, copy, GPX, route toggle, grid overlay, training boundary, street/satellite.
3. Converter GPX import and distance output; rebrand manifest/docs/UI.
4. Existing regression tests + new browser tests; visual mobile/desktop checks.
5. Commit/push original repository and verify Pages; journal records exact remaining limitations.

## Decisions
- No MapTiler account, key, SDK, dependency or billing.
- Keep original repository name and local folder for compatibility; product name becomes Mike Golf Romeo.
- Route distance means horizontal distance along supplied points, not pathfinding. GPX track/route segment breaks must not add artificial connecting distance.
- Street and satellite remain online services; offline coordinate conversion and bundled geographic fallback remain available. No promise of universally available offline imagery.
- 3D is deferred with MapTiler canceled; current Leaflet renderer is 2D.

## Status
Implementation starting. Resume by reading this file and git diff/status. Work in this folder only.

## Implemented milestone
- Original repo/local folder retained; temporary sibling clone removed after confirming no feature code existed there. No second remote repo exists.
- Product title, manifest, GPX creator and package name changed to Mike Golf Romeo; version 3.0.0.
- Added route-tools.js: local GPX parsing with namespace support, input validation, size/point limits, segmented distance and export.
- Added field-map.js/css and Point Picker tab: separate persisted collection, crosshair/tap addition, names, undo, copy, street/satellite, fit, GPX, converter transfer, training overlay and 1 km grid labels.
- Converter supports additive GPX import, ordered distance and segmented source tracking.
- Service worker includes new local assets. No MapTiler changes/dependencies in this repo.
- README documents scope and limits.

## Verification in progress
Existing unit suite, existing mobile suite and new field-browser.cjs are running. First real browser smoke check showed four GPX track points across two segments total 3.14 km and transfer preserved that total. Version assertion updated for 3.0.0.

## Known intentional limits
2D only; no new contours/Topo/Outdoor provider. Global 1 km overlay draws the center UTM zone/band, not all adjacent zones simultaneously. Large GPX list is capped visually at 300 rows; all 20,000 permitted points remain included in calculations/export. Converter table cap is 2,000 points. Satellite in the new workspace uses conservative native zoom 17 (existing modal retains its dynamic coverage logic).

## Verification milestone
- 197 unit tests passed (existing converter suite + GPX/distance tests).
- Existing mobile suite passed on Chromium/Pixel 7 and WebKit/iPhone 13. An initial 380 ms double-tap timing failure under concurrent browser load did not reproduce when run on its own; no gesture code was changed.
- New workspace tests exercised both engines: addition, naming, undo, persistence, grid labels, malformed GPX rejection, segmented distance, transfer/reload and export. Fixed a test-only WebKit MIME type in the analytics stub; final run pending.
- Inspected desktop live-OSM grid screenshot and mobile workspace layout. Moved map zoom controls away from the grid's top/left labels.
- Reloading global MGRS in a country preset region still invokes the existing country-grid confirmation. After the choice, GPX distance remains 3.14 km across two separated segments.

## Release verification
All checks pass:
- npm test: 197 tests, 0 failures.
- npm run test:browser: Chromium/Pixel 7 and WebKit/iPhone 13 passed.
- npm run test:field: both engines passed; includes clipboard output, satellite selection, and adding points with network disabled.
- git diff --check: clean.
- Runtime/package/service-worker files contain no MapTiler integration or dependency.

## Publishing
Version 3.0.0 is ready. Commit/push to the existing main branch and verify GitHub Pages serves version.js 3.0.0. Product rebrand intentionally preserves repository name and public URL.

## Follow-up opportunities (not required for this release)
- Evaluate a separate contour/topographic source if requested; no new map provider was selected.
- Optional simultaneous neighboring-zone grid rendering, and improved imagery coverage handling in the new workspace.
- Large-track point-list virtualisation/editing beyond the first 300 visible entries.
- True offline basemap packages would require a separate implementation; existing online providers are still a network dependency.

## Published source
Release commit: 3b1b6b3, pushed to origin/main on 2026-09-21.
GitHub Pages run: https://github.com/adambrest/military-coordinate-converter/actions/runs/35585376526
At this journal checkpoint the Pages runner is queued; source is published, but the public site still serves 2.3.0. To resume deployment verification, inspect the latest Pages run and request https://adambrest.github.io/military-coordinate-converter/version.js with a cache-busting query. Expected version: 3.0.0. No implementation work remains for the release scope.

## Deployment verified (2026-09-21)
Release scope is complete and live. GitHub Pages now serves 3.0.0.
- https://adambrest.github.io/military-coordinate-converter/version.js returns `APP_VERSION = "3.0.0"` with cache busting.
- field-map.js, field-map.css, route-tools.js, sw.js, manifest.webmanifest and index.html all return 200 and match the local files byte for byte.
- Live manifest name is "Mike Golf Romeo"; live title is "Mike Golf Romeo — Coordinate Converter".
- Re-ran all three suites on the released tree: npm test 197 passed / 0 failed; test:browser passed Chromium/Pixel 7 and WebKit/iPhone 13; test:field passed both engines.
Nothing remains for the 3.0.0 release.

## Topo/Outdoor provider evaluation (research only, nothing wired up)
Probed keyless candidates directly at Temburong (4.58 N, 115.16 E) and Singapore (1.35 N, 103.82 E), z13-z19, and inspected rendered tiles.

Viable:
- OpenTopoMap — real labeled contours with index-contour values and hillshade over Temburong; the closest match to the canceled MapTiler Topo. `https://{a,b,c}.tile.opentopomap.org/{z}/{x}/{y}.png`. Native max zoom is 17: z18 and z19 return a byte-identical placeholder, so set maxNativeZoom 17 and let Leaflet overzoom. CC-BY-SA 3.0, attribution "Map data: © OpenStreetMap contributors, SRTM | Map rendering: © OpenTopoMap (CC-BY-SA)". Volunteer servers, no uptime guarantee, no mass downloads; contours are SRTM-derived (~30 m), so they are terrain shape, not survey-grade.
- CyclOSM — also labeled contours plus stronger hillshade, and renders past z17 where OpenTopoMap stops. Busier styling. `https://{a,b,c}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png`, OSM-France community servers.

Rejected, with evidence:
- Esri World_Topo_Map — covers the area at all zooms but contours over Temburong are faint, gray and unlabeled; poor for field use despite sharing the already-used arcgisonline host.
- Esri NatGeo_World_Map and World_Shaded_Relief — return Esri's blank no-data tile (2521 bytes, md5 f27d9de7f80c13501f470595e327aa6d) across the region.
- Esri World_Hillshade — blank above z15 at Temburong, z16 at Singapore.
- WaymarkedTrails hiking overlay — empty tiles (116-163 bytes); no route coverage in Brunei or Singapore.
- AWS Terrarium DEM — 404s above z15; usable only as a DEM source for client-side contour generation, not as a basemap.

Key-required options (Thunderforest Outdoors, Stadia/Stamen, Tracestrack) were not probed: all need an API key, and Stadia's free tier excludes commercial use. Recommendation if a topo layer is wanted: add OpenTopoMap as a third basemap next to street and satellite, capped at maxNativeZoom 17, with the CC-BY-SA attribution string above.

## Version 3.1.0 - topo basemap, output view and paste fixes (2026-09-21)
Released. Commit 943971c, pushed to origin/main on 2026-09-21.

Basemaps
- map-support.js now owns BASEMAPS/basemap()/basemapId(), so every map surface shares one url, zoom ceiling and credit. Topo is the default.
- Topo is OpenTopoMap at maxNativeZoom 17 (18 and 19 are the same placeholder tile). Street is OpenStreetMap, satellite is Esri, both unchanged.
- Three-way toggle in the Point Picker tab (fieldLayer select, choice persisted) and in the converter's map picker (pointTopo/pointStreet/pointSatellite). Existing controls kept: region jump, 1 km grid, tap to add, satellite coverage probing.
- sw.js caches tiles from the a/b/c OpenTopoMap subdomains by domain match.
- Tile prefetch deliberately still warms only OpenStreetMap and Esri. OpenTopoMap asks that its volunteer servers not take speculative bulk downloads, so its tiles are cached only once actually viewed.

Read-only output view
- New "View on map" button beside Open in Maps opens the converted output points in the existing picker with readOnly set: no crosshair, no Add buttons, Enter does not add, the title reads "Output points" and the view fits every point. Closing it does not overwrite the view the input picker returns to.

Paste and link resolution
- A label run onto its link ("MLP3https://…") is split, so the label is kept as the point name. A url carried in a parameter ("continue=https://…") is left whole.
- Every short link in a paste is now followed in one pass instead of one re-paste per link, so a line the converter cannot read can no longer strand the remaining links. Repeated links are asked once and substituted everywhere.
- Auto-detect reads a mixed paste of links and prefixless grid references: digits alone are treated as a grid reference and take their reference area from the points pasted alongside them, instead of being rejected as an out-of-range latitude.
- A link still being followed is abandoned when its own row is deleted or its coordinate cells are edited, clearing the busy cell and the "Following the link…" message. A name typed while waiting, or an edit in another row, does not call it off. The row keeps the pasted text while it waits, as a failed read does, so it stays visible, undoable and deletable; leaving it blank instead had made the delete button inert and the wait impossible to call off.

Language
- American spellings throughout runtime, docs and tests ("Add center point", "center zone", "kilometer labels", neighbor, canceled, labeled, gray).

Tests
- npm test: 203 passed, 0 failed (6 new: read-only output view, read-only view isolation, glued label plus batched links, cancellation on delete/edit, cancellation scoping, mixed link and grid paste).
- npm run test:browser and npm run test:field: both engines passed, including a new check that Topo is the opening layer and stops at native zoom 17.
- One transient failure appeared in a back-to-back run of all three suites and did not reproduce in five further runs, including deliberate contention. It matches the load-timing flake already recorded above; its assertion text was lost to a truncated capture.

## Release verification 3.1.0
- Pages run 35594576015 succeeded in 43 s; https://adambrest.github.io/military-coordinate-converter/version.js returns 3.1.0 with cache busting.
- index.html, map-support.js, field-map.js, point-picker.js, point-picker.css, sw.js and version.js all match the local files by SHA-256.
- The live page carries the Topo button, the View on map button and the OpenTopoMap tile url.
- npm test 203 passed / 0 failed; npm run test:browser and npm run test:field passed both engines; git diff --check clean.
- version.js had to move with this release: the service worker keys its cache on APP_VERSION, and cached runtime files changed.

## Version 3.2.0 - map legibility, location, and grid work (2026-09-21)

Map reading
- OpenTopoMap is drawn for hikers: military land is hatched in red and main roads are orange, both of which shout over the contours. The topo layer now carries filter saturate(.45) contrast(1.06), chosen by comparing rendered tiles over Murai, SAFTI and Temburong. Hatching becomes soft pink, roads become tan, contours and hillshade stay readable. Alternatives were rejected on evidence: OSM Humanitarian mutes well but has no contours and returned a blank tile over Temburong; Esri World Topo is muted but its contours are too faint there.
- Grid lines gained a white casing (3.4 px at .45) under a stronger line (1.6 px at .9), so they read on satellite imagery as well as street.
- Easting labels run along the top and northing labels down the left, so the top-left corner belonged to both and they overlapped. Each is now kept out of the other's 48 px strip.
- Selecting Coordinates and ticking the grid now draws meridians and parallels with degree labels instead of a kilometre grid, at a spacing chosen so several lines are always on screen.
- Latitude is clamped at the projection edge. Longitude still wraps, so sideways panning stays free across world copies, but the view can no longer be dragged off the top or bottom.
- The kilometre grid goes quiet when it is out of scale rather than nagging to zoom in.

Controls
- A slanted-arrow locate button on both maps asks for permission only when pressed, then shows the standard blue dot with an accuracy halo. It never adds a point.
- Fit points became an Auto-Zoom control sitting with the zoom buttons, on the Point Picker map and the converter's map picker.
- A red delete-all button sits with undo/redo and clears the table in one undoable step.

Table and text
- The drag handle is thinner and quieter.
- Output rows now stand exactly as tall as the input rows they answer: the output cell keeps the input cell's border, invisibly.
- Distance readouts are small, right-aligned footnotes under the table, and the map picker shows a running distance as points are added.
- Removed: the Point Picker tagline, the crosshair instructions, the distance and file-handling note, the "Separate points" nag and the "Point N added" commentary.

Grids offered
- The Point Picker's grid list follows the map: a country grid that cannot write a point here is not offered, and when a local grid does cover the ground a tappable note names it.

Tests
- npm test 203 passed; test:browser and test:field passed both engines.
- The field suite's grid check waited a fixed 200 ms while the grid redraws on an animation frame, which was racy on WebKit and became more so once each grid line gained a casing. It now waits for the labels, and also covers the degree graticule.

Still outstanding from this round
- Point Picker as the converter without a Convert button, with a permanently visible map on desktop.
- Grid and related settings mirrored into the converter's map picker.
- A simplified, lighter basemap when zoomed out beyond roughly 5 km.
- Point Picker output choosing the shortest unambiguous form while points share a square, and warning plus lengthening when they cross one.
- "Download GPX without connecting a route": export already writes waypoints when not connected, so the reported failure has not been reproduced.
