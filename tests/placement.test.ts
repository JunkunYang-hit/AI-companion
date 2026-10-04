import test from 'node:test';
import assert from 'node:assert/strict';
import {quickPlacement} from '../src/companion/placement';
test('quick input fits the active display and chooses an unobstructed side',()=>{
 for(const area of [{x:0,y:0,width:1920,height:1080},{x:-1280,y:-200,width:1280,height:800}]){
  const left={x:area.x,y:area.y+100,width:310,height:270},right={...left,x:area.x+area.width-310};
  const a=quickPlacement(left,area),b=quickPlacement(right,area);assert(a.x>=left.x+left.width);assert(b.x+b.width<=right.x);
  for(const result of [a,b]){assert(result.x>=area.x);assert(result.y>=area.y);assert(result.x+result.width<=area.x+area.width);assert(result.y+result.height<=area.y+area.height);}
 }
 const pet={x:100,y:100,width:620,height:540},area={x:0,y:0,width:800,height:1000},result=quickPlacement(pet,area);assert(result.y>=pet.y+pet.height);
});
