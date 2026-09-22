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
 await page.addInitScript(()=>addEventListener('DOMContentLoaded',()=>{const make=L.map;L.map=(...args)=>{const m=make(...args);if(args[0]==='fieldMap')window.fm=m;return m;};}));
 await page.goto(`http://127.0.0.1:${server.address().port}/index.html`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.fm);
 await page.evaluate(()=>fm.setView([1.35,103.82],14,{animate:false}));
 const rows=()=>page.locator('#fieldPoints .trow');
 const refs=()=>page.locator('#fieldPoints .trow:not(.blank)').evaluateAll(r=>r.map(x=>[x.querySelector('.a').value,x.querySelector('.b').value,x.querySelector('.nm').value]));
 const paste=(sel,text)=>page.locator(sel).evaluate((el,text)=>{const e=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(e,'clipboardData',{value:{getData:()=>text}});el.dispatchEvent(e);},text);
 const settle=()=>page.waitForTimeout(150);
 // An empty list offers one row to paste into, as the converter does.
 assert.equal(await rows().count(),1);assert.equal(await page.locator('#fieldPoints .a').getAttribute('placeholder'),'1234');
 // Coordinates, MGRS and a spreadsheet block all land in the list's own grid.
 await paste('#fieldPoints .a','1.352083, 103.819836');await settle();
 assert.equal(await rows().count(),1);assert.equal(await page.locator('#fieldFormat').inputValue(),'sg');
 assert.match((await refs())[0].slice(0,2).join(' '),/^\d{4} \d{4}$/,'coordinates are written as Singapore MGR');
 await page.click('#fieldAddRow');assert.equal(await rows().count(),2);
 await paste('#fieldPoints .trow:nth-child(2) .a','48N UG 6883 4332\tBravo\n1.36\t103.83\tCharlie');await settle();
 let r=await refs();assert.equal(r.length,3);assert.deepEqual(r.map(x=>x[2]),['','Bravo','Charlie'],'names come with the table');
 assert.ok(r.every(x=>/^\d{4}$/.test(x[0])&&/^\d{4}$/.test(x[1])),JSON.stringify(r));
 // Typing into a row is read the same way and replaces that point only.
 const a=page.locator('#fieldPoints .trow:nth-child(1) .a'),b=page.locator('#fieldPoints .trow:nth-child(1) .b');
 await a.fill('4800');await b.fill('4900');await b.press('Enter');await settle();
 r=await refs();assert.deepEqual(r[0].slice(0,2),['4800','4900']);assert.equal(r.length,3);
 assert.equal(await page.locator('#fieldPoints .trow.blank').count(),1,'Enter opens a new row after the edit');
 await page.locator('#fieldPoints .trow.blank .del').click();
 // A pasted row in another format replaces the row it lands in.
 await paste('#fieldPoints .trow:nth-child(1) .a','1.30 103.85');await settle();
 assert.notDeepEqual((await refs())[0].slice(0,2),['4800','4900']);assert.equal((await refs()).length,3);
 // Reorder from the keyboard, as in the converter.
 await page.locator('#fieldPoints .trow:nth-child(3) .grip').focus();await page.keyboard.press('ArrowUp');
 assert.equal((await refs())[1][2],'Charlie');
 await page.click('#fieldUndo');assert.equal((await refs())[2][2],'Charlie','reorder is one undo step');
 // A point outside the list's grid asks first, exactly like adding one on the map.
 await page.click('#fieldAddRow');await paste('#fieldPoints .trow:last-child .a','4.9, 114.94');await settle();
 assert.equal(await page.locator('#boundaryOverlay').isVisible(),true);await page.click('#boundaryClose');
 assert.equal((await refs()).length,3);
 // An unreadable line says why and adds nothing.
 await paste('#fieldPoints .trow:last-child .a','not a place');await settle();
 assert.notEqual(await page.locator('#fieldStatus').textContent(),'');assert.equal((await refs()).length,3);
 // Paste with nothing focused adds to the end.
 await page.locator('#fieldPoints .trow:last-child .del').click();
 await page.evaluate(()=>document.activeElement?.blur());
 await page.evaluate(()=>{const e=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(e,'clipboardData',{value:{getData:()=>'1.34, 103.84'}});document.body.dispatchEvent(e);});await settle();
 assert.equal((await refs()).length,4);
 // Enter in a cell finishes the row and opens a new one; Enter elsewhere adds a point.
 const before=(await refs()).length;
 await page.locator('#fieldPoints .trow:nth-child(1) .nm').focus();await page.keyboard.press('Enter');await settle();
 assert.equal(await page.locator('#fieldPoints .trow.blank').count(),1,'Enter in a field opens a new row');
 assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('a')&&document.activeElement.closest('.trow').classList.contains('blank')),true);
 await page.locator('#fieldPoints .trow.blank .del').click();await page.evaluate(()=>document.activeElement.blur());await page.keyboard.press('Enter');await settle();
 assert.equal((await refs()).length,before+1,'Enter with nothing focused adds the crosshair point');
 // With the grid off no seams remain: tiles sit on whole device pixels, unscaled.
 assert.equal(await page.evaluate(()=>{const t=document.querySelector('#fieldMap .leaflet-tile-pane .leaflet-tile');return t&&[t.style.width,t.style.willChange].join();}),'256px,transform');
 assert.deepEqual(errors,[]);console.log(`${mobile?'Mobile WebKit':'Desktop Chromium'}: picker table paste, batch, typing, replace, reorder, outside-grid warning, errors and page paste passed`);
 }finally{await browser.close();}
}
}finally{server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
