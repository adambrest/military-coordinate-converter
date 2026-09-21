# Mike Golf Romeo — progress and handoff

## Current instruction
Work in the ORIGINAL repository and folder. User cancelled MapTiler and the separate-repository plan. Rebrand the existing app, add GPX import, ordered-route distance, and a dedicated map-first Point Picker with copy/export and kilometre grid overlays. Keep OSM/Esri and nonintrusive IP/timezone location estimates.

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
- 3D is deferred with MapTiler cancelled; current Leaflet renderer is 2D.

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
2D only; no new contours/Topo/Outdoor provider. Global 1 km overlay draws the centre UTM zone/band, not all adjacent zones simultaneously. Large GPX list is capped visually at 300 rows; all 20,000 permitted points remain included in calculations/export. Converter table cap is 2,000 points. Satellite in the new workspace uses conservative native zoom 17 (existing modal retains its dynamic coverage logic).

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
- Optional simultaneous neighbouring-zone grid rendering, and improved imagery coverage handling in the new workspace.
- Large-track point-list virtualisation/editing beyond the first 300 visible entries.
- True offline basemap packages would require a separate implementation; existing online providers are still a network dependency.
