// Pure task model: shared by the UI and the Node test suite. Persistence and rendering live elsewhere.
export interface Category { id: string; label: string; color: string }
export type TaskType = 'task'|'daily';
export interface Task { id: string; text: string; done: boolean; createdAt: number; category: string|null; type: TaskType; rewarded: boolean }
export interface TasksState { list: Task[]; lastReset: number }
export const CATEGORIES: Category[]=[
  {id:'work',label:'Boulot',color:'#b85530'},
  {id:'perso',label:'Perso',color:'#7a8e4a'},
  {id:'urgent',label:'Urgent',color:'#a04050'},
  {id:'study',label:'Étude',color:'#8aa6b8'},
];
const MAX_TEXT=120;
const category=(id: unknown): string|null=>CATEGORIES.some(c=>c.id===id)?id as string:null;
const clean=(text: unknown): string=>String(text??'').replace(/\s+/g,' ').trim().slice(0,MAX_TEXT);

export function createTasks(saved: Partial<TasksState & {list: unknown[]}> = {}, now=Date.now()): TasksState {
  const list: Task[]=(Array.isArray(saved.list)?saved.list:[]).flatMap((t: any)=>{
    const text=clean(t?.text);if(!text||typeof t.id!=='string')return [];
    return [{id:t.id,text,done:Boolean(t.done),createdAt:Number.isFinite(t.createdAt)?t.createdAt:now,category:category(t.category),type:t.type==='daily'?'daily':'task',rewarded:Boolean(t.rewarded)} as Task];
  });
  const state: TasksState={list,lastReset:Number.isFinite(saved.lastReset)?saved.lastReset as number:0};
  dailyReset(state,now);
  return state;
}
export function addTask(state: TasksState, text: string, cat: string|null=null, type: TaskType='task', now=Date.now()): Task|null{
  text=clean(text);if(!text)return null;
  const task: Task={id:now.toString(36)+Math.random().toString(36).slice(2,7),text,done:false,createdAt:now,category:category(cat),type:type==='daily'?'daily':'task',rewarded:false};
  state.list.unshift(task);return task;
}
export function updateTask(state: TasksState, id: string, changes: Partial<{text: string; category: string|null; type: TaskType}> = {}): Task|null{
  const task=state.list.find(t=>t.id===id);if(!task)return null;
  if('text' in changes){const text=clean(changes.text);if(text)task.text=text;}
  if('category' in changes)task.category=category(changes.category);
  if('type' in changes)task.type=changes.type==='daily'?'daily':'task';
  return task;
}
export function toggleTask(state: TasksState, id: string): Task|null{const task=state.list.find(t=>t.id===id);if(task)task.done=!task.done;return task??null;}
export function removeTask(state: TasksState, id: string): boolean{const i=state.list.findIndex(t=>t.id===id);if(i<0)return false;state.list.splice(i,1);return true;}
export const pending=(state: TasksState): Task[]=>state.list.filter(t=>!t.done);

// Once a day: dailies come back, finished one-off tasks are cleared. Returns how many dailies were missed.
export function dailyReset(state: TasksState, now=Date.now()): number{
  const midnight=new Date(now);midnight.setHours(0,0,0,0);const today=midnight.getTime();
  if(state.lastReset>=today)return 0;
  const missed=state.lastReset?state.list.filter(t=>t.type==='daily'&&!t.done).length:0;
  state.list=state.list.filter(t=>t.type==='daily'||!t.done);
  for(const t of state.list)if(t.type==='daily')t.done=false;
  state.lastReset=today;return missed;
}
