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
// The grid redraws on an animation frame, so wait for the labels instead of guessing a delay.
await page.waitForFunction(()=>document.querySelectorAll('.km-label').length>0,{},{timeout:15000}).catch(()=>{throw new Error('kilometer labels rendered');});
// Coordinates read in degrees, so their grid is meridians and parallels, not kilometres.
await page.selectOption('#fieldFormat','wgs84');
await page.waitForFunction(()=>[...document.querySelectorAll('.km-label')].some(el=>/\u00b0/.test(el.textContent)),{},{timeout:15000}).catch(()=>{throw new Error('latitude/longitude labels rendered');});
await page.selectOption('#fieldFormat','mgrs');
await page.waitForFunction(()=>[...document.querySelectorAll('.km-label')].some(el=>/^\d\d$/.test(el.textContent.trim())),{},{timeout:15000}).catch(()=>{throw new Error('kilometre labels returned');});
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
 await page.selectOption('#fieldLayer',id);
 const urls=await page.evaluate(()=>{const urls=[];fieldTestMap.eachLayer(l=>{if(l._url)urls.push(l._url);});return urls;});
 assert.equal(urls.length,1,'exactly one basemap is active');
 assert.ok(urls[0].includes(host),id+' must change the active layer');
 await stage(5);
 assert.equal(await page.evaluate(()=>{let n=0;fieldTestMap.eachLayer(l=>{if(l._url)n++;});return n;}),0);
 await stage(12);
}

// A reference area is assumed from point 1, so points inside it read short. Crossing
// out of it is named and written in full rather than reading like the square next door.
await page.selectOption('#fieldFormat','thailand');
const addAt=async(lat,lon)=>{await page.evaluate(({lat,lon})=>fieldTestMap.setView([lat,lon],13,{animate:false}),{lat,lon});await page.click('#fieldAdd');};
await addAt(14.00287,99.24459);
await page.waitForFunction(()=>document.querySelectorAll('#fieldPoints code').length===1);
let refs=await page.locator('#fieldPoints code').allInnerTexts();
assert.match(refs[0],/^\d{4} \d{4}$/,'one point should assume its own area and read short: '+refs[0]);
await addAt(14.02,99.26);
await page.waitForFunction(()=>document.querySelectorAll('#fieldPoints code').length===2);
refs=await page.locator('#fieldPoints code').allInnerTexts();
assert.match(refs[1],/^\d{4} \d{4}$/,'a point in the same square stays short: '+refs[1]);
assert.equal(await page.locator('#fieldAreaNote').isVisible(),false,'nothing has crossed an area line yet');
await addAt(14.02,100.30);
await page.waitForFunction(()=>document.querySelectorAll('#fieldPoints code').length===3);
refs=await page.locator('#fieldPoints code').allInnerTexts();
assert.match(refs[0],/^\d{4} \d{4}$/,'the points inside keep their short form');
assert.ok(refs[2].replace(/\D/g,'').length>8,'the point that crossed is written in full: '+refs[2]);
assert.match(await page.locator('#fieldAreaNote').innerText(),/point 3 is outside/i,'crossing an area line must say so');
await page.click('#fieldClear');await page.click('#fieldUndo');await page.click('#fieldClear');
await page.selectOption('#fieldFormat','mgrs');
await page.evaluate(()=>{fieldTestMap.setView([1.35,103.82],14,{animate:false});});

await page.click('#fieldAdd');await page.evaluate(()=>{fieldTestMap.panTo([1.36,103.83],{animate:false});});await page.click('#fieldAdd');await page.check('#fieldRoute');assert.match(await page.locator('#fieldDistance').innerText(),/1\.57 km/);
await page.locator('#fieldPoints input').first().fill('HQ <test>');await page.locator('#fieldPoints input').first().blur();
await page.click('#fieldClear');assert.equal(await page.locator('#fieldPoints li').count(),0);await page.click('#fieldUndo');assert.equal(await page.locator('#fieldPoints input').first().inputValue(),'HQ <test>');
await page.reload();await page.click('#tab-field');assert.equal(await page.locator('#fieldPoints li').count(),2);await page.click('#fieldClear');
await page.setInputFiles('#fieldFile',{name:'segments.gpx',mimeType:'application/gpx+xml',buffer:Buffer.from(gpx)});await page.waitForFunction(()=>document.getElementById('fieldTotal').textContent==='4 points');assert.match(await page.locator('#fieldDistance').innerText(),/3\.14 km/);
await page.click('#fieldConvert');assert.match(await page.locator('#routeDistance').innerText(),/3\.14 km/);assert.equal(await page.locator('#toRows .trow').count(),4);
await page.reload();await page.click('#tab-conv');await page.click('#convertBtn');if(await page.locator('#countryGridContinue').isVisible())await page.click('#countryGridContinue');assert.match(await page.locator('#routeDistance').innerText(),/3\.14 km/,'segment breaks survive converter reload');
await page.click('#tab-field');await page.selectOption('#fieldFormat','wgs84');assert.match(await page.locator('#fieldPoints code').first().innerText(),/1\.350000/);
await page.setInputFiles('#fieldFile',{name:'bad.gpx',mimeType:'application/gpx+xml',buffer:Buffer.from('<gpx><wpt lat="999" lon="0"/></gpx>')});await page.waitForFunction(()=>document.getElementById('fieldStatus').textContent.includes('Invalid coordinate'));assert.equal(await page.locator('#fieldPoints li').count(),4);
await page.evaluate(()=>{navigator.clipboard.writeText=async text=>{window.copiedPoints=text;};});await page.click('#fieldCopy');assert.equal((await page.evaluate(()=>window.copiedPoints)).split('\n').length,4);
const download=page.waitForEvent('download');await page.click('#fieldExport');const d=await download;assert.equal(d.suggestedFilename(),'mike-golf-romeo.gpx');
await page.selectOption('#fieldLayer','satellite');await context.setOffline(true);await page.click('#fieldAdd');assert.equal(await page.locator('#fieldPoints li').count(),5,'adding coordinates works without tiles');await context.setOffline(false);
await page.screenshot({path:`/tmp/mgr-field-${device.replaceAll(' ','-')}.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');assert.deepEqual(errors,[]);console.log(device+': add, name, undo, persistence, grids, GPX, segment distance, converter transfer/reload, export passed');
}finally{await browser.close();}}
}finally{server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
