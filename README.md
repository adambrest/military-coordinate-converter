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
