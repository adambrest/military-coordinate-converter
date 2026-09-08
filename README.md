# Military Coordinate Converter

A simple tool for turning a map reference, GPS coordinate or Maps link into a format you can use. Convert one point or a whole list, give points names, open the results in Google Maps, or download them as GPX waypoints for a GPS device or mapping app.

**[Open Military Coordinate Converter](https://adambrest.github.io/military-coordinate-converter/)**

It runs in your browser on a phone, tablet or computer. You do not need an account or an app-store download to use it.

## Keep it on your home screen

Open the app using the link above, then:

- **iPhone or iPad:** in Safari, open the Share menu, choose **Add to Home Screen**, then **Add**. If offered, enable **Open as Web App**. [Apple's instructions](https://support.apple.com/guide/iphone/iphea86e5236/ios).
- **Android:** in Chrome, open the three-dot menu, choose **Add to home screen**, then **Install**. The wording may vary by device. [Chrome's instructions](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en).
- **Computer:** bookmark the app for quick access.

After the first online visit has finished loading, conversion and the basic area-selection map can work offline while the app remains saved in your browser. Street maps and external map services need internet access. When **Update available** appears, tap it to load the new version.

## Getting started

1. Leave the input on **Auto-detect** and paste your coordinates or a Google/Apple Maps link. You can paste a list using line breaks, tabs, commas or semicolons. If typing, leave the field or press **Convert** to detect the format.
2. If asked, choose the country and the area where the reference belongs.
3. Choose the output preset. Add names if useful, then copy the results, select **Open in Maps**, or **Download GPX**.

After detection, the paste area becomes separate coordinate fields and **Add row** appears. It becomes available once the last row has both coordinate fields populated. New grid rows inherit the previous row's prefix to save typing; you can edit it for a different square. Gray examples show what belongs in an empty field. Clear the last row to start again with Auto-detect.

**Settings** contains format examples, precision options and your area-of-operations selection. Every grid preset states precision as a ground distance and defaults to 10 m, the familiar 4+4 reference. Precision only drops trailing digits, so it applies whether or not a reference area has been chosen. Each preset shows a worked example that follows its own settings, so precision, prefix omission and the chosen reference area all change what you see. A shortened Maps link may need to be opened in a browser first: paste the expanded link containing the coordinates.

## Choose points directly from a map

Select **Select from map** beside Add row. It is available with every input preset, including Auto-detect, when the connectivity check succeeds. The open center of the crosshair marks the selected point. Double-tap or double-click to zoom towards that spot. Drag, click or use arrow keys to move; pinch, scroll or use + / − to zoom.

Switch between **Street** and **Satellite** without leaving the picker. The same OpenStreetMap layer stays active from country overview to detailed streets, so zooming does not switch maps. Singapore has an extra marker and label at broad zoom. Street tiles and satellite imagery need an internet connection; the basic country overview is saved with the app.

**Add** saves the point and closes the map. **Add and add another** saves it and leaves the map open for the next point. The live preview and saved row use your input preset and precision. Existing rows are retained. With Auto-detect, map selections become latitude/longitude coordinates. The output preset follows the point you place: a point in a supported country selects that country's grid, and a point no local grid covers falls back between coordinates and military grid. A grid that cannot represent your points is never left selected, so you are not asked to reconcile them against an area they do not belong to.

Previously entered points appear on the map with their names, or **Point 1**, **Point 2**, and so on. Reopening starts at the last valid coordinate and remembers the zoom and layer used when you added a point. Incomplete or unresolved rows are not shown as guessed locations. Country presets keep the crosshair inside their supported area and hide the jump menu. It is the crosshair that is limited, not the view, so you can reach the edges of a country at close zoom. For global presets, **Jump to** takes you to the common locations; the world repeats horizontally so you can pan across the date line. At country scale, a small snap helps center a nearby supported region once; dragging again moves freely. Close zoom never snaps. Global point maps can zoom out to the world. Zoom stops where the imagery does: most areas reach zoom 19, and areas with coarser coverage, such as the Australian training area, stop earlier. Past that point a provider only enlarges the tiles it holds, which would suggest detail the picture does not contain.

## Which preset should I use?

Choose the preset that matches the **source of your reference**. Being in a particular country does not mean every coordinate from that country uses its local military grid.

MGR means military grid reference. MGRS (Military Grid Reference System) and UTM (Universal Transverse Mercator) are global grid systems; look for those labels on your map or GPS settings.

| Preset | What it is for and why it exists |
| --- | --- |
| **Coordinates** | Latitude and longitude from a phone, GPS or Maps link. It accepts decimal degrees, degrees and decimal minutes, or degrees/minutes/seconds, including N/S/E/W letters. Use this when you want a familiar point you can look up on a map. |
| **Military grid** | Global grid references from a GPS or a map using MGRS or UTM. MGRS is the default because it suits the app's grid-reference workflow; choose UTM in Settings if your source uses a zone followed by easting and northing in meters. |
| **Singapore MGR** | Short references from the supported Singapore military grid. This uses the local map system and supplies its fixed prefix, so you do not normally need to choose a square. It is different from global MGRS, even when both describe a place in Singapore. |
| **Taiwan MGR** | References using the preset's UTM zone 51N grid. Short digits can repeat across Taiwan, so an AO selection supplies the missing square. |
| **Thailand MGR** | References using the preset's UTM zone 47N grid. It lets you choose the relevant AO instead of assuming that all short references belong to one training area. It does not cover every grid system used in Thailand. |
| **Australia MGR** | References using the preset's MGA / UTM zone 56S grid, which covers the eastern seaboard from about Mackay to eastern Victoria. The AO identifies the square within that area. Zone 56S is one of the eight zones Australia spans, so this is not a grid for all of Australia. |
| **Brunei MGR** | Short references from the supported local Brunei military grid. Like Singapore, it uses its own map system and a fixed prefix, rather than treating the digits as global MGRS. |

If your issued map uses a different grid or map datum, the country name alone is not enough to make a preset suitable. The map-system details are listed in Settings.

## Why does the app sometimes ask where a coordinate belongs?

Short grid references usually rely on information everyone using the same map already knows. That information is easily lost when the reference is copied into a message or given to someone using a different map.

For example, `1234 5678` is a **4+4 reference**: four digits for easting and four for northing. At this precision it identifies a 10 m grid cell, but only *within a particular 100 km square*. The same digits repeat in other squares. On their own, they do not identify the country, grid system or square, so several points can be plausible.

The app resolves the missing information in two steps:

1. **Country or grid choice:** tells the app which map system to use. Grids your digits could not fall inside are unavailable, with the reason on the button: in the Singapore grid, `1234 5678` lands about 10 km west of the country, so Singapore is not offered for it. The check uses each grid's supported extent rather than its coastline, so an ordinary reference just offshore stays available.
2. **Reference-area map:** where needed, select the missing grid square. A **100 km grid square** is a precise part of the coordinate system. An **area of operations (AO)** is wherever you are working; it can cover one square or several. The app calls its selection a *reference area* to distinguish these.

For Singapore and Brunei's supported grids, the preset already supplies a fixed prefix. For other short references, selecting a 100 km square completes the location. The map chooses what you are selecting from its own zoom, and says so above the footer: a **whole grid zone** such as `48N` while a zone still fits the screen, and a **100 km square** such as `48N UG` once you zoom in far enough for one to be worth picking. A zone covers many squares: you can omit the zone and band, but must still enter the two square letters, so zone `48N` still needs `UG 6883 4332` while square `48N UG` allows `6883 4332`. When digits are waiting to be resolved, only a square will do, and the map says so rather than accepting a zone. Its close zoom is limited so a square stays visible, including on a small phone screen. Every square in view is offered, including those clipped by a zone or band edge; selecting one your digits cannot reach explains why instead of leaving a hole in the grid. A point picked on the map supplies its square automatically, so you can use the prefix-omission setting without another area-selection step. Presets with a fixed footprint go further: choosing Singapore MGR or Brunei MGR as the input fills the output's reference area straight away, before anything is converted, because those grids already say where their references are. If you selected Military grid but actually meant a Singapore reference, choose Singapore when prompted: the app keeps your digits and changes the preset.

A complete MGRS reference, such as `48N UG 6883 4332`, includes the missing prefix and normally needs no AO selection. Complete UTM references also include a zone. When points cross the selected square or zone boundary, a popup explains the change. **Continue** expands the affected references with their correct prefixes or leading digits; existing points stay in the same locations. Closing the notice leaves a new map point unadded, or leaves conversion awaiting confirmation.

There are other ambiguities too. Two small latitude/longitude values can be valid in either order; check the axis order in Settings. In UTM input, `S` can mean the southern hemisphere or latitude band S. The app asks you to make that explicit rather than choosing silently; follow the input guidance using your actual zone.

## Offline maps and storage

Once the app has loaded and its offline files are saved, the regional reference-area pickers retain their bundled outlines, grid squares, and landmarks. Shoalwater's training area appears as a thin outline above the map; offline land stays beneath the imagery. These are lightweight orientation maps, not complete offline street or satellite maps. The point-entry button is grayed out when the browser is offline or the app cannot reach its connectivity endpoint; an available connection does not guarantee either imagery provider is reachable. The map reports imagery failures separately.

The world overview, regional context and training-area outline total about **0.39 MB uncompressed**, plus the map library and app. Detailed street and satellite tiles are loaded only as you view them. The current [street tile service does not permit bulk downloads for offline use](https://operations.osmfoundation.org/policies/tiles/). Complete regional street maps would need packaged map data or a provider that permits offline use.

Caching a detailed raster map of the entire world is too large for this app. As an illustrative calculation, storing every 256-pixel tile from zoom 0 through 15 requires about **1.43 billion tiles**. At an assumed 25–50 KB each, that is **36–72 TB**, before satellite imagery. At zoom 15, pixels represent roughly 4.8 m at the equator. Ocean deduplication and vector formats can reduce storage substantially, but a full-world download still makes a poor default for a small phone app. Small regional packages are the practical direction for richer offline maps.

## Accuracy and sensible use

This is an independent conversion aid. Check the result against your source map and a known point before relying on it. The AO map supplies context, and extra displayed digits do not make the original reference more accurate.

The Australian preset treats WGS 84 and GDA2020 as equivalent for ordinary 10 m grid conversion. They are not exactly identical, so this is not a survey-grade transformation. That approximation does not remove the need to choose the correct AO. [More about GDA2020](https://www.ga.gov.au/scientific-topics/positioning-navigation/positioning-australia/geodesy/datums-projections/gda2020).

## Feedback goes to the creator

Tap **Feedback** in the app, or [open a GitHub issue](https://github.com/adambrest/military-coordinate-converter/issues/new?title=Converter%20feedback), to send a bug report, suggestion or question to the creator through this project's issue tracker. You will need to sign in to GitHub and submit the issue; pressing Feedback only opens the form.

For a conversion problem, include the preset, what you entered, what you expected and what happened. Your device/browser and the app version also help. GitHub issues are public, so use a non-sensitive example rather than an operational location or personal information. You can return to the issue to read and reply to the creator's response.

## Maps and acknowledgements

The in-app street map is © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). The point picker's satellite layer uses [Esri World Imagery](https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer), credited to Esri, Vantor, Earthstar Geographics and the GIS User Community. Basic land and boundary context includes public-domain [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) data and [Queensland Government mapping](https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Basemaps/FoundationData/MapServer). Map display and conversion use third-party software; bundled credits and licenses are listed in [vendor](vendor/README.md).

**Open in Maps** opens Google Maps. Satellite imagery and Street View, where available there, belong to Google and the respective imagery providers; they are not bundled with this app. Their use and reproduction remain subject to the provider's terms and [imagery guidelines](https://about.google/brand-resource-center/products-and-services/geo-guidelines/).

The app uses [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) for usage statistics.

## Sharing and reproduction

You may use, copy, modify and redistribute this app's original code, design and documentation, including in your own projects, provided you credit the original creator, [adambrest](https://github.com/adambrest), and link to [this repository](https://github.com/adambrest/military-coordinate-converter). Keep this permission notice with redistributed copies and clearly identify any changes you make. Reuse does not imply the creator endorses your version.

This permission covers the app's original work only. Third-party software, maps and imagery retain their own licenses and ownership. The app is provided as is, without a guarantee of accuracy or suitability for a particular purpose.
