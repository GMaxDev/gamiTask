// Le pomodoro tel qu'on le voit : le minuteur solo, la session de la salle, les réglages du rythme, et le personnage
// qui s'assoit ou se lève avec les phases. Le balisage vit dans le HUD de main.ts ; ce module possède le comportement.
import {$,icon,drawIcons,load,save,today,toast} from './ui.ts';
import {createTimer,remainingSeconds,toggleTimer,resetTimer,advance} from './timer.ts';
import type {TimerMode} from './timer.ts';
import {createRoomPomo,applyState,applyTick,remainingAt,subtitle,format,phaseNotice} from './pomo.ts';
import {DURATIONS} from '@shared/types';
import type {Phase} from './pomo.ts';
import type {Ambience} from './ambience.ts';

export interface PomodoroDeps{
  cafe(): any;// la scène courante, ou null avant le premier montage
  socket(): any;// la socket du café, ou undefined tant qu'on n'est pas connecté
  ambience: Ambience;// carillons, notifications, contexte audio
  onComplete(): void;// un focus vient de finir : le serveur compte la récompense
  canMove(): boolean;// faux tant qu'une fenêtre est ouverte : le personnage patiente
  onRoomFocusDone(others: string[]): void;// un focus de la salle vient de finir, avec ces autres participants : le serveur paie, le chat et le journal notent
  myName(): string;// pour ne pas se compter parmi « les autres »
}
export type Pomodoro=ReturnType<typeof createPomodoro>;

