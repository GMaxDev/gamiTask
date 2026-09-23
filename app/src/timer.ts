export type TimerMode='focus'|'short'|'long';
export interface TimerState { mode: TimerMode; durations: Record<TimerMode, number>; remaining: number; endAt: number | null; perCycle: number; autoChain: boolean }
export const defaults: Record<TimerMode, number> = {focus:25,short:5,long:15};
export const PER_CYCLE=4;// combien de focus avant la longue pause : 4 focus, 3 petites pauses, 1 longue
export function createTimer(saved: Partial<TimerState> & {durations?: Record<string, unknown>} = {}, now = Date.now()): TimerState {
  const durations = {...defaults};
  for(const k of Object.keys(defaults) as TimerMode[]) if(Number.isFinite(saved.durations?.[k])) durations[k]=Math.min(90,Math.max(1,Math.round(saved.durations![k] as number)));
  const mode: TimerMode = Object.hasOwn(defaults,saved.mode as string)?saved.mode as TimerMode:'focus';
  const perCycle=Number.isFinite(saved.perCycle)?Math.min(12,Math.max(2,Math.round(saved.perCycle as number))):PER_CYCLE;
  return {mode,durations,perCycle,autoChain:saved.autoChain!==false,remaining:Math.max(0,Math.min(durations[mode]*60,Number.isFinite(saved.remaining)?saved.remaining as number:durations[mode]*60)),endAt:Number.isFinite(saved.endAt)&&(saved.endAt as number)>0?saved.endAt as number:null};
}
export function remainingSeconds(state: TimerState, now=Date.now()): number { return state.endAt===null?state.remaining:Math.max(0,Math.ceil((state.endAt-now)/1000)); }
export function toggleTimer(state: TimerState, now=Date.now()): void {
  if(state.endAt!==null){state.remaining=remainingSeconds(state,now);state.endAt=null;}
  else {if(state.remaining<=0)state.remaining=state.durations[state.mode]*60;state.endAt=now+state.remaining*1000;}
}
export function resetTimer(state: TimerState, mode: TimerMode=state.mode): void {state.mode=mode;state.endAt=null;state.remaining=state.durations[mode]*60;}
// La phase suivante du cycle, démarrée d'elle-même quand l'enchaînement est actif.
// `focusDone` est le nombre de focus achevés : la longue pause tombe tous les `perCycle`.
// La longue pause enchaîne sur le cycle suivant : ça tourne tant qu'on ne met pas en pause.
export function advance(state: TimerState, focusDone: number, now=Date.now()): {from: TimerMode; to: TimerMode; started: boolean}{
  const from=state.mode;
  const to: TimerMode=from==='focus'?(focusDone%state.perCycle===0?'long':'short'):'focus';
  resetTimer(state,to);
  const started=state.autoChain;
  if(started)toggleTimer(state,now);
  return {from,to,started};
}
