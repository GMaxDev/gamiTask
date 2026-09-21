// The landing page: what gamitask is, and a playable corner of it. The café itself lives at /app/.
// The hero is a real room from the app running offline: a pomodoro, notes that become tickets, a character to walk.
import './style.css';
import './landing.css';
import {createIcons,Coffee,ArrowRight,Play,Pause,RotateCcw,Plus,Check,X,StickyNote,Timer} from 'lucide';
import {createTimer,remainingSeconds,toggleTimer,resetTimer,type TimerMode} from './timer.ts';
import {loadLook} from './look.ts';
import {PALETTE} from './identity.ts';
import {cleanText} from './tasks.ts';
import type {Task} from '@shared/types';
import type {SceneState} from './scene.ts';

const icon=(name:string):string=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
const drawIcons=()=>createIcons({icons:{Coffee,ArrowRight,Play,Pause,RotateCcw,Plus,Check,X,StickyNote,Timer},attrs:{'stroke-width':1.65}});
function load(key:string,fallback:any):any{try{return JSON.parse(localStorage.getItem(key) as string)??fallback;}catch{return fallback;}}
function save(key:string,value:any){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
const today=()=>new Date().toLocaleDateString('sv-SE');
const esc=(v:string)=>v.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'} as Record<string,string>)[c]);

const root=document.getElementById('landing') as HTMLElement;
root.innerHTML=`
  <header class="lp-bar">
    <a class="brand chip" href="/" aria-label="gamitask, accueil"><span class="brand-mark">${icon('coffee')}</span><span>gami<span class="brand-light">task</span></span></a>
    <nav class="lp-nav" aria-label="Sections"><a href="#features">Fonctionnalités</a><a href="#streamers">Streamers</a><a href="#pricing">Tarifs</a><a href="#faq">FAQ</a></nav>
    <a class="chip active" href="/app/" data-enter>Entrer au café ${icon('arrow-right')}</a>
  </header>
  <main class="lp">
    <section class="lp-hero">
      <p class="eyebrow">UN CAFÉ 3D POUR TES SESSIONS DE TRAVAIL</p>
      <h1>Le café des <em>petites victoires</em>.</h1>
      <p class="lp-lead">Un pomodoro, des tâches qui deviennent des tickets sur ta table, et un personnage qui s’installe avec toi. Gratuit, sans compte pour commencer.</p>
      <div class="lp-cta"><a class="primary" href="/app/" data-enter>${icon('coffee')}<span>Entrer au café, c’est gratuit</span></a><a class="chip" href="#demo">Essayer ici, tout de suite</a></div>
    </section>
    <section class="lp-demo world" id="demo" aria-label="Essai du café">
      <div class="scene" id="scene"><div class="loading">Le café ouvre ses portes…</div></div>
      <div class="lp-card lp-timer" aria-label="Pomodoro">
        <div class="lp-card-head">${icon('timer')}<span>Pomodoro</span></div>
        <div class="chip-group lp-modes" role="group" aria-label="Type de session"><button class="chip" data-mode="focus">Focus</button><button class="chip" data-mode="short">Pause</button><button class="chip" data-mode="long">Longue</button></div>
        <output id="lp-time" class="lp-time" aria-live="off">25:00</output>
        <div class="lp-timer-actions"><button id="lp-start" class="primary">${icon('play')}<span>C’est parti</span></button><button id="lp-reset" class="chip icon" aria-label="Réinitialiser">${icon('rotate-ccw')}</button></div>
        <p class="lp-timer-note" id="lp-sessions">Aucune session aujourd’hui, encore.</p>
      </div>
      <div class="lp-card lp-notes" aria-label="Notes">
        <div class="lp-card-head">${icon('sticky-note')}<span>Notes</span><span class="pill" id="lp-notes-count">0</span></div>
        <form id="lp-note-form" class="lp-note-form"><input id="lp-note" maxlength="80" placeholder="Une chose à faire…" autocomplete="off"/><button class="chip icon" type="submit" aria-label="Ajouter">${icon('plus')}</button></form>
        <ul id="lp-note-list" class="lp-note-list"></ul>
        <p class="lp-empty" id="lp-notes-empty">Chaque note devient un ticket posé sur ta table.</p>
      </div>
      <p class="lp-demo-hint">Clique au sol pour marcher, sur un siège pour t’asseoir · glisse pour tourner</p>
      <div id="hint" class="hint" role="tooltip" hidden></div>
      <div id="toast" class="toast" role="status"></div>
    </section>
  </main>`;
drawIcons();

// ── Pomodoro: the app's own timer model, kept in this page's storage. ──
let cafe:any=null;// the room, once Three.js has loaded
const timer=createTimer(load('gamitask.landing.timer',{}));
let stats=load('gamitask.landing.stats',{date:today(),sessions:0});
const $=(s:string):any=>root.querySelector(s);
let toastTimeout=0;
function toast(html:string){const t=$('#toast');t.innerHTML=html;t.classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>t.classList.remove('visible'),6000) as unknown as number;}
function chime(){try{const ctx=new AudioContext();for(const [i,f] of [523.25,659.25,783.99].entries()){const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0,ctx.currentTime+i*.16);g.gain.linearRampToValueAtTime(.05,ctx.currentTime+i*.16+.02);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+i*.16+.9);o.connect(g);g.connect(ctx.destination);o.start(ctx.currentTime+i*.16);o.stop(ctx.currentTime+i*.16+1);}}catch{}}
const persist=()=>save('gamitask.landing.timer',timer);
let lastText='',lastRunning:boolean|null=null,lastMode:TimerMode|null=null;
function renderSessions(){const n=stats.date===today()?stats.sessions:0;$('#lp-sessions').textContent=n?`${n} session${n>1?'s':''} aujourd’hui.`:'Aucune session aujourd’hui, encore.';}
function renderTimer(){
  const remaining=remainingSeconds(timer),running=timer.endAt!==null;
  if(running&&remaining===0){
    if(stats.date!==today())stats={date:today(),sessions:0};
    if(timer.mode==='focus'){stats.sessions++;save('gamitask.landing.stats',stats);cafe?.float('','+1 session','#647557');resetTimer(timer,stats.sessions%4===0?'long':'short');
      toast(`Session terminée. Au café, ça t’aurait rapporté des pièces. <a href="/app/" data-enter>Entrer au café</a>`);}
    else resetTimer(timer,'focus');
    persist();chime();renderSessions();return renderTimer();
  }
  const text=`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
  if(text!==lastText){$('#lp-time').textContent=text;lastText=text;document.title=running?`${text} · gamitask`:'gamitask — Le café des petites victoires';}
  cafe?.setClock(1-remaining/(timer.durations[timer.mode]*60),running);
  if(running!==lastRunning||timer.mode!==lastMode){
    $('#lp-start').innerHTML=icon(running?'pause':'play')+`<span>${running?'Faire une pause':remaining<timer.durations[timer.mode]*60?'Reprendre':timer.mode==='focus'?'C’est parti':'Prendre une pause'}</span>`;
    for(const b of root.querySelectorAll<HTMLElement>('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===timer.mode));
    drawIcons();lastRunning=running;lastMode=timer.mode;
  }
}
$('#lp-start').onclick=()=>{toggleTimer(timer);persist();renderTimer();};
$('#lp-reset').onclick=()=>{resetTimer(timer);persist();renderTimer();};
for(const b of root.querySelectorAll<HTMLElement>('[data-mode]'))b.onclick=()=>{resetTimer(timer,b.dataset.mode as TimerMode);persist();renderTimer();};
renderSessions();renderTimer();setInterval(renderTimer,250);

// ── Notes: plain tasks, no server; the pending ones stand on the table as tickets. ──
let notes:Task[]=load('gamitask.landing.notes',[]);
const pendingNotes=()=>notes.filter(n=>!n.done);
function renderNotes(){
  save('gamitask.landing.notes',notes);
  $('#lp-note-list').innerHTML=notes.map(n=>`<li class="${n.done?'done':''}" data-id="${n.id}"><button class="check-button ${n.done?'done':''}" aria-label="${n.done?'À refaire':'Terminé'}">${icon('check')}</button><span class="task-text">${esc(n.text)}</span><button class="remove-task" aria-label="Retirer">${icon('x')}</button></li>`).join('');
  $('#lp-notes-count').textContent=String(pendingNotes().length);$('#lp-notes-empty').hidden=notes.length>0;
  drawIcons();cafe?.setTasks(pendingNotes());
}
$('#lp-note-form').onsubmit=(e:Event)=>{e.preventDefault();const input=$('#lp-note') as HTMLInputElement,text=cleanText(input.value);if(!text)return;
  notes.unshift({id:crypto.randomUUID?.()??String(Date.now()),userId:'landing',text,done:false,createdAt:Date.now(),category:null,type:'task'});input.value='';renderNotes();};
$('#lp-note-list').onclick=(e:Event)=>{const li=(e.target as HTMLElement).closest('li');if(!li)return;const id=li.getAttribute('data-id');const n=notes.find(x=>x.id===id);if(!n)return;
  if((e.target as HTMLElement).closest('.remove-task'))notes=notes.filter(x=>x.id!==id);else if((e.target as HTMLElement).closest('.check-button'))n.done=!n.done;else return;renderNotes();};
renderNotes();

// ── Entering the café takes what was started here along: notes and timer durations. ──
root.addEventListener('click',e=>{if((e.target as HTMLElement).closest('[data-enter]'))save('gamitask.landing.handoff',{notes:pendingNotes().map(n=>n.text),durations:timer.durations});});

// ── The room: the app's private room, built once the page has painted. Three.js is loaded on demand. ──
function onSceneState(state:SceneState){
  if('hover' in state){const h=$('#hint');if(!state.hover)h.hidden=true;else{const r=($('.lp-demo') as HTMLElement).getBoundingClientRect(),t=state.hover.task;
    h.innerHTML=t?`<strong>${esc(t.text)}</strong><small>une note, posée sur la table</small>`:`<strong>${esc(state.hover.hotspot?.title??'')}</strong><small>au café, c’est ici que ça se passe</small>`;h.hidden=false;h.style.left=`${state.hover.x-r.left}px`;h.style.top=`${state.hover.y-r.top}px`;}}
  if(state.focusTask){const li=$(`li[data-id="${state.focusTask}"]`);li?.classList.add('flash');setTimeout(()=>li?.classList.remove('flash'),1600);}
  if(state.hotspot)toast(`Ça, c’est dans le vrai café. <a href="/app/" data-enter>Entrer</a>`);
}
async function mountRoom(){
  const {createCafe}=await import('./scene.ts');
  const look=loadLook(load('gamitask.look',null),PALETTE[0].hex,[]);
  cafe=createCafe($('#scene'),onSceneState,{room:'private',furniture:{plant:{c:1,r:6},lamp:{c:9,r:1},couch:{c:9,r:7},coffee:{c:1,r:1}},look});
  $('.loading')?.remove();cafe.setTasks(pendingNotes());
}
if('requestIdleCallback' in window)(window as any).requestIdleCallback(mountRoom,{timeout:800});else setTimeout(mountRoom,50);
