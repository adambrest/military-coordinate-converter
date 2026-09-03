# Military Coordinate Converter

A single-page, offline-capable tool for converting between military grid references and standard GPS coordinates.

**Live site: https://adambrest.github.io/military-coordinate-converter/**

Supports:
- Global Lat/Long (WGS 84)
- Singapore MGR
- Taiwan MGR
- Thailand MGR
- Brunei MGR

## Using the site

1. Open the link above in any browser (desktop or mobile).
2. Under **From**, pick the grid system your input is in.
3. Type or paste your coordinate(s) into the input rows. Pasting a block of text auto-fills the rows and tries to detect the format for you.
4. Under **To**, pick the grid system you want to convert into.
5. Click **Convert**.
6. Use **⇄** to swap the From/To systems, **+ Add row** to convert several points at once, and **Open in Maps** / **Download GPX** / **Copy** to export the results.

Taiwan and Thailand MGR accept short (truncated) grid references that can exist in more than one 100 km square. If you enter one before confirming which square you're in, you'll be prompted with a map (with real zone codes and known landmarks) to pick your region. You can also confirm a region ahead of time from **Settings** — via a quick-select landmark or by choosing on the map — and until a region is confirmed, converted output always shows the fuller, unambiguous grid reference rather than a truncated one.

## Installing as an app

The site is a Progressive Web App, so it can be installed and used fully offline once loaded:

- **iOS (Safari):** open the link, tap Share → **Add to Home Screen**.
- **Android (Chrome):** open the link, tap the menu (⋮) → **Add to Home screen** / **Install app**.
- **Desktop (Chrome/Edge):** open the link, click the install icon in the address bar.

After installing, the app checks for updates automatically and shows an **Update available** button when a new version is ready.

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
