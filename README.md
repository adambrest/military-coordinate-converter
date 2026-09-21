# Mike Golf Romeo

A coordinate converter and map point picker.

**[Open the app](https://adambrest.github.io/military-coordinate-converter/)** in your browser. Paste coordinates, a grid reference or a map link, then convert.

Converts between latitude/longitude, global MGRS and UTM, and the Singapore, Brunei, Taiwan, Thailand and Australia MGR presets. It runs entirely in the browser; only map links and the map picker use the network.

## Point Picker and GPX

The **Point Picker** tab is a separate map-first workspace. Move the crosshair and choose **Add centre point**, or enable **Tap to add**. Choose global MGRS, coordinates, or a country MGR preset; name your points, copy them, download GPX, or send them to the converter. The collection is saved on this device. Clear and delete can be undone during the current visit.

- Street and satellite views use the existing OpenStreetMap and Esri services. There is no MapTiler account, key, dependency or subscription.
- The opening view uses an approximate IP/timezone location. No precise geolocation permission is requested.
- At zoom 11 and above, the **1 km grid** shows two-digit kilometre labels with a fading white background at the top (eastings) and left (northings). Country presets use their own projection. Coordinates/global MGRS use the map centre's UTM zone and latitude band; the grid is limited to that zone/band and updates when the centre changes. It is not a simultaneous multi-zone grid.
- **Connect points as a route** draws the supplied sequence and shows horizontal distance. It does not find a route or snap to paths. Imported GPX segment breaks remain separate. Connecting a collection consisting only of separate waypoints explicitly joins those waypoints in order.
- **Import GPX** accepts waypoints, routes and tracks locally. Point Picker appends imports and retains up to 20,000 points (20 MB file limit). The list displays the first 300; calculations, copying and export use every point. Converter imports/transfers are capped at 2,000 points to keep the editable table responsive.
- Converter output shows distance along point order when **Measure points in order** is enabled. An imported track retains its breaks while the coordinate sequence is unchanged; editing/reordering the sequence makes it a new ordered point route.
- Point Picker GPX export preserves track segments when connected; otherwise it exports waypoints. The converter's existing GPX download exports waypoints.
- Training-area context includes the existing simplified Shoalwater Bay boundary and approximate landmarks. Additional training boundaries are not invented.

The current map renderer is 2D. Outdoor/Topo styles, new contour data and 3D terrain were not added after the MapTiler migration was cancelled. Online map providers can still be unavailable; local conversion and saved points remain usable.

## Offline use

Open the app online once and let it finish loading, then add it to your home screen:

- **iPhone/iPad:** Safari → Share → Add to Home Screen.
- **Android:** Chrome → ⋮ → Add to home screen / Install.

Conversion works offline. Selecting points from the map needs internet. On a weak connection the app says so, keeps the map usable, and skips downloading anything it does not need.

## What you can paste

Paste into the input box, or type and press Convert. Typing and pasting are read the same way.

- **Latitude/longitude** in decimal degrees, degrees and minutes, or degrees, minutes and seconds, with or without symbols: `1.3521, 103.8198`, `1°21'07.6"N 103°49'11.3"E`, `1 21 07.6 N 103 49 11.3 E`, `N 01 21.127 E 103 49.188`. Copies that have been mangled on the way are also read: smart quotes, `˚` or `º` for degrees, decimal commas (`1,3521 103,8198`), full-width digits, `Lat:`/`Long:` labels, JSON, `POINT(lon lat)` and garbled characters such as `Â°`.
- **Global MGRS** at any precision (`48NUG6872249247`, `48N UG 6872 4924`, zero-padded zones like `04QFJ…`, dashes between parts) and **UTM** with its zone (`48N 366000 149000`).
- **Country grid references:** short (`4241 4338`) or full, with the 100 km square's digits in front (`436925 140527`).
- **Google and Apple Maps links:** shared places, dropped pins, searches, directions (read as where the route ends) and short links (followed online). Links with no coordinates, such as an address search, explain what to share instead.
- **Batches:** one point per line, or separated by commas, semicolons or tabs. Batches can mix formats, and spreadsheet columns work too. A column header row is skipped.
- **Names:** text beside a coordinate becomes the point's name: `HQ 1.35, 103.82`, `1.35, 103.82 (Objective)`, or a name column from a spreadsheet or from this app's own Copy.

A run of digits you are still typing is never split for you. Digits are only split into easting and northing when you press Convert or Enter, or when you paste them. `12345678` is read as 1234 5678, and `12 34`, separated only by a space, is a short grid reference.

## Editing the list

- **Reorder** points by dragging the ≡ grip beside each row number. To move a row with the keyboard, focus its grip and press the up and down arrow keys.
- **Paste into a row** to fill that row. Extra lines are added as new rows beneath it; nothing already in the list is overwritten, and the row keeps its name.
- **Undo and Redo** cover pastes, deleted rows, reordering and field edits, including names.

## Output

- **Copy** puts each point on its own line, with easting, northing and name separated by tabs, ready for a spreadsheet or to paste back into the converter.
- **Download GPX** saves WGS 84 waypoints with names, which most GPS apps and Google My Maps can import.
- **Open in Maps** opens a Google Maps route through your points. Google allows up to 5 points in a link on phones and 11 elsewhere. Longer lists open in parts, each starting where the last ended, or download GPX and import it in [Google My Maps](https://www.google.com/maps/d/) (Create a new map → Import) to see every point at once.

A grid reference names a square, not a point. Converting one gives the center of that square.

## Reference areas

Reference areas apply to global MGRS and to the Taiwan, Thailand and Australia presets.

- **Input:** your first point sets the reference area. Short digits with no prefix prompt you to choose one, and later rows share it. The Reference area chip above the input moves point 1's area and every row in it. Each row shows its own area as a blue pill; type into it to move that row alone, or use its map icon to choose on the map.
- **Output:** point 1 sets the reference area. When points fall in more than one area, you are told, full prefixes are kept, and the output lists each area. Select one to see which points it holds.

**Singapore and Brunei** each read short references in one fixed 100 km square. Brunei's short references belong to square 44 14. A Brunei point outside it (much of Belait and southern Tutong) triggers a notice, and every point is then written as a full reference, such as `436925 140527` in square 43 14. Full references can also be typed or pasted back in. Lakiun Camp and about 22 km of Temburong south of it sit in square 44 14; southern Temburong (below about 4.53° N) is in square 44 13.

With a country preset available, choosing global MGRS or UTM asks whether to switch to the preset or continue. A batch is offered its country's grid when the grid covers every point and the points are plainly in that country. Points just offshore or over the border are converted and noted, not refused.

MGRS and UTM cover 80° S to 84° N. Points beyond that need Coordinates as the output.

## Datum

Global UTM and MGRS use WGS 84, as does GPX. When importing copied UTM elsewhere, select WGS 84 / UTM with the matching zone and hemisphere. NAD83 and NAD27 coordinates need a datum transformation; relabeling them is not a conversion. Settings → Military grid explains more.

## Run locally

Serve this directory with a static HTTP server, for example `python3 -m http.server 8000`, then open `http://localhost:8000/index.html`. No build step is required. Service workers need localhost or HTTPS.

For development checks:

```sh
npm ci
npm test
npx playwright install chromium webkit
npm run test:browser
npm run test:field
```

The optional Cloudflare Worker in `worker/` follows short map links and gives the map an approximate opening view. To host your own, add your site to the allowed origins in `worker/resolve-link.js`, deploy from `worker/` with Wrangler, and set `MAP_HELPER` in `index.html`. Update `version.js` whenever cached app files change.

## Reproduction

Reproductions must credit the original creator and link to this repository. See [reuse permission](LICENSE.md) and [third-party credits](vendor/README.md).

## Development handoff

See [PROGRESS.md](PROGRESS.md) for the implementation journal, verification and remaining work. The original repository and Pages URL are retained after the rebrand.
