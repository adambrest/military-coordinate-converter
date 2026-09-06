# Military Coordinate Converter

A single-page, offline-capable tool for converting between military grid references and standard GPS coordinates.

**Live site: https://adambrest.github.io/military-coordinate-converter/**

Supports:
- Global Lat/Long (WGS 84)
- Singapore MGR
- Taiwan MGR
- Australia MGR (Shoalwater Bay / Exercise Wallaby, WGS 84 / UTM 56S)
- Thailand MGR
- Brunei MGR

## Using the site

1. Open the link above in any browser (desktop or mobile).
2. Under **From**, pick the grid system your input is in.
3. Type or paste your coordinate(s) into the input rows. Pasting a block of text auto-fills the rows and tries to detect the format for you.
4. Under **To**, pick the grid system you want to convert into.
5. Click **Convert**.
6. Use **⇄** to swap the From/To systems, **+ Add row** to convert several points at once, and **Open in Maps** / **Download GPX** / **Copy** to export the results.

Taiwan, Thailand and Australia MGR accept short (truncated) grid references that can exist in more than one 100 km square. If you paste an MGR without first choosing its grid, the converter asks for the country before showing the AO map. You can also choose an AO ahead of time from **Settings**, or paste a nearby WGS 84 coordinate and let the converter select the matching grid and AO automatically. Until an AO is confirmed, converted output always shows the fuller, unambiguous grid reference rather than a truncated one.

## Installing as an app

The site is a Progressive Web App, so it can be installed and used fully offline once loaded:

- **iOS (Safari):** open the link, tap Share → **Add to Home Screen**.
- **Android (Chrome):** open the link, tap the menu (⋮) → **Add to Home screen** / **Install app**.
- **Desktop (Chrome/Edge):** open the link, click the install icon in the address bar.

After installing, the app checks for updates automatically and shows an **Update available** button when a new version is ready.

Update checks run every minute while the app is visible, and on focus, returning to the app, or reconnecting. They check the deployed GitHub Pages assets; unpublished GitHub commits do not count as app updates. Click the top-right button to apply an installed update. Coordinates and settings are preserved.

**Feedback** opens a new GitHub issue (GitHub sign-in required). To receive email notifications as the owner, watch this repository for **Issues** and enable email delivery in GitHub notification settings using your verified personal email. The button does not send anything until the visitor submits the issue.

## Australia grid and sources

Australia MGR covers the Shoalwater Bay / Exercise Wallaby area in Queensland. It uses WGS 84 / UTM zone 56 in the southern hemisphere (EPSG:32756), with the 100 km prefixes omitted only for points in the confirmed square. Full references use metres; cropped references use the selected precision. This implements the requested WGS 84 convention; it is not a claim that every Australian military map uses this datum or that this is an alphanumeric MGRS parser. The AO viewport is approximate, not an official training-area boundary.

