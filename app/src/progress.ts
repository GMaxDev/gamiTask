// Progression state fed by the server: coins, XP, streak and achievements. Labels live here, rules live server-side.
export interface Progress{coins:number;xp:number;level:number;xpToNext:number;streak:number;achievements:string[]}
export const ACHIEVEMENTS=[
  {key:'first-task',label:'1ère tâche !',desc:'Première tâche complétée',icon:'✅'},
  {key:'task-10',label:'10 tâches !',desc:'10 tâches complétées',icon:'🔟'},
  {key:'task-50',label:'50 tâches !',desc:'50 tâches complétées',icon:'🏆'},
  {key:'first-pomo',label:'1er Pomodoro !',desc:'Premier pomodoro terminé',icon:'🍅'},
  {key:'streak-5',label:'Streak ×5 !',desc:'5 pomodoros consécutifs',icon:'🔥'},
  {key:'coins-100',label:'100 pièces !',desc:'100 pièces accumulées',icon:'💰'},
  {key:'coins-500',label:'500 pièces !',desc:'500 pièces accumulées',icon:'👑'},
  {key:'first-collective',label:'Pomo collectif !',desc:'Premier pomodoro partagé',icon:'🤝'},
];
const KEYS=new Set(ACHIEVEMENTS.map(a=>a.key));
export const levelOf=(xp:number):number=>Math.floor(Math.sqrt(Math.max(0,xp)/50));
export const xpForLevel=(level:number):number=>level*level*50;
export function createProgress():Progress{return {coins:0,xp:0,level:0,xpToNext:50,streak:0,achievements:[]};}
export function setCoins(p:Progress,coins:number):void{p.coins=Math.max(0,Math.floor(coins));}
export function setXp(p:Progress,u:{xp:number;level:number;xpToNext:number}):void{p.xp=u.xp;p.level=u.level;p.xpToNext=u.xpToNext;}
export function setStreak(p:Progress,streak:number):void{p.streak=Math.max(0,streak);}
export function unlock(p:Progress,key:string):boolean{if(!KEYS.has(key)||p.achievements.includes(key))return false;p.achievements.push(key);return true;}
export function setAchievements(p:Progress,keys:string[]):void{p.achievements=keys.filter(k=>KEYS.has(k));}
export function levelInfo(p:{xp:number}){const level=levelOf(p.xp),floor=xpForLevel(level),next=xpForLevel(level+1);return {level,into:p.xp-floor,span:next-floor,next};}
