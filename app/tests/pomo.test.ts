import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRoomPomo,applyState,applyTick,remainingAt,DURATION,phaseLabel,subtitle,format} from '../src/pomo.ts';

test('a fresh room pomodoro is idle on a full focus',()=>{
 const p=createRoomPomo();
 assert.deepEqual({...p,syncedAt:0},{phase:'focus',remaining:1500,running:false,participants:0,session:0,joined:false,syncedAt:0});
 assert.equal(DURATION['focus'],1500);assert.equal(DURATION['short-break'],300);assert.equal(DURATION['long-break'],900);
});

test('applyState copies the server state and stamps the sync time, leaving `joined` alone',()=>{
 const p=createRoomPomo();p.joined=true;
 applyState(p,{phase:'short-break',remaining:280,running:true,participants:3,session:2},1000);
 assert.deepEqual(p,{phase:'short-break',remaining:280,running:true,participants:3,session:2,joined:true,syncedAt:1000});
});

test('applyTick refreshes the countdown and marks the session running',()=>{
 const p=createRoomPomo();
 applyTick(p,{remaining:1499,phase:'focus',session:0},5000);
 assert.equal(p.remaining,1499);assert.equal(p.running,true);assert.equal(p.syncedAt,5000);
 applyTick(p,{remaining:299,phase:'short-break',session:1},6000);
 assert.equal(p.phase,'short-break');assert.equal(p.session,1);
});

test('remainingAt extrapolates between two ticks, never below zero, and freezes when stopped',()=>{
 const p=createRoomPomo();
 applyState(p,{phase:'focus',remaining:100,running:true,participants:1,session:0},10_000);
 assert.equal(remainingAt(p,10_000),100);
 assert.equal(remainingAt(p,13_000),97);
 assert.equal(remainingAt(p,13_400),96);// a partial second is already spent
 assert.equal(remainingAt(p,999_000),0);
 applyState(p,{phase:'focus',remaining:100,running:false,participants:0,session:0},10_000);
 assert.equal(remainingAt(p,99_000),100);
});

test('subtitle says who is in the session, with names when we have them',()=>{
 const p=createRoomPomo();
 assert.equal(subtitle(p,[]),'Personne pour l’instant. Lance la session ?');
 p.participants=1;assert.equal(subtitle(p,[]),'1 personne se concentre');
 p.participants=3;assert.equal(subtitle(p,[]),'3 personnes se concentrent');
 p.joined=true;
 p.participants=1;assert.equal(subtitle(p,[]),'Tu es seul·e pour l’instant');
 p.participants=2;assert.equal(subtitle(p,[]),'Avec 1 autre personne');
 p.participants=3;assert.equal(subtitle(p,[]),'Avec 2 autres personnes');
 p.participants=2;assert.equal(subtitle(p,['Dorabis']),'Avec Dorabis');
 p.participants=3;assert.equal(subtitle(p,['Dorabis','Violette']),'Avec Dorabis et Violette');
 p.participants=5;assert.equal(subtitle(p,['Dorabis','Violette','Jo','Ana']),'Avec Dorabis, Violette et 2 autres');
 p.participants=4;assert.equal(subtitle(p,['Dorabis','Violette','Jo']),'Avec Dorabis, Violette et 1 autre');
 p.participants=4;assert.equal(subtitle(p,['Dorabis']),'Avec Dorabis et 2 autres');// le compte du serveur fait foi, pas la longueur de la liste
});

test('phaseLabel and format speak the café’s language',()=>{
 assert.equal(phaseLabel('focus'),'Focus');
 assert.equal(phaseLabel('short-break'),'Pause');
 assert.equal(phaseLabel('long-break'),'Longue');
 assert.equal(format(1500),'25:00');
 assert.equal(format(0),'00:00');
 assert.equal(format(61),'01:01');
 assert.equal(format(-5),'00:00');
});
