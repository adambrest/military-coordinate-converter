/* Shared map picker: basemap, projected AO grids and approximate camp landmarks. */
(function(root){
  "use strict";
  root.createAOPicker=function({presets,contains,projection,plausible,presetEnabled=()=>true,onSelect,onCancel}){
    const $=id=>document.getElementById(id);
    let map,grid,selectionLayer,pointLayer,selection,options={},returnFocus,frame,stableCenter,limitCenter,cancelTap;
    const landmarks=[];
    const ids=["sg","taiwan","thailand","australia","brunei"];
    function gridId(){return options.system||options.preset||"mgrs";}
    let candidates=[],worldOffset=0,worldLand,worldData,worldKey;
    // Granularity follows the zoom: grid zones while a whole zone still fits the
    // screen, 100 km squares once one is close enough to be worth choosing.
    function squareThreshold(){return Math.min(6,map?map.getMaxZoom():6);}
    function wholeZone(){return gridId()==="mgrs"&&!!map&&map.getZoom()<squareThreshold();}
    function limitZoom(){const cap=MapSupport.squareZoom(map);if(map.getMinZoom()>cap)map.setMinZoom(cap);map.setMaxZoom(cap);}
    function polygon(coords,style,target=grid,offset=0){
      return L.polygon(coords.map(p=>[p[1],p[0]+offset]),{weight:1,color:"#2563eb",fillOpacity:0,interactive:false,...style}).addTo(target);
    }
    function picks(){
      if(options.pending)return options.pending.text.trim().split(/\r?\n/).map(line=>{
        const digits=line.replace(/\D/g,""),d=digits.length/2;return {e:digits.slice(0,d),n:digits.slice(d)};
      });
      return options.pick?[options.pick]:[];
    }
    function candidate(id,proj,e,n,poly){
      let lon=poly.reduce((sum,p)=>sum+p[0],0)/poly.length,lat=poly.reduce((sum,p)=>sum+p[1],0)/poly.length;
      const result={id,proj,e:e/100000,n:n/100000,polygon:poly,lat,lon};
      const raw=id==="mgrs";
      try{
        result.prefix=raw?GlobalGrid.parts(lat,lon,0).prefix:"E"+result.e+" N"+result.n;
        if(!raw){
          const p=presets[id],bb=p.bbox,regions=p.regions||[p.outline||[[bb[2],bb[0]],[bb[3],bb[0]],[bb[3],bb[1]],[bb[2],bb[1]]]];
          if(!regions.some(region=>GlobalGrid.intersects(poly,region)))return null;
        }
        const inputs=picks();
        if(inputs.length){
          for(const [i,g] of inputs.entries()){
            let point;
            if(raw){
              // A square the digits cannot fall in is still a real square. Show it and
              // explain on selection, rather than leaving a hole in the grid.
              try{point=GlobalGrid.parse(g.e+" "+g.n,result.prefix);}catch(_){point={error:"outside"};}
              if(point.error){result.invalid="reference";point=null;}
            }
            else{
              const step=10**(5-g.e.length),ll=root.proj4(proj,"WGS84",[e+Number(g.e)*step,n+Number(g.n)*step]);
              point={lat:ll[1],lon:ll[0]};
              if(!contains(id,point.lat,point.lon))result.invalid=true;
            }
            if(i===0&&point){result.point=point;result.lat=point.lat;result.lon=point.lon;}
          }
        }
        return result;
      }catch(_){return null;}
    }
    function selectCandidate(chosen){
      selection=chosen;selectionLayer.clearLayers();pointLayer.clearLayers();$("aoWarning").hidden=true;
      polygon(chosen.polygon,{weight:3,color:"#7c3aed",fillColor:"#7c3aed",fillOpacity:.12},selectionLayer,chosen.offset||0);
      if(chosen.point)L.circleMarker([chosen.point.lat,chosen.point.lon+(chosen.offset||0)],{radius:7,color:"#fff",weight:2,fillColor:"#7c3aed",fillOpacity:1}).addTo(pointLayer);
      $("aoSelection").textContent=presets[chosen.id].name+" · "+chosen.prefix;
      $("aoApply").disabled=false;
      if(chosen.invalid){
        $("aoWarning").textContent=chosen.invalid==="reference"
          ?"Your reference does not fall inside "+chosen.prefix+". The digits reach past this square's edge, so choose a neighboring one."
          :"This reference falls outside "+presets[chosen.id].name.replace(" MGR","")+" in this square. Check the digits or choose another grid square.";
        $("aoWarning").hidden=false;$("aoApply").disabled=true;
      }
      if(chosen.scope==="zone"&&picks().length){
        // A zone cannot complete digits-only input, so only Settings may store one.
        const resolving=options.converter!==false;
        $("aoWarning").textContent=resolving
          ?"Zoom in and choose a 100 km square: these digits need square letters to identify a place."
          :"Include the 100 km square letters with your reference.";
        $("aoWarning").hidden=false;
        if(resolving)$("aoApply").disabled=true;
      }
    }
    function addCandidate(chosen){
      chosen.offset=worldOffset;candidates.push(chosen);
      const layer=polygon(chosen.polygon,{interactive:true,bubblingMouseEvents:false,fillOpacity:.05,weight:1.5},grid,worldOffset);
      layer.options.aoCandidate=chosen;
      layer.on("click",e=>{L.DomEvent.stopPropagation(e);selectCandidate(chosen);});
      layer.on("mouseover",()=>layer.setStyle({fillOpacity:.15}));
      layer.on("mouseout",()=>layer.setStyle({fillOpacity:.05}));
      layer.bindTooltip(chosen.prefix,{permanent:true,direction:"center",className:"grid-label"});
    }
    function select(lat,lon){
      const selected=candidates.find(c=>GlobalGrid.inside(MapSupport.longitude(lon),lat,c.polygon));
      if(selected)selectCandidate(selected);
    }
    function bounds(offset=0){const b=map.getBounds();return {west:Math.max(-180,b.getWest()-offset),east:Math.min(180,b.getEast()-offset),south:Math.max(-80,b.getSouth()),north:Math.min(84,b.getNorth())};}
    function projectedGrid(proj,b,clipBounds,id){
      const size=100000,samples=[];
      for(let i=0;i<=8;i++){const t=i/8;for(const p of [[b.west+(b.east-b.west)*t,b.south],[b.west+(b.east-b.west)*t,b.north],[b.west,b.south+(b.north-b.south)*t],[b.east,b.south+(b.north-b.south)*t]])samples.push(root.proj4("WGS84",proj,p));}
      const es=samples.map(p=>p[0]),ns=samples.map(p=>p[1]);
      const e0=Math.floor(Math.min(...es)/size)*size,e1=Math.ceil(Math.max(...es)/size)*size,n0=Math.floor(Math.min(...ns)/size)*size,n1=Math.ceil(Math.max(...ns)/size)*size;
      if((e1-e0)*(n1-n0)/(size*size)>120)return;
      for(let e=e0;e<e1;e+=size)for(let n=n0;n<n1;n+=size){
        // Only MGRS zone edges clip a square. Country view bounds never change its geometry.
        const poly=GlobalGrid.square(proj,e,n,size,clipBounds);if(poly.length<3)continue;
        const chosen=candidate(id,proj,e,n,poly);if(chosen)addCandidate(chosen);
      }
    }
    function draw(){
      if(!map||!$("aoOverlay").classList.contains("open"))return;
      limitZoom();
      grid.clearLayers();candidates=[];const zoom=map.getZoom(),id=gridId(),worlds=MapSupport.worlds(map),key=worlds.join(',');
      if(worldData&&worldKey!==key){worldLand.clearLayers();for(const offset of worlds)worldLand.addData(MapSupport.repeatGeometry(worldData,offset));worldKey=key;}
      for(const {id:country,marker} of landmarks){
        const visible=id===country||(id==="mgrs"&&zoom>=8);
        if(visible){if(!map.hasLayer(marker))marker.addTo(map);marker.openTooltip();}else if(map.hasLayer(marker))map.removeLayer(marker);
      }
      const broad=wholeZone(),threshold=broad?3:squareThreshold();
      $("aoScope").textContent=id==="mgrs"?(broad?"Selecting: grid zone, e.g. 48N":"Selecting: 100 km square, e.g. 48N UG"):"";
      $("aoInstruction").textContent=broad
        ?"Grid zones at this zoom. Zoom in for the 100 km squares that let you omit a prefix."
        :"Select a 100 km grid square to omit its prefix. Your operating area may span several squares.";
      if(zoom<threshold){if(!selection)$("aoSelection").textContent="Zoom in to select a grid square";return;}
      for(const offset of id==="mgrs"?worlds:[0]){
      worldOffset=offset;const b=bounds(offset);
      if(id!=="mgrs"){
        const bb=presets[id].bbox;
        const view={west:Math.max(b.west,bb[2]),east:Math.min(b.east,bb[3]),south:Math.max(b.south,bb[0]),north:Math.min(b.north,bb[1])};
        if(view.west<view.east&&view.south<view.north)projectedGrid(projection(id),view,null,id);
      }else for(const z of GlobalGrid.zones(b)){
        if(broad){
          addCandidate({id:"mgrs",scope:"zone",prefix:z.zone+z.band,lat:(z.south+z.north)/2,lon:(z.west+z.east)/2,polygon:[[z.west,z.south],[z.east,z.south],[z.east,z.north],[z.west,z.north]]});
          continue;
        }
        const view={west:Math.max(b.west,z.west),east:Math.min(b.east,z.east),south:Math.max(b.south,z.south),north:Math.min(b.north,z.north)};
        projectedGrid(GlobalGrid.projection(z.zone,z.south<0),view,z,"mgrs");
      }
      }
      if(!candidates.length)$("aoSelection").textContent=selection?$("aoSelection").textContent:zoom<6?"Zoom in to select a grid square":"No matching grid squares in view";
    }
    function init(){
      map=L.map("aoMap",{minZoom:1,maxZoom:10,worldCopyJump:true,maxBoundsViscosity:1,preferCanvas:true,zoomControl:true,trackResize:false});
      map.setView([12,95],3);
      cancelTap=MapSupport.pointGestures(map);
      map.attributionControl.setPrefix(false);
      L.control.scale({imperial:false}).addTo(map);
      map.createPane("offlineLand").style.zIndex="150";
      const land=L.layerGroup().addTo(map);
      worldLand=L.geoJSON(null,{pane:"offlineLand",style:{color:"#a8bcc2",weight:.6,fillColor:"#f3f3eb",fillOpacity:1},interactive:false}).addTo(land);
      fetch("vendor/countries.geojson").then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{worldData=data;draw();}).catch(()=>{});
      map.attributionControl.addAttribution('<a href="https://www.naturalearthdata.com/">Natural Earth</a>');
      MapSupport.trainingArea(map);
      const tiles=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxNativeZoom:19,maxZoom:22,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
      tiles.on("tileerror",()=>{$("aoNetwork").hidden=false;});
      tiles.on("load",()=>{if(navigator.onLine)$("aoNetwork").hidden=true;});
      grid=L.layerGroup().addTo(map);selectionLayer=L.layerGroup().addTo(map);pointLayer=L.layerGroup().addTo(map);
      MapSupport.navigation(map,$("aoRegion"),r=>{
        if(gridId()!=="mgrs"){
          options={...options,system:r.id,preset:r.id};
          $("aoTitle").textContent=presets[r.id].name+" · reference area";
          $("aoSystemLabel").textContent=presets[r.id].zoneCode?"Zone "+presets[r.id].zoneCode:"";
        }
        selection=null;selectionLayer.clearLayers();pointLayer.clearLayers();$("aoApply").disabled=true;$("aoSelection").textContent="No area selected";$("aoWarning").hidden=true;
      });
      for(const id of ids){
        const p=presets[id],bb=p.bbox;
        const context=p.context||{};
        for(const poly of context.land||[])polygon(poly,{pane:"offlineLand",color:"#a8bcc2",weight:.6,fillColor:"#f3f3eb",fillOpacity:1},land);
        for(const [index,lm] of (context.landmarks||[]).entries()){
          landmarks.push({id,marker:MapSupport.marker(map,lm,()=>select(lm.lat,lm.lon))});
        }
      }
      map.on("click",e=>{const threshold=wholeZone()?3:squareThreshold();if(map.getZoom()>=threshold)select(e.latlng.lat,e.latlng.lng);});
      limitCenter=MapSupport.limitCenter(map);
      map.on("moveend zoomend",()=>{const p=map.getCenter();stableCenter={lat:p.lat,lng:p.lng};cancelAnimationFrame(frame);frame=requestAnimationFrame(draw);});
      const resize=()=>{if(!$("aoOverlay").classList.contains("open"))return;const p=stableCenter||map.getCenter(),z=map.getZoom();map.invalidateSize({pan:false,animate:false});limitZoom();map.setView(p,Math.min(z,map.getMaxZoom()),{animate:false,reset:true});};
      if(root.ResizeObserver)new ResizeObserver(resize).observe($("aoMap"));else root.addEventListener("resize",resize);
    }
    function close(){ cancelTap?.();$("aoOverlay").classList.remove("open");returnFocus?.focus(); }
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
      // Only offer grids the entered digits could actually fall inside.
      const inputs=picks();let unavailable=0,enabled=0;
      for(const button of $("locationOverlay").querySelectorAll("[data-location]")){
        const id=button.dataset.location;
        button.hidden=!presetEnabled(id);
        if(button.hidden)continue;
        enabled++;
        const fits=!plausible||plausible(id,inputs);
        button.disabled=!fits;
        if(fits)button.removeAttribute("title");
        else{button.title="These digits do not land inside "+presets[id].name.replace(" MGR","")+" in any of its grid squares.";unavailable++;}
      }
      $("locationNote").hidden=!!enabled&&!unavailable;
      $("locationNote").textContent=!enabled?"All grid presets are disabled. Enable a grid in Settings to resolve this reference.":(unavailable===1?"One grid is":unavailable+" grids are")+" unavailable: these digits cannot fall inside "+(unavailable===1?"it":"them")+".";
      ($("locationOverlay").querySelector("[data-location]:not(:disabled):not([hidden])")||$("locationClose")).focus();
    }
    $("locationOverlay").querySelectorAll("[data-location]").forEach(button=>button.addEventListener("click",()=>choose(button.dataset.location)));
    // Turning the chooser down is an answer too: the caller has to hear it, or the
    // reference it was waiting on stays pending and Convert only asks again.
    const closeLocations=()=>{$("locationOverlay").classList.remove("open");returnFocus?.focus();onCancel?.();};
    $("locationClose").addEventListener("click",closeLocations);
    $("locationOverlay").addEventListener("keydown",e=>{if(e.key==="Escape")closeLocations();
      if(e.key==="Tab"){const nodes=$("locationOverlay").querySelectorAll("button:not(:disabled):not([hidden])"),first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
    });
    $("aoBack").addEventListener("click",()=>showLocations(options));
    function showMap(opts){
      options=opts;selection=null;
      $("aoOverlay").classList.add("open");if(!map)init();
      $("aoApply").disabled=true;$("aoSelection").textContent="No area selected";$("aoWarning").hidden=true;
      const id=gridId(),raw=id==="mgrs";
      $("aoRegion").hidden=!raw;
      $("aoScope").textContent="";
      $("aoTitle").textContent=raw?"Military grid · reference area":presets[id].name+" · reference area";
      $("aoSystemLabel").textContent=raw?"MGRS":presets[id].zoneCode?"Zone "+presets[id].zoneCode:"";
      $("aoBack").hidden=!opts.pending;
      $("aoInstruction").textContent=raw?"Choose your area.":"Select a highlighted AO square.";
      selectionLayer.clearLayers();pointLayer.clearLayers();map.invalidateSize();limitCenter(null);map.setMinZoom(1);map.setMaxZoom(10);
      if(raw){
        // Reopen at the granularity the stored area was chosen at.
        if(opts.point)map.setView([opts.point.lat,opts.point.lon],opts.scope==="zone"?5:9);else map.setView([15,30],2);
      }else{
        const p=presets[id],b=p.bbox;let area=[[b[0],b[2]],[b[1],b[3]]];
        if(p.anchor){const [lat,lon]=p.anchor,dy=(p.anchorRadiusKm||65)*1.6/111,dx=dy/Math.cos(lat*Math.PI/180);area=[[lat-dy,lon-dx],[lat+dy,lon+dx]];}
        const focus=L.latLngBounds(area);map.fitBounds(focus,{padding:[28,28],maxZoom:9,animate:false});map.setZoom(Math.max(6,map.getZoom()),{animate:false});
        const region=L.latLngBounds([[b[0],b[2]],[b[1],b[3]]]);map.setMaxZoom(MapSupport.squareZoom(map));map.setMinZoom(Math.min(map.getMaxZoom(),map.getBoundsZoom(region)));limitCenter(region);
      }
      draw();if(opts.point)select(opts.point.lat,opts.point.lon);$("aoClose").focus();
    }
    return {open(opts={}){
      returnFocus=document.activeElement;
      if(opts.pending&&!opts.system)showLocations(opts);else showMap({...opts,system:opts.system||opts.preset||"mgrs"});
    },close};
  };
})(globalThis);
