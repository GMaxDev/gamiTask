// Task state fed by the server. Validation helpers run before an emit; everything else applies what the server said.
import type {Task,TaskKind,Difficulty,ChecklistItem} from '@shared/types';
import {isDue} from '../../server/src/scoring.ts';// relative on purpose: `node --test` has no `@shared` alias at runtime, Vite and tsc both accept it
export const CATEGORIES=[
  {id:'work',label:'Boulot',color:'#b85530'},
  {id:'perso',label:'Perso',color:'#7a8e4a'},
  {id:'urgent',label:'Urgent',color:'#a04050'},
  {id:'study',label:'Étude',color:'#8aa6b8'},
];
export const DIFFICULTIES:{id:Difficulty;label:string;pips:number}[]=[{id:'trivial',label:'Banal',pips:1},{id:'easy',label:'Facile',pips:2},{id:'medium',label:'Moyen',pips:3},{id:'hard',label:'Difficile',pips:4}];
export const KIND_LABELS:Record<TaskKind,{one:string;many:string;placeholder:string;help:string}>={habit:{one:'habitude',many:'Habitudes',placeholder:'Une habitude à tenir…',help:'Se coche autant de fois qu’on veut dans la journée : + quand tu la tiens, − quand tu craques. Un − coûte de l’énergie.'},daily:{one:'quotidienne',many:'Quotidiennes',placeholder:'Une chose à faire chaque jour…',help:'Revient les jours choisis. Oubliée à minuit, elle coûte de l’énergie ; tenue, elle fait une série.'},todo:{one:'à-faire',many:'À faire',placeholder:'Une chose à faire…',help:'À faire une seule fois. Ajoute des étapes : chaque étape cochée augmente la récompense.'}};
export const DIFFICULTY_HINT='La difficulté multiplie les gains… et les pertes.';
export const TINT_LABELS=['Bien tenue','Tenue','','Négligée','Très négligée'];
export const DAY_LABELS=['L','M','M','J','V','S','D'];
const MAX_TEXT=120;
export interface TasksState{list:Task[];tab:TaskKind;filter:'remaining'|'all'}
export function createTasks():TasksState{return {list:[],tab:'todo',filter:'remaining'};}
export const cleanText=(raw:unknown):string=>String(raw??'').replace(/\s+/g,' ').trim().slice(0,MAX_TEXT);
export const categoryId=(id:unknown):string|null=>CATEGORIES.some(c=>c.id===id)?id as string:null;
export function setTasks(s:TasksState,tasks:Task[]):void{s.list=[...tasks].sort((a,b)=>b.createdAt-a.createdAt);}
export function taskAdded(s:TasksState,task:Task):void{if(!s.list.some(t=>t.id===task.id))s.list.unshift(task);}
function replace(s:TasksState,task:Task):Task|null{const i=s.list.findIndex(t=>t.id===task.id);if(i<0)return null;s.list[i]=task;return task;}
export const taskScored=(s:TasksState,task:Task):Task|null=>replace(s,task);
export const taskUpdated=(s:TasksState,task:Task):Task|null=>replace(s,task);
export function taskDeleted(s:TasksState,id:string):boolean{const i=s.list.findIndex(t=>t.id===id);if(i<0)return false;s.list.splice(i,1);return true;}
// What the other players see on the slates: open todos, unticked dailies, every habit.
export const pending=(s:TasksState):Task[]=>s.list.filter(t=>t.kind==='habit'||!t.done);
// The current tab, filtered; dailies due today come first so the morning list reads top-down.
export function visible(s:TasksState,today:Date):Task[]{
  const list=s.list.filter(t=>t.kind===s.tab&&(s.filter==='all'||t.kind==='habit'||!t.done));
  if(s.tab==='daily')list.sort((a,b)=>Number(isDue(b,today))-Number(isDue(a,today))||b.createdAt-a.createdAt);
  return list;
}
export const remaining=(s:TasksState,today:Date):number=>s.list.filter(t=>!t.done&&(t.kind==='todo'||(t.kind==='daily'&&isDue(t,today)))).length;
export function toggleDay(mask:number,index:number):number{const next=mask^(1<<index);return next===0?mask:next;}
export const cleanChecklistItem=(raw:unknown):string=>String(raw??'').replace(/\s+/g,' ').trim().slice(0,80);
export interface NewTaskOpts{difficulty:Difficulty;category:string|null;up?:boolean;down?:boolean;days?:number;dueAt?:number|null;checklist?:ChecklistItem[]}
export function newTaskPayload(kind:TaskKind,text:string,o:NewTaskOpts){
  const base={text,kind,difficulty:o.difficulty,category:o.category};
  if(kind==='habit')return {...base,up:o.up!==false,down:!!o.down};
  if(kind==='daily')return {...base,days:o.days??127};
  return {...base,dueAt:o.dueAt??null,checklist:o.checklist??[]};
}
