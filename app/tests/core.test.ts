import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNavigator} from '../src/navigation.ts';
import {createTimer,remainingSeconds,toggleTimer,resetTimer,advance,PER_CYCLE} from '../src/timer.ts';

test('avatar routes around a counter without crossing furniture',()=>{
 const nav=createNavigator([{x:0,z:0,w:2,d:3}]);
 const path=nav.path({x:-3,z:0},{x:3,z:0});
 assert.ok(path.length>5);assert.deepEqual(path.at(-1),{x:3,z:0});
 for(const p of path)assert.ok(nav.isWalkable(p));
 for(let i=1;i<path.length;i++)for(let t=0;t<=1;t+=.1)assert.ok(nav.isWalkable({x:path[i-1]!.x*(1-t)+path[i]!.x*t,z:path[i-1]!.z*(1-t)+path[i]!.z*t}));
});
test('clicking a blocked target chooses a free cell near it',()=>{
 const nav=createNavigator([{x:0,z:0,w:2,d:2}]);const path=nav.path({x:3,z:3},{x:0,z:0});
 assert.ok(path.length);assert.ok(nav.isWalkable(path.at(-1)!));
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
test('the focused task survives a reload, anything else reads as none',()=>{
 assert.equal(createTimer().taskId,null);
 assert.equal(createTimer({taskId:'t1'}).taskId,'t1');
 assert.equal(createTimer({taskId:42 as any}).taskId,null);
 assert.equal(createTimer({taskId:''}).taskId,null);
 const state=createTimer({taskId:'t1'});resetTimer(state,'short');advance(state,1);assert.equal(state.taskId,'t1');// pauses and mode switches keep it: the next focus is likely the same task
});
test('switching mode resets the running timer',()=>{
 const state=createTimer();toggleTimer(state,1000);resetTimer(state,'short');
 assert.equal(state.remaining,300);assert.equal(state.endAt,null);assert.equal(state.mode,'short');
});
test('invalid saved durations are bounded',()=>{
 const state=createTimer({durations:{focus:-10,short:999,long:'oops'},mode:'nope'} as any);
 assert.deepEqual(state.durations,{focus:1,short:90,long:15});assert.equal(state.mode,'focus');
});
test('custom bounds let the avatar cross a bigger room',()=>{
 const nav=createNavigator([{x:0,z:0,w:2,d:2}],.25,{minX:-11.5,maxX:11.5,minZ:-9.5,maxZ:9.5});
 const path=nav.path({x:-11,z:-9},{x:11,z:9});assert.ok(path.length>60);assert.deepEqual(path.at(-1),{x:11,z:9});
});

test('un cycle enchaîne 4 focus, 3 petites pauses et une longue, puis repart',()=>{
 const state=createTimer();const seen: string[]=[];let done=0;
 for(let i=0;i<8;i++){
  if(state.mode==='focus')done++;
  const {to,started}=advance(state,done,1000);seen.push(to+(started?'*':''));
  if(!started)break;
 }
 assert.deepEqual(seen,['short*','focus*','short*','focus*','short*','focus*','long*','focus*']);
 assert.notEqual(state.endAt,null);assert.equal(state.mode,'focus');
});

test('advance : la longue pause tombe tous les PER_CYCLE focus, l’enchaînement coupé attend le clic',()=>{
 assert.equal(PER_CYCLE,4);
 const st=createTimer();for(const [done,to] of [[1,'short'],[3,'short'],[4,'long'],[8,'long'],[5,'short']] as const){resetTimer(st,'focus');assert.equal(advance(st,done,1000).to,to);}
 const manual=createTimer({autoChain:false} as any);
 const r=advance(manual,1,1000);assert.equal(r.to,'short');assert.equal(r.started,false);assert.equal(manual.endAt,null);
});

test('enchaînement actif par défaut, les anciennes clés perCycle / seatOnFocus sont ignorées',()=>{
 assert.equal(createTimer().autoChain,true);
 const old=createTimer({perCycle:2,seatOnFocus:false,autoChain:false} as any);
 assert.equal(old.autoChain,false);assert.equal('perCycle' in old,false);assert.equal('seatOnFocus' in old,false);
 resetTimer(old,'focus');assert.equal(advance(old,2,1000).to,'short');// pas de cycle raccourci : 2 focus ne font pas une longue pause
});
