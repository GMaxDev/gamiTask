/// <reference types="vite/client" />
import {createIcons,Coffee,Sun,Moon,Plus,Minus,LocateFixed,Volume2,VolumeX,Settings2,RotateCcw,Play,Pause,Check,MousePointer2,Move,Leaf,Headphones,X,HelpCircle,Clock3,ArrowUpRight,ListChecks,Repeat,Coins,Trophy,Flame,Home,ShoppingBag,MessageCircle,ChevronDown,Send,Users} from 'lucide';
import {createCafe} from './scene.ts';
import type {SceneState} from './scene.ts';
import {createTimer,remainingSeconds,toggleTimer,resetTimer} from './timer.ts';
import {loadIdentity,cleanName,PALETTE} from './identity.ts';
import {loadLook,type Look} from './look.ts';
import {createEditor,EDITOR_ICONS} from './editor.ts';
import {connect,type Net} from './net.ts';
import {toCell} from './coords.ts';
import type {RoomKind} from './coords.ts';
import {homeDecision,myPrivateRoom} from './rooms.ts';
import type {Player,RoomSummary} from '@shared/types';
import {createTasks,setTasks,taskAdded,taskToggled,taskUpdated,taskDeleted,pending,cleanText,CATEGORIES} from './tasks.ts';
import {createProgress,setCoins,setXp,setStreak,unlock,setAchievements,levelInfo,ACHIEVEMENTS} from './progress.ts';
import {HATS,FURNITURE,SETS,createShop,setCosmetics,setFurniture,canPlace,takenCells,completeSets,toServerCell,item as shopItem} from './shop.ts';
import {createChat,decodeEntities} from './chat.ts';
import {createRoomPomo,applyState,applyTick,remainingAt,subtitle,format,DURATION} from './pomo.ts';
import './style.css';

const icons={...EDITOR_ICONS,Coffee,Sun,Moon,Plus,Minus,LocateFixed,Volume2,VolumeX,Settings2,RotateCcw,Play,Pause,Check,MousePointer2,Move,Leaf,Headphones,X,HelpCircle,Clock3,ArrowUpRight,ListChecks,Repeat,Coins,Trophy,Flame,Home,ShoppingBag,MessageCircle,ChevronDown,Send,Users};
const icon=(name: string,cls=''): string=>`<i data-lucide="${name}" class="${cls}" aria-hidden="true"></i>`;
// ponytail: `any` here saves typing every dataset/onclick/style access on raw DOM elements throughout this file.
const $=(s: string): any=>document.querySelector(s);
function drawIcons(){createIcons({icons,attrs:{'stroke-width':1.65}});}
function load(key: string,fallback: any): any{try{return JSON.parse(localStorage.getItem(key) as string)??fallback;}catch{return fallback;}}
function save(key: string,value: any){try{localStorage.setItem(key,JSON.stringify(value));}catch{/* The experience also works without persistent browser storage. */}}
const today=()=>new Date().toLocaleDateString('sv-SE');
let timer=createTimer(load('gamitask.timer',{})),stats=load('gamitask.stats',{});
const shop=createShop();// declared here: mountRoom() reads shop.placed / shop.hat before the shop block runs
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
        <button id="identity-chip" class="identity-chip" aria-label="Changer de pseudo"><span class="swatch-dot" id="identity-dot"></span><span id="identity-name"></span></button>
      </div>
      <div class="view-controls"><button id="follow" class="icon-button active" title="Activer ou désactiver le suivi du personnage" aria-label="Suivre le personnage" aria-pressed="true">${icon('locate-fixed')}</button><span class="divider"></span><button id="zoom-out" class="icon-button" aria-label="Dézoomer">${icon('minus')}</button><output id="zoom-value">100%</output><button id="zoom-in" class="icon-button" aria-label="Zoomer">${icon('plus')}</button><span class="divider"></span><button id="recenter" class="icon-button" title="Vue initiale" aria-label="Recentrer la vue">${icon('rotate-ccw')}</button></div>
      <div class="world-bottom"><div class="world-left"><div class="ambience-controls"><button id="light" class="ambience-button">${icon('sun')}<span>Lumière du jour</span></button><span class="divider"></span><button id="sound" class="ambience-button" aria-pressed="false">${icon('headphones')}<span>Pluie douce</span><span class="sound-bars"><b></b><b></b><b></b></span></button></div></div><button id="help" class="help-button" aria-label="Comment se déplacer">${icon('help-circle')}</button></div>
      <div class="timer-dock">
        <div class="timer-tabs-top" role="tablist" aria-label="Minuteur"><button role="tab" id="tab-solo" aria-selected="true" aria-controls="pane-solo">Solo</button><button role="tab" id="tab-room" aria-selected="false" aria-controls="pane-room">Avec la salle<span class="tab-dot" id="room-dot" hidden></span><span class="tab-count" id="room-count" hidden>0</span></button></div>
        <section class="timer-hud timer-card" aria-label="Pomodoro">
          <div id="pane-solo" role="tabpanel" aria-labelledby="tab-solo">
            <div class="timer-tabs" role="group" aria-label="Type de session"><button data-mode="focus" aria-pressed="true">Focus</button><button data-mode="short" aria-pressed="false">Pause</button><button data-mode="long" aria-pressed="false">Longue</button></div>
            <div class="timer-main">
              <span class="dial-mini"><svg viewBox="0 0 220 220" aria-hidden="true"><circle class="dial-track" cx="110" cy="110" r="97"/><circle id="dial-progress" cx="110" cy="110" r="97"/></svg><button id="start" class="primary" aria-label="Lancer ou mettre en pause">${icon('play')}<span>C’est parti</span></button></span>
              <span class="timer-readout"><output id="timer-value" aria-label="Temps restant">25:00</output><span id="session-label">Session de concentration</span><span id="timer-kicker" hidden>ON Y VA DOUCEMENT</span></span>
            </div>
            <button id="reset" class="icon-button" aria-label="Réinitialiser le minuteur">${icon('rotate-ccw')}</button><button id="settings" class="icon-button" aria-label="Régler les durées">${icon('settings-2')}</button>
          </div>
          <div id="pane-room" role="tabpanel" aria-labelledby="tab-room" hidden>
            <div class="timer-tabs phase-tabs" aria-label="Phase de la salle"><span data-phase="focus">Focus</span><span data-phase="short-break">Pause</span><span data-phase="long-break">Longue</span></div>
            <div class="timer-main">
              <span class="dial-mini"><svg viewBox="0 0 220 220" aria-hidden="true"><circle class="dial-track" cx="110" cy="110" r="97"/><circle id="room-dial-progress" cx="110" cy="110" r="97"/></svg><span class="dial-core" aria-hidden="true">${icon('users')}</span></span>
              <span class="timer-readout"><output id="room-value" aria-label="Temps restant dans la salle">25:00</output><span id="room-subtitle">Personne pour l’instant. Lance la session ?</span><span id="room-kicker">25 / 5 / 15 · SESSION 1</span></span>
            </div>
            <button id="room-join" class="primary pill" aria-label="Rejoindre la session">${icon('users')}<span>Rejoindre</span></button>
          </div>
        </section>
      </div>
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
  <dialog id="identity-dialog"><form id="identity-form" method="dialog"><div class="dialog-heading"><h2>On se présente ?</h2></div>
    <p>Un pseudo et une couleur, c’est tout ce qu’il faut pour entrer au café.</p>
    <label>Pseudo<input name="name" type="text" minlength="2" maxlength="20" required autocomplete="nickname" /></label>
    <div class="palette" role="radiogroup" aria-label="Couleur">${PALETTE.map((p,i)=>`<label class="swatch" style="--swatch:#${p.hex.toString(16).padStart(6,'0')}" title="${p.label}"><input type="radio" name="color" value="${p.hex}" ${i===0?'checked':''}/></label>`).join('')}</div>
    <button class="primary" type="submit">${icon('coffee')}<span>Entrer au café</span></button>
  </form></dialog>
  <div id="net-veil" class="net-veil" role="status"><span class="veil-label">${icon('coffee')}<span id="net-text">Connexion au café…</span></span></div>
