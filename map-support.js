/* Shared map presentation and offline regional context. */
(function(root){
  const regions=[
    {id:'sg',name:'Singapore',lat:1.35,lon:103.82,zoom:11},
    {id:'thailand',name:'Thailand · Sai Yok',lat:14.00287,lon:99.24459,zoom:9},
    {id:'taiwan',name:'Taiwan',lat:23.7,lon:120.95,zoom:8},
    {id:'australia',name:'Australia · Shoalwater Bay',lat:-22.65,lon:150.35,zoom:9},
    {id:'brunei',name:'Brunei',lat:4.65,lon:114.75,zoom:9}
  ];
  const TIMEZONE_VIEWS={
    'Asia/Singapore':[1.35,103.82], 'Asia/Kuala_Lumpur':[3.14,101.69],
    'Asia/Kuching':[1.55,110.34], 'Asia/Brunei':[4.90,114.94],
    'Asia/Bangkok':[13.76,100.50], 'Asia/Taipei':[25.03,121.56],
    'Asia/Hong_Kong':[22.32,114.17], 'Asia/Tokyo':[35.68,139.69],
    'Australia/Brisbane':[-27.47,153.03], 'Australia/Sydney':[-33.87,151.21],
    'Australia/Melbourne':[-37.81,144.96], 'Australia/Perth':[-31.95,115.86],
    'Europe/London':[51.51,-0.13], 'America/New_York':[40.71,-74.01],
    'America/Los_Angeles':[34.05,-118.24]
  };
  function baseView(timezone=Intl.DateTimeFormat().resolvedOptions().timeZone){
    const point=TIMEZONE_VIEWS[timezone];
    return point?{lat:point[0],lon:point[1],zoom:10}:{lat:20,lon:0,zoom:2};
  }
  function approximateLocation(options){
    const key='map-base-location-v1';
    const helper=(options&&options.helper)||'';
    let deviceZone='';
    let guess={lat:20,lon:0,zoom:2};
    try{
      deviceZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
      guess=baseView(deviceZone);
    }catch(_){}
    const settled=p=>({current:()=>p,ready:Promise.resolve(p)});
    const valid=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=85&&Math.abs(p.lon)<=180;
    try{const saved=JSON.parse(sessionStorage.getItem(key));if(valid(saved)&&Date.now()-saved.time<21600000)return settled(saved);}catch(_){}
    // The IP answer is the accurate one and is preferred whenever it arrives; the
    // timezone view stands in meanwhile so the map never waits on the network.
    if(typeof fetch!=='function'||globalThis.navigator?.onLine===false)return settled(guess);
    // Our own endpoint when there is one: it answers from the nearest edge rather
    // than across the world, and asking it means no third party is told anything.
    const source=helper
      ?{url:helper.replace(/\/$/,'')+'/where',read:d=>({lat:d.lat,lon:d.lon,zone:d.timezone})}
      :{url:'https://ipapi.co/json/',read:d=>({lat:d.latitude,lon:d.longitude,zone:d.timezone})};
    // Only coarse coordinates are retained. No IP address or fingerprint is stored.
    const ready=Promise.resolve().then(()=>{
      const controller=typeof AbortController==='function'?new AbortController():null;
      // The timer is always cleared so a pending lookup cannot hold the page open.
      const timer=controller?setTimeout(()=>controller.abort(),2000):0;
      const options2={credentials:'omit',referrerPolicy:'no-referrer'};
      if(controller)options2.signal=controller.signal;
      return fetch(source.url,options2).finally(()=>clearTimeout(timer));
    })
      .then(r=>{if(!r.ok)throw Error();return r.json();})
      .then(data=>{const answer=source.read(data)||{};const p={lat:answer.lat,lon:answer.lon};if(!valid(p))return guess;
        // An address says where the network leaves the internet, which on a mobile
        // carrier can be another country entirely; the device clock says where its
        // owner believes they are. When the two disagree the clock is the safer of
        // the pair, so the map stays put rather than jumping abroad.
        if(answer.zone&&deviceZone&&answer.zone!==deviceZone)return guess;
        guess={lat:Math.round(p.lat*100)/100,lon:Math.round(p.lon*100)/100,zoom:10,time:Date.now()};
        try{sessionStorage.setItem(key,JSON.stringify(guess));}catch(_){}return guess;
      }).catch(()=>guess);
    return {current:()=>guess,ready};
  }
  // Tiles covering a small box around a point, at the zooms the pickers open on.
  function tileUrls(lat,lon,zooms,radius){
    const urls=[];
    for(const z of zooms){
      const count=2**z;
      const cx=Math.floor((longitude(lon)+180)/360*count);
      const radians=Math.max(-85,Math.min(85,lat))*Math.PI/180;
      const cy=Math.floor((1-Math.asinh(Math.tan(radians))/Math.PI)/2*count);
      for(let dx=-radius;dx<=radius;dx++)for(let dy=-radius;dy<=radius;dy++){
        const x=((cx+dx)%count+count)%count,y=cy+dy;
        if(y<0||y>=count)continue;
        urls.push('https://tile.openstreetmap.org/'+z+'/'+x+'/'+y+'.png');
        urls.push(imageryService+'/tile/'+z+'/'+y+'/'+x);
      }
    }
    return urls;
  }
  // Warms the service worker tile cache so the pickers open on ready imagery.
  // Metered and very slow connections are left alone.
  async function prefetchTiles(point,options){
    const {zooms=[9,11,13],radius=1,concurrency=4,request=globalThis.fetch}=options||{};
    if(typeof request!=='function'||!point)return 0;
    const connection=globalThis.navigator?.connection;
    // Only a fast link warms the cache: on 3G the reader's own requests need the bandwidth.
    if(connection?.saveData||/(^|-)[23]g$/.test(connection?.effectiveType||''))return 0;
    const urls=tileUrls(point.lat,point.lon,zooms,radius);
    let index=0,stored=0;
    const worker=async()=>{
      while(index<urls.length){
        const url=urls[index++];
        try{await request(url,{mode:'no-cors',credentials:'omit'});stored++;}catch(_){}
      }
    };
    await Promise.all(Array.from({length:Math.min(concurrency,urls.length)},worker));
    return stored;
  }
  function marker(map,p,onClick){
    const label=document.createElement('span');label.textContent=p.name||'Point '+p.number;
    const pin=L.circleMarker([p.lat,p.lon],{radius:6,color:'#fff',weight:1.5,fillColor:'#2563eb',fillOpacity:1,interactive:!!onClick})
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
  function navigation(map,select,onRegion,{snap=true}={}){
    select.replaceChildren(new Option('Jump to…',''),...regions.map(r=>new Option(r.name,r.id)));
    const snapped=new Set();let dragged=false;
    select.addEventListener('change',()=>{const r=regions.find(r=>r.id===select.value);if(r){snapped.add(r.id);onRegion?.(r);map.setView([r.lat,r.lon],r.zoom,{animate:false,reset:true});}select.value='';});
    // Only a completed human drag at country scale can snap, once per region.
    // A second drag always wins; programmatic moves and close zoom never snap.
    map.on('dragstart',()=>{map.stop();dragged=true;});
    map.on('zoomstart',()=>{dragged=false;});
    map.on('moveend',()=>{
      if(!dragged)return;dragged=false;if(!snap)return;if(select.hidden)return;
      const z=map.getZoom();if(z<4||z>8)return;
      const center=map.latLngToContainerPoint(map.getCenter());
      const r=regions.filter(r=>!snapped.has(r.id)).map(r=>({r,d:map.latLngToContainerPoint([r.lat,r.lon]).distanceTo(center)})).sort((a,b)=>a.d-b.d)[0];
      if(r&&r.d<55){snapped.add(r.r.id);map.setView([r.r.lat,r.r.lon],z,{animate:false,reset:true});}
    });
  }
  // Leaflet's maxBounds keeps the whole viewport inside the box, so a zoomed-in
  // crosshair stops well short of a country's edge. Expanding the box by half a
  // screen in every direction limits the map center - the crosshair - instead.
  const LAT_EDGE=85.0511287798;
  // A lon span wide enough that worldCopyJump still slides freely across copies.
  const latitudeOnly=()=>L.latLngBounds(L.latLng(-LAT_EDGE,-1080),L.latLng(LAT_EDGE,1080));
  function clampLatitude(map){map.setMaxBounds(latitudeOnly());map.options.maxBoundsViscosity=1;}
  function limitCenter(map){
    let box=null,applied=null;
    const apply=()=>{
      // Re-applying bounds can nudge the view, which fires the events that brought us
      // here, so the latitude clamp is set once and left alone until a box replaces it.
      if(!box){if(applied!=="lat"){applied="lat";map.setMaxBounds(latitudeOnly());}return;}
      const zoom=map.getZoom(),half=map.getSize().divideBy(2);
      const sw=map.project(box.getSouthWest(),zoom).add([-half.x,half.y]);
      const ne=map.project(box.getNorthEast(),zoom).add([half.x,-half.y]);
      const limit=L.latLngBounds(map.unproject(sw,zoom),map.unproject(ne,zoom));
      if(applied&&applied!=="lat"&&applied.equals(limit,1e-9))return;
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
  // Safari can label touch-generated clicks as mouse clicks, so detect taps
  // from touch events directly. Mouse double-click stays a separate path.
  function pointGestures(map,{onTap}={}){
    let first=null,active=null,lastTouch=0;
    const container=map.getContainer(),reset=()=>{first=null;active=null;};
    let rollback=null,clickTime=0,clickPoint=null;
    const queue=[];let zooming=false;
    function drain(){
      if(zooming||!queue.length)return;
      const {point,delta}=queue.shift(),target=Math.max(map.getMinZoom(),Math.min(map.getMaxZoom(),map.getZoom()+delta));
      if(target===map.getZoom()){drain();return;}
      zooming=true;
      map.once('zoomend',()=>{zooming=false;requestAnimationFrame(drain);});
      map.setZoomAround(point,target,{animate:!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches});
    }
    function zoom(point,delta){
      // The first tap is immediate; a second tap retracts that provisional point.
      if(rollback&&Date.now()-clickTime<500){rollback();rollback=null;}
      queue.push({point,delta});drain();
    }
    map.on('click',e=>{
      if(!onTap||e.originalEvent?.detail>1)return;
      const now=Date.now();
      if(clickPoint&&now-clickTime<400&&e.containerPoint.distanceTo(clickPoint)<35)return;
      clickTime=now;clickPoint=e.containerPoint;rollback=onTap(e.latlng)||null;
    });
    map.doubleClickZoom.disable();
    map.on('dblclick',e=>{if(Date.now()-lastTouch<700)return;zoom(e.containerPoint,e.originalEvent?.shiftKey?-1:1);});
    container.addEventListener('touchstart',e=>{
      lastTouch=Date.now();
      if(e.touches.length!==1){reset();return;}
      const t=e.touches[0];active={id:t.identifier,x:t.clientX,y:t.clientY,time:lastTouch};
    },{passive:true});
    container.addEventListener('touchmove',e=>{
      if(!active)return;
      const t=[...e.touches].find(t=>t.identifier===active.id);
      if(e.touches.length!==1||!t||Math.hypot(t.clientX-active.x,t.clientY-active.y)>12)reset();
    },{passive:true});
    container.addEventListener('touchend',e=>{
      lastTouch=Date.now();const start=active;active=null;
      if(!start||e.touches.length||lastTouch-start.time>300){first=null;return;}
      const t=[...e.changedTouches].find(t=>t.identifier===start.id);
      if(!t||Math.hypot(t.clientX-start.x,t.clientY-start.y)>12){first=null;return;}
      if(first&&lastTouch-first.time<=400&&Math.hypot(t.clientX-first.x,t.clientY-first.y)<=35){
        first=null;e.preventDefault();zoom(map.mouseEventToContainerPoint(t),1);
      }else first={x:t.clientX,y:t.clientY,time:lastTouch};
    },{passive:false});
    container.addEventListener('touchcancel',reset,{passive:true});
    map.on('dragstart zoomstart',reset);
    return ()=>{reset();rollback=null;queue.length=0;};
  }
  function pointTarget(map,{tapMode,onChange}){
    let mouse=null,last=null;
    const coarse=()=>root.matchMedia?.('(pointer: coarse)').matches;
    const point=p=>({lat:p.lat,lon:longitude(p.lng??p.lon)});
    const current=()=>tapMode()?(mouse&&!coarse()?point(map.containerPointToLatLng(mouse)):last||point(map.getCenter())):point(map.getCenter());
    const update=()=>onChange?.(current());
    map.on('mousemove',e=>{if(!coarse()){mouse=e.containerPoint;if(tapMode())update();}});
    map.on('mouseout',()=>{mouse=null;update();});
    map.on('move',update);
    return {current,update,clicked(p){last=point(p);update();}};
  }
  const imageryService='https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer';
  const tileAvailability=new Map();
  async function imageryZoom(lat,lon,width,height,request=fetch){
    // Check every tile needed by the viewport at each candidate detail level.
    // Requests cannot cross Esri's 128-tile bundle boundaries.
    for(let z=19;z>=1;z--){
      const count=2**z,x=(longitude(lon)+180)/360*count;
      const radians=Math.max(-85,Math.min(85,lat))*Math.PI/180;
      const y=(1-Math.asinh(Math.tan(radians))/Math.PI)/2*count;
      const left=Math.floor(x-width/512),right=Math.floor(x+width/512);
      const top=Math.max(0,Math.floor(y-height/512)),bottom=Math.min(count-1,Math.floor(y+height/512));
      const checks=[];
      for(let row=top;row<=bottom;){
        const h=Math.min(bottom-row+1,128-row%128);
        for(let col=left;col<=right;){
          const wrapped=((col%count)+count)%count,w=Math.min(right-col+1,128-wrapped%128,count-wrapped);
          const url=imageryService+'/tilemap/'+z+'/'+row+'/'+wrapped+'/'+w+'/'+h+'?f=json';
          if(!tileAvailability.has(url)){
            const promise=request(url).then(r=>{if(!r.ok&&r.status!==422)throw Error('Coverage unavailable');return r.json();}).then(data=>{
              if(data.error?.code===422)return false;
              if(!Array.isArray(data.data)||data.data.length!==w*h)throw Error('Incomplete imagery coverage');
              return data.data.every(value=>value===1);
            }).catch(error=>{tileAvailability.delete(url);throw error;});
            tileAvailability.set(url,promise);
            if(tileAvailability.size>256)tileAvailability.delete(tileAvailability.keys().next().value);
          }
          checks.push(tileAvailability.get(url));col+=w;
        }
        row+=h;
      }
      if((await Promise.all(checks)).every(Boolean))return z;
    }
    return 1;
  }
  function trainingArea(map){
    map.createPane('trainingArea').style.zIndex='300';
    const area=L.geoJSON(null,{pane:'trainingArea',interactive:false,style:{color:'#64748b',weight:1.5,dashArray:'6 5',fill:false}});
    const update=()=>{if(map.getZoom()>=6){if(!map.hasLayer(area))area.addTo(map);}else if(map.hasLayer(area))map.removeLayer(area);};
    fetch('vendor/shoalwater.geojson').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{area.addData(data);update();}).catch(()=>{});
    map.on('zoomend',update);
    map.attributionControl.addAttribution('© <a href="https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Location/Places/FeatureServer/17">State of Queensland</a>');
  }
  // Shared basemaps, so every map surface agrees on url, zoom ceiling and credit.
  // Street avoids the dense building hatching of the optional topo layer.
  // OpenTopoMap stops at zoom 17; enlarge its tiles beyond that ceiling.
  const BASEMAPS={
    topo:{label:"Topo",url:"https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",subdomains:"abc",maxNativeZoom:17,className:"topo-muted",
      attribution:'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Rendering: &copy; <a href="https://opentopomap.org/">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'},
    street:{label:"Street",url:"https://tile.openstreetmap.org/{z}/{x}/{y}.png",maxNativeZoom:19,
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'},
    satellite:{label:"Satellite",url:imageryService+"/tile/{z}/{y}/{x}",maxNativeZoom:17,
      attribution:'Imagery &copy; <a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9">Esri, Vantor, Earthstar Geographics, GIS User Community</a>'}
  };
  const DEFAULT_BASEMAP="street";
  const basemapIds=Object.keys(BASEMAPS);
  // An unknown or dropped id falls back to the default rather than leaving a blank map.
  function basemapId(value){return BASEMAPS[value]?value:DEFAULT_BASEMAP;}
  function basemap(id,options){
    const spec=BASEMAPS[basemapId(id)];
    const settings={maxNativeZoom:spec.maxNativeZoom,attribution:spec.attribution,...options};
    if(spec.subdomains)settings.subdomains=spec.subdomains;
    if(spec.className)settings.className=[spec.className,options&&options.className].filter(Boolean).join(" ");
    return L.tileLayer(spec.url,settings);
  }
  // A button that asks the device where it is and goes there. The opening view still
  // uses the coarse IP/timezone estimate, so the permission prompt only ever appears
  // because someone pressed this - it is never asked for on load.
  const LOCATE_MESSAGES={
    1:"Location permission is off for this site. Turn it on to jump to where you are.",
    2:"Your location is unavailable right now. Try again in the open, or move the map yourself.",
    3:"Finding your location took too long. Try again, or move the map yourself."
  };
  // One shape for every small control that sits with the zoom buttons.
  function mapButton(map,{position="bottomright",title,label,icon,className="",onClick}){
    let button;
    const control=L.control({position});
    control.onAdd=function(){
      const box=L.DomUtil.create("div","leaflet-bar map-button "+className);
      button=L.DomUtil.create("a","",box);
      button.href="#";button.title=title;
      button.setAttribute("role","button");button.setAttribute("aria-label",label||title);
      button.innerHTML=icon;
      L.DomEvent.disableClickPropagation(box);
      L.DomEvent.on(button,"click",e=>{L.DomEvent.stop(e);onClick();});
      return box;
    };
    control.addTo(map);
    return {node:()=>button,busy(on){button&&button.classList.toggle("busy",!!on);},
            disable(off){button&&button.classList.toggle("off",!!off);}};
  }
  // Zooms to hold everything that has been collected, however far apart it is.
  function autoZoom(map,getPoints,{position="bottomright",maxZoom=16}={}){
    const button=mapButton(map,{position,className:"map-autozoom",title:"Auto-Zoom to the points",
      label:"Auto-Zoom to the points",
      icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9V4h5M21 9V4h-5M3 15v5h5M21 15v5h-5"/><circle cx="12" cy="12" r="2.4"/></svg>',
      onClick(){
        const points=(getPoints()||[]).filter(p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon));
        if(!points.length)return;
        map.fitBounds(L.latLngBounds(points.map(p=>[p.lat,p.lon])),
          {padding:[35,35],maxZoom:Math.min(maxZoom,map.getMaxZoom()),animate:false});
      }});
    const sync=()=>button.disable(!((getPoints()||[]).length));
    sync();return {sync,go:()=>button.node()&&button.node().click()};
  }
  function locate(map,{position="bottomright",onStatus,maxZoom=16}={}){
    let layer,busy=false;
    const say=text=>{try{onStatus&&onStatus(text);}catch(_){}};
    const button=mapButton(map,{position,className:"map-locate",title:"Go to my location",
      label:"Go to my location",
      icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3 3 10.53v.98l6.84 2.65L12.48 21h.98L21 3z"/></svg>',
      onClick(){go();}});
    function go(){
      if(busy)return;
      if(!(globalThis.navigator&&navigator.geolocation)){say("This device cannot report a location.");return;}
      busy=true;button.busy(true);say("Finding your location…");
      navigator.geolocation.getCurrentPosition(p=>{
        busy=false;button.busy(false);
        const lat=p.coords.latitude,lon=p.coords.longitude;
        if(!Number.isFinite(lat)||!Number.isFinite(lon)){say(LOCATE_MESSAGES[2]);return;}
        if(layer)layer.remove();
        layer=L.layerGroup([
          L.circle([lat,lon],{radius:Math.max(p.coords.accuracy||0,10),color:"#1a73e8",weight:1,opacity:.35,fillColor:"#1a73e8",fillOpacity:.12,interactive:false}),
          L.circleMarker([lat,lon],{radius:6,color:"#fff",weight:3,fillColor:"#1a73e8",fillOpacity:1,interactive:false})
        ]).addTo(map);
        map.setView([lat,lon],Math.min(maxZoom,map.getMaxZoom()),{animate:false});
        say("");
      },error=>{
        busy=false;button.busy(false);
        say(LOCATE_MESSAGES[error&&error.code]||LOCATE_MESSAGES[2]);
      },{enableHighAccuracy:true,timeout:10000,maximumAge:30000});
    }
    return {go,clear(){if(layer){layer.remove();layer=null;}}};
  }
  // Far enough out, a street map is a whole country's worth of roads and names on a
  // screen where none of it can be acted on. The bundled outlines say where you are
  // with none of the clutter and ask nothing of the network. Cool greys and a soft
  // water blue keep it readable without competing with the points drawn on top.
  const BROAD = {
    water:"#d9e2e8", land:"#eceeec", border:"#9fb0bb", coast:"#8da0ad", label:"#4c5a64"
  };
  let countryData=null,countryLoad=null;
  function countryShapes(){
    if(!countryLoad)countryLoad=fetch("vendor/countries.geojson")
      .then(r=>{if(!r.ok)throw Error();return r.json();})
      .then(data=>(countryData=data)).catch(()=>null);
    return countryLoad;
  }
  function broadView(map,{pane="broadLand"}={}){
    const land=L.geoJSON(null,{pane,interactive:false,
      style:{color:BROAD.border,weight:.7,fillColor:BROAD.land,fillOpacity:1}});
    const names=L.layerGroup();
    let drawnFor="",want={land:false,names:false};
    function paint(){
      if(!countryData)return;
      const copies=worlds(map),key=copies.join(",");
      if(drawnFor!==key){
        land.clearLayers();
        for(const offset of copies)land.addData(repeatGeometry(countryData,offset));
        drawnFor=key;
      }
      names.clearLayers();
      if(!want.names)return;
      const zoom=map.getZoom(),bounds=map.getBounds();
      for(const feature of countryData.features){
        const p=feature.properties||{};
        if(!Number.isFinite(p.LABEL_X)||!Number.isFinite(p.LABEL_Y))continue;
        if(zoom<(p.MIN_LABEL||0))continue;
        for(const offset of copies){
          if(!bounds.contains([p.LABEL_Y,p.LABEL_X+offset]))continue;
          const text=document.createElement("span");text.textContent=p.NAME;
          L.marker([p.LABEL_Y,p.LABEL_X+offset],{interactive:false,keyboard:false,
            icon:L.divIcon({className:"broad-name",html:text.outerHTML,iconSize:[120,20],iconAnchor:[60,10]})}).addTo(names);
        }
      }
    }
    function apply(){
      const on=(layer,yes)=>{if(yes&&!map.hasLayer(layer))layer.addTo(map);else if(!yes&&map.hasLayer(layer))layer.remove();};
      on(land,want.land&&!!countryData);
      on(names,want.names&&!!countryData);
      if(want.land||want.names)paint();
    }
    map.on("zoomend moveend",apply);
    return {
      // The caller decides how much of the world to fall back to at each zoom.
      show(next){
        want=next;
        if(!countryData&&(next.land||next.names))countryShapes().then(apply);
        else apply();
      },
      colors:BROAD
    };
  }
  root.MapSupport={regions,baseView,approximateLocation,tileUrls,prefetchTiles,marker,context,navigation,limitCenter,longitude,worlds,repeatGeometry,squareZoom,pointGestures,pointTarget,imageryZoom,imageryService,trainingArea,BASEMAPS,DEFAULT_BASEMAP,basemapIds,basemapId,basemap,locate,mapButton,autoZoom,clampLatitude,broadView,BROAD_COLORS:BROAD};
})(globalThis);
