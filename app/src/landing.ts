// The landing page: what gamitask is, and a playable corner of it. The café itself lives at /app/.
// The hero is a real room from the app running offline: a pomodoro, notes that become tickets, a character to walk.
import './style.css';
import './landing.css';
import {Coffee,ArrowRight,Play,Pause,RotateCcw,Plus,Check,X,StickyNote,Timer,Users,ListChecks,Smile,Home,Twitch,Hammer,Link2,MessageCircle,Flame,Sparkles,Mail,Github} from 'lucide';
import {icon,drawIcons,registerIcons,load,save,today,esc} from './ui.ts';
import type {Vignette} from './vignettes.ts';
import {createTimer,remainingSeconds,toggleTimer,resetTimer,type TimerMode} from './timer.ts';
import {loadLook} from './look.ts';
import {PALETTE} from './identity.ts';
import {cleanText} from './tasks.ts';
import type {Task} from '@shared/types';
import type {SceneState} from './scene.ts';

registerIcons({Coffee,ArrowRight,Play,Pause,RotateCcw,Plus,Check,X,StickyNote,Timer,Users,ListChecks,Smile,Home,Twitch,Hammer,Link2,MessageCircle,Flame,Sparkles,Mail,Github});
const FEATURES:{v:Vignette;ic:string;title:string;text:string}[]=[
  {v:'timer',ic:'timer',title:'Un pomodoro, seul ou avec la salle',text:'Vingt-cinq minutes de concentration, une vraie pause, et toute la salle peut suivre le même tempo. L’horloge au mur avance avec toi.'},
  {v:'tasks',ic:'list-checks',title:'Des tâches qui deviennent des tickets',text:'Chaque chose à faire est un petit ticket posé sur ta table. Tu la coches, il disparaît. Les tâches du jour reviennent chaque matin.'},
  {v:'avatar',ic:'smile',title:'Un personnage bien à toi',text:'Visage, coiffure, tenue, gabarit : tout se règle. Les pièces gagnées en session achètent chapeaux et mobilier.'},
  {v:'room',ic:'home',title:'Ta pièce privée',text:'Un chez-toi à meubler case par case, où inviter qui tu veux d’un simple lien — et le mettre dehors si besoin.'},
  {v:'twitch',ic:'twitch',title:'Twitch dans la salle',text:'Lie ta chaîne : tes viewers entrent dans ta pièce, leur chat s’affiche au-dessus de leur tête, et ils travaillent avec toi.'},
  {v:'workshop',ic:'hammer',title:'L’atelier d’objets',text:'De nouveaux meubles et chapeaux s’assemblent dans l’app, cube par cube, et arrivent en boutique sans redéploiement.'},
];

