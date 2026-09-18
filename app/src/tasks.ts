// Task state fed by the server. Validation helpers run before an emit; everything else applies what the server said.
import type {Task} from '@shared/types';
export const CATEGORIES=[
  {id:'work',label:'Boulot',color:'#b85530'},
  {id:'perso',label:'Perso',color:'#7a8e4a'},
  {id:'urgent',label:'Urgent',color:'#a04050'},
  {id:'study',label:'Étude',color:'#8aa6b8'},
];
const MAX_TEXT=120;
export interface TasksState{list:Task[]}
export function createTasks():TasksState{return {list:[]};}
export const cleanText=(raw:unknown):string=>String(raw??'').replace(/\s+/g,' ').trim().slice(0,MAX_TEXT);
export const categoryId=(id:unknown):string|null=>CATEGORIES.some(c=>c.id===id)?id as string:null;
export function setTasks(s:TasksState,tasks:Task[]):void{s.list=[...tasks].sort((a,b)=>b.createdAt-a.createdAt);}
export function taskAdded(s:TasksState,task:Task):void{if(!s.list.some(t=>t.id===task.id))s.list.unshift(task);}
export function taskToggled(s:TasksState,id:string,done:boolean):Task|null{const t=s.list.find(t=>t.id===id);if(!t)return null;t.done=done;return t;}
export function taskUpdated(s:TasksState,id:string,text:string,category:string|null):Task|null{const t=s.list.find(t=>t.id===id);if(!t)return null;t.text=text;t.category=category;return t;}
export function taskDeleted(s:TasksState,id:string):boolean{const i=s.list.findIndex(t=>t.id===id);if(i<0)return false;s.list.splice(i,1);return true;}
export const pending=(s:TasksState):Task[]=>s.list.filter(t=>!t.done);
