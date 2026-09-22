/* A geographic grid. Lines are drawn into Leaflet tiles, so dragging and animated
   zoom move them with the map. Numbers sit on the top and left edges of the view,
   where a reader looks for them, and are placed again on every frame of a drag so
   they slide with their lines instead of catching up afterwards. */
(function(root){
 'use strict';
 const STEPS_DEG=[30,20,10,5,2,1,.5,.2,.1,.05,.02,.01,.005,.002,.001,.0005,.0002,.0001];
 const STEPS_M=[1000,100];
 // The grid is only drawn where every line can carry its number at full size with
 // clear space either side: no zoom is fixed, the labels decide. Numbers are 11px
 // monospace in a padded chip (see .grid-label-edge), so their size is known here.
 const CHAR_PX=6.7,CHIP_PAD=8,CHIP_HEIGHT=15,LABEL_GAP=14,MINOR_PX=22;
 const chipWidth=chars=>chars*CHAR_PX+CHIP_PAD;
 const fits=(spacing,chars)=>spacing>=Math.max(chipWidth(chars),CHIP_HEIGHT)+LABEL_GAP;
 // Degree lines are never drawn wider apart than about a kilometre, the same scale
 // the metric grid starts at; a world of 30° lines is not something to aim with.
 const COARSEST_DEG=.01;
 const metresPerPixel=(lat,z)=>156543.03392*Math.cos(lat*Math.PI/180)/2**z;
 function metricSteps(lat,z){
  const mpp=metresPerPixel(lat,z);
  const major=[...STEPS_M].reverse().find(s=>fits(s/mpp,s<1000?3:2));
  if(!major)return null;
  const minor=major/10;
  return {major,minor:minor>=100&&minor/mpp>=MINOR_PX?minor:0};
 }
 const degreeChars=step=>{const places=Math.max(0,Math.ceil(-Math.log10(step)-1e-9));return 3+(places?places+1:0)+2;};
 function degreeStep(lat,z){
  const pxPerDegree=2**z*256/360/Math.cos(lat*Math.PI/180);
  const step=[...STEPS_DEG].reverse().find(d=>fits(d*pxPerDegree,degreeChars(d)));
  return step&&step<=COARSEST_DEG?step:null;
 }
 // Two figures name a kilometre line, as on a paper map; a 100 m line takes a third.
 const gridLabel=(v,step)=>step<1000
  ?String(((Math.round(v/100))%1000+1000)%1000).padStart(3,'0')
  :String(((Math.round(v/1000))%100+100)%100).padStart(2,'0');
 const degLabel=(v,axis,step)=>{
  const places=Math.max(0,Math.ceil(-Math.log10(step)-1e-9));
  return Math.abs(v).toFixed(places)+'°'+(axis==='lat'?(v<0?'S':'N'):(v<0?'W':'E'));
 };
 root.createCoordinateGrid=function(map,{system,projection,contains=()=>true,enabled=()=>true}){
  let signature='',config=null;
  const size=512;
  const layer=new (L.GridLayer.extend({
   createTile(coords){
    const tile=document.createElement('canvas'),ratio=Math.min(root.devicePixelRatio||1,2);
    tile.width=tile.height=size*ratio;tile.className='coordinate-grid-tile';
    const ctx=tile.getContext('2d');if(!ctx||!config)return tile;
    ctx.scale(ratio,ratio);
    const z=coords.z,origin=L.point(coords.x*size,coords.y*size);
    const ll=(x,y)=>map.unproject(origin.add([x,y]),z);
    const pixel=p=>map.project(L.latLng(p[1],p[0]),z).subtract(origin);
    const top=ll(0,0),bottom=ll(size,size),center=ll(size/2,size/2);
    const lines=[];
    if(config.id==='wgs84'){
     const step=degreeStep(config.latitude,z);if(!step)return tile;
     for(let i=Math.ceil(bottom.lat/step);i*step<=top.lat;i++)
      lines.push({points:[[top.lng,i*step],[bottom.lng,i*step]],weight:2});
     for(let i=Math.ceil(top.lng/step);i*step<=bottom.lng;i++)
      lines.push({points:[[i*step,bottom.lat],[i*step,top.lat]],weight:2});
    }else{
     const steps=metricSteps(config.latitude,z),{proj,clip}=config;
     if(!steps||!proj)return tile;
     const fine=steps.minor||steps.major;
     const wrap=360*Math.round((center.lng-MapSupport.longitude(center.lng))/360);
     try{
      const sample=[];
      for(let i=0;i<=4;i++)for(const xy of [[size*i/4,0],[size*i/4,size],[0,size*i/4],[size,size*i/4]]){
       const p=ll(...xy);sample.push(proj4('WGS84',proj,[p.lng-wrap,p.lat]));
      }
      const es=sample.map(p=>p[0]),ns=sample.map(p=>p[1]);
      const e0=Math.floor(Math.min(...es)/fine)*fine,e1=Math.ceil(Math.max(...es)/fine)*fine;
      const n0=Math.floor(Math.min(...ns)/fine)*fine,n1=Math.ceil(Math.max(...ns)/fine)*fine;
      if((e1-e0+n1-n0)/fine>240)return tile;
      const line=(value,vertical)=>{
       // Kilometre lines stay the strongest whenever they show; finer labelled lines
       // sit a step below them, and unlabelled ones below that.
       const weight=value%Math.max(1000,steps.major)===0?2:value%steps.major===0?1:0;
       let points=[];const flush=()=>{if(points.length>1)lines.push({points,weight});points=[];};
       for(let i=0;i<=16;i++){
        const p=proj4(proj,'WGS84',vertical?[value,n0+(n1-n0)*i/16]:[e0+(e1-e0)*i/16,value]);
        if(!clip||(p[0]>=clip.west&&p[0]<=clip.east&&p[1]>=clip.south&&p[1]<=clip.north))points.push([p[0]+wrap,p[1]]);else flush();
       }
       flush();
      };
      for(let e=e0;e<=e1;e+=fine)line(e,true);
      for(let n=n0;n<=n1;n+=fine)line(n,false);
     }catch(_){return tile;}
    }
    // Fine lines first, so a major line always draws cleanly over its neighbours.
    lines.sort((a,b)=>a.weight-b.weight);
    for(const line of lines){
     const pts=line.points.map(pixel);ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
     if(line.weight===2){
      ctx.strokeStyle='rgba(255,255,255,.6)';ctx.lineWidth=3;ctx.stroke();
      ctx.strokeStyle='rgba(30,58,95,.72)';ctx.lineWidth=1;ctx.stroke();
     }else if(line.weight===1){
      ctx.strokeStyle='rgba(30,58,95,.5)';ctx.lineWidth=1;ctx.stroke();
     }else{
      ctx.strokeStyle='rgba(30,58,95,.26)';ctx.lineWidth=.75;ctx.stroke();
     }
    }
    tile.dataset.lines=String(lines.length);tile.dataset.system=config.id;
    return tile;
   }
  }))({tileSize:size,pane:'overlayPane',className:'coordinate-grid',opacity:1,keepBuffer:1,updateWhenIdle:false,updateWhenZooming:false});

  // ---- edge labels ----
  const box=L.DomUtil.create('div','grid-labels',map.getContainer());
  const pool=[];let used=0;
  function label(text,x,y,edge){
   let el=pool[used];
   if(!el){el=document.createElement('span');box.append(el);pool.push(el);}
   used++;
   if(el.textContent!==text)el.textContent=text;
   el.className='grid-label-edge '+edge;
   el.style.transform='translate('+Math.round(x)+'px,'+Math.round(y)+'px) translate('+(edge==='top'?'-50%':'0')+',-50%)';
  }
  const TOP=11,LEFT=6;
  function place(){
   used=0;
   if(config&&map.hasLayer(layer)){
    const size=map.getSize(),z=layer._tileZoom??Math.round(map.getZoom());
    const at=(x,y)=>{const p=map.containerPointToLatLng([x,y]);return {lat:p.lat,lng:p.lng};};
    const tops=[],lefts=[];
    if(config.id==='wgs84'){
     const step=degreeStep(config.latitude,z);
     if(step){
     const w=at(0,TOP).lng,e=at(size.x,TOP).lng,n=at(LEFT,0).lat,s=at(LEFT,size.y).lat;
     for(let i=Math.ceil(w/step);i*step<=e;i++){
      const x=map.latLngToContainerPoint([n,i*step]).x;
      tops.push({x,text:degLabel(MapSupport.longitude(i*step),'lon',step)});
     }
     for(let i=Math.ceil(s/step);i*step<=n;i++){
      const y=map.latLngToContainerPoint([i*step,w]).y;
      lefts.push({y,text:degLabel(i*step,'lat',step)});
     }
     }
    }else{
     const steps=metricSteps(config.latitude,z),{proj,clip}=config;
     if(steps&&proj){
      const inside=p=>!clip||(p.lng>=clip.west&&p.lng<=clip.east&&p.lat>=clip.south&&p.lat<=clip.north);
      const walk=(edge,length,axis,out)=>{
       const count=24;let prev=null;
       for(let i=0;i<=count;i++){
        const t=length*i/count,p=at(edge==='top'?t:LEFT,edge==='top'?TOP:t);
        const g={lat:p.lat,lng:MapSupport.longitude(p.lng)};
        let v;try{v=proj4('WGS84',proj,[g.lng,g.lat])[axis];}catch(_){prev=null;continue;}
        if(!Number.isFinite(v)){prev=null;continue;}
        const cur={t,v,ok:inside(g)};
        if(prev&&prev.ok&&cur.ok){
         const lo=Math.min(prev.v,cur.v),hi=Math.max(prev.v,cur.v);
         for(let m=Math.ceil(lo/steps.major)*steps.major;m<=hi;m+=steps.major){
          if(m===prev.v&&i>1)continue;
          const k=hi===lo?0:(m-prev.v)/(cur.v-prev.v);
          out.push({[edge==='top'?'x':'y']:prev.t+k*(cur.t-prev.t),text:gridLabel(m,steps.major)});
         }
        }
        prev=cur;
       }
      };
      walk('top',size.x,0,tops);walk('left',size.y,1,lefts);
     }
    }
    // Corners belong to neither edge, and two numbers closer than their own width
    // read as one; the second is dropped rather than drawn on top.
    let last=-Infinity;
    for(const p of tops.sort((a,b)=>a.x-b.x)){if(p.x<40||p.x>size.x-24||p.x-last<chipWidth(p.text.length)+LABEL_GAP)continue;label(p.text,p.x,TOP,'top');last=p.x;}
    last=-Infinity;
    for(const p of lefts.sort((a,b)=>a.y-b.y)){if(p.y<30||p.y>size.y-30||p.y-last<CHIP_HEIGHT+LABEL_GAP)continue;label(p.text,LEFT,p.y,'left');last=p.y;}
   }
   for(let i=used;i<pool.length;i++)pool[i].className='grid-label-edge off';
  }
  // A zoom animation scales the tiles with CSS; the numbers cannot follow that, so
  // they step aside for its quarter second and return where the new zoom puts them.
  map.on('zoomanim',()=>box.classList.add('zooming'));
  map.on('zoomend',()=>{box.classList.remove('zooming');place();});
  map.on('move resize',place);

  function refresh(){
   const id=system(),p=map.getCenter(),lon=MapSupport.longitude(p.lng);
   const latitude=Math.round(p.lat/10)*10;
   let next={id,latitude},key=id+':'+latitude;
   if(id!=='wgs84'){
    if(['mgrs','globalutm'].includes(id)){
     try{const g=GlobalGrid.at(p.lat,lon);next={id,latitude,proj:g.proj,clip:GlobalGrid.zoneBounds(g.zone,g.band)};key+=':'+g.zone+g.band;}catch(_){next=null;}
    }else if(contains(id,p.lat,lon)){next={id,latitude,proj:projection(id)};}else next=null;
   }
   if(!enabled()||!next){if(map.hasLayer(layer))map.removeLayer(layer);signature='';config=null;place();return;}
   config=next;
   if(signature!==key){signature=key;if(map.hasLayer(layer))layer.redraw();}
   if(!map.hasLayer(layer))layer.addTo(map);
   place();
  }
  map.on('moveend',refresh);
  return {refresh,layer};
 };
 root.createCoordinateGrid.steps={metricSteps,degreeStep};
})(globalThis);
