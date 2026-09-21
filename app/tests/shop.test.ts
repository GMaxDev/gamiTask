import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createShop,setCosmetics,setFurniture,canPlace,takenCells,completeSets,toServerCell,GRID,setCatalog,FURNITURE,HATS,item,footprint,custom,withOriginals,isBuiltIn} from '../src/shop.ts';

test('cosmetics state sets owned hats and the worn one only if owned',()=>{
 const s=createShop();setCosmetics(s,{owned:['hat-party','ghost'],equippedHat:'hat-crown'});
 assert.deepEqual(s.hats,['hat-party']);assert.equal(s.hat,null);
 setCosmetics(s,{owned:['hat-party'],equippedHat:'hat-party'});assert.equal(s.hat,'hat-party');
});
test('furniture state keeps placed pieces with a valid, non-overlapping cell',()=>{
 const s=createShop();
 setFurniture(s,{owned:['plant','lamp','bookshelf','cactus'],placed:['plant','lamp','bookshelf','cactus'],positions:{plant:{col:1,row:5},lamp:{col:1,row:5},bookshelf:{col:6,row:10},cactus:{col:3,row:7}}});
 assert.deepEqual(s.furniture,['plant','lamp','bookshelf','cactus']);
 assert.deepEqual(s.placed,{plant:{c:1,r:5},cactus:{c:3,r:7}});// lamp overlaps the plant, the bookshelf sticks out of the room
});
test('pieces not in the placed list stay stored',()=>{
 const s=createShop();setFurniture(s,{owned:['plant'],placed:[],positions:{plant:{col:1,row:5}}});assert.deepEqual(s.placed,{});
});
test('local placement validation mirrors the room grid',()=>{
 const s=createShop();setFurniture(s,{owned:['plant','lamp','bookshelf'],placed:['plant'],positions:{plant:{col:2,row:3}}});
 assert.equal(canPlace(s,'lamp',{c:2,r:3}),false);assert.equal(canPlace(s,'lamp',{c:GRID.cols,r:0}),false);assert.equal(canPlace(s,'lamp',{c:5,r:5}),true);
 assert.equal(canPlace(s,'bookshelf',{c:0,r:GRID.rows-1}),false);assert.equal(canPlace(s,'bookshelf',{c:2,r:4}),true);
 assert.equal(canPlace(s,'plant',{c:2,r:3}),true);// moving onto its own cell
 assert.equal(canPlace(s,'cactus',{c:0,r:0}),false);// not owned
 assert.deepEqual([...takenCells(s)],['2,3']);assert.deepEqual([...takenCells(s,'plant')],[]);
 assert.deepEqual(toServerCell({c:4,r:1}),{col:4,row:1});
});
test('a set is complete when every piece is owned',()=>{
 const s=createShop();setFurniture(s,{owned:['plant','cactus','lamp'],placed:[],positions:{}});
 assert.deepEqual(completeSets(s).map(x=>x.id),['jardin']);
});
test('custom items join the catalogue and leave when the server drops them',()=>{
 const stool={id:'stool',kind:'furniture' as const,name:'Tabouret',emoji:'🪑',price:50,w:2,d:1,parts:[],anchors:[]},cone={...stool,id:'hat-cone',kind:'hat' as const,w:1};
 setCatalog([stool,cone]);
 assert.ok(FURNITURE.some(f=>f.id==='stool'));assert.ok(HATS.some(h=>h.id==='hat-cone'));assert.equal(item('stool')?.name,'Tabouret');assert.deepEqual(footprint('stool'),{w:2,d:1});
 const s=createShop();setFurniture(s,{owned:['stool'],placed:['stool'],positions:{stool:{col:1,row:1}}});assert.deepEqual(s.placed.stool,{c:1,r:1});
 setCatalog([]);assert.ok(!FURNITURE.some(f=>f.id==='stool'));assert.ok(!HATS.some(h=>h.id==='hat-cone'));assert.equal(item('stool'),null);assert.deepEqual(footprint('stool'),{w:1,d:1});
});
test('an override of a built-in keeps the shop lists as they are but answers custom()',()=>{
  const plant={id:'plant',kind:'furniture' as const,name:'Plante',emoji:'🪴',price:80,w:1,d:1,parts:[],anchors:[]},chair={...plant,id:'chair',kind:'decor' as const};
  setCatalog([plant,chair]);
  assert.equal(FURNITURE.filter(f=>f.id==='plant').length,1);assert.ok(!FURNITURE.some(f=>f.id==='chair'));assert.ok(!HATS.some(h=>h.id==='chair'));
  assert.equal(custom('plant'),plant);assert.equal(custom('chair'),chair);assert.equal(withOriginals(()=>custom('plant')),null);assert.equal(custom('plant'),plant);
  assert.ok(isBuiltIn('plant'));assert.ok(!isBuiltIn('chair'));setCatalog([]);
});
