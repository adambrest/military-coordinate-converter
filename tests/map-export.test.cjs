const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../map-export.js'),'utf8'),context);
test('a PNG keeps the shape of its map, grows towards Full HD and is never shrunk',()=>{
 const cases=[
  // [container, expected] — a square map stays square, only smaller.
  [[1920,1080],[1920,1080]],
  [[1080,1920],[1080,1920]],
  [[400,400],[1080,1080]],
  [[390,620],[1080,1716]],
  // Already larger than Full HD: kept at its own size, because an export coarser
  // than the screen it came from is worse than a screenshot.
  [[2560,1440],[2560,1440]],
  [[1170,2532],[1170,2532]],
  [[5000,1000],[5000,1000]],
 ];
 for(const [[x,y],[width,height]] of cases){
  const output=context.createMapSnapshot.dimensions({x,y});
  assert.equal(output.width,width,`${x}x${y} width`);assert.equal(output.height,height,`${x}x${y} height`);
  assert.ok(Math.abs(output.width/output.height-x/y)<.001,`${x}x${y} ratio`);
  assert.ok(output.scale>=1,`${x}x${y} must never render below its own resolution`);
 }
});
