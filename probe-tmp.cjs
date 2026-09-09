const fs=require('fs'),path=require('path'),{JSDOM}=require('jsdom');
const read=f=>fs.readFileSync(path.join(__dirname,f),'utf8');
const html=read('index.html');
const inline=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
function app(){
  const dom=new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g,''),{url:'https://example.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  for(const f of ['version.js','proj4.js','vendor/mgrs.js','grid-core.js','map-context.js','map-support.js'])w.eval(read(f));
  w.createAOPicker=o=>{w.hooks=o;return{open:x=>{w.opened=(w.opened||0)+1;}}};
  w.createPointPicker=o=>({open:()=>{}});
  w.fetch=async()=>({ok:true,text:async()=>read('version.js'),json:async()=>({})});
  w.eval(inline);
  const $=s=>w.document.querySelector(s);
  return {w,$,dom,
    paste:t=>{const e=new w.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(e,'clipboardData',{value:{getData:()=>t}});$('#fromRows').children[0].querySelector('.a').dispatchEvent(e);},
    change:(id,v)=>{$(id).value=v;$(id).dispatchEvent(new w.Event('change',{bubbles:true}));}};
}
for(const [label,from,text] of [
  ['Singapore pair, from=wgs84','wgs84','1.383700, 103.981790'],
  ['Singapore pair, from=auto','auto','1.383700, 103.981790'],
  ['Thailand pair,  from=wgs84','wgs84','14.00287, 99.24459'],
  ['Brunei pair,    from=wgs84','wgs84','4.65, 114.75'],
  ['mid-ocean pair, from=wgs84','wgs84','0.0, 0.0'],
]){
  const a=app();
  if(from!=='auto')a.change('#fromSys',from);
  a.paste(text);
  a.$('#convertBtn').click();
  const st=JSON.parse(a.w.localStorage.getItem('mgrconv-v1')||'{}');
  console.log(label.padEnd(28),'from='+String(st.from).padEnd(7),'to='+String(st.to).padEnd(10),'explicitOutput='+st.explicitOutput,'out='+JSON.stringify(a.$('#toRows').textContent.trim().slice(0,34)));
  a.dom.window.close();
}
