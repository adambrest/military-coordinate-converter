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
    const pin=L.circleMarker([p.lat,p.lon],{radius:6,color:'#fff',weight:1.5,fillColor:'#2563eb',fillOpacity:1})
      .bindTooltip(label,{permanent:true,direction:'top',offset:[0,-5],className:'map-point-label chosen-point-label'})
      .on('click',e=>{L.DomEvent.stopPropagation(e);onClick?.(p);});
    const wrap=()=>pin.setLatLng([p.lat,p.lon+360*Math.round((map.getCenter().lng-p.lon)/360)]);
    pin.on('add',()=>{wrap();map.on('moveend',wrap);});pin.on('remove',()=>map.off('moveend',wrap));
    return pin;
  }
  function context(map,onClick){
    const land=L.layerGroup().addTo(map),pins=L.layerGroup();
    for(const c of Object.values(root.MAP_CONTEXT||{})){
      for(const poly of c.land||[])L.polygon(poly.map(p=>[p[1],p[0]]),{pane:'offlineLand',color:'#a8bcc2',weight:.6,fillColor:'#f3f3eb',fillOpacity:1,interactive:false}).addTo(land);
      for(const p of c.landmarks||[])marker(map,p,onClick).addTo(pins);
    }
    const update=()=>{if(map.getZoom()>=8){if(!map.hasLayer(pins))pins.addTo(map);}else if(map.hasLayer(pins))map.removeLayer(pins);};
    map.on('zoomend',update);return {update};
  }
  function navigation(map,select,onRegion){
    select.replaceChildren(new Option('Jump to…',''),...regions.map(r=>new Option(r.name,r.id)));
    const snapped=new Set();let dragged=false;
    select.addEventListener('change',()=>{const r=regions.find(r=>r.id===select.value);if(r){snapped.add(r.id);onRegion?.(r);map.setView([r.lat,r.lon],r.zoom,{animate:false,reset:true});}select.value='';});
    // Only a completed human drag at country scale can snap, once per region.
    // A second drag always wins; programmatic moves and close zoom never snap.
    map.on('dragstart',()=>{map.stop();dragged=true;});
    map.on('zoomstart',()=>{dragged=false;});
    map.on('moveend',()=>{
      if(!dragged)return;dragged=false;if(select.hidden)return;
      const z=map.getZoom();if(z<4||z>8)return;
      const center=map.latLngToContainerPoint(map.getCenter());
      const r=regions.filter(r=>!snapped.has(r.id)).map(r=>({r,d:map.latLngToContainerPoint([r.lat,r.lon]).distanceTo(center)})).sort((a,b)=>a.d-b.d)[0];
      if(r&&r.d<55){snapped.add(r.r.id);map.setView([r.r.lat,r.r.lon],z,{animate:false,reset:true});}
    });
  }
  // Leaflet's maxBounds keeps the whole viewport inside the box, so a zoomed-in
  // crosshair stops well short of a country's edge. Expanding the box by half a
  // screen in every direction limits the map center - the crosshair - instead.
  function limitCenter(map){
    let box=null,applied=null;
    const apply=()=>{
      if(!box){if(map.options.maxBounds){applied=null;map.setMaxBounds(null);}return;}
      const zoom=map.getZoom(),half=map.getSize().divideBy(2);
      const sw=map.project(box.getSouthWest(),zoom).add([-half.x,half.y]);
      const ne=map.project(box.getNorthEast(),zoom).add([half.x,-half.y]);
      const limit=L.latLngBounds(map.unproject(sw,zoom),map.unproject(ne,zoom));
      if(applied&&applied.equals(limit,1e-9))return;
      applied=limit;map.setMaxBounds(limit);
    };
    map.on("zoomend resize",apply);
    return bounds=>{box=bounds?L.latLngBounds(bounds):null;applied=null;apply();return box;};
  }
  function longitude(lon){return ((lon+180)%360+360)%360-180;}
  function worlds(map){const b=map.getBounds();return Array.from({length:Math.ceil((b.getEast()+180)/360)-Math.floor((b.getWest()+180)/360)},(_,i)=>360*(Math.floor((b.getWest()+180)/360)+i));}
  function repeatGeometry(data,offset){
    const coords=v=>typeof v[0]==='number'?[v[0]+offset,...v.slice(1)]:v.map(coords);
    return {type:'FeatureCollection',features:data.features.map(f=>({...f,geometry:{...f.geometry,coordinates:coords(f.geometry.coordinates)}}))};
  }
  function squareZoom(map){
    const size=map.getSize(),pixels=Math.max(80,Math.min(size.x,size.y)-40),latitude=Math.min(80,Math.abs(map.getCenter().lat));
    return Math.max(3,Math.min(10,Math.floor(Math.log2(pixels*156543.03392*Math.cos(latitude*Math.PI/180)/140000))));
  }
  // Let the first tap settle before panning. A double tap instead zooms around
  // its actual screen position, without the first click changing that position.
  function pointGestures(map){
    let click;
    map.doubleClickZoom.disable();
    map.on('click',e=>{clearTimeout(click);click=setTimeout(()=>map.panTo(e.latlng,{animate:false}),300);});
    map.on('dblclick',e=>{clearTimeout(click);map.setZoomAround(e.containerPoint,map.getZoom()+(e.originalEvent?.shiftKey?-1:1));});
    map.on('dragstart zoomstart',()=>clearTimeout(click));
    return ()=>clearTimeout(click);
  }
  function trainingArea(map){
    map.createPane('trainingArea').style.zIndex='300';
    const area=L.geoJSON(null,{pane:'trainingArea',interactive:false,style:{color:'#64748b',weight:1.5,dashArray:'6 5',fill:false}});
    const update=()=>{if(map.getZoom()>=6){if(!map.hasLayer(area))area.addTo(map);}else if(map.hasLayer(area))map.removeLayer(area);};
    fetch('vendor/shoalwater.geojson').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{area.addData(data);update();}).catch(()=>{});
    map.on('zoomend',update);
    map.attributionControl.addAttribution('© <a href="https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Location/Places/FeatureServer/17">State of Queensland</a>');
  }
  root.MapSupport={regions,marker,context,navigation,limitCenter,longitude,worlds,repeatGeometry,squareZoom,pointGestures,trainingArea};
})(globalThis);
