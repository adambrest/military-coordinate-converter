const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
function tools(){const dom=new JSDOM('',{runScripts:'outside-only'});dom.window.eval(fs.readFileSync(require('node:path').join(__dirname,'../route-tools.js'),'utf8'));return dom.window.RouteTools;}
test('GPX preserves namespace, names, route order and disconnected track segments',()=>{
 const r=tools(),data=r.parse('<gpx xmlns="http://www.topografix.com/GPX/1/1"><wpt lat="1" lon="2"><name>A &amp; B</name></wpt><trk><trkseg><trkpt lat="0" lon="0"/><trkpt lat="0" lon="1"/></trkseg><trkseg><trkpt lat="20" lon="20"/><trkpt lat="20" lon="21"/></trkseg></trk></gpx>');
 assert.equal(data.points.length,5);assert.equal(data.points[0].name,'A & B');assert.equal(data.points[3].breakBefore,true);
 const expected=r.distance({lat:0,lon:0},{lat:0,lon:1})+r.distance({lat:20,lon:20},{lat:20,lon:21});assert.ok(Math.abs(r.length(data.points)-expected)<.001);
 const round=r.parse(r.gpx(data.points,true));assert.equal(round.points.length,5);assert.ok(Math.abs(r.length(round.points)-expected)<.001);
});
test('GPX rejects malformed XML, missing/out-of-range coordinates and entities atomically',()=>{
 const r=tools();for(const xml of ['<gpx><trk></gpx>','<gpx><wpt lon="1"/></gpx>','<gpx><wpt lat="91" lon="1"/></gpx>','<!DOCTYPE gpx><gpx/>','<html/>'])assert.throws(()=>r.parse(xml));
});
test('haversine takes the short path across the date line and handles identical points',()=>{const r=tools();assert.equal(r.distance({lat:0,lon:0},{lat:0,lon:0}),0);assert.ok(Math.abs(r.distance({lat:0,lon:179.9},{lat:0,lon:-179.9})-22239)<10);});
test('waypoints do not create an invented GPX trail',()=>{const r=tools(),p=r.parse('<gpx><wpt lat="0" lon="0"/><wpt lat="40" lon="40"/></gpx>');assert.equal(p.connected,false);assert.equal(r.length(p.points),0);});
