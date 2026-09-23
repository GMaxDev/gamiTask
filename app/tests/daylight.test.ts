import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nightness,clockLabel,momentLabel,DAWN,FULL,DUSK,NIGHT} from '../src/daylight.ts';

const at=(h: number,m=0)=>new Date(2026,0,15,h,m);

test('la nuit est pleine hors des bornes, le jour est plein entre elles',()=>{
 assert.equal(nightness(at(3)),1);assert.equal(nightness(at(23)),1);
 assert.equal(nightness(at(DAWN)),1);assert.equal(nightness(at(NIGHT)),1);
 assert.equal(nightness(at(FULL)),0);assert.equal(nightness(at(12)),0);assert.equal(nightness(at(DUSK)),0);
});

test('aube et crépuscule descendent et remontent sans à-coup',()=>{
 assert.equal(nightness(at(7,30)),.5);// milieu de l'aube
 assert.equal(nightness(at(18,30)),.5);// milieu du crépuscule
 for(let h=DAWN;h<FULL;h+=.25)assert.ok(nightness(at(Math.floor(h),(h%1)*60))>=nightness(at(Math.floor(h+.25),((h+.25)%1)*60)),`l'aube remonte à ${h}`);
 assert.ok(nightness(at(19))>nightness(at(18)));
});

test('clockLabel et momentLabel disent l’heure et le moment',()=>{
 assert.equal(clockLabel(at(9,5)),'09:05');assert.equal(clockLabel(at(14,32)),'14:32');
 assert.equal(momentLabel(at(12)),'plein jour');assert.equal(momentLabel(at(2)),'nuit');
 assert.equal(momentLabel(at(7,30)),'aube');assert.equal(momentLabel(at(18,30)),'crépuscule');
});
