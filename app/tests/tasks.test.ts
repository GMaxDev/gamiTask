import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTasks,setTasks,taskAdded,taskScored,taskUpdated,taskDeleted,visible,pending,remaining,cleanText,categoryId,toggleDay,newTaskPayload,DIFFICULTIES} from '../src/tasks.ts';
import type {Task} from '@shared/types';

const t=(id:string,extra:Partial<Task>={}):Task=>({id,userId:'u',text:'Tâche '+id,note:'',kind:'todo',difficulty:'easy',value:0,category:null,createdAt:Number(id.replace(/\D/g,''))||1,done:false,up:true,down:false,countUp:0,countDown:0,days:127,streak:0,dueAt:null,checklist:[],completedAt:null,focusCount:0,...extra});
const WED=new Date(2026,8,23);// mercredi

test('server state replaces the list; pending keeps open todos, unticked dailies and every habit',()=>{
 const s=createTasks();setTasks(s,[t('a1'),t('b2',{done:true}),t('c3',{kind:'daily',done:true}),t('d4',{kind:'daily'}),t('e5',{kind:'habit'})]);
 assert.deepEqual(pending(s).map(x=>x.id).sort(),['a1','d4','e5']);
});
test('visible follows the tab and the filter, due dailies first',()=>{
 const s=createTasks();setTasks(s,[t('a1'),t('b2',{done:true}),t('c3',{kind:'daily',days:1}),t('d4',{kind:'daily',days:4}),t('e5',{kind:'daily',days:4,done:true}),t('f6',{kind:'habit'})]);
 s.tab='todo';s.filter='remaining';assert.deepEqual(visible(s,WED).map(x=>x.id),['a1']);
 s.filter='all';assert.deepEqual(visible(s,WED).map(x=>x.id),['b2','a1']);
 s.tab='daily';s.filter='remaining';assert.deepEqual(visible(s,WED).map(x=>x.id),['d4','c3']);// due today first, then not due; ticked hidden
 s.filter='all';assert.deepEqual(visible(s,WED).map(x=>x.id),['e5','d4','c3']);
 s.tab='habit';s.filter='remaining';assert.deepEqual(visible(s,WED).map(x=>x.id),['f6']);
});
test('remaining counts due unticked dailies and open todos',()=>{
 const s=createTasks();setTasks(s,[t('a1'),t('b2',{done:true}),t('c3',{kind:'daily',days:1}),t('d4',{kind:'daily',days:4}),t('f6',{kind:'habit'})]);
 assert.equal(remaining(s,WED),2);
});
test('scored and updated tasks replace the stored one',()=>{
 const s=createTasks();setTasks(s,[t('a1')]);
 assert.equal(taskScored(s,t('a1',{done:true,value:1}))?.done,true);assert.equal(s.list[0].value,1);
 assert.equal(taskUpdated(s,t('a1',{text:'X'}))?.text,'X');assert.equal(taskScored(s,t('zz')),null);
 taskAdded(s,t('b2'));taskAdded(s,t('b2'));assert.equal(s.list.length,2);assert.ok(taskDeleted(s,'b2'));
});
test('day toggles flip one bit and never empty the mask',()=>{
 assert.equal(toggleDay(127,0),126);assert.equal(toggleDay(1,0),1);assert.equal(toggleDay(0,3),8);
});
test('the add payload only carries the fields of its kind',()=>{
 assert.deepEqual(newTaskPayload('habit','Eau',{difficulty:'easy',category:null,up:true,down:true,days:5,checklist:[{text:'x',done:false}]}),{text:'Eau',kind:'habit',difficulty:'easy',category:null,up:true,down:true});
 assert.deepEqual(newTaskPayload('daily','Sport',{difficulty:'hard',category:'perso',days:5}),{text:'Sport',kind:'daily',difficulty:'hard',category:'perso',days:5});
 assert.deepEqual(newTaskPayload('todo','Projet',{difficulty:'medium',category:null,dueAt:9,checklist:[{text:'x',done:false}]}),{text:'Projet',kind:'todo',difficulty:'medium',category:null,dueAt:9,checklist:[{text:'x',done:false}]});
 assert.equal(DIFFICULTIES.length,4);
});
test('text is trimmed, collapsed and capped; categories are validated',()=>{
 assert.equal(cleanText('  a   b '),'a b');assert.equal(cleanText('x'.repeat(200)).length,120);assert.equal(categoryId('work'),'work');assert.equal(categoryId('nope'),null);
});
