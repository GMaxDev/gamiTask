import {createIcons,Coffee,Sun,Moon,Plus,Minus,LocateFixed,Volume2,VolumeX,Settings2,RotateCcw,Play,Pause,Check,MousePointer2,Move,Leaf,Headphones,X,HelpCircle,Clock3,ArrowUpRight,ListChecks,Repeat,Coins,Trophy,Flame,Home,ShoppingBag} from 'lucide';
import {createCafe} from './scene.ts';
import {createTimer,remainingSeconds,toggleTimer,resetTimer} from './timer.ts';
import {CATEGORIES,createTasks,addTask,updateTask,toggleTask,removeTask,pending,dailyReset} from './tasks.ts';
import {createProgress,completeTask,completePomodoro,levelInfo,ACHIEVEMENTS} from './progress.ts';
import {HATS,FURNITURE,SETS,createShop,buy,equipHat,place,unplace,takenCells,completeSets,bonuses,item as shopItem} from './shop.ts';
import './style.css';

const icons={Coffee,Sun,Moon,Plus,Minus,LocateFixed,Volume2,VolumeX,Settings2,RotateCcw,Play,Pause,Check,MousePointer2,Move,Leaf,Headphones,X,HelpCircle,Clock3,ArrowUpRight,ListChecks,Repeat,Coins,Trophy,Flame,Home,ShoppingBag};
const icon=(name: string,cls=''): string=>`<i data-lucide="${name}" class="${cls}" aria-hidden="true"></i>`;
// ponytail: `any` here saves typing every dataset/onclick/style access on raw DOM elements throughout this file.
const $=(s: string): any=>document.querySelector(s);
function drawIcons(){createIcons({icons,attrs:{'stroke-width':1.65}});}
function load(key: string,fallback: any): any{try{return JSON.parse(localStorage.getItem(key) as string)??fallback;}catch{return fallback;}}
function save(key: string,value: any){try{localStorage.setItem(key,JSON.stringify(value));}catch{/* The experience also works without persistent browser storage. */}}
const today=()=>new Date().toLocaleDateString('sv-SE');
let timer=createTimer(load('gamitask.timer',{})),stats=load('gamitask.stats',{});
const shop=createShop(load('gamitask.shop',{}));
let placingId: string|null=null,placingCell: {c: number; r: number}|null=null;
if(stats.date!==today())stats={date:today(),sessions:0,minutes:0};
stats.sessions=Number.isFinite(stats.sessions)?Math.max(0,stats.sessions):0;stats.minutes=Number.isFinite(stats.minutes)?Math.max(0,stats.minutes):0;

