/* MGR Converter — cache-first service worker. Bump CACHE to force an update. */
const CACHE = "mgr-conv-v6";
const ASSETS = ["./","./index.html","./proj4.js","./manifest.webmanifest","./icon-192.png","./icon-512.png"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch", e => {
  const req=e.request; if(req.method!=="GET") return;
  const url=new URL(req.url); if(url.origin!==self.location.origin) return;
  e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{ if(res&&res.ok&&res.type==="basic"){ const c=res.clone(); caches.open(CACHE).then(x=>x.put(req,c)); } return res; }).catch(()=>caches.match("./index.html"))));
});
