import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProgress,completeTask,completePomodoro,levelOf,levelInfo,ACHIEVEMENTS} from '../src/progress.ts';

const H=60*60*1000;

test('level curve matches the original app',()=>{
 assert.equal(levelOf(0),0);assert.equal(levelOf(50),1);assert.equal(levelOf(199),1);assert.equal(levelOf(200),2);assert.equal(levelOf(1250),5);
 assert.deepEqual(levelInfo({xp:120} as any),{level:1,into:70,span:150,next:200});
});
test('tasks pay coins and unlock the first achievement once',()=>{
 const p=createProgress();const r=completeTask(p);
 assert.equal(p.coins,10);assert.deepEqual(r.unlocked.map(a=>a.key),['first-task']);
 assert.equal(completeTask(p).unlocked.length,0);assert.equal(p.tasksDone,2);
});
test('pomodoros give xp, coins and a streak bonus inside the two hour window',()=>{
 const p=createProgress();let r=completePomodoro(p,10*H);
 assert.equal(r.xp,50);assert.equal(r.streak,1);assert.equal(r.bonus,5);assert.equal(p.coins,25);assert.equal(r.levelUp,true);assert.equal(r.level,1);
 assert.ok(r.unlocked.some(a=>a.key==='first-pomo'));
 r=completePomodoro(p,11*H);assert.equal(r.streak,2);assert.equal(r.bonus,10);
 r=completePomodoro(p,14*H);assert.equal(r.streak,1);
});
test('streak bonus is capped and streak-5 unlocks',()=>{
 const p=createProgress();let r;for(let i=0;i<12;i++)r=completePomodoro(p,i*H);
 assert.equal(r!.streak,12);assert.equal(r!.bonus,50);assert.ok(p.achievements.includes('streak-5'));assert.ok(p.achievements.includes('coins-100'));
});
test('saved data is sanitised',()=>{
 const p=createProgress({coins:-5,xp:'x',achievements:['first-task','bogus'],pomos:2.7} as any);
 assert.deepEqual(p,{coins:0,xp:0,tasksDone:0,pomos:2,streak:0,lastPomoAt:0,achievements:['first-task']});
 assert.equal(ACHIEVEMENTS.length,7);
});