$('#app').innerHTML=`
  <main class="workspace">
    <section class="world" aria-label="Ton café">
      <div class="scene" id="scene"><div class="loading">Le café ouvre ses portes…</div></div>
      <div class="hud-top">
        <a class="brand" href="/" aria-label="gamitask, accueil"><span class="brand-mark">${icon('coffee')}</span><span>gami<span class="brand-light">task</span><small>LE CAFÉ PETIT JOUR</small></span></a>
        <div class="room-switch" role="group" aria-label="Changer de salle"><button data-room="public" aria-pressed="true">${icon('coffee')}<span>Le café</span></button><button data-room="private" aria-pressed="false">${icon('home')}<span>Chez moi</span></button></div>
        <button id="progress-chip" class="progress-chip" aria-label="Ma progression" title="Ma progression">
          <span class="coins">${icon('coins')}<strong id="coins">0</strong></span><span class="level-badge" id="level-badge">Niveau 0</span><span class="streak" id="streak" hidden>${icon('flame')}<span id="streak-count">0</span></span>
          <span class="xp-bar" role="progressbar" aria-label="Expérience" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="xp-fill"></span></span>
        </button>
      </div>
      <div class="view-controls"><button id="follow" class="icon-button active" title="Activer ou désactiver le suivi du personnage" aria-label="Suivre le personnage" aria-pressed="true">${icon('locate-fixed')}</button><span class="divider"></span><button id="zoom-out" class="icon-button" aria-label="Dézoomer">${icon('minus')}</button><output id="zoom-value">100%</output><button id="zoom-in" class="icon-button" aria-label="Zoomer">${icon('plus')}</button><span class="divider"></span><button id="recenter" class="icon-button" title="Vue initiale" aria-label="Recentrer la vue">${icon('rotate-ccw')}</button></div>
      <div class="world-bottom"><div class="ambience-controls"><button id="light" class="ambience-button">${icon('sun')}<span>Lumière du jour</span></button><span class="divider"></span><button id="sound" class="ambience-button" aria-pressed="false">${icon('headphones')}<span>Pluie douce</span><span class="sound-bars"><b></b><b></b><b></b></span></button></div><button id="help" class="help-button" aria-label="Comment se déplacer">${icon('help-circle')}</button></div>
      <section class="timer-hud timer-card" aria-label="Pomodoro">
        <div class="timer-tabs" role="group" aria-label="Type de session"><button data-mode="focus" aria-pressed="true">Focus</button><button data-mode="short" aria-pressed="false">Pause</button><button data-mode="long" aria-pressed="false">Longue</button></div>
        <div class="timer-main">
          <span class="dial-mini"><svg viewBox="0 0 220 220" aria-hidden="true"><circle class="dial-track" cx="110" cy="110" r="97"/><circle id="dial-progress" cx="110" cy="110" r="97"/></svg><button id="start" class="primary" aria-label="Lancer ou mettre en pause">${icon('play')}<span>C’est parti</span></button></span>
          <span class="timer-readout"><output id="timer-value" aria-label="Temps restant">25:00</output><span id="session-label">Session de concentration</span><span id="timer-kicker" hidden>ON Y VA DOUCEMENT</span></span>
        </div>
        <button id="reset" class="icon-button" aria-label="Réinitialiser le minuteur">${icon('rotate-ccw')}</button><button id="settings" class="icon-button" aria-label="Régler les durées">${icon('settings-2')}</button>
      </section>
      <button id="open-tasks" class="open-tasks" aria-label="Mes tâches" aria-expanded="false">${icon('list-checks')}<span id="tasks-count" class="tasks-count"></span></button>
      <div class="movement-hint">${icon('mouse-pointer-2')} Cliquer pour marcher ou s’asseoir <span>·</span> ${icon('move')} Glisser pour explorer <span>·</span> ${icon('coffee')} <span id="move-hint-room">Comptoir : passer commande</span></div>
      <div id="toast" class="toast" role="status"></div>
      <div id="hint" class="hint" role="tooltip" hidden></div>
      <div id="place-bar" class="place-bar" hidden><span id="place-text"></span><button id="place-ok" class="primary" disabled>${icon('check')}<span>Poser ici</span></button><button id="place-cancel" class="icon-button" aria-label="Annuler">${icon('x')}</button></div>
      <div id="veil" class="veil" aria-hidden="true"><span class="veil-label"><span id="veil-icon">${icon('coffee')}</span><span id="veil-text"></span></span></div><div id="veil-edge" class="veil-edge" aria-hidden="true"></div>
    </section>
    <aside class="drawer" id="tasks-drawer" aria-label="Mes tâches" aria-hidden="true">
      <div class="drawer-head"><span class="eyebrow">AU COMPTOIR</span><h2 id="drawer-title">Mes petites<br>tâches.</h2><button class="icon-button drawer-close" aria-label="Fermer">${icon('x')}</button></div>
      <div class="drawer-tabs" role="tablist"><button data-tab="tasks" role="tab" aria-selected="true">${icon('list-checks')} Tâches</button><button data-tab="shop" role="tab" aria-selected="false">${icon('shopping-bag')} Boutique</button></div>
      <div id="tab-tasks" role="tabpanel">
      <section class="tasks-card">
        <form id="task-form" class="task-form" autocomplete="off">
          <input id="task-text" maxlength="120" placeholder="Une chose à faire…" aria-label="Nouvelle tâche" />
          <div class="task-options">
            <div class="chips" id="task-cats" role="group" aria-label="Catégorie">${CATEGORIES.map(c=>`<button type="button" data-cat="${c.id}" style="--cat:${c.color}" aria-pressed="false">${c.label}</button>`).join('')}</div>
            <label class="daily-toggle" title="Revient chaque matin"><input type="checkbox" id="task-daily" />${icon('repeat')} Chaque jour</label>
            <button type="submit" class="icon-button add-task" aria-label="Ajouter la tâche">${icon('plus')}</button>
          </div>
        </form>
        <ul id="task-list" class="task-list"></ul>
        <p id="tasks-empty" class="tasks-empty">Rien pour l’instant. Une seule chose suffit pour commencer.</p>
      </section>
      <p class="drawer-note">Chaque tâche devient une petite ardoise posée sur une table du café. Coche-la ici, ou clique dessus dans la salle pour la retrouver.</p>
      </div>
      <div id="tab-shop" role="tabpanel" hidden>
        <p class="shop-wallet">${icon('coins')}<strong id="shop-coins">0</strong> pièces à dépenser</p>
        <h3 class="shop-title">Chapeaux</h3><ul class="shop-list" id="shop-hats"></ul>
        <h3 class="shop-title">Mobilier <small id="shop-where"></small></h3><ul class="shop-list" id="shop-furniture"></ul>
        <h3 class="shop-title">Sets</h3><ul class="shop-list sets" id="shop-sets"></ul>
        <p class="drawer-note">Le mobilier ne s'installe que chez toi, dans ta propre pièce. Compléter un set donne un bonus permanent.</p>
      </div>
    </aside>
  </main>
  <dialog id="progress-dialog"><div class="dialog-heading"><h2>Ma progression.</h2><button class="icon-button close-dialog" aria-label="Fermer">${icon('x')}</button></div>
    <div class="progress-summary"><span class="coins">${icon('coins')}<strong id="coins-big">0</strong> pièces</span><span class="level-badge" id="level-big">Niveau 0</span></div>
    <div class="xp-bar" aria-hidden="true"><span id="xp-fill-big"></span></div><div class="xp-label" id="xp-label">0 / 50 XP</div>
    <div class="day-stats"><div><strong id="sessions">0</strong><span>sessions aujourd’hui</span></div><span class="stat-divider"></span><div><strong><span id="minutes">0</span><small> min</small></strong><span>rien que pour toi</span></div></div>
    <div class="session-dots"><span class="filled"></span><span></span><span></span><span></span><small id="cycle-label">Un pas après l’autre</small></div>
    <p class="eyebrow">SUCCÈS <span id="achievements-count">0/7</span></p><ul class="achievements-list" id="achievements-list"></ul>
  </dialog>
  <dialog id="settings-dialog"><form id="settings-form"><div class="dialog-heading"><h2>Ton propre rythme.</h2><button type="button" class="icon-button close-dialog" aria-label="Fermer">${icon('x')}</button></div><p>Choisis la durée de tes sessions, en minutes.</p><label>Concentration<input name="focus" type="number" min="1" max="90" required /></label><label>Petite pause<input name="short" type="number" min="1" max="90" required /></label><label>Longue pause<input name="long" type="number" min="1" max="90" required /></label><p class="form-note">Enregistrer remet le minuteur au début.</p><button type="submit" class="primary">Enregistrer mon rythme</button></form></dialog>
  <dialog id="help-dialog"><div class="dialog-heading"><h2>Bienvenue au café.</h2><button class="icon-button close-dialog" aria-label="Fermer">${icon('x')}</button></div><p>Ce petit coin est à toi. Prends tes marques.</p><ul class="help-list"><li>${icon('mouse-pointer-2')}<span><strong>Un clic au sol ou sur un siège</strong>Ton personnage s’y rend en contournant les meubles, et s’installe si c’est une chaise ou le canapé.</span></li><li>${icon('move')}<span><strong>Cliquer et glisser</strong>Explore le café en déplaçant la caméra.</span></li><li>${icon('plus')}<span><strong>Molette ou boutons + / −</strong>Rapproche-toi ou prends un peu de recul.</span></li><li>${icon('locate-fixed')}<span><strong>Suivi du personnage</strong>Réactive-le pour que la caméra t’accompagne.</span></li></ul><p class="form-note">Au clavier : sélectionne la scène, puis utilise les flèches. L’orientation de la vue reste toujours fixe.</p><button class="primary close-dialog">Je m’installe</button></dialog>
`;
drawIcons();
let toastTimeout: ReturnType<typeof setTimeout>;
let audio: any,rain: any,rainGain: any,soundOn=false;
function toast(message: string){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('#toast').classList.remove('visible'),4500);}
let cafe: any,room=load('gamitask.room','public');if(room!=='private')room='public';
function mountRoom(){
  if(placingId)endPlacing();cafe?.dispose();$('#scene').innerHTML='';$('.world').classList.remove('evening');$('#light').innerHTML=icon('sun')+'<span>Lumière du jour</span>';
  document.querySelectorAll('[data-room]').forEach((b: any)=>b.setAttribute('aria-pressed',String(b.dataset.room===room)));
  cafe=createCafe($('#scene'),onSceneState,{room,furniture:shop.placed,hat:shop.hat});drawIcons();$('#move-hint-room').textContent=room==='private'?'Bureau : boutique et aménagement':'Comptoir : passer commande';
}
// Iris wipe: a neutral veil grows from the button, the new room is built behind it, then the veil shrinks away.
let switching=false;
async function irisSwap(x: number,y: number,label: string,iconName: string,fn: () => void){
  const veil=$('#veil'),r=Math.hypot(innerWidth,innerHeight)*1.05,shut=`circle(0px at ${x}px ${y}px)`,open=`circle(${r}px at ${x}px ${y}px)`;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,timing={duration:reduced?0:650,easing:'cubic-bezier(.45,0,.2,1)',fill:'forwards'};
  $('#veil-text').textContent=label;$('#veil-icon').innerHTML=icon(iconName);drawIcons();
  // the disc's rim casts a soft shadow on the room: a transparent circle with a drop shadow, scaled in step with the clip
  const edge=$('#veil-edge');edge.style.left=`${x}px`;edge.style.top=`${y}px`;edge.style.width=edge.style.height=`${r*2}px`;
  const rim=(k: boolean)=>edge.animate([{transform:`translate(-50%,-50%) scale(${k?0:1})`},{transform:`translate(-50%,-50%) scale(${k?1:0})`}],timing);
  veil.classList.add('cover');rim(true);await veil.animate([{clipPath:shut},{clipPath:open}],timing).finished;
  fn();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r as any)));// let the new room draw its first frame
  rim(false);await veil.animate([{clipPath:open},{clipPath:shut}],timing).finished;veil.classList.remove('cover');edge.style.width=edge.style.height='0px';
}
document.querySelectorAll('[data-room]').forEach((b: any)=>b.onclick=async()=>{
  if(b.dataset.room===room||switching)return;switching=true;
  const r=b.getBoundingClientRect(),next=b.dataset.room,home=next==='private';
  await irisSwap(r.left+r.width/2,r.top+r.height/2,home?'Chez moi':'Le café Petit Jour',home?'home':'coffee',()=>{room=next;save('gamitask.room',room);try{mountRoom();cafe.setTasks(pending(tasks));}catch(error){console.error(error);}});
  toast(home?'Bienvenue chez toi. Installe-toi.':'Retour au café.');switching=false;
});
function onSceneState(state: any){
    if(state.seated)toast('Tu t’installes. Prends le temps qu’il faut.');
    if('hover' in state){const h=$('#hint');if(!state.hover)h.hidden=true;else{const r=$('.world').getBoundingClientRect(),t=state.hover.task,cat=t&&catOf(t.category),esc=(v: string)=>v.replace(/[&<>]/g,(c: string)=>({'&':'&amp;','<':'&lt;','>':'&gt;'} as Record<string,string>)[c]);
      h.innerHTML=t?`<span class="cat-dot" style="--cat:${cat?cat.color:'#d8d3c3'}"></span><strong>${esc(t.text)}</strong><small>${cat?cat.label:'Sans catégorie'}${t.type==='daily'?' · chaque jour':''} · cliquer pour la retrouver</small>`:`<span class="cat-dot" style="--cat:#d2a754"></span><strong>${state.hover.hotspot.title}</strong><small>${state.hover.hotspot.sub}</small>`;
      h.hidden=false;h.style.left=`${state.hover.x-r.left}px`;h.style.top=`${state.hover.y-r.top}px`;}}
    if(state.hotspot==='tasks')openDrawer(true);
    if(state.hotspot==='timer')$('#settings').click();
    if(state.hotspot==='shop')openDrawer(true,'shop');
    if(state.placing){placingCell=state.placing.cell;$('#place-ok').disabled=!placingCell;if(state.placing.refused)toast('Pas la place ici.');}
    if(state.focusTask){openDrawer(true);const li=document.querySelector(`#task-list li[data-id="${state.focusTask}"]`) as any;if(li){li.scrollIntoView({block:'nearest',behavior:'smooth'});li.classList.remove('flash');void li.offsetWidth;li.classList.add('flash');}}
    if(state.zoom){$('#zoom-value').textContent=`${Math.round(state.zoom*100)}%`;$('#follow').classList.toggle('active',state.follow);$('#follow').setAttribute('aria-pressed',String(state.follow));}
}
try{
  mountRoom();$('.loading')?.remove();
}catch(error){console.error(error);$('.loading').innerHTML='Le café 3D n’a pas pu démarrer.<br>Vérifie que l’accélération graphique est activée dans ton navigateur.';}
$('#zoom-in').onclick=()=>cafe?.zoomIn();$('#zoom-out').onclick=()=>cafe?.zoomOut();$('#recenter').onclick=()=>cafe?.recenter();$('#follow').onclick=()=>cafe?.setFollow();
$('#light').onclick=()=>{if(!cafe)return;const evening=cafe.toggleLight();$('#light').innerHTML=icon(evening?'moon':'sun')+`<span>${evening?'Douce soirée':'Lumière du jour'}</span>`;$('.world').classList.toggle('evening',evening);drawIcons();};
$('#help').onclick=()=>$('#help-dialog').showModal();
$('#progress-chip').onclick=()=>$('#progress-dialog').showModal();
// The task list lives in a drawer: opened from the HUD button, the counter in the room, or a slate.
let drawerTab='tasks';
function showTab(tab: string){drawerTab=tab;document.querySelectorAll('[data-tab]').forEach((b: any)=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));$('#tab-tasks').hidden=tab!=='tasks';$('#tab-shop').hidden=tab!=='shop';$('#drawer-title').innerHTML=tab==='shop'?'La petite<br>boutique.':'Mes petites<br>tâches.';if(tab==='shop')renderShop();}
function openDrawer(open=true,tab=drawerTab){$('#tasks-drawer').classList.toggle('open',open);$('#tasks-drawer').setAttribute('aria-hidden',String(!open));$('#open-tasks').setAttribute('aria-expanded',String(open));showTab(open?tab:drawerTab);if(open&&tab==='tasks')setTimeout(()=>$('#task-text').focus(),250);}
document.querySelectorAll('[data-tab]').forEach((b: any)=>b.onclick=()=>showTab(b.dataset.tab));
$('#open-tasks').onclick=()=>openDrawer(!$('#tasks-drawer').classList.contains('open'));
$('.drawer-close').onclick=()=>openDrawer(false);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#tasks-drawer').classList.contains('open'))openDrawer(false);});
document.querySelectorAll('.close-dialog').forEach((b: any)=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',(e: any)=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));

// Progression: coins, XP, streak and achievements — a pure model in progress.js, saved locally.
const progress=createProgress(load('gamitask.progress',{}));
function saveShop(){save('gamitask.shop',shop);save('gamitask.progress',progress);}
function renderShop(){
  const home=room==='private',done=completeSets(shop);
  $('#shop-coins').textContent=progress.coins;$('#shop-where').textContent=home?'— chez toi':'— à installer chez toi';
  $('#shop-hats').innerHTML=HATS.map(h=>{const owned=shop.owned.includes(h.id),worn=shop.hat===h.id;return `<li class="${owned?'owned':''}"><span class="shop-emoji">${h.emoji}</span><span class="shop-name">${h.name}<small>${owned?(worn?'Porté':'À toi'):`${h.price} pièces`}</small></span><button data-hat="${h.id}" ${!owned&&progress.coins<h.price?'disabled':''}>${owned?(worn?'Retirer':'Porter'):'Acheter'}</button></li>`;}).join('');
  $('#shop-furniture').innerHTML=FURNITURE.map(f=>{const owned=shop.owned.includes(f.id),placed=f.id in shop.placed,set=SETS.find(s=>s.id===f.set) as any;
    const action=!owned?`<button data-buy="${f.id}" ${progress.coins<f.price?'disabled':''}>Acheter</button>`:!home?'<small>chez toi</small>':placed?`<button data-move="${f.id}">Déplacer</button><button data-unplace="${f.id}" class="quiet">Ranger</button>`:`<button data-place="${f.id}">Placer</button>`;
    return `<li class="${owned?'owned':''}"><span class="shop-emoji">${f.emoji}</span><span class="shop-name">${f.name}<small>${owned?(placed?'Installé':'Rangé'):`${f.price} pièces`} · set ${set.emoji}</small></span><span class="shop-actions">${action}</span></li>`;}).join('');
  $('#shop-sets').innerHTML=SETS.map(s=>{const have=s.items.filter(id=>shop.owned.includes(id)).length,full=done.includes(s);return `<li class="${full?'owned':''}"><span class="shop-emoji">${s.emoji}</span><span class="shop-name">${s.name}<small>${s.desc} · ${have}/${s.items.length}</small></span><span class="set-state">${full?'Actif':''}</span></li>`;}).join('');
}
$('#tab-shop').addEventListener('click',(e: any)=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.buy||b.dataset.hat&&!shop.owned.includes(b.dataset.hat)){const it=buy(shop,progress,b.dataset.buy||b.dataset.hat);if(!it){toast('Il te manque quelques pièces.');return;}saveShop();renderProgress();toast(`${it.emoji} ${it.name} est à toi.`);if(HATS.some(h=>h.id===it.id)){equipHat(shop,it.id);saveShop();cafe?.setHat(shop.hat);}renderShop();return;}
  if(b.dataset.hat){equipHat(shop,shop.hat===b.dataset.hat?null:b.dataset.hat);saveShop();cafe?.setHat(shop.hat);renderShop();return;}
  if(b.dataset.place||b.dataset.move){startPlacing(b.dataset.place||b.dataset.move);return;}
  if(b.dataset.unplace){unplace(shop,b.dataset.unplace);saveShop();rearrange('Rangé.');}
});
// Placement: the room shows its free tiles, you click one, then confirm. Moving a piece starts from where it stands.
function startPlacing(id: string){
  if(room!=='private'||!cafe)return;placingId=id;placingCell=null;openDrawer(false);
  $('#place-text').innerHTML=`Clique une case pour ${shop.placed[id]?'déplacer':'poser'} <strong>${shopItem(id)?.emoji} ${shopItem(id)?.name}</strong>`;$('#place-ok').disabled=true;$('#place-bar').hidden=false;drawIcons();
  cafe.startPlacing(id,shop.placed[id]??null,takenCells(shop,id));
}
function endPlacing(){cafe?.stopPlacing();placingId=null;placingCell=null;$('#place-bar').hidden=true;}
$('#place-cancel').onclick=()=>{endPlacing();openDrawer(true,'shop');};
$('#place-ok').onclick=()=>{if(!placingId||!placingCell||!place(shop,placingId,placingCell))return;const it=shopItem(placingId) as any;endPlacing();saveShop();rearrange(`${it.emoji} ${it.name} : c’est posé.`);};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&placingId){endPlacing();openDrawer(true,'shop');}});
// furniture is part of the baked room, so a change rebuilds your room behind the iris
function rearrange(message: string){if(switching)return;try{mountRoom();cafe.setTasks(pending(tasks));}catch(error){console.error(error);}toast(message);renderShop();}// furniture changes rebuild the room in place, no iris
let toastQueue=Promise.resolve();
const later=(fn: () => void,ms: number)=>{toastQueue=toastQueue.then(()=>new Promise<void>(r=>setTimeout(()=>{fn();r();},ms)));};// one toast at a time
function celebrate(unlocked: any[]){for(const a of unlocked)later(()=>toast(`${a.icon} Succès : ${a.label} — ${a.desc}`),2600);}
function renderProgress(){
  const {level,into,span}=levelInfo(progress),pct=Math.round(into/span*100);
  $('#coins').textContent=progress.coins;$('#coins-big').textContent=progress.coins;$('#level-badge').textContent=`Niveau ${level}`;$('#level-big').textContent=`Niveau ${level}`;$('#xp-fill-big').style.width=`${pct}%`;
  $('#achievements-list').innerHTML=ACHIEVEMENTS.map(a=>`<li class="${progress.achievements.includes(a.key)?'unlocked':''}"><span>${a.icon}</span><strong>${a.label}</strong><small>${a.desc}</small></li>`).join('');
  $('#xp-fill').style.width=`${pct}%`;$('.xp-bar').setAttribute('aria-valuenow',pct);$('#xp-label').textContent=`${into} / ${span} XP`;
  $('#streak').hidden=progress.streak<2;$('#streak-count').textContent=progress.streak;
  $('#achievements-count').textContent=`${progress.achievements.length}/${ACHIEVEMENTS.length}`;
}
function rewardTask(t: any){const r=completeTask(progress,bonuses(shop));save('gamitask.progress',progress);renderProgress();toast(`${t.type==='daily'?'Fait pour aujourd’hui.':'C’est fait.'} +${r.coins} pièces.`);celebrate(r.unlocked);}
function rewardPomodoro(){
  const r=completePomodoro(progress,Date.now(),bonuses(shop));save('gamitask.progress',progress);renderProgress();
  toast(`Une petite victoire de plus. +${r.coins} pièces${r.bonus>5?` (série ×${r.streak})`:''}, +${r.xp} XP.`);
  if(r.levelUp)later(()=>toast(`✨ Niveau ${r.level} ! Le café te va de mieux en mieux.`),2600);
  celebrate(r.unlocked);
}
renderProgress();

