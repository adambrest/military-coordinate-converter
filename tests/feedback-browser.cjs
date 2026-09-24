const {chromium,webkit,devices}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),tile=(()=>{
 const zlib=require('node:zlib');
 const crc=data=>{let c=0xffffffff;for(const b of data){c^=b;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;}return (c^0xffffffff)>>>0;};
 const chunk=(type,data)=>{const body=Buffer.concat([Buffer.from(type),data]),len=Buffer.alloc(4),sum=Buffer.alloc(4);len.writeUInt32BE(data.length);sum.writeUInt32BE(crc(body));return Buffer.concat([len,body,sum]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(256);header.writeUInt32BE(256,4);header[8]=8;header[9]=2;
 const pixels=Buffer.alloc(256*(256*3+1));for(let y=0;y<256;y++)for(let x=0;x<256;x++){const i=y*769+1+x*3;pixels[i]=20;pixels[i+1]=50;pixels[i+2]=30;}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
})();
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.geojson':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));try{
for(const [engine,mobile] of [[chromium,false],[webkit,true]]){
 const browser=await engine.launch();try{
 const context=await browser.newContext({...mobile?devices['iPhone 13']:{viewport:{width:1280,height:1000}},timezoneId:'Asia/Singapore',serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/where',r=>r.fulfill({json:{lat:1.35,lon:103.82,timezone:'Asia/Singapore'}}));
 await page.route(/tile\.openstreetmap\.org|tile\.opentopomap\.org|services\.arcgisonline\.com/,r=>r.fulfill({contentType:'image/png',body:tile}));
 await page.route('**/beacon.min.js',r=>r.fulfill({contentType:'application/javascript',body:''}));
 await page.addInitScript(()=>addEventListener('DOMContentLoaded',()=>{if(!window.L)return;const make=L.map;L.map=(...args)=>{const m=make(...args);if(args[0]==='fieldMap')window.fm=m;if(args[0]==='pointMap')window.pm=m;return m;};}));
 await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);

 const heights=await page.evaluate(()=>['fieldImport','fieldExport','fieldMaps','importGpx','gpxBtn','mapsBtn'].map(id=>{const el=document.getElementById(id);return getComputedStyle(el).height;}));
 assert.ok(heights.every(h=>h==='44px'),heights.join(','));
 assert.equal(await page.locator('[aria-label^="Jump to"]').count(),0);
 await page.click('.field-tools [data-layer="satellite"]');
 await page.evaluate(()=>fm.setView([1.35,103.82],15,{animate:false}));
 await page.waitForFunction(()=>document.querySelectorAll('#fieldMap .leaflet-tile-loaded').length>0);
 await page.click('#fieldMap .map-fullscreen a');
 assert.equal(await page.locator('.map-fullscreen-active').count(),1);
 await page.waitForFunction(()=>{let ready=true;fm.eachLayer(l=>{if(l._url&&(l.isLoading()||Object.values(l._tiles).some(t=>!t.loaded)))ready=false;});return ready;});
 const size=await page.locator('#fieldMap').boundingBox(),viewport=page.viewportSize();
 assert.ok(Math.abs(size.width-viewport.width)<2);assert.ok(Math.abs(size.height-viewport.height)<2);
 await page.screenshot({path:'/tmp/feedback-fullscreen-'+(mobile?'mobile':'desktop')+'.png'});
 // Fractional zoom exposes seams on high-density mobile displays. The flat
 // dark fixture makes any light background leak unambiguous in a screenshot.
 await page.evaluate(()=>{const layers=[];fm.eachLayer(l=>{if(l._url)layers.push(l);});window.tiles=layers[0];tiles._setZoomTransform(tiles._levels[tiles._tileZoom],fm.getCenter(),15.35);});
 const shot=await page.screenshot();
 const leaks=await page.evaluate(async data=>{const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const scale=img.width/innerWidth,d=ctx.getImageData(0,0,img.width,img.height).data;let bad=0;for(let y=Math.ceil(100*scale);y<img.height-100*scale;y++)for(let x=Math.ceil(100*scale);x<img.width-100*scale;x++){if(Math.abs(x-img.width/2)<30*scale&&Math.abs(y-img.height/2)<30*scale)continue;const i=(y*img.width+x)*4;if(d[i]>80||d[i+1]>90||d[i+2]>80)bad++;}return bad;},shot.toString('base64'));
 assert.equal(leaks,0,'fractional satellite zoom must not expose light tile seams');
 await page.evaluate(()=>tiles._setZoomTransform(tiles._levels[tiles._tileZoom],fm.getCenter(),15));
 await page.keyboard.press('Escape');assert.equal(await page.locator('.map-fullscreen-active').count(),0);
 await page.evaluate(()=>{
   window.cleared=[];
   Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition(success,error,opts){window.fix=success;window.gpsOptions=opts;return 12;},clearWatch(id){cleared.push(id);}}});
 });
 await page.click('#fieldMap .map-locate a');
 await page.evaluate(()=>fix({timestamp:Date.now()-60000,coords:{latitude:1.3,longitude:104,accuracy:5}}));
 assert.match(await page.locator('#fieldMap .map-location-status').textContent(),/Finding/);
 await page.evaluate(()=>fix({timestamp:Date.now(),coords:{latitude:1.36,longitude:103.83,accuracy:1200}}));
 assert.match(await page.locator('#fieldMap .map-location-status').textContent(),/Approximate.*1200/);
 await page.evaluate(()=>fix({timestamp:Date.now(),coords:{latitude:1.351,longitude:103.821,accuracy:12}}));
 assert.match(await page.locator('#fieldMap .map-location-status').textContent(),/Location fix.*12 m/);
 assert.ok(Math.abs((await page.evaluate(()=>fm.getCenter().lng))-103.821)<1e-8);
 assert.deepEqual(await page.evaluate(()=>cleared),[12]);assert.equal(await page.evaluate(()=>gpsOptions.maximumAge),0);
 await page.waitForFunction(()=>{let loading=false;fm.eachLayer(l=>{if(l.isLoading?.())loading=true;});return !loading;});
 await page.check('#fieldTap');assert.equal(await page.locator('#fieldDone').isVisible(),true);
 await page.click('#fieldMap .map-fullscreen a');assert.equal(await page.locator('#fieldDone').isVisible(),true);
 await page.screenshot({path:'/tmp/done-'+(mobile?'mobile':'desktop')+'.png'});await page.click('#fieldDone');assert.equal(await page.locator('.map-fullscreen-active').count(),0);assert.equal(await page.locator('#fieldTap').isChecked(),false);
 await page.click('#fieldAdd');const pointCount=await page.locator('#fieldPoints .trow').count();
 await page.check('#fieldTap');await page.click('#fieldDone');assert.equal(await page.locator('#fieldPoints .trow').count(),pointCount,'Done never adds a point');
 await page.click('#fieldExportMenu summary');
 assert.deepEqual(await page.locator('#fieldExportMenu button').allTextContents(),['Export as GPX','Map snapshot','Google Maps']);
 await page.screenshot({path:'/tmp/export-'+(mobile?'mobile':'desktop')+'.png'});
 const download=page.waitForEvent('download');await page.click('#fieldSnapshot');
 const file=await download;assert.equal(file.suggestedFilename(),'mike-golf-romeo-map.png');await file.saveAs('/tmp/feedback-map-'+(mobile?'mobile':'desktop')+'.png');
 await page.click('#tab-conv');await page.selectOption('#fromSys','sg');await page.click('#selectMap');
 await page.click('#pointMap .map-locate a');
 await page.evaluate(()=>fix({timestamp:Date.now(),coords:{latitude:1.6,longitude:104.2,accuracy:10}}));
 assert.ok(Math.abs((await page.evaluate(()=>pm.getCenter().lng))-104.2)<.0001,'GPS camera must not be clamped to the selected country');
 await page.click('#pointMap .map-fullscreen a');await page.keyboard.press('Escape');
 assert.equal(await page.locator('.map-fullscreen-active').count(),0);assert.equal(await page.locator('#pointOverlay').isVisible(),true);
 await page.check('#pointTap');assert.equal(await page.locator('#pointDone').isVisible(),true);
 const before=await page.locator('#fromRows .trow').count();
 await page.click('#pointMap .map-fullscreen a');await page.click('#pointDone');
 assert.equal(await page.locator('#pointOverlay').isVisible(),false);assert.equal(await page.locator('#fromRows .trow').count(),before);
 await page.selectOption('#fromSys','wgs84');await page.locator('#fromRows .a').first().fill('1.35');await page.locator('#fromRows .b').first().fill('103.82');await page.click('#convertBtn');
 await page.click('#converterExport summary');
 const outputDownload=page.waitForEvent('download');await page.click('#snapshotBtn');
 assert.equal((await outputDownload).suggestedFilename(),'mike-golf-romeo-map.png');
 await page.click('#pointClose');
 await page.click('#converterExport summary');await page.keyboard.press('Escape');assert.equal(await page.locator('#converterExport').getAttribute('open'),null);
 assert.deepEqual(errors,[]);console.log(`${mobile?'Mobile WebKit':'Desktop Chromium'}: feedback: Done without extra points, grouped exports, full screen, PNG, seam pixels, button sizes and fresh GPS passed`);
 }finally{await browser.close();}
}
}finally{server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