const root=document.getElementById('landing') as HTMLElement;
root.innerHTML=`
  <header class="lp-bar">
    <a class="brand chip" href="/" aria-label="gamitask, accueil"><span class="brand-mark">${icon('coffee')}</span><span>gami<span class="brand-light">task</span></span></a>
    <nav class="lp-nav" aria-label="Sections"><a href="#features">Fonctionnalités</a><a href="#streamers">Streamers</a><a href="#pricing">Tarifs</a><a href="#faq">FAQ</a></nav>
    <a class="chip active" href="/app/" data-enter>Entrer au café ${icon('arrow-right')}</a>
  </header>
  <section class="lp-stage" id="demo" aria-label="Essai du café">
    <div class="lp-side lp-side-left">
      <div class="lp-hero">
        <p class="eyebrow">UN CAFÉ 3D POUR TES SESSIONS DE TRAVAIL</p>
        <h1>Le café des <em>petites victoires</em>.</h1>
        <p class="lp-lead">Un pomodoro, des tâches qui deviennent des tickets sur ta table, et un personnage qui s’installe avec toi. Gratuit, sans compte pour commencer.</p>
        <div class="lp-cta"><a class="primary" href="/app/" data-enter>${icon('coffee')}<span>Entrer au café, c’est gratuit</span></a></div>
      </div>
      <div class="lp-card lp-timer" aria-label="Pomodoro">
        <div class="lp-card-head">${icon('timer')}<span>Pomodoro</span></div>
        <div class="chip-group lp-modes" role="group" aria-label="Type de session"><button class="chip" data-mode="focus">Focus</button><button class="chip" data-mode="short">Pause</button><button class="chip" data-mode="long">Longue</button></div>
        <output id="lp-time" class="lp-time" aria-live="off">25:00</output>
        <div class="lp-timer-actions"><button id="lp-start" class="primary">${icon('play')}<span>C’est parti</span></button><button id="lp-reset" class="chip icon" aria-label="Réinitialiser">${icon('rotate-ccw')}</button></div>
        <p class="lp-timer-note" id="lp-sessions">Aucune session aujourd’hui, encore.</p>
      </div>
    </div>
    <div class="lp-demo world">
      <div class="scene" id="scene"><div class="loading">Le café ouvre ses portes…</div></div>
      <p class="lp-demo-hint">Clique au sol pour marcher, sur un siège pour t’asseoir · glisse pour tourner</p>
      <div id="hint" class="hint" role="tooltip" hidden></div>
      <div id="toast" class="toast" role="status"></div>
    </div>
    <div class="lp-side lp-side-right">
      <div class="lp-card lp-notes" aria-label="Notes">
        <div class="lp-card-head">${icon('sticky-note')}<span>Notes</span><span class="pill" id="lp-notes-count">0</span></div>
        <form id="lp-note-form" class="lp-note-form"><input id="lp-note" maxlength="80" placeholder="Une chose à faire…" autocomplete="off"/><button class="chip icon" type="submit" aria-label="Ajouter">${icon('plus')}</button></form>
        <ul id="lp-note-list" class="lp-note-list"></ul>
        <p class="lp-empty" id="lp-notes-empty">Chaque note devient un ticket posé sur ta table.</p>
      </div>
      <p class="lp-side-note">Tout ce que tu fais ici reste dans ton navigateur. En entrant au café, tes notes te suivent.</p>
    </div>
  </section>
  <main class="lp">
    <section class="lp-section" id="features">
      <p class="eyebrow">CE QU’ON Y TROUVE</p><h2>Tout ce qu’il faut pour avancer, <em>et rien qui presse</em>.</h2>
      <div class="lp-grid">${FEATURES.map(f=>`<article class="lp-feature reveal"><figure class="lp-figure" data-vignette="${f.v}"></figure><h3>${icon(f.ic)}${f.title}</h3><p>${f.text}</p></article>`).join('')}</div>
    </section>
    <section class="lp-section lp-steps" id="how">
      <p class="eyebrow">COMMENT ÇA MARCHE</p><h2>Trois pas, <em>et tu es installé</em>.</h2>
      <ol class="lp-step-list">
        <li class="reveal"><span class="lp-step-n">1</span><h3>Entre au café</h3><p>Sans compte pour commencer : un pseudo, une couleur, et tu es dans la salle avec les autres.</p></li>
        <li class="reveal"><span class="lp-step-n">2</span><h3>Lance une session, pose tes tâches</h3><p>Un pomodoro au comptoir, tes tâches en tickets sur la table. Ton personnage s’assoit et se concentre avec toi.</p></li>
        <li class="reveal"><span class="lp-step-n">3</span><h3>Gagne des pièces, aménage ta pièce</h3><p>Chaque session et chaque tâche rapportent. Chapeaux, meubles, une pièce à toi — et l’envie de revenir demain.</p></li>
      </ol>
    </section>
    <section class="lp-section" id="streamers">
      <div class="lp-band reveal">
        <div class="lp-band-text"><p class="eyebrow">POUR LES STREAMERS</p><h2>Ta communauté, <em>dans ta pièce</em>.</h2>
          <ul class="lp-band-list"><li>${icon('link-2')}<span>Lie ta chaîne Twitch depuis ton compte, en un clic.</span></li><li>${icon('users')}<span>Tes viewers apparaissent comme des personnages dans ta salle, en direct.</span></li><li>${icon('message-circle')}<span>Leur chat s’affiche au-dessus de leur tête, sans quitter le stream.</span></li><li>${icon('flame')}<span>Un pomodoro collectif : toute la salle se concentre au même rythme.</span></li></ul>
          <a class="primary" href="/app/" data-enter>${icon('twitch')}<span>Lier ma chaîne dans le café</span></a></div>
        <figure class="lp-figure lp-band-figure" data-vignette="twitch"></figure>
      </div>
    </section>
    <section class="lp-section" id="pricing">
      <p class="eyebrow">TARIFS</p><h2>Gratuit pour travailler, <em>Pro pour recevoir</em>.</h2>
      <div class="lp-plans">
        <article class="lp-plan reveal"><h3>Gratuit</h3><p class="lp-price"><strong>0 €</strong><span>pour toujours</span></p>
          <ul>${['Le café et le jardin publics','Pomodoro seul ou avec la salle','Tâches en tickets, tâches du jour','Personnage, boutique et pièces gagnées','Une pièce privée à toi'].map(t=>`<li>${icon('check')}${t}</li>`).join('')}</ul>
          <a class="secondary" href="/app/" data-enter>Entrer au café</a></article>
        <article class="lp-plan lp-plan-pro reveal"><span class="pill">BIENTÔT</span><h3>Pro</h3><p class="lp-price"><strong>4,99 €</strong><span>par mois</span></p>
          <ul>${['Tout le gratuit','Invités illimités dans ta pièce, liens et modération','Twitch : tes viewers dans ta salle, chat en direct','Chapeaux et mobilier exclusifs, sets à bonus','L’atelier d’objets pour ta communauté'].map(t=>`<li>${icon('sparkles')}${t}</li>`).join('')}</ul>
          <form id="lp-waitlist" class="lp-waitlist"><input type="email" name="email" placeholder="ton@email.fr" required autocomplete="email"/><button class="primary" type="submit">${icon('mail')}<span>Me prévenir</span></button></form>
          <p class="lp-plan-note" id="lp-waitlist-note">Pas de paiement pour l’instant : on te prévient à l’ouverture.</p></article>
      </div>
    </section>
    <section class="lp-section" id="voices">
      <p class="eyebrow">ILS S’Y SONT INSTALLÉS</p><h2>Des sessions <em>qu’on a envie de refaire</em>.</h2>
      <div class="lp-quotes">
        <!-- Exemples à remplacer par de vrais retours. -->
        <blockquote class="lp-quote reveal"><p>« Je lance une session, mon personnage s’assoit, et bizarrement je m’y mets aussi. »</p><footer><span class="swatch-dot" style="--swatch:#c9764f"></span>Camille · exemple</footer></blockquote>
        <blockquote class="lp-quote reveal"><p>« Mes viewers arrivent dans ma pièce pendant le stream : on travaille ensemble sans que je quitte l’écran. »</p><footer><span class="swatch-dot" style="--swatch:#819478"></span>Noé · exemple</footer></blockquote>
        <blockquote class="lp-quote reveal"><p>« Les tickets sur la table, c’est ma to-do préférée depuis des années. »</p><footer><span class="swatch-dot" style="--swatch:#8aa6b8"></span>Inès · exemple</footer></blockquote>
      </div>
    </section>
    <section class="lp-section lp-faq" id="faq">
      <p class="eyebrow">QUESTIONS</p><h2>Ce qu’on nous <em>demande souvent</em>.</h2>
      <div class="lp-faq-list">
        ${[['C’est vraiment gratuit ?','Oui. Le café, le pomodoro, les tâches, le personnage et une pièce privée sont gratuits, sans limite de temps. Le Pro ajoutera ce qui sert à recevoir : invités illimités, Twitch, cosmétiques exclusifs.'],
            ['Ai-je besoin d’un compte ?','Non pour commencer : un pseudo et une couleur suffisent, tout reste dans ton navigateur. Un compte Google permet de retrouver ton personnage et tes pièces sur n’importe quel appareil.'],
            ['Que deviennent mes données ?','Tes tâches, pièces et réglages sont stockés sur nos serveurs en Europe, liés à ton compte. Pas de revente, pas de publicité. Tu peux tout supprimer depuis ton compte.'],
            ['Ça marche sur mobile ?','Le café s’ouvre dans un navigateur mobile récent, mais il est pensé pour un écran d’ordinateur, à côté de ton travail. Une version mobile dédiée viendra avec le Pro.'],
            ['Je stream : comment mes viewers entrent ?','Depuis « Mon compte », lie ta chaîne Twitch. Les personnes qui écrivent dans ton chat apparaissent alors comme des personnages dans ta pièce, avec leur message au-dessus de la tête.']]
          .map(([q,a])=>`<details class="lp-faq-item reveal"><summary>${q}</summary><p>${a}</p></details>`).join('')}
      </div>
    </section>
  </main>
  <footer class="lp-foot">
    <div class="lp-foot-in">
      <a class="brand" href="/"><span class="brand-mark">${icon('coffee')}</span><span>gami<span class="brand-light">task</span></span></a>
      <nav aria-label="Pied de page"><a href="/app/" data-enter>Entrer au café</a><a href="#features">Fonctionnalités</a><a href="#pricing">Tarifs</a><a href="#faq">FAQ</a><a href="https://github.com/GMaxDev/gamiTask" rel="noopener">${icon('github')}GitHub</a></nav>
      <p>Fait avec ☕ à Paris. © ${new Date().getFullYear()} gamitask.</p>
    </div>
  </footer>`;
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
  notes.unshift({id:crypto.randomUUID?.()??String(Date.now()),userId:'landing',text,note:'',kind:'todo',difficulty:'easy',value:0,done:false,createdAt:Date.now(),category:null,up:true,down:false,countUp:0,countDown:0,days:127,streak:0,dueAt:null,checklist:[],completedAt:null});input.value='';renderNotes();};
