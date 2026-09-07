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
  for(const f of ['proj4.js','vendor/mgrs.js','grid-core.js','australia-map.js'])vm.runInContext(read(f),ctx);
  vm.runInContext(inline.split('  /* ============================ UI / state')[0],ctx);
  return ctx;
}
function app(saved,realMap=false){
  const dom=new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g,''),{url:'https://example.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  if(saved)w.localStorage.setItem('mgrconv-v1',JSON.stringify(saved));
  for(const f of ['version.js','proj4.js','vendor/mgrs.js','grid-core.js','australia-map.js'])w.eval(read(f));
  if(realMap){
    const ctx=new Proxy({measureText:s=>({width:String(s).length*6})},{get:(obj,key)=>key in obj?obj[key]:()=>{}});
    w.HTMLCanvasElement.prototype.getContext=()=>ctx;
    Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{get(){return 800;}});
    Object.defineProperty(w.HTMLElement.prototype,'clientHeight',{get(){return this.id==='aoMap'?480:40;}});
    w.fetch=async()=>({ok:true,json:async()=>JSON.parse(read('vendor/land.geojson'))});
    w.eval(read('vendor/leaflet.js'));w.eval(read('map-picker.js'));
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
test('arbitrary 4+4 input opens map immediately and selecting Singapore defaults local',()=>{
  const a=app();a.paste('3000 3000');assert.ok(a.w.mapOptions.pending);assert.equal(a.$('#copyBtn').disabled,true);
  a.w.pickerHooks.onSelect({id:'sg',e:6,n:1,lat:1.35,lon:103.82},a.w.mapOptions);
  assert.equal(a.$('#fromSys').value,'sg');assert.equal(a.$('#toSys').value,'wgs84');a.dom.window.close();
});
test('paste outside presets selects global MGRS with letters and auto AO',()=>{
  const a=app();a.paste('48.8582, 2.2945');assert.equal(a.$('#toSys').value,'mgrs');
  assert.match(a.$('#toRows .a').value,/^31UDQ \d{4}$/);assert.equal(a.state().settings.mgrs.ao,'31UDQ');a.dom.window.close();
});
test('country change revalidates immediately, clears output and exports',()=>{
  const a=app();a.paste('1.352083,103.819836');assert.equal(a.$('#toSys').value,'sg');assert.equal(a.$('#copyBtn').disabled,false);
  a.change('#toSys','taiwan');assert.match(a.$('#badPair').textContent,/Singapore, not Taiwan/);assert.equal(a.$('#copyBtn').disabled,true);assert.equal(a.$('#toRows .a'),null);a.dom.window.close();
});
test('explicit global output in Singapore requires check and is not auto-switched on later paste',()=>{
  const a=app();a.paste('1.352083,103.819836');a.change('#toSys','mgrs');assert.ok(a.$('#datumOverlay').classList.contains('open'));assert.equal(a.$('#copyBtn').disabled,true);
  a.$('#datumGlobal').click();assert.match(a.$('#toRows .a').value,/^48N/);a.paste('1.36,103.83');assert.equal(a.$('#toSys').value,'mgrs');a.dom.window.close();
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
test('real picker renders grids, selects preset and explicitly confirms WGS 84',()=>{
  const a=app(undefined,true);a.paste('3000 3000');
  assert.ok(a.$('#aoOverlay').classList.contains('open'));
  assert.ok(a.$('#aoMap canvas'));
  const singapore=[...a.$('#aoJump').options].find(o=>o.textContent==='Singapore');
  a.change('#aoJump',singapore.value);a.$('#aoCentre').click();
  assert.match(a.$('#aoSelection').textContent,/Singapore MGR/);assert.equal(a.$('#aoApply').disabled,false);
  a.change('#aoSystem','mgrs');assert.equal(a.$('#aoApply').disabled,true);assert.equal(a.$('#aoConfirmLabel').hidden,false);
  a.$('#aoDatumConfirm').click();assert.equal(a.$('#aoApply').disabled,false);
  a.$('#aoApply').click();assert.equal(a.$('#fromSys').value,'mgrs');assert.equal(a.$('#copyBtn').disabled,false);
  a.dom.window.close();
});
test('map picker includes all existing landmark jumps and works without a street map',()=>{
  const a=app(undefined,true);a.paste('1234 5678');
  const jumps=a.$('#aoJump').textContent;
  for(const landmark of ['Sai Yok','Camp Tilpal','Camp Growl','Hukou','Heng Chun'])assert.ok(jumps.includes(landmark),landmark);
  a.$('#aoClose').click();assert.equal(a.$('#aoOverlay').classList.contains('open'),false);assert.equal(a.$('#copyBtn').disabled,true);a.dom.window.close();
});
test('dismissed map preserves unresolved input and Convert asks again',()=>{
  const a=app(undefined,true);a.change('#fromSys','wgs84');a.paste('1234 5678');a.$('#aoClose').click();
  assert.equal(a.$('#fromRows .a').value,'1234');assert.equal(a.$('#fromRows .b').value,'5678');
  a.$('#convertBtn').click();assert.ok(a.$('#aoOverlay').classList.contains('open'));assert.equal(a.$('#copyBtn').disabled,true);a.dom.window.close();
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
test('each different local datum receives its own WGS 84 confirmation',()=>{
  const a=app();a.paste('1.352083,103.819836');a.change('#toSys','mgrs');a.$('#datumGlobal').click();
  a.paste('4.9,114.9');assert.ok(a.$('#datumOverlay').classList.contains('open'));assert.match(a.$('#datumMessage').textContent,/Brunei/);assert.equal(a.$('#copyBtn').disabled,true);a.dom.window.close();
});