`;
drawIcons();
// Who you are: kept locally, sent to the server at every `join`.
const uuid=()=>crypto.randomUUID?.()??`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const {identity,fresh}=loadIdentity(load('gamitask.identity',null),uuid);
function saveIdentity(){save('gamitask.identity',identity);renderIdentity();}
function renderIdentity(){$('#identity-name').textContent=identity.name||'Invité';($('#identity-dot') as HTMLElement).style.setProperty('--swatch',`#${identity.color.toString(16).padStart(6,'0')}`);}
function askIdentity():Promise<void>{
  const dialog=$('#identity-dialog') as HTMLDialogElement,form=$('#identity-form') as HTMLFormElement;
  (form.elements.namedItem('name') as HTMLInputElement).value=identity.name;
  for(const r of form.querySelectorAll<HTMLInputElement>('input[name=color]'))r.checked=Number(r.value)===identity.color;
  dialog.showModal();
  const input=form.elements.namedItem('name') as HTMLInputElement;
  input.setCustomValidity('');input.oninput=()=>input.setCustomValidity('');
  return new Promise(resolve=>{form.onsubmit=e=>{const name=cleanName(input.value);if(!name){e.preventDefault();input.setCustomValidity('Choisis un pseudo d’au moins 2 caractères.');input.reportValidity();return;}
    input.setCustomValidity('');identity.name=name;identity.color=Number((form.elements.namedItem('color') as RadioNodeList).value);saveIdentity();resolve();};});
}
($('#identity-dialog') as HTMLDialogElement).addEventListener('cancel',e=>{if(!identity.name)e.preventDefault();});// no way out of the very first hello
renderIdentity();

