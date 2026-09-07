/* Shared map picker: basemap, projected AO grids and approximate camp landmarks. */
(function(root){
  "use strict";
  root.createAOPicker=function({presets,contains,projection,onSelect}){
    const $=id=>document.getElementById(id);
    let map,grid,selectionLayer,pointLayer,selection,options={},returnFocus,previousClick,frame;
    const landmarks=[];
    const ids=["sg","taiwan","thailand","australia","brunei"];
    const localAt=(lat,lon)=>ids.find(id=>contains(id,lat,lon));
    function gridId(lat,lon){return $("aoSystem").value==="auto"?(localAt(lat,lon)||"mgrs"):$("aoSystem").value;}
    function localSquare(id,lat,lon){
      const proj=projection(id),en=root.proj4("WGS84",proj,[lon,lat]),e=Math.floor(en[0]/100000),n=Math.floor(en[1]/100000);
      return {id,proj,e,n,prefix:`E${e} N${n}`,polygon:GlobalGrid.square(proj,e*100000,n*100000)};
    }
    function polygon(coords,style,target=grid){
      return L.polygon(coords.map(p=>[p[1],p[0]]),{weight:1,color:"#2563eb",fillOpacity:0,interactive:false,...style}).addTo(target);
    }
    function select(lat,lon){
      lon=Math.max(-180,Math.min(180,lon));previousClick={lat,lon};selectionLayer.clearLayers();pointLayer.clearLayers();
      $("aoDatumConfirm").checked=false;$("aoConfirmLabel").hidden=true;$("aoWarning").hidden=true;
      try{
        const id=gridId(lat,lon);
        if(id!=="mgrs"&&!contains(id,lat,lon))throw new Error(`Select an area within ${presets[id].name.replace(" MGR","")}, or change the grid system.`);
        selection=id==="mgrs"?{...GlobalGrid.at(lat,lon),id}:localSquare(id,lat,lon);
        selection.lat=lat;selection.lon=lon;
        polygon(selection.polygon,{weight:3,color:"#7c3aed",fillColor:"#7c3aed",fillOpacity:.12},selectionLayer);
        const local=id==="mgrs"?localAt(lat,lon):null;
        const needsCheck=local==="sg"||local==="brunei";
        $("aoConfirmLabel").hidden=!needsCheck;
        if(needsCheck){$("aoWarning").textContent=`This area uses ${presets[local].basis} WGS 84 is a different datum. Check the grid on your map.`;$("aoWarning").hidden=false;}
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
        $("aoApply").disabled=needsCheck;
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
      if((e1-e0)*(n1-n0)/(size*size)>1600)return;
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
      for(const marker of landmarks){if(zoom>=10)marker.openTooltip();else marker.closeTooltip();}
      const spacing=zoom>=14?100:zoom>=11?1000:zoom>=8?10000:100000;
      $("aoScale").textContent=zoom<5?"Zoom in to see 100 km squares":`${presets[id].name} · ${spacing>=1000?spacing/1000+" km":spacing+" m"} grid`;
      if(id!=="mgrs"&&zoom>=5){
        const bb=presets[id].bbox,clip={west:bb[2],east:bb[3],south:bb[0],north:bb[1]};
        const view={west:Math.max(b.west,clip.west),east:Math.min(b.east,clip.east),south:Math.max(b.south,clip.south),north:Math.min(b.north,clip.north)};
        if(view.west>=view.east||view.south>=view.north)return;
        projectedGrid(projection(id),view,clip,100000,(lat,lon,e,n)=>`E${Math.floor(e/100000)} N${Math.floor(n/100000)}`);
        if(spacing<100000)projectedGrid(projection(id),view,clip,spacing,()=>"");
        return;
      }
      for(const z of GlobalGrid.zones(b)){
        const box=[[z.west,z.south],[z.east,z.south],[z.east,z.north],[z.west,z.north]];
        const layer=polygon(box,{color:"#334155",weight:1.5,opacity:.5});
        if(zoom<5){if(zoom>=3)layer.bindTooltip(`${z.zone}${z.band}`,{permanent:true,direction:"center",className:"grid-label"});continue;}
        const view={west:Math.max(b.west,z.west),east:Math.min(b.east,z.east),south:Math.max(b.south,z.south),north:Math.min(b.north,z.north)};
        const proj=GlobalGrid.projection(z.zone,z.south<0);
        projectedGrid(proj,view,z,100000,(lat,lon)=>GlobalGrid.parts(lat,lon,0).prefix);
        if(spacing<100000)projectedGrid(proj,view,z,spacing,()=>"");
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
      const tiles=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,noWrap:true,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
      tiles.on("tileerror",()=>{$("aoNetwork").textContent="Street map unavailable. Offline land, grids and landmarks remain available.";});
      tiles.on("load",()=>{if(navigator.onLine)$("aoNetwork").textContent="Map context is approximate. Street tiles require internet; grids and landmarks work offline.";});
      grid=L.layerGroup().addTo(map);selectionLayer=L.layerGroup().addTo(map);pointLayer=L.layerGroup().addTo(map);
      const jump=$("aoJump");
      const addJump=(label,lat,lon,zoom)=>{const op=document.createElement("option");op.textContent=label;op.value=JSON.stringify([lat,lon,zoom]);jump.appendChild(op);};
      for(const id of ids){
        const p=presets[id],bb=p.bbox;
        const op=document.createElement("option");op.value=id;op.textContent=p.name;$("aoSystem").appendChild(op);
        addJump(p.name.replace(" MGR",""),p.anchor?.[0]??(bb[0]+bb[1])/2,p.anchor?.[1]??(bb[2]+bb[3])/2,id==="sg"?11:8);
        const outlines=p.regions||[p.outline||[[bb[2],bb[0]],[bb[3],bb[0]],[bb[3],bb[1]],[bb[2],bb[1]]]];
        for(const poly of outlines)polygon(poly,{color:"#0f766e",weight:1.5,dashArray:"5 5",fillOpacity:.025},land);
        for(const poly of p.mapLand||[])polygon(poly,{pane:"offlineLand",color:"#a8bcc2",weight:.6,fillColor:"#f3f3eb",fillOpacity:1},land);
        for(const line of p.roads||(p.road?[p.road]:[]))L.polyline(line.map(p=>[p[1],p[0]]),{color:"#ce8a22",weight:2,interactive:false}).addTo(land);
        for(const lm of p.landmarks||[]){
          addJump(lm.name,lm.lat,lm.lon,12);
          landmarks.push(L.circleMarker([lm.lat,lm.lon],{radius:5,color:"#fff",weight:1.5,fillColor:"#be123c",fillOpacity:1}).addTo(map).bindTooltip(lm.name,{direction:"top",className:"camp-label"}).on("click",e=>{L.DomEvent.stopPropagation(e);select(lm.lat,lm.lon);}));
        }
      }
      map.on("click",e=>{if(map.getZoom()<5){map.setView(e.latlng,7);return;}select(e.latlng.lat,e.latlng.lng);});
      map.on("moveend zoomend",()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(draw);});
      jump.addEventListener("change",()=>{if(jump.value){const [lat,lon,z]=JSON.parse(jump.value);map.setView([lat,lon],z);}else map.setView([12,0],2);});
      $("aoSystem").addEventListener("change",()=>{if(previousClick)select(previousClick.lat,previousClick.lon);else draw();});
      $("aoCentre").addEventListener("click",()=>{const c=map.getCenter();if(map.getZoom()<5){map.setZoom(7);return;}select(c.lat,c.lng);});
      $("aoDatumConfirm").addEventListener("change",()=>{$("aoApply").disabled=!selection||!$("aoDatumConfirm").checked;});
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
    return {open(opts={}){
      options=opts;returnFocus=document.activeElement;selection=null;previousClick=null;
      $("aoOverlay").classList.add("open");if(!map)init();
      $("aoSystem").value=opts.system||"auto";$("aoApply").disabled=true;$("aoSelection").textContent="No area selected";$("aoWarning").hidden=true;$("aoConfirmLabel").hidden=true;
      $("aoInstruction").textContent=opts.pick?`Locate ${opts.pick.e} ${opts.pick.n}: zoom in and select its area.`:"Zoom in, then click your area to select its grid square.";
      selectionLayer.clearLayers();pointLayer.clearLayers();map.invalidateSize();
      if(opts.point)map.setView([opts.point.lat,opts.point.lon],10);
      else if(opts.preset&&presets[opts.preset]?.bbox){const p=presets[opts.preset],b=p.bbox;map.setView(p.anchor||[(b[0]+b[1])/2,(b[2]+b[3])/2],opts.preset==="sg"?11:8);}
      draw();$("aoClose").focus();
    },close};
  };
})(globalThis);
