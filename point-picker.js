/* Crosshair point selection. Only visible street/satellite tiles are requested. */
(function(root){
  "use strict";
  root.createPointPicker=function({preview,onConfirm,onViewChange,projection,contains,capture,retract}){
    const $=id=>document.getElementById(id),overlay=$("pointOverlay");
    const STREET_ZOOM=7;
    let map,countries,labels,markers,streets,topo,satellite,options={},returnFocus,frame,stableCenter,limitCenter,pointAutoZoom,grid,target;
    // Beyond the imagery a provider actually holds for an area the tiles are only
    // enlarged, so stopping there keeps the crosshair from implying detail that
    // is not in the picture.
    const DETAIL_ZOOM=19;
    let coverageKey="",coverageToken=0,coveragePending=false,coverageTimer,coverageFailed=false;
    let mode=MapSupport.DEFAULT_BASEMAP,countryData=[],countryGeometry,worldKey,cancelTap,busy=false,background=[],tileErrors=new Set(),slowLayers=new Set();
    const textNode=text=>{const el=document.createElement("span");el.textContent=text;return el;};
    function center(){const p=map.getCenter();return {lat:p.lat,lon:MapSupport.longitude(p.lng)};}
    function toggle(layer,show){if(show&&!map.hasLayer(layer))layer.addTo(map);else if(!show&&map.hasLayer(layer))map.removeLayer(layer);}
    function activeLayer(){return mode==="satellite"?satellite:mode==="topo"?topo:streets;}
    function networkStatus(){
      const active=activeLayer();
      const failed=!!active&&(tileErrors.has(active)||navigator.onLine===false||coverageFailed);
      $("pointNetwork").hidden=!failed&&!(active&&slowLayers.has(active));
      // A slow link still works: the crosshair and Add need no imagery at all.
      $("pointNetwork").textContent=failed?"Map imagery is unavailable here. Try the other layer or check your connection."
        :"Weak connection: imagery is loading slowly. You can still move the crosshair and add points.";
    }
    function checkCoverage(){
      if(!map||!overlay.classList.contains("open"))return;
      if(mode!=="satellite"){
        clearTimeout(coverageTimer);coverageToken++;coverageKey="";coveragePending=false;coverageFailed=false;
        map.setMaxZoom(DETAIL_ZOOM);return;
      }
      const p=center(),size=map.getSize(),pixel=map.project([p.lat,p.lon],19);
      const key=[Math.floor(pixel.x),Math.floor(pixel.y),size.x,size.y].join(',');
      if(key===coverageKey)return;
      clearTimeout(coverageTimer);coverageKey=key;const token=++coverageToken;coveragePending=true;coverageFailed=false;
      // Coverage changes the zoom ceiling, never the selected basemap.
      layers();
      coverageTimer=setTimeout(async()=>{
        try{
          const zoom=await MapSupport.imageryZoom(p.lat,p.lon,size.x,size.y,url=>fetch(url,{signal:AbortSignal.timeout(5000)}));
          if(token!==coverageToken||mode!=="satellite")return;
          // The ceiling stops the reader going deeper; this stops the layer asking for
          // what is not there on the way. Without it Leaflet still believes in native
          // tiles to 19 and requests them, and Esri answers a hole.
          coveragePending=false;
          const before=satellite.options.maxNativeZoom;
          satellite.options.maxNativeZoom=zoom;map.setMaxZoom(zoom);
          // Tiles already on screen were chosen under the old ceiling, and Leaflet holds
          // the depth it picked until a zoom moves it. Re-adding the layer makes it work
          // the depth out again, so imagery sharpens as soon as coverage says it can.
          if(before!==zoom&&map.hasLayer(satellite)){satellite.remove();satellite.addTo(map);}
          layers();
        }catch(_){
          if(token!==coverageToken)return;
          coveragePending=false;coverageFailed=true;coverageKey="";layers();
        }
      },150);
    }
    function layers(){
      const zoom=map.getZoom(),broad=zoom<STREET_ZOOM;
      // Keep the same tile layer throughout pinch zoom; the offline country
      // geometry stays underneath while new tiles load.
      toggle(streets,mode==="street");toggle(topo,mode==="topo");toggle(satellite,mode==="satellite");
      const worlds=MapSupport.worlds(map),key=worlds.join(',');
      if(countryGeometry&&worldKey!==key){countries.clearLayers();for(const offset of worlds)countries.addData(MapSupport.repeatGeometry(countryGeometry,offset));worldKey=key;}
      toggle(labels,broad);labels.clearLayers();
      if(broad){
        const bounds=map.getBounds();
        for(const p of countryData)for(const offset of worlds){
          if(zoom<p.MIN_LABEL||!bounds.contains([p.LABEL_Y,p.LABEL_X+offset]))continue;
          // Street and topo both carry their own names; only imagery needs ours.
          if(mode!=="satellite"&&p.NAME!=="Singapore"&&!tileErrors.has(activeLayer()))continue;
          if(p.NAME==="Singapore")L.circleMarker([p.LABEL_Y,p.LABEL_X+offset],{radius:3,color:'#fff',weight:1,fillColor:'#334155',fillOpacity:1,interactive:false}).addTo(labels);
          L.marker([p.LABEL_Y,p.LABEL_X+offset],{interactive:false,keyboard:false,icon:L.divIcon({className:"country-name"+(p.NAME==="Singapore"?" singapore-name":""),html:textNode(p.NAME),iconSize:[110,20],iconAnchor:[55,p.NAME==="Singapore"?26:10]})}).addTo(labels);
        }
      }
      $("pointTopo").setAttribute("aria-pressed",String(mode==="topo"));
      $("pointStreet").setAttribute("aria-pressed",String(mode==="street"));
      $("pointSatellite").setAttribute("aria-pressed",String(mode==="satellite"));
      networkStatus();
    }
    function update(){
      if(!map||!overlay.classList.contains("open"))return;
      // Viewing results has no crosshair, so there is no candidate point to preview.
      if(options.readOnly){$("pointCoordinate").textContent="";$("pointFormatPreview").textContent="";$("pointFormatPreview").classList.remove("invalid");$("pointConfirm").disabled=true;$("pointContinue").disabled=true;return;}
      const p=target?target.current():center(),result=preview(p,options);
      $("pointCoordinate").textContent=result.error?"":result.cells.join(" ");
      $("pointFormatPreview").textContent=result.error||result.area||"";
      $("pointFormatPreview").classList.toggle("invalid",!!result.error);
      $("pointConfirm").disabled=!!result.error||busy;
      $("pointContinue").disabled=!!result.error||busy;
    }
    function drawPoints(points){
      markers.clearLayers();
      for(const p of points){
        MapSupport.marker(map,p).addTo(markers);
      }
      $("pointCount").textContent=points.length+(options.readOnly?" output point":" existing point")+(points.length===1?"":"s");
      pointAutoZoom&&pointAutoZoom.sync();
      // Adding point by point, the running distance is worth seeing straight away.
      const run=globalThis.RouteTools&&points.length>1?RouteTools.summary(points.map(p=>({...p,breakBefore:false}))):"";
      $("pointDistance").textContent=run;
      $("pointUnresolved").hidden=!options.unresolved;
      $("pointUnresolved").textContent=options.unresolved+" incomplete or unresolved row"+(options.unresolved===1?" is":"s are")+" not shown on the map.";
    }
    function init(){
      map=L.map("pointMap",{minZoom:1,maxZoom:22,worldCopyJump:true,maxBoundsViscosity:1,preferCanvas:true,zoomControl:false,keyboard:true,trackResize:false});
      map.attributionControl.setPrefix(false);L.control.scale({imperial:false}).addTo(map);
      map.createPane("pointCountries").style.zIndex="150";
      map.createPane("offlineLand").style.zIndex="160";
      MapSupport.context(map);
      MapSupport.trainingArea(map);
      MapSupport.navigation(map,$("pointRegion"),null,{snap:false});
      limitCenter=MapSupport.limitCenter(map);
      countries=L.geoJSON(null,{pane:"pointCountries",interactive:false,style:{color:"#90a5b5",weight:.8,fillColor:"#f2f0e9",fillOpacity:1}}).addTo(map);
      map.attributionControl.addAttribution('<a href="https://www.naturalearthdata.com/">Natural Earth</a>');
      labels=L.layerGroup().addTo(map);markers=L.layerGroup().addTo(map);
      streets=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{minZoom:1,maxNativeZoom:19,maxZoom:22,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'});
      // Starts at the depth imagery reaches almost everywhere, and coverage raises it
      // where there is more. Guessing high the other way asks Esri for tiles it does
      // not have, and a hole is worse to look at than a softened one.
      satellite=L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxNativeZoom:18,maxZoom:22,attribution:'Imagery © <a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9">Esri, Vantor, Earthstar Geographics, GIS User Community</a>'});
      topo=MapSupport.basemap("topo",{minZoom:1,maxZoom:22});
      // Imagery must sit above the offline land; borders remain visible at broad zoom.
      satellite.setZIndex(220);streets.setZIndex(230);topo.setZIndex(230);
      for(const layer of [streets,topo,satellite]){
        let slowTimer;
        layer.on("loading",()=>{tileErrors.delete(layer);clearTimeout(slowTimer);slowTimer=setTimeout(()=>{slowLayers.add(layer);networkStatus();},6000);});
        layer.on("tileerror",()=>{tileErrors.add(layer);networkStatus();});
        layer.on("load",()=>{clearTimeout(slowTimer);slowLayers.delete(layer);networkStatus();});
      }
      fetch("vendor/countries.geojson").then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
        countryGeometry=data;countryData=data.features.map(f=>f.properties).filter(p=>Number.isFinite(p.LABEL_X)&&Number.isFinite(p.LABEL_Y)&&p.NAME!=="Singapore");
        countryData.push({NAME:"Singapore",LABEL_X:103.82,LABEL_Y:1.35,MIN_LABEL:1});
        if(!countryData.some(p=>p.NAME==="Brunei"))countryData.push({NAME:"Brunei",LABEL_X:114.75,LABEL_Y:4.5,MIN_LABEL:5});
        layers();
      }).catch(()=>{$("pointNetwork").hidden=false;$("pointNetwork").textContent="Country overview unavailable. Zoom in for street detail or choose Satellite.";});
      map.on("move zoom",()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update);});
      map.on("moveend zoomend",()=>{const p=map.getCenter();stableCenter={lat:p.lat,lng:p.lng};checkCoverage();layers();update();});
      target=MapSupport.pointTarget(map,{tapMode:()=>$('pointTap').checked,onChange:update});
      grid=root.createCoordinateGrid?.(map,{system:()=>options.presetId==='auto'?'mgrs':options.presetId||'mgrs',projection,contains,enabled:()=>$('pointGrid').checked});
      cancelTap=MapSupport.pointGestures(map,{onTap:p=>{
        if(!$('pointTap').checked||options.readOnly||busy)return;
        target.clicked(p);
        const saved=capture?.(),before=options;
        confirm(true,{lat:p.lat,lon:MapSupport.longitude(p.lng)});
        return ()=>{if(saved&&retract){retract(saved);options=before;drawPoints(options.points||[]);$('pointAdded').textContent='';update();}};
      }});
      // The same button stack as the Point Picker, in the same order.
      MapSupport.locate(map,{position:"bottomright",onStatus:text=>{
        const note=$("pointNetwork");
        if(text){note.hidden=false;note.textContent=text;}else networkStatus();
      }});
      pointAutoZoom=MapSupport.autoZoom(map,()=>options.points||[]);
      L.control.zoom({position:"bottomright"}).addTo(map);
      root.addEventListener("online",networkStatus);root.addEventListener("offline",networkStatus);
      const resize=()=>{
        if(!overlay.classList.contains("open"))return;
        const p=stableCenter||map.getCenter(),zoom=map.getZoom();
        map.invalidateSize({pan:false,animate:false});
        if(options.bounds){map.setMinZoom(1);map.setMinZoom(Math.max(1,Math.min(map.getMaxZoom(),map.getBoundsZoom(L.latLngBounds(options.bounds)))));}
        map.setView(p,Math.min(map.getMaxZoom(),Math.max(map.getMinZoom(),zoom)),{animate:false,reset:true});
      };
      if(root.ResizeObserver)new ResizeObserver(resize).observe($("pointMap"));else root.addEventListener("resize",resize);
    }
    function close(){
      if(map&&!options.readOnly)onViewChange?.({...center(),zoom:map.getZoom(),layer:mode,presetId:options.presetId});
      cancelTap?.();clearTimeout(coverageTimer);coverageToken++;coverageKey="";map?.stop();overlay.classList.remove("open","viewing");cancelAnimationFrame(frame);
      for(const [el,inert] of background)el.inert=inert;
      background=[];returnFocus?.focus();
    }
    async function confirm(keepOpen,chosen){
      if(options.readOnly)return;
      if(busy||!overlay.classList.contains("open")||$("pointConfirm").disabled)return;
      let failure;
      busy=true;update();
      try{
        map.stop();
        const point=chosen||target.current();let result=onConfirm(point,{zoom:map.getZoom(),layer:mode,presetId:options.presetId});
        if(result?.then)result=await result;
        if(result?.canceled)return;
        if(result?.error){failure=result.error;return;}
        if(keepOpen){options={...options,...result};drawPoints(options.points||[]);$("pointAdded").textContent="Point added.";}
        else close();
      }catch(error){failure="Could not add this point. "+error.message;}
      finally{busy=false;if(overlay.classList.contains("open")){update();if(failure){$("pointFormatPreview").textContent=failure;$("pointFormatPreview").classList.add("invalid");}}}
    }
    $('pointGrid').addEventListener('change',()=>grid?.refresh());
    $('pointTap').addEventListener('change',()=>{overlay.querySelector('.point-modal').classList.toggle('tap-mode',$('pointTap').checked);target?.update();});
    $("pointClose").addEventListener("click",close);
    $("pointConfirm").addEventListener("click",()=>confirm(false));$("pointContinue").addEventListener("click",()=>confirm(true));
    $("pointTopo").addEventListener("click",()=>{mode="topo";checkCoverage();layers();});
    $("pointStreet").addEventListener("click",()=>{mode="street";checkCoverage();layers();});
    $("pointSatellite").addEventListener("click",()=>{mode="satellite";checkCoverage();layers();});
    overlay.addEventListener("keydown",e=>{
      if(e.key==="Escape"&&!busy){e.preventDefault();close();}
      if(e.key==="Enter"&&e.target===$("pointMap")&&!options.readOnly){e.preventDefault();confirm(false);}
      if(e.key==="Tab"){
        const nodes=[...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"],a[href]')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
        if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1)?.focus();}
        else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}
      }
    });
    return {open(opts){
      options=opts;returnFocus=document.activeElement;mode=MapSupport.basemapId(opts.layer||mode);busy=false;coverageKey="";coveragePending=mode==="satellite";
      overlay.classList.add("open");overlay.classList.toggle("viewing",!!opts.readOnly);$("pointAdded").textContent="";
      $("pointTitle").textContent=opts.title||"Select a point";
      $("pointMap").setAttribute("aria-label",opts.readOnly
        ?"Output points on a map. Arrow keys pan; plus and minus zoom."
        :"Point map. Arrow keys move the crosshair location; plus and minus zoom; Enter adds the point.");
      background=[...document.querySelectorAll("body > header, body > main")].map(el=>{const previous=el.inert;el.inert=true;return [el,previous];});
      if(!map)init();
      limitCenter(null);map.setMinZoom(1);map.setMaxZoom(opts.detailZoom||DETAIL_ZOOM);map.invalidateSize({pan:false});
      $("pointRegion").hidden=!!opts.bounds;
      map.invalidateSize({pan:false});
      // The crosshair, not the whole viewport, is what has to stay in the area.
      if(opts.bounds){const b=L.latLngBounds(opts.bounds);map.setMinZoom(Math.max(1,Math.min(map.getMaxZoom(),map.getBoundsZoom(b))));limitCenter(b);}
      $("pointPreset").textContent=opts.presetLabel;
      map.invalidateSize();map.setView([opts.center.lat,opts.center.lon],Math.min(map.getMaxZoom(),Math.max(map.getMinZoom(),opts.zoom||12)),{animate:false});
      drawPoints(opts.points||[]);checkCoverage();layers();update();
      map.invalidateSize({pan:false,animate:false});map.setView([opts.center.lat,opts.center.lon],Math.min(map.getMaxZoom(),Math.max(map.getMinZoom(),opts.zoom||map.getZoom())),{animate:false,reset:true});
      if(opts.readOnly&&opts.points?.length){
       const bounds=L.latLngBounds(opts.points.map(p=>[p.lat,p.lon]));
       map.fitBounds(bounds,{padding:[40,40],maxZoom:Math.min(map.getMaxZoom(),16),animate:false});
      }
      grid?.refresh();target.update();
      $("pointMap").focus();
    }};
  };
})(globalThis);
