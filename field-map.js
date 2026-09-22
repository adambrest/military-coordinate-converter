/* Independent map-first point collection. Uses the existing local coordinate engine. */
(function(root){
'use strict';
root.createFieldMap=function({formatter,projection,presets,onConvert,helper,countryPresets=[],presetName=id=>id,localGrid=()=>null,presetHolds=()=>true}){
 const $=id=>document.getElementById(id),key='mike-golf-romeo-field-v1';
 let points=[],connected=false,system='mgrs',layer=MapSupport.DEFAULT_BASEMAP,map,markers,route,grid,view,undo=[],redo=[],bases,autoZoom,written=null,broad,lastLocal=null,target;
 try{const s=JSON.parse(localStorage.getItem(key));if(s&&Array.isArray(s.points)){points=s.points.filter(RouteTools.valid).slice(0,20000);connected=!!s.connected;system=presets.includes(s.system)?s.system:'mgrs';layer=MapSupport.basemapId(s.basemapRevision===2?s.layer:(s.layer==='topo'?'street':s.layer));view=s.view;}}catch(_){}
 const status=t=>{$('fieldStatus').textContent=t;};
 function save(){try{localStorage.setItem(key,JSON.stringify({points,connected,system,layer,view,basemapRevision:2}));}catch(_){status('Device storage is full. Export your points before closing.');}}
 const snapshot=()=>JSON.stringify({points,connected,system});
 function historyButtons(){$('fieldUndo').disabled=!undo.length;$('fieldRedo').disabled=!redo.length;}
 function remember(){undo.push(snapshot());if(undo.length>30)undo.shift();redo=[];historyButtons();}
 function restore(json){({points,connected,system}=JSON.parse(json));refresh();grid?.refresh();target?.update();}
 // The whole collection decides how each reference is written, so the formatter is
 // built once per change and reused by the list, the copy and the crosshair readout.
 function writer(){if(!written)written=formatter(points,system);return written;}
 function coordinate(p){try{return writer().text(p);}catch(e){return e.message;}}
 function render(){
  $('fieldFormat').value=system;$('fieldRoute').checked=connected;
  $('fieldTotal').textContent=points.length+(points.length===1?' point':' points');
  $('fieldDistance').textContent=connected?RouteTools.summary(points):'';
  $('fieldAreaNote').textContent=writer().notice||'';
  $('fieldAreaNote').hidden=!writer().notice;
  const list=$('fieldPoints');list.replaceChildren();
  const headings=writer().columns||['Easting','Northing'];
  $('fieldEastHead').textContent=headings[0];$('fieldNorthHead').textContent=headings[1];
  // Large GPX tracks remain complete for calculations/export; bound DOM work.
  points.slice(0,300).forEach((p,i)=>{
   const li=document.createElement('li');li.className='trow field-point';
   const number=document.createElement('span');number.className='n';number.textContent=i+1;
   const input=document.createElement('input');input.className='cell nm';input.value=p.name||'';input.placeholder='Optional';input.setAttribute('aria-label','Point '+(i+1)+' name');input.addEventListener('change',()=>{remember();p.name=input.value;save();draw();});
   const remove=document.createElement('button');remove.className='del';remove.textContent='×';remove.setAttribute('aria-label','Remove point '+(i+1));remove.onclick=()=>{remember();if(p.breakBefore&&points[i+1])points[i+1].breakBefore=true;points.splice(i,1);if(!points.length)lastLocal=null;refresh();};
   const values=writer().cells(p);
   const cells=values.map((value,j)=>{const cell=document.createElement('input');cell.className='cell '+(j?'b':'a');cell.readOnly=true;cell.value=value;cell.setAttribute('aria-label',headings[j]);return cell;});
   li.append(number,...cells,input,remove);list.append(li);
  });
  if(points.length>300){const li=document.createElement('li');li.textContent=`Showing first 300 of ${points.length} points. All points are included in distance, copy and GPX.`;list.append(li);}
  for(const id of ['fieldCopy','fieldExport','fieldConvert','fieldClear'])$(id).disabled=!points.length;
  autoZoom&&autoZoom.sync();
  historyButtons();
 }
 // The list of grids follows the map, but nothing is taken away: a grid that cannot
 // write a point here is still reachable, just filed under the other heading. Hiding
 // it outright would mean a grid could not be chosen until the map was already there.
 const GRID_LABELS={mgrs:'Global MGRS',wgs84:'Coordinates'};
 function offerGrids(){
  const select=$('fieldFormat');if(!select)return;
  const centre=map?map.getCenter():null;
  const lat=centre?centre.lat:null,lon=centre?MapSupport.longitude(centre.lng):null;
  const local=lat===null?null:localGrid(lat,lon);
  if(!points.length&&local==='sg'&&lastLocal!=='sg'){
   system='sg';written=null;render();save();
   if(map){target?.update();grid?.refresh();}
  }
  lastLocal=local;
  const here=[],elsewhere=[];
  for(const id of presets){
   const global=!countryPresets.includes(id);
   ((global||(lat!==null&&presetHolds(id,lat,lon)))?here:elsewhere).push(id);
  }
  const signature=here.join(',')+'|'+elsewhere.join(',');
  if(select.dataset.signature!==signature){
   select.dataset.signature=signature;
   const group=(label,ids)=>{
    if(!ids.length)return null;
    const el=document.createElement('optgroup');el.label=label;
    for(const id of ids)el.append(new Option(GRID_LABELS[id]||presetName(id),id));
    return el;
   };
   select.replaceChildren(...[group('Covers this area',here),group('Other areas',elsewhere)].filter(Boolean));
  }
  select.value=system;
  const note=$('fieldLocalGrid');
  if(note){
   // Global MGRS works anywhere, but where a country grid covers the ground people
   // are standing on, saying so beats reading out a global reference by accident.
   const mismatch=points.length>0&&local&&local!==system;
   note.hidden=!mismatch;
   if(mismatch)note.textContent=presetName(local)+' covers this area. Change the grid for your '+(points.length===1?'point':'points')+'?';
   note.dataset.grid=mismatch?local:'';
  }
 }
 function refresh(){written=null;render();draw();save();offerGrids();}
 function add(p){if(!RouteTools.valid(p))return;if(points.length>=20000){status('20,000 point limit reached. Export or clear this collection first.');return;}remember();points.push({...p,name:'',breakBefore:points.length===0});refresh();}
 function draw(){if(!map)return;markers.clearLayers();
  points.forEach((p,i)=>{if(points.length>1000){L.circleMarker([p.lat,p.lon],{radius:2,weight:0,fillOpacity:.8,fillColor:'#2563eb',interactive:false}).addTo(markers);return;}
   MapSupport.marker(map,{...p,number:i+1}).addTo(markers);
  });
  drawRoute();
 }
 function drawRoute(){if(!route)return;route.clearLayers();
  if(connected){let segment=[];const flush=()=>{if(segment.length>1)L.polyline(segment,{color:'#2563eb',weight:3,interactive:false}).addTo(route);segment=[];};for(const p of points){if(p.breakBefore)flush();segment.push([p.lat,p.lon]);}flush();}
 }
 function fit(){if(points.length&&map)map.fitBounds(L.latLngBounds(points.map(p=>[p.lat,p.lon])),{padding:[35,35],maxZoom:16});}
 function init(){
  const guess=MapSupport.approximateLocation({helper});const initial=RouteTools.valid(view)?view:guess.current();
  map=L.map('fieldMap',{preferCanvas:true,worldCopyJump:true,maxZoom:19,zoomControl:false}).setView([initial.lat,initial.lon],initial.zoom||10);
  MapSupport.clampLatitude(map);
  map.createPane('broadLand').style.zIndex='160';
  L.control.zoom({position:'topleft'}).addTo(map);
  MapSupport.locate(map,{position:'bottomright',onStatus:text=>{if(text||!$('fieldStatus').textContent.startsWith('Finding'))status(text);}});
  autoZoom=MapSupport.autoZoom(map,()=>points);target=MapSupport.pointTarget(map,{tapMode:()=>$('fieldTap').checked,onChange:p=>{$('fieldCoordinate').textContent=coordinate(p);}});
  MapSupport.pointGestures(map,{onTap:p=>{
   if(!$('fieldTap').checked)return;
   target.clicked(p);
   const before=snapshot(),past=[...undo],future=[...redo];
   add({lat:p.lat,lon:MapSupport.longitude(p.lng)});
   return ()=>{undo=past;redo=future;restore(before);};
  }});map.createPane('offlineLand').style.zIndex='150';MapSupport.context(map);MapSupport.trainingArea(map);L.control.scale({imperial:false}).addTo(map);
  bases={};
  for(const id of MapSupport.basemapIds){
   bases[id]=MapSupport.basemap(id,{maxZoom:19});
   bases[id].on('tileerror',()=>status('Some map tiles are unavailable. Your points and coordinate calculations still work.'));
  }
  bases[layer].addTo(map);
  // Three steps out. Close in, the map as drawn. Further out, the bundled land and
  // water show through fading tiles, so roads and names ghost instead of turning to
  // mud. Further out still the tiles go entirely and only the outlines remain, which
  // asks nothing of the network and leaves the points the only saturated thing on it.
  const QUIET_ZOOM=11,FAINT_ZOOM=9,BROAD_ZOOM=6;
  function detail(){
    const zoom=map.getZoom();
    const simple=zoom<BROAD_ZOOM,faint=!simple&&zoom<FAINT_ZOOM,quiet=!simple&&!faint&&zoom<QUIET_ZOOM;
    // The bundled land sits under the tiles from the moment they start to fade, so what
    // shows through is the sleek base rather than the page behind the map.
    broad.show({land:simple||faint||quiet,names:simple});
    const wrap=$('fieldMap');
    wrap.classList.toggle('map-quiet',quiet);
    wrap.classList.toggle('map-faint',faint);
    wrap.classList.toggle('map-broad',simple);
    const tiles=bases[layer];
    if(simple){if(map.hasLayer(tiles))map.removeLayer(tiles);}
    else if(!map.hasLayer(tiles))tiles.addTo(map);
  }
  broad=MapSupport.broadView(map);
  map.on('zoomend',detail);
  $('fieldLayer').onchange=()=>{
   const next=MapSupport.basemapId($('fieldLayer').value);
   if(next===layer)return;
   map.removeLayer(bases[layer]);layer=next;
   detail();save();
  };
  markers=L.layerGroup().addTo(map);route=L.layerGroup().addTo(map);grid=createCoordinateGrid(map,{system:()=>system,projection,contains:presetHolds,enabled:()=>$('fieldGrid').checked});
  MapSupport.navigation(map,$('fieldRegion'),null,{snap:false});
  let touched=false;map.on('movestart',()=>{touched=true;});
  guess.ready.then(p=>{if(!touched&&!view&&!points.length)map.setView([p.lat,p.lon],p.zoom);});
  map.on('moveend',()=>{const p=map.getCenter();view={lat:p.lat,lon:MapSupport.longitude(p.lng),zoom:map.getZoom()};save();offerGrids();});
  $('fieldAdd').onclick=()=>{const p=map.getCenter();add({lat:p.lat,lon:MapSupport.longitude(p.lng)});};
  new ResizeObserver(()=>{map.invalidateSize({pan:false});grid.refresh();}).observe($('fieldMap'));
  draw();if(points.length)fit();target.update();offerGrids();detail();grid.refresh();
 }
 $('fieldFormat').value=system;
 $('fieldLayer').value=layer;
 $('fieldFormat').onchange=()=>{
  system=$('fieldFormat').value;written=null;
  const region=MapSupport.regions.find(r=>r.id===system);
  if(map&&region&&!presetHolds(system,map.getCenter().lat,MapSupport.longitude(map.getCenter().lng)))map.setView([region.lat,region.lon],region.zoom,{animate:false});
  refresh();grid?.refresh();target?.update();
 };
 $('fieldLocalGrid').onclick=()=>{const id=$('fieldLocalGrid').dataset.grid;if(!id)return;system=id;$('fieldFormat').value=id;written=null;refresh();grid?.refresh();target?.update();};
 $('fieldRoute').onchange=()=>{remember();connected=$('fieldRoute').checked;if(connected&&points.every(p=>p.breakBefore))points.forEach((p,i)=>p.breakBefore=i===0);drawRoute();$('fieldDistance').textContent=connected?RouteTools.summary(points):'';save();};
 $('fieldGrid').onchange=()=>grid?.refresh();
 $('fieldTap').onchange=()=>{$('view-field').classList.toggle('tap-mode',$('fieldTap').checked);target?.update();};
 $('fieldUndo').onclick=()=>{const old=undo.pop();if(old){redo.push(snapshot());restore(old);}};
 $('fieldRedo').onclick=()=>{const next=redo.pop();if(next){undo.push(snapshot());restore(next);}};
 document.addEventListener('keydown',e=>{
  if(!(e.ctrlKey||e.metaKey)||e.key.toLowerCase()!=='z'||!$('view-field').classList.contains('on')||document.querySelector('.overlay.open'))return;
  const el=document.activeElement;if(el&&/^(INPUT|TEXTAREA)$/.test(el.tagName)&&!el.readOnly)return;
  e.preventDefault();$(e.shiftKey?'fieldRedo':'fieldUndo').click();
 });
 $('fieldClear').onclick=()=>{remember();points=[];lastLocal=null;refresh();status('Points cleared. Undo restores them.');};
 $('fieldCopy').onclick=async()=>{try{const write=writer();const rows=points.map(p=>[...write.cells(p),(p.name||'').replace(/[\t\r\n]/g,' ')].filter(Boolean).join('\t')).join('\n');await navigator.clipboard.writeText(rows);status('Copied '+points.length+' points.');}catch(e){status('Could not copy: '+e.message);}};
 $('fieldExport').onclick=()=>{const url=URL.createObjectURL(new Blob([RouteTools.gpx(points,connected)],{type:'application/gpx+xml'}));const a=document.createElement('a');a.href=url;a.download='mike-golf-romeo.gpx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 $('fieldConvert').onclick=()=>{if(points.length>2000){status('Use GPX export for tracks over 2,000 points. The converter table supports smaller collections.');return;}onConvert(points,connected);};
 $('fieldImport').onclick=()=>$('fieldFile').click();
 $('fieldFile').onchange=async()=>{const file=$('fieldFile').files[0];$('fieldFile').value='';if(!file)return;try{if(file.size>20*1024*1024)throw Error('GPX files must be smaller than 20 MB.');const result=RouteTools.parse(await file.text());if(points.length+result.points.length>20000)throw Error('Import would exceed 20,000 points. Clear or export the current collection first.');remember();points.push(...result.points);connected=connected||result.connected;refresh();fit();status(`Imported ${result.points.length} points from ${file.name}.`);}catch(e){status(e.message);}};
 render();return {open(){if(!map)init();written=null;render();target.update();requestAnimationFrame(()=>{map.invalidateSize({pan:false});grid.refresh();});},getPoints:()=>points.map(p=>({...p}))};
};
})(globalThis);
