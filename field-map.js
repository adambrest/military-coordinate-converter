/* Independent map-first point collection. Uses the existing local coordinate engine. */
(function(root){
'use strict';
root.createFieldMap=function({format,projection,presets,onConvert,helper}){
 const $=id=>document.getElementById(id),key='mike-golf-romeo-field-v1';
 let points=[],connected=false,system='mgrs',layer=MapSupport.DEFAULT_BASEMAP,map,markers,route,grid,frame,view,undo=[],bases;
 try{const s=JSON.parse(localStorage.getItem(key));if(s&&Array.isArray(s.points)){points=s.points.filter(RouteTools.valid).slice(0,20000);connected=!!s.connected;system=presets.includes(s.system)?s.system:'mgrs';layer=MapSupport.basemapId(s.layer);view=s.view;}}catch(_){}
 const status=t=>{$('fieldStatus').textContent=t;};
 function save(){try{localStorage.setItem(key,JSON.stringify({points,connected,system,layer,view}));}catch(_){status('Device storage is full. Export your points before closing.');}}
 function remember(){undo.push(JSON.stringify({points,connected}));if(undo.length>30)undo.shift();}
 function coordinate(p){try{return format(p,system);}catch(e){return e.message;}}
 function render(){
  $('fieldFormat').value=system;$('fieldRoute').checked=connected;
  $('fieldTotal').textContent=points.length+' points';
  $('fieldDistance').textContent=connected?RouteTools.summary(points):'Separate points · enable Connect points to measure their ordered route.';
  const list=$('fieldPoints');list.replaceChildren();
  // Large GPX tracks remain complete for calculations/export; bound DOM work.
  points.slice(0,300).forEach((p,i)=>{
   const li=document.createElement('li');li.className='field-point';
   const number=document.createElement('span');number.textContent=i+1;
   const input=document.createElement('input');input.value=p.name||'';input.placeholder='Point '+(i+1);input.setAttribute('aria-label','Point '+(i+1)+' name');input.addEventListener('change',()=>{remember();p.name=input.value;save();draw();});
   const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label','Remove point '+(i+1));remove.onclick=()=>{remember();if(p.breakBefore&&points[i+1])points[i+1].breakBefore=true;points.splice(i,1);refresh();};
   const code=document.createElement('code');code.textContent=coordinate(p);
   li.append(number,input,remove,code);list.append(li);
  });
  if(points.length>300){const li=document.createElement('li');li.textContent=`Showing first 300 of ${points.length} points. All points are included in distance, copy and GPX.`;list.append(li);}
  for(const id of ['fieldCopy','fieldExport','fieldConvert','fieldClear','fieldFit'])$(id).disabled=!points.length;
  $('fieldUndo').disabled=!undo.length;
 }
 function refresh(){render();draw();save();}
 function add(p){if(!RouteTools.valid(p))return;if(points.length>=20000){status('20,000 point limit reached. Export or clear this collection first.');return;}remember();points.push({...p,name:'',breakBefore:points.length===0});refresh();status('Point '+points.length+' added.');}
 function draw(){if(!map)return;markers.clearLayers();route.clearLayers();
  points.forEach((p,i)=>{if(points.length>1000){L.circleMarker([p.lat,p.lon],{radius:2,weight:0,fillOpacity:.8,fillColor:'#2563eb'}).addTo(markers);return;}
   const el=document.createElement('span');el.textContent=p.name||'Point '+(i+1);
   L.marker([p.lat,p.lon],{icon:L.divIcon({className:'field-index',html:String(i+1),iconSize:[24,24],iconAnchor:[12,12]})}).bindTooltip(el).addTo(markers);
  });
  if(connected){let segment=[];const flush=()=>{if(segment.length>1)L.polyline(segment,{color:'#2563eb',weight:3}).addTo(route);segment=[];};for(const p of points){if(p.breakBefore)flush();segment.push([p.lat,p.lon]);}flush();}
 }
 function fit(){if(points.length&&map)map.fitBounds(L.latLngBounds(points.map(p=>[p.lat,p.lon])),{padding:[35,35],maxZoom:16});}
 function drawGrid(){
  if(!map)return;grid.clearLayers();if(!$('fieldGrid').checked)return;
  if(map.getZoom()<11){$('fieldGridNote').textContent='Zoom in for 1 km grid lines.';return;}
  const b=map.getBounds(),center=map.getCenter();
  try{
   const global=system==='mgrs'||system==='wgs84'||system==='globalutm';
   const info=global?GlobalGrid.at(center.lat,MapSupport.longitude(center.lng)):null;
   const proj=info?info.proj:projection(system),clip=info?GlobalGrid.zoneBounds(info.zone,info.band):null;
   if(!info)format({lat:center.lat,lon:MapSupport.longitude(center.lng)},system);
   const size=map.getSize(),sample=[];
   for(let i=0;i<=8;i++)for(const xy of [[size.x*i/8,0],[size.x*i/8,size.y],[0,size.y*i/8],[size.x,size.y*i/8]]){const p=map.containerPointToLatLng(xy);sample.push(proj4('WGS84',proj,[MapSupport.longitude(p.lng),p.lat]));}
   const es=sample.map(p=>p[0]),ns=sample.map(p=>p[1]),e0=Math.floor(Math.min(...es)/1000)*1000,e1=Math.ceil(Math.max(...es)/1000)*1000,n0=Math.floor(Math.min(...ns)/1000)*1000,n1=Math.ceil(Math.max(...ns)/1000)*1000;
   if((e1-e0+n1-n0)/1000>160){$('fieldGridNote').textContent='Zoom in for 1 km grid lines.';return;}
   $('fieldGridNote').textContent='1 km grid · '+(info?info.zone+info.band:system.toUpperCase())+(info?' · center zone':'');
   function line(value,easting){
    const coords=[];for(let i=0;i<=32;i++){const p=proj4(proj,'WGS84',easting?[value,n0+(n1-n0)*i/32]:[e0+(e1-e0)*i/32,value]);coords.push(p);}
    // Clip line segments at the MGRS zone/band limits; never continue a zone grid into its neighbor.
    const segments=[];let part=[];
    for(const p of coords){const inZone=!clip||(p[0]>=clip.west&&p[0]<=clip.east&&p[1]>=clip.south&&p[1]<=clip.north);if(inZone)part.push([p[1],p[0]]);else if(part.length){segments.push(part);part=[];}}if(part.length)segments.push(part);
    for(const seg of segments){if(seg.length<2)continue;L.polyline(seg,{color:'#40658e',weight:1,opacity:.55,interactive:false}).addTo(grid);
     const screen=seg.map(p=>map.latLngToContainerPoint(p));let label;
     const edge=easting?26:28,axis=easting?'y':'x';
     for(let i=1;i<screen.length;i++){const a=screen[i-1],c=screen[i];if((a[axis]-edge)*(c[axis]-edge)<=0&&a[axis]!==c[axis]){const t=(edge-a[axis])/(c[axis]-a[axis]);const pt=L.point(a.x+t*(c.x-a.x),a.y+t*(c.y-a.y));if(pt.x>=12&&pt.x<=size.x-12&&pt.y>=12&&pt.y<=size.y-35)label=map.containerPointToLatLng(pt);}}
     if(label)L.marker(label,{interactive:false,keyboard:false,icon:L.divIcon({className:'km-label',html:String(((Math.round(value/1000)%100)+100)%100).padStart(2,'0'),iconSize:[42,26],iconAnchor:[21,13]})}).addTo(grid);
    }
   }
   for(let e=e0;e<=e1;e+=1000)line(e,true);for(let n=n0;n<=n1;n+=1000)line(n,false);
  }catch(_){$('fieldGridNote').textContent='Grid unavailable here for this coordinate system.';}
 }
 function init(){
  const guess=MapSupport.approximateLocation({helper});const initial=RouteTools.valid(view)?view:guess.current();
  map=L.map('fieldMap',{preferCanvas:true,worldCopyJump:true,maxZoom:19,zoomControl:false}).setView([initial.lat,initial.lon],initial.zoom||10);
  L.control.zoom({position:'bottomright'}).addTo(map);MapSupport.pointGestures(map);map.createPane('offlineLand').style.zIndex='150';MapSupport.context(map);MapSupport.trainingArea(map);L.control.scale({imperial:false}).addTo(map);
  bases={};
  for(const id of MapSupport.basemapIds){
   bases[id]=MapSupport.basemap(id,{maxZoom:19});
   bases[id].on('tileerror',()=>status('Some map tiles are unavailable. Your points and coordinate calculations still work.'));
  }
  bases[layer].addTo(map);
  $('fieldLayer').onchange=()=>{
   const next=MapSupport.basemapId($('fieldLayer').value);
   if(next===layer)return;
   map.removeLayer(bases[layer]);layer=next;bases[layer].addTo(map);$('fieldLayer').value=layer;save();
  };
  markers=L.layerGroup().addTo(map);route=L.layerGroup().addTo(map);grid=L.layerGroup().addTo(map);
  MapSupport.navigation(map,$('fieldRegion'),null,{snap:false});
  let touched=false;map.on('movestart',()=>{touched=true;});
  guess.ready.then(p=>{if(!touched&&!view&&!points.length)map.setView([p.lat,p.lon],p.zoom);});
  map.on('move',()=>{const p=map.getCenter();$('fieldCoordinate').textContent=coordinate({lat:p.lat,lon:MapSupport.longitude(p.lng)});cancelAnimationFrame(frame);frame=requestAnimationFrame(drawGrid);});
  map.on('moveend',()=>{const p=map.getCenter();view={lat:p.lat,lon:MapSupport.longitude(p.lng),zoom:map.getZoom()};save();});
  map.on('click',e=>{if($('fieldTap').checked)add({lat:e.latlng.lat,lon:MapSupport.longitude(e.latlng.lng)});});
  $('fieldAdd').onclick=()=>{const p=map.getCenter();add({lat:p.lat,lon:MapSupport.longitude(p.lng)});};
  new ResizeObserver(()=>{map.invalidateSize({pan:false});drawGrid();}).observe($('fieldMap'));
  draw();if(points.length)fit();map.fire('move');
 }
 $('fieldFormat').value=system;
 $('fieldLayer').value=layer;
 $('fieldFormat').onchange=()=>{system=$('fieldFormat').value;refresh();drawGrid();if(map)map.fire('move');};
 $('fieldRoute').onchange=()=>{remember();connected=$('fieldRoute').checked;if(connected&&points.every(p=>p.breakBefore))points.forEach((p,i)=>p.breakBefore=i===0);refresh();};
 $('fieldGrid').onchange=drawGrid;
 $('fieldUndo').onclick=()=>{const old=undo.pop();if(old){({points,connected}=JSON.parse(old));refresh();}};
 $('fieldClear').onclick=()=>{remember();points=[];refresh();status('Points cleared. Undo restores them.');};
 $('fieldFit').onclick=fit;
 $('fieldCopy').onclick=async()=>{try{const rows=points.map((p,i)=>{const text=format(p,system);return [text,(p.name||'Point '+(i+1)).replace(/[\t\r\n]/g,' ')].join('\t');}).join('\n');await navigator.clipboard.writeText(rows);status('Copied '+points.length+' points.');}catch(e){status('Could not copy: '+e.message);}};
 $('fieldExport').onclick=()=>{const url=URL.createObjectURL(new Blob([RouteTools.gpx(points,connected)],{type:'application/gpx+xml'}));const a=document.createElement('a');a.href=url;a.download='mike-golf-romeo.gpx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 $('fieldConvert').onclick=()=>{if(points.length>2000){status('Use GPX export for tracks over 2,000 points. The converter table supports smaller collections.');return;}onConvert(points,connected);};
 $('fieldImport').onclick=()=>$('fieldFile').click();
 $('fieldFile').onchange=async()=>{const file=$('fieldFile').files[0];$('fieldFile').value='';if(!file)return;try{if(file.size>20*1024*1024)throw Error('GPX files must be smaller than 20 MB.');const result=RouteTools.parse(await file.text());if(points.length+result.points.length>20000)throw Error('Import would exceed 20,000 points. Clear or export the current collection first.');remember();points.push(...result.points);connected=connected||result.connected;refresh();fit();status(`Imported ${result.points.length} points from ${file.name}.`);}catch(e){status(e.message);}};
 render();return {open(){if(!map)init();requestAnimationFrame(()=>map.invalidateSize({pan:false}));},getPoints:()=>points.map(p=>({...p}))};
};
})(globalThis);
