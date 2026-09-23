// The room pomodoro, as the client sees it: a snapshot the server sends, plus the drift between two ticks.
// Pure on purpose — main.ts owns the DOM, this file owns the arithmetic and the wording.
import type {PomodoroPhase} from '@shared/types';

export type Phase=PomodoroPhase;
export interface RoomPomo{phase: Phase; remaining: number; running: boolean; participants: number; session: number; joined: boolean; syncedAt: number}

export const DURATION: Record<Phase,number>={focus:25*60,'short-break':5*60,'long-break':15*60};
const LABELS: Record<Phase,string>={focus:'Focus','short-break':'Pause','long-break':'Longue'};
export const phaseLabel=(phase: Phase): string=>LABELS[phase];

export function createRoomPomo(): RoomPomo{
  return {phase:'focus',remaining:DURATION['focus'],running:false,participants:0,session:0,joined:false,syncedAt:Date.now()};
}

export function applyState(p: RoomPomo,s: {phase: Phase; remaining: number; running: boolean; participants: number; session: number},now: number): void{
  p.phase=s.phase;p.remaining=s.remaining;p.running=s.running;p.participants=s.participants;p.session=s.session;p.syncedAt=now;
}

export function applyTick(p: RoomPomo,t: {remaining: number; phase: Phase; session: number},now: number): void{
  p.phase=t.phase;p.remaining=t.remaining;p.session=t.session;p.running=true;p.syncedAt=now;
}

export function remainingAt(p: RoomPomo,now: number): number{
  if(!p.running)return p.remaining;
  return Math.max(0,Math.floor(p.remaining-(now-p.syncedAt)/1000));
}

export function subtitle(p: RoomPomo,names: string[]): string{
  const others=Math.max(0,p.participants-(p.joined?1:0));
  if(!p.joined)return p.participants===0?'Personne pour l’instant. Lance la session ?'
    :`${p.participants} personne${p.participants>1?'s':''} se concentre${p.participants>1?'nt':''}`;
  if(others===0)return 'Tu es seul·e pour l’instant';
  // no names yet (the server only sends a count): fall back to the numeric form
  if(names.length===0)return `Avec ${others} autre${others>1?'s':''} personne${others>1?'s':''}`;
  // le compte fait foi : `names` peut être plus court que le nombre de participants annoncé
  const shown=names.slice(0,2);
  if(others<=shown.length)return `Avec ${shown.join(' et ')}`;
  const rest=others-shown.length;
  return `Avec ${shown.join(', ')} et ${rest} autre${rest>1?'s':''}`;
}

export function format(seconds: number): string{
  const s=Math.max(0,Math.floor(seconds));
  return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}

// Wording for the sound/notification pair fired on each phase change; durations stay tied to DURATION.
export function phaseNotice(phase: Phase): {title: string; body: string}{
  return {title:phase==='focus'?'Focus — c’est parti':`${phaseLabel(phase)} — souffle un peu`,body:`${DURATION[phase]/60} minutes avec la salle.`};
}