// Connection: the café is unreachable until the server answers, so a veil covers the room in the meantime.
const API_URL=(import.meta.env.VITE_API_URL as string|undefined)??'http://localhost:3001';
let net:Net;
let pendingHome=false,homeAsked=false;// a saved 'private' room is resolved into a real private room id once `rooms:list` arrives
const veil=$('#net-veil') as HTMLElement,veilText=$('#net-text') as HTMLElement;
function showVeil(text:string|null){veil.hidden=text===null;if(text)veilText.textContent=text;}
let ready={room:false,tasks:false};
function maybeReady(){if(ready.room&&ready.tasks&&!pendingHome)showVeil(null);}
async function start(){
  if(fresh){await askIdentity();look={...look,shirt:identity.color};saveLook();cafe?.setLook(look);}// the colour just chosen is the avatar's shirt
  if(room==='private')pendingHome=true;
  net=connect(API_URL,identity,'ocean');
  net.onStatus(s=>{
    if(s==='online'){ready={room:false,tasks:false};furnitureSeen=false;homeAsked=false;showVeil('Connexion au café…');}
    // le serveur retire le participant à la déconnexion : on ne garde ni « Quitter », ni l'état collectif, ni l'horloge de la salle
    if(s==='offline'){roomPomo.joined=false;renderRoomPomo();showVeil('Le café est injoignable, on réessaie…');}
    if(s==='replaced'){roomPomo.joined=false;renderRoomPomo();showVeil('Le café est ouvert dans un autre onglet.');}
  });
  bindServerEvents();
}
let toastTimeout: ReturnType<typeof setTimeout>;
let audio: any,rain: any,rainGain: any,soundOn=false;
function toast(message: string){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('#toast').classList.remove('visible'),4500);}
// Task 3 renames the HUD buttons; until then the café button still says data-room="public".
const btnRoom=(b: any): RoomKind=>b.dataset.room==='private'?'private':'cafe';
let cafe: any,room=load('gamitask.room','cafe');if(room!=='private')room='cafe';// a saved 'public' from before the garden means the café
let look: Look=loadLook(load('gamitask.look',null),identity.color,[]);
function saveLook(){save('gamitask.look',look);}
// Character editor: a sheet over the scene, the café avatar itself is the preview.
let editing=false,previewLook: Look|null=null;// what the sheet is showing, so a scene remount can rebuild it
const editor=createEditor($('#app') as HTMLElement,{
  onPreview(l){previewLook=l;cafe?.setLook(l);},
  onDone(l,name){look=l;saveLook();cafe?.setLook(l);identity.name=name;identity.color=l.shirt;saveIdentity();
    // the server owns the worn hat: equip first, so the `cosmetics:state` echoed by `look:update` already carries the new hat
    if(l.hat!==shop.hat){shop.hat=l.hat;net?.socket.emit('cosmetic:equip',{userId:identity.userId,hatId:l.hat});renderShop();}
    net?.socket.emit('look:update',{userId:identity.userId,look:l});// the server stores it and tells the room right away
    closeEditor();toast('C’est tout toi. Les autres te voient déjà ainsi.');},
  onExit(){cafe?.setLook(look);closeEditor();},
  resetView:()=>cafe?.resetView(),
});
// Room chat: the panel sits bottom-left above the ambience controls, so it fades and goes inert with the rest of the HUD.
const members=new Map<string,{name: string; color: number}>();
let sendTimes: number[]=[];
function allowLocal(){const now=Date.now();sendTimes=sendTimes.filter(t=>now-t<5000);if(sendTimes.length>=5)return false;sendTimes.push(now);return true;}
// Two short notes when someone calls your name, only if the ambience sound is on (the audio context is already unlocked then).
function mentionChime(){if(!soundOn||!audio||audio.state!=='running')return;
  for(const [i,freq] of [659.25,987.77].entries()){const osc=audio.createOscillator(),gain=audio.createGain(),t0=audio.currentTime+i*.13;
    osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(0,t0);gain.gain.linearRampToValueAtTime(.04,t0+.015);gain.gain.exponentialRampToValueAtTime(.001,t0+.34);
    osc.connect(gain);gain.connect(audio.destination);osc.start(t0);osc.stop(t0+.4);}}
