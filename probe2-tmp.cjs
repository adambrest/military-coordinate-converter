const fs=require('fs'),path=require('path'),{JSDOM}=require('jsdom');
const read=f=>fs.readFileSync(path.join(__dirname,f),'utf8');
const html=read('index.html');
const inline=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
function app(){
  const dom=new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g,''),{url:'https://example.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  for(const f of ['version.js','proj4.js','vendor/mgrs.js','grid-core.js','map-context.js','map-support.js'])w.eval(read(f));
  w.createAOPicker=o=>{w.hooks=o;return{open:()=>{w.opened=(w.opened||0)+1;}}};
  w.createPointPicker=o=>({open:()=>{}});
  w.fetch=async()=>({ok:true,text:async()=>read('version.js'),json:async()=>({})});
  w.eval(inline);
  const $=s=>w.document.querySelector(s);
  return {w,$,dom,
    type:(t,sel='.a')=>{const c=$('#fromRows').children[0].querySelector(sel);c.value=t;c.dispatchEvent(new w.Event('input',{bubbles:true}));},
    change:(id,v)=>{$(id).value=v;$(id).dispatchEvent(new w.Event('change',{bubbles:true}));},
    st:()=>JSON.parse(w.localStorage.getItem('mgrconv-v1')||'{}')};
}
const show=(label,a)=>{const s=a.st();console.log(label.padEnd(46),'from='+String(s.from).padEnd(7),'to='+String(s.to).padEnd(9),'explicitOutput='+s.explicitOutput);};

let a=app();
a.change('#fromSys','wgs84');a.type('1.383700');a.type('103.981790','.b');a.$('#convertBtn').click();
show('TYPED Singapore pair (from=wgs84)',a);a.dom.window.close();

a=app();
a.change('#fromSys','wgs84');a.change('#toSys','wgs84');
a.type('1.383700');a.type('103.981790','.b');a.$('#convertBtn').click();
show('TYPED after explicitly choosing Coordinates out',a);a.dom.window.close();

a=app();
a.change('#fromSys','wgs84');a.change('#toSys','thailand');a.change('#toSys','wgs84');
a.type('1.383700');a.type('103.981790','.b');a.$('#convertBtn').click();
show('TYPED after toggling output away and back',a);a.dom.window.close();

a=app();
a.change('#fromSys','wgs84');
const e=new a.w.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(e,'clipboardData',{value:{getData:()=>'1.383700, 103.981790'}});
a.$('#fromRows').children[0].querySelector('.a').dispatchEvent(e);
a.$('#convertBtn').click();
show('PASTED Singapore pair (from=wgs84)',a);a.dom.window.close();
