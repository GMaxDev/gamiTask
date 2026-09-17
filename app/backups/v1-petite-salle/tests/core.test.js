import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNavigator} from '../src/navigation.js';
import {createTimer,remainingSeconds,toggleTimer,resetTimer} from '../src/timer.js';

test('avatar routes around a counter without crossing furniture',()=>{
 const nav=createNavigator([{x:0,z:0,w:2,d:3}]);
 const path=nav.path({x:-3,z:0},{x:3,z:0});
 assert.ok(path.length>5);assert.deepEqual(path.at(-1),{x:3,z:0});
 for(const p of path)assert.ok(nav.isWalkable(p));
 for(let i=1;i<path.length;i++)for(let t=0;t<=1;t+=.1)assert.ok(nav.isWalkable({x:path[i-1].x*(1-t)+path[i].x*t,z:path[i-1].z*(1-t)+path[i].z*t}));
});
test('clicking a blocked target chooses a free cell near it',()=>{
 const nav=createNavigator([{x:0,z:0,w:2,d:2}]);const path=nav.path({x:3,z:3},{x:0,z:0});
 assert.ok(path.length);assert.ok(nav.isWalkable(path.at(-1)));
});
test('inaccessible regions return no path',()=>{
 const nav=createNavigator([{x:0,z:0,w:1,d:20}]);assert.deepEqual(nav.path({x:-3,z:0},{x:3,z:0}),[]);
});
test('timer uses elapsed wall time, including a suspended tab',()=>{
 const state=createTimer();toggleTimer(state,1000);
 assert.equal(remainingSeconds(state,61000),1440);
 assert.equal(remainingSeconds(state,1700000),0);
});
test('pause, resume and reload preserve remaining time',()=>{
 let state=createTimer();toggleTimer(state,1000);toggleTimer(state,31000);
 assert.equal(state.remaining,1470);assert.equal(state.endAt,null);
 toggleTimer(state,91000);state=createTimer(JSON.parse(JSON.stringify(state)));
 assert.equal(remainingSeconds(state,121000),1440);
});
test('switching mode resets the running timer',()=>{
 const state=createTimer();toggleTimer(state,1000);resetTimer(state,'short');
 assert.equal(state.remaining,300);assert.equal(state.endAt,null);assert.equal(state.mode,'short');
});
test('invalid saved durations are bounded',()=>{
 const state=createTimer({durations:{focus:-10,short:999,long:'oops'},mode:'nope'});
 assert.deepEqual(state.durations,{focus:1,short:90,long:15});assert.equal(state.mode,'focus');
});