$('#lp-note-list').onclick=(e:Event)=>{const li=(e.target as HTMLElement).closest('li');if(!li)return;const id=li.getAttribute('data-id');const n=notes.find(x=>x.id===id);if(!n)return;
  if((e.target as HTMLElement).closest('.remove-task'))notes=notes.filter(x=>x.id!==id);else if((e.target as HTMLElement).closest('.check-button'))n.done=!n.done;else return;renderNotes();};
renderNotes();

// ── Entering the café takes what was started here along: notes and timer durations. ──
root.addEventListener('click',e=>{if((e.target as HTMLElement).closest('[data-enter]'))save('gamitask.landing.handoff',{notes:pendingNotes().map(n=>n.text),durations:timer.durations});});

// ── Waiting list: one e-mail to the server, one line of feedback. ──
const API_URL=(import.meta.env.VITE_API_URL as string|undefined)??'http://localhost:3001';
$('#lp-waitlist').onsubmit=async(e:Event)=>{e.preventDefault();const form=e.target as HTMLFormElement,note=$('#lp-waitlist-note') as HTMLElement,email=(form.elements.namedItem('email') as HTMLInputElement).value;
  try{const r=await fetch(`${API_URL}/api/waitlist`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
    note.textContent=r.ok?'C’est noté. On t’écrit à l’ouverture du Pro.':r.status===429?'Doucement, réessaie dans une minute.':'Cette adresse ne passe pas, vérifie-la.';if(r.ok)form.reset();}
  catch{note.textContent='Le serveur ne répond pas, réessaie plus tard.';}};

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
  // The stage's centre column is narrower than the app's viewport: step back so the whole room fits.
  const w=($('.lp-demo') as HTMLElement).clientWidth;if(w<1500)cafe.zoomOut();if(w<1000)cafe.zoomOut();
  // The wheel scrolls the page here, it never zooms the room: the scene's own wheel handler is cut off before it runs.
  ($('.lp-demo') as HTMLElement).addEventListener('wheel',e=>e.stopPropagation(),{capture:true,passive:true});
}
if('requestIdleCallback' in window)(window as any).requestIdleCallback(mountRoom,{timeout:800});else setTimeout(mountRoom,50);

// ── Sections: reveal on scroll; feature pictures are drawn from the real pieces the first time they come into view. ──
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const revealer=new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){e.target.classList.add('in');revealer.unobserve(e.target);}},{rootMargin:'0px 0px -10% 0px'});
for(const el of root.querySelectorAll('.reveal')){if(reduced)el.classList.add('in');else revealer.observe(el);}
let vignettes:Promise<{draw(kind:Vignette):string}>|null=null;
const painter=new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){painter.unobserve(e.target);const fig=e.target as HTMLElement;
  (vignettes??=import('./vignettes.ts').then(m=>m.createVignettes())).then(v=>{const img=new Image();img.alt='';img.src=v.draw(fig.dataset.vignette as Vignette);fig.replaceChildren(img);fig.classList.add('ready');});}},{rootMargin:'200px 0px'});
for(const el of root.querySelectorAll('.lp-figure'))painter.observe(el);
