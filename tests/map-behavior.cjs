const {chromium,webkit,devices}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const tile=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.geojson':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));try{
for(const [engine,mobile] of [[chromium,false],[webkit,true]]){
 const browser=await engine.launch();try{
 const context=await browser.newContext({...mobile?devices['iPhone 13']:{viewport:{width:1280,height:1000}},timezoneId:'Asia/Singapore',serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/where',r=>r.fulfill({json:{lat:1.35,lon:103.82,timezone:'Asia/Singapore'}}));
 await page.route(/tile\.openstreetmap\.org|tile\.opentopomap\.org|services\.arcgisonline\.com/,r=>r.fulfill({contentType:'image/png',body:tile}));
 await page.route('**/beacon.min.js',r=>r.fulfill({contentType:'application/javascript',body:''}));
 await page.addInitScript(()=>addEventListener('DOMContentLoaded',()=>{const make=L.map;L.map=(...args)=>{const m=make(...args);if(typeof args[0]==='string')window[args[0]+'Test']=m;return m;};}));
 await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
 const center=id=>page.evaluate(id=>{const p=window[id+'Test'].getCenter();return [p.lat,p.lng];},id);
 const near=(a,b)=>assert.ok(Math.abs(a[0]-b[0])<.0001&&Math.abs(a[1]-b[1])<.0001,`${a} vs ${b}`);
 const paste=(selector,text)=>page.locator(selector).evaluate((el,text)=>{const e=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(e,'clipboardData',{value:{getData:()=>text}});el.dispatchEvent(e);},text);
 const importGpx=(id,pts)=>page.setInputFiles(id,{name:'locations.gpx',mimeType:'application/gpx+xml',buffer:Buffer.from('<gpx>'+pts.map(([lat,lon])=>`<wpt lat="${lat}" lon="${lon}"/>`).join('')+'</gpx>')});
 await page.evaluate(()=>fieldMapTest.setView([1.35,103.82],14,{animate:false}));
 assert.equal(await page.locator('.map-history').count(),0);
 const original=await center('fieldMap');
 const zoom=async()=>{
  await page.click('#fieldMap .leaflet-control-zoom-in');await page.waitForTimeout(300);near(await center('fieldMap'),original);
  await page.click('#fieldMap .leaflet-control-zoom-out');await page.waitForTimeout(300);near(await center('fieldMap'),original);
  if(!mobile){const b=await page.locator('#fieldMap').boundingBox();await page.mouse.move(b.x+b.width*.2,b.y+b.height*.3);await page.mouse.wheel(0,-160);await page.waitForTimeout(450);near(await center('fieldMap'),original);await page.mouse.wheel(0,160);await page.waitForTimeout(450);near(await center('fieldMap'),original);}
 };await zoom();
 await importGpx('#fieldFile',[[14.00287,99.24459],[14.003,99.245]]);
 await page.waitForFunction(()=>document.querySelector('#fieldTotal').textContent==='2 points');
 assert.equal(await page.locator('#boundaryOverlay').isVisible(),false);
 assert.equal(await page.locator('#fieldFormat').inputValue(),'thailand');
 assert.ok(Math.abs((await center('fieldMap'))[1]-99.245)<.01);
 await importGpx('#fieldFile',[[1.35,103.82]]);
 await page.waitForFunction(()=>document.querySelector('#fieldTotal').textContent==='3 points');
 assert.equal(await page.locator('#fieldFormat').inputValue(),'wgs84');assert.equal(await page.locator('#boundaryOverlay').isVisible(),false);
 await page.click('#fieldUndo');assert.equal(await page.locator('#fieldFormat').inputValue(),'thailand');
 await page.click('#fieldClear');await page.selectOption('#fieldFormat','sg');
 await paste('#fieldPoints .a','4800 4900');
 await page.waitForSelector('#locationOverlay.open');
 assert.ok(await page.locator('#locationOverlay [data-location]:not(:disabled):not([hidden])').count()>0);
 await page.click('#locationClose');assert.equal(await page.locator('#fieldPoints .trow:not(.blank)').count(),0);
 await paste('#fieldPoints .a','4800 4900');await page.click('[data-location="thailand"]');
 await page.waitForFunction(()=>!!window.aoMapTest);
 await page.evaluate(()=>{let selected=false;aoMapTest.eachLayer(l=>{if(!selected&&l.options.aoCandidate&&!l.options.aoCandidate.invalid){selected=true;l.fire('click',{originalEvent:new MouseEvent('click')});}});});
 await page.click('#aoApply');await page.waitForFunction(()=>document.querySelectorAll('#fieldPoints .trow:not(.blank)').length===1);
 assert.equal(await page.locator('#fieldFormat').inputValue(),'thailand');assert.equal(await page.locator('#boundaryOverlay').isVisible(),false);
 await page.click('#tab-conv');await importGpx('#importGpxFile',[[14.00287,99.24459]]);
 await page.waitForFunction(()=>document.querySelectorAll('#toRows .trow:not(.placeholder)').length===1);
 assert.equal(await page.locator('#boundaryOverlay').isVisible(),false);
 const tableTop=()=>page.locator('#toRows').evaluate(el=>el.getBoundingClientRect().top);
 await page.waitForTimeout(250);const top=await tableTop();
 await page.locator('#fromRows .a').first().fill('14.003');await page.locator('#fromRows .a').first().blur();
 assert.equal(await page.locator('#toStale').isVisible(),true);assert.equal(await tableTop(),top);
 await page.click('#convertBtn');assert.equal(await tableTop(),top);
 await page.click('#viewBtn');await page.waitForFunction(()=>!!window.pointMapTest);
 assert.equal(await page.locator('#pointMap .map-history').count(),0);
 const pc=await center('pointMap');await page.click('#pointMap .leaflet-control-zoom-in');await page.waitForTimeout(300);near(await center('pointMap'),pc);
 const toggle=page.locator('#pointMap .map-fullscreen a'),icon=await toggle.innerHTML();
 await toggle.click();await page.waitForTimeout(260);assert.equal(await toggle.getAttribute('aria-pressed'),'true');assert.notEqual(await toggle.innerHTML(),icon);near(await center('pointMap'),pc);assert.equal(await page.locator('#pointGrid').isVisible(),true);
 await page.keyboard.press('Escape');assert.equal(await toggle.getAttribute('aria-pressed'),'false');assert.equal(await page.locator('#pointOverlay').isVisible(),true);
 assert.deepEqual(errors,[]);console.log(`${mobile?'Mobile WebKit':'Desktop Chromium'}: stable zoom, located GPX imports, filtered picker, stable alerts and maximize passed`);
 }finally{await browser.close();}
}
}finally{server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
