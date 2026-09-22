/* Independent map-first point collection. Uses the existing local coordinate engine. */
(function(root){
'use strict';
root.createFieldMap=function({formatter,projection,presets,onConvert,helper,countryPresets=[],presetName=id=>id,localGrid=()=>null,presetHolds=()=>true,homeGrid=()=>null,otherGridNotice=()=>''}){
 const $=id=>document.getElementById(id),key='mike-golf-romeo-field-v1';
 // `preferred` is a global grid someone chose by hand; `area` is the country grid the
 // view was last over, so a grid only changes on the way into or out of a country.
 let points=[],connected=false,system='mgrs',layer=MapSupport.DEFAULT_BASEMAP,map,markers,route,grid,view,undo=[],redo=[],bases,autoZoom,written=null,broad,target,preferred=null,area;
 try{const s=JSON.parse(localStorage.getItem(key));if(s&&Array.isArray(s.points)){points=s.points.filter(RouteTools.valid).slice(0,20000);connected=!!s.connected;system=presets.includes(s.system)?s.system:'mgrs';layer=MapSupport.basemapId(s.basemapRevision===2?s.layer:(s.layer==='topo'?'street':s.layer));view=s.view;preferred=['mgrs','wgs84'].includes(s.preferred)?s.preferred:null;area=s.area;}}catch(_){}
 const status=t=>{$('fieldStatus').textContent=t;};
 function save(){try{localStorage.setItem(key,JSON.stringify({points,connected,system,layer,view,preferred,area,basemapRevision:2}));}catch(_){status('Device storage is full. Export your points before closing.');}}
 const snapshot=()=>JSON.stringify({points,connected,system});
 function historyButtons(){$('fieldUndo').disabled=!undo.length;$('fieldRedo').disabled=!redo.length;}
 function remember(){undo.push(snapshot());if(undo.length>30)undo.shift();redo=[];historyButtons();}
 function restore(json){({points,connected,system}=JSON.parse(json));refresh();}
 const GRID_LABELS={mgrs:'Global MGRS',wgs84:'Coordinates'};
 const gridName=id=>GRID_LABELS[id]||presetName(id);
 const isCountry=id=>countryPresets.includes(id);
 const fits=(id,p)=>!isCountry(id)||presetHolds(id,p.lat,p.lon);
 // The whole collection decides how each reference is written, so the formatter is
 // built once per change and reused by the list, the copy and the crosshair readout.
 function writer(){if(!written)written=formatter(points,system);return written;}
 function coordinate(p){try{return writer().text(p);}catch(e){return e.message;}}
 function render(){
  $('fieldFormat').value=system;$('fieldRoute').checked=connected;
  $('fieldTotal').textContent=points.length?points.length+(points.length===1?' point':' points'):'';
  $('fieldDistance').textContent=connected?RouteTools.summary(points):'';
  // A global grid picked by hand where a country grid would serve is kept, and said
  // in the converter's words. Before any point, the ground under the crosshair decides.
  const centre=map&&map.getCenter();
  const home=points.length?homeGrid(points):centre?localAt(centre.lat,centre.lng):null;
  const notes=[writer().notice,home&&system==='mgrs'&&home!==system?otherGridNotice(home,system):''].filter(Boolean);
  $('fieldAreaNote').textContent=notes.join(' ');
  $('fieldAreaNote').hidden=!notes.length;
  $('fieldHint').textContent=$('fieldTap').checked?'Tap the map to add a point.':'Move the map to put the crosshair on a point, then press Add point.';
  $('fieldReadoutGrid').textContent=gridName(system)+(system==='mgrs'&&writer().area?' · '+writer().area:'');
  const list=$('fieldPoints');list.replaceChildren();
  const headings=writer().columns||['Easting','Northing'];
  $('fieldEastHead').textContent=headings[0];$('fieldNorthHead').textContent=headings[1];
  // Large GPX tracks remain complete for calculations/export; bound DOM work.
  points.slice(0,300).forEach((p,i)=>{
   const li=document.createElement('li');li.className='trow field-point';
   const number=document.createElement('span');number.className='n';number.textContent=i+1;
   const input=document.createElement('input');input.className='cell nm';input.value=p.name||'';input.placeholder='Optional';input.setAttribute('aria-label','Point '+(i+1)+' name');input.addEventListener('change',()=>{remember();p.name=input.value;save();draw();});
   const remove=document.createElement('button');remove.className='del';remove.textContent='×';remove.setAttribute('aria-label','Remove point '+(i+1));remove.onclick=()=>{remember();if(p.breakBefore&&points[i+1])points[i+1].breakBefore=true;points.splice(i,1);refresh();};
   const values=writer().cells(p);
   const cells=values.map((value,j)=>{const cell=document.createElement('input');cell.className='cell '+(j?'b':'a');cell.readOnly=true;cell.value=value;cell.setAttribute('aria-label',headings[j]);return cell;});
   li.append(number,...cells,input,remove);list.append(li);
  });
  if(points.length>300){const li=document.createElement('li');li.className='trow';li.textContent=`Showing first 300 of ${points.length} points. All points are included in distance, copy and GPX.`;list.append(li);}
  for(const id of ['fieldCopy','fieldExport','fieldConvert','fieldClear'])$(id).disabled=!points.length;
  autoZoom&&autoZoom.sync();
  historyButtons();
 }
 // Before the first point, the grid follows the ground under the crosshair: a
 // country's own grid inside it, Coordinates outside. Only Coordinates chosen by hand
 // survives the way into a country, and only Global MGRS chosen by hand survives the
 // way out. Once there is a point the grid is fixed, since changing it would rewrite
 // every reference already taken down.
 function enterArea(local){
  if(points.length||local===area)return false;
  area=local;
  let next=system;
  if(local){if(!(system==='wgs84'&&preferred==='wgs84'))next=local;}
  else if(isCountry(system))next=preferred==='mgrs'?'mgrs':'wgs84';
  if(next===system)return false;
  system=next;written=null;return true;
 }
 const localAt=(lat,lon)=>localGrid(lat,MapSupport.longitude(lon))||null;
 // The list keeps every grid reachable. With no points it is sorted by the map; with
 // points, a country grid that cannot write all of them is shown but cannot be chosen.
 let pointFits=null;
 function offerGrids(){
  const select=$('fieldFormat');
  const centre=map?map.getCenter():null;
  const here=[],elsewhere=[];
  if(points.length&&!pointFits)pointFits=presets.filter(id=>points.every(p=>fits(id,p)));
  for(const id of presets){
   const ok=points.length?pointFits.includes(id):!isCountry(id)||(centre&&presetHolds(id,centre.lat,MapSupport.longitude(centre.lng)));
   (ok?here:elsewhere).push(id);
  }
  const labels=points.length?['Fits your points','Outside your points']:['Covers this area','Other areas'];
  const signature=labels[0]+':'+here.join(',')+'|'+elsewhere.join(',');
  if(select.dataset.signature!==signature){
   select.dataset.signature=signature;
   const group=(label,ids,disabled)=>{
    if(!ids.length)return null;
    const el=document.createElement('optgroup');el.label=label;
    for(const id of ids){const o=new Option(gridName(id),id);o.disabled=disabled;el.append(o);}
    return el;
   };
   select.replaceChildren(...[group(labels[0],here,false),group(labels[1],elsewhere,!!points.length)].filter(Boolean));
  }
  select.value=system;
 }
 function refresh(){written=null;pointFits=null;render();draw();save();offerGrids();grid?.refresh();target?.update();}
 function moved(){
  if(!map)return;
  const p=map.getCenter();
  if(enterArea(localAt(p.lat,p.lng)))refresh();else{save();offerGrids();if(!points.length)render();}
 }

 // ---- adding points, with the grid held once the first is down ----
 let pending=null;
 function closeGridDialog(){$('fieldGridOverlay').classList.remove('open');pending=null;}
 function askGrid(incoming,commit){
  const outside=incoming.filter(p=>!fits(system,p)).length,country=presetName(system).replace(/ MGR$/,'');
  $('fieldGridTitle').textContent=incoming.length===1?'This point is outside '+country:outside+' of these points are outside '+country;
  $('fieldGridDetail').textContent=presetName(system)+' only covers '+country+', so it cannot write '+(outside===1?'this point':'them')+
   '. To add '+(incoming.length===1?'it':'them')+', every point in this list has to be written in Global MGRS or Coordinates instead.';
  pending=commit;$('fieldGridOverlay').classList.add('open');$('fieldGridGlobal').focus();
 }
 function admit(incoming,commit){
  incoming=incoming.filter(RouteTools.valid);if(!incoming.length)return;
  if(points.length+incoming.length>20000){status('20,000 point limit reached. Export or clear this collection first.');return;}
  // The first point decides the grid when it lands somewhere other than the crosshair.
  if(!points.length)enterArea(localAt(incoming[0].lat,incoming[0].lon));
  if(incoming.every(p=>fits(system,p))){commit();return;}
  askGrid(incoming,commit);
 }
 function add(p){
  admit([p],()=>{remember();points.push({...p,name:'',breakBefore:points.length===0});refresh();});
 }
 function choose(id){
  const commit=pending;closeGridDialog();if(!commit)return;
  const before=snapshot();
  system=id;preferred=id;written=null;commit();
  // The grid change and the point that forced it are one step to undo.
  undo[undo.length-1]=before;
 }
 $('fieldGridGlobal').onclick=()=>choose('mgrs');
 $('fieldGridCoordinates').onclick=()=>choose('wgs84');
 $('fieldGridCancel').onclick=closeGridDialog;
 $('fieldGridOverlay').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeGridDialog();}});
 $('fieldGridOverlay').addEventListener('click',e=>{if(e.target===$('fieldGridOverlay'))closeGridDialog();});

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
 function layerButtons(){for(const b of document.querySelectorAll('.field-tools [data-layer]'))b.setAttribute('aria-pressed',String(b.dataset.layer===layer));}
 function init(){
  const guess=MapSupport.approximateLocation({helper});const initial=RouteTools.valid(view)?view:guess.current();
  map=L.map('fieldMap',{preferCanvas:true,worldCopyJump:true,maxZoom:19,zoomControl:false}).setView([initial.lat,initial.lon],initial.zoom||10);
  MapSupport.clampLatitude(map);
  map.attributionControl.setPrefix(false);
  map.createPane('broadLand').style.zIndex='160';
  // Every map button in one stack, in the corner a thumb reaches.
  MapSupport.locate(map,{position:'bottomright',onStatus:text=>{if(text||!$('fieldStatus').textContent.startsWith('Finding'))status(text);}});
  autoZoom=MapSupport.autoZoom(map,()=>points);
  L.control.zoom({position:'bottomright'}).addTo(map);
  target=MapSupport.pointTarget(map,{tapMode:()=>$('fieldTap').checked,onChange:p=>{$('fieldCoordinate').textContent=coordinate(p);}});
  MapSupport.pointGestures(map,{onTap:p=>{
   if(!$('fieldTap').checked)return;
   target.clicked(p);
   const before=snapshot(),past=[...undo],future=[...redo];
   add({lat:p.lat,lon:MapSupport.longitude(p.lng)});
   return ()=>{closeGridDialog();undo=past;redo=future;restore(before);};
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
    // Imagery is the picture itself, so it stays at every zoom.
    const zoom=layer==='satellite'?Infinity:map.getZoom();
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
  for(const b of document.querySelectorAll('.field-tools [data-layer]'))b.onclick=()=>{
   const next=MapSupport.basemapId(b.dataset.layer);
   if(next===layer)return;
   map.removeLayer(bases[layer]);layer=next;layerButtons();
   detail();save();
  };
  markers=L.layerGroup().addTo(map);route=L.layerGroup().addTo(map);grid=createCoordinateGrid(map,{system:()=>system,projection,contains:presetHolds,enabled:()=>$('fieldGrid').checked});
  MapSupport.navigation(map,$('fieldRegion'),null,{snap:false});
  let touched=false;map.on('movestart',()=>{touched=true;});
  guess.ready.then(p=>{if(!touched&&!view&&!points.length)map.setView([p.lat,p.lon],p.zoom);});
  map.on('moveend',()=>{const p=map.getCenter();view={lat:p.lat,lon:MapSupport.longitude(p.lng),zoom:map.getZoom()};moved();});
  $('fieldAdd').onclick=()=>{const p=map.getCenter();add({lat:p.lat,lon:MapSupport.longitude(p.lng)});};
  new ResizeObserver(()=>{map.invalidateSize({pan:false});grid.refresh();}).observe($('fieldMap'));
  draw();if(points.length)fit();moved();target.update();offerGrids();detail();grid.refresh();
 }
 $('fieldFormat').value=system;
 layerButtons();
 $('fieldFormat').onchange=()=>{
  const next=$('fieldFormat').value;
  if(points.length&&!points.every(p=>fits(next,p))){$('fieldFormat').value=system;return;}
  if(points.length)remember();
  system=next;preferred=isCountry(system)?null:system;written=null;
  const region=MapSupport.regions.find(r=>r.id===system);
  // A country grid chosen from elsewhere goes to that country, since it cannot be read
  // anywhere else; nothing moves when points are already down.
  if(!points.length&&map&&region&&!presetHolds(system,map.getCenter().lat,MapSupport.longitude(map.getCenter().lng)))map.setView([region.lat,region.lon],region.zoom,{animate:false});
  if(map){const c=map.getCenter();area=localAt(c.lat,c.lng);}
  refresh();
 };
 $('fieldRoute').onchange=()=>{remember();connected=$('fieldRoute').checked;if(connected&&points.every(p=>p.breakBefore))points.forEach((p,i)=>p.breakBefore=i===0);drawRoute();$('fieldDistance').textContent=connected?RouteTools.summary(points):'';save();};
 $('fieldGrid').onchange=()=>grid?.refresh();
 $('fieldTap').onchange=()=>{$('view-field').classList.toggle('tap-mode',$('fieldTap').checked);render();target?.update();};
 // With the list empty again, the grid is free to follow the map once more.
 const unlocked=()=>{if(!points.length&&map){area=undefined;moved();}};
 $('fieldUndo').onclick=()=>{const old=undo.pop();if(old){redo.push(snapshot());restore(old);unlocked();}};
 $('fieldRedo').onclick=()=>{const next=redo.pop();if(next){undo.push(snapshot());restore(next);unlocked();}};
 document.addEventListener('keydown',e=>{
  if(!(e.ctrlKey||e.metaKey)||e.key.toLowerCase()!=='z'||!$('view-field').classList.contains('on')||document.querySelector('.overlay.open'))return;
  const el=document.activeElement;if(el&&/^(INPUT|TEXTAREA)$/.test(el.tagName)&&!el.readOnly)return;
  e.preventDefault();$(e.shiftKey?'fieldRedo':'fieldUndo').click();
 });
 $('fieldPoints').addEventListener('click',e=>{if(e.target.closest('.del'))unlocked();});
 $('fieldClear').onclick=()=>{remember();points=[];refresh();unlocked();status('');};
 $('fieldCopy').onclick=async()=>{try{const write=writer();const rows=points.map(p=>[...write.cells(p),(p.name||'').replace(/[\t\r\n]/g,' ')].filter(Boolean).join('\t')).join('\n');await navigator.clipboard.writeText(rows);status('');}catch(e){status('Could not copy: '+e.message);}};
 $('fieldExport').onclick=()=>{const url=URL.createObjectURL(new Blob([RouteTools.gpx(points,connected)],{type:'application/gpx+xml'}));const a=document.createElement('a');a.href=url;a.download='mike-golf-romeo.gpx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 $('fieldConvert').onclick=()=>{if(points.length>2000){status('Use GPX export for tracks over 2,000 points. The converter table supports smaller collections.');return;}onConvert(points,connected,system);};
 $('fieldImport').onclick=()=>$('fieldFile').click();
 $('fieldFile').onchange=async()=>{const file=$('fieldFile').files[0];$('fieldFile').value='';if(!file)return;try{if(file.size>20*1024*1024)throw Error('GPX files must be smaller than 20 MB.');const result=RouteTools.parse(await file.text());
  admit(result.points,()=>{remember();points.push(...result.points);connected=connected||result.connected;refresh();fit();status('');});
 }catch(e){status(e.message);}};
 render();return {open(){if(!map)init();written=null;render();target.update();requestAnimationFrame(()=>{map.invalidateSize({pan:false});grid.refresh();});},getPoints:()=>points.map(p=>({...p}))};
};
})(globalThis);
