// Pure progression model: coins, XP, streak and achievements. No DOM, no storage.
export interface ProgressState { coins: number; xp: number; tasksDone: number; pomos: number; streak: number; lastPomoAt: number; achievements: string[] }
export interface Achievement { key: string; label: string; desc: string; icon: string; test: (p: ProgressState) => boolean }
export interface Bonus { coinsTask?: number; coinsPomo?: number; xpPomo?: number }
export const REWARDS={task:10,pomoCoins:20,pomoXp:50};
export const STREAK_WINDOW_MS=2*60*60*1000;// two pomodoros closer than this keep the streak alive
export const ACHIEVEMENTS: Achievement[]=[
  {key:'first-task',label:'1ère tâche !',desc:'Première tâche complétée',icon:'✅',test:p=>p.tasksDone>=1},
  {key:'task-10',label:'10 tâches !',desc:'10 tâches complétées',icon:'🔟',test:p=>p.tasksDone>=10},
  {key:'task-50',label:'50 tâches !',desc:'50 tâches complétées',icon:'🏆',test:p=>p.tasksDone>=50},
  {key:'first-pomo',label:'1er Pomodoro !',desc:'Premier pomodoro terminé',icon:'🍅',test:p=>p.pomos>=1},
  {key:'streak-5',label:'Streak ×5 !',desc:'5 pomodoros consécutifs',icon:'🔥',test:p=>p.streak>=5},
  {key:'coins-100',label:'100 pièces !',desc:'100 pièces accumulées',icon:'💰',test:p=>p.coins>=100},
  {key:'coins-500',label:'500 pièces !',desc:'500 pièces accumulées',icon:'👑',test:p=>p.coins>=500},
];
export const levelOf=(xp: number): number=>Math.floor(Math.sqrt(Math.max(0,xp)/50));
export const xpForLevel=(level: number): number=>level*level*50;
const num=(v: unknown, fallback=0): number=>Number.isFinite(v)&&(v as number)>=0?Math.floor(v as number):fallback;

export function createProgress(saved: Partial<ProgressState> = {}): ProgressState {
  const keys=new Set(ACHIEVEMENTS.map(a=>a.key));
  return {coins:num(saved.coins),xp:num(saved.xp),tasksDone:num(saved.tasksDone),pomos:num(saved.pomos),streak:num(saved.streak),lastPomoAt:num(saved.lastPomoAt),
    achievements:(Array.isArray(saved.achievements)?saved.achievements:[]).filter(k=>keys.has(k))};
}
function unlockAll(p: ProgressState): Achievement[]{
  const unlocked: Achievement[]=[];
  for(const a of ACHIEVEMENTS)if(!p.achievements.includes(a.key)&&a.test(p)){p.achievements.push(a.key);unlocked.push(a);}
  return unlocked;
}
export function completeTask(p: ProgressState, bonus: Bonus = {}){
  const coins=REWARDS.task+(bonus.coinsTask??0);p.tasksDone++;p.coins+=coins;
  return {coins,unlocked:unlockAll(p)};
}
export function completePomodoro(p: ProgressState, now=Date.now(), bonus: Bonus = {}){
  const before=levelOf(p.xp);
  p.streak=now-p.lastPomoAt<STREAK_WINDOW_MS?p.streak+1:1;p.lastPomoAt=now;p.pomos++;
  const streakBonus=Math.min(p.streak*5,50),coins=REWARDS.pomoCoins+streakBonus+(bonus.coinsPomo??0),xp=REWARDS.pomoXp+(bonus.xpPomo??0);
  p.coins+=coins;p.xp+=xp;
  const level=levelOf(p.xp);
  return {coins,bonus:streakBonus,xp,streak:p.streak,level,levelUp:level>before,unlocked:unlockAll(p)};
}
export function levelInfo(p: ProgressState){const level=levelOf(p.xp),floor=xpForLevel(level),next=xpForLevel(level+1);return {level,into:p.xp-floor,span:next-floor,next};}
