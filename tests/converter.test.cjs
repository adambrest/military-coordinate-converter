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
// The shipped endpoint is a deployment detail, so every test states the one it means.
const withHelper=(value,source=html)=>source.replace(/const MAP_HELPER = "[^"]*";/,'const MAP_HELPER = "'+value+'";');
function core(){
  const ctx=vm.createContext({console,URL});
  for(const f of ['proj4.js','vendor/mgrs.js','grid-core.js','map-context.js'])vm.runInContext(read(f),ctx);
  vm.runInContext(inline.split('  /* ============================ UI / state')[0],ctx);
  return ctx;
}
function app(saved,realMap=false,militaryEnabled=true,helper){
  const page=helper===undefined?html:withHelper(helper);
  const script=page.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  const dom=new JSDOM(page.replace(/<script[\s\S]*?<\/script>/g,''),{url:'https://example.test/',runScripts:'outside-only',pretendToBeVisual:true});
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
  }else w.createAOPicker=opts=>{w.pickerHooks=opts;return {open:o=>{w.mapOptions=o;w.document.getElementById('aoOverlay').classList.add('open');},view:o=>{w.viewOptions=o;}};};
  if(!realMap)w.createPointPicker=opts=>{w.pointPickerHooks=opts;return {open:o=>{w.pointOptions=o;}};};
  w.eval(script);
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
test('unlabeled projected meters require a zone; removed projection is rejected',()=>{
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
  a.$('#convertBtn').click();assert.equal(a.$('#copyBtn').disabled,false,a.$('#badPair').textContent);assert.equal(a.$('#regionChip').hidden,false);assert.match(a.$('#regionChip').textContent,/^Reference area: 51R TH · Change$/);assert.equal(a.w.mapOptions,undefined);
  a.paste('48nug 6883 4332');assert.equal(a.$('#fromRows .prefix').value,'48N UG');assert.equal(a.$('#copyBtn').disabled,false);
  a.$('#fromRows .prefix').value='48nug';a.$('#convertBtn').click();assert.equal(a.$('#fromRows .prefix').value,'48N UG');assert.equal(a.$('#copyBtn').disabled,false);
  a.dom.window.close();
});
test('global Settings controls format and holds examples outside converter',async()=>{
  const a=app();a.paste('1.2964704,103.8210085');a.change('#toSys','mgrs');
  assert.equal(a.$('#toFormatExample'),null);assert.equal(a.$('#toFormatChip'),null,'the format is chosen in Settings, without a chip');
  a.$('#tab-set').click();a.$('[data-head="mgrs"]').click();await new Promise(r=>setTimeout(r,20));
  assert.match(a.$('[data-head="mgrs"]').textContent,/Military grid/);
  a.$('[data-id="mgrs"] [data-v="globalutm"]').click();await new Promise(r=>setTimeout(r,20));
  assert.equal(a.state().to,'globalutm');assert.equal(a.$('#toFormatChip'),null);
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
test('reload reopens entries in their detected system and keeps names',()=>{
  const first=app();first.paste('48N 366000 149000');const saved=first.state();saved.rows[0][2]='Keep me';saved.militaryVersion=3;first.dom.window.close();
  const a=app(saved);
  try{
    assert.equal(a.state().from,'globalutm');assert.equal(a.$('#fromSys').value,'mgrs');
    assert.equal(a.$('#fromSys option[value="auto"]'),null,'filled input must not offer Auto-detect as its system');
    assert.equal(a.$('#fromRows .nm').value,'Keep me');assert.equal(a.$('#fromRows .nm').hidden,false);
    assert.equal(a.$('#fromRows .prefix').value,'48N');assert.equal(a.$('#fromRows .a').value,'366000');
    assert.equal(a.$('#copyBtn').disabled,true,'results are recomputed, not restored');
    a.$('#convertBtn').click();assert.equal(a.$('#copyBtn').disabled,false,a.$('#badPair').textContent);
  }finally{a.dom.window.close();}
  // Military grid entries come back as Military grid, however many rows.
  const second=app();second.paste('48N UG 6793 4572\n48N VG 2977 6263');
  if(second.$('#boundaryOverlay').classList.contains('open'))second.$('#boundaryContinue').click();
  const grid={...second.state(),militaryVersion:3};second.dom.window.close();
  const b=app(grid);
  try{assert.equal(b.state().from,'mgrs');assert.equal(b.$('#fromRows').children.length,2);assert.equal(b.$('#fromRows textarea'),null);}
  finally{b.dom.window.close();}
  const empty=app({...grid,rows:[['','',''],['','','']]});
  try{assert.equal(empty.$('#fromSys').value,'auto');assert.equal(empty.$('#fromRows').children.length,1);assert.ok(empty.$('#fromRows textarea'));}
  finally{empty.dom.window.close();}
});
test('Auto-detect is a single box: stranded rows are detected, or kept together',()=>{
  const c=core(),settings=vm.runInContext('defaultSettings()',c);
  const base={settings,militaryVersion:3,militaryEnabled:true,aoSelectionVersion:2};
  // A system that is no longer enabled falls back to Auto-detect and detects again.
  const a=app({...base,militaryEnabled:false,from:'mgrs',rows:[['48N UG 6793','4572',''],['48N UG 6800','4600','']]},false,false);
  try{
    assert.equal(a.$('#fromRows textarea'),null,'rows were left sitting in Auto-detect');
    assert.equal(a.state().from,'mgrs');assert.equal(a.$('#fromRows').children.length,2);
  }finally{a.dom.window.close();}
  const b=app({...base,from:'auto',rows:[['not a place','',''],['still not','','']]});
  try{
    assert.equal(b.state().from,'auto');assert.equal(b.$('#fromRows').children.length,1);
    assert.match(b.$('#fromRows .a').value,/not a place\nstill not/);
  }finally{b.dom.window.close();}
});
test('restored batches can be detected again without losing row names',()=>{
  const a=app();a.paste('1.35,103.82\n1.36,103.83');const saved=a.state();saved.rows[0][2]='One';saved.rows[1][2]='Two';a.dom.window.close();
  const b=app(saved);b.$('#convertBtn').click();assert.equal(b.$('#copyBtn').disabled,false,b.$('#badPair').textContent);
  assert.deepEqual(Array.from(b.state().points,p=>p.name),['One','Two']);b.dom.window.close();
});
test('global output formats preserve the point while input format changes preserve entries',()=>{
  const a=app();assert.equal([...a.$('#fromSys').options].some(o=>o.value==='mercator'||o.value==='globalutm'),false);
  a.paste('1.352083,103.819836');a.change('#toSys','mgrs');
  for(const format of ['globalutm','mgrs']){
    a.change('#toFormat',format);assert.equal(a.$('#copyBtn').disabled,false,a.$('#badPair').textContent);assert.equal(a.$('#toSys').value,'mgrs');
    assert.equal(a.state().to,format);
  }
  a.change('#toFormat','globalutm');a.$('#swapBtn').click();a.$('#convertBtn').click();
  assert.ok(a.$('#fromRows .prefix').value.includes('48N'));assert.match(a.$('#fromRows .a').value,/^\d+\.\d{3}$/);
  const rows=a.state().rows;
  for(const format of ['mgrs','globalutm']){
    a.change('#fromFormat',format);assert.equal(a.$('#copyBtn').disabled,true);
    assert.deepEqual(a.state().rows,rows);assert.equal(a.state().points.length,0);
  }
  a.$('#undoBtn').click();assert.equal(a.state().from,'mgrs');assert.deepEqual(a.state().rows,rows);
  a.$('#redoBtn').click();assert.equal(a.state().from,'globalutm');assert.deepEqual(a.state().rows,rows);
  a.dom.window.close();
});
test('Taiwan shows Pao Li and the square north of Yunlin even with unrelated short digits',()=>{
  const a=app(undefined,true);a.paste('3000 3000');a.$('[data-location="taiwan"]').click();
  const layers=[];a.w.testMap.eachLayer(l=>{if(l.options?.aoCandidate)layers.push(l);});
  const c=core();
  for(const [lat,lon] of [[22.05483,120.73288],[24.1,120.5]]){
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
test('explicit global output asks about the country preset and allows an informed override',()=>{
  const a=app();
  try{
    a.paste('1.352083,103.819836');a.change('#toSys','mgrs');
    assert.equal(a.$('#countryGridOverlay').classList.contains('open'),true);
    assert.equal(a.$('#countryGridSwitch').textContent,'Change to Singapore MGR');
    assert.equal(a.$('#copyBtn').disabled,true);
    a.$('#countryGridContinue').click();assert.equal(a.$('#copyBtn').disabled,false);
    assert.match(a.$('#toRows .prefix').value,/^48N/);
    a.paste('1.36,103.83');assert.equal(a.$('#toSys').value,'mgrs');
    assert.equal(a.$('#countryGridOverlay').classList.contains('open'),false);
  }finally{a.dom.window.close();}
});
test('cross-AO batch forces prefixes and red warning even after format toggles',()=>{
  const a=app();a.paste('48.8582,2.2945');
  const s=a.state();s.settings.mgrs.sgOmit=true;s.militaryVersion=3;s.omitVersion=2;
  a.dom.window.close();const b=app(s);b.paste('48.8582,2.2945\n51.5074,-0.1278');
  assert.equal(b.$('#boundaryOverlay').classList.contains('open'),true);assert.equal(b.$('#copyBtn').disabled,true);b.$('#boundaryContinue').click();
  assert.match(b.$('#badPair').textContent,/is outside .+, so it is written in full/);assert.equal(b.state().settings.mgrs.sgOmit,true,'crossing must not change the saved setting');
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
  assert.match(a.$('#badPair').textContent,/is outside .+, so it is written in full/);assert.equal(a.$('#copyBtn').disabled,false);a.dom.window.close();
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
  a.$('#om_mgrs').click();assert.equal(a.$('#om_mgrs').checked,true);assert.match(a.$('#badPair').textContent,/is outside .+, so it is written in full/);
  assert.match(a.$('#toRows').children[0].querySelector('.prefix').value,/^31U DQ/,'omission must not apply across areas');
  assert.match(a.$('#toRows').children[1].querySelector('.prefix').value,/^30U/);a.dom.window.close();
});
test('explicit WGS 84 remains global when moving from Singapore to Brunei',()=>{
  const a=app();a.paste('1.352083,103.819836');a.change('#toSys','mgrs');
  a.paste('4.9,114.9');assert.equal(a.$('#toSys').value,'mgrs');assert.equal(a.$('#copyBtn').disabled,false);a.dom.window.close();
});
test('every visible country square is selectable and selection uses exactly its displayed polygon',()=>{
  for(const [id,lat,lon] of [['taiwan',24.9,121.05],['taiwan',22.05483,120.73288],['australia',-22.80307,150.33732],['thailand',14.00287,99.24459]]){
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
test('the input chip retains whole-zone selection and requires square letters',async()=>{
  const c=core();assert.match(c.GlobalGrid.parse('1234 5678','31U').error,/square letters/);
  assert.equal(c.GlobalGrid.parse('DQ 4825 1193','31U').prefix,'31UDQ');
  const settings=vm.runInContext('defaultSettings()',c);settings.mgrs.ao='31U';settings.mgrs.sgOmit=true;c.settings=settings;
  assert.match(vm.runInContext('formatPoint(48.8582,2.2945,"mgrs",settings)[0]',c),/^DQ /);
  const a=app(undefined,true);a.change('#fromSys','mgrs');a.$('#regionChip').click();
  a.w.testMap.setView([48,2],5,{animate:false});await new Promise(r=>setTimeout(r,30));
  const cells=[];a.w.testMap.eachLayer(l=>{if(l.options?.aoCandidate)cells.push(l);});assert.ok(cells.length);
  const cell=cells.find(l=>l.options.aoCandidate.prefix==='31U');assert.ok(cell);cell.fire('click',{originalEvent:new a.w.MouseEvent('click')});
  a.$('#aoApply').click();assert.equal(a.state().settings.mgrs.ao,'31U');assert.equal(a.$('#copyBtn').disabled,true);
  a.paste('DQ 4825 1193');assert.equal(a.$('#copyBtn').disabled,false);a.dom.window.close();
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
  // Street is the opening layer and stays selected through zooms.
  assert.equal(activeTiles().length,1);assert.match(activeTiles()[0]._url,/openstreetmap/);
  a.$('#pointStreet').click();
  a.w.pointTestMap.setView([20,100],4,{animate:false});assert.equal(activeTiles().length,1);assert.equal(a.$('#pointMapScale'),null);assert.ok(a.$('.singapore-name'));
  const streets=activeTiles()[0];a.w.pointTestMap.setZoom(7,{animate:false});assert.equal(activeTiles().length,1);assert.equal(activeTiles()[0],streets);assert.match(streets._url,/openstreetmap/);
  const center=a.w.pointTestMap.getCenter();a.$('#pointSatellite').click();await new Promise(r=>setTimeout(r,250));assert.equal(activeTiles().length,1);assert.match(activeTiles()[0]._url,/World_Imagery/);assert.equal(a.w.pointTestMap.getCenter().lat,center.lat);
  activeTiles()[0].fire('tileerror');assert.equal(a.$('#pointNetwork').hidden,false);
  a.$('#pointStreet').click();assert.equal(a.$('#pointNetwork').hidden,true);a.dom.window.close();
});

test('the output map view shows every point, adds nothing and has no crosshair',async()=>{
  const a=app(undefined,true);a.paste('1.35,103.82\n1.36,103.83\n1.37,103.84');
  a.$('#fromRows .nm').value='Start';a.$('#fromRows .nm').dispatchEvent(new a.w.Event('input',{bubbles:true}));
  a.$('#convertBtn').click();await new Promise(r=>setTimeout(r,20));
  assert.equal(a.$('#viewBtn').disabled,false,'a converted output must be viewable');
  const rowsBefore=a.state().rows.length;
  a.$('#viewBtn').click();await new Promise(r=>setTimeout(r,30));
  const overlay=a.$('#pointOverlay');
  assert.equal(overlay.classList.contains('open'),true);
  assert.equal(overlay.classList.contains('viewing'),true,'the read-only view needs its own class to drop the crosshair');
  assert.equal(a.$('#pointTitle').textContent,'Output points');
  assert.match(a.$('#pointCount').textContent,/3 output points/);
  // Every point is drawn, and an unnamed one still gets its number. The offline
  // landmark pins share this class, so match our own labels rather than count them.
  const labels=[...a.w.document.querySelectorAll('.chosen-point-label')].map(el=>el.textContent);
  assert.ok(labels.includes('Start'),'the named output point keeps its name');
  assert.ok(labels.includes('Point 2')&&labels.includes('Point 3'),'unnamed output points are numbered');
  assert.equal(labels.filter(t=>/^Point \d+$/.test(t)&&Number(t.slice(6))>3).length,0,'no point beyond the output is drawn');
  // Nothing in this view may add a point.
  assert.equal(a.$('#pointConfirm').disabled,true);assert.equal(a.$('#pointContinue').disabled,true);
  a.$('#pointConfirm').click();a.$('#pointContinue').click();
  a.$('#pointMap').dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  await new Promise(r=>setTimeout(r,30));
  assert.equal(a.state().rows.length,rowsBefore,'viewing output must never add a row');
  // The view fits the points rather than opening on one of them.
  const bounds=a.w.pointTestMap.getBounds();
  assert.ok(bounds.contains([1.35,103.82])&&bounds.contains([1.37,103.84]),'all output points must be in view');
  a.$('#pointClose').click();
  assert.equal(overlay.classList.contains('viewing'),false,'closing must clear the read-only dressing');
  a.dom.window.close();
});

test('a read-only view does not overwrite the view the input picker returns to',async()=>{
  const a=app(undefined,true);a.paste('1.35,103.82');a.$('#convertBtn').click();await new Promise(r=>setTimeout(r,20));
  a.$('#selectMap').click();a.w.pointTestMap.setView([1.40,103.90],15,{animate:false});a.$('#pointClose').click();
  const saved=JSON.parse(JSON.stringify(a.state().pointMapView));
  a.$('#viewBtn').click();await new Promise(r=>setTimeout(r,30));
  a.w.pointTestMap.setView([-33,18],6,{animate:false});a.$('#pointClose').click();
  assert.deepEqual(a.state().pointMapView,saved,'panning a read-only view must not move the input picker');
  a.dom.window.close();
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
  const p={lat:24.9,lon:121.05},q={lat:22.05483,lon:120.73288};
  const preview=a.w.pointPickerHooks.preview(p,a.w.pointOptions);
  a.w.pointPickerHooks.onConfirm(p,{zoom:15,layer:'street'});
  assert.deepEqual(a.state().rows[0].slice(0,2),Array.from(preview.cells));assert.match(a.state().rows[0][0],/^\d{4}$/);
  const first=a.state().points[0],before=a.state().rows;
  a.$('#selectMap').click();let pending=a.w.pointPickerHooks.onConfirm(q,{zoom:15,layer:'street'});
  assert.equal(a.$('#boundaryOverlay').classList.contains('open'),true);assert.deepEqual(a.state().rows,before);
  a.$('#boundaryClose').click();assert.equal((await pending).canceled,true);assert.deepEqual(a.state().rows,before);
  pending=a.w.pointPickerHooks.onConfirm(q,{zoom:15,layer:'street'});a.$('#boundaryContinue').click();await pending;
  assert.equal(a.state().rows.length,2);assert.equal(a.state().settings.taiwan.sgOmit,true,'the setting stays as chosen');
  assert.match(a.state().rows[0][0],/^\d{4}$/);assert.equal(a.state().rows[0][3],undefined);
  assert.match(a.state().rows[1][0],/^\d{4}$/);assert.match(a.state().rows[1][3],/^\d+\/\d+$/,'the new row keeps its own square');
  assert.equal(a.$('#fromRows').children[1].querySelector('.square').value,'E'+a.state().rows[1][3].replace('/',' N'));
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
    caches:{open:async()=>({match:async r=>cached.get(r.url||String(r)),addAll:async requests=>{for(const r of requests){const pathname=new URL(r.url).pathname.slice(1)||'index.html';assert.ok(fs.existsSync(path.join(root,pathname)),pathname);cached.set(r.url,response);}},put:async(k,v)=>cached.set(k.url||k,v)}),match:async r=>cached.get(r.url||r)},
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
  a.$('#pointClose').click();a.change('#fromSys','wgs84');a.$('#selectMap').click();assert.equal(a.$('#pointRegion').hidden,false);assert.equal(map.getMinZoom(),1);
  // Longitude wraps, so sideways panning stays free across world copies; latitude does
  // not wrap, so the view stops at the edge of the projection instead of running off it.
  const world=map.options.maxBounds;
  assert.ok(world,'a global view still has to stop at the top and bottom');
  assert.ok(world.getSouth()<-85&&world.getNorth()>85,'the clamp sits at the projection edge');
  assert.ok(world.getWest()<=-720&&world.getEast()>=720,'longitude must stay free across world copies');
  map.setView([89,103.82],4,{animate:false,reset:true});
  assert.ok(map.getCenter().lat<86,'the view must not pan past the top of the map');
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
  assert.equal(a.state().settings.australia.sgOmit,true,'crossing must not change the saved setting');
  assert.match(a.state().rows[0][0],/^\d{4}$/);assert.match(a.state().rows[1][0],/^\d{4}$/);
  assert.notEqual(a.state().rows[1][3],undefined,'the Brisbane row must name its own square');
  assert.ok(Math.abs(a.state().points[1].lat-brisbane.lat)<.001,'the Brisbane pin moved');
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
test('a fixed-footprint grid reports the military grid reference area of its results',()=>{
  for(const [from,digits] of [['sg','3000 3000'],['brunei','5000 5000']]){
    const a=app(undefined,true);
    a.change('#fromSys',from);a.change('#toSys','mgrs');
    assert.equal(a.$('#regionChipTo').hidden,true,from+' reported an area before converting');
    a.paste(digits);
    assert.match(a.state().settings.mgrs.ao||'',/^\d{1,2}[C-HJ-NP-X][A-HJ-NP-Z]{2}$/,from+' left the output reference area empty');
    assert.equal(a.$('#regionChipTo').hidden,false,from+' hid the output reference area');
    assert.match(a.$('#regionChipTo').textContent,/^Reference area: \d{1,2}[C-HJ-NP-X] [A-HJ-NP-Z]{2}$/);
    assert.equal(a.$('#regionChipTo').getAttribute('role'),null,from+' offered the output area as a control');
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

test('changing a grid input keeps entries and undo restores the previous preset',()=>{
  const a=app(undefined,false,false);
  a.change('#fromSys','sg');a.paste('3000 3000');
  assert.equal(a.$('#fromRows .a').value,'3000');
  a.change('#fromSys','taiwan');
  assert.equal(a.state().from,'taiwan');
  assert.equal(a.$('#fromRows .a').value,'3000','grid corrections must retain the digits');
  assert.equal(a.state().to,'wgs84','a grid input must not convert into another grid');
  assert.equal(a.$('#undoBtn').disabled,false);
  a.$('#undoBtn').click();
  assert.equal(a.state().from,'sg');assert.equal(a.$('#fromRows .a').value,'3000');
  a.$('#redoBtn').click();
  assert.equal(a.state().from,'taiwan');assert.equal(a.$('#fromRows .a').value,'3000');
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

test('Settings shapes the output format but leaves reference areas to the converter',()=>{
  const a=app();
  a.$('#tab-set').click();
  for(const id of ['mgrs','thailand','taiwan','australia']){
    const body=a.$('.preset[data-id="'+id+'"] .preset-body');
    assert.equal(body.querySelector('[id^="mapbtn_"],[id^="rcl_"]'),null,id+' still picks an area in Settings');
    assert.match(body.textContent,/Reference areas are set in the converter/);
    assert.ok([...body.querySelectorAll('.srow .seg button')].every(b=>!b.disabled),id+' precision must be settable');
    assert.equal(body.querySelector('.chk input').disabled,false,id+' omission must be settable');
  }
  a.dom.window.close();
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


test('a short map link resolves through the endpoint when one is configured',async()=>{
  const withResolver=withHelper('https://resolver.test/go');
  const dom=new JSDOM(withResolver.replace(/<script[\s\S]*?<\/script>/g,''),{url:'https://example.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  for(const f of ['version.js','proj4.js','vendor/mgrs.js','grid-core.js','map-context.js','map-support.js'])w.eval(read(f));
  w.createAOPicker=o=>({open:()=>{}});w.createPointPicker=o=>({open:()=>{}});
  let asked=null;
  w.fetch=async(url)=>{
    if(String(url).startsWith('https://resolver.test/go/resolve')){
      asked=String(url);
      return {ok:true,json:async()=>({url:'https://maps.google.com?q=1.3849163,103.9806071&entry=gps'})};
    }
    return {ok:true,text:async()=>read('version.js')};
  };
  w.eval(withResolver.match(/<script>\s*([\s\S]*?)<\/script>/)[1]);
  const $=s=>w.document.querySelector(s);
  const paste=t=>{const e=new w.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(e,'clipboardData',{value:{getData:()=>t}});$('#fromRows').children[0].querySelector('.a').dispatchEvent(e);};
  $('#fromSys').value='wgs84';$('#fromSys').dispatchEvent(new w.Event('change',{bubbles:true}));
  paste('https://maps.app.goo.gl/oxBekKUgBWZMeVJ89?g_st=ic');
  assert.match($('#detect').textContent,/Following the link/,'the reader should see it working');
  assert.equal($('#fromRows .a').classList.contains('busy'),true,'the cell should show it is busy');
  await new Promise(r=>setTimeout(r,20));
  assert.ok(asked&&asked.includes(encodeURIComponent('https://maps.app.goo.gl/oxBekKUgBWZMeVJ89?g_st=ic')),'the link must be sent whole: '+asked);
  const point=JSON.parse(w.localStorage.getItem('mgrconv-v1')).points[0];
  assert.ok(Math.abs(point.lat-1.3849163)<1e-6&&Math.abs(point.lon-103.9806071)<1e-6,'resolved to '+point.lat+','+point.lon);
  assert.equal($('#fromRows .a').classList.contains('busy'),false,'the busy state must clear');
  w.close();
});
test('a short map link explains itself when no endpoint is configured',()=>{
  const a=app(undefined,false,false,'');
  a.change('#fromSys','wgs84');a.paste('https://maps.app.goo.gl/oxBekKUgBWZMeVJ89?g_st=ic');
  assert.match(a.$('#badPair').textContent,/Open it, then paste/);
  assert.equal(a.$('#fromRows .a').classList.contains('busy'),false);
  a.dom.window.close();
});

// The worker runs off the device, so its logic is exercised here directly.
function resolver(stub){
  const src=read('worker/resolve-link.js').replace('export default','var __worker =');
  const ctx=vm.createContext({fetch:(...a)=>stub(...a),Response,Request,Headers,URL,JSON,console,AbortSignal});
  return vm.runInContext(src+';__worker',ctx);
}
test('the link resolver follows map shorteners and refuses anything else',async()=>{
  const hops={
    'https://maps.app.goo.gl/abc':'https://maps.google.com?q=1.38,103.98',
    'https://maps.apple/p/xyz':'https://maps.apple.com/place?coordinate=1.38,103.98'
  };
  let stub=async(url)=>({status:hops[url]?302:200,headers:{get:k=>k==='location'?(hops[url]||''):null}});
  const worker=resolver((...a)=>stub(...a));
  const call=async u=>JSON.parse(await (await worker.fetch(new Request('https://r.test/?url='+encodeURIComponent(u)))).text());
  // The address comes back normalized, which is what the parser wants anyway.
  assert.match((await call('https://maps.app.goo.gl/abc')).url,/^https:\/\/maps\.google\.com\/?\?q=1\.38,103\.98$/);
  assert.match((await call('https://maps.apple/p/xyz')).url,/^https:\/\/maps\.apple\.com\/place\?coordinate=1\.38,103\.98$/);
  // Anything not a map shortener is refused, so this cannot become an open proxy.
  assert.match((await call('https://example.com/secret')).error,/Only map links/);
  assert.match((await call('http://maps.app.goo.gl/abc')).error,/Only https/);
  assert.match((await call('not a url')).error,/not a URL/);
  // A link that goes nowhere is reported rather than echoed back.
  stub=async()=>({status:200,headers:{get:()=>null}});
  assert.match((await call('https://maps.app.goo.gl/dead')).error,/did not redirect/);
  const site='https://adambrest.github.io';
  const cors=await worker.fetch(new Request('https://r.test/?url=x',{method:'OPTIONS',headers:{origin:site}}));
  assert.equal(cors.headers.get('access-control-allow-origin'),site,'the app itself must be answered');
  const other=await worker.fetch(new Request('https://r.test/?url=x',{headers:{origin:'https://someone-else.test'}}));
  assert.equal(other.status,403,'another site cannot borrow the endpoint from a browser');
  assert.equal(other.headers.get('access-control-allow-origin'),null);
});
test('the link resolver will not be pointed at somewhere of the caller\'s choosing',async()=>{
  // A Google open-redirect is the obvious way in: follow it once and the next
  // fetch would be to any address the caller named. The hop is reported, never
  // visited, so the worker only ever talks to the shorteners it was given.
  const visited=[];
  const worker=resolver(async url=>{
    visited.push(url);
    if(url==='https://www.google.com/url?q=https://internal.example/admin')
      return {status:302,headers:{get:k=>k==='location'?'https://internal.example/admin':null}};
    return {status:200,headers:{get:()=>null}};
  });
  const call=async u=>JSON.parse(await (await worker.fetch(new Request('https://r.test/?url='+encodeURIComponent(u)))).text());
  const out=await call('https://www.google.com/url?q=https://internal.example/admin');
  assert.equal(out.url,'https://internal.example/admin','the destination is still reported to the reader');
  assert.deepEqual(visited,['https://www.google.com/url?q=https://internal.example/admin'],
    'only the shortener may be fetched, never what it points at');
});

// --- opening view ---------------------------------------------------------
function located(zone,answer,helper){
  const a=app(undefined,false,false);
  const w=a.w;
  w.sessionStorage.clear();
  w.Intl={DateTimeFormat:()=>({resolvedOptions:()=>({timeZone:zone})})};
  const asked=[];
  w.fetch=async url=>{asked.push(String(url));return {ok:true,json:async()=>answer};};
  return {a,asked,guess:w.MapSupport.approximateLocation({helper})};
}
test('the opening view is asked of our own endpoint when there is one',async()=>{
  const {a,asked,guess}=located('Asia/Singapore',{lat:1.29,lon:103.85,timezone:'Asia/Singapore'},'https://helper.test');
  const point=await guess.ready;
  assert.deepEqual(asked,['https://helper.test/where'],'no third party should be asked: '+asked);
  assert.ok(Math.abs(point.lat-1.29)<1e-9&&Math.abs(point.lon-103.85)<1e-9,'opened at '+point.lat+','+point.lon);
  a.dom.window.close();
});
test('an address that disagrees with the clock does not move the map abroad',async()=>{
  // The carrier leaves the internet in Brunei while the phone is set to Singapore.
  const {a,guess}=located('Asia/Singapore',{lat:4.90,lon:114.94,timezone:'Asia/Brunei'},'https://helper.test');
  const point=await guess.ready;
  assert.ok(Math.abs(point.lat-1.35)<0.01&&Math.abs(point.lon-103.82)<0.01,
    'the clock should have won, but the map opened at '+point.lat+','+point.lon);
  a.dom.window.close();
});
test('with no endpoint the opening view still falls back to the old lookup',async()=>{
  const {a,asked,guess}=located('Asia/Bangkok',{latitude:13.76,longitude:100.50,timezone:'Asia/Bangkok'},'');
  const point=await guess.ready;
  assert.deepEqual(asked,['https://ipapi.co/json/']);
  assert.ok(Math.abs(point.lat-13.76)<1e-9,'opened at '+point.lat);
  a.dom.window.close();
});
test('the endpoint reports where a request came from, coarsely',async()=>{
  const worker=resolver(async()=>({status:200,headers:{get:()=>null}}));
  const request=new Request('https://r.test/where');
  Object.defineProperty(request,'cf',{value:{latitude:'1.2896723',longitude:'103.8501',country:'SG',timezone:'Asia/Singapore'}});
  const out=JSON.parse(await (await worker.fetch(request)).text());
  // Rounded before it is sent: the map only needs to know which town to open over.
  assert.deepEqual(out,{lat:1.29,lon:103.85,country:'SG',timezone:'Asia/Singapore'});
  const blank=new Request('https://r.test/where');
  Object.defineProperty(blank,'cf',{value:{}});
  assert.deepEqual(JSON.parse(await (await worker.fetch(blank)).text()),{lat:null,lon:null,country:null,timezone:null});
});

// Only a short link has anything to gain from the endpoint. Everything else must
// read locally and appear at once, whether or not an endpoint is configured.
test('nothing but a short link ever waits on the network',()=>{
  const a=app(undefined,false,false);
  const asked=[];
  a.w.fetch=async url=>{asked.push(String(url));return {ok:true,text:async()=>read('version.js'),json:async()=>({})};};
  a.change('#fromSys','wgs84');
  const local=[
    ['a long Google link','https://www.google.com/maps?q=1.3849163,103.9806071&entry=gps'],
    ['a Google place URL','https://www.google.com/maps/place/X/@1.29,103.85,17z/data=!3m1!4b1!4m2!3d1.2963!4d103.8502'],
    ['an Apple link','https://maps.apple.com/place?coordinate=1.384349,103.984754&name=Changi'],
    ['a plain pair','1.3849163, 103.9806071'],
    ['a grid reference','48N 372000 153000']
  ];
  for(const [what,text] of local){
    asked.length=0;
    a.paste(text);
    // Read on the spot: the row is filled before any promise could have settled.
    assert.equal(a.$('#fromRows .a').classList.contains('busy'),false,what+' should not be waiting');
    assert.deepEqual(asked.filter(u=>u.includes('map-link-resolver')),[],what+' asked the endpoint: '+asked);
  }
  a.dom.window.close();
});

test('a grid reference typed as one run of digits is read as easting and northing',()=>{
  const a=app(undefined,false,false);
  a.change('#fromSys','thailand');
  const row=a.$('#fromRows').children[0];
  const A=row.querySelector('.a');
  // Typed, not pasted: the paste path has always split this, the typing path did not.
  A.value='12345678';A.dispatchEvent(new a.w.Event('input',{bubbles:true}));
  a.$('#convertBtn').click();
  const cells=[...a.$('#fromRows').children[0].querySelectorAll('.a,.b')].map(c=>c.value);
  assert.deepEqual(cells.slice(0,2),['1234','5678'],'the run should have been halved, got '+JSON.stringify(cells));
  a.dom.window.close();
});
test('a run of digits that cannot be halved says so',()=>{
  const a=app(undefined,false,false);
  a.change('#fromSys','thailand');
  const A=a.$('#fromRows').children[0].querySelector('.a');
  A.value='1234567';A.dispatchEvent(new a.w.Event('input',{bubbles:true}));
  a.$('#convertBtn').click();
  const shown=(a.$('#bottomError')||a.$('#badPair')).textContent+a.$('#detect').textContent;
  assert.match(shown,/odd number of digits/i,'unhelpful message: '+JSON.stringify(shown));
  assert.doesNotMatch(shown,/not a number/i,'it should not blame a northing that was never separate');
  a.dom.window.close();
});

test('a link that lands on a Google consent wall is followed to the place behind it',()=>{
  const a=app(undefined,false,false);
  a.change('#fromSys','wgs84');
  // What the resolver hands back when Google rate-limits its address.
  a.paste('https://www.google.com/sorry/index?continue=https://maps.google.com/maps%3Fq%3D1.3849163,103.9806071%26entry%3Dgps&q=EgQ');
  const point=a.state().points[0];
  assert.ok(point&&Math.abs(point.lat-1.3849163)<1e-6&&Math.abs(point.lon-103.9806071)<1e-6,
    'the place behind the wall was missed: '+JSON.stringify(point));
  a.dom.window.close();
});

// --- leaving a field ------------------------------------------------------
const blur=(a,sel='#fromRows .a')=>a.$(sel).dispatchEvent(new a.w.Event('blur'));
test('leaving a field takes the digits in without throwing a chooser in the way',async()=>{
  const a=app(undefined,false,false);
  const A=a.$('#fromRows .a');
  A.value='74353727';A.dispatchEvent(new a.w.Event('input',{bubbles:true}));
  const before=a.w.mapOptions;
  blur(a);
  await new Promise(r=>setTimeout(r,20));
  assert.equal(a.w.mapOptions,before,'blur must not open the chooser over the page');
  assert.match(a.$('#detect').textContent,/Press Convert/,'it should say what to do instead');
  assert.equal(a.$('#fromRows .a').value,'74353727','a run that may be half typed is left as typed');
  // Convert is the moment the question is actually asked.
  a.$('#convertBtn').click();
  assert.notEqual(a.w.mapOptions,before,'Convert should open the chooser');
  a.dom.window.close();
});
test('turning the chooser down does not leave Convert asking the same question',async()=>{
  const a=app(undefined,false,false);
  const A=a.$('#fromRows .a');
  A.value='74353727';A.dispatchEvent(new a.w.Event('input',{bubbles:true}));
  a.$('#convertBtn').click();
  assert.ok(a.state().pendingGrid,'the row should be waiting on a grid');
  a.w.pickerHooks.onCancel();
  assert.equal(a.state().pendingGrid,undefined,'declining must clear what the row was waiting on');
  assert.equal(a.$('#fromRows .a').value.replace(/\s/g,''),'74353727','the digits must survive being declined');
  a.dom.window.close();
});
test('typed digits are never split on leaving a field',async()=>{
  const a=app(undefined,false,false);
  try{
    a.change('#fromSys','thailand');
    for(const typed of ['6872','74353727']){
      const A=a.$('#fromRows .a');
      A.value=typed;A.dispatchEvent(new a.w.Event('input',{bubbles:true}));
      blur(a);
      await new Promise(r=>setTimeout(r,20));
      assert.deepEqual([a.$('#fromRows .a').value,a.$('#fromRows .b').value],[typed,''],typed+' was split while typing');
    }
  }finally{a.dom.window.close();}
});
test('pasting splits only 3+3 digits or more, and Undo restores the digits as pasted',()=>{
  const c=core(),settings=vm.runInContext('defaultSettings()',c);settings.thailand.square=[5,15];
  const a=app({settings,militaryVersion:3,militaryEnabled:false,aoSelectionVersion:2,rows:[['','','']]},false,false);
  try{
    a.change('#fromSys','thailand');
    const short=new a.w.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(short,'clipboardData',{value:{getData:()=>'6872'}});
    a.$('#fromRows .a').dispatchEvent(short);
    assert.equal(short.defaultPrevented,false,'a short paste must land as typed');
    assert.equal(a.$('#fromRows .b').value,'');
    a.paste('68724924');
    assert.deepEqual([a.$('#fromRows .a').value,a.$('#fromRows .b').value],['6872','4924']);
    assert.equal(a.$('#undoBtn').disabled,false,'an automatic split must be undoable');
    a.$('#undoBtn').click();
    assert.deepEqual([a.$('#fromRows .a').value,a.$('#fromRows .b').value],['68724924',''],'undo should keep the digits as pasted');
    a.$('#redoBtn').click();
    assert.deepEqual([a.$('#fromRows .a').value,a.$('#fromRows .b').value],['6872','4924']);
  }finally{a.dom.window.close();}
});
test('Convert halves a typed run of 3+3 or more, undoably, but leaves shorter runs alone',()=>{
  const c=core(),settings=vm.runInContext('defaultSettings()',c);settings.thailand.square=[5,15];
  const a=app({settings,militaryVersion:3,militaryEnabled:false,aoSelectionVersion:2,rows:[['','','']]},false,false);
  try{
    a.change('#fromSys','thailand');
    const A=a.$('#fromRows .a');A.value='6872';A.dispatchEvent(new a.w.Event('input',{bubbles:true}));
    a.$('#convertBtn').click();
    assert.deepEqual([a.$('#fromRows .a').value,a.$('#fromRows .b').value],['6872','']);
    assert.equal(a.$('#copyBtn').disabled,true);
    const B=a.$('#fromRows .a');B.value='68724924';B.dispatchEvent(new a.w.Event('input',{bubbles:true}));
    a.$('#convertBtn').click();
    assert.deepEqual([a.$('#fromRows .a').value,a.$('#fromRows .b').value],['6872','4924']);
    assert.equal(a.$('#copyBtn').disabled,false,a.$('#badPair').textContent);
    a.$('#undoBtn').click();
    assert.equal(a.$('#fromRows .a').value,'68724924');
  }finally{a.dom.window.close();}
});

test('a Google link carrying its place in the path is read',()=>{
  const a=app(undefined,false,false);
  a.change('#fromSys','wgs84');
  // What maps.app.goo.gl/KvNeX7Hrs6owx3vbA resolves to: no q=, no pin, just a path.
  a.paste('https://www.google.com/maps/search/1.383700,+103.981790?entry=tts&g_ep=EgoyMDI2MDkwMi4wIPu8ASoASAFQAw%3D%3D');
  const p=a.state().points[0];
  assert.ok(p&&Math.abs(p.lat-1.3837)<1e-6&&Math.abs(p.lon-103.98179)<1e-6,'missed the place: '+JSON.stringify(p));
  a.dom.window.close();
});
test('a place in the path does not outrank a pin or an explicit query',()=>{
  const a=app(undefined,false,false);
  a.change('#fromSys','wgs84');
  a.paste('https://www.google.com/maps/search/1.0,+103.0?q=1.3849163,103.9806071');
  const p=a.state().points[0];
  assert.ok(p&&Math.abs(p.lat-1.3849163)<1e-6,'the explicit query should win, got '+JSON.stringify(p));
  a.dom.window.close();
});

// --- the output follows the ground ----------------------------------------
const typePair=(a,lat,lon)=>{
  const row=a.$('#fromRows').children[0];
  for(const [sel,v] of [['.a',lat],['.b',lon]]){
    const c=row.querySelector(sel);c.value=v;c.dispatchEvent(new a.w.Event('input',{bubbles:true}));
  }
};
test('typing a coordinate in a country offers that country grid, as pasting does',()=>{
  for(const [lat,lon,expected] of [['1.383700','103.981790','sg'],['14.00287','99.24459','thailand'],['4.65','114.75','brunei']]){
    const a=app(undefined,false,false);
    a.change('#fromSys','wgs84');
    typePair(a,lat,lon);
    a.$('#convertBtn').click();
    assert.equal(a.state().to,expected,lat+','+lon+' should convert into '+expected+', not coordinates');
    a.dom.window.close();
  }
});
test('a coordinate no grid covers stays an honest reformat',()=>{
  const a=app(undefined,false,false);
  a.change('#fromSys','wgs84');
  typePair(a,'0.0','0.0');
  a.$('#convertBtn').click();
  assert.equal(a.state().to,'wgs84','nothing holds this point, so coordinates out is the honest answer');
  a.dom.window.close();
});
test('an output the reader named is not revised behind their back',()=>{
  const a=app(undefined,false,false);
  a.change('#fromSys','wgs84');
  a.change('#toSys','wgs84');          // said, in as many words: coordinates out
  typePair(a,'1.383700','103.981790');
  a.$('#convertBtn').click();
  assert.equal(a.state().to,'wgs84','a stated output must survive a Singapore coordinate');
  assert.equal(a.state().explicitOutput,true);
  a.dom.window.close();
});

test('Australia can be roamed even where its grid does not reach',()=>{
  const c=core();
  const p=vm.runInContext('PRESETS.australia',c);
  const holds=(b,lat,lon)=>lat>=b[0]&&lat<=b[1]&&lon>=b[2]&&lon<=b[3];
  assert.ok(p.browseBbox,'the preset should say where the reader may look');
  for(const [place,lat,lon] of [['Perth',-31.95,115.86],['Darwin',-12.46,130.84],['Adelaide',-34.93,138.60],['Brisbane',-27.47,153.03],['Shoalwater Bay',-22.65,150.35]])
    assert.ok(holds(p.browseBbox,lat,lon),place+' should be reachable on the map');
  // Looking is not the same as selecting: the grid still only covers zone 56S.
  assert.equal(holds(p.bbox,-31.95,115.86),false,'Perth must stay outside the grid itself');
  assert.equal(holds(p.bbox,-22.65,150.35),true,'Shoalwater Bay is inside the grid');
});
test('Australia offers reference areas on the coast, not out in the Coral Sea',()=>{
  const c=core();
  const inside=vm.runInContext(`(coords=>{
    const poly=PRESETS.australia.squareOutline;
    return coords.map(([lat,lon])=>pointInPolygon(lat,lon,poly));
  })`,c);
  const land=[['Shoalwater Bay',-22.65,150.35],['Rockhampton',-23.38,150.51],['Brisbane',-27.47,153.03],['Sydney',-33.87,151.21],['inland Queensland',-24.0,148.5]];
  const sea =[['Coral Sea',-22.0,155.5],['Tasman Sea east of Sydney',-33.9,155.0],['off Fraser Island',-25.0,154.5],['far east of the zone',-30.0,157.5]];
  for(const [place,lat,lon] of land)assert.equal(inside([[lat,lon]])[0],true,place+' should be offered');
  for(const [place,lat,lon] of sea)assert.equal(inside([[lat,lon]])[0],false,place+' is open water and must not be offered');
});

test('raw auto-detect digits ask for a country after clearing a confirmed coordinate',async()=>{
  for(const military of [false,true])for(const leaveFirst of [false,true]){
    const a=app(undefined,true,military);
    try{
      a.paste('1.352083,103.819836');
      assert.equal(a.state().aoConfirmed,true);
      a.$('#fromRows .del').click();
      assert.equal(a.$('#fromSys').value,'auto');
      const input=a.$('#fromRows .a');input.value='1234567890';
      input.dispatchEvent(new a.w.Event('input',{bubbles:true}));
      if(leaveFirst){blur(a);await new Promise(r=>setTimeout(r,20));}
      a.$('#convertBtn').click();
      assert.equal(a.$('#locationOverlay').classList.contains('open'),true);
      assert.equal(a.state().pendingGrid.text.replace(/\s/g,''),'1234567890');
      assert.equal(a.$('#copyBtn').disabled,true);
      a.$('#locationClose').click();
      a.$('#convertBtn').click();
      assert.equal(a.$('#locationOverlay').classList.contains('open'),true);
    }finally{a.dom.window.close();}
  }
});

test('reference picker can change country before and after confirming an auto-detected grid',()=>{
  const a=app(undefined,true);
  try{
    a.paste('1234567890');
    a.$('[data-location="taiwan"]').click();
    assert.equal(a.$('#aoBack').hidden,false);
    a.$('#aoBack').click();
    assert.equal(a.$('#locationOverlay').classList.contains('open'),true);
    assert.equal(a.$('#aoOverlay').classList.contains('open'),false);
    a.$('[data-location="thailand"]').click();
    const candidates=[];a.w.testMap.eachLayer(l=>{if(l.options.aoCandidate&&!l.options.aoCandidate.invalid)candidates.push(l);});
    assert.ok(candidates.length);
    candidates[0].fire('click');a.$('#aoApply').click();
    assert.equal(a.state().from,'thailand');
    const rows=a.state().rows;
    a.$('#regionChip').click();
    assert.equal(a.$('#aoBack').hidden,false);
    a.$('#aoBack').click();a.$('[data-location="taiwan"]').click();
    assert.match(a.$('#aoTitle').textContent,/Taiwan/);
    const next=[];a.w.testMap.eachLayer(l=>{if(l.options.aoCandidate&&!l.options.aoCandidate.invalid)next.push(l);});
    assert.ok(next.length);next[0].fire('click');a.$('#aoApply').click();
    assert.equal(a.state().from,'taiwan');
    assert.deepEqual(a.state().rows,rows);
    assert.equal(a.$('#copyBtn').disabled,false);
  }finally{a.dom.window.close();}
});

test('auto-detect map points choose their country grid and replace a saved reference area',()=>{
  for(const [id,lat,lon] of [['sg',1.35,103.82],['thailand',14,99.24],['taiwan',24.9,121.05],['australia',-22.71,150.409],['brunei',4.7,114.7]]){
    const c=core(),settings=vm.runInContext('defaultSettings()',c);
    settings[id].square=[0,0];settings[id].sgOmit=false;
    const a=app({settings,to:'mgrs',explicitOutput:true,militaryVersion:3,militaryEnabled:true,aoSelectionVersion:2,rows:[['','','']]});
    try{
      assert.equal(a.$('#fromSys').value,'auto');a.$('#selectMap').click();
      const result=a.w.pointPickerHooks.onConfirm({lat,lon},{zoom:15,layer:'street'});
      assert.equal(typeof result.then,'undefined','a saved area must not prompt for a boundary');
      assert.equal(a.state().to,id,id);
      assert.equal(a.$('#toSys').value,id);
      assert.equal(a.$('#copyBtn').disabled,false,id);
      if(['thailand','taiwan','australia'].includes(id)){
        const q=vm.runInContext(`toProjFromWGS(${lat},${lon},projectionFor('${id}'))`,c);
        assert.deepEqual(a.state().settings[id].square,[Math.floor(q.E/100000),Math.floor(q.N/100000)]);
        assert.equal(a.state().settings[id].sgOmit,true);
        assert.equal(a.$('#regionChipTo').hidden,false);
      }
    }finally{a.dom.window.close();}
  }
});

test('auto-detect map output respects disabled country grids and refreshes the global square',()=>{
  const c=core(),settings=vm.runInContext('defaultSettings()',c);settings.mgrs.ao='31UDQ';
  const a=app({settings,to:'mgrs',militaryVersion:3,militaryEnabled:true,disabledPresets:['sg'],aoSelectionVersion:2,rows:[['','','']]});
  try{
    a.$('#selectMap').click();a.w.pointPickerHooks.onConfirm({lat:1.35,lon:103.82},{zoom:15,layer:'street'});
    assert.equal(a.state().to,'mgrs');
    assert.equal(a.state().settings.mgrs.ao,c.GlobalGrid.parts(1.35,103.82,0).prefix);
    assert.equal(a.$('#countryGridOverlay').classList.contains('open'),true);
    a.$('#countryGridContinue').click();
    assert.equal(a.$('#copyBtn').disabled,false);
  }finally{a.dom.window.close();}
});

test('auto-detect map points across reference squares retain full prefixes',async()=>{
  const a=app();
  try{
    a.$('#selectMap').click();
    a.w.pointPickerHooks.onConfirm({lat:24.9,lon:121.05},{zoom:15,layer:'street'});
    const pending=a.w.pointPickerHooks.onConfirm({lat:22.05483,lon:120.73288},{zoom:15,layer:'street'});
    assert.equal(a.$('#boundaryOverlay').classList.contains('open'),true);
    a.$('#boundaryContinue').click();await pending;
    assert.equal(a.state().to,'taiwan');assert.equal(a.state().points.length,2);
    assert.equal(a.state().settings.taiwan.sgOmit,true,'crossing must not change the saved setting');
    assert.ok([...a.$('#toRows').querySelectorAll('.a')].every(c=>/^\d{5}$/.test(c.value)),'output across squares keeps leading digits');
    assert.equal(a.$('#copyBtn').disabled,false);
  }finally{a.dom.window.close();}
});

test('grid input corrections retain every row and name even when switching to coordinates',()=>{
  for(const previous of ['sg','taiwan','thailand','australia','brunei','mgrs','globalutm']){
    const a=app();
    try{
      a.change('#fromSys',previous==='globalutm'?'mgrs':previous);
      if(previous==='globalutm')a.change('#fromFormat',previous);
      a.$('#fromRows .a').value='00123';a.$('#fromRows .b').value='04567';a.$('#fromRows .nm').value='  First point  ';a.$('#fromRows .a').dispatchEvent(new a.w.Event('input',{bubbles:true}));
      a.$('#addRow').click();
      const second=a.$('#fromRows').children[1];second.querySelector('.a').value='08901';second.querySelector('.b').value='00234';second.querySelector('.nm').value='Second point';
      const expected=[['00123','04567','  First point  '],['08901','00234','Second point']];
      a.change('#fromSys',previous==='taiwan'?'thailand':'taiwan');
      assert.deepEqual(a.state().rows,expected,previous);assert.equal(a.$('#copyBtn').disabled,true);
      a.change('#fromSys','wgs84');assert.deepEqual(a.state().rows,expected,previous);
      assert.equal(a.$('#aoOverlay').classList.contains('open'),false);
    }finally{a.dom.window.close();}
  }
});

test('coordinates to grid clears all rows and names with working undo and redo',()=>{
  const a=app();
  try{
    a.paste('1.35,103.82\n1.36,103.83');
    a.$('#fromRows .nm').value='First';a.$('#fromRows').children[1].querySelector('.nm').value='Second';
    const before=a.state().rows;before[0][2]='First';before[1][2]='Second';
    a.change('#fromSys','thailand');assert.deepEqual(a.state().rows,[['','','']]);
    assert.equal(a.$('#undoBtn').disabled,false);a.$('#undoBtn').click();
    assert.equal(a.state().from,'wgs84');assert.deepEqual(a.state().rows,before);
    assert.equal(a.$('#redoBtn').disabled,false);a.$('#redoBtn').click();
    assert.equal(a.state().from,'thailand');assert.deepEqual(a.state().rows,[['','','']]);
  }finally{a.dom.window.close();}
});

const exampleCameraLink='https://www.google.com/maps/@1.3867912,103.977382,1229m/data=!3m1!1e3?entry=ttu&g_ep=EgoyMDI2MDkwOC4wIKXMDSoASAFQAw%3D%3D';
const examplePlaceLink='google.com/maps/place/1.384841,+103.982841/@1.3867912,103.977382,1229m/data=!3m1!1e3!4m5!3m4!7e2!8m2!3d1.3848414!4d103.9828407?entry=ttu&g_ep=EgoyMDI2MDkwOC4wIKXMDSoASAFQAw%3D%3D';
test('mixed camera, place and Apple links parse independently with every batch separator',()=>{
  for(const separator of [',',', ','\t','\n','\r','\r\n']){
    const a=app();
    try{
      a.paste([exampleCameraLink,exampleCameraLink,examplePlaceLink,'maps.apple.com/?ll=1.35,103.82'].join(separator));
      assert.equal(a.$('#copyBtn').disabled,false,a.$('#badPair').textContent);
      assert.equal(a.state().points.length,4,separator);
      const expected=[[1.3867912,103.977382],[1.3867912,103.977382],[1.3848414,103.9828407],[1.35,103.82]];
      a.state().points.forEach((p,i)=>{assert.ok(Math.abs(p.lat-expected[i][0])<.000001);assert.ok(Math.abs(p.lon-expected[i][1])<.000001);});
    }finally{a.dom.window.close();}
  }
});

test('formatted copies of the supplied map links keep one row per link',()=>{
  const a=app();
  try{
    a.paste(`[**${exampleCameraLink}**](${exampleCameraLink})\\&#xA;**&#x20;**[**${exampleCameraLink}**](${exampleCameraLink})\n[**${examplePlaceLink}**](http://${examplePlaceLink.replace(/&/g,'\\&').replace(/_/g,'\\_')})`);
    assert.equal(a.$('#copyBtn').disabled,false,a.$('#badPair').textContent);
    assert.equal(a.state().points.length,3);assert.ok(Math.abs(a.state().points[2].lat-1.3848414)<.000001);
  }finally{a.dom.window.close();}
});

test('bare map hosts are parsed as links before reading URL numbers',()=>{
  const c=core();
  for(const [link,lat,lon] of [[examplePlaceLink,1.3848414,103.9828407],['maps.google.com/?q=1.35,103.82',1.35,103.82],['maps.apple.com/?ll=1.36,103.83',1.36,103.83]]){
    const p=c.parseLatLon(link,'latlon');assert.equal(p.lat,lat);assert.equal(p.lon,lon);
  }
});

test('mixed full and shortened Google and Apple links resolve without losing order or duplicates',async()=>{
  const a=app(undefined,false,true,'https://resolver.test');
  const asked=[];
  a.w.fetch=async url=>{
    const link=new URL(url).searchParams.get('url');asked.push(link);
    return {ok:true,json:async()=>({url:link.includes('goo.gl')?'https://maps.google.com/?q=1.36,103.83':'https://maps.apple.com/?ll=1.37,103.84'})};
  };
  try{
    a.paste([exampleCameraLink,'maps.app.goo.gl/first','maps.apple/second',examplePlaceLink,'maps.app.goo.gl/first'].join(','));
    for(let i=0;i<30&&a.$('#copyBtn').disabled;i++)await new Promise(r=>setTimeout(r,10));
    assert.equal(a.$('#copyBtn').disabled,false,a.$('#badPair').textContent);
    assert.equal(a.state().points.length,5);
    assert.deepEqual(a.state().points.map(p=>Number(p.lat.toFixed(6))),[1.386791,1.36,1.37,1.384841,1.36]);
    // The same link twice is one question and two points: every occurrence is replaced.
    assert.deepEqual(asked,['https://maps.app.goo.gl/first','https://maps.apple/second']);
  }finally{a.dom.window.close();}
});

test('a name run onto its link survives, and every link is followed in one pass',async()=>{
  const a=app(undefined,false,true,'https://resolver.test');
  const asked=[],PLACES={one:[1.3848414,103.9828407],two:[1.3702,103.9601],three:[1.3555,103.9402]};
  a.w.fetch=async url=>{
    const link=new URL(url).searchParams.get('url');asked.push(link);
    const id=Object.keys(PLACES).find(k=>link.endsWith('/'+k));
    const [lat,lon]=PLACES[id];
    return {ok:true,json:async()=>({url:`https://maps.google.com/?q=${lat},${lon}`})};
  };
  try{
    // MLP3 is pasted straight onto its link, with no space between them.
    a.paste(['MLP1 https://maps.app.goo.gl/one','MLP2 https://maps.app.goo.gl/two','MLP3https://maps.app.goo.gl/three'].join('\n'));
    for(let i=0;i<40&&a.$('#copyBtn').disabled;i++)await new Promise(r=>setTimeout(r,10));
    assert.equal(a.$('#copyBtn').disabled,false,a.$('#badPair').textContent);
    assert.deepEqual(asked,['https://maps.app.goo.gl/one','https://maps.app.goo.gl/two','https://maps.app.goo.gl/three']);
    assert.deepEqual(a.state().rows.map(r=>r[2]),['MLP1','MLP2','MLP3'],'each label names its own point');
    assert.deepEqual(a.state().points.map(p=>Number(p.lat.toFixed(6))),[1.384841,1.3702,1.3555]);
    assert.equal(a.$('#detect').textContent,'','the following-link message must not outlive the wait');
    assert.equal(a.w.document.querySelectorAll('#fromRows .a.busy').length,0);
  }finally{a.dom.window.close();}
});

test('a link still being followed is abandoned when its row is deleted or edited',async()=>{
  for(const [what,act] of [['deleted',a=>a.$('#fromRows .del').click()],
                           ['edited',a=>{const c=a.$('#fromRows .a');c.value='1.35,103.82';c.dispatchEvent(new a.w.Event('input',{bubbles:true}));}]]){
    const a=app(undefined,false,true,'https://resolver.test');
    let release;
    a.w.fetch=()=>new Promise(r=>{release=r;});      // a link that never comes back on its own
    try{
      a.paste('https://maps.app.goo.gl/slow');
      assert.equal(a.$('#fromRows .a').classList.contains('busy'),true,what+': the wait should be visible');
      assert.match(a.$('#detect').textContent,/Following the link/);
      act(a);
      assert.equal(a.w.document.querySelectorAll('#fromRows .a.busy').length,0,what+': the busy mark must go');
      assert.equal(a.$('#detect').textContent,'',what+': the following-link message must go');
      // Even if the answer arrives later, it belongs to text that is gone.
      release?.({ok:true,json:async()=>({url:'https://maps.google.com/?q=1.36,103.83'})});
      await new Promise(r=>setTimeout(r,40));
      assert.equal(a.w.document.querySelectorAll('#fromRows .a.busy').length,0,what+': a late answer must not revive the wait');
      assert.equal(a.$('#detect').textContent,'',what+': a late answer must not revive the message');
    }finally{a.dom.window.close();}
  }
});

test('a link keeps being followed through a name edit and another row\'s edit',async()=>{
  const a=app(undefined,false,true,'https://resolver.test');
  let release;
  try{
    // Two ordinary points first, so there is a second row to work in later.
    a.paste('1.35,103.82\n1.36,103.83');
    assert.equal(a.w.document.querySelectorAll('#fromRows .trow').length,2);
    a.w.fetch=()=>new Promise(r=>{release=r;});
    a.paste('https://maps.app.goo.gl/slow');
    assert.equal(a.$('#fromRows .a').classList.contains('busy'),true,'the wait should be visible');
    // Naming the point while it is being followed is not a reason to stop.
    const name=a.$('#fromRows .nm');
    name.value='MLP1';name.dispatchEvent(new a.w.Event('input',{bubbles:true}));
    assert.equal(a.$('#fromRows .a').classList.contains('busy'),true,'a name must not call the link off');
    assert.match(a.$('#detect').textContent,/Following the link/);
    // Neither is work in a different row.
    const rows=a.w.document.querySelectorAll('#fromRows .trow');
    assert.ok(rows.length>1,'a second row is needed for this check');
    const other=rows[1].querySelector('.a');
    other.value='1.35,103.82';other.dispatchEvent(new a.w.Event('input',{bubbles:true}));
    assert.equal(rows[0].querySelector('.a').classList.contains('busy'),true,"another row's edit must not call the link off");
    // The row that started it still can.
    const own=rows[0].querySelector('.a');
    own.value='';own.dispatchEvent(new a.w.Event('input',{bubbles:true}));
    assert.equal(a.w.document.querySelectorAll('#fromRows .a.busy').length,0,'its own row must still call it off');
    assert.equal(a.$('#detect').textContent,'');
    release?.({ok:true,json:async()=>({url:'https://maps.google.com/?q=1.36,103.83'})});
    await new Promise(r=>setTimeout(r,40));
    assert.equal(a.w.document.querySelectorAll('#fromRows .a.busy').length,0,'a late answer must not revive the wait');
  }finally{a.dom.window.close();}
});

test('auto-detect reads links and prefixless grid references from one paste',async()=>{
  const a=app(undefined,false,true,'https://resolver.test');
  const PLACES={one:[1.3848414,103.9828407],two:[1.3702,103.9601]};
  a.w.fetch=async url=>{
    const link=new URL(url).searchParams.get('url');
    const [lat,lon]=PLACES[Object.keys(PLACES).find(k=>link.endsWith('/'+k))];
    return {ok:true,json:async()=>({url:`https://maps.google.com/?q=${lat},${lon}`})};
  };
  try{
    // Each point is a labelled link with its grid reference on the next line.
    a.paste(['MLP1 https://maps.app.goo.gl/one','3136 5148','MLP2 https://maps.app.goo.gl/two','3131 5067'].join('\n'));
    for(let i=0;i<40&&a.$('#copyBtn').disabled;i++)await new Promise(r=>setTimeout(r,10));
    assert.equal(a.$('#badPair').hidden,true,'nothing in this paste should be rejected: '+a.$('#badPair').textContent);
    const rows=a.state().rows;
    assert.equal(rows.length,4,'every line is its own point');
    assert.deepEqual(rows.map(r=>r[2]),['MLP1','','MLP2',''],'each label stays with the link it was pasted on');
    const points=a.state().points;
    assert.equal(points.length,4);
    assert.equal(Number(points[0].lat.toFixed(6)),1.384841);
    assert.equal(Number(points[2].lat.toFixed(6)),1.3702);
    // The prefixless digits are read as a grid reference in the area the links establish,
    // not as a latitude and longitude, which is what used to reject them.
    for(const k of [1,3]){
      assert.ok(Number.isFinite(points[k].lat)&&Number.isFinite(points[k].lon),'row '+(k+1)+' has no position');
      assert.ok(points[k].lat>1&&points[k].lat<2&&points[k].lon>103&&points[k].lon<105,
        'row '+(k+1)+' should land in the area the links establish, got '+points[k].lat+','+points[k].lon);
    }
    assert.notEqual(Number(points[1].lat.toFixed(6)),Number(points[3].lat.toFixed(6)),'different digits are different points');
  }finally{a.dom.window.close();}
});

test('Taiwan landmarks use the corrected WGS 84 positions and grid round trips',()=>{
  const c=core();
  for(const [name,lat,lon] of [['Hukou',24.86965,121.04745],['Heng Chun (Pao Li)',22.05483,120.73288]]){
    const landmark=c.MAP_CONTEXT.taiwan.landmarks.find(p=>p.name===name);
    assert.equal(landmark.lat,lat);assert.equal(landmark.lon,lon);
    c.lat=lat;c.lon=lon;
    const point=vm.runInContext('(()=>{const s=defaultSettings();s.taiwan.sgOmit=false;s.taiwan.sgDigits=5;const cells=formatPoint(lat,lon,"taiwan",s);return parseCells("taiwan",...cells,s);})()',c);
    assert.ok(Math.abs(point.lat-lat)<0.00002);assert.ok(Math.abs(point.lon-lon)<0.00002);
  }
});

test('out-of-area map selections override stale explicit outputs and enable MGRS',()=>{
  for(const from of ['auto','wgs84'])for(const to of ['wgs84','sg','globalutm']){
    const a=app({from,to,explicitOutput:true,militaryVersion:3,militaryEnabled:false,rows:[['','','']]},false,false);
    try{
      a.$('#selectMap').click();
      a.w.pointPickerHooks.onConfirm({lat:48.8582,lon:2.2945},{zoom:15,layer:'street'});
      assert.equal(a.state().militaryEnabled,true);assert.equal(a.state().to,'mgrs');
      assert.equal(a.$('#toSys').value,'mgrs');assert.equal(a.$('#copyBtn').disabled,false);
    }finally{a.dom.window.close();}
  }
});

test('successive double clicks commit each anchored zoom immediately with unloaded tiles',async()=>{
  const a=app(undefined,true);
  try{
    a.$('#selectMap').click();await new Promise(r=>setTimeout(r,40));
    const map=a.w.pointTestMap;
    map.setView([1.35,103.82],10,{animate:false,reset:true});
    const screen=a.w.L.point(500,190),anchor=map.containerPointToLatLng(screen);
    for(let i=1;i<=4;i++){
      map.fire('dblclick',{containerPoint:screen,originalEvent:{}});
      assert.equal(map.getZoom(),10+i);
      assert.ok(map.latLngToContainerPoint(anchor).distanceTo(screen)<3);
    }
    map.fire('dblclick',{containerPoint:screen,originalEvent:{shiftKey:true}});
    assert.equal(map.getZoom(),13);
  }finally{a.dom.window.close();}
});

test('map points outside global MGRS latitude coverage remain coordinates',()=>{
  const a=app(undefined,false,false);
  try{
    a.$('#selectMap').click();
    const result=a.w.pointPickerHooks.onConfirm({lat:85,lon:20},{zoom:5,layer:'street'});
    assert.equal(result.error,undefined);assert.equal(a.state().to,'wgs84');
    assert.equal(!!a.state().militaryEnabled,false);assert.equal(a.state().rows.length,1);
  }finally{a.dom.window.close();}
});

test('global military output offers each matching country preset and switches without losing points',()=>{
  for(const [id,lat,lon] of [['sg',1.35,103.82],['taiwan',24.86965,121.04745],['thailand',14.00287,99.24459],['australia',-22.71,150.409],['brunei',4.7,114.7]]){
    const a=app();
    try{
      a.paste(`${lat},${lon}`);a.change('#toSys','mgrs');
      assert.equal(a.$('#countryGridOverlay').classList.contains('open'),true,id);
      assert.equal(a.$('#copyBtn').disabled,true);assert.equal(a.$('#gpxBtn').disabled,true);
      assert.equal(a.$('#countryGridSwitch').textContent,'Change to '+a.$(`#toSys option[value="${id}"]`).textContent);
      assert.equal(a.w.document.activeElement,a.$('#countryGridSwitch'));
      const rows=a.state().rows;
      a.$('#countryGridSwitch').click();
      assert.equal(a.state().to,id);assert.deepEqual(a.state().rows,rows);
      assert.equal(a.state().points.length,1);assert.equal(a.$('#copyBtn').disabled,false,id);
      assert.equal(a.$('#countryGridOverlay').classList.contains('open'),false);
      assert.equal(!!a.$('main').inert,false);
    }finally{a.dom.window.close();}
  }
});

test('global acknowledgment is country-specific and UTM remains available',()=>{
  const a=app();
  try{
    a.change('#toSys','mgrs');a.change('#toFormat','globalutm');a.paste('1.35,103.82');
    assert.match(a.$('#countryGridContinue').textContent,/use UTM/);
    a.$('#countryGridContinue').click();
    assert.equal(a.state().to,'globalutm');assert.equal(a.$('#copyBtn').disabled,false);
    a.$('#convertBtn').click();assert.equal(a.$('#countryGridOverlay').classList.contains('open'),false);
    a.paste('4.7,114.7');assert.match(a.$('#countryGridSwitch').textContent,/Brunei MGR/);
    assert.equal(a.$('#countryGridOverlay').classList.contains('open'),true);
  }finally{a.dom.window.close();}
});

test('canceling the country preset notice leaves exports disabled and Convert asks again',()=>{
  const a=app();
  try{
    a.paste('1.35,103.82');a.change('#toSys','mgrs');
    a.$('#countryGridOverlay').dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert.equal(a.$('#countryGridOverlay').classList.contains('open'),false);
    assert.equal(a.$('#copyBtn').disabled,true);assert.equal(!!a.$('main').inert,false);
    a.$('#convertBtn').click();assert.equal(a.$('#countryGridOverlay').classList.contains('open'),true);
    a.$('#countryGridContinue').click();assert.equal(a.$('#copyBtn').disabled,false);
    const saved=a.state();
    const reopened=app(saved);
    try{reopened.$('#convertBtn').click();reopened.change('#toSys','mgrs');assert.equal(reopened.$('#countryGridOverlay').classList.contains('open'),true);}finally{reopened.dom.window.close();}
  }finally{a.dom.window.close();}
});

test('country preset notice can enable a disabled preset and is absent outside preset coverage',()=>{
  const c=core(),settings=vm.runInContext('defaultSettings()',c);
  const a=app({settings,disabledPresets:['sg'],rows:[['','','']]});
  try{
    a.paste('1.35,103.82');assert.equal(a.$('#countryGridOverlay').classList.contains('open'),true);
    a.$('#countryGridSwitch').click();assert.equal(a.state().to,'sg');assert.ok(!a.state().disabledPresets.includes('sg'));
    assert.equal(a.$('#copyBtn').disabled,false);
    a.paste('48.8582,2.2945');a.change('#toSys','mgrs');
    assert.equal(a.$('#countryGridOverlay').classList.contains('open'),false);
    assert.equal(a.$('#copyBtn').disabled,false);
  }finally{a.dom.window.close();}
});


test('UTM input also offers the country preset when switching to global MGRS',()=>{
  const a=app();
  try{
    a.paste('48N 368831.814 143329.716');assert.equal(a.state().from,'globalutm');
    a.change('#toSys','mgrs');
    assert.equal(a.$('#countryGridOverlay').classList.contains('open'),true);
    assert.equal(a.$('#countryGridSwitch').textContent,'Change to Singapore MGR');
    a.$('#countryGridSwitch').click();assert.equal(a.state().to,'sg');
    assert.equal(a.$('#copyBtn').disabled,false);
  }finally{a.dom.window.close();}
});

test('unrelated preset toggles and settings preserve a completed conversion',async()=>{
  const a=app();
  try{
    a.change('#fromSys','sg');a.paste('3000 3000');
    const before=a.state(),output=a.$('#toRows').innerHTML;
    const unchanged=()=>{
      const after=a.state();
      for(const key of ['from','to','rows','points','aoConfirmed'])assert.deepEqual(after[key],before[key],key);
      assert.equal(a.$('#toRows').innerHTML,output);
      assert.equal(a.$('#copyBtn').disabled,false);assert.equal(a.$('#gpxBtn').disabled,false);
    };
    a.$('#tab-set').click();
    for(const id of ['thailand','mgrs']){
      a.$(`[data-toggle="${id}"]`).click();unchanged();
      a.$(`[data-toggle="${id}"]`).click();unchanged();
    }
    await new Promise(r=>setTimeout(r,5));
    a.$('.preset[data-id="thailand"] .seg button[data-v="5"]').click();unchanged();
    a.$('[data-reset="thailand"]').click();unchanged();
  }finally{a.dom.window.close();}
});

test('only actual active input setting changes require conversion again',async()=>{
  const a=app();
  try{
    a.change('#fromSys','sg');a.paste('3000 3000');
    a.$('#tab-set').click();await new Promise(r=>setTimeout(r,5));
    a.$('.preset[data-id="sg"] .seg button[data-v="4"]').click();
    assert.equal(a.$('#copyBtn').disabled,false,'selecting the current setting preserves results');
    a.$('.preset[data-id="sg"] .seg button[data-v="5"]').click();
    assert.equal(a.$('#copyBtn').disabled,true);assert.deepEqual(a.state().points,[]);
    a.$('#tab-conv').click();a.$('#convertBtn').click();
    assert.equal(a.$('#copyBtn').disabled,false);
    a.$('#tab-set').click();a.$('[data-toggle="sg"]').click();
    assert.notEqual(a.state().from,'sg');assert.equal(a.$('#copyBtn').disabled,true);
  }finally{a.dom.window.close();}
});

/* ---- v2 reference areas ---- */
test('the app reports version 3.6.0',()=>{
  const a=app();
  try{assert.equal(a.$('#appVersion').textContent,'v3.6.0');assert.match(read('version.js'),/APP_VERSION = "3\.6\.0"/);
    const logo=a.$('header h1 .logo');assert.ok(logo,'the header shows the app icon');assert.equal(logo.getAttribute('src'),'icons/logo-64.png');assert.equal(logo.getAttribute('alt'),'');}
  finally{a.dom.window.close();}
});
test('the output reference area follows point 1 and cannot be changed',()=>{
  const c=core(),settings=vm.runInContext('defaultSettings()',c);settings.mgrs.ao='47NRA';
  const a=app({settings,militaryVersion:3,militaryEnabled:true,aoSelectionVersion:2,rows:[['','','']]});
  try{
    a.paste('1.3521, 103.8198');
    a.change('#toSys','mgrs');
    a.$('#countryGridContinue').click();
    assert.equal(a.state().to,'mgrs');
    assert.equal(a.state().settings.mgrs.ao,'48NUG','a saved area survived conversion');
    assert.equal(a.$('#regionChipTo').textContent,'Reference area: 48N UG');
    assert.equal(a.$('#regionChipTo').getAttribute('role'),null);
    assert.equal(a.$('#regionChipTo').querySelector('button'),null);
    a.$('#regionChipTo').click();
    assert.equal(a.w.mapOptions,undefined,'the output area opened a chooser');
    assert.equal(a.$('#boundaryOverlay').classList.contains('open'),false);
  }finally{a.dom.window.close();}
});
test('output spanning reference areas lists them and shows which points each holds',()=>{
  const a=app();
  try{
    a.change('#fromSys','wgs84');
    a.paste('1.3521, 103.8198\n1.35, 104.9');
    if(a.$('#countryGridOverlay').classList.contains('open'))a.$('#countryGridContinue').click();
    a.change('#toSys','mgrs');
    if(a.$('#countryGridOverlay').classList.contains('open'))a.$('#countryGridContinue').click();
    if(a.$('#boundaryOverlay').classList.contains('open'))a.$('#boundaryContinue').click();
    assert.equal(a.state().to,'mgrs');
    const links=[...a.$('#regionChipTo').querySelectorAll('.area-link')];
    assert.equal(links.length,2,a.$('#regionChipTo').textContent);
    assert.match(a.$('#regionChipTo').textContent,/^Reference areas:/);
    assert.match(links[0].textContent,/^48N UG · 1 point$/);
    links[1].click();
    const view=a.w.viewOptions;
    assert.ok(view,'the area list did not open the map');
    assert.equal(view.areas.length,2);
    assert.equal(view.focus,view.areas[1].key);
    assert.equal(JSON.stringify(view.areas.map(g=>g.points.map(p=>p.number))),'[[1],[2]]');
    assert.ok(view.areas.every(g=>g.polygon.length>=4));
  }finally{a.dom.window.close();}
});
test('the area view draws each area and its numbered points without offering a choice',async()=>{
  const a=app(undefined,true);
  try{
    a.change('#fromSys','wgs84');
    a.paste('1.3521, 103.8198\n1.35, 104.9');
    if(a.$('#countryGridOverlay').classList.contains('open'))a.$('#countryGridContinue').click();
    a.change('#toSys','mgrs');
    if(a.$('#countryGridOverlay').classList.contains('open'))a.$('#countryGridContinue').click();
    if(a.$('#boundaryOverlay').classList.contains('open'))a.$('#boundaryContinue').click();
    a.$('#regionChipTo .area-link').click();
    assert.ok(a.$('#aoOverlay').classList.contains('open'));
    assert.ok(a.$('#aoOverlay').classList.contains('viewing'));
    assert.equal(a.$('#aoApply').hidden,true);
    assert.match(a.$('#aoSelection').textContent,/48N UG: point 1/);
    const candidates=[];a.w.testMap.eachLayer(l=>{if(l.options?.aoCandidate)candidates.push(l);});
    assert.equal(candidates.length,0,'the view offered selectable squares');
    a.$('#aoClose').click();
    assert.equal(a.$('#aoOverlay').classList.contains('viewing'),false);
  }finally{a.dom.window.close();}
});
test('the input area chip appears for any grid input and rewrites typed prefixes',()=>{
  const a=app();
  try{
    a.change('#fromSys','mgrs');
    assert.equal(a.$('#regionChip').hidden,false,'empty grid input hid its area');
    a.paste('48N UG 6883 4332\n48N UG 6900 4400');
    assert.match(a.$('#regionChip').textContent,/^Reference area: 48N UG · Change$/);
    a.$('#regionChip').click();
    assert.equal(a.w.mapOptions.bulk,true);
    assert.deepEqual({...a.w.mapOptions.pick},{e:'6883',n:'4332'},'point 1 digits must travel for the preview');
    a.w.pickerHooks.onSelect({id:'mgrs',prefix:'48NUH',lat:2.2,lon:103.8},a.w.mapOptions);
    const prefixes=[...a.$('#fromRows').querySelectorAll('.prefix')].map(i=>i.value);
    assert.deepEqual(prefixes,['48N UH','48N UH']);
    assert.equal(a.state().settings.mgrs.ao,'48NUH');
    assert.match(a.$('#regionChip').textContent,/48N UH/);
    assert.equal(a.$('#copyBtn').disabled,false,a.$('#badPair').textContent);
    a.$('#undoBtn').click();
    assert.deepEqual([...a.$('#fromRows').querySelectorAll('.prefix')].map(i=>i.value),['48N UG','48N UG']);
  }finally{a.dom.window.close();}
});
test('a country grid chip leaves rows in other squares where they are',()=>{
  const c=core(),settings=vm.runInContext('defaultSettings()',c);settings.thailand.square=[5,15];
  const a=app({settings,militaryVersion:3,militaryEnabled:true,aoSelectionVersion:2,rows:[['','','']]},false,false);
  try{
    a.change('#fromSys','thailand');
    a.$('#fromRows .a').value='1234';a.$('#fromRows .b').value='5678';a.$('#fromRows .a').dispatchEvent(new a.w.Event('input',{bubbles:true}));
    a.$('#addRow').click();
    const second=a.$('#fromRows').children[1];
    second.querySelector('.a').value='2000';second.querySelector('.b').value='3000';second.querySelector('.a').dispatchEvent(new a.w.Event('input',{bubbles:true}));
    // Point 2 moves to its own square first, then the chip moves point 1's square.
    second.querySelector('.pill-map').click();
    a.w.pickerHooks.onSelect({id:'thailand',e:6,n:15,lat:13.6,lon:100.2},a.w.mapOptions);
    if(a.$('#boundaryOverlay').classList.contains('open'))a.$('#boundaryContinue').click();
    a.$('#regionChip').click();
    a.w.pickerHooks.onSelect({id:'thailand',e:5,n:16,lat:14.5,lon:99.2},a.w.mapOptions);
    const rows=a.state().rows;
    assert.deepEqual(a.state().settings.thailand.square,[5,16]);
    assert.equal(rows[0][3],undefined,'point 1 follows the default square');
    assert.equal(rows[1][3]||'','6/15','point 2 was dragged along with point 1');
    a.$('#boundaryContinue').click();
    const squares=a.state().points.map(p=>vm.runInContext(`(()=>{const q=toProjFromWGS(${p.lat},${p.lon},projectionFor('thailand'));return Math.floor(q.E/100000)+'/'+Math.floor(q.N/100000);})()`,c));
    assert.deepEqual(squares,['5/16','6/15']);
  }finally{a.dom.window.close();}
});
test('each grid row can move to its own reference area, and the boundary notice follows',()=>{
  const c=core(),settings=vm.runInContext('defaultSettings()',c);settings.thailand.square=[5,15];
  const a=app({settings,militaryVersion:3,militaryEnabled:true,aoSelectionVersion:2,rows:[['','','']]},false,false);
  try{
    a.change('#fromSys','thailand');
    const first=a.$('#fromRows').children[0];
    assert.ok(first.querySelector('.area-pill .square'),'grid rows need an area pill');
    assert.equal(first.querySelector('.square').placeholder,'E5 N15','the pill shows the square rows share');
    assert.equal(first.querySelector('.pill-map').disabled,true,'an empty row has nothing to move');
    first.querySelector('.a').value='1234';first.querySelector('.b').value='5678';first.querySelector('.a').dispatchEvent(new a.w.Event('input',{bubbles:true}));
    a.$('#addRow').click();
    const second=a.$('#fromRows').children[1];
    second.querySelector('.a').value='2000';second.querySelector('.b').value='3000';second.querySelector('.a').dispatchEvent(new a.w.Event('input',{bubbles:true}));
    a.$('#convertBtn').click();
    assert.equal(a.$('#copyBtn').disabled,false,a.$('#badPair').textContent);
    const before=a.state().points[1];
    a.$('#fromRows').children[1].querySelector('.pill-map').click();
    assert.equal(a.w.mapOptions.row,1);
    assert.equal(a.w.mapOptions.bulk,undefined);
    assert.deepEqual({...a.w.mapOptions.pick},{e:'2000',n:'3000'});
    assert.match(a.w.mapOptions.title,/^Point 2/);
    a.w.pickerHooks.onSelect({id:'thailand',e:6,n:15,lat:13.6,lon:100.2},a.w.mapOptions);
    assert.equal(a.state().rows[1][3],'6/15');
    assert.equal(a.state().rows[0][3],undefined,'point 1 must not move');
    assert.equal(a.$('#fromRows').children[1].querySelector('.square').value,'E6 N15');assert.equal(a.$('#fromRows').children[0].querySelector('.square').value,'');
    assert.equal(a.$('#boundaryOverlay').classList.contains('open'),true,'points across squares must raise the boundary notice');
    a.$('#boundaryContinue').click();
    const after=a.state().points[1];
    assert.ok(Math.abs(after.lon-before.lon)>0.5,'point 2 did not move to its new square');
    assert.equal(a.$('#copyBtn').disabled,false);
  }finally{a.dom.window.close();}
});
test('hovering a square previews where the point would land there',()=>{
  const a=app(undefined,true);
  try{
    a.change('#fromSys','taiwan');
    a.paste('1234 5678');
    const pick=a.$('#locationOverlay').classList.contains('open');
    if(pick)a.$('[data-location="taiwan"]').click();
    const candidates=[];a.w.testMap.eachLayer(l=>{if(l.options?.aoCandidate?.point)candidates.push(l);});
    assert.ok(candidates.length>1,'squares with a previewable point are needed');
    const dots=()=>{const found=[];a.w.testMap.eachLayer(l=>{if(l instanceof a.w.L.CircleMarker&&l.options.radius===7)found.push(l.getLatLng());});return found;};
    for(const layer of candidates.slice(0,2)){
      layer.fire('mouseover');
      const p=layer.options.aoCandidate.point,shown=dots();
      assert.equal(shown.length,1);
      assert.ok(Math.abs(shown[0].lat-p.lat)<1e-9,'the preview did not follow the hovered square');
      layer.fire('mouseout');
    }
    assert.equal(dots().length,0,'leaving the squares kept a preview with nothing selected');
  }finally{a.dom.window.close();}
});

/* ---- v2.1 area pills ---- */
test('typing into an MGRS prefix pill moves that row, and the map icon opens its area',()=>{
  const a=app();
  try{
    a.change('#fromSys','mgrs');
    a.paste('48N UG 6793 4572\n48N UG 6800 4600');
    const rows=a.$('#fromRows').children;
    assert.ok(rows[1].querySelector('.area-pill .prefix'),'the prefix is a pill');
    assert.equal(a.$('#fromFormatChip'),null);
    const pill=rows[1].querySelector('.prefix');
    pill.value='48N VG';pill.dispatchEvent(new a.w.Event('input',{bubbles:true}));
    assert.match(a.state().rows[1][0],/^48N VG 6800$/);
    a.$('#convertBtn').click();
    if(a.$('#boundaryOverlay').classList.contains('open'))a.$('#boundaryContinue').click();
    assert.ok(a.state().points[1].lon>104,'point 2 did not move to 48N VG');
    a.$('#fromRows').children[0].querySelector('.pill-map').click();
    assert.equal(a.w.mapOptions.row,0);
  }finally{a.dom.window.close();}
});
test('typing a square into a country pill moves that row; the shared square needs none',()=>{
  const c=core(),settings=vm.runInContext('defaultSettings()',c);settings.thailand.square=[5,15];
  const a=app({settings,militaryVersion:3,militaryEnabled:false,aoSelectionVersion:2,from:'thailand',rows:[['1234','5678','']]},false,false);
  try{
    assert.equal(a.state().from,'thailand');
    const pill=a.$('#fromRows .square');
    for(const [typed,stored] of [['E6 N15','6/15'],['6/15','6/15'],['E5 N15',undefined]]){
      pill.value=typed;pill.dispatchEvent(new a.w.Event('input',{bubbles:true}));
      assert.equal(a.state().rows[0][3],stored,typed);
    }
    pill.value='nowhere';pill.dispatchEvent(new a.w.Event('input',{bubbles:true}));
    a.$('#convertBtn').click();
    assert.equal(a.$('#copyBtn').disabled,true);
    assert.match(a.$('#badPair').textContent,/E5 N15/);
    assert.ok(a.$('#fromRows .area-pill').classList.contains('bad'));
  }finally{a.dom.window.close();}
});
test('omitting the MGRS prefix drops the prefix column where every row is in the area',()=>{
  const c=core(),settings=vm.runInContext('defaultSettings()',c);settings.mgrs.ao='48NUG';settings.mgrs.sgOmit=true;
  const a=app({settings,militaryVersion:3,militaryEnabled:true,aoSelectionVersion:2,omitVersion:2,rows:[['','','']]});
  try{
    a.change('#fromSys','wgs84');a.paste('1.3521, 103.8198');
    a.change('#toSys','mgrs');
    if(a.$('#countryGridOverlay').classList.contains('open'))a.$('#countryGridContinue').click();
    assert.equal(a.$('#copyBtn').disabled,false,a.$('#badPair').textContent);
    assert.equal(a.$('#toRows .prefix'),null,'the output kept an empty prefix column');
    assert.doesNotMatch(a.$('#toHead').textContent,/Prefix/);
    a.$('#swapBtn').click();
    assert.equal(a.state().from,'mgrs');
    assert.equal(a.$('#fromRows .prefix'),null,'the input kept a prefix column for an omitted prefix');
    assert.equal(a.$('#copyBtn').disabled,false,a.$('#badPair').textContent);
    // A row in another area brings the column back.
    a.paste('48N UG 6793 4572\n48N VG 2977 6263');
    if(a.$('#boundaryOverlay').classList.contains('open'))a.$('#boundaryContinue').click();
    assert.ok(a.$('#fromRows .prefix'),'a row outside the area needs its prefix shown');
  }finally{a.dom.window.close();}
  const b=app({settings:{...settings,mgrs:{...settings.mgrs,sgOmit:false}},militaryVersion:3,militaryEnabled:true,aoSelectionVersion:2,omitVersion:2,rows:[['','','']]});
  try{
    b.change('#fromSys','mgrs');assert.ok(b.$('#fromRows .prefix'),'without omission the prefix column stays');
  }finally{b.dom.window.close();}
});
test('a clicked square keeps its point while other squares are hovered',()=>{
  const a=app(undefined,true);
  try{
    a.change('#fromSys','taiwan');
    a.paste('1234 5678');
    if(a.$('#locationOverlay').classList.contains('open'))a.$('[data-location="taiwan"]').click();
    const candidates=[];a.w.testMap.eachLayer(l=>{if(l.options?.aoCandidate?.point)candidates.push(l);});
    assert.ok(candidates.length>1);
    const dots=()=>{const found=[];a.w.testMap.eachLayer(l=>{if(l instanceof a.w.L.CircleMarker&&l.options.radius===7)found.push(l.getLatLng());});return found;};
    candidates[0].fire('click');
    const chosen=candidates[0].options.aoCandidate.point;
    candidates[1].fire('mouseover');
    assert.equal(dots().length,1);
    assert.ok(Math.abs(dots()[0].lat-chosen.lat)<1e-9,'hovering moved the point after a click');
    candidates[1].fire('mouseout');
    assert.ok(Math.abs(dots()[0].lat-chosen.lat)<1e-9);
  }finally{a.dom.window.close();}
});
test('pasting a full reference splits it into fields, and Undo returns the pasted text',()=>{
  const a=app();
  try{
    a.paste('48N UG 6793 4572');
    assert.equal(a.state().from,'mgrs');
    assert.equal(a.$('#fromRows .prefix').value,'48N UG');
    assert.equal(a.$('#undoBtn').disabled,false,'the split must be undoable');
    a.$('#undoBtn').click();
    assert.equal(a.$('#fromSys').value,'auto');
    assert.equal(a.$('#fromRows .a').value,'48N UG 6793 4572');
  }finally{a.dom.window.close();}
});

/* ---- v2.2 areas survive crossing and swapping ---- */
test('swapping a Thailand batch across squares keeps each row in its own square',()=>{
  const a=app(undefined,false,false);
  try{
    a.change('#fromSys','wgs84');
    a.paste('14.0029030, 99.2445874\n14.0419231, 99.2486000\n13.4281631, 100.9890747');
    assert.equal(a.$('#boundaryOverlay').classList.contains('open'),true);
    a.$('#boundaryContinue').click();
    assert.equal(a.state().to,'thailand');
    assert.equal(a.state().settings.thailand.sgOmit,true,'crossing must not turn omission off');
    assert.ok([...a.$('#toRows').querySelectorAll('.a')].every(c=>c.value.length===5),'output across squares keeps leading digits');
    const points=a.state().points;
    a.$('#swapBtn').click();
    if(a.$('#boundaryOverlay').classList.contains('open'))a.$('#boundaryContinue').click();
    assert.equal(a.state().from,'thailand');
    const rows=a.state().rows;
    assert.ok(rows.every(r=>/^\d{4}$/.test(r[0])&&/^\d{4}$/.test(r[1])),'input digits follow the omit setting: '+JSON.stringify(rows));
    assert.deepEqual(rows.map(r=>r[3]||null),[null,null,'7/14']);
    const pills=[...a.$('#fromRows').querySelectorAll('.square')];
    assert.deepEqual(pills.map(x=>x.value),['','','E7 N14']);
    assert.ok(pills.every(x=>x.placeholder==='E5 N15'));
    a.$('#swapBtn').click();a.$('#swapBtn').click();
    if(a.$('#boundaryOverlay').classList.contains('open'))a.$('#boundaryContinue').click();
    assert.equal(a.state().points.length,3);
    a.state().points.forEach((p,k)=>assert.ok(Math.abs(p.lat-points[k].lat)<.001&&Math.abs(p.lon-points[k].lon)<.001,'point '+(k+1)+' moved'));
  }finally{a.dom.window.close();}
});
test('a full-digit row shows the square its digits name, not the shared one',()=>{
  const c=core(),settings=vm.runInContext('defaultSettings()',c);settings.thailand.square=[5,15];
  const a=app({settings,militaryVersion:3,militaryEnabled:false,aoSelectionVersion:2,omitVersion:2,from:'thailand',rows:[['1234','5678',''],['71536','148535','']]},false,false);
  try{
    const pills=[...a.$('#fromRows').querySelectorAll('.square')];
    assert.deepEqual(pills.map(x=>x.value),['','E7 N14']);
  }finally{a.dom.window.close();}
});
test('saved omission switched off by an old boundary notice is restored once',()=>{
  const c=core(),settings=vm.runInContext('defaultSettings()',c);settings.thailand.sgOmit=false;settings.mgrs.sgOmit=true;
  const a=app({settings,militaryVersion:3,militaryEnabled:true,aoSelectionVersion:2,rows:[['','','']]});
  try{
    a.change('#fromSys','wgs84');
    const s=a.state();
    assert.equal(s.settings.thailand.sgOmit,true);assert.equal(s.settings.mgrs.sgOmit,false);assert.equal(s.omitVersion,2);
  }finally{a.dom.window.close();}
});
// ---- 2.3: robust formats, Brunei full references, paste/undo/reorder, maps limits ----
test('coordinates are read however the copy mangled their marks and separators',()=>{
  const c=core();
  const near=(r,lat,lon,t)=>{assert.ok(!r.error,t+': '+r.error);assert.ok(Math.abs(r.lat-lat)<2e-4&&Math.abs(r.lon-lon)<2e-4,t+' -> '+r.lat+','+r.lon);};
  for(const t of ['1 21 07.6 N 103 49 11.3 E','N 01 21.127 E 103 49.188','1°21’07.6”N 103°49’11.3”E','1˚21\'07.6"N 103˚49\'11.3"E','1Â°21â€²07.6â€³N 103Â°49â€²11.3â€³E',
    '1&deg;21&prime;07.6&Prime;N 103&deg;49&prime;11.3&Prime;E','1d21m07.6sN 103d49m11.3sE','1:21:07.6N 103:49:11.3E','01°21\'07.6"N103°49\'11.3"E','1,3521 103,8198','1,3521; 103,8198',
    '１.３５２１, １０３.８１９８','Lat: 1.3521 Long: 103.8198','Long: 103.8198 Lat: 1.3521','{"lat": 1.3521, "lng": 103.8198}','POINT(103.8198 1.3521)','1.3521N103.8198E','(1.3521, 103.8198)','1 21 07.6 103 49 11.3'])
    near(vm.runInContext('parseLatLon('+JSON.stringify(t)+',"latlon")',c),1.3521,103.8198,t);
  near(vm.runInContext('parseLatLon("S 22 39 00 E 150 21 00","latlon")',c),-22.65,150.35,'southern DMS');
  for(const t of ['1.35, 103.82, 50','1 61 00 N 103 00 00 E','91, 103.8','HQ 1.35, 103.82'])assert.ok(vm.runInContext('parseLatLon('+JSON.stringify(t)+',"latlon")',c).error,t+' should be refused');
});
test('pasting DMS without symbols makes one point, not three',()=>{
  const a=app();a.paste('1 21 07.6 N 103 49 11.3 E');
  assert.equal(a.state().points.length,1);assert.ok(Math.abs(a.state().points[0].lat-1.35211)<1e-4);a.dom.window.close();
});
test('Brunei outside square 44 14 is written in full, explained, and read back',()=>{
  const a=app(undefined,false,false);a.paste('4.5836, 114.2311');
  assert.equal(a.$('#boundaryOverlay').classList.contains('open'),true);
  assert.match(a.$('#boundaryDetail').textContent,/square 43 14, outside square 44 14/);
  a.$('#boundaryContinue').click();
  const [e,n]=[a.$('#toRows .a').value,a.$('#toRows .b').value];assert.match(e,/^43\d{4}$/);assert.match(n,/^14\d{4}$/);
  a.dom.window.close();
  const b=app(undefined,false,false);b.change('#fromSys','brunei');
  const row=b.$('#fromRows').children[0];row.querySelector('.a').value=e;row.querySelector('.b').value=n;row.querySelector('.a').dispatchEvent(new b.w.Event('input',{bubbles:true}));
  b.$('#convertBtn').click();if(b.$('#boundaryOverlay').classList.contains('open'))b.$('#boundaryContinue').click();
  const p=b.state().points[0];assert.ok(p&&Math.abs(p.lat-4.5836)<3e-4&&Math.abs(p.lon-114.2311)<3e-4,'full reference read back: '+b.$('#badPair').textContent);
  b.dom.window.close();
});
test('grid references convert to the center of the square they name',()=>{
  const c=core();c.S=vm.runInContext('defaultSettings()',c);
  const r=vm.runInContext('parseCells("sg","424","433",S)',c),q=vm.runInContext('toProjFromWGS('+r.lat+','+r.lon+',"EPSG:3168")',c);
  assert.ok(Math.abs(q.E-642450)<.01&&Math.abs(q.N-143350)<.01,'100 m square center: '+q.E+','+q.N);
});
test('pasting several lines into a middle row adds rows and keeps every name',()=>{
  const a=app(undefined,false,false);
  a.paste('1.30, 103.80\n1.31, 103.81\n1.32, 103.82');
  a.w.document.querySelectorAll('#fromRows .nm').forEach((nm,k)=>{nm.value='ABC'[k];nm.dispatchEvent(new a.w.Event('input',{bubbles:true}));});
  a.paste('1.40, 103.90\n1.41, 103.91',1);
  assert.deepEqual(a.state().rows.map(r=>r[2]),['A','B','','C']);
  assert.match(a.state().rows[1][0],/1\.40/);assert.match(a.state().rows[3][0],/1\.32/,'the row below was not overwritten');
  a.$('#undoBtn').click();assert.deepEqual(a.state().rows.map(r=>r[2]),['A','B','C'],'one Undo returns the table before the paste');
  assert.match(a.state().rows[1][0],/1\.31/);a.dom.window.close();
});
test('deleting a row and renaming a point can both be undone',()=>{
  const a=app(undefined,false,false);a.paste('1.30, 103.80\n1.31, 103.81');
  const nm=a.$('#fromRows').children[1].querySelector('.nm');nm.dispatchEvent(new a.w.Event('focus'));nm.value='OBJ';nm.dispatchEvent(new a.w.Event('input',{bubbles:true}));nm.dispatchEvent(new a.w.Event('change',{bubbles:true}));
  a.$('#fromRows').children[0].querySelector('.del').click();assert.equal(a.state().rows.length,1);
  a.$('#undoBtn').click();assert.equal(a.state().rows.length,2);assert.equal(a.state().rows[1][2],'OBJ');
  a.$('#undoBtn').click();assert.equal(a.state().rows[1][2],'');a.dom.window.close();
});
test('Copy is tab separated with names, and pasting it back keeps the names',async()=>{
  const a=app(undefined,false,false);let copied='';a.w.navigator.clipboard={writeText:async t=>{copied=t;}};
  a.paste('1.35, 103.82\n1.36, 103.83');const nm=a.$('#fromRows').children[0].querySelector('.nm');nm.value='HQ';nm.dispatchEvent(new a.w.Event('input',{bubbles:true}));
  a.$('#convertBtn').click();a.$('#copyBtn').click();await new Promise(r=>setTimeout(r,10));
  assert.match(copied,/^\d{4}\t\d{4}\tHQ\n\d{4}\t\d{4}$/);a.dom.window.close();
  const b=app(undefined,false,false);b.change('#fromSys','sg');b.paste(copied);
  assert.equal(b.state().points.length,2);assert.equal(b.state().rows[0][2],'HQ');b.dom.window.close();
  const c=app();c.paste('HQ\t1.35\t103.82\nRV 1.30, 103.85\n1.31, 103.86 (Objective)');
  assert.deepEqual(c.state().rows.map(r=>r[2]),['HQ','RV','Objective']);c.dom.window.close();
});
test('two long numbers are a full country reference or meters that need a zone, never two references',()=>{
  const a=app(undefined,false,false);a.paste('366000 149000');
  assert.equal(a.state().rows.length,1);assert.match(a.$('#badPair').textContent,/zone prefix/);a.dom.window.close();
  const b=app(undefined,false,false);b.paste('642412 143381');
  assert.equal(b.$('#fromSys').value,'sg');assert.equal(b.state().points.length,1);b.dom.window.close();
});
test('short digits after a full MGRS reference share its prefix',()=>{
  const a=app();a.paste('48NUG6872249247\n7000 5000');
  assert.equal(a.state().points.length,2,a.$('#badPair').textContent);assert.match(a.state().rows[1][0],/^48N ?UG/);a.dom.window.close();
});
test('polar points with MGRS output say why instead of going blank',()=>{
  const a=app();a.paste('85, 10');a.change('#toSys','mgrs');
  assert.match(a.$('#badPair').textContent,/beyond MGRS and UTM coverage/);assert.equal(a.$('#copyBtn').disabled,true);a.dom.window.close();
});
test('zero-padded MGRS zones and route links are read',()=>{
  const c=core();assert.equal(c.GlobalGrid.parse('04QFJ1234567890').prefix,'4QFJ');
  const end=vm.runInContext('extractMapCoordinate("https://www.google.com/maps/dir/1.3,103.8/1.4,103.9/@1.35,103.85,12z")',c);
  assert.equal(end.lat,1.4);assert.equal(end.lon,103.9);
  const named=vm.runInContext('extractMapCoordinate("https://www.google.com/maps/dir/A/B/@1.35,103.85,12z/data=!4m8!4m7!1m2!1m1!1s0x1!1m2!1m1!1s0x2!1d103.99!2d1.36")',c);
  assert.equal(named.lat,1.36);
  const pin=vm.runInContext('extractMapCoordinate("https://www.google.com/maps/place/1%C2%B021\'07.6%22N+103%C2%B049\'11.3%22E")',c);
  assert.ok(Math.abs(pin.lat-1.35211)<1e-4);
});
test('one point just outside the country outline does not take the grid from the batch',()=>{
  const a=app(undefined,false,false);a.paste('-22.65, 150.35\n-22.8125, 150.1326\n-22.14, 150.04\n-22.2, 150.0');
  assert.equal(a.$('#toSys').value,'australia');a.dom.window.close();
});
test('rows reorder by keyboard, undoably, and results follow',()=>{
  const a=app(undefined,false,false);a.paste('1.30, 103.80\n1.31, 103.81\n1.32, 103.82');
  const grip=a.$('#fromRows').children[0].querySelector('.grip');assert.ok(grip,'each row has a grip');
  grip.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
  assert.match(a.state().rows[0][0],/1\.31/);assert.match(a.state().rows[1][0],/1\.30/);assert.equal(a.state().points.length,3);
  assert.equal(a.w.document.activeElement,a.$('#fromRows').children[1].querySelector('.grip'),'focus follows the row');
  a.$('#undoBtn').click();assert.match(a.state().rows[0][0],/1\.30/);a.dom.window.close();
});
test('Open in Maps respects the per-device stop limit and offers parts beyond it',()=>{
  const a=app(undefined,false,false);const opened=[];a.w.open=u=>{opened.push(u);};
  a.paste(Array.from({length:12},(_,k)=>`1.3${k%10}, 103.8${k%10}`).join('\n'));a.$('#mapsBtn').click();
  assert.equal(opened.length,0);assert.equal(a.$('#mapsOverlay').classList.contains('open'),true);
  const parts=[...a.w.document.querySelectorAll('#mapsParts button')].map(b=>b.textContent);
  assert.deepEqual(parts,['Points 1–11','Points 11–12']);
  a.w.document.querySelector('#mapsParts button').click();assert.equal((opened[0].match(/%7C/g)||[]).length,8,'9 waypoints between origin and destination');
  a.dom.window.close();
  const c=core();assert.deepEqual(vm.runInContext('0',c),0);
});
test('a half-typed run of digits is never split, whatever the preset',()=>{
  const a=app(undefined,false,false);a.change('#fromSys','sg');
  const A=a.$('#fromRows .a');A.value='1212';A.dispatchEvent(new a.w.Event('input',{bubbles:true}));a.$('#convertBtn').click();
  assert.equal(a.$('#fromRows .a').value,'1212');assert.equal(a.$('#fromRows .b').value,'');a.dom.window.close();
});
