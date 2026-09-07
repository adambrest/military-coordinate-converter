const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const html=read('index.html');
const inline=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
function core(){
  const ctx=vm.createContext({console,URL});
  for(const f of ['proj4.js','vendor/mgrs.js','grid-core.js','map-context.js'])vm.runInContext(read(f),ctx);
  vm.runInContext(inline.split('  /* ============================ UI / state')[0],ctx);
  return ctx;
}
function app(saved,realMap=false){
  const dom=new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g,''),{url:'https://example.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  if(saved)w.localStorage.setItem('mgrconv-v1',JSON.stringify(saved));
  for(const f of ['version.js','proj4.js','vendor/mgrs.js','grid-core.js','map-context.js'])w.eval(read(f));
  if(realMap){
    const ctx=new Proxy({measureText:s=>({width:String(s).length*6})},{get:(obj,key)=>key in obj?obj[key]:()=>{}});
    w.HTMLCanvasElement.prototype.getContext=()=>ctx;
    Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{get(){return 800;}});
    Object.defineProperty(w.HTMLElement.prototype,'clientHeight',{get(){return this.id==='aoMap'?480:40;}});
    w.fetch=async()=>({ok:true,json:async()=>JSON.parse(read('vendor/land.geojson'))});
    w.eval(read('vendor/leaflet.js'));const createMap=w.L.map;w.L.map=(...args)=>w.testMap=createMap(...args);w.eval(read('map-picker.js'));
  }else w.createAOPicker=opts=>{w.pickerHooks=opts;return {open:o=>{w.mapOptions=o;w.document.getElementById('aoOverlay').classList.add('open');}};};
  w.eval(inline);
  const $=s=>w.document.querySelector(s);
  function change(id,value){$(id).value=value;$(id).dispatchEvent(new w.Event('change',{bubbles:true}));}
  function paste(text,row=0){const e=new w.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(e,'clipboardData',{value:{getData:()=>text}});$('#fromRows').children[row].querySelector('.a').dispatchEvent(e);}
  const state=()=>JSON.parse(w.localStorage.getItem('mgrconv-v1'));
  return {dom,w,$,change,paste,state};
}
test('global round trips preserve prefix and digits worldwide',()=>{
  const c=core();
  for(const [lat,lon] of [[1.35,103.82],[-22.7105094,150.4091992],[48.8582,2.2945],[40.7,-74],[14,99.24],[24,121],[-33,18],[0.01,179.99],[-0.01,-179.99],[60,6],[78,15]]){
    for(const d of [3,4,5]){
      const p=c.GlobalGrid.parts(lat,lon,d),r=c.GlobalGrid.parse(p.prefix+' '+p.e+' '+p.n),back=c.GlobalGrid.parts(r.lat,r.lon,d);
      assert.deepEqual(back,p);
    }
  }
});
test('missing prefix requests AO; invalid global references fail safely',()=>{
  const c=core();assert.equal(c.GlobalGrid.parse('1234 5678').error,'pick-square');
  for(const s of ['61NAA12345678','31UIO12345678','31UDQ123','31CDQ12345678','31UDQ 123 45678','123 45678'])assert.throws(()=>c.GlobalGrid.parse(s),s);
  assert.throws(()=>c.GlobalGrid.parts(89,0));
});
test('Google place URL uses final pin, not related place or camera',()=>{
  const c=core();
  const r=vm.runInContext('extractMapCoordinate("https://www.google.com/maps/place/Test/@-22.5957012,149.235423,291833m/data=!3d-32.2978819!4d115.7029661!3d-22.7105094!4d150.4091992")',c);
  assert.equal(r.lat,-22.7105094);assert.equal(r.lon,150.4091992);
});
test('selected Singapore accepts a short grid without asking for an area',()=>{
  const a=app();a.change('#fromSys','sg');a.paste('3000 3000');assert.equal(a.w.mapOptions,undefined);assert.equal(a.$('#copyBtn').disabled,false);assert.equal(a.state().settings.sg.sgDigits,4);a.dom.window.close();
});
test('blank input is inviting, auto-detects and preserves its name',()=>{
  const a=app();assert.equal(a.$('#fromSys').value,'auto');assert.equal(a.$('#fromRows .b').hidden,true);
  a.$('#fromRows .nm').value='Meeting point';a.paste('1.352083,103.819836');
  assert.equal(a.$('#fromSys').value,'wgs84');assert.equal(a.state().points[0].name,'Meeting point');
  a.$('#fromRows .del').click();assert.equal(a.$('#fromSys').value,'auto');
  a.change('#fromSys','mgrs');assert.equal(a.$('#fromRows .b').hidden,true);assert.equal(a.w.mapOptions,undefined);
  a.dom.window.close();
});
test('prefixed UTM and Garmin latitude-band input snap into zone and axes',()=>{
  for(const input of ['48n 366000 149000','UTM 48N 366000mE 149000mN','48N band 366000 149000','48N 366000 149000']){
    const a=app();a.paste(input);assert.equal(a.$('#fromSys').value,'mgrs',input);assert.equal(a.$('#fromFormat').value,'globalutm');
    assert.equal(a.$('#copyBtn').disabled,false,a.$('#badPair').textContent);
    assert.ok(a.state().points[0].lat>1&&a.state().points[0].lat<2);
    assert.equal(a.$('#fromRows .a').value,'366000');assert.ok(a.$('#fromRows .prefix').value.includes('48N'));
    a.dom.window.close();
  }
});
test('blank MGRS also auto-detects UTM; spaced MGRS gets a dedicated prefix field',()=>{
  const a=app();a.change('#fromSys','mgrs');a.paste('51N 300000 2700000');
  assert.equal(a.$('#fromFormat').value,'globalutm');assert.equal(a.$('#copyBtn').disabled,false);
  a.paste('51R TH 1234 5678');assert.equal(a.$('#fromSys').value,'mgrs');
  assert.equal(a.$('#copyBtn').disabled,false,a.$('#badPair').textContent);
  assert.match(a.$('#fromRows .prefix').value,/51R TH/);assert.equal(a.$('#fromRows .a').value,'1234');
  a.dom.window.close();
});
test('unlabelled projected metres require CRS choice; EPSG:3857 is detected explicitly',()=>{
  const raw='11553992.183085 151736.075979';const a=app();a.paste(raw);
  assert.equal(a.$('#copyBtn').disabled,true);assert.match(a.$('#badPair').textContent,/EPSG:3857/);assert.equal(a.$('#fromRows .a').value,raw);
  a.change('#fromSys','mgrs');a.change('#fromFormat','mercator');a.$('#convertBtn').click();assert.equal(a.$('#copyBtn').disabled,false,a.$('#badPair').textContent);
  assert.ok(a.state().points[0].lat>1.3&&a.state().points[0].lat<1.4);
  assert.ok(a.state().points[0].lon>103.7&&a.state().points[0].lon<103.9);
  a.paste('EPSG:3857 '+raw);assert.equal(a.$('#fromFormat').value,'mercator');assert.equal(a.$('#copyBtn').disabled,false);
  a.dom.window.close();
});
test('UTM rejects bad zones, invalid bands and ambiguous S instead of guessing',()=>{
  const c=core();
  for(const text of ['61N 366000 149000','48N 0 149000','51R 300000 149000','32X 500000 8500000','51S 300000 2700000']){
    c.input=text;assert.ok(vm.runInContext('parseProjected(input).error',c),text);
  }
  assert.equal(vm.runInContext('parseProjected("UTM 56S 230000 7490000").point.lat<0',c),true);
  assert.equal(vm.runInContext('parseProjected("51S band 300000 3700000").point.lat>0',c),true);
});
test('typed input snaps from blank MGRS and edits revalidate without losing names',async()=>{
  const a=app();a.change('#fromSys','mgrs');a.$('#fromRows .nm').value='Typed point';
  a.$('#fromRows .a').value='48N 366000 149000';a.$('#fromRows .a').dispatchEvent(new a.w.Event('input',{bubbles:true}));
  await new Promise(r=>setTimeout(r,760));a.$('#convertBtn').click();assert.equal(a.$('#fromFormat').value,'globalutm');assert.equal(a.state().points[0].name,'Typed point');
  a.$('#fromRows .prefix').value='61N';a.$('#fromRows .prefix').dispatchEvent(new a.w.Event('input',{bubbles:true}));
  assert.equal(a.$('#copyBtn').disabled,true);a.$('#convertBtn').click();assert.match(a.$('#badPair').textContent,/out of range/);
  a.dom.window.close();
});
test('slow typing never replaces or blurs the input; complete MGRS needs no AO',async()=>{
  const a=app();const input=a.$('#fromRows .a');input.focus();
  for(const value of ['51r','51r th','51r th 93619','51r th 93619 48618']){
    input.value=value;input.dispatchEvent(new a.w.Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,750));
    assert.equal(a.$('#fromRows .a'),input);assert.equal(a.w.document.activeElement,input);assert.equal(a.w.mapOptions,undefined);
  }
  a.$('#convertBtn').click();assert.equal(a.$('#copyBtn').disabled,false,a.$('#badPair').textContent);assert.equal(a.$('#regionChip').hidden,true);assert.equal(a.w.mapOptions,undefined);
  a.paste('48nug 6883 4332');assert.equal(a.$('#fromRows .prefix').value,'48N UG');assert.equal(a.$('#copyBtn').disabled,false);
  a.$('#fromRows .prefix').value='48nug';a.$('#convertBtn').click();assert.equal(a.$('#fromRows .prefix').value,'48N UG');assert.equal(a.$('#copyBtn').disabled,false);
  a.dom.window.close();
});
test('global Settings format matches converter and examples use Mount Echo Park',async()=>{
  const a=app();a.paste('1.2964704,103.8210085');a.change('#toSys','mgrs');
  assert.match(a.$('#toFormatExample').textContent,/48N UG 6883 4332/);
  a.$('#tab-set').click();a.$('[data-head="mgrs"]').click();await new Promise(r=>setTimeout(r,20));
  assert.match(a.$('[data-head="mgrs"]').textContent,/Global coordinates/);
  a.$('[data-id="mgrs"] [data-v="globalutm"]').click();await new Promise(r=>setTimeout(r,20));
  assert.equal(a.state().to,'globalutm');assert.match(a.$('#toFormatExample').textContent,/48N 368831.814 143329.716/);
  assert.match(a.$('[data-id="mgrs"] .example').textContent,/368831.814/);assert.equal(a.$('#aoCentre'),null);
  a.dom.window.close();
});
test('leaving Auto-detect snaps and keeps focus in the Name field',async()=>{
  const a=app();const input=a.$('#fromRows .a');input.focus();input.value='48nug 6883 4332';input.dispatchEvent(new a.w.Event('input',{bubbles:true}));
  a.$('#fromRows .nm').focus();await new Promise(r=>setTimeout(r,20));
  assert.equal(a.$('#fromRows .prefix').value,'48N UG');assert.equal(a.w.document.activeElement,a.$('#fromRows .nm'));assert.equal(a.$('#copyBtn').disabled,false);a.dom.window.close();
});
test('Enter detects the coordinate and focuses a new row',async()=>{
  const a=app();const input=a.$('#fromRows .a');input.focus();input.value='51r th 93619 48618';input.dispatchEvent(new a.w.Event('input',{bubbles:true}));
  input.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,20));
  assert.equal(a.$('#fromRows').children.length,2);assert.equal(a.$('#fromRows .prefix').value,'51R TH');
  assert.equal(a.w.document.activeElement,a.$('#fromRows').children[1].querySelector('.a'));assert.equal(a.w.mapOptions,undefined);a.dom.window.close();
});
test('new projected formats still enforce country output and never need an AO',()=>{
  const a=app();a.change('#toSys','taiwan');a.paste('48N 366000 149000');
  assert.equal(a.$('#copyBtn').disabled,true);assert.match(a.$('#badPair').textContent,/Singapore, not Taiwan/);
  a.change('#toSys','wgs84');assert.equal(a.$('#copyBtn').disabled,false);
  a.change('#fromFormat','mercator');a.paste('3000 3000');assert.equal(a.w.mapOptions,undefined);assert.equal(a.$('#copyBtn').disabled,false);
  a.dom.window.close();
});
test('reload always returns to Auto-detect while retaining coordinates and names',()=>{
  const first=app();first.paste('48N 366000 149000');const saved=first.state();saved.rows[0][2]='Keep me';first.dom.window.close();
  const a=app(saved);assert.equal(a.$('#fromSys').value,'auto');assert.equal(a.$('#fromRows .nm').value,'Keep me');
  assert.match(a.$('#fromRows .a').value,/48N 366000 149000/);assert.equal(a.$('#copyBtn').disabled,true);
  assert.equal(a.$('#pasteHint').querySelectorAll('li').length,6);assert.equal(a.$('#fromRows .a').placeholder,'Paste here');a.dom.window.close();
});
test('restored batches can be detected again without losing row names',()=>{
  const a=app();a.paste('1.35,103.82\n1.36,103.83');const saved=a.state();saved.rows[0][2]='One';saved.rows[1][2]='Two';a.dom.window.close();
  const b=app(saved);b.$('#convertBtn').click();assert.equal(b.$('#copyBtn').disabled,false,b.$('#badPair').textContent);
  assert.deepEqual(Array.from(b.state().points,p=>p.name),['One','Two']);b.dom.window.close();
});
test('global formats are grouped on both sides and preserve the point when changed',()=>{
  const a=app();assert.equal([...a.$('#fromSys').options].some(o=>o.value==='mercator'||o.value==='globalutm'),false);
  a.paste('1.352083,103.819836');a.change('#toSys','mgrs');
  for(const format of ['globalutm','mercator','mgrs']){
    a.change('#toFormat',format);assert.equal(a.$('#copyBtn').disabled,false,a.$('#badPair').textContent);assert.equal(a.$('#toSys').value,'mgrs');
    assert.equal(a.state().to,format);
  }
  a.change('#toFormat','globalutm');a.$('#swapBtn').click();a.$('#convertBtn').click();
  assert.ok(a.$('#fromRows .prefix').value.includes('48N'));assert.match(a.$('#fromRows .a').value,/^\d+\.\d{3}$/);
  for(const format of ['mercator','mgrs','globalutm']){
    a.change('#fromFormat',format);assert.equal(a.$('#copyBtn').disabled,false,a.$('#badPair').textContent);
    assert.ok(Math.abs(a.state().points[0].lat-1.352083)<.0001);assert.equal(a.$('#regionChip').hidden,true);
  }
  a.dom.window.close();
});
test('Taiwan shows Pao Li and the square north of Yunlin even with unrelated short digits',()=>{
  const a=app(undefined,true);a.paste('3000 3000');a.$('[data-location="taiwan"]').click();
  const layers=[];a.w.testMap.eachLayer(l=>{if(l.options?.aoCandidate)layers.push(l);});
  const c=core();
  for(const [lat,lon] of [[22.065843,120.794543],[24.1,120.5]]){
    const en=vm.runInContext(`toProjFromWGS(${lat},${lon},"UTM51N")`,c);
    assert.ok(layers.some(l=>l.options.aoCandidate.e===Math.floor(en.E/100000)&&l.options.aoCandidate.n===Math.floor(en.N/100000)));
  }
  const invalid=layers.find(l=>l.options.aoCandidate.invalid);assert.ok(invalid);
  invalid.fire('click',{originalEvent:new a.w.MouseEvent('click')});assert.equal(a.$('#aoApply').disabled,true);assert.match(a.$('#aoWarning').textContent,/outside Taiwan/);
  a.dom.window.close();
});
test('Singapore latitude/longitude defaults to local 4+4 without any location prompt',()=>{
  const a=app(undefined,true);a.paste('1.352083,103.819836');
  assert.equal(a.$('#toSys').value,'sg');assert.match(a.$('#toRows .a').value,/^\d{4}$/);
  assert.equal(a.$('#locationOverlay').classList.contains('open'),false);assert.equal(a.$('#aoOverlay').classList.contains('open'),false);a.dom.window.close();
});
test('explicit Raw WGS 84 input skips the quick selector',()=>{
  const a=app(undefined,true);a.change('#fromSys','mgrs');a.paste('1234 5678');
  assert.equal(a.$('#locationOverlay').classList.contains('open'),false);assert.ok(a.$('#aoOverlay').classList.contains('open'));a.dom.window.close();
});
test('Brunei can be resolved by one country choice without a map',()=>{
  const c=core(),cells=vm.runInContext('formatPoint(4.9,114.9,"brunei",defaultSettings())',c);
  const a=app(undefined,true);a.change('#fromSys','wgs84');a.paste(cells.join(' '));a.$('[data-location="brunei"]').click();
  assert.equal(a.$('#fromSys').value,'brunei');assert.equal(a.$('#copyBtn').disabled,false);assert.equal(a.$('#aoOverlay').classList.contains('open'),false);a.dom.window.close();
});
test('paste outside presets selects global MGRS with letters and auto AO',()=>{
  const a=app();a.paste('48.8582, 2.2945');assert.equal(a.$('#toSys').value,'mgrs');
  assert.match(a.$('#toRows .a').value,/^31UDQ \d{4}$/);assert.equal(a.state().settings.mgrs.ao,'31UDQ');a.dom.window.close();
});
test('country change revalidates immediately, clears output and exports',()=>{
  const a=app();a.paste('1.352083,103.819836');assert.equal(a.$('#toSys').value,'sg');assert.equal(a.$('#copyBtn').disabled,false);
  a.change('#toSys','taiwan');assert.match(a.$('#badPair').textContent,/Singapore, not Taiwan/);assert.equal(a.$('#copyBtn').disabled,true);assert.equal(a.$('#toRows .a'),null);a.dom.window.close();
});
test('explicit global output assumes WGS 84 without confirmation or auto-switching',()=>{
  const a=app();a.paste('1.352083,103.819836');a.change('#toSys','mgrs');assert.equal(a.$('#datumOverlay'),null);assert.equal(a.$('#copyBtn').disabled,false);
  assert.match(a.$('#toRows .a').value,/^48N/);a.paste('1.36,103.83');assert.equal(a.$('#toSys').value,'mgrs');a.dom.window.close();
});
test('cross-AO batch forces prefixes and red warning even after format toggles',()=>{
  const a=app();a.paste('48.8582,2.2945');
  const s=a.state();s.settings.mgrs.sgOmit=true;
  a.dom.window.close();const b=app(s);b.paste('48.8582,2.2945\n51.5074,-0.1278');
  assert.match(b.$('#badPair').textContent,/cross an AO boundary/);assert.equal(b.state().settings.mgrs.sgOmit,false);
  assert.match(b.$('#toRows').children[0].querySelector('.a').value,/^31UDQ/);assert.match(b.$('#toRows').children[1].querySelector('.a').value,/^30U/);b.dom.window.close();
});
test('complete MGRS input needs no AO, exports location',()=>{
  const a=app();a.paste('31UDQ 4825 1193');assert.equal(a.$('#fromSys').value,'mgrs');assert.equal(a.$('#toSys').value,'wgs84');assert.equal(a.$('#copyBtn').disabled,false);assert.equal(a.w.mapOptions,undefined);a.dom.window.close();
});
test('input edits immediately invalidate exports',()=>{
  const a=app();a.paste('48.8582,2.2945');const input=a.$('#fromRows .a');input.value='bad';input.dispatchEvent(new a.w.Event('input'));assert.equal(a.$('#copyBtn').disabled,true);a.dom.window.close();
});
test('Australia settings migrate to single combined approximation',()=>{
  const c=core();const saved={from:'wgs84',to:'australia',rows:[['','','']],settings:vm.runInContext('defaultSettings()',c),points:[]};saved.settings.australia.datum='agd66';
  const a=app(saved);a.paste('-22.7105094,150.4091992');assert.equal(a.state().settings.australia.datum,undefined);assert.equal(a.$('#copyBtn').disabled,false);
  a.$('#tab-set').click();assert.match(a.$('#view-set').textContent,/WGS 84 \/ GDA2020/);assert.doesNotMatch(a.$('#view-set').innerHTML,/data-v="gda2020"/);a.dom.window.close();
});
test('ambiguous input introduces the quick chooser; Singapore is one click',()=>{
  const a=app(undefined,true);a.change('#fromSys','wgs84');a.paste('3000 3000');
  assert.ok(a.$('#locationOverlay').classList.contains('open'));assert.equal(a.$('#aoMap canvas'),null);
  a.$('[data-location="sg"]').click();assert.equal(a.$('#fromSys').value,'sg');assert.equal(a.$('#copyBtn').disabled,false);assert.equal(a.$('#aoOverlay').classList.contains('open'),false);a.dom.window.close();
});
test('country selection opens a focused map with named camps and only AO grids',()=>{
  for(const [id,names] of [['thailand',['Sai Yok']],['australia',['Camp Tilpal','Camp Growl']],['taiwan',['Hukou','Heng Chun']]]){
    const a=app(undefined,true);a.change('#fromSys','wgs84');a.paste('1234 5678');a.$('[data-location="'+id+'"]').click();
    assert.ok(a.$('#aoOverlay').classList.contains('open'));assert.equal(a.$('#aoJump'),null);
    const labels=[...a.w.document.querySelectorAll('.camp-label')].map(e=>e.textContent).join(' ');
    for(const name of names)assert.ok(labels.includes(name),name);
    assert.match(a.$('#aoScale').textContent,/100 km AO squares|No matching AO/);a.dom.window.close();
  }
});
test('Raw WGS 84 starts with an uncluttered world map and no extra confirmation',()=>{
  const a=app(undefined,true);a.change('#fromSys','wgs84');a.paste('1234 5678');a.$('[data-location="mgrs"]').click();
  assert.match(a.$('#aoTitle').textContent,/Raw WGS 84/);assert.equal(a.$('#aoDatumConfirm'),null);
  assert.equal(a.w.document.querySelectorAll('.grid-label').length,0);assert.match(a.$('#aoScale').textContent,/Zoom in/);a.dom.window.close();
});
test('dismissed chooser preserves input and Convert asks again',()=>{
  const a=app(undefined,true);a.change('#fromSys','wgs84');a.paste('1234 5678');a.$('#locationClose').click();
  assert.equal(a.$('#fromRows .a').value,'1234');assert.equal(a.$('#fromRows .b').value,'5678');
  a.$('#convertBtn').click();assert.ok(a.$('#locationOverlay').classList.contains('open'));assert.equal(a.$('#copyBtn').disabled,true);a.dom.window.close();
});
test('complete global inputs across AOs warn even with latitude/longitude output',()=>{
  const a=app();a.paste('31UDQ 4825 1193\n30UXC 9931 1016');
  assert.match(a.$('#badPair').textContent,/AO boundary/);assert.equal(a.$('#copyBtn').disabled,false);a.dom.window.close();
});
test('global formatting does not invent finer grid precision',()=>{
  const c=core();assert.deepEqual(Array.from(vm.runInContext('formatPoint(48.8582,2.2945,"mgrs",defaultSettings(),3)',c)),['31UDQ 482','119']);
});
test('source settings changes invalidate previous results',()=>{
  const a=app();a.paste('31UDQ 4825 1193');a.$('#tab-set').click();a.$('[data-head="mgrs"]').click();
  assert.equal(a.$('#copyBtn').disabled,false);a.$('[data-reset="mgrs"]').click();
  assert.equal(a.$('#copyBtn').disabled,true);a.dom.window.close();
});
test('boundary guard cannot be bypassed by the output-prefix checkbox',async()=>{
  const a=app();a.paste('48.8582,2.2945\n51.5074,-0.1278');a.$('#tab-set').click();a.$('[data-head="mgrs"]').click();
  await new Promise(resolve=>setTimeout(resolve,10));
  a.$('#om_mgrs').click();assert.equal(a.$('#om_mgrs').checked,false);assert.match(a.$('#badPair').textContent,/AO boundary/);a.dom.window.close();
});
test('explicit WGS 84 remains global when moving from Singapore to Brunei',()=>{
  const a=app();a.paste('1.352083,103.819836');a.change('#toSys','mgrs');
  a.paste('4.9,114.9');assert.equal(a.$('#toSys').value,'mgrs');assert.equal(a.$('#copyBtn').disabled,false);a.dom.window.close();
});
test('every visible country square is selectable and selection uses exactly its displayed polygon',()=>{
  for(const [id,lat,lon] of [['taiwan',24.9,121.05],['taiwan',22.065843,120.794543],['australia',-22.80307,150.33732],['thailand',14.00287,99.24459]]){
    const c=core(),en=vm.runInContext('toProjFromWGS('+lat+','+lon+',projectionFor("'+id+'"))',c);
    const input=[en.E,en.N].map(v=>String(Math.floor(v%100000/10)).padStart(4,'0')).join(' ');
    const a=app(undefined,true);a.change('#fromSys','wgs84');a.paste(input);a.$('[data-location="'+id+'"]').click();
    const layers=[];a.w.testMap.eachLayer(l=>{if(l.options?.aoCandidate)layers.push(l);});assert.ok(layers.length>0,id);
    for(const layer of layers){
      layer.fire('click',{originalEvent:new a.w.MouseEvent('click')});
      assert.equal(a.$('#aoApply').disabled,!!layer.options.aoCandidate.invalid);assert.equal(a.$('#aoWarning').hidden,!layer.options.aoCandidate.invalid);
      const highlighted=[];a.w.testMap.eachLayer(l=>{if(l.options?.color==='#7c3aed'&&l.getLatLngs)highlighted.push(l);});
      assert.equal(highlighted.length,1);assert.equal(JSON.stringify(highlighted[0].getLatLngs()),JSON.stringify(layer.getLatLngs()));
      const r=layer.options.aoCandidate;
      assert.equal(vm.runInContext('presetContains("'+id+'",'+r.point.lat+','+r.point.lon+')',c),!r.invalid);
      const xy=r.polygon.map(p=>a.w.proj4('WGS84',r.proj,p));
      assert.ok(Math.abs(Math.max(...xy.map(p=>p[0]))-Math.min(...xy.map(p=>p[0]))-100000)<.01);
    }
    layers.find(l=>!l.options.aoCandidate.invalid).fire('click',{originalEvent:new a.w.MouseEvent('click')});
    a.$('#aoApply').click();assert.equal(a.$('#copyBtn').disabled,false,id);a.dom.window.close();
  }
});
test('larger Raw WGS 84 zones retain square letters and cannot invent missing ones',()=>{
  const c=core();assert.match(c.GlobalGrid.parse('1234 5678','31U').error,/square letters/);
  assert.equal(c.GlobalGrid.parse('DQ 4825 1193','31U').prefix,'31UDQ');
  const settings=vm.runInContext('defaultSettings()',c);settings.mgrs.ao='31U';settings.mgrs.sgOmit=true;c.settings=settings;
  assert.match(vm.runInContext('formatPoint(48.8582,2.2945,"mgrs",settings)[0]',c),/^DQ /);
  const a=app(undefined,true);a.change('#fromSys','mgrs');a.paste('1234 5678');a.change('#aoSize','zone');
  a.w.testMap.setView([48,2],5,{animate:false});a.change('#aoSize','zone');
  const cells=[];a.w.testMap.eachLayer(l=>{if(l.options?.aoCandidate)cells.push(l);});assert.ok(cells.length);
  const cell=cells.find(l=>l.options.aoCandidate.prefix==='31U');assert.ok(cell);cell.fire('click',{originalEvent:new a.w.MouseEvent('click')});
  a.$('#aoApply').click();assert.equal(a.state().settings.mgrs.ao,'31U');assert.equal(a.$('#copyBtn').disabled,true);assert.match(a.$('#badPair').textContent,/square letters/);
  a.paste('DQ 4825 1193');assert.equal(a.$('#copyBtn').disabled,false);a.dom.window.close();
});
test('coarse global output supports 100 km references and never becomes blank',()=>{
  const c=core();assert.equal(vm.runInContext('(()=>{const s=defaultSettings();s.mgrs={sgDigits:0,sgOmit:true,ao:"31UDQ"};return formatPoint(48.8582,2.2945,"mgrs",s)[0]})()',c),'31UDQ');
});
test('requested Cloudflare analytics is present once with the supplied token',()=>{
  const doc=new JSDOM(html).window.document,scripts=doc.querySelectorAll('script[data-cf-beacon]');assert.equal(scripts.length,1);
  assert.equal(scripts[0].src,'https://static.cloudflareinsights.com/beacon.min.js');assert.equal(JSON.parse(scripts[0].dataset.cfBeacon).token,'21282bd8a3994bb8a1e41ced9b4a604d');
});
test('every labelled camp and city lies in its own preset boundary',()=>{
  const c=core();assert.equal(vm.runInContext('Object.values(PRESETS).every(p=>(p.context?.landmarks||[]).every(l=>presetContains(p.id,l.lat,l.lon)))',c),true);
});