- [MINDEF: Exercise Wallaby 2025](https://www.mindef.gov.sg/news-and-events/latest-releases/25oct25-fs/) identifies Shoalwater Bay Training Area as the exercise location.
- [PIONEER: Welcome to Camp Tilpal](https://defencepioneer.sg/pioneer-articles/14nov24_news1) describes the new camp opening for Exercise Wallaby 2024, alongside the older Growl, Sam Hill and Tiger Hill camps.
- Approximate public-map landmarks: [Camp Tilpal](https://mapcarta.com/W1436392763) (-22.81253, 150.13259) and [Camp Growl](https://en-gb.topographic-map.com/map-lvgsb3/Camp-Growl/) (-22.80307, 150.33732). Pins are for orientation, not surveyed control points.
- [PROJ UTM documentation](https://proj.org/en/stable/operations/projections/utm.html) explains UTM zones and the southern-hemisphere flag.
- The offline Australia map uses [Natural Earth 1:10m land](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/) (public domain), simplified with small offshore islands omitted, and actual A1/Bruce Highway geometry from [Queensland Foundation Data](https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Basemaps/FoundationData/MapServer/23), © State of Queensland (Department of Resources) 2024. Water is shaded; camp labels use leader lines. Install Python `shapely`, then regenerate `australia-map.js` with `python fetch_australia_map.py` (requires internet).

### Training areas and grid boundaries (checked 6 September 2026)

The [official 2024 Shoalwater Bay map, Schedule 1 Map A](https://www.legislation.gov.au/F2024L00990/asmade/2024-08-14/text/original/pdf) includes the western expansion and northern/coastal training areas. It spans multiple 100 km squares, so a single fixed cropped square is insufficient. Using the approximate camp pins above, WGS 84 / UTM 56S gives Tilpal E205653 N7474376 and Growl E226661 N7475817. Tilpal is about 5.7 km east of E200000; Growl is about 24.2 km south of N7500000. The map shows training land west and north of those lines. The picker therefore includes E1/E2 and N74/N75 squares, and output retains full metre references outside the confirmed square.

The western training area extends west of 150°E, the nominal zone 55/56 boundary. The official map nevertheless uses GDA2020 / MGA zone 56 across the area. This app keeps the user's requested **WGS 84 / UTM 56S** convention throughout Shoalwater Bay; it does not automatically change to zone 55. GDA2020 and WGS 84 are distinct reference frames, so the source map confirms the zone choice and geographical extent, not survey-level equivalence of datums.

[Defence's ASMTI overview](https://www.defence.gov.au/defence-activities/programs-initiatives/australia-singapore-military-training-initiative) distinguishes the expanded Shoalwater Bay area near Rockhampton from Greenvale, around 215 km northwest of Townsville. [Greenvale's current project update](https://www.defence.gov.au/business-industry/finding-opportunities/local-business-opportunities/greenvale-training-area) reports environmental and heritage work through Q4 2026, with facilities construction dependent on approvals. It is not covered by this Shoalwater preset. The [Singapore Army's account](https://www.army.gov.sg/army-news-and-resources/army-news/anything-but-regular--commander-fsg-for-xwb-and-xtd---ltc-benjamin-jonathan-tan/) identifies Tilpal and Samuel Hill as base camps used for the 2024 exercises.

## Local files and contributor attribution

The unused local `.claude` folder has been removed and remains ignored by Git. This project does not require Claude Code. `README 2.md` was a duplicate of the newer committed README and has been consolidated into this file. The numbered copy is consistent with a sync duplicate, not Git's normal conflict format. Keep working Git repositories outside iCloud-synced folders to reduce duplicate-file and Git-metadata sync problems; use GitHub to sync commits between computers.

To stop Claude Code adding attribution, merge this into your user-level `~/.claude/settings.json` (Windows: `%USERPROFILE%\\.claude\\settings.json`), preserving existing settings, then restart Claude Code:

```json
{
  "attribution": {
    "commit": "",
    "pr": "",
    "sessionUrl": false
  }
}
```

If you use Claude Code again, apply the user-level settings above. See [Claude Code settings](https://code.claude.com/docs/en/settings). Review commit messages before pushing; local backup branches may still contain old attribution, so do not push them with `git push --all` or `--mirror`. As checked on 6 September 2026, GitHub's contributors API lists only `adambrest`, and `main` contains no Claude co-author trailers. No further history rewrite was needed.

## Development

This is a static site with no build step:

- [index.html](index.html) — app UI and conversion logic
- [proj4.js](proj4.js) — coordinate projection library ([proj4js](https://github.com/proj4js/proj4js))
- [sw.js](sw.js) — service worker (cache-first, offline support)
- [manifest.webmanifest](manifest.webmanifest) — PWA metadata/icons
- [version.js](version.js) — app version string; bump this to force the service worker to refresh cached assets

To work on it locally, serve the folder over HTTP (needed for the service worker to register), e.g.:

```sh
python3 -m http.server 8000
```

then open `http://localhost:8000`.

The site is published via GitHub Pages from the `main` branch.

Regression checks: install Python packages `playwright` and `pyproj`, ensure Google Chrome is installed, then run `python verify_changes.py`. The test serves a temporary app copy and checks projection accuracy, grid round trips, AO selection, mobile layout, update activation, saved rows and offline loading.