const chat=createChat($('.world-left') as HTMLElement,{
  send(text){if(!net)return false;if(!allowLocal())return false;net?.socket.emit('chat',{text});return true;},
  typing(){net?.socket.emit('chat:typing');},
  emote(emoji){net?.socket.emit('chat:emote',{emoji});},
  members:()=>[...members].filter(([id])=>id!==net?.socket.id).map(([id,m])=>({id,...m})),
  myName:()=>identity.name,
  onMention:mentionChime,
});
chat.open();// the room's conversation is visible from the start; the round button folds it away
let chatRoomKnown=false;
const roomLabel=()=>room==='private'?'CHEZ TOI':'AU CAFÉ';
// `T` opens the chat from anywhere in the room, never while typing, editing the character or placing a piece.
document.addEventListener('keydown',e=>{
  if((e.key!=='t'&&e.key!=='T')||e.ctrlKey||e.metaKey||e.altKey||editing||placingId)return;
  const t=e.target as HTMLElement|null;
  if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable))return;
  e.preventDefault();chat.open();chat.focus();
});
drawIcons();
// The HUD is only faded out behind the sheet, so it stays tabbable and clickable without this. The world/canvas stays live: drag-rotate is part of editing.
const HUD_BEHIND_SHEET='.hud-top,.view-controls,.world-bottom,.timer-dock,#open-tasks,#tasks-drawer';
function hudInert(on: boolean){document.querySelectorAll(HUD_BEHIND_SHEET).forEach((e: any)=>{e.inert=on;});}
function openEditor(){
  if(editing||!cafe||switching||placingId)return;editing=true;
  openDrawer(false);($('.world') as HTMLElement).classList.add('editing');hudInert(true);
  editor.open(look,identity.name,shop.hats);cafe.enterEditor();
}
function closeEditor(){
  if(!editing)return;editing=false;($('.world') as HTMLElement).classList.remove('editing');hudInert(false);
  previewLook=null;editor.close();cafe?.exitEditor();($('#identity-chip') as HTMLElement).focus();// never leave focus inside the hidden sheet
}
$('#identity-chip').onclick=openEditor;($('#identity-chip') as HTMLElement).setAttribute('aria-label','Mon personnage');
let builtFurniture='',furnitureSeen=false;// what the current scene was baked with, and whether the server sent its first furniture snapshot
function mountRoom(){
  if(placingId)endPlacing();cafe?.dispose();$('#scene').innerHTML='';$('.world').classList.remove('evening');$('#light').innerHTML=icon('sun')+'<span>Lumière du jour</span>';
  document.querySelectorAll('[data-room]').forEach((b: any)=>b.setAttribute('aria-pressed',String(btnRoom(b)===room)));
  cafe=createCafe($('#scene'),onSceneState,{room,furniture:shop.placed,look:editing?previewLook??look:look});builtFurniture=JSON.stringify(shop.placed);
  cafe.onCell((col: number,row: number,arrived: boolean)=>{net?.socket.emit('move',{col,row});if(arrived)net?.socket.emit('position:save',{userId:identity.userId,col,row});});
  if(editing)cafe.enterEditor();// a remount mid-edit must come back to the mirror, not to walking mode
  drawIcons();$('#move-hint-room').textContent=room==='private'?'Bureau : boutique et aménagement':'Comptoir : passer commande';
}
// Iris wipe: a neutral veil grows from the button, the new room is built behind it, then the veil shrinks away.
let switching=false;
async function irisSwap(x: number,y: number,label: string,iconName: string,fn: () => void){
  const veil=$('#veil'),r=Math.hypot(innerWidth,innerHeight)*1.05,shut=`circle(0px at ${x}px ${y}px)`,open=`circle(${r}px at ${x}px ${y}px)`;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,timing={duration:reduced?0:650,easing:'cubic-bezier(.45,0,.2,1)',fill:'forwards'};
  $('#veil-text').textContent=label;$('#veil-icon').innerHTML=icon(iconName);drawIcons();
  // the disc's rim casts a soft shadow on the room: a transparent circle with a drop shadow, scaled in step with the clip
  const edge=$('#veil-edge');edge.style.left=`${x}px`;edge.style.top=`${y}px`;edge.style.width=edge.style.height=`${r*2}px`;
  // A hidden tab suspends rAF and Web Animations: never await them forever, or the veil covers the room until the tab comes back.
  const settle=(a: Animation)=>Promise.race([a.finished.catch(()=>{}),new Promise(r=>setTimeout(r,timing.duration+400))]).then(()=>{if(a.playState!=='finished')a.cancel();});
  const rim=(k: boolean)=>edge.animate([{transform:`translate(-50%,-50%) scale(${k?0:1})`},{transform:`translate(-50%,-50%) scale(${k?1:0})`}],timing);
  veil.classList.add('cover');rim(true);await settle(veil.animate([{clipPath:shut},{clipPath:open}],timing));
  fn();await Promise.race([new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r as any))),new Promise(r=>setTimeout(r,120))]);// let the new room draw its first frame
  rim(false);await settle(veil.animate([{clipPath:open},{clipPath:shut}],timing));veil.classList.remove('cover');for(const a of edge.getAnimations())a.cancel();edge.style.width=edge.style.height='0px';
}
// Rooms: the server owns them. The click plays the iris and remounts, then `room:info` confirms (or corrects) where we really are.
let rooms: RoomSummary[]=[];
let homeTimer: ReturnType<typeof setTimeout>|undefined;
function switchServerRoom(next:RoomKind){
  if(next!=='private'){pendingHome=false;clearTimeout(homeTimer);maybeReady();net.socket.emit('room:switch',{roomId:'ocean'});return;}
  const mine=myPrivateRoom(rooms,identity.userId);
  if(mine){pendingHome=false;clearTimeout(homeTimer);maybeReady();net.socket.emit('room:switch',{roomId:mine.id});}
  // a refused creation is silent (guest rule, rate limit, stale row): give up after a few seconds rather than wait forever
  else if(!homeAsked){pendingHome=true;homeAsked=true;net.socket.emit('room:create-private',{name:`Chez ${identity.name}`});
    homeTimer=setTimeout(()=>{if(!myPrivateRoom(rooms,identity.userId))abandonHome();},4000);}
}
function abandonHome(){
  clearTimeout(homeTimer);pendingHome=false;homeAsked=false;toast('Ta pièce n’a pas pu être créée.');
  if(room==='private'){room='cafe';save('gamitask.room',room);try{mountRoom();syncScene();renderShop();}catch(error){console.error(error);}}
  maybeReady();
}
document.querySelectorAll('[data-room]').forEach((b: any)=>b.onclick=async()=>{
  if(b.dataset.room===room||switching||editing)return;switching=true;
  try{
    const r=b.getBoundingClientRect(),next=btnRoom(b),home=next==='private';
    await irisSwap(r.left+r.width/2,r.top+r.height/2,home?'Chez moi':'Le café Petit Jour',home?'home':'coffee',()=>{room=next;save('gamitask.room',room);try{mountRoom();syncScene();renderShop();}catch(error){console.error(error);}});
    switchServerRoom(next);toast(home?'Bienvenue chez toi. Installe-toi.':'Retour au café.');
  }finally{switching=false;}
});
function onSceneState(state: SceneState){
    if(state.seated)toast('Tu t’installes. Prends le temps qu’il faut.');
    if('hover' in state){const h=$('#hint');if(!state.hover)h.hidden=true;else{const r=$('.world').getBoundingClientRect(),t=state.hover.task,cat=t&&catOf(t.category),esc=(v: string)=>v.replace(/[&<>]/g,(c: string)=>({'&':'&amp;','<':'&lt;','>':'&gt;'} as Record<string,string>)[c]);
      h.innerHTML=t?`<span class="cat-dot" style="--cat:${cat?cat.color:'#d8d3c3'}"></span><strong>${esc(t.text)}</strong><small>${cat?cat.label:'Sans catégorie'}${t.type==='daily'?' · chaque jour':''} · cliquer pour la retrouver</small>`:`<span class="cat-dot" style="--cat:#d2a754"></span><strong>${state.hover.hotspot!.title}</strong><small>${state.hover.hotspot!.sub}</small>`;
      h.hidden=false;h.style.left=`${state.hover.x-r.left}px`;h.style.top=`${state.hover.y-r.top}px`;}}
    if(state.hotspot==='mirror')openEditor();
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
start();// the room is built behind the veil, then the server fills it
$('#zoom-in').onclick=()=>cafe?.zoomIn();$('#zoom-out').onclick=()=>cafe?.zoomOut();$('#recenter').onclick=()=>cafe?.recenter();$('#follow').onclick=()=>cafe?.setFollow();
$('#light').onclick=()=>{if(!cafe)return;const evening=cafe.toggleLight();$('#light').innerHTML=icon(evening?'moon':'sun')+`<span>${evening?'Douce soirée':'Lumière du jour'}</span>`;$('.world').classList.toggle('evening',evening);drawIcons();};
$('#help').onclick=()=>$('#help-dialog').showModal();
$('#progress-chip').onclick=()=>{net.socket.emit('profile:request',{socketId:null});($('#progress-dialog') as HTMLDialogElement).showModal();};
// The task list lives in a drawer: opened from the HUD button, the counter in the room, or a slate.
let drawerTab='tasks';
function showTab(tab: string){drawerTab=tab;document.querySelectorAll('[data-tab]').forEach((b: any)=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));$('#tab-tasks').hidden=tab!=='tasks';$('#tab-shop').hidden=tab!=='shop';$('#drawer-title').innerHTML=tab==='shop'?'La petite<br>boutique.':'Mes petites<br>tâches.';if(tab==='shop')renderShop();}
function openDrawer(open=true,tab=drawerTab){$('#tasks-drawer').classList.toggle('open',open);$('#tasks-drawer').setAttribute('aria-hidden',String(!open));$('#open-tasks').setAttribute('aria-expanded',String(open));showTab(open?tab:drawerTab);if(open&&tab==='tasks')setTimeout(()=>$('#task-text').focus(),250);}
document.querySelectorAll('[data-tab]').forEach((b: any)=>b.onclick=()=>showTab(b.dataset.tab));
$('#open-tasks').onclick=()=>{if(!editing)openDrawer(!$('#tasks-drawer').classList.contains('open'));};
$('.drawer-close').onclick=()=>openDrawer(false);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!editing&&$('#tasks-drawer').classList.contains('open'))openDrawer(false);});
document.querySelectorAll('.close-dialog').forEach((b: any)=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',(e: any)=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));

// Progression: coins, XP, streak and achievements — the server owns the rules, the client only renders them.
const progress=createProgress();
let wearNext:string|null=null;// a hat just bought, worn as soon as the server confirms we own it
function renderShop(){
  const home=room==='private',done=completeSets(shop);
  $('#shop-coins').textContent=String(progress.coins);$('#shop-where').textContent=home?'— chez toi':'— à installer chez toi';
  $('#shop-hats').innerHTML=HATS.map(h=>{const owned=shop.hats.includes(h.id),worn=shop.hat===h.id;
    return `<li class="${owned?'owned':''}"><span class="shop-emoji">${h.emoji}</span><span class="shop-name">${h.name}<small>${owned?(worn?'Porté':'À toi'):`${h.price} pièces`}</small></span><span class="shop-actions">${owned?`<button data-hat="${h.id}">${worn?'Retirer':'Porter'}</button>`:`<button data-buy="${h.id}" ${progress.coins<h.price?'disabled':''}>Acheter</button>`}</span></li>`;}).join('');
  $('#shop-furniture').innerHTML=FURNITURE.map(f=>{const owned=shop.furniture.includes(f.id),placed=f.id in shop.placed,set=SETS.find(s=>s.id===f.set)!;
    const action=!owned?`<button data-buy-furniture="${f.id}" ${progress.coins<f.price?'disabled':''}>Acheter</button>`:!home?'<small>chez toi</small>':placed?`<button data-move="${f.id}">Déplacer</button><button data-unplace="${f.id}" class="quiet">Ranger</button>`:`<button data-place="${f.id}">Placer</button>`;
    return `<li class="${owned?'owned':''}"><span class="shop-emoji">${f.emoji}</span><span class="shop-name">${f.name}<small>${owned?(placed?'Installé':'Rangé'):`${f.price} pièces`} · set ${set.emoji}</small></span><span class="shop-actions">${action}</span></li>`;}).join('');
  $('#shop-sets').innerHTML=SETS.map(s=>{const have=s.items.filter(id=>shop.furniture.includes(id)).length,full=done.includes(s);
    return `<li class="${full?'owned':''}"><span class="shop-emoji">${s.emoji}</span><span class="shop-name">${s.name}<small>${s.desc} · ${have}/${s.items.length}</small></span></li>`;}).join('');
}
$('#tab-shop').addEventListener('click',(e: Event)=>{
  const b=(e.target as HTMLElement).closest('button');if(!b)return;const d=b.dataset;
  if(d.buy)net.socket.emit('shop:buy',{userId:identity.userId,itemId:d.buy});
  else if(d.buyFurniture)net.socket.emit('furniture:buy',{userId:identity.userId,itemId:d.buyFurniture});
  else if(d.hat){const hatId=shop.hat===d.hat?null:d.hat;net.socket.emit('cosmetic:equip',{userId:identity.userId,hatId});
    shop.hat=hatId;look={...look,hat:hatId};saveLook();cafe?.setLook(look);renderShop();}// the server answers `player-hat` to the others only, so we apply it here
  else if(d.place||d.move)startPlacing(d.place||d.move!);
  else if(d.unplace)net.socket.emit('furniture:toggle-place',{userId:identity.userId,itemId:d.unplace});
});
// Placement: the room shows its free tiles, you click one, then confirm. Moving a piece starts from where it stands.
function startPlacing(id:string){
  if(room!=='private'||!cafe||editing)return;placingId=id;placingCell=null;openDrawer(false);
  $('#place-text').innerHTML=`Clique une case pour ${shop.placed[id]?'déplacer':'poser'} <strong>${shopItem(id)!.emoji} ${shopItem(id)!.name}</strong>`;($('#place-ok') as HTMLButtonElement).disabled=true;($('#place-bar') as HTMLElement).hidden=false;drawIcons();
  cafe.startPlacing(id,shop.placed[id]??null,takenCells(shop,id));
}
$('#place-ok').onclick=()=>{if(!placingId||!placingCell||!canPlace(shop,placingId,placingCell))return;
  net.socket.emit(shop.placed[placingId]?'furniture:move':'furniture:place',{userId:identity.userId,itemId:placingId,...toServerCell(placingCell)});endPlacing();};
function endPlacing(){cafe?.stopPlacing();placingId=null;placingCell=null;$('#place-bar').hidden=true;}
$('#place-cancel').onclick=()=>{endPlacing();openDrawer(true,'shop');};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&placingId){endPlacing();openDrawer(true,'shop');}});
// furniture is part of the baked room, so a change rebuilds your room in place, no iris
function rearrange(message: string){if(switching)return;try{mountRoom();syncScene();}catch(error){console.error(error);}toast(message);renderShop();}
let toastQueue=Promise.resolve();
const later=(fn: () => void,ms: number)=>{toastQueue=toastQueue.then(()=>new Promise<void>(r=>setTimeout(()=>{fn();r();},ms)));};// one toast at a time
function renderProgress(){
  const {level,into,span}=levelInfo(progress),pct=Math.round(into/span*100);
  $('#coins').textContent=progress.coins;$('#coins-big').textContent=progress.coins;$('#level-badge').textContent=`Niveau ${level}`;$('#level-big').textContent=`Niveau ${level}`;$('#xp-fill-big').style.width=`${pct}%`;
  $('#achievements-list').innerHTML=ACHIEVEMENTS.map(a=>`<li class="${progress.achievements.includes(a.key)?'unlocked':''}"><span>${a.icon}</span><strong>${a.label}</strong><small>${a.desc}</small></li>`).join('');
  $('#xp-fill').style.width=`${pct}%`;$('.xp-bar').setAttribute('aria-valuenow',pct);$('#xp-label').textContent=`${into} / ${span} XP`;
  $('#streak').hidden=progress.streak<2;$('#streak-count').textContent=progress.streak;
  $('#achievements-count').textContent=`${progress.achievements.length}/${ACHIEVEMENTS.length}`;
}
function rewardPomodoro(){net.socket.emit('pomodoro:complete',{userId:identity.userId});}
renderProgress();
// Everything the server says, applied as-is.
function bindServerEvents(){
  const s=net.socket;
  // a remote's own hat counts as owned, so validation never strips what the server already accepted
  const remote=(p: Player)=>({name:p.name,color:p.color,hat:p.hat??null,look:p.look?loadLook(p.look,p.color,p.hat?[p.hat]:[]):undefined,col:p.col,row:p.row,state:p.state});
  s.on('room-state',players=>{cafe?.clearRemotes();members.clear();for(const p of players){members.set(p.id,{name:p.name,color:p.color});cafe?.addRemote(p.id,remote(p));}
    if(!chatRoomKnown){chatRoomKnown=true;chat.setRoom(roomLabel());}ready.room=true;maybeReady();
    // the server spawns us at a fixed tile and resets our state: tell everyone where we really stand, and what we're doing
    const at=cafe?.playerPosition()??{x:0,z:0};s.emit('move',toCell(at.x,at.z,room));s.emit('avatar-state',{state:avatarState()});});
  s.on('player-joined',p=>{members.set(p.id,{name:p.name,color:p.color});cafe?.addRemote(p.id,remote(p));});
  s.on('player-moved',({id,col,row})=>cafe?.moveRemote(id,col,row));
  s.on('player-state',({id,state})=>cafe?.setRemoteState(id,state));
  s.on('player-hat',({id,hat})=>cafe?.setRemoteHat(id,hat));
  s.on('player-look',({id,look})=>cafe?.setRemoteLook(id,loadLook(look,look.shirt,look.hat?[look.hat]:[])));
  s.on('player-left',({id})=>{members.delete(id);cafe?.removeRemote(id);});
  s.on('chat-message',msg=>{const mine=msg.id===s.id,text=decodeEntities(msg.text);chat.add({...msg,mine});if(mine)cafe?.sayMe(msg.name,msg.color,text);else cafe?.say(msg.id,msg.name,msg.color,text);});
  s.on('chat:typing',({id,name})=>chat.typing(id,name));
  s.on('chat:emote',({id,emoji})=>{if(id===s.id)cafe?.emoteMe(emoji);else cafe?.emote(id,emoji);});
  s.on('rooms:list',({rooms:list})=>{rooms=list;if(!pendingHome)return;if(homeDecision(rooms,identity.userId,homeAsked)!=='wait')switchServerRoom('private');});
  s.on('pomo:state',st=>{applyState(roomPomo,st,Date.now());renderRoomPomo();});
  s.on('pomo:tick',t=>{applyTick(roomPomo,t,Date.now());renderRoomPomo();});
  s.on('pomo:phase',({phase,remaining,session})=>{const was=roomPomo.phase;
    applyState(roomPomo,{phase,remaining,session,running:roomPomo.participants>0,participants:roomPomo.participants},Date.now());
    if(roomPomo.joined&&was==='focus')toast('Focus terminé avec la salle. Les pièces arrivent.');
    renderRoomPomo();});
  s.on('room:info',({roomId})=>{roomPomo=createRoomPomo();renderRoomPomo();// une autre salle, un autre pomodoro : on repart de zéro et la participation s'arrête
    if(pendingHome)return;// still on the way home: the server room is only a stop-over, no need to rebuild twice
    const isHome=rooms.find(r=>r.id===roomId)?.isPrivate??false;
    if(isHome!==(room==='private')){room=isHome?'private':'cafe';save('gamitask.room',room);try{mountRoom();syncScene();renderShop();}catch(error){console.error(error);}}
    chatRoomKnown=true;chat.setRoom(roomLabel());});
  s.on('tasks:state',({tasks:list,coins})=>{setTasks(tasks,list);setCoins(progress,coins);ready.tasks=true;maybeReady();renderTasks();renderProgress();syncScene();});
  s.on('task:added',t=>{taskAdded(tasks,t);renderTasks();syncScene();});
  s.on('task:toggled',({taskId,done,coins})=>{const t=taskToggled(tasks,taskId,done);const before=progress.coins;setCoins(progress,coins);renderTasks();renderProgress();syncScene();
    if(t&&done)toast(`${t.type==='daily'?'Fait pour aujourd’hui.':'C’est fait.'}${coins>before?` +${coins-before} pièces.`:''}`);});
  s.on('task:updated',({taskId,text,category})=>{taskUpdated(tasks,taskId,text,category);renderTasks();syncScene();});
  s.on('task:deleted',({taskId})=>{taskDeleted(tasks,taskId);renderTasks();syncScene();});
  s.on('coins:update',({coins})=>{setCoins(progress,coins);renderProgress();renderShop();});
  s.on('xp:update',u=>{const before=progress.level;setXp(progress,u);renderProgress();if(u.levelUp&&u.level>before)later(()=>toast(`✨ Niveau ${u.level} ! Le café te va de mieux en mieux.`),2600);});
  s.on('streak:update',({streak,bonus})=>{setStreak(progress,streak);renderProgress();toast(`Une petite victoire de plus.${bonus>5?` Série ×${streak}.`:''}`);});
  s.on('achievement:unlocked',a=>{if(unlock(progress,a.key)){renderProgress();later(()=>toast(`${a.icon} Succès : ${a.label} — ${a.desc}`),2600);}});
  s.on('profile:data',d=>{setAchievements(progress,d.achievements);setStreak(progress,d.streak);renderProgress();});
  s.on('room:full',()=>{if(ready.room){toast('Cette pièce est pleine pour le moment.');return;}// a refused switch leaves us where we are, no veil
    showVeil('Le café est plein pour le moment, on réessaie dans un instant…');setTimeout(()=>net.socket.emit('join',{name:identity.name,color:identity.color,col:0,row:0,userId:identity.userId,roomId:net.roomId()}),5000);});
  // `cosmetics:state` may carry the hat we owned before the purchase, so the equip waits for the state that lists the new one.
  s.on('cosmetics:state',u=>{setCosmetics(shop,u);
    if(wearNext&&shop.hats.includes(wearNext)){shop.hat=wearNext;net.socket.emit('cosmetic:equip',{userId:identity.userId,hatId:wearNext});wearNext=null;}
    look=loadLook(u.look??look,identity.color,shop.hats);look={...look,hat:shop.hat};saveLook();if(!editing)cafe?.setLook(look);renderShop();});// the server owns the look, localStorage is only a cache; mid-edit the sheet owns the avatar
  s.on('shop:bought',({itemId})=>{const it=shopItem(itemId);if(it)toast(`${it.emoji} ${it.name} est à toi.`);if(HATS.some(h=>h.id===itemId))wearNext=itemId;});
  s.on('furniture:bought',({itemId})=>{const it=shopItem(itemId);if(it)toast(`${it.emoji} ${it.name} t’attend chez toi.`);});
  s.on('furniture:state',u=>{const before=JSON.stringify(shop.placed);setFurniture(shop,u);renderShop();const now=JSON.stringify(shop.placed);
    // the first snapshot after a (re)connect is not a move: rebuild silently if the room was baked without it, never toast
    if(!furnitureSeen){furnitureSeen=true;if(room==='private'&&now!==builtFurniture){try{mountRoom();syncScene();}catch(error){console.error(error);}}return;}
    if(room==='private'&&now!==before)rearrange('C’est posé.');});
}

