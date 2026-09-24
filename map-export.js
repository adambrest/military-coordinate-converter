/* Render the current geographic frame on a larger, isolated map. */
(function(root){
 'use strict';
 const MAX_PIXELS=16000000,MAX_EDGE=8192;
 function dimensions(size){
  const scale=Math.min(MAX_EDGE/size.x,MAX_EDGE/size.y,Math.sqrt(MAX_PIXELS/(size.x*size.y)));
  const width=Math.max(1,Math.floor(size.x*scale)),height=Math.max(1,Math.floor(size.y*scale));
  return {width,height,scale:Math.min(width/size.x,height/size.y)};
 }
 const copyContent=value=>value?.cloneNode?value.cloneNode(true):value;
 function cloneLayer(layer,target){
  if(layer.snapshotFactory){layer.snapshotFactory(target);return;}
  const options={...layer.options,interactive:false};delete options.renderer;
  let copy;
  if(layer instanceof L.TileLayer){
   copy=new layer.constructor(layer._url,{...options,crossOrigin:'anonymous',keepBuffer:0,maxZoom:30,minZoom:0});
   MapSupport.seamless(copy);
   copy.snapshotErrors=new Set();
   copy.on('tileerror',e=>copy.snapshotErrors.add(e.coords.x+':'+e.coords.y+':'+e.coords.z));
   copy.on('tileload',e=>copy.snapshotErrors.delete(e.coords.x+':'+e.coords.y+':'+e.coords.z));
  }else if(layer instanceof L.Circle){copy=L.circle(layer.getLatLng(),{...options,radius:layer.getRadius()});}
  else if(layer instanceof L.CircleMarker){copy=L.circleMarker(layer.getLatLng(),options);}
  else if(layer instanceof L.Polygon){copy=L.polygon(layer.getLatLngs(),options);}
  else if(layer instanceof L.Polyline){copy=L.polyline(layer.getLatLngs(),options);}
  else if(layer instanceof L.Marker){
   const icon=layer.options.icon;
   if(icon instanceof L.DivIcon)options.icon=L.divIcon({...icon.options,html:copyContent(icon.options.html)});
   copy=L.marker(layer.getLatLng(),options);
  }
  if(!copy)return;
  const tooltip=layer.getTooltip?.();
  if(tooltip&&layer.isTooltipOpen())copy.bindTooltip(copyContent(tooltip.getContent()),{...tooltip.options,interactive:false});
  copy.addTo(target);return copy;
 }
 function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let n=0;n<8;n++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;}return (crc^0xffffffff)>>>0;}
 async function metadata(blob,credits,frame){
  const bytes=new Uint8Array(await blob.arrayBuffer());
  const value=new TextEncoder().encode('Source\0\0\0\0\0'+credits+'\nView: '+JSON.stringify(frame));
  const chunk=new Uint8Array(value.length+12),view=new DataView(chunk.buffer);
  view.setUint32(0,value.length);chunk.set([105,84,88,116],4);chunk.set(value,8);view.setUint32(chunk.length-4,crc32(chunk.subarray(4,-4)));
  // IHDR is always the first PNG chunk (33 bytes including the signature).
  return new Blob([bytes.subarray(0,33),chunk,bytes.subarray(33)],{type:'image/png'});
 }
 root.createMapSnapshot=function(source,{onStatus=()=>{}}={}){
  let busy=false,note;
  const status=L.control({position:'bottomleft'});
  status.onAdd=()=>{note=L.DomUtil.create('div','map-export-status');note.setAttribute('role','status');return note;};status.addTo(source);
  const say=text=>{note.textContent=text;onStatus(text);};
  const button=MapSupport.mapButton(source,{position:'topleft',className:'map-save-image',title:'Save this map view',icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4"/><circle cx="16" cy="8" r="1"/></svg>',onClick:()=>save()});
  async function save({points=[]}={}){
   if(busy)return;busy=true;button.busy(true);
   let target,stage;
   try{
    source.stop();
    const size=source.getSize();if(!size.x||!size.y)throw Error('Open the map before taking a snapshot.');
    const center=source.getCenter(),zoom=source.getZoom(),frame={center:{lat:center.lat,lon:center.lng},zoom,bounds:source.getBounds().toBBoxString()};
    const {width,height,scale}=dimensions(size);let exportZoom=zoom+Math.log2(scale);
    // Capture the layer set now; asynchronous tile loading must not refit the live map.
    const layers=[];source.eachLayer(layer=>layers.push(layer));
    const credits=[...new Set(layers.map(layer=>layer.getAttribution?.()).filter(Boolean))].join(' | ');
    const plain=document.createElement('div');plain.innerHTML=credits;
    const creditText=plain.textContent+' '+[...plain.querySelectorAll('a[href]')].map(a=>a.href).join(' ');
    say('Preparing '+width+' × '+height+' snapshot…');
    stage=document.createElement('div');stage.className='snapshot-stage';stage.style.width=width+'px';stage.style.height=height+'px';document.body.append(stage);
    for(const name of ['map-quiet','map-faint','map-broad','labels-off'])stage.classList.toggle(name,source.getContainer().classList.contains(name));
    target=L.map(stage,{zoomSnap:0,zoomAnimation:false,fadeAnimation:false,attributionControl:false,zoomControl:false,preferCanvas:true,trackResize:false,maxZoom:30,minZoom:0,dragging:false,scrollWheelZoom:false,doubleClickZoom:false,touchZoom:false,keyboard:false}).setView(center,exportZoom,{animate:false});
    if(points.length){
     target.fitBounds(points.map(p=>[p.lat,p.lon]),{padding:[40*scale,40*scale],maxZoom:16+Math.log2(scale),animate:false});
     exportZoom=target.getZoom();const fitted=target.getCenter();frame.center={lat:fitted.lat,lon:fitted.lng};frame.zoom=exportZoom-Math.log2(scale);frame.bounds=target.getBounds().toBBoxString();
    }
    for(const [name,pane] of Object.entries(source.getPanes())){
     if(!target.getPane(name))target.createPane(name);
     if(pane.style.zIndex)target.getPane(name).style.zIndex=pane.style.zIndex;
    }
    const tiles=[];
    for(const layer of layers){
     const copy=cloneLayer(layer,target);if(copy instanceof L.TileLayer)tiles.push(copy);
    }
    // Use the deepest imagery which covers this entire frame, not just its center.
    for(const tile of tiles.filter(tile=>tile._url.includes('World_Imagery'))){
     try{
      const native=await MapSupport.imageryZoom(target.getCenter().lat,target.getCenter().lng,width,height,url=>fetch(url,{signal:AbortSignal.timeout(5000)}),exportZoom);
      if(native!==tile.options.maxNativeZoom){tile.options.maxNativeZoom=native;tile.snapshotErrors.clear();tile.redraw();}
     }catch(_){/* The already-established native ceiling remains usable. */}
    }
    const deadline=Date.now()+30000;
    while(tiles.some(tile=>tile.isLoading())){
     if(Date.now()>deadline)throw Error('Snapshot tiles took too long to load. Try again when the connection improves.');
     await new Promise(resolve=>setTimeout(resolve,100));
    }
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(tiles.some(tile=>tile.snapshotErrors.size))throw Error('Some snapshot tiles are unavailable. Try another layer or a smaller area.');
    for(const tile of stage.querySelectorAll('img.leaflet-tile'))if(!tile.complete||!tile.naturalWidth)throw Error('Some snapshot tiles are unavailable. Try another layer or a smaller area.');
    for(const canvas of stage.querySelectorAll('canvas'))canvas.toDataURL();
    const canvas=await root.html2canvas(stage,{useCORS:true,allowTaint:false,logging:false,scale:1,width,height,windowWidth:width,windowHeight:height,ignoreElements:el=>el.classList?.contains('leaflet-control')});
    const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!png)throw Error('The device could not create a snapshot at this size.');
    const blob=await metadata(png,creditText,frame),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='mike-golf-romeo-map.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);say('');
    return {width,height,frame};
   }catch(error){say(error.message||'Could not save the snapshot.');}
   finally{target?.remove();stage?.remove();busy=false;button.busy(false);}
  }
  return {save};
 };
 root.createMapSnapshot.dimensions=dimensions;
})(globalThis);
