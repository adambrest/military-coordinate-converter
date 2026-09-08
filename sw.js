/* MGR Converter — cache-first service worker. Update version.js to force an update. */
importScripts("./version.js");
const CACHE = `mgr-conv-v${self.APP_VERSION}`;
const ASSETS = ["./","./index.html","./version.js","./proj4.js","./map-context.js","./grid-core.js","./map-support.js","./map-picker.js","./map-picker.css","./point-picker.js","./point-picker.css","./vendor/countries.geojson","./vendor/shoalwater.geojson","./vendor/mgrs.js","./vendor/leaflet.js","./vendor/leaflet.css","./vendor/land.geojson","./manifest.webmanifest","./icons/favicon-32.png","./icons/apple-touch-icon.png","./icons/icon-192.png","./icons/icon-512.png"];
self.addEventListener("install", e => e.waitUntil(
  caches.open(CACHE)
    .then(c=>c.addAll(ASSETS.map(path=>new Request(new URL(path,self.location.href),{cache:"reload"}))))
));
self.addEventListener("message", e => { if(e.data && e.data.type === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch", e => {
  const req=e.request; if(req.method!=="GET") return;
  const url=new URL(req.url); if(url.origin!==self.location.origin) return;
  if(url.searchParams.has("connectivity")){ e.respondWith(fetch(req,{cache:"no-store"})); return; }
  if(req.mode==="navigate"){
    e.respondWith(fetch(req,{cache:"no-store"}).then(res=>{ if(res&&res.ok){ const c=res.clone(); caches.open(CACHE).then(x=>x.put(req,c)); } return res; }).catch(()=>caches.match(req).then(hit=>hit||caches.match("./index.html"))));
    return;
  }
  e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{ if(res&&res.ok&&res.type==="basic"){ const c=res.clone(); caches.open(CACHE).then(x=>x.put(req,c)); } return res; }).catch(()=>caches.match("./index.html"))));
});