function persistTimer(){save('gamitask.timer',timer);}
let lastRunning: boolean|null=null,lastMode: string|null=null,lastShown: string|null=null;
const avatarState=():'idle'|'focus'|'pause'|'collective'=>roomPomo.joined?'collective':timer.endAt!==null?(timer.mode==='focus'?'focus':'pause'):'idle';
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
  // while we sit in the room's session it owns the wall clock and the tab title: one source per tick, never both
  if(!roomPomo.joined&&document.title!==title)document.title=title;
  $('#dial-progress').style.strokeDashoffset=609.47*(1-remaining/(timer.durations[timer.mode]*60));if(!roomPomo.joined)cafe?.setClock(1-remaining/(timer.durations[timer.mode]*60),running);
  if(lastRunning!==running||lastMode!==timer.mode){
    $('#start').innerHTML=icon(running?'pause':'play')+`<span>${running?'Faire une pause':remaining<timer.durations[timer.mode]*60?'Reprendre':timer.mode==='focus'?'C’est parti':'Prendre une pause'}</span>`;
    $('#timer-kicker').textContent=running?(timer.mode==='focus'?'UN PETIT PAS À LA FOIS':'PRENDS UNE RESPIRATION'):'ON Y VA DOUCEMENT';
    $('#session-label').textContent=timer.mode==='focus'?'Session de concentration':timer.mode==='short'?'Une petite respiration':'Une pause bien méritée';
    document.querySelectorAll('[data-mode]').forEach((b: any)=>{b.classList.toggle('selected',b.dataset.mode===timer.mode);b.setAttribute('aria-pressed',String(b.dataset.mode===timer.mode));});
    $('.timer-card').classList.toggle('running',running);drawIcons();lastRunning=running;lastMode=timer.mode;
    net?.socket.emit('avatar-state',{state:avatarState()});
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

// Pomodoro de la salle : le serveur tient l'horloge, on l'affiche et on extrapole entre deux ticks.
let roomPomo=createRoomPomo(),timerTab: 'solo'|'room'=load('gamitask.timerTab','solo')==='room'?'room':'solo';
let lastRoomShown: string|null=null,lastRoomJoined: boolean|null=null;
function selectTab(tab: 'solo'|'room'){
  timerTab=tab;save('gamitask.timerTab',tab);
  $('#tab-solo').setAttribute('aria-selected',String(tab==='solo'));$('#tab-room').setAttribute('aria-selected',String(tab==='room'));
  $('#pane-solo').hidden=tab!=='solo';$('#pane-room').hidden=tab!=='room';
}
function renderRoomPomo(){
  const remaining=remainingAt(roomPomo,Date.now()),text=format(remaining),fraction=1-remaining/DURATION[roomPomo.phase];
  if(text!==lastRoomShown){$('#room-value').textContent=text;lastRoomShown=text;}
  $('#room-dial-progress').style.strokeDashoffset=609.47*fraction;
  document.querySelectorAll('[data-phase]').forEach((s: any)=>s.classList.toggle('selected',s.dataset.phase===roomPomo.phase));
  $('#room-subtitle').textContent=subtitle(roomPomo,[]);
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
    cafe?.setClock(fraction,roomPomo.running);
    const title=`${text} · Avec la salle — gamitask`;if(document.title!==title)document.title=title;
  }
}
$('#tab-solo').onclick=()=>selectTab('solo');$('#tab-room').onclick=()=>selectTab('room');selectTab(timerTab);
$('#room-join').onclick=()=>{
  if(!net)return;// sans serveur il n'y a pas de session de salle : ne rien promettre à l'écran
  if(!roomPomo.joined){
    net.socket.emit('pomo:join');roomPomo.joined=true;
    if(timer.endAt!==null){toggleTimer(timer);persistTimer();lastRunning=null;renderTimer();}// une seule session à la fois : le solo se met en pause
  } else {net.socket.emit('pomo:leave');roomPomo.joined=false;}
  net.socket.emit('avatar-state',{state:avatarState()});renderRoomPomo();
};
setInterval(()=>{renderTimer();renderRoomPomo();},250);document.addEventListener('visibilitychange',renderTimer);renderTimer();renderRoomPomo();

