/* Shared map presentation and offline regional context. */
(function(root){
  const regions=[
    {id:'sg',name:'Singapore',lat:1.35,lon:103.82,zoom:11},
    {id:'thailand',name:'Thailand · Sai Yok',lat:14.00287,lon:99.24459,zoom:9},
    {id:'taiwan',name:'Taiwan',lat:23.7,lon:120.95,zoom:8},
    {id:'australia',name:'Australia · Shoalwater Bay',lat:-22.65,lon:150.35,zoom:9},
    {id:'brunei',name:'Brunei',lat:4.65,lon:114.75,zoom:9}
  ];
  function marker(map,p,onClick){
    const label=document.createElement('span');label.textContent=p.name||'Point '+p.number;
    return L.circleMarker([p.lat,p.lon],{radius:6,color:'#fff',weight:1.5,fillColor:'#2563eb',fillOpacity:1})
      .bindTooltip(label,{permanent:true,direction:'top',offset:[0,-5],className:'map-point-label chosen-point-label'})
      .on('click',e=>{L.DomEvent.stopPropagation(e);onClick?.(p);});
  }
  function context(map,onClick){
    const land=L.layerGroup().addTo(map),pins=L.layerGroup();
    for(const c of Object.values(root.MAP_CONTEXT||{})){
      for(const poly of c.land||[])L.polygon(poly.map(p=>[p[1],p[0]]),{pane:'offlineLand',color:'#a8bcc2',weight:.6,fillColor:'#f3f3eb',fillOpacity:1,interactive:false}).addTo(land);
      for(const line of c.roads||[])L.polyline(line.map(p=>[p[1],p[0]]),{pane:'offlineLand',color:'#ce8a22',weight:2,interactive:false}).addTo(land);
      for(const p of c.landmarks||[])marker(map,p,onClick).addTo(pins);
    }
    const update=()=>{if(map.getZoom()>=8){if(!map.hasLayer(pins))pins.addTo(map);}else if(map.hasLayer(pins))map.removeLayer(pins);};
    map.on('zoomend',update);return {update};
  }
  function navigation(map,select,onRegion){
    select.replaceChildren(new Option('Go to region…',''),...regions.map(r=>new Option(r.name,r.id)));
    const snapped=new Set();let dragged=false;
    select.addEventListener('change',()=>{const r=regions.find(r=>r.id===select.value);if(r){snapped.add(r.id);onRegion?.(r);map.setView([r.lat,r.lon],r.zoom,{animate:false,reset:true});}select.value='';});
    // Only a completed human drag at country scale can snap, once per region.
    // A second drag always wins; programmatic moves and close zoom never snap.
    map.on('dragstart',()=>{map.stop();dragged=true;});
    map.on('moveend',()=>{
      if(!dragged)return;dragged=false;
      const z=map.getZoom();if(z<4||z>8)return;
      const center=map.latLngToContainerPoint(map.getCenter());
      const r=regions.filter(r=>!snapped.has(r.id)).map(r=>({r,d:map.latLngToContainerPoint([r.lat,r.lon]).distanceTo(center)})).sort((a,b)=>a.d-b.d)[0];
      if(r&&r.d<55){snapped.add(r.r.id);map.setView([r.r.lat,r.r.lon],z,{animate:false,reset:true});}
    });
  }
  root.MapSupport={regions,marker,context,navigation};
})(globalThis);
