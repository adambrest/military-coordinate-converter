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
 await page.goto(`http://127.0.0.1:${server.address().port}/index.html`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.fm);
 const at=(m,lat,lon,z=15)=>page.evaluate(([m,lat,lon,z])=>{window[m].setView([lat,lon],z,{animate:false});},[m,lat,lon,z]);
 const centre=m=>page.evaluate(m=>{const c=window[m].getCenter();return [c.lat,c.lng];},m);
 const near=(a,b)=>Math.abs(a[0]-b[0])<1e-4&&Math.abs(a[1]-b[1])<1e-4;
 const settle=()=>page.waitForTimeout(400);
 // ---- Point Picker: undo and redo on the map, recentring the crosshair ----
 await at('fm',1.35,103.82);await page.click('#fieldAdd');
 await at('fm',1.36,103.83);await page.click('#fieldAdd');
 await at('fm',1.37,103.84);
 const undoBtn='#fieldMap .map-history a:first-child',redoBtn='#fieldMap .map-history a:last-child';
 await page.click(undoBtn);await settle();
 assert.equal(await page.locator('#fieldPoints .trow:not(.blank)').count(),1);
 assert.ok(near(await centre('fm'),[1.35,103.82]),'undo puts the crosshair back on the last point listed');
 await page.click(redoBtn);await settle();
 assert.equal(await page.locator('#fieldPoints .trow:not(.blank)').count(),2);
 assert.ok(near(await centre('fm'),[1.36,103.83]),'redo goes to the point restored');
 assert.equal(await page.locator(redoBtn).evaluate(el=>el.classList.contains('off')),true);
 // Tap to add leaves the view alone.
 await page.check('#fieldTap');await at('fm',1.30,103.80);await page.click(undoBtn);await settle();
 assert.ok(near(await centre('fm'),[1.30,103.80]),'tap mode does not move the map');
 await page.click(redoBtn);await page.uncheck('#fieldTap');
 // ---- point names never overlap ----
 await page.click('#fieldClear');
 for(const d of [0,.00002,.00004,.00006])await page.evaluate(d=>{fm.setView([1.35+d,103.82+d],15,{animate:false});document.getElementById('fieldAdd').click();},d);
 await at('fm',1.35,103.82,15);await settle();
 const boxes=await page.evaluate(()=>[...document.querySelectorAll('#fieldMap .chosen-point-label')].filter(el=>!el.classList.contains('label-aside')&&getComputedStyle(el).display!=='none').map(el=>{const r=el.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom];}));
 assert.ok(boxes.length>=1);
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const [a,b]=[boxes[i],boxes[j]];assert.ok(a[2]<=b[0]||b[2]<=a[0]||a[3]<=b[1]||b[3]<=a[1],'labels '+i+' and '+j+' overlap');}
 assert.ok(await page.locator('#fieldMap .chosen-point-label').count()>=4);
 await page.uncheck('#fieldLabels');
 assert.equal(await page.locator('#fieldMap .chosen-point-label:visible').count(),0,'labels can be turned off');
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.fm);
 assert.equal(await page.locator('#fieldLabels').isChecked(),false,'the choice is remembered');
 await page.check('#fieldLabels');
 // ---- converter map: undo and redo the picks made there ----
 await page.click('#tab-conv');await page.click('#selectMap');await page.waitForFunction(()=>window.pm);
 await at('pm',1.35,103.82);await page.click('#pointContinue');
 await at('pm',1.36,103.83);await page.click('#pointContinue');
 await at('pm',1.37,103.84);
 assert.match(await page.locator('#pointCount').textContent(),/^2 /);
 // Connected points are joined on this map too, and the tick box lives with the input.
 const joined=()=>page.evaluate(()=>{let n=0;pm.eachLayer(l=>{if(l instanceof L.Polyline&&!(l instanceof L.Polygon)&&l.getLatLngs().length>1)n++;});return n;});
 assert.equal(await joined(),1,'the route is drawn between picks');
 assert.equal(await page.evaluate(()=>!!document.getElementById('measureRoute').closest('.side').querySelector('#fromRows')),true,'the route tick box sits on the From side');
 await page.click('#pointMap .map-history a:first-child');await settle();
 assert.match(await page.locator('#pointCount').textContent(),/^1 /);assert.ok(near(await centre('pm'),[1.35,103.82]));
 await page.click('#pointMap .map-history a:last-child');await settle();
 assert.match(await page.locator('#pointCount').textContent(),/^2 /);assert.ok(near(await centre('pm'),[1.36,103.83]));
 await page.click('#pointMap .map-history a:first-child');await page.click('#pointMap .map-history a:first-child');await settle();
 assert.match(await page.locator('#pointCount').textContent(),/^0 /);
 assert.equal(await page.locator('#pointMap .map-history a:first-child').evaluate(el=>el.classList.contains('off')),true,'only picks made on this map can be undone here');
 assert.deepEqual(errors,[]);console.log(`${mobile?'Mobile WebKit':'Desktop Chromium'}: map undo/redo with recentring, non-overlapping and togglable point labels, converter map history passed`);
 }finally{await browser.close();}
}
}finally{server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
