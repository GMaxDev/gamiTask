export type TimerMode='focus'|'short'|'long';
export interface TimerState { mode: TimerMode; durations: Record<TimerMode, number>; remaining: number; endAt: number | null }
export const defaults: Record<TimerMode, number> = {focus:25,short:5,long:15};
export function createTimer(saved: Partial<TimerState> & {durations?: Record<string, unknown>} = {}, now = Date.now()): TimerState {
  const durations = {...defaults};
  for(const k of Object.keys(defaults) as TimerMode[]) if(Number.isFinite(saved.durations?.[k])) durations[k]=Math.min(90,Math.max(1,Math.round(saved.durations![k] as number)));
  const mode: TimerMode = Object.hasOwn(defaults,saved.mode as string)?saved.mode as TimerMode:'focus';
  return {mode,durations,remaining:Math.max(0,Math.min(durations[mode]*60,Number.isFinite(saved.remaining)?saved.remaining as number:durations[mode]*60)),endAt:Number.isFinite(saved.endAt)&&(saved.endAt as number)>0?saved.endAt as number:null};
}
export function remainingSeconds(state: TimerState, now=Date.now()): number { return state.endAt===null?state.remaining:Math.max(0,Math.ceil((state.endAt-now)/1000)); }
export function toggleTimer(state: TimerState, now=Date.now()): void {
  if(state.endAt!==null){state.remaining=remainingSeconds(state,now);state.endAt=null;}
  else {if(state.remaining<=0)state.remaining=state.durations[state.mode]*60;state.endAt=now+state.remaining*1000;}
}
export function resetTimer(state: TimerState, mode: TimerMode=state.mode): void {state.mode=mode;state.endAt=null;state.remaining=state.durations[mode]*60;}
