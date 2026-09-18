import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadIdentity,cleanName,PALETTE} from '../src/identity.ts';

const uuid=()=>'u-1';
test('a first visit gets a fresh user id and needs a name',()=>{
 const {identity,fresh}=loadIdentity(null,uuid);
 assert.equal(identity.userId,'u-1');assert.equal(identity.name,'');assert.equal(fresh,true);
 assert.ok(PALETTE.some(p=>p.hex===identity.color));
});
test('a saved identity is kept as is',()=>{
 const {identity,fresh}=loadIdentity({userId:'abc',name:'Maxime',color:PALETTE[2].hex},uuid);
 assert.deepEqual(identity,{userId:'abc',name:'Maxime',color:PALETTE[2].hex});assert.equal(fresh,false);
});
test('corrupt fields fall back without losing the user id',()=>{
 const {identity,fresh}=loadIdentity({userId:'abc',name:'   ',color:'red'},uuid);
 assert.equal(identity.userId,'abc');assert.equal(identity.name,'');assert.equal(fresh,true);assert.equal(identity.color,PALETTE[0].hex);
});
test('names are trimmed, squeezed and bounded',()=>{
 assert.equal(cleanName('  Max   G '),'Max G');assert.equal(cleanName('x'),null);assert.equal(cleanName('a'.repeat(30))?.length,20);assert.equal(cleanName(42),null);
});