function persistTimer(){save('gamitask.timer',timer);}
let lastRunning: boolean|null=null,lastMode: string|null=null,lastShown: string|null=null;
function renderTimer(){
  const remaining=remainingSeconds(timer),running=timer.endAt!==null;
  if(running&&remaining===0){
    if(stats.date!==today())stats={date:today(),sessions:0,minutes:0};
    if(timer.mode==='focus'){stats.sessions++;stats.minutes+=timer.durations.focus;save('gamitask.stats',stats);rewardPomodoro();resetTimer(timer,stats.sessions%4===0?'long':'short');}
    else {toast('La pause est terminée. On reprend quand tu veux.');resetTimer(timer,'focus');}
    persistTimer();chime();return renderTimer();
  }
  const text=`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
  if(text!==lastShown){$('#timer-value').textContent=text;lastShown=text;}
  const title=running?`${text} · ${timer.mode==='focus'?'Focus':'Pause'} — gamitask`:'gamitask — Le café des petites victoires';
  if(document.title!==title)document.title=title;
  $('#dial-progress').style.strokeDashoffset=609.47*(1-remaining/(timer.durations[timer.mode]*60));cafe?.setClock(1-remaining/(timer.durations[timer.mode]*60),running);
  if(lastRunning!==running||lastMode!==timer.mode){
    $('#start').innerHTML=icon(running?'pause':'play')+`<span>${running?'Faire une pause':remaining<timer.durations[timer.mode]*60?'Reprendre':timer.mode==='focus'?'C’est parti':'Prendre une pause'}</span>`;
    $('#timer-kicker').textContent=running?(timer.mode==='focus'?'UN PETIT PAS À LA FOIS':'PRENDS UNE RESPIRATION'):'ON Y VA DOUCEMENT';
    $('#session-label').textContent=timer.mode==='focus'?'Session de concentration':timer.mode==='short'?'Une petite respiration':'Une pause bien méritée';
    document.querySelectorAll('[data-mode]').forEach((b: any)=>{b.classList.toggle('selected',b.dataset.mode===timer.mode);b.setAttribute('aria-pressed',String(b.dataset.mode===timer.mode));});
    $('.timer-card').classList.toggle('running',running);drawIcons();lastRunning=running;lastMode=timer.mode;
  }
  $('#sessions').textContent=stats.sessions;$('#minutes').textContent=stats.minutes;
  const cycle=stats.sessions%4||(stats.sessions?3:0);// a completed cycle of four keeps every dot lit instead of dropping back to one
  document.querySelectorAll('.session-dots > span').forEach((s: any,i: number)=>s.classList.toggle('filled',i<=cycle));
  $('#cycle-label').textContent=stats.sessions?`${stats.sessions} petite${stats.sessions>1?'s':''} victoire${stats.sessions>1?'s':''}`:'Un pas après l’autre';
}
$('#start').onclick=()=>{ensureAudio();toggleTimer(timer);persistTimer();renderTimer();};
$('#reset').onclick=()=>{resetTimer(timer);persistTimer();lastRunning=null;renderTimer();};
document.querySelectorAll('[data-mode]').forEach((b: any)=>b.onclick=()=>{resetTimer(timer,b.dataset.mode);persistTimer();lastRunning=null;renderTimer();});
$('#settings').onclick=()=>{for(const [key,value] of Object.entries(timer.durations))$('#settings-form').elements[key].value=value;$('#settings-dialog').showModal();};
$('#settings-form').onsubmit=(e: any)=>{e.preventDefault();for(const key of Object.keys(timer.durations) as (keyof typeof timer.durations)[])timer.durations[key]=Number($('#settings-form').elements[key].value);resetTimer(timer);persistTimer();lastRunning=null;renderTimer();$('#settings-dialog').close();toast('Ton nouveau rythme est prêt.');};
setInterval(renderTimer,250);document.addEventListener('visibilitychange',renderTimer);renderTimer();

// Tasks: a pure model in tasks.js, saved locally, mirrored as little order slips in the café.
const tasks=createTasks(load('gamitask.tasks',{}));
{const old=load('gamitask.intention',null);if(old?.text?.trim()){const t=addTask(tasks,old.text);if(t&&old.done)t.done=true;}try{localStorage.removeItem('gamitask.intention');}catch{}}
let newCategory: string|null=null;
const catOf=(id: string|null)=>CATEGORIES.find(c=>c.id===id);
function persistTasks(){save('gamitask.tasks',tasks);cafe?.setTasks(pending(tasks));}
function renderTasks(){
  const list=$('#task-list'),todo=pending(tasks).length;list.innerHTML='';
  for(const t of [...tasks.list].sort((a,b)=>Number(a.done)-Number(b.done))){
    const li=document.createElement('li');li.dataset.id=t.id;li.className=t.done?'done':'';const cat=catOf(t.category);
    li.innerHTML=`<button class="check-button" aria-label="${t.done?'Reprendre':'Terminer'} : ${t.text}" aria-pressed="${t.done}">${icon('check')}</button><button class="cat-dot" style="--cat:${cat?cat.color:'#d8d3c3'}" title="Catégorie : ${cat?cat.label:'aucune'} (cliquer pour changer)" aria-label="Changer la catégorie"></button><span class="task-text" contenteditable="plaintext-only" spellcheck="false">${t.text.replace(/[&<>]/g,(c: string)=>({'&':'&amp;','<':'&lt;','>':'&gt;'} as Record<string,string>)[c])}</span>${t.type==='daily'?`<span class="daily-badge" title="Chaque jour">${icon('repeat')}</span>`:''}<button class="icon-button remove-task" aria-label="Supprimer">${icon('x')}</button>`;
    list.append(li);
  }
  $('#tasks-empty').hidden=tasks.list.length>0;$('#tasks-count').textContent=todo?`${todo} à faire`:tasks.list.length?'Tout est fait':'';
  document.querySelectorAll('#task-cats button').forEach((b: any)=>b.setAttribute('aria-pressed',String(b.dataset.cat===newCategory)));
  drawIcons();
}
$('#task-cats').onclick=(e: any)=>{const b=e.target.closest('[data-cat]');if(!b)return;newCategory=newCategory===b.dataset.cat?null:b.dataset.cat;renderTasks();$('#task-text').focus();};
$('#task-form').onsubmit=(e: any)=>{e.preventDefault();const t=addTask(tasks,$('#task-text').value,newCategory,$('#task-daily').checked?'daily':'task');if(!t)return;$('#task-text').value='';persistTasks();renderTasks();};
$('#task-list').addEventListener('click',(e: any)=>{
  const li=e.target.closest('li');if(!li)return;const id=li.dataset.id;
  if(e.target.closest('.check-button')){const t=toggleTask(tasks,id);if(t?.done){if(t.rewarded)toast(t.type==='daily'?'Fait pour aujourd’hui. À demain.':'C’est fait. Savoure cette petite victoire.');else{t.rewarded=true;rewardTask(t);}}}
  else if(e.target.closest('.cat-dot')){const t=tasks.list.find(t=>t.id===id);const i=CATEGORIES.findIndex(c=>c.id===t?.category);updateTask(tasks,id,{category:i+1<CATEGORIES.length?CATEGORIES[i+1].id:null});}
  else if(e.target.closest('.remove-task'))removeTask(tasks,id);
  else return;
  persistTasks();renderTasks();
});
$('#task-list').addEventListener('keydown',(e: any)=>{if(e.target.matches('.task-text')&&e.key==='Enter'){e.preventDefault();e.target.blur();}});
$('#task-list').addEventListener('focusout',(e: any)=>{if(!e.target.matches('.task-text'))return;const id=e.target.closest('li').dataset.id;const t=updateTask(tasks,id,{text:e.target.textContent});if(t)e.target.textContent=t.text;persistTasks();});
setInterval(()=>{const before=tasks.lastReset;dailyReset(tasks);if(tasks.lastReset!==before){persistTasks();renderTasks();}},60000);// midnight rollover while the tab stays open
persistTasks();renderTasks();

// Optional generated rain: no remote audio, tracking, or autoplay.
function ensureAudio(){try{audio??=new (window.AudioContext||(window as any).webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{});return audio;}catch{return null;}}
function chime(){if(!audio||audio.state!=='running')return;for(const [i,freq] of [523.25,659.25,783.99].entries()){const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(0,audio.currentTime+i*.16);gain.gain.linearRampToValueAtTime(.045,audio.currentTime+i*.16+.02);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+i*.16+.9);osc.connect(gain);gain.connect(audio.destination);osc.start(audio.currentTime+i*.16);osc.stop(audio.currentTime+i*.16+1);}}
$('#sound').onclick=()=>{
  const ctx=ensureAudio();if(!ctx){toast('Le son n’est pas disponible dans ce navigateur.');return;}
  if(!rain){const buffer=ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate),data=buffer.getChannelData(0);let last=0;for(let i=0;i<data.length;i++){last=(last+Math.random()*.04-.02)/1.02;data[i]=last*4;}rain=ctx.createBufferSource();rain.buffer=buffer;rain.loop=true;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1600;rainGain=ctx.createGain();rainGain.gain.value=0;rain.connect(filter);filter.connect(rainGain);rainGain.connect(ctx.destination);rain.start();}
  soundOn=!soundOn;rainGain.gain.setTargetAtTime(soundOn?.35:0,ctx.currentTime,.3);$('#sound').setAttribute('aria-pressed',String(soundOn));$('#sound').classList.toggle('playing',soundOn);toast(soundOn?'Un fond de pluie pour se concentrer.':'Le calme, tout simplement.');
};
