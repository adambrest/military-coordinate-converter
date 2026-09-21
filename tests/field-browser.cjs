const {chromium,webkit,devices}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html','.geojson':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
const gpx='<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg><trkpt lat="1.35" lon="103.82"/><trkpt lat="1.36" lon="103.83"/></trkseg><trkseg><trkpt lat="1.4" lon="103.9"/><trkpt lat="1.41" lon="103.91"/></trkseg></trk></gpx>';
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));try{
for(const [engine,device] of [[chromium,'Pixel 7'],[webkit,'iPhone 13']]){
const browser=await engine.launch();try{const context=await browser.newContext({...devices[device],serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/where',r=>r.fulfill({json:{lat:1.35,lon:103.82,timezone:'Asia/Singapore'}}));
await page.route('**/beacon.min.js',r=>r.fulfill({contentType:'application/javascript',body:''}));
await page.addInitScript(()=>{addEventListener('DOMContentLoaded',()=>{const make=L.map;L.map=(...args)=>{const map=make(...args);if(args[0]==='fieldMap')window.fieldTestMap=map;return map;};});});
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);await page.click('#tab-field');
await page.evaluate(()=>fieldTestMap.setView([1.35,103.82],14));await page.waitForTimeout(200);assert.ok(await page.locator('.km-label').count()>0,'kilometer labels rendered');
await page.click('#fieldAdd');await page.evaluate(()=>fieldTestMap.panTo([1.36,103.83],{animate:false}));await page.click('#fieldAdd');await page.check('#fieldRoute');assert.match(await page.locator('#fieldDistance').innerText(),/1\.57 km/);
await page.locator('#fieldPoints input').first().fill('HQ <test>');await page.locator('#fieldPoints input').first().blur();
await page.click('#fieldClear');assert.equal(await page.locator('#fieldPoints li').count(),0);await page.click('#fieldUndo');assert.equal(await page.locator('#fieldPoints input').first().inputValue(),'HQ <test>');
await page.reload();await page.click('#tab-field');assert.equal(await page.locator('#fieldPoints li').count(),2);await page.click('#fieldClear');
await page.setInputFiles('#fieldFile',{name:'segments.gpx',mimeType:'application/gpx+xml',buffer:Buffer.from(gpx)});await page.waitForFunction(()=>document.getElementById('fieldTotal').textContent==='4 points');assert.match(await page.locator('#fieldDistance').innerText(),/3\.14 km/);
await page.click('#fieldConvert');assert.match(await page.locator('#routeDistance').innerText(),/3\.14 km/);assert.equal(await page.locator('#toRows .trow').count(),4);
await page.reload();await page.click('#convertBtn');if(await page.locator('#countryGridContinue').isVisible())await page.click('#countryGridContinue');assert.match(await page.locator('#routeDistance').innerText(),/3\.14 km/,'segment breaks survive converter reload');
await page.click('#tab-field');await page.selectOption('#fieldFormat','wgs84');assert.match(await page.locator('#fieldPoints code').first().innerText(),/1\.350000/);
await page.setInputFiles('#fieldFile',{name:'bad.gpx',mimeType:'application/gpx+xml',buffer:Buffer.from('<gpx><wpt lat="999" lon="0"/></gpx>')});await page.waitForFunction(()=>document.getElementById('fieldStatus').textContent.includes('Invalid coordinate'));assert.equal(await page.locator('#fieldPoints li').count(),4);
await page.evaluate(()=>{navigator.clipboard.writeText=async text=>{window.copiedPoints=text;};});await page.click('#fieldCopy');assert.equal((await page.evaluate(()=>window.copiedPoints)).split('\n').length,4);
const download=page.waitForEvent('download');await page.click('#fieldExport');const d=await download;assert.equal(d.suggestedFilename(),'mike-golf-romeo.gpx');
await page.selectOption('#fieldLayer','satellite');await context.setOffline(true);await page.click('#fieldAdd');assert.equal(await page.locator('#fieldPoints li').count(),5,'adding coordinates works without tiles');await context.setOffline(false);
await page.screenshot({path:`/tmp/mgr-field-${device.replaceAll(' ','-')}.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');assert.deepEqual(errors,[]);console.log(device+': add, name, undo, persistence, grids, GPX, segment distance, converter transfer/reload, export passed');
}finally{await browser.close();}}
}finally{server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
