/* Independent map-first point collection. Uses the existing local coordinate engine. */
(function(root){
'use strict';
root.createFieldMap=function({formatter,projection,presets,onConvert,helper,countryPresets=[],presetName=id=>id,localGrid=()=>null,presetHolds=()=>true,homeGrid=()=>null,otherGridNotice=()=>'',fineGrid=()=>false,readInput=async()=>[],ask=async()=>false,gridChoiceAlert=null,boundary=()=>null,onMaps=()=>{}}){
 const $=id=>document.getElementById(id),key='mike-golf-romeo-field-v1';
 // `preferred` is a global grid someone chose by hand; `area` is the country grid the
 // view was last over, so a grid only changes on the way into or out of a country.
 let fullScreen,imageExport,points=[],connected=false,system='mgrs',layer=MapSupport.DEFAULT_BASEMAP,map,markers,route,grid,view,undo=[],redo=[],bases,autoZoom,written=null,broad,target,preferred=null,area,choices={},mapHistory,labels;
 try{const s=JSON.parse(localStorage.getItem(key));if(s&&Array.isArray(s.points)){points=s.points.filter(RouteTools.valid).slice(0,20000);connected=!!s.connected;system=presets.includes(s.system)?s.system:'mgrs';layer=MapSupport.basemapId(s.basemapRevision===2?s.layer:(s.layer==='topo'?'street':s.layer));view=s.view;preferred=['mgrs','wgs84'].includes(s.preferred)?s.preferred:null;area=s.area;if(s.choices&&typeof s.choices==='object')choices=s.choices;}}catch(_){}
 const status=t=>{$('fieldStatus').textContent=t;};
 function save(){try{localStorage.setItem(key,JSON.stringify({points,connected,system,layer,view,preferred,area,choices,basemapRevision:2}));}catch(_){status('Device storage is full. Export your points before closing.');}}
 const snapshot=()=>JSON.stringify({points,connected,system});
 function historyButtons(){$('fieldUndo').disabled=!undo.length;$('fieldRedo').disabled=!redo.length;mapHistory?.sync(undo.length>0,redo.length>0);}
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
  // The same table as the converter's input: every cell takes typing or a paste in
  // any format, rows can be added and dragged, and whatever arrives is written in
  // this list's grid. An empty list keeps one blank row to paste into.
  const examples=system==='wgs84'?['1.35° N','103.82° E']:system==='mgrs'?['48N UG 1234','5678']:['1234','5678'];
  const blanks=Math.max(drafts,points.length?0:1);
  const shown=points.slice(0,300);
  [...shown,...Array(blanks).fill(null)].forEach((p,i)=>{
   const li=document.createElement('li');li.className='trow field-point'+(p?'':' blank');
   let number;
   if(p&&points.length>1){
    number=document.createElement('button');number.type='button';number.className='n grip';number.title='Drag to reorder';
    number.setAttribute('aria-label','Point '+(i+1)+': drag, or press the up and down arrow keys, to reorder');
    number.innerHTML='<svg viewBox="0 0 12 10" aria-hidden="true"><path d="M1 1.5h10M1 5h10M1 8.5h10"/></svg><span>'+(i+1)+'</span>';
    number.addEventListener('pointerdown',e=>dragRow(e,i,number));
    number.addEventListener('keydown',e=>{const to=e.key==='ArrowUp'?i-1:e.key==='ArrowDown'?i+1:null;if(to===null||to<0||to>=points.length)return;e.preventDefault();moveRow(i,to);list.children[to]?.querySelector('.grip')?.focus();});
   }else{number=document.createElement('span');number.className='n';number.textContent=i+1;}
   const values=p?writer().cells(p):['',''];
   const outside=p&&/^Outside /.test(values[0]);
   const cells=values.map((value,j)=>{
    const cell=document.createElement('input');cell.className='cell '+(j?'b':'a')+(outside&&!j?' outside':'');
    cell.value=value;cell.placeholder=p?'':examples[j];cell.readOnly=!!outside;cell.setAttribute('aria-label',headings[j]);
    cell.addEventListener('paste',e=>{const text=(e.clipboardData||root.clipboardData)?.getData('text');if(!text)return;e.preventDefault();take(text,i,input.value);});
    return cell;
   });
   const input=document.createElement('input');input.className='cell nm';input.value=p?.name||'';input.placeholder='Optional';input.setAttribute('aria-label','Point '+(i+1)+' name');
   if(p)input.addEventListener('change',()=>{remember();p.name=input.value;save();draw();});
   // A finished row is read like a paste of it, so it may be typed in any format too.
   // It is finished when focus leaves the row, or on Enter, never between its cells.
   const commit=()=>{
    if(outside)return Promise.resolve(!!p);
    const text=(cells[0].value+' '+cells[1].value).trim();
    if(!text)return Promise.resolve(!!p);
    if(p&&cells.every((c,j)=>c.value===values[j]))return Promise.resolve(true);
    return take(text,i,input.value);
   };
   li.addEventListener('focusout',e=>{if(!li.contains(e.relatedTarget))commit();});
   // Enter finishes the row and starts a new one beneath, as in the converter.
   for(const field of [...cells,input])field.addEventListener('keydown',async e=>{
    if(e.key!=='Enter')return;
    e.preventDefault();e.stopPropagation();
    if(!await commit())return;
    drafts++;render();
    const rows=$('fieldPoints').children;rows[rows.length-1]?.querySelector('.cell.a')?.focus();
   });
   const remove=document.createElement('button');remove.className='del';remove.textContent='×';remove.setAttribute('aria-label',p?'Remove point '+(i+1):'Remove row');
   remove.onclick=p?()=>{remember();if(p.breakBefore&&points[i+1])points[i+1].breakBefore=true;points.splice(i,1);refresh();}:()=>{drafts=Math.max(0,drafts-1);render();};
   li.append(number,...cells,input,remove);list.append(li);
  });
  if(points.length>300){const li=document.createElement('li');li.className='trow';li.textContent=`Showing first 300 of ${points.length} points. All points are included in distance, copy and GPX.`;list.append(li);}
  for(const id of ['fieldCopy','fieldExport','fieldConvert','fieldClear','fieldMaps'])$(id).disabled=!points.length;
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
  // A grid chosen by hand in this country before is kept rather than switched back.
  if(local){if(choices[local]&&presets.includes(choices[local]))next=choices[local];else if(!(system==='wgs84'&&preferred==='wgs84'))next=local;}
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

 // ---- the table: typed, pasted and reordered rows ----
 let drafts=0;
 // Whatever arrives is read with the converter's readers and written in this list's
 // grid. A row with points replaces that row; a blank row adds to the end.
 async function take(text,index,name){
  let read;
  try{read=await readInput(text,{system,anchor:points[0]});}catch(e){status(e.message);return false;}
  if(!read.length)return false;
  const bad=read.findIndex(r=>r.error);
  if(bad>=0){
   status(read.length>1?'Line '+(bad+1)+': '+read[bad].error:read[bad].error);
   $('fieldPoints').children[index]?.querySelectorAll('.cell.a,.cell.b').forEach(c=>c.classList.add('bad'));
   return false;
  }
  status('');
  const incoming=read.map((r,k)=>({...r.point,name:r.name||(k===0?name||'':'')}));
  const replacing=index<points.length;
  return admit(incoming,()=>{
   remember();
   if(replacing){
    const old=points[index];
    points.splice(index,1,...incoming.map((p,k)=>({...p,name:p.name||(k===0?old.name:''),breakBefore:k===0?old.breakBefore:false})));
   }else{
    drafts=Math.max(0,drafts-1);
    points.push(...incoming.map((p,k)=>({...p,breakBefore:points.length===0&&k===0})));
   }
   refresh();
  });
 }
 function moveRow(from,to){
  remember();
  const [p]=points.splice(from,1);points.splice(to,0,p);
  points.forEach((q,k)=>{if(k===0)q.breakBefore=true;});
  refresh();
 }
 function dragRow(e,i,grip){
  if(e.button>0)return;
  e.preventDefault();
  const rows=[...$('fieldPoints').children].slice(0,points.length),row=rows[i];
  const boxes=rows.map(r=>r.getBoundingClientRect()),height=boxes[i].height,startY=e.clientY;
  let to=i,moved=false;
  row.classList.add('dragging');
  try{grip.setPointerCapture(e.pointerId);}catch(_){}
  const move=ev=>{
   const dy=ev.clientY-startY;if(Math.abs(dy)>3)moved=true;
   row.style.transform=`translateY(${dy}px)`;
   const center=boxes[i].top+height/2+dy;
   to=boxes.filter((b,k)=>k!==i&&b.top+b.height/2<center).length;
   rows.forEach((r,k)=>{if(k===i)return;const shift=k>i&&k<=to?-height:k<i&&k>=to?height:0;r.style.transform=shift?`translateY(${shift}px)`:'';});
  };
  const end=()=>{
   grip.removeEventListener('pointermove',move);grip.removeEventListener('pointerup',end);grip.removeEventListener('pointercancel',end);
   rows.forEach(r=>{r.style.transform='';r.classList.remove('dragging');});
   if(moved&&to!==i){moveRow(i,to);$('fieldPoints').children[to]?.querySelector('.grip')?.focus();}
  };
  grip.addEventListener('pointermove',move);grip.addEventListener('pointerup',end);grip.addEventListener('pointercancel',end);
 }
 $('fieldAddRow').onclick=()=>{drafts++;render();const rows=$('fieldPoints').children;rows[rows.length-1]?.querySelector('.cell.a')?.focus();};
 // A paste anywhere on the tab that is not into a field adds to the end of the list.
 document.addEventListener('paste',e=>{
  if(e.defaultPrevented||!$('view-field').classList.contains('on')||document.querySelector('.overlay.open'))return;
  for(const el of [e.target,document.activeElement])if(el&&/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))return;
  const text=(e.clipboardData||root.clipboardData)?.getData('text');if(!text)return;
  e.preventDefault();take(text,points.length,'');
 });

 // ---- adding points, with the grid held once the first is down ----
 // Alerts are the converter's own, so both tabs say the same thing the same way.
 let pending=null;
 const crossings=new Set();
 async function admit(incoming,commit){
  incoming=incoming.filter(RouteTools.valid);if(!incoming.length)return false;
  if(points.length+incoming.length>20000){status('20,000 point limit reached. Export or clear this collection first.');return false;}
  // The first point decides the grid when it lands somewhere other than the crosshair.
  if(!points.length)enterArea(localAt(incoming[0].lat,incoming[0].lon));
  pending=commit;
  if(!incoming.every(p=>fits(system,p))){
   const outside=incoming.filter(p=>!fits(system,p)).length,country=presetName(system).replace(/ MGR$/,'');
   const answer=await ask({title:incoming.length===1?'This point is outside '+country:outside+' of these points are outside '+country,
    detail:presetName(system)+' only covers '+country+', so it cannot write '+(outside===1?'this point':'them')+'. To add '+(incoming.length===1?'it':'them')+', every point in this list has to be written in Global MGRS or Coordinates instead.',
    confirm:'Use Global MGRS',alt:'Use Coordinates'});
   if(!answer||pending!==commit){pending=null;return false;}
   const before=snapshot();
   system=answer==='alt'?'wgs84':'mgrs';preferred=system;written=null;pending=null;commit();
   // The grid change and the point that forced it are one step to undo.
   undo[undo.length-1]=before;
   return true;
  }
  // Crossing out of point 1's reference area changes how references are written, so
  // it is said once for each new area, as the converter says it.
  const was=boundary(points,system),now=boundary([...points,...incoming],system);
  if(now&&now.key!==was?.key&&!crossings.has(now.key)){
   const answer=await ask({title:'Points cross a grid boundary',detail:now.detail});
   if(answer!=='confirm'||pending!==commit){pending=null;return false;}
   crossings.add(now.key);
  }
  pending=null;commit();return true;
 }
 const closeGridDialog=()=>{pending=null;};
 function add(p){
  admit([p],()=>{remember();points.push({...p,name:'',breakBefore:points.length===0});refresh();});
 }

 function draw(){if(!map)return;markers.clearLayers();
  points.forEach((p,i)=>{if(points.length>1000){L.circleMarker([p.lat,p.lon],{radius:2,weight:0,fillOpacity:.8,fillColor:'#2563eb',interactive:false}).addTo(markers);return;}
   MapSupport.marker(map,{...p,number:i+1}).addTo(markers);
  });
  drawRoute();
  labels?.run();
 }
 function drawRoute(){if(!route)return;route.clearLayers();
  if(connected){let segment=[];const flush=()=>{if(segment.length>1)L.polyline(segment,{color:'#2563eb',weight:3,interactive:false}).addTo(route);segment=[];};for(const p of points){if(p.breakBefore)flush();segment.push([p.lat,p.lon]);}flush();}
 }
 function fit(){if(points.length&&map)map.fitBounds(L.latLngBounds(points.map(p=>[p.lat,p.lon])),{padding:[35,35],maxZoom:16});}
 function layerButtons(){for(const b of document.querySelectorAll('.field-tools [data-layer]'))b.setAttribute('aria-pressed',String(b.dataset.layer===layer));}
 function init(){
  const guess=MapSupport.approximateLocation({helper});const initial=RouteTools.valid(view)?view:guess.current();
  map=L.map('fieldMap',{preferCanvas:true,fadeAnimation:false,worldCopyJump:true,maxZoom:19,zoomControl:false}).setView([initial.lat,initial.lon],initial.zoom||10);
  MapSupport.clampLatitude(map);
  map.attributionControl.setPrefix(false);
  map.createPane('broadLand').style.zIndex='160';
  // Every map button in one stack, in the corner a thumb reaches.
  MapSupport.locate(map,{position:'bottomright',onStatus:text=>{if(text||!$('fieldStatus').textContent.startsWith('Finding'))status(text);}});
  autoZoom=MapSupport.autoZoom(map,()=>points);
  L.control.zoom({position:'bottomright'}).addTo(map);
  mapHistory=MapSupport.historyButtons(map,{onUndo:()=>$('fieldUndo').click(),onRedo:()=>$('fieldRedo').click()});
  labels=MapSupport.labelLayout(map,{toggle:$('fieldLabels')});
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
  markers=L.layerGroup().addTo(map);route=L.layerGroup().addTo(map);grid=createCoordinateGrid(map,{system:()=>system,projection,contains:presetHolds,enabled:()=>$('fieldGrid').checked,fine:fineGrid});
  fullScreen=MapSupport.fullscreen(map);
  imageExport=MapSupport.saveImage(map,{onStatus:status});
  let touched=false;map.on('movestart',()=>{touched=true;});
  guess.ready.then(p=>{if(!touched&&!view&&!points.length)map.setView([p.lat,p.lon],p.zoom);});
  map.on('moveend',()=>{const p=map.getCenter();view={lat:p.lat,lon:MapSupport.longitude(p.lng),zoom:map.getZoom()};moved();});
  $('fieldAdd').onclick=()=>{const p=map.getCenter();add({lat:p.lat,lon:MapSupport.longitude(p.lng)});};
  new ResizeObserver(()=>requestAnimationFrame(()=>{map.invalidateSize({pan:false});grid.refresh();})).observe($('fieldMap'));
  historyButtons();draw();if(points.length)fit();moved();target.update();offerGrids();detail();grid.refresh();
 }
 $('fieldFormat').value=system;
 layerButtons();
 $('fieldFormat').onchange=()=>{
  const next=$('fieldFormat').value;
  if(points.length&&!points.every(p=>fits(next,p))){$('fieldFormat').value=system;return;}
  if(points.length)remember();
  // Remember a global grid picked where a country grid would serve, per country.
  const centre=map&&map.getCenter(),home=points.length?homeGrid(points):centre?localAt(centre.lat,centre.lng):null;
  const known=home&&choices[home]===next;
  if(home){if(next===home)delete choices[home];else if(next==='mgrs')choices[home]=next;}
  system=next;preferred=isCountry(system)?null:system;written=null;
  if(home&&next==='mgrs'&&!known&&gridChoiceAlert)ask(gridChoiceAlert(home,next)).then(answer=>{if(answer==='alt'){$('fieldFormat').value=home;$('fieldFormat').onchange();}});
  const region=MapSupport.regions.find(r=>r.id===system);
  // Choosing a country grid also navigates there; Auto-Zoom returns to the points.
  if(map&&region)map.setView([region.lat,region.lon],region.zoom,{animate:false});
  if(map){const c=map.getCenter();area=localAt(c.lat,c.lng);}
  refresh();
 };
 $('fieldRoute').onchange=()=>{remember();connected=$('fieldRoute').checked;if(connected&&points.every(p=>p.breakBefore))points.forEach((p,i)=>p.breakBefore=i===0);drawRoute();$('fieldDistance').textContent=connected?RouteTools.summary(points):'';save();};
 const gridChoice=MapSupport.gridToggle($('fieldGrid'),()=>grid?.refresh());
 $('fieldSnapshot').onclick=()=>imageExport?.save();
 $('fieldDone').onclick=()=>{fullScreen?.exit();$('fieldTap').checked=false;$('fieldTap').onchange();$('fieldTap').focus();};
 $('fieldTap').onchange=()=>{$('view-field').classList.toggle('tap-mode',$('fieldTap').checked);render();target?.update();};
 // With the list empty again, the grid is free to follow the map once more.
 const unlocked=()=>{if(!points.length&&map){area=undefined;moved();}};
 // With the crosshair in use, stepping back puts it on the last point still listed,
 // where the undone pick was made from, and stepping forward on the point restored.
 const recentre=()=>{const last=points.at(-1);if(map&&last&&!$('fieldTap').checked)map.panTo([last.lat,last.lon]);};
 $('fieldUndo').onclick=()=>{const old=undo.pop();if(old){redo.push(snapshot());restore(old);unlocked();recentre();}};
 $('fieldRedo').onclick=()=>{const next=redo.pop();if(next){undo.push(snapshot());restore(next);unlocked();recentre();}};
 document.addEventListener('keydown',e=>{
  if(!(e.ctrlKey||e.metaKey)||e.key.toLowerCase()!=='z'||!$('view-field').classList.contains('on')||document.querySelector('.overlay.open'))return;
  const el=document.activeElement;if(el&&/^(INPUT|TEXTAREA)$/.test(el.tagName)&&!el.readOnly)return;
  e.preventDefault();$(e.shiftKey?'fieldRedo':'fieldUndo').click();
 });
 $('fieldPoints').addEventListener('click',e=>{if(e.target.closest('.del'))unlocked();});
 $('fieldClear').onclick=()=>{remember();points=[];refresh();unlocked();status('');};
 $('fieldCopy').onclick=async()=>{try{const write=writer();const rows=points.map(p=>[...write.cells(p),(p.name||'').replace(/[\t\r\n]/g,' ')].filter(Boolean).join('\t')).join('\n');await navigator.clipboard.writeText(rows);status('');}catch(e){status('Could not copy: '+e.message);}};
 $('fieldExport').onclick=()=>{const url=URL.createObjectURL(new Blob([RouteTools.gpx(points,connected)],{type:'application/gpx+xml'}));const a=document.createElement('a');a.href=url;a.download='mike-golf-romeo.gpx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 $('fieldMaps').onclick=()=>onMaps(points.map((p,i)=>({...p,number:i+1})));
 $('fieldConvert').onclick=()=>{if(points.length>2000){status('Use GPX export for tracks over 2,000 points. The converter table supports smaller collections.');return;}onConvert(points,connected,system);};
 $('fieldImport').onclick=()=>$('fieldFile').click();
 $('fieldFile').onchange=async()=>{const file=$('fieldFile').files[0];$('fieldFile').value='';if(!file)return;try{if(file.size>20*1024*1024)throw Error('GPX files must be smaller than 20 MB.');const result=RouteTools.parse(await file.text());
  admit(result.points,()=>{remember();points.push(...result.points);connected=connected||result.connected;refresh();fit();status('');});
 }catch(e){status(e.message);}};
 render();return {open(){
  // Opening the map always shows every point collected.
  gridChoice.sync();
  if(!map)init();else if(points.length)fit();
  written=null;render();target.update();requestAnimationFrame(()=>{map.invalidateSize({pan:false});grid.refresh();});},getPoints:()=>points.map(p=>({...p}))};
};
})(globalThis);
