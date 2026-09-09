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
function app(saved,realMap=false,militaryEnabled=true){
  const dom=new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g,''),{url:'https://example.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  if(saved)w.localStorage.setItem('mgrconv-v1',JSON.stringify(saved));
  for(const f of ['version.js','proj4.js','vendor/mgrs.js','grid-core.js','map-context.js','map-support.js'])w.eval(read(f));
  if(realMap){
    const ctx=new Proxy({measureText:s=>({width:String(s).length*6})},{get:(obj,key)=>key in obj?obj[key]:()=>{}});
    w.HTMLCanvasElement.prototype.getContext=()=>ctx;
    Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{get(){return w.testWidth||800;}});
    Object.defineProperty(w.HTMLElement.prototype,'clientHeight',{get(){return ['aoMap','pointMap'].includes(this.id)?w.testHeight||480:40;}});
    w.ResizeObserver=class {constructor(callback){w.resizePicker=callback;}observe(){}};
    w.fetch=async url=>({ok:true,text:async()=>read('version.js'),json:async()=>{const match=url.match(/tilemap\/(\d+)\/\d+\/\d+\/(\d+)\/(\d+)/);return match?{data:Array(+match[2]*+match[3]).fill(+match[1]>18?0:1)}:JSON.parse(read(url.startsWith('vendor/')?url:'vendor/land.geojson'));}});
    w.eval(read('vendor/leaflet.js'));const createMap=w.L.map;w.L.map=(...args)=>{const map=createMap(...args);if(args[0]==='pointMap')w.pointTestMap=map;else w.testMap=map;return map;};w.eval(read('map-picker.js'));w.eval(read('point-picker.js'));
  }else w.createAOPicker=opts=>{w.pickerHooks=opts;return {open:o=>{w.mapOptions=o;w.document.getElementById('aoOverlay').classList.add('open');}};};
  if(!realMap)w.createPointPicker=opts=>{w.pointPickerHooks=opts;return {open:o=>{w.pointOptions=o;}};};
  w.eval(inline);
  // Existing global-grid scenarios opt in through the same Settings control as users.
  if(militaryEnabled){w.document.querySelector('#tab-set').click();const toggle=w.document.querySelector('#militaryToggle');if(toggle.getAttribute('aria-pressed')==='false')toggle.click();w.document.querySelector('#tab-conv').click();}
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
  a.change('#fromSys','mgrs');assert.equal(a.$('#fromRows .b').hidden,false);assert.ok(a.$('#fromRows .prefix'));assert.equal(a.w.mapOptions,undefined);
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
test('unlabelled projected meters require a zone; removed projection is rejected',()=>{
  const raw='11553992.183085 151736.075979';const a=app();a.paste(raw);
  assert.equal(a.$('#copyBtn').disabled,true);assert.match(a.$('#badPair').textContent,/zone prefix/);assert.equal(a.$('#fromRows .a').value,raw);
  a.paste('EPSG:3857 '+raw);assert.equal(a.$('#copyBtn').disabled,true);assert.match(a.$('#badPair').textContent,/not supported/);
  assert.equal(a.$('#fromFormat option[value="mercator"]'),null);
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
test('global Settings controls format and holds examples outside converter',async()=>{
  const a=app();a.paste('1.2964704,103.8210085');a.change('#toSys','mgrs');
  assert.equal(a.$('#toFormatExample'),null);assert.match(a.$('#toFormatChip').textContent,/MGRS/);
  a.$('#tab-set').click();a.$('[data-head="mgrs"]').click();await new Promise(r=>setTimeout(r,20));
  assert.match(a.$('[data-head="mgrs"]').textContent,/Military grid/);
  a.$('[data-id="mgrs"] [data-v="globalutm"]').click();await new Promise(r=>setTimeout(r,20));
  assert.equal(a.state().to,'globalutm');assert.match(a.$('#toFormatChip').textContent,/UTM/);
  assert.match(a.$('[data-id="mgrs"] .example').textContent,/368831.814/);assert.equal(a.$('#aoCenter'),null);
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
  assert.equal(a.w.mapOptions,undefined);assert.equal(a.$('#copyBtn').disabled,false);
  a.dom.window.close();
});
test('reload always returns to Auto-detect while retaining coordinates and names',()=>{
  const first=app();first.paste('48N 366000 149000');const saved=first.state();saved.rows[0][2]='Keep me';first.dom.window.close();
  const a=app(saved);assert.equal(a.$('#fromSys').value,'auto');assert.equal(a.$('#fromRows .nm').value,'Keep me');
  assert.match(a.$('#fromRows .a').value,/48N 366000 149000/);assert.equal(a.$('#copyBtn').disabled,true);
  assert.equal(a.$('#pasteHint').querySelectorAll('li').length,0);assert.equal(a.$('#fromRows .nm').hidden,true);assert.equal(a.$('#fromRows .a').placeholder,'Paste here');a.dom.window.close();
});
test('restored batches can be detected again without losing row names',()=>{
  const a=app();a.paste('1.35,103.82\n1.36,103.83');const saved=a.state();saved.rows[0][2]='One';saved.rows[1][2]='Two';a.dom.window.close();
  const b=app(saved);b.$('#convertBtn').click();assert.equal(b.$('#copyBtn').disabled,false,b.$('#badPair').textContent);
  assert.deepEqual(Array.from(b.state().points,p=>p.name),['One','Two']);b.dom.window.close();
});
test('global formats are grouped on both sides and preserve the point when changed',()=>{
  const a=app();assert.equal([...a.$('#fromSys').options].some(o=>o.value==='mercator'||o.value==='globalutm'),false);
  a.paste('1.352083,103.819836');a.change('#toSys','mgrs');
  for(const format of ['globalutm','mgrs']){
    a.change('#toFormat',format);assert.equal(a.$('#copyBtn').disabled,false,a.$('#badPair').textContent);assert.equal(a.$('#toSys').value,'mgrs');
    assert.equal(a.state().to,format);
  }
  a.change('#toFormat','globalutm');a.$('#swapBtn').click();a.$('#convertBtn').click();
  assert.ok(a.$('#fromRows .prefix').value.includes('48N'));assert.match(a.$('#fromRows .a').value,/^\d+\.\d{3}$/);
  for(const format of ['mgrs','globalutm']){
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
test('military grid without a prefix allows correction to Singapore',()=>{
  const a=app(undefined,true);a.change('#fromSys','mgrs');a.paste('3000 3000');
  assert.equal(a.$('#locationOverlay').classList.contains('open'),true);a.$('[data-location="sg"]').click();assert.equal(a.state().from,'sg');assert.deepEqual(a.state().rows[0].slice(0,2),['3000','3000']);a.dom.window.close();
});
test('Brunei can be resolved by one country choice without a map',()=>{
  const c=core(),cells=vm.runInContext('formatPoint(4.9,114.9,"brunei",defaultSettings())',c);
  const a=app(undefined,true);a.change('#fromSys','wgs84');a.paste(cells.join(' '));a.$('[data-location="brunei"]').click();
  assert.equal(a.$('#fromSys').value,'brunei');assert.equal(a.$('#copyBtn').disabled,false);assert.equal(a.$('#aoOverlay').classList.contains('open'),false);a.dom.window.close();
});
test('paste outside presets selects global MGRS with letters and auto AO',()=>{
  const a=app();a.paste('48.8582, 2.2945');assert.equal(a.$('#toSys').value,'mgrs');
  assert.equal(a.$('#toRows .prefix').value,'31U DQ');assert.match(a.$('#toRows .a').value,/^\d{4}$/);assert.equal(a.state().settings.mgrs.ao,'31UDQ');a.dom.window.close();
});
test('country change revalidates immediately, clears output and exports',()=>{
  const a=app();a.paste('1.352083,103.819836');assert.equal(a.$('#toSys').value,'sg');assert.equal(a.$('#copyBtn').disabled,false);
  a.change('#toSys','taiwan');assert.match(a.$('#badPair').textContent,/Singapore, not Taiwan/);assert.equal(a.$('#copyBtn').disabled,true);assert.equal(a.$('#toRows .a'),null);a.dom.window.close();
});
test('explicit global output assumes WGS 84 without confirmation or auto-switching',()=>{
  const a=app();a.paste('1.352083,103.819836');a.change('#toSys','mgrs');assert.equal(a.$('#datumOverlay'),null);assert.equal(a.$('#copyBtn').disabled,false);
  assert.match(a.$('#toRows .prefix').value,/^48N/);a.paste('1.36,103.83');assert.equal(a.$('#toSys').value,'mgrs');a.dom.window.close();
});
test('cross-AO batch forces prefixes and red warning even after format toggles',()=>{
  const a=app();a.paste('48.8582,2.2945');
  const s=a.state();s.settings.mgrs.sgOmit=true;
  a.dom.window.close();const b=app(s);b.paste('48.8582,2.2945\n51.5074,-0.1278');
  assert.equal(b.$('#boundaryOverlay').classList.contains('open'),true);assert.equal(b.$('#copyBtn').disabled,true);b.$('#boundaryContinue').click();
  assert.match(b.$('#badPair').textContent,/grid boundary/);assert.equal(b.state().settings.mgrs.sgOmit,false);
  assert.match(b.$('#toRows').children[0].querySelector('.prefix').value,/^31U DQ/);assert.match(b.$('#toRows').children[1].querySelector('.prefix').value,/^30U/);b.dom.window.close();
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
    const labels=[...a.w.document.querySelectorAll('.map-point-label')].map(e=>e.textContent).join(' ');
    for(const name of names)assert.ok(labels.includes(name),name);
    assert.equal(a.$('#aoScale'),null);assert.match(a.$('#aoInstruction').textContent,/100 km grid square/);a.dom.window.close();
  }
});
test('Raw WGS 84 starts with an uncluttered world map and no extra confirmation',()=>{
  const a=app(undefined,true);a.change('#fromSys','wgs84');a.paste('1234 5678');a.$('[data-location="mgrs"]').click();
  assert.match(a.$('#aoTitle').textContent,/Military grid/);assert.equal(a.$('#aoDatumConfirm'),null);
  assert.equal(a.w.document.querySelectorAll('.grid-label').length,0);assert.equal(a.$('#aoScale'),null);a.dom.window.close();
});
test('dismissed chooser preserves input and Convert asks again',()=>{
  const a=app(undefined,true);a.change('#fromSys','wgs84');a.paste('1234 5678');a.$('#locationClose').click();
  assert.equal(a.$('#fromRows .a').value,'1234');assert.equal(a.$('#fromRows .b').value,'5678');
  a.$('#convertBtn').click();assert.ok(a.$('#locationOverlay').classList.contains('open'));assert.equal(a.$('#copyBtn').disabled,true);a.dom.window.close();
});
test('complete global inputs across AOs warn even with latitude/longitude output',()=>{
  const a=app();a.paste('31UDQ 4825 1193\n30UXC 9931 1016');
  assert.equal(a.$('#boundaryOverlay').classList.contains('open'),true);a.$('#boundaryContinue').click();
  assert.match(a.$('#badPair').textContent,/grid boundary/);assert.equal(a.$('#copyBtn').disabled,false);a.dom.window.close();
});
test('global formatting does not invent finer grid precision',()=>{
  const c=core();assert.deepEqual(Array.from(vm.runInContext('formatPoint(48.8582,2.2945,"mgrs",defaultSettings(),3)',c)),['31U DQ 482','119']);
});
test('source settings changes invalidate previous results',()=>{
  const a=app();a.paste('31UDQ 4825 1193');a.$('#tab-set').click();a.$('[data-head="mgrs"]').click();
  assert.equal(a.$('#copyBtn').disabled,false);a.$('[data-reset="mgrs"]').click();
  assert.equal(a.$('#copyBtn').disabled,true);a.dom.window.close();
});
test('boundary guard cannot be bypassed by the output-prefix checkbox',async()=>{
  const a=app();a.paste('48.8582,2.2945\n51.5074,-0.1278');a.$('#boundaryContinue').click();a.$('#tab-set').click();a.$('[data-head="mgrs"]').click();
  await new Promise(resolve=>setTimeout(resolve,10));
  a.$('#om_mgrs').click();assert.equal(a.$('#om_mgrs').checked,false);assert.match(a.$('#badPair').textContent,/grid boundary/);a.dom.window.close();
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
test('Settings retains whole-zone selection and requires square letters',async()=>{
  const c=core();assert.match(c.GlobalGrid.parse('1234 5678','31U').error,/square letters/);
  assert.equal(c.GlobalGrid.parse('DQ 4825 1193','31U').prefix,'31UDQ');
  const settings=vm.runInContext('defaultSettings()',c);settings.mgrs.ao='31U';settings.mgrs.sgOmit=true;c.settings=settings;
  assert.match(vm.runInContext('formatPoint(48.8582,2.2945,"mgrs",settings)[0]',c),/^DQ /);
  const a=app(undefined,true);a.change('#fromSys','mgrs');a.$('#tab-set').click();a.$('[data-head="mgrs"]').click();await new Promise(r=>setTimeout(r,20));a.$('#mapbtn_mgrs').click();
  a.w.testMap.setView([48,2],5,{animate:false});await new Promise(r=>setTimeout(r,30));
  const cells=[];a.w.testMap.eachLayer(l=>{if(l.options?.aoCandidate)cells.push(l);});assert.ok(cells.length);
  const cell=cells.find(l=>l.options.aoCandidate.prefix==='31U');assert.ok(cell);cell.fire('click',{originalEvent:new a.w.MouseEvent('click')});
  a.$('#aoApply').click();assert.equal(a.state().settings.mgrs.ao,'31U');assert.equal(a.$('#copyBtn').disabled,true);
  a.$('#tab-conv').click();a.paste('DQ 4825 1193');assert.equal(a.$('#copyBtn').disabled,false);a.dom.window.close();
});
test('coarse global output supports 100 km references and never becomes blank',()=>{
  const c=core();assert.equal(vm.runInContext('(()=>{const s=defaultSettings();s.mgrs={sgDigits:0,sgOmit:true,ao:"31UDQ"};return formatPoint(48.8582,2.2945,"mgrs",s)[0]})()',c),'31U DQ');
});
test('requested Cloudflare analytics is present once with the supplied token',()=>{
  const doc=new JSDOM(html).window.document,scripts=doc.querySelectorAll('script[data-cf-beacon]');assert.equal(scripts.length,1);
  assert.equal(scripts[0].src,'https://static.cloudflareinsights.com/beacon.min.js');assert.equal(JSON.parse(scripts[0].dataset.cfBeacon).token,'21282bd8a3994bb8a1e41ced9b4a604d');
});

test('auto-detect hides names and Add row until detection, then removes its option',()=>{
  const a=app();assert.equal(a.$('#fromRows .a').tagName,'TEXTAREA');assert.equal(a.$('#fromRows .nm').hidden,true);assert.equal(a.$('#addRow').hidden,true);
  a.paste('1.35,103.82');assert.equal(a.$('#fromSys option[value="auto"]'),null);assert.equal(a.$('#addRow').hidden,false);assert.equal(a.$('#fromRows .nm').hidden,false);
  a.$('#fromRows .del').click();assert.ok(a.$('#fromSys option[value="auto"]'));a.dom.window.close();
});

test('bulk coordinate delimiters retain all points in order',()=>{
  for(const text of ['1.35,103.82,1.36,103.83','1.35\t103.82\t1.36\t103.83','1.35 103.82;1.36 103.83','1.35,103.82\n1.36,103.83']){
    const a=app();a.paste(text);assert.equal(a.$('#copyBtn').disabled,false,a.$('#badPair').textContent);assert.equal(a.state().points.length,2,text);assert.deepEqual(a.state().points.map(p=>p.lat),[1.35,1.36]);a.dom.window.close();
  }
});

test('multiple links preserve URL commas and all coordinates',()=>{
  for(const separator of [' ', '\t', ',', '\n']){
    const a=app();a.paste('https://maps.google.com/?q=1.35,103.82'+separator+'https://maps.apple.com/?ll=1.36,103.83');assert.equal(a.$('#copyBtn').disabled,false,a.$('#badPair').textContent);assert.equal(a.state().points.length,2);a.dom.window.close();
  }
});

test('bulk short grids retain digits through country correction',()=>{
  const a=app(undefined,true);a.change('#fromSys','mgrs');a.paste('3000,3000;5000\t4000');assert.equal(a.$('#locationOverlay').classList.contains('open'),true);
  a.$('[data-location="sg"]').click();assert.equal(a.state().from,'sg');assert.deepEqual(a.state().rows.map(r=>r.slice(0,2)),[['3000','3000'],['5000','4000']]);a.dom.window.close();
});

test('bulk complete grids preserve each prefix',()=>{
  const a=app();a.paste('48N UG 6883 4332,48N UG 6983 4432');assert.equal(a.state().points.length,2,a.$('#badPair').textContent);assert.equal(a.$('#fromRows .prefix').value,'48N UG');a.dom.window.close();
});

test('new rows inherit the preceding prefix once and never overwrite existing edits',()=>{
  const a=app();a.paste('48N UG 6883 4332');a.$('#addRow').click();
  const rows=()=>a.$('#fromRows').children;
  assert.equal(rows()[1].querySelector('.prefix').value,'48N UG');assert.equal(rows()[1].querySelector('.a').value,'');
  a.$('#convertBtn').click();assert.equal(a.state().points.length,1);assert.equal(a.$('#copyBtn').disabled,false);
  rows()[1].querySelector('.prefix').value='48N VG';a.$('#addRow').click();assert.equal(rows().length,2);
  rows()[1].querySelector('.a').value='1234';rows()[1].querySelector('.b').value='5678';rows()[1].querySelector('.b').dispatchEvent(new a.w.Event('input'));a.$('#addRow').click();
  assert.equal(rows()[1].querySelector('.prefix').value,'48N VG');assert.equal(rows()[2].querySelector('.prefix').value,'48N VG');
  rows()[2].querySelector('.prefix').value='';rows()[2].querySelector('.a').value='1234';rows()[2].querySelector('.b').value='5678';rows()[2].querySelector('.b').dispatchEvent(new a.w.Event('input'));a.$('#addRow').click();assert.equal(rows()[2].querySelector('.prefix').value,'');assert.equal(rows()[3].querySelector('.prefix').value,'');
  a.dom.window.close();
});

test('Enter inherits UTM prefixes and keeps empty rows out of conversion',()=>{
  const a=app();a.paste('UTM 56S 250000 7500000');
  a.$('#fromRows .b').dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  assert.equal(a.$('#fromRows').children[1].querySelector('.prefix').value,'UTM 56S');
  a.$('#convertBtn').click();assert.equal(a.state().points.length,1);assert.equal(a.$('#copyBtn').disabled,false);a.dom.window.close();
});
test('every labeled camp and city lies in its own preset boundary',()=>{
  const c=core();assert.equal(vm.runInContext('Object.values(PRESETS).every(p=>(p.context?.landmarks||[]).every(l=>presetContains(p.id,l.lat,l.lon)))',c),true);
});

test('map button works from Auto-detect, appends points, and remembers the last location',()=>{
  const a=app();assert.equal(a.$('#selectMap').hidden,false);a.$('#selectMap').click();
  assert.equal(a.w.pointOptions.presetId,'wgs84');
  a.w.pointPickerHooks.onConfirm({lat:1.35,lon:103.82},{zoom:16,layer:'satellite'});
  assert.equal(a.state().from,'wgs84');assert.equal(a.state().rows.length,1);assert.equal(a.$('#copyBtn').disabled,false);
  a.$('#fromRows .nm').value='Start';a.$('#selectMap').click();
  assert.equal(a.w.pointOptions.points[0].name,'Start');assert.equal(a.w.pointOptions.center.lat,1.35);assert.equal(a.w.pointOptions.zoom,16);assert.equal(a.w.pointOptions.layer,'satellite');
  const first=Array.from(a.state().rows[0]);
  a.w.pointPickerHooks.onConfirm({lat:1.36,lon:103.83},{zoom:17,layer:'street'});
  assert.equal(a.state().rows.length,2);assert.deepEqual(a.state().rows[0].slice(0,2),first.slice(0,2));assert.equal(a.state().rows[0][2],'Start');
  a.$('#selectMap').click();assert.equal(a.w.pointOptions.center.lat,1.36);assert.equal(a.w.pointOptions.points[1].number,2);a.dom.window.close();
});

test('map points use every selected preset and full prefixes across country AOs',()=>{
  for(const [id,lat,lon] of [['wgs84',1.35,103.82],['mgrs',48.8582,2.2945],['globalutm',-22.71,150.409],['sg',1.35,103.82],['taiwan',24.1,120.5],['thailand',14,99.24],['australia',-22.71,150.409],['brunei',4.7,114.7]]){
    const a=app();a.change('#fromSys',id==='globalutm'?'mgrs':id);if(id==='globalutm')a.change('#fromFormat',id);
    a.$('#selectMap').click();const p={lat,lon};assert.equal(a.w.pointPickerHooks.preview(p,a.w.pointOptions).error,undefined,id);
    a.w.pointPickerHooks.onConfirm(p,{zoom:15,layer:'street'});assert.equal(a.state().from,id);assert.equal(a.state().rows.length,1,id);
    if(id==='wgs84')a.change('#toSys','sg');else a.change('#toSys','wgs84');
    a.$('#convertBtn').click();assert.equal(a.$('#copyBtn').disabled,false,id+': '+a.$('#badPair').textContent);
    assert.ok(Math.abs(a.state().points[0].lat-lat)<.0002,id);assert.ok(Math.abs(a.state().points[0].lon-lon)<.0002,id);
    if(['taiwan','thailand','australia'].includes(id)){assert.match(a.state().rows[0][0],/^\d{4}$/);assert.ok(a.state().settings[id].square);}
    a.dom.window.close();
  }
});

test('map rejects points outside a country preset without adding or replacing rows',()=>{
  const a=app();a.change('#fromSys','sg');a.paste('3000 3000');a.$('#selectMap').click();const before=a.state().rows;
  const p={lat:48.8582,lon:2.2945};assert.match(a.w.pointPickerHooks.preview(p,a.w.pointOptions).error,/inside/);
  assert.ok(a.w.pointPickerHooks.onConfirm(p,{zoom:12,layer:'street'}).error);assert.deepEqual(a.state().rows,before);a.dom.window.close();
});

test('choosing a country leaves map entry accessible; only short input needs an AO',()=>{
  const a=app();a.change('#fromSys','taiwan');assert.equal(a.w.mapOptions,undefined);
  a.$('#selectMap').click();assert.equal(a.w.pointOptions.presetId,'taiwan');a.paste('1234 5678');assert.ok(a.w.mapOptions.pending);a.dom.window.close();
});

test('map appends around incomplete rows without interpreting an unknown AO',()=>{
  const a=app();a.change('#fromSys','mgrs');a.$('#fromRows .a').value='1234';a.$('#fromRows .b').value='5678';a.$('#selectMap').click();
  assert.equal(a.w.pointOptions.unresolved,1);assert.equal(a.w.pointOptions.points.length,0);
  a.w.pointPickerHooks.onConfirm({lat:48.8582,lon:2.2945},{zoom:15,layer:'street'});
  assert.deepEqual(a.state().rows[0],['1234','5678','']);assert.equal(a.state().rows.length,2);assert.equal(a.state().settings.mgrs.ao,undefined);a.dom.window.close();
});

test('real crosshair picker cancels cleanly and Add & continue adds distinct new rows',async()=>{
  const a=app(undefined,true);a.$('#selectMap').click();await new Promise(r=>setTimeout(r,20));
  assert.equal(a.$('#pointOverlay').classList.contains('open'),true);assert.equal(a.$('main').inert,true);
  a.$('#pointClose').click();assert.equal(a.$('#pointOverlay').classList.contains('open'),false);assert.equal(a.$('main').inert,undefined);
  a.$('#selectMap').click();a.w.pointTestMap.setView([1.35,103.82],15,{animate:false});a.$('#pointContinue').click();
  assert.equal(a.state().rows.length,1);assert.equal(a.$('#pointOverlay').classList.contains('open'),true);assert.match(a.$('#pointCount').textContent,/1 existing/);
  a.w.pointTestMap.setView([1.36,103.83],16,{animate:false});a.$('#pointConfirm').click();assert.equal(a.state().rows.length,2);assert.equal(a.$('#pointOverlay').classList.contains('open'),false);
  a.$('#selectMap').click();assert.ok(Math.abs(a.w.pointTestMap.getCenter().lat-1.36)<.00005,JSON.stringify(a.w.pointTestMap.getCenter()));assert.equal(a.w.pointTestMap.getZoom(),16);
  a.$('#pointOverlay').dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(a.$('#pointOverlay').classList.contains('open'),false);a.dom.window.close();
});

test('street layer persists through overview zoom and satellite toggle preserves center',async()=>{
  const a=app(undefined,true);a.$('#selectMap').click();await new Promise(r=>setTimeout(r,20));
  const activeTiles=()=>{const layers=[];a.w.pointTestMap.eachLayer(l=>{if(l instanceof a.w.L.TileLayer)layers.push(l);});return layers;};
  a.w.pointTestMap.setView([20,100],4,{animate:false});assert.equal(activeTiles().length,1);assert.equal(a.$('#pointMapScale'),null);assert.ok(a.$('.singapore-name'));
  const streets=activeTiles()[0];a.w.pointTestMap.setZoom(7,{animate:false});assert.equal(activeTiles().length,1);assert.equal(activeTiles()[0],streets);assert.match(streets._url,/openstreetmap/);
  const center=a.w.pointTestMap.getCenter();a.$('#pointSatellite').click();await new Promise(r=>setTimeout(r,250));assert.equal(activeTiles().length,1);assert.match(activeTiles()[0]._url,/World_Imagery/);assert.equal(a.w.pointTestMap.getCenter().lat,center.lat);
  activeTiles()[0].fire('tileerror');assert.equal(a.$('#pointNetwork').hidden,false);
  a.$('#pointStreet').click();assert.equal(a.$('#pointNetwork').hidden,true);a.dom.window.close();
});

test('past-point labels render names as text and number unnamed points',async()=>{
  const a=app(undefined,true);a.paste('1.35,103.82\n1.36,103.83');a.$('#fromRows .nm').value='<img src=x onerror=alert(1)>';a.$('#selectMap').click();
  const labels=[...a.w.document.querySelectorAll('.chosen-point-label')];assert.ok(labels.some(el=>el.textContent==='<img src=x onerror=alert(1)>'));assert.ok(labels.some(el=>el.textContent==='Point 2'));assert.equal(a.$('.chosen-point-label img'),null);await new Promise(r=>setTimeout(r,20));a.dom.window.close();
});

test('resizing the point map preserves its geographic center and zoom',async()=>{
  const a=app(undefined,true);a.$('#selectMap').click();await new Promise(r=>setTimeout(r,20));a.w.pointTestMap.setView([-22.65,150.35],9,{animate:false,reset:true});
  a.w.testWidth=390;a.w.testHeight=650;a.w.resizePicker();assert.equal(a.w.pointTestMap.getCenter().lat,-22.65);assert.equal(a.w.pointTestMap.getCenter().lng,150.35);assert.equal(a.w.pointTestMap.getZoom(),9);a.dom.window.close();
});

test('map boundary confirmation expands short Taiwan rows without moving existing points',async()=>{
  const a=app();a.change('#fromSys','taiwan');a.$('#selectMap').click();
  const p={lat:24.9,lon:121.05},q={lat:22.065843,lon:120.794543};
  const preview=a.w.pointPickerHooks.preview(p,a.w.pointOptions);
  a.w.pointPickerHooks.onConfirm(p,{zoom:15,layer:'street'});
  assert.deepEqual(a.state().rows[0].slice(0,2),Array.from(preview.cells));assert.match(a.state().rows[0][0],/^\d{4}$/);
  const first=a.state().points[0],before=a.state().rows;
  a.$('#selectMap').click();let pending=a.w.pointPickerHooks.onConfirm(q,{zoom:15,layer:'street'});
  assert.equal(a.$('#boundaryOverlay').classList.contains('open'),true);assert.deepEqual(a.state().rows,before);
  a.$('#boundaryClose').click();assert.equal((await pending).canceled,true);assert.deepEqual(a.state().rows,before);
  pending=a.w.pointPickerHooks.onConfirm(q,{zoom:15,layer:'street'});a.$('#boundaryContinue').click();await pending;
  assert.equal(a.state().rows.length,2);assert.equal(a.state().settings.taiwan.sgOmit,false);
  assert.match(a.state().rows[0][0],/^\d{5}$/);assert.match(a.state().rows[1][0],/^\d{5}$/);
  assert.ok(Math.abs(a.state().points[0].lat-first.lat)<.00002);assert.ok(Math.abs(a.state().points[0].lon-first.lon)<.00002);
  assert.ok(Math.abs(a.state().points[1].lat-q.lat)<.0002);a.dom.window.close();
});

test('MGRS map preview respects precision and boundary approval changes each prefix',async()=>{
  const a=app();a.change('#fromSys','mgrs');a.$('#selectMap').click();
  const p={lat:48.8582,lon:2.2945},q={lat:51.5074,lon:-.1278};
  const preview=a.w.pointPickerHooks.preview(p,a.w.pointOptions);assert.match(preview.cells[1],/^\d{4}$/);
  a.w.pointPickerHooks.onConfirm(p,{zoom:15,layer:'street'});a.$('#selectMap').click();
  const pending=a.w.pointPickerHooks.onConfirm(q,{zoom:15,layer:'street'});assert.equal(a.$('#boundaryOverlay').classList.contains('open'),true);
  a.$('#boundaryContinue').click();await pending;
  assert.match(a.state().rows[0][0],/^31U DQ/);assert.match(a.state().rows[1][0],/^30U/);assert.equal(a.state().points.length,2);a.dom.window.close();
});

test('map confirmation checks output boundaries before closing its parent',async()=>{
  const a=app(undefined,true);a.change('#fromSys','wgs84');a.change('#toSys','mgrs');a.paste('48.8582,2.2945');a.$('#selectMap').click();
  a.w.pointTestMap.setView([51.5074,-.1278],15,{animate:false});a.$('#pointConfirm').click();
  assert.equal(a.$('#boundaryOverlay').classList.contains('open'),true);assert.equal(a.$('#pointOverlay').classList.contains('open'),true);assert.equal(a.state().rows.length,1);
  a.$('#boundaryContinue').click();await new Promise(r=>setTimeout(r,20));
  assert.equal(a.$('#boundaryOverlay').classList.contains('open'),false);assert.equal(a.$('#pointOverlay').classList.contains('open'),false);assert.equal(a.state().points.length,2);assert.equal(a.$('main').inert,undefined);a.dom.window.close();
});

test('offline and failed connectivity disable map entry, recovery restores it',async()=>{
  const a=app();Object.defineProperty(a.w.navigator,'onLine',{configurable:true,value:false});a.w.dispatchEvent(new a.w.Event('offline'));
  assert.equal(a.$('#selectMap').disabled,true);a.$('#selectMap').click();assert.equal(a.w.pointOptions,undefined);
  assert.equal(a.$('#mapOffline').hidden,false,'the reason must be visible, not only a tooltip');
  Object.defineProperty(a.w.navigator,'onLine',{configurable:true,value:true});a.w.fetch=async()=>{throw Error('network');};a.w.dispatchEvent(new a.w.Event('online'));await new Promise(r=>setTimeout(r,0));assert.equal(a.$('#selectMap').disabled,true);
  a.w.fetch=async()=>({ok:true,text:async()=>'<html>Sign in to Wi-Fi</html>'});a.w.dispatchEvent(new a.w.Event('online'));await new Promise(r=>setTimeout(r,0));assert.equal(a.$('#selectMap').disabled,true);
  a.w.fetch=async()=>({ok:true,text:async()=>read('version.js')});a.w.dispatchEvent(new a.w.Event('online'));await new Promise(r=>setTimeout(r,0));assert.equal(a.$('#selectMap').disabled,false);
  assert.equal(a.$('#mapOffline').hidden,true,'the note clears once the map can load');
  // Reference-area selection remains usable with local geometry while offline.
  Object.defineProperty(a.w.navigator,'onLine',{configurable:true,value:false});a.w.dispatchEvent(new a.w.Event('offline'));a.change('#fromSys','taiwan');a.$('#regionChip').click();assert.equal(a.w.mapOptions.preset,'taiwan');a.dom.window.close();
});

test('the point map never snaps to a region; only the dropdown moves the camera',async()=>{
  const a=app(undefined,true);a.$('#selectMap').click();await new Promise(r=>setTimeout(r,20));const map=a.w.pointTestMap;
  map.setView([14.02,99.3],6,{animate:false});assert.equal(map.getCenter().lng,99.3);
  // Releasing a drag beside a landmark must leave the camera where the hand left it.
  map.fire('dragstart');map.setView([14.01,99.28],6,{animate:false});
  assert.ok(Math.abs(map.getCenter().lng-99.28)<0.03,'the map pulled itself towards a region');
  map.fire('dragstart');map.setView([14.03,99.31],6,{animate:false,reset:true});
  assert.ok(Math.abs(map.getCenter().lng-99.31)<0.03,'the map pulled itself towards a region');
  map.fire('dragstart');map.setView([1.351,103.821],15,{animate:false});assert.equal(map.getCenter().lng,103.821);
  a.change('#pointRegion','brunei');assert.equal(map.getCenter().lng,114.75);assert.equal(map.getZoom(),9);
  assert.equal(map.getMinZoom(),1);map.setZoom(22,{animate:false});assert.equal(map.getZoom(),19);a.dom.window.close();
});

test('regional AO maps stay regional and converter selection always uses squares',async()=>{
  const a=app(undefined,true);a.change('#fromSys','taiwan');a.$('#regionChip').click();const map=a.w.testMap;
  assert.ok(map.getMinZoom()>1);assert.equal(a.$('#aoRegion').hidden,true);map.setView([14,99],4,{animate:false});assert.ok(map.getCenter().lng>119);map.setZoom(22,{animate:false});assert.ok(map.getZoom()<=9);
  a.$('#aoClose').click();a.change('#fromSys','mgrs');a.$('#regionChip').click();assert.equal(a.$('#aoRegion').hidden,false);
  a.w.testMap.setView([48,2],6,{animate:false});await new Promise(r=>setTimeout(r,30));
  assert.match(a.$('#aoInstruction').textContent,/100 km grid square/);assert.match(a.$('#aoScope').textContent,/100 km square/);
  a.w.testMap.setView([48,2],5,{animate:false});await new Promise(r=>setTimeout(r,30));
  assert.match(a.$('#aoInstruction').textContent,/Grid zones at this zoom/);assert.match(a.$('#aoScope').textContent,/grid zone/);a.dom.window.close();
});

test('empty rows cannot multiply through Add row or Enter, and Auto-detect keeps it hidden',()=>{
  const a=app();assert.equal(a.$('#addRow').hidden,true);a.$('#fromRows .a').dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.equal(a.$('#fromRows').children.length,1);
  a.change('#fromSys','sg');assert.equal(a.$('#addRow').disabled,true);a.$('#fromRows .a').value='1234';a.$('#fromRows .a').dispatchEvent(new a.w.Event('input'));assert.equal(a.$('#addRow').disabled,true);
  a.$('#fromRows .b').value='5678';a.$('#fromRows .b').dispatchEvent(new a.w.Event('input'));assert.equal(a.$('#addRow').disabled,false);a.$('#addRow').click();assert.equal(a.$('#fromRows').children.length,2);assert.equal(a.$('#addRow').disabled,true);a.dom.window.close();
});

test('offline installation contains map geometry and connectivity never falls back to cache',async()=>{
  const handlers={},cached=new Map();let offline=false;
  const response={ok:true,type:'basic',clone(){return this;}};
  const ctx=vm.createContext({URL,Request,importScripts(){},self:{APP_VERSION:'test',location:{href:'https://example.test/sw.js',origin:'https://example.test'},addEventListener:(type,fn)=>handlers[type]=fn},
    caches:{open:async()=>({addAll:async requests=>{for(const r of requests){const pathname=new URL(r.url).pathname.slice(1)||'index.html';assert.ok(fs.existsSync(path.join(root,pathname)),pathname);cached.set(r.url,response);}},put:async(k,v)=>cached.set(k.url||k,v)}),match:async r=>cached.get(r.url||r)},
    fetch:async()=>{if(offline)throw Error('offline');return response;}});
  vm.runInContext(read('sw.js'),ctx);let work;handlers.install({waitUntil:p=>work=p});await work;
  offline=true;
  for(const file of ['map-context.js','vendor/countries.geojson','map-support.js','map-picker.js']){
    handlers.fetch({request:new Request('https://example.test/'+file),respondWith:p=>work=p});assert.equal(await work,response,file);
  }
  handlers.fetch({request:new Request('https://example.test/version.js?connectivity=1'),respondWith:p=>work=p});await assert.rejects(work,/offline/);
});

test('UTM batches crossing a zone require confirmation and retain both zones',()=>{
  const a=app();a.paste('31N 448000 5412000\n30N 699000 5710000');assert.equal(a.$('#boundaryOverlay').classList.contains('open'),true);assert.match(a.$('#boundaryDetail').textContent,/31N|30N/);
  a.$('#boundaryContinue').click();assert.equal(a.state().points.length,2);assert.match(a.state().rows[0][0],/^31N/);assert.match(a.state().rows[1][0],/^30N/);a.dom.window.close();
});

test('map entry honors 100 km MGRS precision without treating the square as an empty row',()=>{
  const c=core(),settings=vm.runInContext('defaultSettings()',c);settings.mgrs.sgDigits=0;
  const a=app({settings,from:'mgrs',to:'wgs84',rows:[['','','']]});a.change('#fromSys','mgrs');a.$('#selectMap').click();
  a.w.pointPickerHooks.onConfirm({lat:48.8582,lon:2.2945},{zoom:15,layer:'street'});
  assert.match(a.state().rows[0][0].trim(),/^31U DQ$/);assert.equal(a.state().rows[0][1],'');assert.equal(a.state().points.length,1);assert.equal(a.$('#addRow').disabled,false);
  a.$('#selectMap').click();assert.equal(a.w.pointOptions.points.length,1);a.$('#addRow').click();assert.deepEqual(a.state().rows[1],['','','']);a.dom.window.close();
});

test('empty Auto-detect cannot clear until there is input',()=>{
  const a=app();assert.equal(a.$('#fromRows .del').disabled,true);a.$('#fromRows .del').click();assert.equal(a.$('#fromSys').value,'auto');
  a.$('#fromRows .a').value='something';a.$('#fromRows .a').dispatchEvent(new a.w.Event('input'));assert.equal(a.$('#fromRows .del').disabled,false);
  a.$('#fromRows .del').click();assert.equal(a.$('#fromRows .del').disabled,true);a.dom.window.close();
});

test('empty Auto-detect ignores hidden names and guards dispatched clear events',()=>{
  const c=core();const a=app({settings:vm.runInContext('defaultSettings()',c),from:'auto',to:'wgs84',rows:[['','','Saved name'],['','','Another name']]});
  const rows=a.$('#fromRows').children;assert.equal(rows[0].querySelector('.del').disabled,true);assert.equal(rows[1].querySelector('.del').disabled,true);
  rows[0].querySelector('.del').dispatchEvent(new a.w.MouseEvent('click',{bubbles:true}));assert.equal(a.$('#fromRows').children.length,2);assert.equal(a.$('#fromRows .nm').value,'Saved name');
  rows[0].querySelector('.a').value='   ';rows[0].querySelector('.a').dispatchEvent(new a.w.Event('input'));assert.equal(rows[0].querySelector('.del').disabled,true);a.dom.window.close();
});

test('regional point map constrains navigation and global reopening restores world panning',async()=>{
  const a=app(undefined,true);a.change('#fromSys','sg');a.$('#selectMap').click();await new Promise(r=>setTimeout(r,20));const map=a.w.pointTestMap;
  assert.equal(a.$('#pointRegion').hidden,true);assert.ok(map.getMinZoom()>1);map.setView([48,2],2,{animate:false,reset:true});assert.ok(map.getCenter().lat<2);assert.ok(map.getCenter().lng>103);
  a.$('#pointClose').click();a.change('#fromSys','wgs84');a.$('#selectMap').click();assert.equal(a.$('#pointRegion').hidden,false);assert.equal(map.getMinZoom(),1);assert.equal(map.options.maxBounds,null);
  map.setView([1.35,463.82],5,{animate:false,reset:true});assert.match(a.$('#pointCoordinate').textContent,/103\.820000/);assert.ok(a.$('.singapore-name'));
  a.$('#pointConfirm').click();assert.ok(Math.abs(a.state().points[0].lon-103.82)<.0001);a.dom.window.close();
});

test('double tap zooms towards its screen location without a delayed first-tap pan',async()=>{
  const a=app(undefined,true);a.$('#selectMap').click();await new Promise(r=>setTimeout(r,20));const map=a.w.pointTestMap;
  map.setView([1.35,103.82],12,{animate:false,reset:true});const screen=a.w.L.point(600,180),target=map.containerPointToLatLng(screen),before=map.getCenter();
  map.fire('click',{latlng:target,containerPoint:screen});map.fire('dblclick',{latlng:target,containerPoint:screen,originalEvent:{}});
  assert.equal(map.getZoom(),13);assert.ok(map.getCenter().lng>before.lng);assert.ok(map.latLngToContainerPoint(target).distanceTo(screen)<2);
  const after=map.getCenter();await new Promise(r=>setTimeout(r,550));assert.equal(map.getCenter().lng,after.lng);assert.equal(map.getCenter().lat,after.lat);a.dom.window.close();
});

test('global AO grid repeats at the date line and selects the wrapped canonical square',async()=>{
  const a=app(undefined,true);a.change('#fromSys','mgrs');a.$('#regionChip').click();const map=a.w.testMap;
  map.setView([1,180],6,{animate:false,reset:true});await new Promise(r=>setTimeout(r,30));const candidates=[];map.eachLayer(l=>{if(l.options?.aoCandidate)candidates.push(l);});
  const wrapped=candidates.find(l=>l.options.aoCandidate.offset===360);assert.ok(wrapped);assert.match(wrapped.options.aoCandidate.prefix,/^1/);
  const chosen=wrapped.options.aoCandidate;wrapped.fire('click',{originalEvent:new a.w.MouseEvent('click')});a.$('#aoApply').click();assert.equal(a.state().settings.mgrs.ao,chosen.prefix);assert.ok(Math.abs(a.state().lastLocation.lon)<=180);a.dom.window.close();
});

test('AO zoom keeps square context when rotating a phone into landscape',async()=>{
  const a=app(undefined,true);a.change('#fromSys','taiwan');a.$('#regionChip').click();const map=a.w.testMap;
  map.setZoom(22,{animate:false});a.w.testWidth=844;a.w.testHeight=150;a.w.resizePicker();await new Promise(r=>setTimeout(r,20));
  assert.ok(map.getZoom()<=a.w.MapSupport.squareZoom(map));assert.ok(map.getMinZoom()<=map.getMaxZoom());
  const size=map.getSize(),center=map.getCenter();const east=map.latLngToContainerPoint([center.lat,center.lng+100/111/Math.cos(center.lat*Math.PI/180)]),origin=map.latLngToContainerPoint(center);
  assert.ok(east.distanceTo(origin)<Math.min(size.x,size.y));a.dom.window.close();
});

test('imagery sits above offline land with only a transparent training-area outline',async()=>{
  const a=app(undefined,true);a.change('#fromSys','australia');a.$('#selectMap').click();await new Promise(r=>setTimeout(r,30));const map=a.w.pointTestMap;
  assert.ok(Number(map.getPane('offlineLand').style.zIndex)<200);assert.ok(Number(map.getPane('pointCountries').style.zIndex)<200);
  assert.equal(a.w.MAP_CONTEXT.australia.roads,undefined);assert.equal(a.w.MAP_CONTEXT.thailand.roads,undefined);
  const boundaries=[];map.eachLayer(l=>{if(l.feature?.properties?.name==='Shoalwater Bay Training Area')boundaries.push(l);});assert.ok(boundaries.length);assert.equal(boundaries[0].options.fill,false);
  a.$('#pointSatellite').click();await new Promise(r=>setTimeout(r,250));let satellite;map.eachLayer(l=>{if(l instanceof a.w.L.TileLayer&&/World_Imagery/.test(l._url))satellite=l;});assert.ok(satellite);a.dom.window.close();
});

test('a pending reference never leaves holes in the global grid',async()=>{
  const a=app(undefined,true);a.paste('123 123');
  assert.equal(a.$('#locationOverlay').classList.contains('open'),true);
  a.$('[data-location="mgrs"]').click();
  const map=a.w.testMap;map.setView([33.7,-118.5],8,{animate:false,reset:true});
  await new Promise(r=>setTimeout(r,40));
  const layers=[];map.eachLayer(l=>{if(l.options?.aoCandidate)layers.push(l);});
  const drawn=new Set(layers.map(l=>l.options.aoCandidate.prefix)),b=map.getBounds();
  for(let i=0;i<=24;i++)for(let j=0;j<=24;j++){
    const lat=b.getSouth()+(b.getNorth()-b.getSouth())*i/24,lon=b.getWest()+(b.getEast()-b.getWest())*j/24;
    const prefix=a.w.GlobalGrid.parts(lat,lon,0).prefix;
    assert.ok(drawn.has(prefix),'no grid square drawn for '+prefix);
  }
  // Squares the digits cannot reach stay on the map and explain themselves.
  const unreachable=layers.find(l=>l.options.aoCandidate.invalid);
  assert.ok(unreachable,'expected a square the reference cannot fall in');
  unreachable.fire('click',{originalEvent:new a.w.MouseEvent('click')});
  assert.equal(a.$('#aoWarning').hidden,false);
  assert.match(a.$('#aoWarning').textContent,/does not fall inside/);
  assert.equal(a.$('#aoApply').disabled,true);
  const reachable=layers.find(l=>!l.options.aoCandidate.invalid);
  reachable.fire('click',{originalEvent:new a.w.MouseEvent('click')});
  assert.equal(a.$('#aoApply').disabled,false);
  a.dom.window.close();
});
test('country presets limit the crosshair, not the whole viewport',async()=>{
  const a=app(undefined,true);a.change('#fromSys','sg');a.$('#selectMap').click();await new Promise(r=>setTimeout(r,20));
  const map=a.w.pointTestMap;
  // At this zoom a viewport-sized limit stops well short of both ends of Singapore.
  map.setView([1.47,104.08],11,{animate:false,reset:true});
  assert.ok(map.getCenter().lng>104.03,'east end unreachable: '+map.getCenter().lng);
  assert.ok(map.getCenter().lat>1.44,'north edge unreachable: '+map.getCenter().lat);
  map.setView([1.14,103.60],11,{animate:false,reset:true});
  assert.ok(map.getCenter().lng<103.64,'west end unreachable: '+map.getCenter().lng);
  assert.ok(map.getCenter().lat<1.17,'south edge unreachable: '+map.getCenter().lat);
  // The crosshair still cannot leave the supported area.
  map.setView([1.35,106],11,{animate:false,reset:true});
  assert.ok(map.getCenter().lng<104.1,'crosshair escaped: '+map.getCenter().lng);
  a.dom.window.close();
});
test('street detail limit is independent of the country input preset',async()=>{
  const a=app(undefined,true);a.change('#fromSys','australia');a.$('#selectMap').click();await new Promise(r=>setTimeout(r,20));
  const map=a.w.pointTestMap;map.setZoom(22,{animate:false});
  assert.equal(map.getZoom(),19);
  a.$('#pointClose').click();a.change('#fromSys','wgs84');a.$('#selectMap').click();await new Promise(r=>setTimeout(r,20));
  map.setZoom(22,{animate:false});assert.equal(map.getZoom(),19);
  a.dom.window.close();
});
test('Australia MGR reaches its whole grid zone, not one training area',async()=>{
  const a=app(undefined,true);a.change('#fromSys','australia');a.$('#selectMap').click();await new Promise(r=>setTimeout(r,20));
  const map=a.w.pointTestMap;
  map.setView([-27.47,153.03],10,{animate:false,reset:true});
  assert.ok(Math.abs(map.getCenter().lat+27.47)<0.05,'Brisbane unreachable: '+map.getCenter().lat);
  assert.doesNotMatch(a.$('#pointFormatPreview').textContent,/Move the crosshair/);
  assert.equal(a.$('#pointConfirm').disabled,false);
  a.dom.window.close();
});
test('a reference area that already resolves a row is not questioned again',async()=>{
  const a=app(undefined,true);a.change('#fromSys','mgrs');a.paste('48N UG 6461 5755');
  assert.equal(a.state().settings.mgrs.ao,'48NUG');
  a.$('#addRow').click();
  const row=a.$('#fromRows').children[1];
  row.querySelector('.prefix').value='';row.querySelector('.a').value='123';row.querySelector('.b').value='123';
  a.change('#fromSys','mgrs');
  a.$('#convertBtn').click();
  assert.equal(a.$('#locationOverlay').classList.contains('open'),false,'asked where a resolved reference belongs');
  assert.equal(a.$('#aoOverlay').classList.contains('open'),false);
  assert.equal(a.$('#copyBtn').disabled,false);
  a.dom.window.close();
});
test('every preset shows an example that follows its own settings',async()=>{
  const a=app(undefined,true);a.$('#tab-set').click();
  const read=id=>[...a.w.document.querySelector('.preset[data-id="'+id+'"]').querySelectorAll('.example b')].map(e=>e.textContent).join(' ');
  const open=id=>{a.w.document.querySelector('[data-head="'+id+'"]').click();return new Promise(r=>setTimeout(r,5));};
  for(const id of ['wgs84','mgrs','sg','taiwan','thailand','australia','brunei']){
    await open(id);
    assert.ok(read(id).trim(),'no settings example for '+id);
    await open(id);
  }
  await open('sg');
  const before=read('sg');
  a.w.document.querySelector('#om_sg').click();
  assert.notEqual(read('sg'),before,'omitting the 100 km prefix left the example unchanged');
  await open('mgrs');
  const coarse=read('mgrs');
  a.w.document.querySelector('.preset[data-id="mgrs"] .seg button[data-v="5"]').click();
  assert.notEqual(read('mgrs'),coarse,'precision left the example unchanged');
  a.dom.window.close();
});
test('a first Australian pin picks its own area; a pin in another square must be confirmed',async()=>{
  const a=app();a.change('#fromSys','australia');a.$('#selectMap').click();
  assert.equal(a.state().settings.australia.square,undefined);
  const tilpal={lat:-22.81253,lon:150.13259},brisbane={lat:-27.47,lon:153.03};
  a.w.pointPickerHooks.onConfirm(tilpal,{zoom:15,layer:'street'});
  assert.deepEqual(a.state().settings.australia.square,[2,74],'first pin did not select its own area');
  assert.match(a.state().rows[0][0],/^\d{4}$/);
  const before=a.state().rows;
  a.$('#selectMap').click();
  const pending=a.w.pointPickerHooks.onConfirm(brisbane,{zoom:15,layer:'street'});
  assert.equal(a.$('#boundaryOverlay').classList.contains('open'),true,'a pin in another square was accepted silently');
  assert.deepEqual(a.state().rows,before);
  a.$('#boundaryContinue').click();await pending;
  assert.equal(a.state().settings.australia.sgOmit,false,'leading digits were still omitted across squares');
  assert.match(a.state().rows[0][0],/^\d{5}$/);assert.match(a.state().rows[1][0],/^\d{5}$/);
  a.dom.window.close();
});

test('the location chooser only offers grids a reference could fall inside',()=>{
  const a=app(undefined,true);a.change('#fromSys','mgrs');a.paste('1234 5678');
  assert.equal(a.$('#locationOverlay').classList.contains('open'),true);
  // 1234 5678 in the Singapore grid lands about 10 km west of the country.
  assert.equal(a.$('[data-location="sg"]').disabled,true,'offered a grid the digits cannot fall inside');
  assert.match(a.$('[data-location="sg"]').title,/do not land inside Singapore/);
  for(const id of ['taiwan','thailand','australia','brunei','mgrs'])assert.equal(a.$('[data-location="'+id+'"]').disabled,false,id);
  assert.equal(a.$('#locationNote').hidden,false);
  a.$('#locationClose').click();
  a.paste('3000 3000');
  assert.equal(a.$('[data-location="sg"]').disabled,false,'a reference inside Singapore was refused');
  assert.equal(a.$('#locationNote').hidden,true);
  a.dom.window.close();
});
test('a point the output grid cannot hold changes the output, not the question',async()=>{
  const c=core();const settings=vm.runInContext('defaultSettings()',c);
  const a=app({settings,to:'taiwan',explicitOutput:true,aoSelectionVersion:2,rows:[['','','']]});
  a.change('#fromSys','wgs84');
  assert.equal(a.state().to,'taiwan');
  a.$('#selectMap').click();
  a.w.pointPickerHooks.onConfirm({lat:37.4419,lon:-122.1430},{zoom:15,layer:'street'});
  assert.notEqual(a.state().to,'taiwan','kept an output grid that cannot hold the point');
  assert.equal(a.state().to,'mgrs','no country grid fits, so it should fall back to military grid');
  assert.equal(a.$('#boundaryOverlay').classList.contains('open'),false);
  a.$('#selectMap').click();
  const pending=a.w.pointPickerHooks.onConfirm({lat:19.0760,lon:72.8777},{zoom:15,layer:'street'});
  if(a.$('#boundaryOverlay').classList.contains('open')){
    assert.doesNotMatch(a.$('#boundaryDetail').textContent,/Taiwan/,'asked about an area the points never belonged to');
    a.$('#boundaryContinue').click();
  }
  await pending;
  assert.equal(a.state().points.length,2);
  assert.equal(a.state().to,'mgrs');
  a.dom.window.close();
});
test('a map point inside a supported country selects that country as the output',()=>{
  const c=core();const settings=vm.runInContext('defaultSettings()',c);
  const a=app({settings,to:'taiwan',explicitOutput:true,aoSelectionVersion:2,rows:[['','','']]});
  a.change('#fromSys','wgs84');a.$('#selectMap').click();
  a.w.pointPickerHooks.onConfirm({lat:14.00287,lon:99.24459},{zoom:15,layer:'street'});
  assert.equal(a.state().to,'thailand','a Thai point should convert to the Thai grid');
  a.dom.window.close();
});

test('Convert recovers once a typed grid is given a prefix that places it',()=>{
  const a=app(undefined,true);
  const box=a.$('#fromRows').children[0].querySelector('.a');
  box.value='1234 5678';box.dispatchEvent(new a.w.Event('input',{bubbles:true}));
  a.$('#convertBtn').click();
  assert.equal(a.$('#locationOverlay').classList.contains('open'),true);
  a.$('#locationClose').click();
  const prefix=a.$('#fromRows').children[0].querySelector('.prefix');
  assert.ok(prefix,'expected a prefix field after detection');
  prefix.value='48N UG';prefix.dispatchEvent(new a.w.Event('input',{bubbles:true}));
  a.$('#convertBtn').click();
  assert.equal(a.$('#locationOverlay').classList.contains('open'),false,'Convert stayed stuck on the chooser');
  assert.equal(a.$('#copyBtn').disabled,false,'Convert produced nothing');
  assert.equal(a.state().pendingGrid,undefined);
  a.dom.window.close();
});
test('precision drops trailing digits with no reference area selected',()=>{
  const c=core();
  const settings=vm.runInContext('defaultSettings()',c);c.S=settings;
  const at=d=>{settings.taiwan.sgDigits=d;return vm.runInContext('formatPoint(24.5,120.9,"taiwan",S)',c);};
  assert.equal(settings.taiwan.square,undefined,'this test needs an unset reference area');
  const fine=at(5),ten=at(4),hundred=at(3);
  assert.notDeepEqual(ten,fine,'precision had no effect without a reference area');
  assert.deepEqual([...ten],[...fine].map(v=>v.slice(0,-1)));
  assert.deepEqual([...hundred],[...fine].map(v=>v.slice(0,-2)));
  // The rounded form still reads back as meters within its own precision.
  const back=vm.runInContext('parseCells("taiwan","'+ten[0]+'","'+ten[1]+'",S)',c);
  assert.ok(Math.abs(back.lat-24.5)<0.001&&Math.abs(back.lon-120.9)<0.001,'rounded meters no longer round-trip');
});
test('every grid preset states precision in meters',async()=>{
  const a=app(undefined,true);a.$('#tab-set').click();
  for(const id of ['mgrs','sg','taiwan','thailand','australia','brunei']){
    a.w.document.querySelector('[data-head="'+id+'"]').click();
    await new Promise(r=>setTimeout(r,5));
    const panel=a.w.document.querySelector('.preset[data-id="'+id+'"]');
    const row=[...panel.querySelectorAll('.srow')].find(r=>r.textContent.startsWith('Precision'));
    const labels=[...row.querySelectorAll('.seg button')].map(b=>b.textContent);
    assert.ok(labels.every(l=>/\b(m|km)$/.test(l)),id+' precision is not in meters: '+labels.join(','));
    assert.equal(row.querySelector('.seg button.on').textContent,'10 m',id+' does not default to 10 m');
    a.w.document.querySelector('[data-head="'+id+'"]').click();
  }
  a.dom.window.close();
});
test('a fixed-footprint grid fills the military grid reference area before converting',()=>{
  for(const from of ['sg','brunei']){
    const a=app(undefined,true);
    a.change('#fromSys',from);a.change('#toSys','mgrs');
    assert.match(a.state().settings.mgrs.ao||'',/^\d{1,2}[C-HJ-NP-X][A-HJ-NP-Z]{2}$/,from+' left the output reference area empty');
    assert.equal(a.$('#regionChipTo').hidden,false,from+' hid the output reference area');
    assert.match(a.$('#regionChipTo').textContent,/^Reference area: /);
    a.dom.window.close();
  }
});
test('the paste hint no longer explains easting and northing order',()=>{
  const a=app(undefined,true);a.change('#fromSys','sg');
  a.paste('3000 3000');
  assert.doesNotMatch(a.$('#pasteHint').textContent,/easting/i);
  assert.equal(a.$('#pasteHint').hidden,true);
  a.dom.window.close();
});

test('military grids are opt-in in selectors, settings and ambiguous chooser',()=>{
  const a=app(undefined,true,false);
  assert.equal(a.$('#fromSys option[value="mgrs"]'),null);
  assert.equal(a.$('#toSys option[value="mgrs"]'),null);
  a.$('#tab-set').click();assert.ok(a.$('[data-head="mgrs"]'));assert.equal(a.$('[data-id="mgrs"] .seg'),null);
  a.$('#tab-conv').click();a.paste('3000 3000');
  assert.equal(a.$('[data-location="mgrs"]').hidden,true);
  assert.equal(a.state().militaryEnabled,undefined);
  a.$('#locationClose').click();a.$('#tab-set').click();a.$('#militaryToggle').click();
  assert.ok(a.$('#fromSys option[value="mgrs"]'));
  assert.ok(a.$('[data-head="mgrs"]'));
  a.$('#tab-conv').click();a.paste('3000 3000');
  assert.equal(a.$('[data-location="mgrs"]').hidden,false);
  a.dom.window.close();
});
test('out-of-preset map point enables global output and disabling converts source to coordinates',()=>{
  const a=app(undefined,false,false);a.$('#selectMap').click();
  a.w.pointPickerHooks.onConfirm({lat:48.8582,lon:2.2945},{zoom:15,layer:'street'});
  assert.equal(a.state().militaryEnabled,true);assert.equal(a.state().to,'mgrs');
  a.$('#swapBtn').click();
  a.$('#tab-set').click();a.$('#militaryToggle').click();
  assert.equal(a.state().militaryEnabled,false);assert.equal(a.state().from,'wgs84');
  assert.equal(a.$('#fromSys option[value="mgrs"]'),null);
  a.dom.window.close();
});
test('all country examples drop trailing digits and full references round-trip at every precision',()=>{
  const c=core();c.S=vm.runInContext('defaultSettings()',c);
  for(const id of ['sg','brunei','taiwan','thailand','australia']){
    c.id=id;c.S[id].sgOmit=false;
    const point=vm.runInContext('examplePoint(id,S)',c);c.lat=point.lat;c.lon=point.lon;
    let fine;
    for(const digits of [5,4,3]){
      c.S[id].sgDigits=digits;
      const cells=[...vm.runInContext('formatPoint(lat,lon,id,S)',c)];
      if(digits===5)fine=cells;else assert.deepEqual(cells,fine.map(v=>v.slice(0,digits-5)),id);
      c.a=cells[0];c.b=cells[1];const back=vm.runInContext('parseCells(id,a,b,S)',c);
      assert.ok(Math.abs(back.lat-point.lat)<.002&&Math.abs(back.lon-point.lon)<.002,id+' failed round trip');
    }
  }
});
test('desktop double click and mobile synthesized double tap zoom around the tapped point',async()=>{
  for(const mobile of [false,true]){
    const a=app(undefined,true,false);a.$('#selectMap').click();
    await new Promise(r=>setTimeout(r,20));const map=a.w.pointTestMap;
    map.setView([1.35,103.82],12,{animate:false,reset:true});
    const screen=a.w.L.point(600,180),target=map.containerPointToLatLng(screen),container=a.$('#pointMap');
    const fire=(type,detail)=>{const e=new a.w.MouseEvent(type,{bubbles:true,clientX:600,clientY:180,detail});Object.defineProperty(e,'pointerType',{value:mobile?'touch':'mouse'});container.dispatchEvent(e);};
    fire('click',1);if(!mobile)await new Promise(r=>setTimeout(r,400));fire('click',mobile?1:2);if(!mobile)fire('dblclick',2);
    assert.equal(map.getZoom(),13,mobile?'touch':'mouse');
    assert.ok(map.latLngToContainerPoint(target).distanceTo(screen)<2);
    const after=map.getCenter();await new Promise(r=>setTimeout(r,550));
    assert.ok(map.getCenter().equals(after),'late click pan moved zoom target');a.dom.window.close();
  }
});


test('southern Thailand accepts full meters and shortened full references',()=>{
  const c=core();c.S=vm.runInContext('defaultSettings()',c);c.S.thailand.sgOmit=false;
  for(const d of [5,4,3]){
    c.S.thailand.sgDigits=d;
    const cells=vm.runInContext('formatPoint(7,100,"thailand",S)',c);c.a=cells[0];c.b=cells[1];
    const point=vm.runInContext('parseCells("thailand",a,b,S)',c);
    assert.ok(Math.abs(point.lat-7)<.002&&Math.abs(point.lon-100)<.002);
  }
});


test('preset enable controls live inside each dropdown and Coordinates cannot be disabled',()=>{
  const a=app(undefined,true,false);a.$('#tab-set').click();
  assert.equal(a.$('[data-toggle="wgs84"]'),null);
  for(const id of ['mgrs','sg','taiwan','thailand','australia','brunei']){
    const toggle=a.$('[data-toggle="'+id+'"]');
    assert.equal(toggle.closest('.preset').dataset.id,id);
    assert.ok(toggle.closest('.preset-heading'));assert.equal(toggle.closest('.preset-body'),null);
    if(toggle.getAttribute('aria-pressed')==='true')toggle.click();
    assert.equal(a.$('#fromSys option[value="'+id+'"]'),null);
    assert.equal(a.$('#toSys option[value="'+id+'"]'),null);
    assert.ok(a.$('[data-head="'+id+'"]'));
  }
  const saved=a.state();a.dom.window.close();const b=app(saved,true,false);
  b.paste('3000 3000');
  for(const el of b.w.document.querySelectorAll('[data-location]'))assert.equal(el.hidden,true);
  b.$('#locationClose').click();b.$('#tab-set').click();b.$('[data-toggle="sg"]').click();
  assert.ok(b.$('#fromSys option[value="sg"]'));
  b.$('#tab-conv').click();b.paste('3000 3000');assert.equal(b.$('[data-location="sg"]').hidden,false);
  b.dom.window.close();
});
test('disabling an active country grid preserves its resolved input as coordinates',()=>{
  const a=app(undefined,false,false);a.change('#fromSys','sg');a.paste('3000 3000');
  const original=a.state().points[0];
  a.$('#tab-set').click();a.$('[data-toggle="sg"]').click();
  assert.equal(a.state().from,'wgs84');assert.ok(a.state().disabledPresets.includes('sg'));
  assert.ok(Math.abs(parseFloat(a.state().rows[0][0])-original.lat)<.000001);
  const b=app(a.state(),false,false);b.paste('1.35,103.82');
  assert.notEqual(b.state().to,'sg');b.dom.window.close();a.dom.window.close();
});
test('single taps, clicks and long presses never move the point-map camera or add points',async()=>{
  const a=app(undefined,true,false);a.paste('1.35,103.82');a.$('#selectMap').click();
  await new Promise(r=>setTimeout(r,20));const map=a.w.pointTestMap;
  map.setView([1.35,103.82],12,{animate:false,reset:true});const before=map.getCenter(),zoom=map.getZoom(),count=a.state().rows.length;
  const container=a.$('#pointMap');
  for(const pointerType of ['mouse','touch']){
    const event=new a.w.MouseEvent('click',{bubbles:true,detail:1,clientX:600,clientY:180});
    Object.defineProperty(event,'pointerType',{value:pointerType});container.dispatchEvent(event);
    await new Promise(r=>setTimeout(r,600));assert.ok(map.getCenter().equals(before));assert.equal(map.getZoom(),zoom);
  }
  container.dispatchEvent(new a.w.MouseEvent('contextmenu',{bubbles:true,clientX:600,clientY:180}));
  map.eachLayer(layer=>{if(layer.getTooltip?.()){assert.equal(layer.options.interactive,false);layer.fire('click',{originalEvent:new a.w.MouseEvent('click')});}});
  await new Promise(r=>setTimeout(r,600));assert.ok(map.getCenter().equals(before));assert.equal(a.state().rows.length,count);
  a.dom.window.close();
});


test('satellite coverage checks viewport tiles and drops unavailable zoom levels',async()=>{
  const a=app(undefined,false,false),calls=[];
  const max=await a.w.MapSupport.imageryZoom(-22.65,150.35,390,500,async url=>{
    const [,z,row,col,width,height]=url.match(/tilemap\/(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)/).map(Number);
    calls.push({z,row,col,width,height});
    assert.ok(col%128+width<=128&&row%128+height<=128,'request crosses a bundle');
    return {ok:true,json:async()=>({data:Array(width*height).fill(z===19?0:1)})};
  });
  assert.equal(max,18);assert.ok(calls.some(c=>c.z===19));assert.ok(calls.some(c=>c.z===18));a.dom.window.close();
});
test('coverage errors are not interpreted as available imagery',async()=>{
  const a=app(undefined,false,false);
  await assert.rejects(a.w.MapSupport.imageryZoom(48,2,390,500,async()=>({ok:true,json:async()=>({error:{code:500}})})),/coverage/);
  a.dom.window.close();
});

test('changing the input system clears the entries and undo brings them back',()=>{
  const a=app(undefined,false,false);
  a.change('#fromSys','sg');a.paste('3000 3000');
  assert.equal(a.$('#fromRows .a').value,'3000');
  a.change('#fromSys','taiwan');
  assert.equal(a.state().from,'taiwan');
  assert.equal(a.$('#fromRows .a').value,'','the digits must not be reread as another grid');
  assert.equal(a.state().to,'wgs84','a grid input must not convert into another grid');
  assert.equal(a.$('#undoBtn').disabled,false);
  a.$('#undoBtn').click();
  assert.equal(a.state().from,'sg');assert.equal(a.$('#fromRows .a').value,'3000');
  a.$('#redoBtn').click();
  assert.equal(a.state().from,'taiwan');assert.equal(a.$('#fromRows .a').value,'');
  a.dom.window.close();
});
test('the output grid follows the country the points sit in',()=>{
  const a=app(undefined,false,false);
  a.change('#toSys','taiwan');
  // Naming a grid is explicit, so the mismatch has to be reported, not corrected.
  a.change('#fromSys','wgs84');a.paste('1.35, 103.82');
  assert.match(a.$('#badPair').textContent,/Taiwan/);
  const b=app(undefined,false,false);
  b.change('#fromSys','wgs84');b.paste('1.35, 103.82');
  assert.equal(b.state().to,'sg','an unnamed output should follow the points to Singapore');
  assert.equal(b.$('#badPair').textContent,'');
  b.dom.window.close();a.dom.window.close();
});
test('saved settings keep their choices while gaining new defaults, military starts off',()=>{
  const a=app(undefined,false,false);
  a.$('#tab-set').click();a.$('[data-toggle="taiwan"]').click();
  const saved=a.state();
  saved.settings.sg={sgDigits:5};            // an older install missing sgOmit
  saved.militaryEnabled=true;delete saved.militaryVersion;
  a.dom.window.close();
  const b=app(saved,false,false);
  b.change('#fromSys','wgs84');   // any action persists the merged settings
  assert.equal(b.state().settings.sg.sgDigits,5,'the stored choice must survive');
  assert.equal(b.state().settings.sg.sgOmit,true,'a missing default must be filled in');
  assert.equal(!!b.state().militaryEnabled,false,'military grids start disabled');
  assert.ok(b.state().disabledPresets.includes('taiwan'),'other preset choices survive');
  b.dom.window.close();
});
test('tile prefetch covers both layers around a point',async()=>{
  const a=app(undefined,false,false);
  const urls=a.w.MapSupport.tileUrls(1.35,103.82,[11],1);
  assert.equal(urls.length,18);
  assert.ok(urls.some(u=>u.includes('tile.openstreetmap.org/11/')),'street tiles missing');
  assert.ok(urls.some(u=>u.includes('World_Imagery/MapServer/tile/11/')),'satellite tiles missing');
  const seen=[];
  const stored=await a.w.MapSupport.prefetchTiles({lat:1.35,lon:103.82},{zooms:[11],radius:0,request:async u=>{seen.push(u);return {ok:true};}});
  assert.equal(stored,2);assert.equal(seen.length,2);
  a.dom.window.close();
});

test('swap recomputes the other side instead of leaving it blank',()=>{
  const a=app(undefined,false,false);
  a.change('#fromSys','wgs84');a.paste('1.35, 103.82');
  assert.equal(a.$('#copyBtn').disabled,false);
  a.$('#swapBtn').click();
  assert.equal(a.state().from,'sg');assert.equal(a.state().to,'wgs84');
  assert.equal(a.$('#copyBtn').disabled,false,'swap must not leave the output uncomputed');
  assert.ok(a.$('#toRows .a').value,'the output should hold a value straight after swapping');
  a.$('#undoBtn').click();
  assert.equal(a.state().from,'wgs84','undo should step back over a swap');
  a.dom.window.close();
});
test('a reference area omits the 100 km prefix so the digits match the stated precision',()=>{
  const a=app(undefined,false,false);
  a.change('#fromSys','wgs84');a.paste('14.00287, 99.24459');
  a.change('#toSys','thailand');
  assert.ok(a.state().settings.thailand.square,'converting inside one square should fill the area in');
  assert.equal(a.state().settings.thailand.sgOmit,true,'an area implies its prefix, so omission turns on');
  assert.equal(a.$('#toRows .a').value.length,4,'4 digits per axis at the default 10 m');
  assert.equal(a.$('#toRows .b').value.length,4);
  a.dom.window.close();
});

test('a coordinate inside the bounding box but outside the country is called out',()=>{
  const a=app(undefined,false,false);
  a.change('#fromSys','wgs84');a.paste('1.4655, 103.7578');   // Johor Bahru
  assert.notEqual(a.state().to,'sg','Johor Bahru must not pull Singapore in on its own');
  a.change('#toSys','sg');   // naming it anyway
  assert.match(a.$('#detect').textContent,/outside Singapore/,'Johor Bahru sits in the box, not the country');
  assert.equal(a.$('#copyBtn').disabled,false,'the note must not block the conversion');
  a.dom.window.close();
  const b=app(undefined,false,false);
  b.change('#fromSys','wgs84');b.paste('1.35, 103.82');
  assert.equal(b.state().to,'sg','a point in Singapore should pick Singapore');
  assert.equal(b.$('#detect').textContent,'','a point in Singapore needs no note');
  b.dom.window.close();
});
test('an unplaceable coordinate does not switch military grids on by itself',()=>{
  const a=app(undefined,false,false);
  a.change('#fromSys','wgs84');a.paste('48.8582, 2.2945');   // Paris
  assert.equal(!!a.state().militaryEnabled,false,'military grids stay opt-in');
  assert.equal(a.state().to,'wgs84');
  a.dom.window.close();
});
test('a Singapore reference out in the strait still converts',()=>{
  const a=app(undefined,false,false);
  a.change('#fromSys','sg');a.paste('3000 3000');
  // Valid inside the 100 km square even though it is well off the island.
  assert.equal(a.$('#copyBtn').disabled,false,'an offshore reference must still convert');
  a.dom.window.close();
});
test('the country outlines hold the places the presets name',()=>{
  const a=app(undefined,false,false);
  const inside=(lat,lon,polys)=>polys.some(poly=>{
    let hit=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];
      if(((yi>lat)!==(yj>lat))&&lon<(xj-xi)*(lat-yi)/(yj-yi)+xi)hit=!hit;
    }
    return hit;
  });
  const sg=a.w.MAP_CONTEXT.sg.likely,au=a.w.MAP_CONTEXT.australia.likely;
  for(const [name,lat,lon,want] of [
    ['Singapore city',1.35,103.82,true],['Pulau Tekong',1.41,104.05,true],
    ['Pulau Semakau',1.206,103.766,true],['Tuas',1.32,103.63,true],
    ['Johor Bahru',1.4655,103.7578,false],['Batam',1.08,104.03,false]
  ]) assert.equal(inside(lat,lon,sg),want,name);
  for(const [name,lat,lon,want] of [
    ['Camp Tilpal',-22.81253,150.13259,true],['Camp Growl',-22.80307,150.33732,true],
    ['Brisbane',-27.47,153.03,true],['Auckland',-36.85,174.76,false]
  ]) assert.equal(inside(lat,lon,au),want,name);
  a.dom.window.close();
});

test('plus codes decode to the cell they name',()=>{
  const c=core();
  // Hand-computed from the Open Location Code specification.
  for(const [code,lat,lon] of [['8FVC2222+22',47.0000625,8.0000625],['7FG49QCJ+2V',20.3700625,2.7821875],['7FG49QCJ+2VX',20.3701125,2.782234375]]){
    const r=vm.runInContext('decodePlusCode("'+code+'")',c);
    assert.ok(Math.abs(r.lat-lat)<1e-9&&Math.abs(r.lon-lon)<1e-9,code+' decoded to '+r.lat+','+r.lon);
  }
  assert.equal(vm.runInContext('decodePlusCode("nonsense")',c),null);
  // A ten digit code names a cell about 14 m across, so a round trip lands inside it.
  for(const [lat,lon] of [[1.3849163,103.9806071],[-33.87,151.21],[51.5,-0.13],[78.2,15.6]]){
    const code=vm.runInContext('encodePlusCode('+lat+','+lon+',10)',c);
    const back=vm.runInContext('decodePlusCode("'+code+'")',c);
    const metres=Math.hypot((back.lat-lat)*110570,(back.lon-lon)*111320*Math.cos(lat*Math.PI/180));
    assert.ok(metres<10,'round trip off by '+metres.toFixed(1)+' m');
  }
});
test('a pasted plus code converts, and a short one uses the nearest known point',()=>{
  const a=app(undefined,false,false);
  a.change('#fromSys','wgs84');a.paste('6PH59XMJ+X6');
  const point=a.state().points[0];
  assert.ok(Math.abs(point.lat-1.38494)<0.001&&Math.abs(point.lon-103.98056)<0.001,'full plus code: '+point.lat+','+point.lon);
  // With that position known, the short form of the same place resolves to it.
  const b=app(a.state(),false,false);
  b.change('#fromSys','wgs84');b.paste('9XMJ+X6');
  const near=b.state().points[0];
  assert.ok(Math.abs(near.lat-1.38494)<0.001&&Math.abs(near.lon-103.98056)<0.001,'short plus code: '+near.lat+','+near.lon);
  b.dom.window.close();a.dom.window.close();
});
test('a short map link explains what to do instead of failing silently',()=>{
  const a=app(undefined,false,false);
  a.change('#fromSys','wgs84');a.paste('https://maps.app.goo.gl/oxBekKUgBWZMeVJ89?g_st=ic');
  assert.match(a.$('#badPair').textContent,/short map link|Open it/i);
  a.dom.window.close();
});
test('a resolved mobile map link is read like any other',()=>{
  const c=core();
  const g=vm.runInContext('extractMapCoordinate("https://maps.google.com?q=1.3849163,103.9806071&entry=gps")',c);
  assert.ok(Math.abs(g.lat-1.3849163)<1e-6&&Math.abs(g.lon-103.9806071)<1e-6);
  const ap=vm.runInContext('extractMapCoordinate("https://maps.apple.com/place?coordinate=1.384349,103.984754&name=Changi%20Golf%20Club&map=h")',c);
  assert.ok(Math.abs(ap.lat-1.384349)<1e-6&&Math.abs(ap.lon-103.984754)<1e-6);
});

test('output format stays locked until a reference area is chosen',()=>{
  const a=app(undefined,false,false);
  a.$('#tab-set').click();
  const body=a.$('.preset[data-id="thailand"] .preset-body');
  assert.match(body.textContent,/Choose a reference area first/);
  assert.ok([...body.querySelectorAll('.seg button')].every(b=>b.disabled),'precision must be locked');
  assert.equal(body.querySelector('.chk input').disabled,true,'omission must be locked');
  assert.equal(body.textContent.includes('No reference area yet'),false,'the old nudge is gone');
  a.dom.window.close();
  // Converting inside one square fills the area in, which unlocks the section.
  const b=app(undefined,false,false);
  b.change('#fromSys','wgs84');b.paste('14.00287, 99.24459');
  b.change('#toSys','thailand');
  assert.ok(b.state().settings.thailand.square);
  b.$('#tab-set').click();
  const open=b.$('.preset[data-id="thailand"] .preset-body');
  assert.doesNotMatch(open.textContent,/Choose a reference area first/);
  assert.ok([...open.querySelectorAll('.seg button')].some(x=>!x.disabled),'precision must be settable');
  assert.equal(open.querySelector('.chk input').disabled,false);
  b.dom.window.close();
});

test('a newly placed reference area starts at the common 4+4',async()=>{
  // An older install carrying a coarser choice and no area yet.
  const saved={from:'auto',to:'wgs84',rows:[['','','']],points:[],aoSelectionVersion:2,militaryVersion:3,
    settings:{thailand:{sgDigits:3,sgOmit:true}}};
  const b=app(saved,false,false);
  assert.equal(b.state().settings.thailand.square,undefined);
  b.change('#fromSys','wgs84');b.paste('14.00287, 99.24459');
  b.change('#toSys','thailand');
  assert.ok(b.state().settings.thailand.square,'the area is filled in');
  assert.equal(b.state().settings.thailand.sgDigits,4,'a first area starts at 10 m');
  assert.equal(b.$('#toRows .a').value.length,4);
  // Choosing a precision after that survives the area being moved.
  b.$('#tab-set').click();
  await new Promise(r=>setTimeout(r,5));   // the segment handlers attach on a timer
  b.$('.preset[data-id="thailand"] .seg button[data-v="5"]').click();
  assert.equal(b.state().settings.thailand.sgDigits,5);
  b.dom.window.close();
});
