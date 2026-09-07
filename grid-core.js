/* Global WGS 84 MGRS and shared AO geometry. Distances are metres. */
(function(root){
  "use strict";
  const bands="CDEFGHJKLMNPQRSTUVWX";
  const transforms=new Map();
  function check(lat,lon){
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||lon < -180||lon > 180||lat < -80||lat > 84)
      throw new Error("Global MGRS supports 80°S to 84°N. Use latitude/longitude outside this area.");
  }
  function parts(lat,lon,digits=4){
    check(lat,lon);
    const value=root.mgrs.forward([lon,lat],digits);
    const match=value.match(/^(\d{1,2}[C-HJ-NP-X][A-HJ-NP-Z]{2})(\d*)$/);
    if(!match) throw new Error("Could not determine the grid square.");
    return {prefix:match[1],e:match[2].slice(0,digits),n:match[2].slice(digits)};
  }
  function parse(text,ao){
    const groups=String(text).trim().match(/(\d+)[\s,;/]+(\d+)\s*$/);
    if(groups&&groups[1].length!==groups[2].length)throw new Error("MGRS needs equal easting and northing groups.");
    const clean=String(text).toUpperCase().replace(/[\s,;/]+/g,"");
    const full=clean.match(/^([1-9]|[1-5]\d|60)([C-HJ-NP-X])([A-HJ-NP-Z]{2})(\d{0,10})$/);
    let reference=clean;
    if(!full){
      if(ao&&/^\d{1,2}[C-HJ-NP-X]$/.test(ao)){
        if(!/^[A-HJ-NP-Z]{2}(?:\d{2}){0,5}$/.test(clean))return {error:"Include the 100 km square letters when using a larger AO, e.g. DQ 1234 5678."};
        return parse(ao+clean);
      }
      if(!/^\d{2,10}$/.test(clean)||clean.length%2) throw new Error("Enter a complete MGRS reference or equal numeric groups.");
      if(!ao) return {error:"pick-square"};
      reference=ao+clean;
    } else if(full[4].length%2) throw new Error("MGRS needs equal easting and northing groups.");
    const prefix=reference.match(/^\d{1,2}[C-HJ-NP-X][A-HJ-NP-Z]{2}/)?.[0];
    if(!prefix) throw new Error("Invalid MGRS prefix.");
    const digits=(reference.length-prefix.length)/2;
    const box=root.mgrs.inverse(reference);
    const band=prefix.replace(/^\d+/,"")[0],bounds=zoneBounds(parseInt(prefix),band);
    if(!bounds)throw new Error("MGRS zone and band do not match.");
    // A grid cell on a zone/band edge may straddle it. Use the part in the stated AO.
    const west=Math.max(box[0],bounds.west),east=Math.min(box[2],bounds.east),south=Math.max(box[1],bounds.south),north=Math.min(box[3],bounds.north);
    if(west>=east||south>=north)throw new Error("MGRS zone, band and square do not match.");
    const lon=(west+east)/2, lat=(south+north)/2;
    check(lat,lon);
    // Library decoding is permissive; reject impossible band/square combinations.
    if(parts(lat,lon,0).prefix!==prefix) throw new Error("MGRS zone, band and square do not match.");
    return {lat,lon,prefix,digits,cellSize:10**(5-digits)};
  }
  function projection(zone,south){return `+proj=utm +zone=${zone}${south?" +south":""} +datum=WGS84 +units=m +no_defs`;}
  function zoneBounds(zone,band){
    const i=bands.indexOf(band), south=-80+i*8, north=band==="X"?84:south+8;
    let west=(zone-1)*6-180,east=west+6;
    if(band==="V") {if(zone===31)east=3; if(zone===32)west=3;}
    if(band==="X"){
      if([32,34,36].includes(zone)) return null;
      if(zone===31)east=9;
      if(zone===33){west=9;east=21;}
      if(zone===35){west=21;east=33;}
      if(zone===37)west=33;
    }
    return {west,east,south,north,zone,band};
  }
  function zones(bounds){
    const result=[];
    for(let zone=1;zone<=60;zone++) for(const band of bands){
      const b=zoneBounds(zone,band);
      if(b&&b.west<bounds.east&&b.east>bounds.west&&b.south<bounds.north&&b.north>bounds.south)result.push(b);
    }
    return result;
  }
  function clip(poly,b){
    for(const [axis,value,sign] of [[0,b.west,1],[0,b.east,-1],[1,b.south,1],[1,b.north,-1]]){
      const out=[];
      for(let i=0;i<poly.length;i++){
        const a=poly[i],c=poly[(i+1)%poly.length],ina=(a[axis]-value)*sign>=0,inc=(c[axis]-value)*sign>=0;
        if(ina)out.push(a);
        if(ina!==inc){const t=(value-a[axis])/(c[axis]-a[axis]);out.push([a[0]+t*(c[0]-a[0]),a[1]+t*(c[1]-a[1])]);}
      }
      poly=out;if(!poly.length)break;
    }
    return poly;
  }
  function square(proj,e,n,size=100000,bounds){
    if(!transforms.has(proj))transforms.set(proj,root.proj4(proj,"WGS84"));
    const transform=transforms.get(proj);
    const poly=[];
    const corners=[[e,n],[e+size,n],[e+size,n+size],[e,n+size],[e,n]];
    for(let edge=0;edge<4;edge++)for(let j=0;j<8;j++){
      const t=j/8,a=corners[edge],b=corners[edge+1];
      poly.push(transform.forward([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]));
    }
    return bounds?clip(poly,bounds):poly;
  }
  function at(lat,lon){
    const {prefix}=parts(lat,lon,0),zone=parseInt(prefix),band=prefix.replace(/^\d+/,"")[0];
    const proj=projection(zone,lat<0),en=root.proj4("WGS84",proj,[lon,lat]);
    const e=Math.floor(en[0]/100000),n=Math.floor(en[1]/100000);
    return {prefix,zone,band,proj,e,n,polygon:square(proj,e*100000,n*100000,100000,zoneBounds(zone,band))};
  }
  function inside(lon,lat,poly){
    let hit=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const a=poly[i],b=poly[j];
      if((a[1]>lat)!==(b[1]>lat)&&lon<(b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0])hit=!hit;
    }
    return hit;
  }
  function intersects(a,b){
    if(a.some(p=>inside(p[0],p[1],b))||b.some(p=>inside(p[0],p[1],a)))return true;
    const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
    for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){
      const p=a[i],q=a[(i+1)%a.length],r=b[j],s=b[(j+1)%b.length];
      if(cross(p,q,r)*cross(p,q,s)<0&&cross(r,s,p)*cross(r,s,q)<0)return true;
    }
    return false;
  }
  root.GlobalGrid={parts,parse,projection,zoneBounds,zones,square,at,clip,inside,intersects};
})(globalThis);