// Tasks: the server holds the list, the client mirrors it as little order slips in the café.
const tasks=createTasks();
let newCategory: string|null=null;
const catOf=(id: string|null)=>CATEGORIES.find(c=>c.id===id);
function syncScene(){cafe?.setTasks(pending(tasks));}
function renderTasks(){
  const list=$('#task-list'),todo=pending(tasks).length;list.innerHTML='';
  for(const t of tasks.list){
    const li=document.createElement('li');li.dataset.id=t.id;li.className=t.done?'done':'';const cat=catOf(t.category);
    li.innerHTML=`<button class="check-button" aria-label="${t.done?'Reprendre':'Terminer'} : ${t.text}" aria-pressed="${t.done}">${icon('check')}</button><button class="cat-dot" style="--cat:${cat?cat.color:'#d8d3c3'}" title="Catégorie : ${cat?cat.label:'aucune'} (cliquer pour changer)" aria-label="Changer la catégorie"></button><span class="task-text" contenteditable="plaintext-only" spellcheck="false">${t.text.replace(/[&<>]/g,(c: string)=>({'&':'&amp;','<':'&lt;','>':'&gt;'} as Record<string,string>)[c])}</span>${t.type==='daily'?`<span class="daily-badge" title="Chaque jour">${icon('repeat')}</span>`:''}<button class="icon-button remove-task" aria-label="Supprimer">${icon('x')}</button>`;
    list.append(li);
  }
  $('#tasks-empty').hidden=tasks.list.length>0;$('#tasks-count').textContent=todo?`${todo} à faire`:tasks.list.length?'Tout est fait':'';
  document.querySelectorAll('#task-cats button').forEach((b: any)=>b.setAttribute('aria-pressed',String(b.dataset.cat===newCategory)));
  drawIcons();
}
$('#task-cats').onclick=(e: any)=>{const b=e.target.closest('[data-cat]');if(!b)return;newCategory=newCategory===b.dataset.cat?null:b.dataset.cat;renderTasks();$('#task-text').focus();};
$('#task-form').onsubmit=(e: any)=>{e.preventDefault();const text=cleanText(($('#task-text') as HTMLInputElement).value);if(!text)return;
  net.socket.emit('task:add',{userId:identity.userId,text,category:newCategory,type:($('#task-daily') as HTMLInputElement).checked?'daily':'task'});($('#task-text') as HTMLInputElement).value='';};
