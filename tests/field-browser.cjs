const {chromium,webkit,devices}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html','.geojson':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
const BLANK_TILE=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');
const gpx='<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg><trkpt lat="1.35" lon="103.82"/><trkpt lat="1.36" lon="103.83"/></trkseg><trkseg><trkpt lat="1.4" lon="103.9"/><trkpt lat="1.41" lon="103.91"/></trkseg></trk></gpx>';
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));try{
for(const [engine,device] of [[chromium,'Pixel 7'],[webkit,'iPhone 13']]){
const browser=await engine.launch();try{const context=await browser.newContext({...devices[device],serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/where',r=>r.fulfill({json:{lat:1.35,lon:103.82,timezone:'Asia/Singapore'}}));
// Tiles come from outside; serving a stub keeps the run off the network and stops WebKit
// reporting each blocked fetch as a page error, which would drown the real ones.
await page.route(/tile\.openstreetmap\.org|tile\.opentopomap\.org|services\.arcgisonline\.com/,r=>r.fulfill({status:200,contentType:'image/png',body:BLANK_TILE}));
await page.route('**/beacon.min.js',r=>r.fulfill({contentType:'application/javascript',body:''}));
await page.addInitScript(()=>{addEventListener('DOMContentLoaded',()=>{const make=L.map;L.map=(...args)=>{const map=make(...args);if(args[0]==='fieldMap')window.fieldTestMap=map;return map;};});});
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);await page.click('#tab-field');
await page.evaluate(()=>{fieldTestMap.setView([1.35,103.82],14);});
assert.equal(await page.locator('#fieldFormat').inputValue(),'sg','empty Singapore view selects its local grid');
// A grid picked by hand, or a crossing, is answered in the shared alert; these steps keep it.
const answer=async()=>{await page.waitForTimeout(60);if(await page.locator('#boundaryOverlay').isVisible())await page.click('#boundaryContinue');};
const pickGrid=async(value)=>{await page.selectOption('#fieldFormat',value);await answer();};
const layerNow=()=>page.locator('.field-tools [data-layer][aria-pressed="true"]').getAttribute('data-layer');
assert.equal(await layerNow(),'street','Street is the default');
// With nothing collected the grid follows the ground: a country's own grid inside it,
// Coordinates outside every one, and a grid chosen by hand only where the rules allow.
const gridAt=async(lat,lon,z=11)=>{await page.waitForFunction(()=>!fieldTestMap._animatingZoom);await page.evaluate(([lat,lon,z])=>{fieldTestMap.setView([lat,lon],z,{animate:false});},[lat,lon,z]);return page.locator('#fieldFormat').inputValue();};
assert.equal(await gridAt(55.75,37.6),'wgs84','outside every country grid, Coordinates');
await pickGrid('mgrs');
assert.equal(await gridAt(56.0,38.0),'mgrs','Global MGRS chosen by hand holds outside a country');
assert.equal(await gridAt(4.9,114.94),'brunei','Brunei selects Brunei MGR');
assert.equal(await gridAt(55.75,37.6),'mgrs','leaving returns to the hand-picked global grid');
await pickGrid('wgs84');
assert.equal(await gridAt(1.35,103.82,14),'wgs84','Coordinates chosen by hand is left alone');
await pickGrid('mgrs');await gridAt(55.75,37.6);
assert.equal(await gridAt(1.35,103.82,14),'mgrs','Global MGRS chosen in Singapore is kept there from then on');
await pickGrid('sg');await gridAt(55.75,37.6);
assert.equal(await gridAt(1.35,103.82,14),'sg','choosing the country grid again restores auto-picking');
assert.equal(await page.locator('#fieldGridNote').count(),0,'no grid confirmation under the map');
// The grid starts off and labels start on; the grid is turned on here to test it.
assert.equal(await page.locator('#fieldGrid').isChecked(),false,'the grid starts off');
assert.equal(await page.locator('#fieldLabels').isChecked(),true,'point labels start on');
await page.check('#fieldGrid');
// The grid redraws on an animation frame, so wait for the labels instead of guessing a delay.
// Grid numbers sit on the edges of the view, not inside the tiles.
const edgeLabels=()=>page.evaluate(()=>[...document.querySelectorAll('#fieldMap .grid-label-edge:not(.off)')].map(el=>el.textContent));
await page.waitForFunction(()=>[...document.querySelectorAll('#fieldMap .grid-label-edge:not(.off)')].some(el=>/^\d\d$/.test(el.textContent)),{},{timeout:15000}).catch(()=>{throw new Error('kilometer labels rendered');});
// Coordinates read in degrees, so their grid is meridians and parallels, not kilometres.
await pickGrid('wgs84');
await page.waitForFunction(()=>[...document.querySelectorAll('#fieldMap .coordinate-grid-tile')].some(el=>el.dataset.system==='wgs84')&&[...document.querySelectorAll('#fieldMap .grid-label-edge:not(.off)')].some(el=>el.textContent.includes('°')),{},{timeout:15000}).catch(()=>{throw new Error('latitude/longitude labels rendered');});
await pickGrid('mgrs');
await page.waitForFunction(()=>[...document.querySelectorAll('#fieldMap .coordinate-grid-tile')].some(el=>el.dataset.system==='mgrs')&&[...document.querySelectorAll('#fieldMap .grid-label-edge:not(.off)')].every(el=>!el.textContent.includes('°')),{},{timeout:15000}).catch(()=>{throw new Error('kilometre labels returned');});
// A grid chosen by hand is kept, and once a point is down the grid is fixed.
await page.click('#fieldAdd');
assert.equal(await page.locator('#fieldFormat').inputValue(),'mgrs');
assert.match(await page.locator('#fieldAreaNote').innerText(),/Singapore has its own grid, Singapore MGR/,'a hand-picked global grid is flagged as in the converter');
await page.evaluate(()=>fieldTestMap.setView([4.9,114.94],13,{animate:false}));
assert.equal(await page.locator('#fieldFormat').inputValue(),'mgrs','moving to another country leaves a started list alone');
assert.equal(await page.locator('#fieldFormat option[value="brunei"]').isDisabled(),true,'a grid that cannot hold the points cannot be chosen');
await page.evaluate(()=>fieldTestMap.setView([1.35,103.82],14,{animate:false}));
await pickGrid('sg');
assert.equal(await page.locator('#fieldFormat').inputValue(),'sg');
// A new point the grid cannot write asks before anything is added.
await page.evaluate(()=>fieldTestMap.setView([4.9,114.94],13,{animate:false}));
await page.click('#fieldAdd');
assert.equal(await page.locator('#boundaryOverlay').isVisible(),true,'a point outside the grid warns');
assert.equal(await page.locator('#fieldPoints .trow').count(),1,'nothing is added until a grid is chosen');
await page.click('#boundaryClose');
assert.equal(await page.locator('#fieldPoints .trow').count(),1);
await page.click('#fieldAdd');await page.click('#boundaryContinue');
assert.equal(await page.locator('#fieldPoints .trow').count(),2);
assert.equal(await page.locator('#fieldFormat').inputValue(),'mgrs','insisting moves every point to a global grid');
await page.click('#fieldUndo');
assert.equal(await page.locator('#fieldPoints .trow').count(),1);
assert.equal(await page.locator('#fieldFormat').inputValue(),'sg','one undo takes back the point and the grid change');
await page.evaluate(()=>fieldTestMap.setView([1.35,103.82],14,{animate:false}));
assert.equal(await page.locator('#fieldPoints .nm').getAttribute('placeholder'),'Optional');
// Double-click a collected point as well as empty ground; neither may swallow zoom.
await page.check('#fieldTap');
await page.evaluate(()=>{window.fieldAnimated=false;fieldTestMap.on('zoomanim',()=>{window.fieldAnimated=true;});});
for(const centered of [true,false]){
 await page.evaluate(()=>fieldTestMap.setView([1.35,103.82],14,{animate:false}));
 const box=await page.locator('#fieldMap').boundingBox(),x=box.x+box.width*(centered?.5:.7),y=box.y+box.height*.5;
 for(let step=1;step<=3;step++){
  const target=await page.evaluate(({x,y})=>{const r=fieldTestMap.getContainer().getBoundingClientRect();return fieldTestMap.containerPointToLatLng([x-r.left,y-r.top]);},{x,y});
  await page.mouse.dblclick(x,y,{delay:30});
  await page.waitForFunction(z=>fieldTestMap.getZoom()===z&&!fieldTestMap._animatingZoom,14+step);
  assert.equal(await page.evaluate(()=>fieldTestMap.getZoom()),14+step,'double click animates, including over a point');
  const drift=await page.evaluate(({x,y,target})=>{const r=fieldTestMap.getContainer().getBoundingClientRect();return fieldTestMap.latLngToContainerPoint(target).distanceTo(L.point(x-r.left,y-r.top));},{x,y,target});
  assert.ok(drift<3,'zoom remains anchored');
 }
}
for(const delay of [80,280,380]){
 await page.evaluate(()=>fieldTestMap.setView([1.35,103.82],14,{animate:false}));
 await page.waitForTimeout(800);
 const box=await page.locator('#fieldMap').boundingBox(),x=box.x+box.width*.65,y=box.y+box.height*.5;
 await page.touchscreen.tap(x,y);await page.waitForTimeout(delay);await page.touchscreen.tap(x,y);
 await page.waitForTimeout(450);
 assert.equal(await page.evaluate(()=>fieldTestMap.getZoom()),15,'double tap zooms exactly once');
}
await page.waitForTimeout(450);
assert.equal(await page.locator('#fieldPoints .trow').count(),1,'double-click does not add points');
assert.equal(await page.evaluate(()=>window.fieldAnimated),true,'zoom uses a transition');
await page.uncheck('#fieldTap');
await page.click('#fieldClear');
assert.equal(await page.locator('#fieldFormat').inputValue(),'sg');
// Zooming out drops detail in stages: the map as drawn, then fading over the bundled
// land, then the outlines alone with no tiles requested at all.
const stage=async z=>{
  await page.evaluate(z=>{fieldTestMap.setView([1.40,103.75],z,{animate:false});},z);
  await page.waitForTimeout(250);
  return page.evaluate(()=>{
    const el=document.getElementById('fieldMap');
    let tiles=0;fieldTestMap.eachLayer(l=>{if(l._url)tiles++;});
    return {cls:[...el.classList].filter(c=>c.startsWith('map-')).join(' '),
            tiles,names:document.querySelectorAll('.broad-name').length};
  });
};
let step=await stage(12);
assert.equal(step.cls,'','close in, the map is drawn as it is');
assert.equal(step.tiles,1,'tiles are on close in');
step=await stage(10);
assert.equal(step.cls,'map-quiet','the map quietens on the way out');
assert.equal(step.tiles,1);
step=await stage(8);
assert.equal(step.cls,'map-faint','further out it fades further');
step=await stage(5);
assert.equal(step.cls,'map-broad','at country scale only the outlines remain');
assert.equal(step.tiles,0,'the broad view must request no tiles at all');
assert.ok(step.names>0,'the broad view names the countries it shows');
await page.evaluate(()=>{fieldTestMap.setView([1.35,103.82],14,{animate:false});});
// A selected label alone is not enough: the actual tile layer must change.
for(const [id,host] of [['street','openstreetmap'],['satellite','arcgisonline'],['topo','opentopomap']]){
 await page.click(`.field-tools [data-layer="${id}"]`);
 const urls=await page.evaluate(()=>{const urls=[];fieldTestMap.eachLayer(l=>{if(l._url)urls.push(l._url);});return urls;});
 assert.equal(urls.length,1,'exactly one basemap is active');
 assert.ok(urls[0].includes(host),id+' must change the active layer');
 const far=await stage(5);
 // Imagery stays at every zoom; the drawn maps give way to the outlines.
 assert.equal(far.tiles,id==='satellite'?1:0);
 await stage(12);
}

// A reference area is assumed from point 1, so points inside it read short. Crossing
// out of it is named and written in full rather than reading like the square next door.
await pickGrid('thailand');
const addAt=async(lat,lon)=>{await page.evaluate(({lat,lon})=>fieldTestMap.setView([lat,lon],13,{animate:false}),{lat,lon});await page.click('#fieldAdd');await answer();};
await addAt(14.00287,99.24459);
await page.waitForFunction(()=>document.querySelectorAll('#fieldPoints .trow').length===1);
let refs=await page.locator('#fieldPoints .trow').evaluateAll(rows=>rows.map(row=>[row.querySelector('.a').value,row.querySelector('.b').value].join(' ')));
assert.match(refs[0],/^\d{4} \d{4}$/,'one point should assume its own area and read short: '+refs[0]);
await addAt(14.02,99.26);
await page.waitForFunction(()=>document.querySelectorAll('#fieldPoints .trow').length===2);
refs=await page.locator('#fieldPoints .trow').evaluateAll(rows=>rows.map(row=>[row.querySelector('.a').value,row.querySelector('.b').value].join(' ')));
assert.match(refs[1],/^\d{4} \d{4}$/,'a point in the same square stays short: '+refs[1]);
assert.equal(await page.locator('#fieldAreaNote').isVisible(),false,'nothing has crossed an area line yet');
await page.evaluate(()=>fieldTestMap.setView([14.02,100.30],13,{animate:false}));await page.click('#fieldAdd');
// Crossing point 1's area is told in the converter's own alert, and asked only once.
await page.locator('#boundaryOverlay.open').waitFor();
assert.equal(await page.locator('#boundaryTitle').textContent(),'Points cross a grid boundary');
assert.match(await page.locator('#boundaryDetail').textContent(),/Thailand MGR/);
await page.click('#boundaryContinue');
await page.waitForFunction(()=>document.querySelectorAll('#fieldPoints .trow').length===3);
refs=await page.locator('#fieldPoints .trow').evaluateAll(rows=>rows.map(row=>[row.querySelector('.a').value,row.querySelector('.b').value].join(' ')));
assert.match(refs[0],/^\d{4} \d{4}$/,'the points inside keep their short form');
assert.ok(refs[2].replace(/\D/g,'').length>8,'the point that crossed is written in full: '+refs[2]);
assert.match(await page.locator('#fieldAreaNote').innerText(),/point 3 is outside/i,'crossing an area line must say so');
await page.click('#fieldClear');await page.click('#fieldUndo');await page.click('#fieldClear');
await pickGrid('mgrs');
await page.evaluate(()=>{fieldTestMap.setView([1.35,103.82],14,{animate:false});});

await page.click('#fieldAdd');await page.evaluate(()=>{fieldTestMap.panTo([1.36,103.83],{animate:false});});await page.click('#fieldAdd');await page.check('#fieldRoute');assert.match(await page.locator('#fieldDistance').innerText(),/1\.57 km/);
await page.locator('#fieldPoints .nm').first().fill('HQ <test>');await page.locator('#fieldPoints .nm').first().blur();
await page.click('#fieldClear');assert.equal(await page.locator('#fieldPoints li:not(.blank)').count(),0);await page.click('#fieldUndo');assert.equal(await page.locator('#fieldPoints .nm').first().inputValue(),'HQ <test>');
await page.reload();await page.click('#tab-field');assert.equal(await page.locator('#fieldPoints li').count(),2);await page.click('#fieldClear');
await page.setInputFiles('#fieldFile',{name:'segments.gpx',mimeType:'application/gpx+xml',buffer:Buffer.from(gpx)});await page.waitForFunction(()=>document.getElementById('fieldTotal').textContent==='4 points');assert.match(await page.locator('#fieldDistance').innerText(),/3\.14 km/);
await page.click('#fieldConvert');assert.match(await page.locator('#routeDistance').innerText(),/3\.14 km/);assert.equal(await page.locator('#toRows .trow').count(),4);
await page.reload();await page.click('#tab-conv');await page.click('#convertBtn');assert.match(await page.locator('#routeDistance').innerText(),/3\.14 km/,'segment breaks survive converter reload');
await page.click('#tab-field');await pickGrid('wgs84');assert.match(await page.locator('#fieldPoints .a').first().inputValue(),/1\.350000/);
await page.setInputFiles('#fieldFile',{name:'bad.gpx',mimeType:'application/gpx+xml',buffer:Buffer.from('<gpx><wpt lat="999" lon="0"/></gpx>')});await page.waitForFunction(()=>document.getElementById('fieldStatus').textContent.includes('Invalid coordinate'));assert.equal(await page.locator('#fieldPoints li').count(),4);
await page.evaluate(()=>{navigator.clipboard.writeText=async text=>{window.copiedPoints=text;};});await page.click('#fieldCopy');const copied=(await page.evaluate(()=>window.copiedPoints)).split('\n');assert.equal(copied.length,4);assert.equal(copied[0].split('\t').length,2,'unnamed points copy only coordinate columns, just like converter');
// Export to Maps is on the Point Picker too, with the converter's dialog.
const popup=page.waitForEvent('popup').catch(()=>null);await page.click('#fieldExportMenu summary');await page.click('#fieldMaps');
assert.ok((await popup)||await page.locator('#mapsOverlay').isVisible(),'Export to Maps opens Google Maps or its parts');
if(await page.locator('#mapsOverlay').isVisible())await page.click('#mapsCancel');
const download=page.waitForEvent('download');await page.click('#fieldExportMenu summary');await page.click('#fieldExport');const d=await download;assert.equal(d.suggestedFilename(),'mike-golf-romeo.gpx');
await page.click('.field-tools [data-layer="satellite"]');await context.setOffline(true);await page.click('#fieldAdd');assert.equal(await page.locator('#fieldPoints li').count(),5,'adding coordinates works without tiles');await context.setOffline(false);
// Upgrading an old saved picker changes the basemap, never its collected points/grid.
await page.evaluate(()=>{const key='mike-golf-romeo-field-v1',s=JSON.parse(localStorage.getItem(key));s.layer='topo';s.system='wgs84';delete s.basemapRevision;localStorage.setItem(key,JSON.stringify(s));});
await page.reload();
assert.equal(await layerNow(),'street');
assert.equal(await page.locator('#fieldFormat').inputValue(),'wgs84');
assert.equal(await page.locator('#fieldPoints .trow').count(),5);
await page.click('.field-tools [data-layer="topo"]');await page.reload();
assert.equal(await layerNow(),'topo','an explicit new choice persists');
await page.screenshot({path:`/tmp/mgr-field-${device.replaceAll(' ','-')}.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');assert.deepEqual(errors,[]);console.log(device+': add, name, undo, persistence, grids, GPX, segment distance, converter transfer/reload, export passed');
}finally{await browser.close();}}
}finally{server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
