/* Shared map picker: basemap, projected AO grids and approximate camp landmarks. */
(function(root){
  "use strict";
  root.createAOPicker=function({presets,contains,projection,onSelect}){
    const $=id=>document.getElementById(id);
    let map,grid,selectionLayer,pointLayer,selection,options={},returnFocus,frame;
    const landmarks=[];
    const ids=["sg","taiwan","thailand","australia","brunei"];
    function gridId(){return options.system||options.preset||"mgrs";}
    function localSquare(id,lat,lon){
      const proj=projection(id),en=root.proj4("WGS84",proj,[lon,lat]),e=Math.floor(en[0]/100000),n=Math.floor(en[1]/100000);
      return {id,proj,e,n,prefix:`E${e} N${n}`,polygon:GlobalGrid.square(proj,e*100000,n*100000)};
    }
    function polygon(coords,style,target=grid){
      return L.polygon(coords.map(p=>[p[1],p[0]]),{weight:1,color:"#2563eb",fillOpacity:0,interactive:false,...style}).addTo(target);
    }
    function select(lat,lon){
      lon=Math.max(-180,Math.min(180,lon));selectionLayer.clearLayers();pointLayer.clearLayers();
      $("aoWarning").hidden=true;
      try{
        const id=gridId(lat,lon);
        if(id!=="mgrs"&&!contains(id,lat,lon))throw new Error(`Select an area within ${presets[id].name.replace(" MGR","")}, or change the grid system.`);
        selection=id==="mgrs"?{...GlobalGrid.at(lat,lon),id}:localSquare(id,lat,lon);
        selection.lat=lat;selection.lon=lon;
        polygon(selection.polygon,{weight:3,color:"#7c3aed",fillColor:"#7c3aed",fillOpacity:.12},selectionLayer);
        let detail="";
        if(options.pick){
          const {e,n}=options.pick;
          let pt;
          if(id==="mgrs")pt=GlobalGrid.parse(`${e} ${n}`,selection.prefix);
          else {
            const step=10**(5-e.length),p=root.proj4(selection.proj,"WGS84",[selection.e*100000+Number(e)*step,selection.n*100000+Number(n)*step]);
            pt={lon:p[0],lat:p[1]};
            if(!contains(id,pt.lat,pt.lon))throw new Error("That reference falls outside this preset area. Select a different square or grid system.");
          }
          L.circleMarker([pt.lat,pt.lon],{radius:7,color:"#fff",weight:2,fillColor:"#7c3aed",fillOpacity:1}).addTo(pointLayer).bindTooltip(`Your reference: ${e} ${n}`,{permanent:true,direction:"top"});
          detail=` · ${e} ${n}`;
        }
        $("aoSelection").textContent=`${presets[id].name} · ${selection.prefix}${detail}`;
        $("aoApply").disabled=false;
        draw();
      }catch(error){selection=null;$("aoSelection").textContent="Choose another area";$("aoWarning").textContent=error.message;$("aoWarning").hidden=false;$("aoApply").disabled=true;}
    }
    function bounds(){const b=map.getBounds();return {west:Math.max(-180,b.getWest()),east:Math.min(180,b.getEast()),south:Math.max(-80,b.getSouth()),north:Math.min(84,b.getNorth())};}
    function projectedGrid(proj,b,clipBounds,size,labelFor){
      // Sample the perimeter: UTM edges are curved, not axis-aligned lat/long boxes.
      const samples=[];
      for(let i=0;i<=8;i++){const t=i/8;for(const p of [[b.west+(b.east-b.west)*t,b.south],[b.west+(b.east-b.west)*t,b.north],[b.west,b.south+(b.north-b.south)*t],[b.east,b.south+(b.north-b.south)*t]])samples.push(root.proj4("WGS84",proj,p));}
      const es=samples.map(p=>p[0]),ns=samples.map(p=>p[1]);
      const e0=Math.floor(Math.min(...es)/size)*size,e1=Math.ceil(Math.max(...es)/size)*size,n0=Math.floor(Math.min(...ns)/size)*size,n1=Math.ceil(Math.max(...ns)/size)*size;
      if((e1-e0)*(n1-n0)/(size*size)>120)return;
      for(let e=e0;e<e1;e+=size)for(let n=n0;n<n1;n+=size){
        const poly=GlobalGrid.square(proj,e,n,size,clipBounds);if(poly.length<3)continue;
        const layer=polygon(poly,{weight:size===100000?1.5:.7,opacity:size===100000?.7:.4});
        if(size===100000&&map.getZoom()>=7){
          const lon=poly.reduce((a,p)=>a+p[0],0)/poly.length,lat=poly.reduce((a,p)=>a+p[1],0)/poly.length;
          try{layer.bindTooltip(labelFor(lat,lon,e,n),{permanent:true,direction:"center",className:"grid-label"});}catch(_){}
        }
      }
    }
    function draw(){
      if(!map||!$("aoOverlay").classList.contains("open"))return;
      grid.clearLayers();const b=bounds(),zoom=map.getZoom(),c=map.getCenter();
      const id=gridId(c.lat,c.lng);
      for(const {id:country,marker} of landmarks){
        const visible=id===country||(id==="mgrs"&&zoom>=8);
        if(visible){if(!map.hasLayer(marker))marker.addTo(map);marker.openTooltip();}else if(map.hasLayer(marker))map.removeLayer(marker);
      }
      $("aoScale").textContent=zoom<6?"Zoom in to see AO boundaries":"100 km AO boundaries";
      if(zoom<6)return;
      if(id!=="mgrs"&&zoom>=5){
        const bb=presets[id].bbox,clip={west:bb[2],east:bb[3],south:bb[0],north:bb[1]};
        const view={west:Math.max(b.west,clip.west),east:Math.min(b.east,clip.east),south:Math.max(b.south,clip.south),north:Math.min(b.north,clip.north)};
        if(view.west>=view.east||view.south>=view.north)return;
        projectedGrid(projection(id),view,clip,100000,(lat,lon,e,n)=>`E${Math.floor(e/100000)} N${Math.floor(n/100000)}`);
        return;
      }
      for(const z of GlobalGrid.zones(b)){
        const box=[[z.west,z.south],[z.east,z.south],[z.east,z.north],[z.west,z.north]];
        polygon(box,{color:"#334155",weight:1.5,opacity:.5});
        const view={west:Math.max(b.west,z.west),east:Math.min(b.east,z.east),south:Math.max(b.south,z.south),north:Math.min(b.north,z.north)};
        const proj=GlobalGrid.projection(z.zone,z.south<0);
        projectedGrid(proj,view,z,100000,(lat,lon)=>GlobalGrid.parts(lat,lon,0).prefix);
      }
    }
    function init(){
      map=L.map("aoMap",{minZoom:2,maxZoom:17,maxBounds:[[-85,-180],[85,180]],maxBoundsViscosity:1,preferCanvas:true,zoomControl:true});
      map.setView([12,95],3);
      L.control.scale({imperial:false}).addTo(map);
      map.createPane("offlineLand").style.zIndex="150";
      const land=L.geoJSON(null,{pane:"offlineLand",style:{color:"#a8bcc2",weight:.6,fillColor:"#f3f3eb",fillOpacity:1},interactive:false}).addTo(map);
      fetch("vendor/land.geojson").then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>land.addData(data)).catch(()=>{});
      map.attributionControl.addAttribution('<a href="https://www.naturalearthdata.com/">Natural Earth</a>');
      map.attributionControl.addAttribution('Road context © <a href="https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Basemaps/FoundationData/MapServer/23">State of Queensland</a>');
      const tiles=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,noWrap:true,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
      tiles.on("tileerror",()=>{$("aoNetwork").textContent="Street map unavailable. Offline land, grids and landmarks remain available.";});
      tiles.on("load",()=>{if(navigator.onLine)$("aoNetwork").textContent="Map context is approximate. Street tiles require internet; grids and landmarks work offline.";});
      grid=L.layerGroup().addTo(map);selectionLayer=L.layerGroup().addTo(map);pointLayer=L.layerGroup().addTo(map);
      for(const id of ids){
        const p=presets[id],bb=p.bbox;
        const context=p.context||{};
        for(const poly of context.land||[])polygon(poly,{pane:"offlineLand",color:"#a8bcc2",weight:.6,fillColor:"#f3f3eb",fillOpacity:1},land);
        for(const line of context.roads||[])L.polyline(line.map(p=>[p[1],p[0]]),{color:"#ce8a22",weight:2,interactive:false}).addTo(land);
        for(const [index,lm] of (context.landmarks||[]).entries()){
          landmarks.push({id,marker:L.circleMarker([lm.lat,lm.lon],{radius:5,color:"#fff",weight:1.5,fillColor:"#be123c",fillOpacity:1}).bindTooltip(lm.name,{permanent:true,direction:index%2?"right":"left",className:"camp-label"}).on("click",e=>{L.DomEvent.stopPropagation(e);select(lm.lat,lm.lon);})});
        }
      }
      map.on("click",e=>{if(map.getZoom()<6){map.setView(e.latlng,7);return;}select(e.latlng.lat,e.latlng.lng);});
      map.on("moveend zoomend",()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(draw);});
      $("aoCentre").addEventListener("click",()=>{const c=map.getCenter();if(map.getZoom()<6){map.setZoom(7);return;}select(c.lat,c.lng);});
    }
    function close(){ $("aoOverlay").classList.remove("open");returnFocus?.focus(); }
    $("aoClose").addEventListener("click",close);
    $("aoApply").addEventListener("click",()=>{if(!selection||$("aoApply").disabled)return;const chosen=selection;close();onSelect(chosen,options);});
    $("aoOverlay").addEventListener("keydown",e=>{
      if(e.key==="Escape"){e.preventDefault();close();}
      if(e.key==="Tab"){
        const nodes=[...$("aoOverlay").querySelectorAll('button:not(:disabled),select,input,[tabindex="0"],a[href]')].filter(el=>el.getClientRects().length);
        const first=nodes[0],last=nodes[nodes.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    });
    function choose(id){
      $("locationOverlay").classList.remove("open");
      const p=presets[id];
      if(p.lead){
        const [e,n]=p.lead,g=options.pick,step=g?10**(5-g.e.length):1;
        const point=root.proj4(projection(id),"WGS84",[e*100000+(g?Number(g.e)*step:50000),n*100000+(g?Number(g.n)*step:50000)]);
        onSelect({id,e,n,lat:point[1],lon:point[0]},options);return;
      }
      showMap({...options,system:id,preset:id});
    }
    function showLocations(opts){
      options=opts;$("aoOverlay").classList.remove("open");$("locationOverlay").classList.add("open");
      $("locationOverlay").querySelector("[data-location]").focus();
    }
    $("locationOverlay").querySelectorAll("[data-location]").forEach(button=>button.addEventListener("click",()=>choose(button.dataset.location)));
    const closeLocations=()=>{$("locationOverlay").classList.remove("open");returnFocus?.focus();};
    $("locationClose").addEventListener("click",closeLocations);
    $("locationOverlay").addEventListener("keydown",e=>{if(e.key==="Escape")closeLocations();
      if(e.key==="Tab"){const first=$("locationOverlay").querySelector("[data-location]"),last=$("locationClose");if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
    });
    $("aoBack").addEventListener("click",()=>showLocations(options));
    function showMap(opts){
      options=opts;selection=null;
      $("aoOverlay").classList.add("open");if(!map)init();
      $("aoApply").disabled=true;$("aoSelection").textContent="No area selected";$("aoWarning").hidden=true;
      const id=gridId(),raw=id==="mgrs";
      $("aoTitle").textContent=raw?"Raw WGS 84 · select your AO":presets[id].name+" · select your AO";
      $("aoSystemLabel").textContent=raw?"WGS 84 datum":presets[id].basis;
      $("aoBack").hidden=!opts.pending;
      $("aoInstruction").textContent=opts.pick?"Which 100 km square contains "+opts.pick.e+" "+opts.pick.n+"?":"Select a 100 km AO square.";
      selectionLayer.clearLayers();pointLayer.clearLayers();map.invalidateSize();map.setMaxBounds([[-85,-180],[85,180]]);map.setMinZoom(2);
      if(raw){
        if(opts.point)map.setView([opts.point.lat,opts.point.lon],9);else map.setView([15,30],2);
      }else{
        const p=presets[id],b=p.bbox;let area=[[b[0],b[2]],[b[1],b[3]]];
        if(p.anchor){const [lat,lon]=p.anchor,dy=(p.anchorRadiusKm||65)*1.6/111,dx=dy/Math.cos(lat*Math.PI/180);area=[[lat-dy,lon-dx],[lat+dy,lon+dx]];}
        const focus=L.latLngBounds(area);map.fitBounds(focus,{padding:[28,28],maxZoom:9,animate:false});map.setMaxBounds(focus.pad(.5));map.setMinZoom(Math.max(6,map.getZoom()-1));
      }
      draw();$("aoClose").focus();
    }
    return {open(opts={}){
      returnFocus=document.activeElement;
      if(opts.pending&&!opts.system)showLocations(opts);else showMap({...opts,system:opts.system||opts.preset||"mgrs"});
    },close};
  };
})(globalThis);