export function createPomodoro(deps: PomodoroDeps){
  let timer=createTimer(load('gamitask.timer',{})),stats=load('gamitask.stats',{});

  if(stats.date!==today())stats={date:today(),sessions:0,minutes:0};
  stats.sessions=Number.isFinite(stats.sessions)?Math.max(0,stats.sessions):0;stats.minutes=Number.isFinite(stats.minutes)?Math.max(0,stats.minutes):0;

  // Un focus qui commence envoie le personnage s'asseoir, une pause le fait se relever — solo comme en salle.
  // Une fenêtre ouverte a priorité sur le déplacement : la demande attend sa fermeture, la dernière l'emporte.
  let pendingMove: null|'seat'|'stand'=null;
  function seatForFocus(){if(!timer.seatOnFocus)return;if(deps.canMove())deps.cafe()?.takeSeat?.();else pendingMove='seat';}
  function standForBreak(){if(!timer.seatOnFocus)return;if(deps.canMove())deps.cafe()?.leaveSeat?.();else pendingMove='stand';}
  function resumeMove(){if(!pendingMove||!deps.canMove())return;const m=pendingMove;pendingMove=null;if(m==='seat')deps.cafe()?.takeSeat?.();else deps.cafe()?.leaveSeat?.();}
  // The server clocks every focus from its start: a completion it did not see begin earns nothing. Resuming after a pause is not a new start.
  const announceFocus=()=>deps.socket()?.emit('pomodoro:start',{minutes:timer.durations.focus});
  const MODE_LABEL: Record<TimerMode,string>={focus:'Focus',short:'Petite pause',long:'Longue pause'};
  function persistTimer(){save('gamitask.timer',timer);}
  let lastRunning: boolean|null=null,lastMode: string|null=null,lastShown: string|null=null;
  const avatarState=():'idle'|'focus'|'pause'|'collective'=>roomPomo.joined?'collective':timer.endAt!==null?(timer.mode==='focus'?'focus':'pause'):'idle';
  function renderTimer(){
    const remaining=remainingSeconds(timer),running=timer.endAt!==null;
    if(running&&remaining===0){
      if(stats.date!==today())stats={date:today(),sessions:0,minutes:0};
      if(timer.mode==='focus'){stats.sessions++;stats.minutes+=timer.durations.focus;save('gamitask.stats',stats);deps.onComplete();}
      const {from,to,started}=advance(timer,stats.sessions);
      persistTimer();deps.ambience.chime('end');
      const next=`${MODE_LABEL[to]} de ${timer.durations[to]} min`;
      toast(from==='focus'
        ? started?`Focus terminé. ${next}, ça démarre.`:`Focus terminé. ${next} quand tu veux.`
        : started?`${from==='long'?'Cycle bouclé, on repart pour un tour.':'Pause terminée.'} ${next}, c’est parti.`:`Pause terminée. ${next} quand tu veux.`);
      deps.ambience.notify(from==='focus'?'Focus terminé':'Pause terminée',started?`${next} en cours.`:'À toi de relancer.');
      if(started){if(to==='focus'){announceFocus();seatForFocus();}else standForBreak();}
      return renderTimer();
    }
    const text=format(remaining);
    if(text!==lastShown){$('#timer-value').textContent=text;lastShown=text;}
    const title=running?`${text} · ${timer.mode==='focus'?'Focus':'Pause'} — gamitask`:'gamitask — Le café des petites victoires';
    // while we sit in the room's session it owns the wall clock and the tab title: one source per tick, never both
    if(!roomPomo.joined&&document.title!==title)document.title=title;
    $('#dial-progress').style.strokeDashoffset=609.47*(1-remaining/(timer.durations[timer.mode]*60));if(!roomPomo.joined)deps.cafe()?.setClock(1-remaining/(timer.durations[timer.mode]*60),running);
    if(lastRunning!==running||lastMode!==timer.mode){
      $('#start').innerHTML=icon(running?'pause':'play')+`<span>${running?'Faire une pause':remaining<timer.durations[timer.mode]*60?'Reprendre':timer.mode==='focus'?'C’est parti':'Prendre une pause'}</span>`;
      $('#timer-kicker').textContent=running?(timer.mode==='focus'?'UN PETIT PAS À LA FOIS':'PRENDS UNE RESPIRATION'):'ON Y VA DOUCEMENT';
      $('#session-label').textContent=timer.mode==='focus'?'Session de concentration':timer.mode==='short'?'Une petite respiration':'Une pause bien méritée';
      document.querySelectorAll('[data-mode]').forEach((b: any)=>{b.classList.toggle('selected',b.dataset.mode===timer.mode);b.setAttribute('aria-pressed',String(b.dataset.mode===timer.mode));});
      $('.timer-card').classList.toggle('running',running);drawIcons();lastRunning=running;lastMode=timer.mode;
      deps.socket()?.emit('avatar-state',{state:avatarState()});
    }
    $('#sessions').textContent=stats.sessions;$('#minutes').textContent=stats.minutes;
    const dots=$('.session-dots'),per=timer.perCycle;
    if(dots.querySelectorAll('span').length!==per)dots.innerHTML='<span></span>'.repeat(per)+'<small id="cycle-label"></small>';
    const cycle=stats.sessions%per||(stats.sessions?per-1:0);// a completed cycle keeps every dot lit instead of dropping back to one
    dots.querySelectorAll('span').forEach((s: any,i: number)=>s.classList.toggle('filled',i<=cycle));
    $('#cycle-label').textContent=stats.sessions?`${stats.sessions} petite${stats.sessions>1?'s':''} victoire${stats.sessions>1?'s':''}`:'Un pas après l’autre';
  }
  $('#start').onclick=()=>{deps.ambience.ensureAudio();deps.ambience.askNotify();
    const fresh=timer.endAt===null&&timer.remaining>=timer.durations[timer.mode]*60;// starting from the top, not resuming
    toggleTimer(timer);persistTimer();
    if(timer.endAt!==null){if(fresh&&timer.mode==='focus')announceFocus();deps.ambience.chime('start');deps.ambience.notify(timer.mode==='focus'?'Focus — c’est parti':'Pause — souffle un peu',`${timer.durations[timer.mode]} minutes.`);
      if(timer.mode==='focus')seatForFocus();else standForBreak();}
    renderTimer();};
  $('#reset').onclick=()=>{resetTimer(timer);persistTimer();lastRunning=null;renderTimer();};
  document.querySelectorAll('[data-mode]').forEach((b: any)=>b.onclick=()=>{resetTimer(timer,b.dataset.mode);persistTimer();lastRunning=null;renderTimer();});
  function cyclePreview(f: any){const per=Math.min(12,Math.max(2,Number(f.perCycle.value)||4));
    $('#cycle-preview').textContent=f.autoChain.checked
      ?`Un cycle : ${per} focus de ${f.focus.value} min, ${per-1} pauses de ${f.short.value} min, puis ${f.long.value} min. Tout s’enchaîne et repart en boucle jusqu’à ta pause.`
      :`Un cycle : ${per} focus, puis la longue pause. Chaque phase attend ton clic.`;}
  $('#settings').onclick=()=>{const f=$('#settings-form').elements;
    for(const [key,value] of Object.entries(timer.durations))f[key].value=value;
    f.perCycle.value=timer.perCycle;f.autoChain.checked=timer.autoChain;f.seatOnFocus.checked=timer.seatOnFocus;
    cyclePreview(f);$('#settings-dialog').showModal();};
  $('#settings-form').oninput=()=>cyclePreview($('#settings-form').elements);
  $('#settings-form').onsubmit=(e: any)=>{e.preventDefault();const f=$('#settings-form').elements;
    const durations={...timer.durations};for(const key of Object.keys(durations) as TimerMode[])durations[key]=Number(f[key].value);
    // createTimer borne tout : c'est lui qui valide, pas le formulaire
    timer=createTimer({durations,mode:timer.mode,perCycle:Number(f.perCycle.value),autoChain:f.autoChain.checked,seatOnFocus:f.seatOnFocus.checked});
    resetTimer(timer);persistTimer();lastRunning=null;renderTimer();$('#settings-dialog').close();toast('Ton nouveau rythme est prêt.');};

  // Pomodoro de la salle : le serveur tient l'horloge, on l'affiche et on extrapole entre deux ticks.
  let roomPomo=createRoomPomo(),timerTab: 'solo'|'room'=load('gamitask.timerTab','solo')==='room'?'room':'solo';
  let lastRoomShown: string|null=null,lastRoomJoined: boolean|null=null;
  function selectTab(tab: 'solo'|'room'){
    timerTab=tab;save('gamitask.timerTab',tab);
    $('#tab-solo').setAttribute('aria-selected',String(tab==='solo'));$('#tab-room').setAttribute('aria-selected',String(tab==='room'));
    $('#pane-solo').hidden=tab!=='solo';$('#pane-room').hidden=tab!=='room';
  }
  function renderRoomPomo(){
    const remaining=remainingAt(roomPomo,Date.now()),text=format(remaining),fraction=1-remaining/DURATIONS[roomPomo.phase];
    if(text!==lastRoomShown){$('#room-value').textContent=text;lastRoomShown=text;}
    $('#room-dial-progress').style.strokeDashoffset=609.47*fraction;
    document.querySelectorAll('[data-phase]').forEach((s: any)=>s.classList.toggle('selected',s.dataset.phase===roomPomo.phase));
    $('#room-subtitle').textContent=subtitle(roomPomo,roomPomo.names.filter(n=>n!==deps.myName()));
    $('#room-kicker').textContent=`25 / 5 / 15 · SESSION ${roomPomo.session+1}`;
    $('#room-dot').hidden=!roomPomo.running;
    $('#room-count').hidden=roomPomo.participants===0;$('#room-count').textContent=String(roomPomo.participants);
    if(lastRoomJoined!==roomPomo.joined){
      $('#room-join').classList.toggle('leaving',roomPomo.joined);
      $('#room-join').innerHTML=icon('users')+`<span>${roomPomo.joined?'Quitter':'Rejoindre'}</span>`;
      $('#room-join').setAttribute('aria-label',roomPomo.joined?'Quitter la session':'Rejoindre la session');
      drawIcons();lastRoomJoined=roomPomo.joined;
    }
    if(roomPomo.joined){
      deps.cafe()?.setClock(fraction,roomPomo.running);
      const title=`${text} · Avec la salle — gamitask`;if(document.title!==title)document.title=title;
    }
  }
  $('#tab-solo').onclick=()=>selectTab('solo');$('#tab-room').onclick=()=>selectTab('room');selectTab(timerTab);
  $('#room-join').onclick=()=>{
    const sock=deps.socket();if(!sock)return;// sans serveur il n'y a pas de session de salle : ne rien promettre à l'écran
    if(!roomPomo.joined){
      sock.emit('pomo:join');roomPomo.joined=true;deps.ambience.ensureAudio();deps.ambience.askNotify();deps.ambience.chime('start');
      if(roomPomo.phase==='focus')seatForFocus();
      if(timer.endAt!==null){toggleTimer(timer);persistTimer();lastRunning=null;renderTimer();}// une seule session à la fois : le solo se met en pause
    } else {sock.emit('pomo:leave');roomPomo.joined=false;}
    sock.emit('avatar-state',{state:avatarState()});renderRoomPomo();
  };
  setInterval(()=>{renderTimer();renderRoomPomo();},250);document.addEventListener('visibilitychange',renderTimer);renderTimer();renderRoomPomo();

  function onRoomPhase({phase,remaining,session,names}: {phase: Phase; remaining: number; session: number; names?: string[]}){const was=roomPomo.phase;
    applyState(roomPomo,{phase,remaining,session,running:roomPomo.participants>0,participants:roomPomo.participants,names},Date.now());
    if(roomPomo.joined){
      if(was==='focus'){toast('Focus terminé avec la salle. Les pièces arrivent.');deps.onRoomFocusDone(roomPomo.names.filter(n=>n!==deps.myName()));}
      deps.ambience.chime(phase==='focus'?'start':'end');const n=phaseNotice(phase);deps.ambience.notify(n.title,n.body);
      if(phase==='focus')seatForFocus();else standForBreak();
    }
    renderRoomPomo();}

  // Ce que main.ts relaie du serveur et de la connexion.
  function onRoomState(st: {phase: Phase; remaining: number; running: boolean; participants: number; session: number; names?: string[]}){applyState(roomPomo,st,Date.now());renderRoomPomo();}
  function onRoomTick(t: {remaining: number; phase: Phase; session: number}){applyTick(roomPomo,t,Date.now());renderRoomPomo();}
  function resetRoom(){roomPomo=createRoomPomo();renderRoomPomo();}
  function leaveRoom(){roomPomo.joined=false;renderRoomPomo();}
  function adoptDurations(d: Partial<Record<TimerMode,number>>){Object.assign(timer.durations,d);resetTimer(timer);persistTimer();}

  return {avatarState,onRoomState,onRoomTick,onRoomPhase,resetRoom,leaveRoom,adoptDurations,resumeMove};
}
