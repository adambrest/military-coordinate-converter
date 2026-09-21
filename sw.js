/* MGR Converter — cache-first service worker. Update version.js to force an update. */
importScripts("./version.js");
const CACHE = `mgr-conv-v${self.APP_VERSION}`;
// Map tiles outlive any one app version, so they keep their own cache.
const TILE_CACHE = "mgr-tiles-v1";
const TILE_HOSTS = ["tile.openstreetmap.org","services.arcgisonline.com"];
// OpenTopoMap answers from a, b and c subdomains, so match its domain rather
// than listing each host and missing whichever one a tile happens to come from.
const TILE_DOMAINS = ["tile.opentopomap.org"];
const isTileHost = host => TILE_HOSTS.includes(host) || TILE_DOMAINS.some(d => host === d || host.endsWith("." + d));
const TILE_LIMIT = 1400;
const ASSETS = ["./","./index.html","./route-tools.js","./field-map.js","./field-map.css","./version.js","./proj4.js","./map-context.js","./grid-core.js","./map-support.js","./map-picker.js","./map-picker.css","./point-picker.js","./point-picker.css","./vendor/countries.geojson","./vendor/shoalwater.geojson","./vendor/mgrs.js","./vendor/leaflet.js","./vendor/leaflet.css","./vendor/land.geojson","./manifest.webmanifest","./icons/favicon-32.png","./icons/logo-64.png"];
self.addEventListener("install", e => e.waitUntil(
  caches.open(CACHE)
    .then(c=>c.addAll(ASSETS.map(path=>new Request(new URL(path,self.location.href),{cache:"reload"}))))
));
self.addEventListener("message", e => { if(e.data && e.data.type === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE&&k!==TILE_CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
async function tile(req){
  const cache = await caches.open(TILE_CACHE);
  const hit = await cache.match(req);
  if(hit) return hit;
  const res = await fetch(req);
  // A cross-origin tile can only ever answer opaquely, which is still storable.
  if(res && (res.ok || res.type==="opaque")) await cache.put(req,res.clone()).then(()=>trimTiles(cache)).catch(()=>{});
  return res;
}
// Oldest-first eviction: Cache.keys() preserves insertion order.
async function trimTiles(cache){
  const keys = await cache.keys();
  if(keys.length<=TILE_LIMIT) return;
  for(const key of keys.slice(0,keys.length-TILE_LIMIT)) await cache.delete(key);
}
self.addEventListener("fetch", e => {
  const req=e.request; if(req.method!=="GET") return;
  const url=new URL(req.url);
  // A reachability probe must never be answered from a cache, wherever it is
  // addressed, or it reports the network is up while the device is in a tunnel.
  if(url.searchParams.has("connectivity")){ e.respondWith(fetch(req,{cache:"no-store"})); return; }
  if(url.origin!==self.location.origin){ if(isTileHost(url.hostname)) e.respondWith(tile(req)); return; }
  // HTML and scripts must come from the same installed release. Fetching fresh
  // HTML here pairs it with old cached scripts while the update waits for approval.
  e.respondWith(caches.open(CACHE).then(async cache=>{
    const hit=await cache.match(req);
    if(hit)return hit;
    if(req.mode==="navigate"){
      const shell=await cache.match(new URL("./index.html",self.location.href));
      if(shell)return shell;
    }
    return fetch(req);
  }));
});
