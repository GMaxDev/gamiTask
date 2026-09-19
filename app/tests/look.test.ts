import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultLook,loadLook,withChange,equalLook,createHistory,randomLook,SKINS,HEADS,BANGS,BACKS,HAIR_COLORS,TROUSERS,EYES,BROWS,NOSES,MOUTHS,BODIES,PATTERNS,SLEEVES,BOTTOMS,SHOES,HAIR_SETS,skinHex} from '../src/look.ts';
import {PALETTE} from '../src/identity.ts';

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
 assert.equal(l.hairColor,HAIR_COLORS[3].id);assert.equal(l.shirt,0x819478);assert.equal(l.trousers,TROUSERS[2].id);assert.equal(l.headphones,true);assert.equal(l.hat,'hat-crown');
 assert.equal(loadLook({hat:'hat-crown'},0,[]).hat,null);assert.equal(loadLook(null,0x111111,[]).shirt,0x111111);assert.equal(loadLook({headphones:false},0,[]).headphones,false);
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
test('a palette shirt colour survives the load',()=>{assert.equal(loadLook({shirt:PALETTE[3].hex},0,[]).shirt,PALETTE[3].hex);});

test('v2 catalogues have the expected shapes',()=>{
 assert.equal(EYES.length,5);assert.equal(BROWS.length,4);assert.equal(NOSES.length,4);assert.equal(MOUTHS.length,5);
 assert.equal(BODIES.length,3);assert.equal(PATTERNS.length,4);assert.equal(SLEEVES.length,2);assert.equal(BOTTOMS.length,3);assert.ok(SHOES.length>=3);
 assert.equal(HAIR_SETS.length,10);
});

test('HAIR_SETS ids are all valid against BANGS/BACKS/HAIR_COLORS',()=>{
 for(const s of HAIR_SETS){
  assert.ok(BANGS.some(b=>b.id===s.bangs),`bangs ${s.bangs}`);
  assert.ok(BACKS.some(b=>b.id===s.back),`back ${s.back}`);
  assert.ok(HAIR_COLORS.some(c=>c.id===s.hairColor),`hairColor ${s.hairColor}`);
  assert.ok(s.id&&s.label);
 }
});

test('the default look wears v2 defaults',()=>{
 const l=defaultLook(0xc9764f);
 assert.equal(l.eyes,'round');assert.equal(l.brows,'straight');assert.equal(l.nose,'button');assert.equal(l.mouth,'smile');
 assert.equal(l.eyesY,0);assert.equal(l.eyesGap,0);assert.equal(l.eyesSize,0);assert.equal(l.browsY,0);assert.equal(l.noseY,0);assert.equal(l.noseSize,0);assert.equal(l.mouthY,0);assert.equal(l.mouthSize,0);
 assert.equal(l.body,'regular');assert.equal(l.topPattern,'plain');assert.equal(l.sleeves,'short');assert.equal(l.bottom,'trousers');assert.equal(l.shoes,'brown');
});

test('a v1 saved look loads with v2 defaults',()=>{
 const v1={skin:'peach',head:'round',bangs:'straight',back:'short',hairColor:'brown',shirt:5,trousers:'cream',headphones:true,hat:null};
 const l=loadLook(v1,5,[]);
 assert.equal(l.eyes,'round');assert.equal(l.body,'regular');assert.equal(l.topPattern,'plain');assert.equal(l.sleeves,'short');assert.equal(l.bottom,'trousers');assert.equal(l.shoes,'brown');
 assert.equal(l.eyesY,0);
});

test('loadLook validates v2 fields: enums fall back, sliders clamp',()=>{
 const l=loadLook({eyes:'wink',brows:'nope',nose:'wide',mouth:'nope',body:'huge',sleeves:'nope',bottom:'skirt',eyesY:5,eyesGap:-5,eyesSize:2.5,browsY:'x'},0,[]);
 assert.equal(l.eyes,'wink');assert.equal(l.brows,defaultLook(0).brows);assert.equal(l.nose,'wide');assert.equal(l.mouth,defaultLook(0).mouth);
 assert.equal(l.body,defaultLook(0).body);assert.equal(l.sleeves,defaultLook(0).sleeves);assert.equal(l.bottom,'skirt');
 assert.equal(l.eyesY,0);assert.equal(l.eyesGap,0);assert.equal(l.eyesSize,0);assert.equal(l.browsY,0);
 assert.equal(loadLook({eyesY:3},0,[]).eyesY,3);assert.equal(loadLook({eyesY:-3},0,[]).eyesY,-3);
});

test('randomLook is deterministic under an injected rng and respects the catalogues',()=>{
 const seq=[0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,0.05,0.15,0.25,0.35,0.45,0.55,0.65,0.75,0.85,0.95,0.5,0.5,0.5,0.5];
 let i=0;const rng=()=>seq[i++%seq.length];
 const shirtPalette=PALETTE.map(p=>p.hex);
 const a=randomLook(shirtPalette,(()=>{let j=0;return()=>seq[j++%seq.length];})());
 const b=randomLook(shirtPalette,(()=>{let j=0;return()=>seq[j++%seq.length];})());
 assert.deepEqual(a,b);
 assert.ok(SKINS.some(s=>s.id===a.skin));assert.ok(HEADS.some(h=>h.id===a.head));assert.ok(BANGS.some(x=>x.id===a.bangs));assert.ok(BACKS.some(x=>x.id===a.back));
 assert.ok(HAIR_COLORS.some(x=>x.id===a.hairColor));assert.ok(TROUSERS.some(x=>x.id===a.trousers));
 assert.ok(shirtPalette.includes(a.shirt));assert.equal(a.hat,null);assert.equal(typeof a.headphones,'boolean');
 assert.ok(EYES.some(x=>x.id===a.eyes));assert.ok(BROWS.some(x=>x.id===a.brows));assert.ok(NOSES.some(x=>x.id===a.nose));assert.ok(MOUTHS.some(x=>x.id===a.mouth));
 assert.ok(BODIES.some(x=>x.id===a.body));assert.ok(PATTERNS.some(x=>x.id===a.topPattern));assert.ok(SLEEVES.some(x=>x.id===a.sleeves));assert.ok(BOTTOMS.some(x=>x.id===a.bottom));assert.ok(SHOES.some(x=>x.id===a.shoes));
 for(const k of ['eyesY','eyesGap','eyesSize','browsY','noseY','noseSize','mouthY','mouthSize'] as const){
  assert.ok(a[k]>=-2&&a[k]<=2,`${k}=${a[k]}`);
 }
});