$('#task-list').addEventListener('click',(e: Event)=>{
  const li=(e.target as HTMLElement).closest('li');if(!li)return;const id=li.dataset.id!;const target=e.target as HTMLElement;
  if(target.closest('.check-button'))net.socket.emit('task:toggle',{userId:identity.userId,taskId:id});
  else if(target.closest('.cat-dot')){const t=tasks.list.find(t=>t.id===id);if(!t)return;const i=CATEGORIES.findIndex(c=>c.id===t.category);net.socket.emit('task:update',{userId:identity.userId,taskId:id,text:t.text,category:i+1<CATEGORIES.length?CATEGORIES[i+1].id:null});}
  else if(target.closest('.remove-task'))net.socket.emit('task:delete',{userId:identity.userId,taskId:id});
});
$('#task-list').addEventListener('keydown',(e: any)=>{if(e.target.matches('.task-text')&&e.key==='Enter'){e.preventDefault();e.target.blur();}});
$('#task-list').addEventListener('focusout',(e: Event)=>{const el=e.target as HTMLElement;if(!el.matches('.task-text'))return;const id=el.closest('li')!.dataset.id!;const t=tasks.list.find(t=>t.id===id);const text=cleanText(el.textContent);
  if(!t||!text){if(t)el.textContent=t.text;return;}if(text!==t.text)net.socket.emit('task:update',{userId:identity.userId,taskId:id,text,category:t.category});});
