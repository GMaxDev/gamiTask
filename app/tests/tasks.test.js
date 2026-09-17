import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTasks,addTask,updateTask,toggleTask,removeTask,pending,dailyReset} from '../src/tasks.js';

const day=(d,h=12)=>new Date(2026,8,d,h).getTime();

test('add, edit, toggle and remove a task',()=>{
 const s=createTasks({},day(1));const t=addTask(s,'  Écrire   le brief ','work','task',day(1));
 assert.equal(t.text,'Écrire le brief');assert.equal(t.category,'work');assert.equal(pending(s).length,1);
 updateTask(s,t.id,{text:'Relire',category:'nope'});assert.equal(t.text,'Relire');assert.equal(t.category,null);
 toggleTask(s,t.id);assert.equal(t.done,true);assert.equal(pending(s).length,0);
 assert.equal(removeTask(s,t.id),true);assert.equal(s.list.length,0);
});
test('empty or overlong text is rejected or bounded',()=>{
 const s=createTasks({});assert.equal(addTask(s,'   '),null);assert.equal(addTask(s,'x'.repeat(500)).text.length,120);
});
test('dailies come back each day and finished tasks are cleared',()=>{
 const s=createTasks({},day(1));const d=addTask(s,'Boire de l’eau',null,'daily',day(1)),t=addTask(s,'Ponctuel',null,'task',day(1));
 toggleTask(s,d.id);toggleTask(s,t.id);
 assert.equal(dailyReset(s,day(1,23)),0);assert.equal(d.done,true);
 assert.equal(dailyReset(s,day(2)),0);assert.equal(d.done,false);assert.equal(s.list.length,1);
});
test('missed dailies are counted once per day, never on first launch',()=>{
 const s=createTasks({},day(1));addTask(s,'Lire',null,'daily',day(1));addTask(s,'Marcher',null,'daily',day(1));
 assert.equal(dailyReset(s,day(2)),2);assert.equal(dailyReset(s,day(2,20)),0);
 const fresh=createTasks({list:[{id:'a',text:'Lire',type:'daily',done:false}]},day(3));assert.equal(fresh.lastReset,day(3,0));
});
test('corrupt saved data is sanitised',()=>{
 const s=createTasks({list:[{id:'a',text:'ok',category:'zzz',type:'weird'},{text:'no id'},null,{id:'b',text:''}]});
 assert.deepEqual(s.list.map(t=>[t.id,t.category,t.type]),[['a',null,'task']]);
});
