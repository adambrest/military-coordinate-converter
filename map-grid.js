/* A geographic grid rendered into Leaflet tiles. Lines and numbers share the
   same transform, so dragging and animated zoom never detach or repin labels. */
(function(root){
 'use strict';
 root.createCoordinateGrid=function(map,{system,projection,contains=()=>true,enabled=()=>true}){
  let signature='',config;
  const size=512,steps=[30,20,10,5,2,1,.5,.2,.1,.05,.02,.01,.005,.002,.001,.0005,.0002,.0001];
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
     const anchor=map.project([config.latitude,0],z);
     const span=map.unproject(anchor.subtract([0,size/2]),z).lat-map.unproject(anchor.add([0,size/2]),z).lat;
     const step=steps.find(d=>span/d>=3)||steps.at(-1);
     const places=Math.max(0,Math.ceil(-Math.log10(step)));
     const label=(v,axis)=>Math.abs(v).toFixed(places)+'°'+(axis==='lat'?(v<0?'S':'N'):(v<0?'W':'E'));
     for(let lat=Math.ceil(bottom.lat/step)*step;lat<=top.lat;lat+=step)
      lines.push({points:[[top.lng,lat],[bottom.lng,lat]],text:label(lat,'lat'),vertical:false});
     if((bottom.lng-top.lng)/step<100)for(let lon=Math.ceil(top.lng/step)*step;lon<=bottom.lng;lon+=step)
      lines.push({points:[[lon,bottom.lat],[lon,top.lat]],text:label(MapSupport.longitude(lon),'lon'),vertical:true});
    }else{
     if(z<11)return tile;
     const {proj,clip}=config;if(!proj)return tile;
     const wrap=360*Math.round((center.lng-MapSupport.longitude(center.lng))/360);
     try{
      const sample=[];
      for(let i=0;i<=4;i++)for(const xy of [[size*i/4,0],[size*i/4,size],[0,size*i/4],[size,size*i/4]]){
       const p=ll(...xy);sample.push(proj4('WGS84',proj,[p.lng-wrap,p.lat]));
      }
      const es=sample.map(p=>p[0]),ns=sample.map(p=>p[1]);
      const e0=Math.floor(Math.min(...es)/1000)*1000,e1=Math.ceil(Math.max(...es)/1000)*1000;
      const n0=Math.floor(Math.min(...ns)/1000)*1000,n1=Math.ceil(Math.max(...ns)/1000)*1000;
      if((e1-e0+n1-n0)/1000>160)return tile;
      const line=(value,vertical)=>{
       let points=[];const flush=()=>{if(points.length>1)lines.push({points,text:String(((value/1000)%100+100)%100).padStart(2,'0'),vertical});points=[];};
       for(let i=0;i<=16;i++){
        const p=proj4(proj,'WGS84',vertical?[value,n0+(n1-n0)*i/16]:[e0+(e1-e0)*i/16,value]);
        if(!clip||(p[0]>=clip.west&&p[0]<=clip.east&&p[1]>=clip.south&&p[1]<=clip.north))points.push([p[0]+wrap,p[1]]);else flush();
       }
       flush();
      };
      for(let e=e0;e<=e1;e+=1000)line(e,true);
      for(let n=n0;n<=n1;n+=1000)line(n,false);
     }catch(_){return tile;}
    }
    const labels=[];
    for(const line of lines){
     const pts=line.points.map(pixel);ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
     ctx.strokeStyle='rgba(255,255,255,.65)';ctx.lineWidth=3;ctx.stroke();
     ctx.strokeStyle='rgba(36,75,121,.75)';ctx.lineWidth=1;ctx.stroke();
     // The label belongs to the geographic tile, not the viewport edge.
     // It therefore pans and scales with its line instead of jumping after a drag.
     const axis=line.vertical?'y':'x',edge=28;
     for(let i=1;i<pts.length;i++){
      const a=pts[i-1],b=pts[i];if((a[axis]-edge)*(b[axis]-edge)>0||a[axis]===b[axis])continue;
      const t=(edge-a[axis])/(b[axis]-a[axis]);
      const x=a.x+t*(b.x-a.x),y=a.y+t*(b.y-a.y);
      if(x>10&&x<size-10&&y>10&&y<size-10)labels.push({x,y,text:line.text});
     }
    }
    ctx.font='600 12px ui-monospace, Menlo, monospace';ctx.textAlign='center';ctx.textBaseline='middle';
    for(const {x,y,text} of labels){ctx.lineWidth=4;ctx.strokeStyle='rgba(255,255,255,.95)';ctx.strokeText(text,x,y);ctx.fillStyle='#244b79';ctx.fillText(text,x,y);}
    tile.dataset.labels=String(labels.length);tile.dataset.system=config.id;
    return tile;
   }
  }))({tileSize:size,pane:'overlayPane',className:'coordinate-grid',opacity:1,keepBuffer:1,updateWhenIdle:false,updateWhenZooming:false});
  function refresh(){
   const id=system(),p=map.getCenter(),lon=MapSupport.longitude(p.lng);
   let next={id,latitude:Math.round(p.lat/10)*10},key=id;
   if(id==='wgs84')key+=':'+next.latitude;
   if(id!=='wgs84'){
    if(['mgrs','globalutm'].includes(id)){
     try{const g=GlobalGrid.at(p.lat,lon);next={id,proj:g.proj,clip:GlobalGrid.zoneBounds(g.zone,g.band)};key+=':'+g.zone+g.band;}catch(_){next=null;}
    }else if(contains(id,p.lat,lon)){next={id,proj:projection(id)};}else next=null;
   }
   if(!enabled()||!next){if(map.hasLayer(layer))map.removeLayer(layer);signature='';return;}
   config=next;
   if(signature!==key){signature=key;if(map.hasLayer(layer))layer.redraw();}
   if(!map.hasLayer(layer))layer.addTo(map);
  }
  map.on('moveend',refresh);
  return {refresh,layer};
 };
})(globalThis);