renderTasks();

// Optional generated rain: no remote audio, tracking, or autoplay.
function ensureAudio(){try{audio??=new (window.AudioContext||(window as any).webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{});return audio;}catch{return null;}}
function chime(){if(!audio||audio.state!=='running')return;for(const [i,freq] of [523.25,659.25,783.99].entries()){const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(0,audio.currentTime+i*.16);gain.gain.linearRampToValueAtTime(.045,audio.currentTime+i*.16+.02);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+i*.16+.9);osc.connect(gain);gain.connect(audio.destination);osc.start(audio.currentTime+i*.16);osc.stop(audio.currentTime+i*.16+1);}}
$('#sound').onclick=()=>{
  const ctx=ensureAudio();if(!ctx){toast('Le son n’est pas disponible dans ce navigateur.');return;}
  if(!rain){const buffer=ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate),data=buffer.getChannelData(0);let last=0;for(let i=0;i<data.length;i++){last=(last+Math.random()*.04-.02)/1.02;data[i]=last*4;}rain=ctx.createBufferSource();rain.buffer=buffer;rain.loop=true;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1600;rainGain=ctx.createGain();rainGain.gain.value=0;rain.connect(filter);filter.connect(rainGain);rainGain.connect(ctx.destination);rain.start();}
  soundOn=!soundOn;rainGain.gain.setTargetAtTime(soundOn?.35:0,ctx.currentTime,.3);$('#sound').setAttribute('aria-pressed',String(soundOn));$('#sound').classList.toggle('playing',soundOn);toast(soundOn?'Un fond de pluie pour se concentrer.':'Le calme, tout simplement.');
};
