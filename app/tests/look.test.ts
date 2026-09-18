import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultLook,loadLook,withChange,equalLook,createHistory,SKINS,HEADS,BANGS,BACKS,HAIR_COLORS,TROUSERS,skinHex} from '../src/look.ts';

test('the catalogue has the sizes the spec asks for',()=>{
 assert.equal(SKINS.length,6);assert.equal(HEADS.length,3);assert.equal(BANGS.length,5);assert.equal(BACKS.length,5);assert.equal(HAIR_COLORS.length,8);assert.equal(TROUSERS.length,4);
 assert.equal(BANGS[0].id,'none');assert.equal(BACKS[0].id,'none');
});
test('the default look wears the identity colour and no hat',()=>{
 const l=defaultLook(0xc9764f);
 assert.equal(l.shirt,0xc9764f);assert.equal(l.hat,null);assert.equal(l.headphones,true);assert.equal(l.head,'round');
 assert.ok(SKINS.some(s=>s.id===l.skin));assert.ok(HAIR_COLORS.some(c=>c.id===l.hairColor));
});
test('saved looks are validated field by field',()=>{
 const l=loadLook({skin:'zzz',head:'oval',bangs:'curtain',back:'nope',hairColor:HAIR_COLORS[3].id,shirt:'red',trousers:TROUSERS[2].id,headphones:0,hat:'hat-crown'},0x819478,['hat-crown']);
 assert.equal(l.skin,defaultLook(0).skin);assert.equal(l.head,'oval');assert.equal(l.bangs,'curtain');assert.equal(l.back,defaultLook(0).back);
 assert.equal(l.hairColor,HAIR_COLORS[3].id);assert.equal(l.shirt,0x819478);assert.equal(l.trousers,TROUSERS[2].id);assert.equal(l.headphones,false);assert.equal(l.hat,'hat-crown');
 assert.equal(loadLook({hat:'hat-crown'},0,[]).hat,null);assert.equal(loadLook(null,0x111111,[]).shirt,0x111111);
});
test('withChange is immutable and equalLook compares by value',()=>{
 const a=defaultLook(1),b=withChange(a,{skin:SKINS[4].id});
 assert.notEqual(a,b);assert.equal(a.skin,defaultLook(1).skin);assert.equal(b.skin,SKINS[4].id);
 assert.ok(equalLook(a,defaultLook(1)));assert.ok(!equalLook(a,b));
});
test('history undoes step by step, resets to the initial look and is bounded',()=>{
 const h=createHistory(defaultLook(1));
 assert.equal(h.canUndo(),false);assert.equal(h.undo(),null);
 h.push(withChange(h.current(),{head:'square'}));h.push(withChange(h.current(),{back:'bob'}));
 assert.equal(h.current().back,'bob');assert.equal(h.undo()?.back,BACKS[1].id);assert.equal(h.current().head,'square');
 assert.equal(h.reset().head,'round');assert.equal(h.canUndo(),false);
 for(let i=0;i<80;i++)h.push(withChange(h.current(),{shirt:i}));
 let n=0;while(h.undo())n++;assert.equal(n,50);
});
test('hex helpers resolve ids',()=>{assert.equal(skinHex(SKINS[0].id),SKINS[0].hex);assert.equal(skinHex('zzz'),SKINS[1].hex);});
