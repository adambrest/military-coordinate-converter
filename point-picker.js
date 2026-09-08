/* Crosshair point selection. Only visible street/satellite tiles are requested. */
(function(root){
  "use strict";
  root.createPointPicker=function({preview,onConfirm}){
    const $=id=>document.getElementById(id),overlay=$("pointOverlay");
    const STREET_ZOOM=7;
    let map,countries,labels,markers,streets,satellite,options={},returnFocus,frame,stableCenter,limitCenter;
    // Beyond the imagery a provider actually holds for an area the tiles are only
    // enlarged, so stopping there keeps the crosshair from implying detail that
    // is not in the picture.
    const DETAIL_ZOOM=19;
    let mode="street",countryData=[],countryGeometry,worldKey,cancelTap,busy=false,background=[],tileErrors=new Set();
    const textNode=text=>{const el=document.createElement("span");el.textContent=text;return el;};
    function center(){const p=map.getCenter();return {lat:p.lat,lon:MapSupport.longitude(p.lng)};}
    function toggle(layer,show){if(show&&!map.hasLayer(layer))layer.addTo(map);else if(!show&&map.hasLayer(layer))map.removeLayer(layer);}
    function networkStatus(){
      const active=mode==="satellite"?satellite:streets;
      $("pointNetwork").hidden=!active||(!tileErrors.has(active)&&navigator.onLine!==false);
      $("pointNetwork").textContent="Map imagery is unavailable here. Try the other layer or check your connection.";
    }
    function layers(){
      const zoom=map.getZoom(),broad=zoom<STREET_ZOOM;
      // Keep the same tile layer throughout pinch zoom; the offline country
      // geometry stays underneath while new tiles load.
      toggle(streets,mode==="street");toggle(satellite,mode==="satellite");
      const worlds=MapSupport.worlds(map),key=worlds.join(',');
      if(countryGeometry&&worldKey!==key){countries.clearLayers();for(const offset of worlds)countries.addData(MapSupport.repeatGeometry(countryGeometry,offset));worldKey=key;}
      toggle(labels,broad);labels.clearLayers();
      if(broad){
        const bounds=map.getBounds();
        for(const p of countryData)for(const offset of worlds){
          if(zoom<p.MIN_LABEL||!bounds.contains([p.LABEL_Y,p.LABEL_X+offset]))continue;
          if(mode==="street"&&p.NAME!=="Singapore"&&!tileErrors.has(streets))continue;
          if(p.NAME==="Singapore")L.circleMarker([p.LABEL_Y,p.LABEL_X+offset],{radius:3,color:'#fff',weight:1,fillColor:'#334155',fillOpacity:1,interactive:false}).addTo(labels);
          L.marker([p.LABEL_Y,p.LABEL_X+offset],{interactive:false,keyboard:false,icon:L.divIcon({className:"country-name"+(p.NAME==="Singapore"?" singapore-name":""),html:textNode(p.NAME),iconSize:[110,20],iconAnchor:[55,p.NAME==="Singapore"?26:10]})}).addTo(labels);
        }
      }
      $("pointStreet").setAttribute("aria-pressed",String(mode==="street"));
      $("pointSatellite").setAttribute("aria-pressed",String(mode==="satellite"));
      networkStatus();
    }
    function update(){
      if(!map||!overlay.classList.contains("open"))return;
      const p=center(),result=preview(p,options);
      $("pointCoordinate").textContent=result.error?"":result.cells.join(" ");
      $("pointFormatPreview").textContent=result.error||result.area||"";
      $("pointFormatPreview").classList.toggle("invalid",!!result.error);
      $("pointConfirm").disabled=!!result.error||busy;
      $("pointContinue").disabled=!!result.error||busy;
    }
    function drawPoints(points){
      markers.clearLayers();
      for(const p of points){
        MapSupport.marker(map,p,()=>map.panTo([p.lat,p.lon],{animate:false})).addTo(markers);
      }
      $("pointCount").textContent=points.length+" existing point"+(points.length===1?"":"s");
      $("pointUnresolved").hidden=!options.unresolved;
      $("pointUnresolved").textContent=options.unresolved+" incomplete or unresolved row"+(options.unresolved===1?" is":"s are")+" not shown on the map.";
    }
    function init(){
      map=L.map("pointMap",{minZoom:1,maxZoom:22,worldCopyJump:true,maxBoundsViscosity:1,preferCanvas:true,zoomControl:true,keyboard:true,trackResize:false});
      map.attributionControl.setPrefix(false);L.control.scale({imperial:false}).addTo(map);
      map.createPane("pointCountries").style.zIndex="150";
      map.createPane("offlineLand").style.zIndex="160";
      MapSupport.context(map,p=>map.panTo([p.lat,p.lon],{animate:false}));
      MapSupport.trainingArea(map);
      MapSupport.navigation(map,$("pointRegion"));
      limitCenter=MapSupport.limitCenter(map);
      countries=L.geoJSON(null,{pane:"pointCountries",interactive:false,style:{color:"#90a5b5",weight:.8,fillColor:"#f2f0e9",fillOpacity:1}}).addTo(map);
      map.attributionControl.addAttribution('<a href="https://www.naturalearthdata.com/">Natural Earth</a>');
      labels=L.layerGroup().addTo(map);markers=L.layerGroup().addTo(map);
      streets=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{minZoom:1,maxNativeZoom:19,maxZoom:22,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'});
      satellite=L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxNativeZoom:19,maxZoom:22,attribution:'Imagery © <a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9">Esri, Vantor, Earthstar Geographics, GIS User Community</a>'});
      // Imagery must sit above the offline land; borders remain visible at broad zoom.
      satellite.setZIndex(220);streets.setZIndex(230);
      for(const layer of [streets,satellite]){
        layer.on("loading",()=>tileErrors.delete(layer));
        layer.on("tileerror",()=>{tileErrors.add(layer);networkStatus();});
        layer.on("load",networkStatus);
      }
      fetch("vendor/countries.geojson").then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
        countryGeometry=data;countryData=data.features.map(f=>f.properties).filter(p=>Number.isFinite(p.LABEL_X)&&Number.isFinite(p.LABEL_Y)&&p.NAME!=="Singapore");
        countryData.push({NAME:"Singapore",LABEL_X:103.82,LABEL_Y:1.35,MIN_LABEL:1});
        if(!countryData.some(p=>p.NAME==="Brunei"))countryData.push({NAME:"Brunei",LABEL_X:114.75,LABEL_Y:4.5,MIN_LABEL:5});
        layers();
      }).catch(()=>{$("pointNetwork").hidden=false;$("pointNetwork").textContent="Country overview unavailable. Zoom in for street detail or choose Satellite.";});
      map.on("move zoom",()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update);});
      map.on("moveend zoomend",()=>{const p=map.getCenter();stableCenter={lat:p.lat,lng:p.lng};layers();update();});
      cancelTap=MapSupport.pointGestures(map);
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
      cancelTap?.();map?.stop();overlay.classList.remove("open");cancelAnimationFrame(frame);
      for(const [el,inert] of background)el.inert=inert;
      background=[];returnFocus?.focus();
    }
    async function confirm(keepOpen){
      if(busy||!overlay.classList.contains("open")||$("pointConfirm").disabled)return;
      let failure;
      busy=true;update();
      try{
        map.stop();
        const point=center();let result=onConfirm(point,{zoom:map.getZoom(),layer:mode});
        if(result?.then)result=await result;
        if(result?.canceled)return;
        if(result?.error){failure=result.error;return;}
        if(keepOpen){options={...options,...result};drawPoints(options.points||[]);$("pointAdded").textContent="Point added.";}
        else close();
      }catch(error){failure="Could not add this point. "+error.message;}
      finally{busy=false;if(overlay.classList.contains("open")){update();if(failure){$("pointFormatPreview").textContent=failure;$("pointFormatPreview").classList.add("invalid");}}}
    }
    $("pointClose").addEventListener("click",close);
    $("pointConfirm").addEventListener("click",()=>confirm(false));$("pointContinue").addEventListener("click",()=>confirm(true));
    $("pointStreet").addEventListener("click",()=>{mode="street";layers();});
    $("pointSatellite").addEventListener("click",()=>{mode="satellite";layers();});
    overlay.addEventListener("keydown",e=>{
      if(e.key==="Escape"&&!busy){e.preventDefault();close();}
      if(e.key==="Enter"&&e.target===$("pointMap")){e.preventDefault();confirm(false);}
      if(e.key==="Tab"){
        const nodes=[...overlay.querySelectorAll('button:not(:disabled),[tabindex="0"],a[href]')].filter(el=>el.getClientRects().length);
        if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1)?.focus();}
        else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}
      }
    });
    return {open(opts){
      options=opts;returnFocus=document.activeElement;mode=opts.layer||mode;busy=false;
      overlay.classList.add("open");$("pointAdded").textContent="";
      background=[...document.querySelectorAll("body > header, body > main")].map(el=>{const previous=el.inert;el.inert=true;return [el,previous];});
      if(!map)init();
      limitCenter(null);map.setMinZoom(1);map.setMaxZoom(opts.detailZoom||DETAIL_ZOOM);map.invalidateSize({pan:false});
      $("pointRegion").hidden=!!opts.bounds;
      map.invalidateSize({pan:false});
      // The crosshair, not the whole viewport, is what has to stay in the area.
      if(opts.bounds){const b=L.latLngBounds(opts.bounds);map.setMinZoom(Math.max(1,Math.min(map.getMaxZoom(),map.getBoundsZoom(b))));limitCenter(b);}
      $("pointPreset").textContent=opts.presetLabel;
      map.invalidateSize();map.setView([opts.center.lat,opts.center.lon],Math.min(map.getMaxZoom(),Math.max(map.getMinZoom(),opts.zoom||12)),{animate:false});
      drawPoints(opts.points||[]);layers();update();
      map.invalidateSize({pan:false,animate:false});map.setView([opts.center.lat,opts.center.lon],Math.min(map.getMaxZoom(),Math.max(map.getMinZoom(),opts.zoom||map.getZoom())),{animate:false,reset:true});$("pointMap").focus();
    }};
  };
})(globalThis);
