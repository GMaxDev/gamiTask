export const defaults = {focus:25,short:5,long:15};
export function createTimer(saved = {}, now = Date.now()) {
  const durations = {...defaults};
  for(const k of Object.keys(defaults)) if(Number.isFinite(saved.durations?.[k])) durations[k]=Math.min(90,Math.max(1,Math.round(saved.durations[k])));
  const mode = Object.hasOwn(defaults,saved.mode)?saved.mode:'focus';
  return {mode,durations,remaining:Math.max(0,Math.min(durations[mode]*60,Number.isFinite(saved.remaining)?saved.remaining:durations[mode]*60)),endAt:Number.isFinite(saved.endAt)&&saved.endAt>0?saved.endAt:null};
}
export function remainingSeconds(state, now=Date.now()) { return state.endAt===null?state.remaining:Math.max(0,Math.ceil((state.endAt-now)/1000)); }
export function toggleTimer(state,now=Date.now()) {
  if(state.endAt!==null){state.remaining=remainingSeconds(state,now);state.endAt=null;}
  else {if(state.remaining<=0)state.remaining=state.durations[state.mode]*60;state.endAt=now+state.remaining*1000;}
}
export function resetTimer(state,mode=state.mode){state.mode=mode;state.endAt=null;state.remaining=state.durations[mode]*60;}
