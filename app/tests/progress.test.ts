import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProgress,setCoins,setXp,setStreak,unlock,setAchievements,levelInfo,setEnergy,setExhausted} from '../src/progress.ts';
import {ACHIEVEMENTS} from '@shared/types';
import {levelOf} from '@shared/scoring';

test('level curve matches the server',()=>{
 assert.equal(levelOf(0),0);assert.equal(levelOf(50),1);assert.equal(levelOf(199),1);assert.equal(levelOf(200),2);assert.equal(levelOf(1250),5);
 assert.deepEqual(levelInfo({xp:120}),{level:1,into:70,span:150,next:200});
});
test('server updates are applied verbatim',()=>{
 const p=createProgress();setCoins(p,42);setXp(p,{xp:120,level:1});setStreak(p,3);
 assert.equal(p.coins,42);assert.equal(p.xp,120);assert.equal(p.level,1);assert.equal(p.streak,3);
});
test('achievements unlock once and unknown keys are ignored',()=>{
 const p=createProgress();
 assert.equal(unlock(p,'first-task'),true);assert.equal(unlock(p,'first-task'),false);assert.equal(unlock(p,'nope'),false);
 setAchievements(p,['first-pomo','zzz','first-task']);assert.deepEqual(p.achievements,['first-pomo','first-task']);
});
test('the catalogue lists the eight server achievements',()=>{
 assert.deepEqual(ACHIEVEMENTS.map(a=>a.key),['first-task','task-10','task-50','first-pomo','streak-5','coins-100','coins-500','first-collective']);
});
test('energy is clamped to 0..50 and exhaustion is a flag',()=>{
 const p=createProgress();assert.equal(p.energy,50);setEnergy(p,70);assert.equal(p.energy,50);setEnergy(p,-3);assert.equal(p.energy,0);setEnergy(p,12.6);assert.equal(p.energy,13);setExhausted(p,true);assert.equal(p.exhausted,true);
});
