# Mike Golf Romeo

A coordinate and military grid tool for field use. It runs in your browser, works offline once loaded, and sends nothing to a server except to follow a map link or load map tiles.

**[Open the app](https://adambrest.github.io/military-coordinate-converter/)**, or install it from your browser's menu.

## Two modes

**Converter** — paste or type coordinates in any supported format and read them back in another. Rows can be named, reordered, cleared and undone, then copied or exported as GPX.

**Point Picker** — the same output, gathered from a map instead of a keyboard. Move the crosshair or tap to add points, or paste and type them into its table exactly as in the converter; whatever arrives is written in the picker's grid. Name them, measure the distance along them, and send them across. Points move between the two modes without retyping, and both write references the same way.

## What it reads

Paste a single point or a whole batch. Formats can be mixed in one paste.

- **Latitude and longitude** — decimal degrees, degrees and minutes, or degrees, minutes and seconds, with or without symbols. Mangled copies are read too: smart quotes, `º`, decimal commas, full-width digits, `Lat:` labels, JSON and `POINT(lon lat)`.
- **Global MGRS** at any precision, and **UTM** with its zone.
- **Country grid references** — Singapore, Brunei, Taiwan, Thailand and Australia, short or full.
- **Google and Apple Maps links**, including short links, which are followed online. A whole list is followed in one pass, and a label pasted with a link becomes that point's name.
- **Batches** — one per line, or split by commas, semicolons or tabs. Spreadsheet columns and header rows are handled.

The first paste sets the input grid (it keeps the grid you chose when that can hold the points, and otherwise takes the one the paste is written in); everything pasted after that is rewritten into it.

## Output

Point 1 fixes the reference area, so references stay short while every point shares it. A point that crosses out of that area is named and written in full.

Street maps from OpenStreetMap are the default. OpenTopoMap (CC-BY-SA) and Esri imagery are also available. Contours are SRTM-derived, so they show the shape of the ground rather than surveyed heights.

## License

[MIT](LICENSE.md)

## Field map controls

Choose an input/output country preset to move the corresponding map to that country; the separate “Jump to” menu has been removed. Converter preset changes apply on the next map opening. Auto-Zoom still fits all collected points.

Every map has full-screen and a photo button that saves the current view. Full screen uses the browser viewport, including on iOS; press Escape or the same control to exit. The Export menu groups Export as GPX, Map snapshot, and Google Maps, with the same right-aligned disclosure triangle as Detail IC. Export → Map snapshot fits the collected points; the photo button preserves the current camera. Both render a separate map up to 16 megapixels (8,192 pixels on the longest edge), fetching higher-detail tiles where available. Labels remain at native text size so the map has more usable detail. The live map is not resized or moved. PNGs have no visible controls or attribution; source credits and view bounds are retained in PNG metadata. For publication, display provider credits with the image as required by [OSM](https://www.openstreetmap.org/copyright) and [Esri](https://support.esri.com/en-us/knowledge-base/what-is-the-correct-way-to-cite-an-arcgis-online-basema-000012040). If a provider prevents image export, choose another layer or use a device screenshot.

In the Converter map, tap-to-add replaces the Add point buttons with a blue Done button in the same footer. Done closes the map without adding a point. Point Picker has no Done button.

Location is an explicit on/off tracker. The blue control means tracking is on; the compact status shows reported accuracy and fix age, turning amber when the fix is coarse or stale. Fresh fixes replace older fixes even when accuracy worsens. Dragging pauses camera following while location updates continue; Follow recentres and resumes following. Switching off, closing the converter map, leaving Point Picker, or hiding the browser stops tracking and clears the marker. Attribution remains separately visible. The browser does not expose satellite counts or a reliable GPS-versus-network source, so the app does not claim them.

See [Singapore offline map feasibility and size estimates](docs/offline-maps.md) for coverage assumptions, provider requirements and storage estimates.
