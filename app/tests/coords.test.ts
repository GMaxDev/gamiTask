import {test} from 'node:test';
import assert from 'node:assert/strict';
import {toCell,toWorld,DIMS} from '../src/coords.ts';

test('a world point maps to the floor tile that contains it',()=>{
 assert.deepEqual(toCell(-12,-10,'cafe'),{col:0,row:0});
 assert.deepEqual(toCell(-11.5,-9.5,'cafe'),{col:0,row:0});
 assert.deepEqual(toCell(0,0,'cafe'),{col:12,row:10});
 assert.deepEqual(toCell(11.9,9.9,'cafe'),{col:23,row:19});
 assert.deepEqual(toCell(-6,-5,'private'),{col:0,row:0});
});
test('points outside the room are clamped to the border tile',()=>{
 assert.deepEqual(toCell(-40,40,'cafe'),{col:0,row:19});
 assert.deepEqual(toCell(40,-40,'private'),{col:11,row:0});
});
test('a cell maps back to its centre',()=>{
 assert.deepEqual(toWorld(0,0,'cafe'),{x:-11.5,z:-9.5});
 assert.deepEqual(toWorld(23,19,'cafe'),{x:11.5,z:9.5});
 const c=toCell(3.2,-2.7,'private');const p=toWorld(c.col,c.row,'private');
 assert.deepEqual(toCell(p.x,p.z,'private'),c);
});
test('dimensions match the scene',()=>{assert.deepEqual(DIMS,{cafe:{w:24,d:20},garden:{w:24,d:20},private:{w:12,d:10}});});
