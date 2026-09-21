# Mike Golf Romeo

A coordinate and military grid tool for field use. It runs in your browser, works offline once loaded, and sends nothing to a server except to follow a map link or load map tiles.

**[Open the app](https://adambrest.github.io/military-coordinate-converter/)**, or install it from your browser's menu.

## Two modes

**Converter** — paste or type coordinates in any supported format and read them back in another. Rows can be named, reordered, cleared and undone, then copied or exported as GPX.

**Point Picker** — the same output, gathered from a map instead of a keyboard. Move the crosshair or tap to add points, name them, measure the distance along them, and send them across. Points move between the two modes without retyping, and both write references the same way.

## What it reads

Paste a single point or a whole batch. Formats can be mixed in one paste.

- **Latitude and longitude** — decimal degrees, degrees and minutes, or degrees, minutes and seconds, with or without symbols. Mangled copies are read too: smart quotes, `º`, decimal commas, full-width digits, `Lat:` labels, JSON and `POINT(lon lat)`.
- **Global MGRS** at any precision, and **UTM** with its zone.
- **Country grid references** — Singapore, Brunei, Taiwan, Thailand and Australia, short or full.
- **Google and Apple Maps links**, including short links, which are followed online. A whole list is followed in one pass, and a label pasted with a link becomes that point's name.
- **Batches** — one per line, or split by commas, semicolons or tabs. Spreadsheet columns and header rows are handled.

## Output

Point 1 fixes the reference area, so references stay short while every point shares it. A point that crosses out of that area is named and written in full.

Maps come from OpenStreetMap, OpenTopoMap (CC-BY-SA) and Esri imagery. Contours are SRTM-derived, so they show the shape of the ground rather than surveyed heights.

## License

[MIT](LICENSE.md)
