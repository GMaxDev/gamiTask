// Le journal du jour : ce que le café t'a donné depuis ce matin, gardé dans le navigateur avec sa date.
// Pur — main.ts décide quoi y écrire, « Ma progression » l'affiche. Le lendemain, il repart vide.
export type JournalKind='task'|'pomo'|'achievement'|'level'|'streak'|'exhausted'|'rollover';
export interface Entry{at: number; kind: JournalKind; text: string; coins?: number; xp?: number}
export interface Journal{date: string; entries: Entry[]}
export const MAX_ENTRIES=200;// ponytail: au-delà on oublie le plus ancien ; personne ne relit 200 lignes

const KINDS=new Set<JournalKind>(['task','pomo','achievement','level','streak','exhausted','rollover']);
const validEntry=(e: any): e is Entry=>!!e&&Number.isFinite(e.at)&&KINDS.has(e.kind)&&typeof e.text==='string'
  &&(e.coins===undefined||Number.isFinite(e.coins))&&(e.xp===undefined||Number.isFinite(e.xp));

export function createJournal(saved: any,today: string): Journal{
  if(!saved||saved.date!==today||!Array.isArray(saved.entries))return {date:today,entries:[]};
  return {date:today,entries:saved.entries.filter(validEntry).slice(-MAX_ENTRIES)};
}

// Écrit une ligne ; si la date a tourné entre-temps, la journée repart de zéro avant.
export function record(j: Journal,e: Omit<Entry,'at'>,today: string,now=Date.now()): Journal{
  if(j.date!==today){j.date=today;j.entries=[];}
  j.entries.push({at:now,...e});
  if(j.entries.length>MAX_ENTRIES)j.entries.splice(0,j.entries.length-MAX_ENTRIES);
  return j;
}

export function summary(j: Journal): {coins: number; xp: number; tasks: number; pomos: number; achievements: number}{
  const s={coins:0,xp:0,tasks:0,pomos:0,achievements:0};
  for(const e of j.entries){
    s.coins+=e.coins??0;s.xp+=e.xp??0;
    if(e.kind==='task')s.tasks++;else if(e.kind==='pomo')s.pomos++;else if(e.kind==='achievement')s.achievements++;
  }
  return s;
}

// « +40 pièces · +120 XP · 3 tâches · 2 focus · 1 succès » — seulement ce qui est arrivé.
export function summaryLine(j: Journal): string{
  const s=summary(j),parts: string[]=[];
  if(s.coins>0)parts.push(`+${s.coins} pièce${s.coins>1?'s':''}`);
  if(s.xp>0)parts.push(`+${s.xp} XP`);
  if(s.tasks)parts.push(`${s.tasks} tâche${s.tasks>1?'s':''}`);
  if(s.pomos)parts.push(`${s.pomos} focus`);
  if(s.achievements)parts.push(`${s.achievements} succès`);
  return parts.join(' · ');
}

export const timeLabel=(at: number): string=>new Date(at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
