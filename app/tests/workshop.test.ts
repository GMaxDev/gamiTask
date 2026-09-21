import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newItem,addPart,slugId,duplicate,setFunction,defaultPart} from '../src/workshop-model.ts';

test('a new item is a furniture with one box to start from',()=>{
  const it=newItem();assert.equal(it.kind,'furniture');assert.equal(it.parts.length,1);assert.equal(it.parts[0].kind,'box');assert.deepEqual([it.w,it.d],[1,1]);
});
test('parts are added with sane defaults, sitting on the floor',()=>{
  const it=addPart(addPart(newItem(),'cyl'),'ball');
  assert.equal(it.parts.length,3);assert.equal(it.parts[1].kind,'cyl');assert.equal(it.parts[2].kind,'ball');
  for(const p of it.parts)assert.ok(p.y>0&&/^#[0-9a-f]{6}$/.test(p.color));
});
test('ids are slugs of the name, made unique against what exists',()=>{
  assert.equal(slugId('Tabouret Été !',[]),'tabouret-ete');
  assert.equal(slugId('Tabouret',['tabouret']),'tabouret-2');
  assert.equal(slugId('Tabouret',['tabouret','tabouret-2']),'tabouret-3');
  assert.equal(slugId('plant',[]),'plant-2');// never a built-in id
  assert.equal(slugId('!!',[]),'objet');
});
test('a duplicate is a deep copy under a fresh id and name',()=>{
  const a=addPart(newItem(),'cyl');a.id='stool';a.name='Tabouret';
  const b=duplicate(a,['stool']);
  assert.equal(b.id,'tabouret-copie');assert.equal(b.name,'Tabouret (copie)');assert.notEqual(b.parts,a.parts);assert.deepEqual(b.parts,a.parts);
});
test('a function is switched on with one default anchor and off by dropping all of its anchors',()=>{
  let it=setFunction(newItem(),'seat',true);assert.equal(it.anchors.length,1);assert.equal(it.anchors[0].kind,'seat');
  it=setFunction(it,'surface',true);it.anchors.push({...it.anchors[0]});assert.equal(it.anchors.length,3);
  it=setFunction(it,'seat',false);assert.deepEqual(it.anchors.map(a=>a.kind),['surface']);
  assert.equal(setFunction(it,'surface',true).anchors.length,1);// already on: nothing added
});
test('every part kind has a default that stands on the floor',()=>{
  for(const k of ['box','cyl','ball','torus','shell'] as const){const p=defaultPart(k) as any;assert.equal(p.kind,k);assert.ok(p.y>0);}
});
