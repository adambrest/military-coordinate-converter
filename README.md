# Mike Golf Romeo

A coordinate and military grid tool for field use. It runs in your browser, works offline once loaded, and sends nothing to a server except to follow a map link or load map tiles.

**[Open the app](https://adambrest.github.io/military-coordinate-converter/)**, or install it from your browser's menu.

## Two modes

**Converter** — paste or type coordinates in any supported format and read them back in another. Rows can be named, reordered, cleared and undone, then copied or exported as GPX.

**Point Picker** — the same output, gathered from a map instead of a keyboard. Move the crosshair or tap to add points, or paste and type them into its table exactly as in the converter; whatever arrives is written in the picker's grid. Name them, measure the distance along them, and send them across. Points move between the two modes without retyping, and both write references the same way.

## What it reads

Paste a single point or a whole batch. Formats can be mixed in one paste.

- **Latitude and longitude** — decimal degrees, degrees and minutes, or degrees, minutes and seconds, with or without symbols. Mangled copies are read too: smart quotes, `º`, full-width digits, `Lat:` labels, JSON and `POINT(lon lat)`. A comma is read as a decimal point where a line holds two of them and no full stop, so `12,5 13,5` is 12.5 and 13.5 rather than 12°05′; the reading is always said, because the other one is 46 km away. A single comma stays the separator between the two numbers — `1,35` is latitude 1, longitude 35 — and that reading is said too, because someone who meant 1.35 is 3,800 km out.
- **Global MGRS** at any precision, and **UTM** with its zone.
- **Country grid references** — Singapore, Brunei, Taiwan, Thailand and Australia, short or full.
- **Google and Apple Maps links**, including short links, which are followed online. A whole list is followed in one pass, and a label pasted with a link becomes that point's name.
- **Batches** — one per line, or split by commas, semicolons or tabs. Spreadsheet columns and header rows are handled.

The first paste sets the input grid (it keeps the grid you chose when that can hold the points, and otherwise takes the one the paste is written in); everything pasted after that is rewritten into it.

## Output

Point 1 fixes the reference area, so references stay short while every point shares it. Once any point crosses out of that area, every reference in the list is written in full, because a short reference standing beside a full one is read as sharing the same square.

Point names are made unique where they leave the app: the first keeps the name as typed and each repeat after it is numbered, so a GPX a buddy opens lists as many waypoints as the table shows. Unnamed points are numbered by position. A name is collapsed to one line, so a tab arriving from an imported GPX cannot shift the columns Copy produces.

Street maps from OpenStreetMap are the default. OpenTopoMap (CC-BY-SA) and Esri imagery are also available. Contours are SRTM-derived, so they show the shape of the ground rather than surveyed heights.

## License

[MIT](LICENSE.md)

## Field map controls

Choose an input/output country preset to move the corresponding map to that country; the separate “Jump to” menu has been removed. Converter preset changes apply on the next map opening. Auto-Zoom still fits all collected points.

Zooming out, the map is the map at full strength down to zoom 6; below that the tiles are dropped for bundled country outlines, which ask nothing of the network at a scale where a country's roads cannot be acted on. Nothing is drawn over the tiles and no stage dims them.

Every map has a maximize control and a camera button. Maximize retains map settings and action buttons, preserves the center and zoom, and changes its icon and pressed state; Escape restores the previous size. Wheel and zoom-button changes keep the map center fixed. Double-click/tap zooms toward the selected spot. Undo/redo buttons stay beside the tables.

Export opens an action sheet for GPX, Map image (fit points), and Google Maps. The fitted image includes every collected point; the camera button snapshots the current view. PNGs keep the shape of the map they were taken from, so a square map gives a square image. A map smaller than Full HD is enlarged towards 1,920 pixels on the long edge and 1,080 on the short edge to pull in finer tiles; a map already larger than that keeps its own size rather than being shrunk, so an export is never coarser than the screen it came from. A map too small to read is refused rather than saved blank. Labels use a white outline without tooltip boxes. Images include a metric scale and visible provider credits, with source URLs and view bounds also retained in PNG metadata. Capture uses a separate map and never moves the live view. If imagery cannot be exported, the app reports the error and retains the points.

GPX imports use their latitude/longitude directly and choose a grid that covers the collection. They are added to what is already collected and never replace it; imports spanning country grids use Coordinates, and the list says when its grid moved. Short references without a known location open the same filtered location chooser as the converter.

In the Converter map, tap-to-add replaces the Add point buttons with a blue Done button in the same footer. Done closes the map without adding a point. Point Picker has no Done button.

Location is an explicit on/off tracker. The blue control means tracking is on; the compact status shows reported accuracy and fix age, turning amber when the fix is coarse or stale. Fresh fixes replace older fixes even when accuracy worsens. Dragging pauses camera following while location updates continue; Follow recentres and resumes following. Switching off, closing the converter map, leaving Point Picker, or hiding the browser stops tracking and clears the marker. Attribution remains separately visible. The browser does not expose satellite counts or a reliable GPS-versus-network source, so the app does not claim them.

See [Singapore offline map feasibility and size estimates](docs/offline-maps.md) for coverage assumptions, provider requirements and storage estimates.
