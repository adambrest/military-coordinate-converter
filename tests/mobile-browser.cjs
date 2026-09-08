// Run `npm run test:browser` after `npx playwright install chromium webkit`.
// HEADED=1 shows the dedicated mobile-emulation windows; LIVE_IMAGERY=1 checks Esri.
const {chromium,webkit,devices}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.geojson':'application/json','.webmanifest':'application/manifest+json'};
  fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(data);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 for(const [name,engine,device] of [['Chromium',chromium,'Pixel 7'],['WebKit',webkit,'iPhone 13']]){
  const browser=await engine.launch({headless:!process.env.HEADED});
  try{
   const context=await browser.newContext({...devices[device],serviceWorkers:'block'}),page=await context.newPage();
   await page.route('**/beacon.min.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{addEventListener('DOMContentLoaded',()=>{const create=L.map;L.map=(...args)=>{const map=create(...args);if(args[0]==='pointMap')window.testMap=map;return map;};});});
   if(!process.env.LIVE_IMAGERY)await page.route('**/tilemap/**',route=>{
    const [,z,row,col,w,h]=route.request().url().match(/tilemap\/(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)/).map(Number);
    route.fulfill({json:{data:Array(w*h).fill(z>18?0:1)}});
   });
   await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
   await page.locator('#tab-set').click();
   const toggle=page.locator('[data-toggle="mgrs"]');assert.ok(await toggle.isVisible());
   assert.ok(await page.locator('[data-id="mgrs"]').evaluate(el=>el.classList.contains('disabled')));
   await toggle.click();assert.equal(await toggle.getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('[data-id="mgrs"]').evaluate(el=>el.classList.contains('open')),false);
   await page.screenshot({path:`/tmp/saf-${name}-settings.png`});
   await page.locator('#tab-conv').click();await page.locator('#selectMap').click();
   const box=await page.locator('#pointMap').boundingBox(),x=box.x+box.width*.75,y=box.y+box.height*.35;
   const reset=()=>page.evaluate(()=>{testMap.setView([1.35,103.82],12,{animate:false,reset:true});});
   await reset();await page.waitForTimeout(300);
   const initial=await page.evaluate(()=>testMap.getCenter());await page.touchscreen.tap(x,y);await page.waitForTimeout(600);
   assert.equal(await page.evaluate(()=>testMap.getZoom()),12);assert.deepEqual(await page.evaluate(()=>testMap.getCenter()),initial);
   for(const delay of [80,280,380]){
    await reset();await page.waitForTimeout(800);
    const target=await page.evaluate(({x,y})=>{const r=testMap.getContainer().getBoundingClientRect();return testMap.containerPointToLatLng([x-r.left,y-r.top]);},{x,y});
    await page.touchscreen.tap(x,y);await page.waitForTimeout(delay);await page.touchscreen.tap(x,y);await page.waitForTimeout(800);
    assert.equal(await page.evaluate(()=>testMap.getZoom()),13,`${name}: double tap ${delay} ms must zoom exactly once`);
    const drift=await page.evaluate(({target,x,y})=>{const r=testMap.getContainer().getBoundingClientRect();return testMap.latLngToContainerPoint(target).distanceTo(L.point(x-r.left,y-r.top));},{target,x,y});
    assert.ok(drift<3,`${name}: zoom anchor drift ${drift}`);
   }
   if(name==='Chromium'){
    await reset();await page.waitForTimeout(800);const cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
    for(let dx=10;dx<=80;dx+=10)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-dx,y,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(100);await page.touchscreen.tap(x-80,y);await page.waitForTimeout(700);
    assert.equal(await page.evaluate(()=>testMap.getZoom()),12,'drag then tap must not become a double tap');
    await reset();await page.waitForTimeout(800);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-40,y,id:1},{x:x+40,y,id:2}]});
    for(let span=50;span<=80;span+=10)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-span,y,id:1},{x:x+span,y,id:2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(600);
    const pinchedZoom=await page.evaluate(()=>testMap.getZoom());assert.ok(pinchedZoom>12,'pinch zoom should still work');
    await page.touchscreen.tap(x,y);await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>testMap.getZoom()),pinchedZoom,'tap after pinch must not double zoom');
   }
   await page.evaluate(()=>{testMap.setView([-22.65,150.35],19,{animate:false,reset:true});});
   await page.locator('#pointSatellite').click();
   await page.waitForFunction(()=>testMap.getMaxZoom()===18,{},{timeout:20000});
   await page.waitForTimeout(1000);
   assert.equal(await page.evaluate(()=>testMap.getZoom()),18);
   assert.ok(await page.evaluate(()=>{let active=false;testMap.eachLayer(l=>{if(l._url?.includes('World_Imagery'))active=l.options.maxNativeZoom===18;});return active;}));
   await page.screenshot({path:`/tmp/saf-${name}-satellite.png`});
   await page.locator('#pointStreet').click();assert.equal(await page.evaluate(()=>testMap.getMaxZoom()),19);
   assert.deepEqual(errors,[]);
   console.log(`${name} ${device}: touch timing, stationary single tap, anchored zoom, collapsed toggles and satellite coverage passed`);
  }finally{await browser.close();}
 }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
