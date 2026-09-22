const {chromium,webkit,devices}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),tile=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.geojson':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));try{
for(const [engine,mobile] of [[chromium,false],[webkit,true]]){
 const browser=await engine.launch();try{
 const context=await browser.newContext({...mobile?devices['iPhone 13']:{viewport:{width:1280,height:1000}},timezoneId:'Asia/Singapore',serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/where',r=>r.fulfill({json:{lat:1.35,lon:103.82,timezone:'Asia/Singapore'}}));
 await page.route(/tile\.openstreetmap\.org|tile\.opentopomap\.org|services\.arcgisonline\.com/,r=>r.fulfill({contentType:'image/png',body:tile}));
 await page.route('**/beacon.min.js',r=>r.fulfill({contentType:'application/javascript',body:''}));
 await page.addInitScript(()=>addEventListener('DOMContentLoaded',()=>{const make=L.map;L.map=(...args)=>{const m=make(...args);if(args[0]==='fieldMap')window.fm=m;if(args[0]==='pointMap')window.pm=m;return m;};}));
 await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
 const layout=await page.evaluate(()=>{const a=document.querySelector('.field-map-panel').getBoundingClientRect(),b=document.querySelector('.field-output').getBoundingClientRect();return {beside:b.left>=a.right,below:b.top>=a.bottom};});
 assert.equal(layout.beside,!mobile);assert.equal(layout.below,mobile);
 assert.equal(await page.locator('#fieldAdd').textContent(),'Add point');
 assert.equal(await page.locator('#fieldMap .leaflet-bottom.leaflet-right .leaflet-control-zoom').count(),1,'zoom sits with the other map buttons');
 await page.selectOption('#fieldFormat','thailand');
 assert.ok(Math.abs((await page.evaluate(()=>fm.getCenter().lng))-99.24459)<.001,'country grid jumps to its country');
 await page.selectOption('#fieldFormat','sg');
 await page.evaluate(()=>{fm.setView([1.35,103.82],15,{animate:false});});
 await page.waitForFunction(()=>document.querySelectorAll('#fieldMap .grid-label-edge:not(.off)').length>0);
 // Edge numbers follow their lines on every frame of a pan, not after it ends.
 const labelX=()=>page.evaluate(()=>{const el=document.querySelector('#fieldMap .grid-label-edge.top:not(.off)');return el&&el.getBoundingClientRect().left;});
 const x0=await labelX();await page.evaluate(()=>{fm.fire('movestart');fm._rawPanBy(L.point(-25,0));fm.fire('move');});
 assert.ok(Math.abs((await labelX())-x0-25)<1.5,'labels move with the grid during a drag');
 await page.evaluate(()=>{fm._rawPanBy(L.point(25,0));fm.fire('move');fm.fire('moveend');});
 // Panning preserves the same geographic tiles, with labels baked into the lines.
 await page.evaluate(()=>{window.oldGrid=[...document.querySelectorAll('#fieldMap .coordinate-grid-tile')];fm.panBy([40,30],{animate:false});});
 assert.ok(await page.evaluate(()=>oldGrid.some(el=>el.isConnected)),'pan retains existing grid tiles');
 const centered=await page.locator('#fieldCoordinate').textContent();
 const box=await page.locator('#fieldMap').boundingBox(),x=box.x+box.width*.65,y=box.y+box.height*.55;
 if(!mobile){await page.mouse.move(x,y);assert.equal(await page.locator('#fieldCoordinate').textContent(),centered,'crosshair mode ignores hover');}
 await page.check('#fieldTap');
 assert.equal(await page.locator('#fieldAdd').isVisible(),false);assert.equal(await page.locator('.field-crosshair').isVisible(),false);
 if(!mobile){await page.mouse.move(x+25,y+25);assert.notEqual(await page.locator('#fieldCoordinate').textContent(),centered,'tap mode follows mouse');}
 // A click is committed by the next frame, without a double-tap timeout.
 if(mobile)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
 assert.equal(await page.locator('#fieldPoints .trow').count(),1,'single tap adds immediately');
 const clicked=await page.locator('#fieldCoordinate').textContent();
 if(mobile){await page.evaluate(()=>{fm.panBy([30,0],{animate:false});});assert.equal(await page.locator('#fieldCoordinate').textContent(),clicked,'mobile readout retains last tap');}
 await page.locator('#fieldPoints .nm').fill('Alpha');await page.locator('#fieldPoints .nm').blur();
 await page.click('#fieldUndo');assert.equal(await page.locator('#fieldPoints .nm').inputValue(),'');
 await page.click('#fieldRedo');assert.equal(await page.locator('#fieldPoints .nm').inputValue(),'Alpha');
 await page.click('#fieldClear');assert.equal(await page.locator('#fieldPoints .trow').count(),0);await page.click('#fieldUndo');assert.equal(await page.locator('#fieldPoints .nm').inputValue(),'Alpha');
 await page.uncheck('#fieldTap');await page.click('#fieldAdd');
 // Rapid gestures queue smooth zooms rather than cutting off an active transition.
 if(!mobile){
  await page.evaluate(()=>{fm.setView([1.35,103.82],14,{animate:false});});
  for(let i=0;i<3;i++)await page.mouse.dblclick(x,y,{delay:20});
  await page.waitForFunction(()=>fm.getZoom()===17&&!fm._animatingZoom);
 }

 await page.locator('#fieldRoute').scrollIntoViewIfNeeded();
 const routeBefore=await page.locator('#fieldRoute').boundingBox(),rowBefore=await page.locator('#fieldPoints').boundingBox();
 await page.evaluate(()=>{window.savedName=document.querySelector('#fieldPoints .nm');});
 await page.check('#fieldRoute');
 const routeAfter=await page.locator('#fieldRoute').boundingBox(),rowAfter=await page.locator('#fieldPoints').boundingBox();
 assert.deepEqual(routeAfter,routeBefore,'route toggle does not move its control');assert.deepEqual(rowAfter,rowBefore,'route toggle does not move points');
 assert.equal(await page.evaluate(()=>savedName===document.querySelector('#fieldPoints .nm')),true,'route toggle retains point inputs');
 const styles=await page.evaluate(()=>['fieldUndo','undoBtn','fieldClear','clearAll'].map(id=>{const el=document.getElementById(id);return [el.className,el.querySelector('svg').outerHTML];}));
 assert.deepEqual(styles[0],styles[1]);assert.deepEqual(styles[2],styles[3]);
 await page.click('#tab-conv');await page.click('#selectMap');
 await page.evaluate(()=>{pm.setView([1.35,103.82],15,{animate:false});});
 await page.waitForFunction(()=>document.querySelectorAll('#pointMap .coordinate-grid-tile').length>0);
 await page.uncheck('#pointGrid');assert.equal(await page.locator('#pointMap .coordinate-grid-tile').count(),0);await page.check('#pointGrid');
 await page.check('#pointTap');assert.equal(await page.locator('.point-crosshair').isVisible(),false);assert.equal(await page.locator('#pointContinue').isVisible(),false);
 const pbox=await page.locator('#pointMap').boundingBox(),px=pbox.x+pbox.width*.65,py=pbox.y+pbox.height*.55;
 if(mobile)await page.touchscreen.tap(px,py);else await page.mouse.click(px,py);
 assert.match(await page.locator('#pointCount').textContent(),/1 existing point/,'converter tap adds immediately');
 await page.waitForTimeout(550);
 const before=await page.evaluate(()=>pm.getZoom());
 if(mobile){await page.touchscreen.tap(px,py);await page.waitForTimeout(80);await page.touchscreen.tap(px,py);}else await page.mouse.dblclick(px,py,{delay:30});
 await page.waitForFunction(z=>pm.getZoom()===z&&!pm._animatingZoom,before+1);
 assert.match(await page.locator('#pointCount').textContent(),/1 existing point/,'double tap retracts provisional converter point');
 assert.equal(await page.locator('#fromRows .trow').count(),1);
 await page.uncheck('#pointTap');assert.equal(await page.locator('#pointContinue').isVisible(),true);
 await page.screenshot({path:`/tmp/mgr-controls-${mobile?'mobile':'desktop'}.png`});
 assert.deepEqual(errors,[]);console.log(`${mobile?'Mobile WebKit':'Desktop Chromium'}: layout, country jump, stable grid, pointer readout, immediate taps, undo/redo, stable route and converter controls passed`);
 }finally{await browser.close();}
}
}finally{server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
