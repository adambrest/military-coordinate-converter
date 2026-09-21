const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('a waiting release cannot mix new HTML with installed scripts',async()=>{
 const base='https://example.test/app/',handlers={},stores=new Map();let network=0;
 const cache=name=>{if(!stores.has(name))stores.set(name,new Map());const data=stores.get(name);return {
  match:async req=>data.get(new URL(req.url||String(req),base).href)?.clone(),
  put:async(req,res)=>data.set(new URL(req.url||String(req),base).href,res)
 };};
 const current=cache('mgr-conv-vold');
 await current.put(base+'index.html',new Response('old HTML'));
 await current.put(base+'field-map.js',new Response('old script'));
 await cache('mgr-conv-vnew').put(base+'index.html',new Response('new HTML'));
 const context=vm.createContext({URL,Request,importScripts(){},
  self:{APP_VERSION:'old',location:{href:base+'sw.js',origin:'https://example.test'},addEventListener:(name,fn)=>handlers[name]=fn},
  caches:{open:async name=>cache(name),match:async req=>current.match(req)},
  fetch:async()=>{network++;return new Response('new network HTML');}
 });
 vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../sw.js'),'utf8'),context);
 async function get(path,mode){let result;handlers.fetch({request:{url:base+path,method:'GET',mode},respondWith:p=>result=p});return (await result).text();}
 assert.equal(await get('index.html','navigate'),'old HTML');
 assert.equal(await get('?launch=home','navigate'),'old HTML');
 assert.equal(await get('field-map.js','cors'),'old script');
 assert.equal(network,0,'the installed shell stays consistent until activation');
 assert.equal(await get('version.js?connectivity=1','cors'),'new network HTML');
 assert.equal(network,1,'connectivity still reaches the network');
});
