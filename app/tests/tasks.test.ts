import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTasks,setTasks,taskAdded,taskToggled,taskUpdated,taskDeleted,pending,cleanText,categoryId} from '../src/tasks.ts';
import type {Task} from '@shared/types';

const t=(id:string,extra:Partial<Task>={}):Task=>({id,userId:'u',text:'Tâche '+id,done:false,createdAt:1,category:null,type:'task',...extra});

test('server state replaces the list and pending filters done tasks',()=>{
 const s=createTasks();setTasks(s,[t('a'),t('b',{done:true})]);
 assert.equal(s.list.length,2);assert.deepEqual(pending(s).map(x=>x.id),['a']);
 setTasks(s,[t('c')]);assert.deepEqual(s.list.map(x=>x.id),['c']);
});
test('added tasks go first and are never duplicated',()=>{
 const s=createTasks();setTasks(s,[t('a')]);taskAdded(s,t('b'));taskAdded(s,t('b'));
 assert.deepEqual(s.list.map(x=>x.id),['b','a']);
});
test('toggle, update and delete apply what the server says',()=>{
 const s=createTasks();setTasks(s,[t('a')]);
 assert.equal(taskToggled(s,'a',true)?.done,true);assert.equal(taskToggled(s,'zz',true),null);
 assert.equal(taskUpdated(s,'a','Relire','work')?.category,'work');assert.equal(s.list[0].text,'Relire');
 assert.equal(taskDeleted(s,'a'),true);assert.equal(taskDeleted(s,'a'),false);
});
test('text and category are validated before being sent',()=>{
 assert.equal(cleanText('  Écrire   le brief '),'Écrire le brief');assert.equal(cleanText('   '),'');assert.equal(cleanText('x'.repeat(500)).length,120);assert.equal(cleanText(null),'');
 assert.equal(categoryId('work'),'work');assert.equal(categoryId('nope'),null);
});
