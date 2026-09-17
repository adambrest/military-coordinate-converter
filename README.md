# Coordinate Converter

**[Open the app](https://adambrest.github.io/military-coordinate-converter/)** in your browser. Paste coordinates, choose an output, then convert.

## Offline use

Open the app online once and let it finish loading. Add it to your home screen:

- **iPhone/iPad:** Safari → Share → Add to Home Screen.
- **Android:** Chrome → ⋮ → Add to home screen / Install.

Coordinate conversion works offline. Selecting points from the map requires internet.

## Supported formats

- Latitude/longitude: decimal degrees, degrees and decimal minutes, degrees/minutes/seconds.
- Global MGRS and UTM.
- Singapore, Brunei, Taiwan, Thailand and Australia MGR presets.
- Google/Apple Maps links containing coordinates, including mixed batches separated by commas, tabs or newlines.
- Short map links when the online link resolver is available.
- Copyable results and GPX waypoint export.

## Using the converter

Enable Military grid in Settings to use global MGRS/UTM. Auto-detect accepts pasted coordinates or map links. You can also select points from the map; auto-detect chooses the matching enabled country grid and reference area. Map points outside enabled country grids automatically enable Military grid and select global MGRS output. Digits-only grid references prompt you to choose their country and area.

### Reference areas

Reference areas apply to global MGRS and the Taiwan, Thailand and Australia presets. Singapore and Brunei each use a single fixed area.

- **Input:** your first point sets the reference area. Short digits with no prefix prompt you to choose one, and later rows are assumed to share it. The Reference area chip above the input moves point 1's area and every row in it, rewriting typed MGRS prefixes. Each row shows its area as a blue pill (an MGRS prefix such as 48N UG, or a square such as E6 N15): type into it to move that row alone, or use its map icon to choose on the map. On the map, hovering a square (or tapping one on mobile) shows where the point would land, until you select one.
- **Omitted prefixes:** with Military grid set to omit the reference-area prefix, the prefix column is hidden when every point is in the area.
- **Output:** point 1 always sets the reference area, and it cannot be changed. When points fall in more than one area, the boundary notice appears and full prefixes are kept. The output then lists each area; select one to see which points it holds on the map.

Choosing global Military grid for coordinates with a matching country preset prompts you to switch to that preset or explicitly continue with global MGRS/UTM. Continuing is remembered for that country during the current session.

Global UTM and MGRS use a fixed WGS 84 datum. When importing copied UTM coordinates elsewhere, select WGS 84 / UTM with the matching zone, hemisphere and meter units. NAD83/NAD27 coordinates require a datum transformation; relabeling them is not a conversion. GPX downloads always contain WGS 84 latitude/longitude. Settings → Military grid explains datum and export compatibility.

Changing a grid input preset keeps your entries unchanged so you can correct the preset. Switching from Coordinates to a grid clears the entries; Undo and Redo restore them.

Typed digits are left as typed. Pasting splits a grid reference into its fields (digit runs only at 3+3 or longer), and Undo returns the text as pasted. Reloading the page keeps your entries in the system they were detected as.

## Run locally

Serve this directory with a static HTTP server, for example `python3 -m http.server 8000`, then open `http://localhost:8000/index.html`. No build step is required. Service workers require localhost or HTTPS.

For development checks:

```sh
npm ci
npm test
npx playwright install chromium webkit
npm run test:browser
```

The optional Cloudflare Worker in `worker/` handles short-link redirects and approximate map centering. To host your own helper, configure its allowed origins in `worker/resolve-link.js`, deploy from `worker/` with Wrangler, and set `MAP_HELPER` in `index.html`. Update `version.js` when changing cached app assets.

## Reproduction

Reproductions must credit the original creator and link to this repository. See [reuse permission](LICENSE.md) and [third-party credits](vendor/README.md).
