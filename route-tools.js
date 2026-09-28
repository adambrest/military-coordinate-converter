/* GPX and horizontal distance calculations. No network requests. */
(function(root){
  'use strict';
  const valid=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;
  function distance(a,b){
    const rad=Math.PI/180,dl=(b.lat-a.lat)*rad,dn=(b.lon-a.lon)*rad;
    const h=Math.sin(dl/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dn/2)**2;
    return 6371008.8*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));
  }
  function length(points){let total=0;for(let i=1;i<points.length;i++)if(!points[i].breakBefore&&valid(points[i-1])&&valid(points[i]))total+=distance(points[i-1],points[i]);return total;}
  function summary(points){return points.length<2?'':`Total distance: ${(length(points)/1000).toFixed(2)} km`;}
  function parse(text){
    if(text.length>20*1024*1024)throw Error('GPX files must be smaller than 20 MB.');
    if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('GPX files with document entities are not supported.');
    const doc=new root.DOMParser().parseFromString(text,'application/xml');
    if(doc.querySelector('parsererror')||doc.documentElement.localName!=='gpx')throw Error('This is not a valid GPX file.');
    const children=(node,name)=>[...node.children].filter(n=>n.localName===name);
    const name=node=>oneLine(children(node,'name')[0]?.textContent);
    const points=[];let segment=0,hasRoute=false;
    function add(nodes,connected,label){
      const id=segment++;
      nodes.forEach((node,i)=>{
        const la=node.getAttribute('lat'),lo=node.getAttribute('lon');
        const p={lat:la===null||!la.trim()?NaN:Number(la),lon:lo===null||!lo.trim()?NaN:Number(lo),name:name(node)||label||'',breakBefore:!connected||i===0,segment:id};
        if(!valid(p))throw Error(`Invalid coordinate at GPX point ${points.length+1}. No points were imported.`);
        points.push(p);
        if(points.length>20000)throw Error('This GPX contains more than 20,000 points. Split it into smaller files.');
      });
    }
    for(const node of doc.documentElement.children){
      if(node.localName==='wpt')add([node],false,'');
      if(node.localName==='rte'){hasRoute=true;add(children(node,'rtept'),true,name(node));}
      if(node.localName==='trk'){hasRoute=true;for(const seg of children(node,'trkseg'))add(children(seg,'trkpt'),true,name(node));}
    }
    if(!points.length)throw Error('No waypoints, routes or tracks were found in this GPX.');
    return {points,connected:hasRoute,name:name(children(doc.documentElement,'metadata')[0]||doc.documentElement)||'Imported GPX'};
  }
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  // Two waypoints under one name are the same waypoint on the device they are sent to,
  // and some apps merge or drop the repeat outright, so a list read back has fewer
  // points than the one sent. The first keeps the name as typed; each repeat after it
  // is numbered, and the count carries on past a number someone typed themselves.
  // Unnamed points are numbered by position rather than all called the same thing.
  // A name arriving from a GPX file can hold a tab or a line break. Both survive into
  // the next GPX and into the tab-separated text Copy produces, where a tab shifts
  // every column after it, so a spreadsheet silently reads the wrong values. Any run of
  // whitespace becomes one space.
  const oneLine=value=>String(value==null?'':value).replace(/[\s]+/g,' ').trim();
  function labels(points){
    const used=new Set(),out=[];
    (points||[]).forEach((p,i)=>{
      const base=oneLine(p&&p.name)||('Point '+(i+1));
      let name=base;
      for(let n=2;used.has(name.toLowerCase());n++)name=base+' ('+n+')';
      used.add(name.toLowerCase());out.push(name);
    });
    return out;
  }
  function gpx(points,connected){
    const names=labels(points);
    const point=(p,tag,i)=>`<${tag} lat="${p.lat}" lon="${p.lon}"><name>${escape(names[i])}</name></${tag}>`;
    let body='';
    if(connected){let open=false;points.forEach((p,i)=>{if(!open||p.breakBefore){if(open)body+='</trkseg>';body+='<trkseg>';open=true;}body+=point(p,'trkpt',i);});if(open)body+='</trkseg>';body='<trk><name>Mike Golf Romeo route</name>'+body+'</trk>';}
    else body=points.map((p,i)=>point(p,'wpt',i)).join('');
    return '<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Mike Golf Romeo" xmlns="http://www.topografix.com/GPX/1/1">'+body+'</gpx>';
  }
  root.RouteTools={valid,distance,length,summary,parse,gpx,labels,oneLine};
})(globalThis);
