/// <reference types="vite/client" />
import {createIcons,Coffee,Sun,Moon,Plus,Minus,LocateFixed,Volume2,VolumeX,Settings2,RotateCcw,Play,Pause,Check,MousePointer2,Move,Leaf,Headphones,X,HelpCircle,Clock3,ArrowUpRight,ListChecks,Repeat,Coins,Trophy,Flame,Home,ShoppingBag,MessageCircle,ChevronDown,Send,Users,Smile,LogOut,UserCog,Twitch,Link2,Unlink,UserX,Calendar} from 'lucide';
import {createCafe} from './scene.ts';
import type {SceneState} from './scene.ts';
import {createTimer,remainingSeconds,toggleTimer,resetTimer} from './timer.ts';
import {loadIdentity,cleanName,PALETTE} from './identity.ts';
import {loadLook,randomLook,type Look} from './look.ts';
import {createEditor,EDITOR_ICONS} from './editor.ts';
import {createWorkshop,WORKSHOP_ICONS} from './workshop.ts';
import {ensureCsg,csgReady,needsCsg} from './recipe.ts';
import {createBoard} from './board.ts';
import {connect,type Net} from './net.ts';
import {toCell,DIMS} from './coords.ts';
import type {RoomKind} from './coords.ts';
import {homeDecision,kindOfRoomId,myPrivateRoom,PUBLIC_IDS} from './rooms.ts';
import type {Player,RoomSummary} from '@shared/types';
import {createTasks,setTasks,taskAdded,taskUpdated,taskDeleted,pending,cleanText,CATEGORIES,KIND_LABELS,DIFFICULTY_HINT,TINT_LABELS,DAY_LABELS,DIFFICULTIES,visible,remaining,toggleDay,newTaskPayload,taskScored,cleanChecklistItem} from './tasks.ts';
import {createProgress,setCoins,setXp,setStreak,setEnergy,setExhausted,unlock,setAchievements,levelInfo,ACHIEVEMENTS} from './progress.ts';
import {tint,isDue} from '../../server/src/scoring.ts';
import {HATS,FURNITURE,SETS,createShop,setCosmetics,setFurniture,setCatalog,canPlace,takenCells,completeSets,toServerCell,item as shopItem} from './shop.ts';
import {createChat,decodeEntities} from './chat.ts';
import {createRoomPomo,applyState,applyTick,remainingAt,subtitle,format,DURATION} from './pomo.ts';
import {verifyToken,loginWithGoogle,renderGoogleButton,startTwitchLink,unlinkTwitch,getMyChatters} from './auth.ts';
import './style.css';

const icons={...EDITOR_ICONS,...WORKSHOP_ICONS,Coffee,Sun,Moon,Plus,Minus,LocateFixed,Volume2,VolumeX,Settings2,RotateCcw,Play,Pause,Check,MousePointer2,Move,Leaf,Headphones,X,HelpCircle,Clock3,ArrowUpRight,ListChecks,Repeat,Coins,Trophy,Flame,Home,ShoppingBag,MessageCircle,ChevronDown,Send,Users,Smile,LogOut,UserCog,Twitch,Link2,Unlink,UserX,Calendar};
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
        <div class="hud-zone hud-left">
          <a class="brand chip" href="/" aria-label="gamitask, accueil"><span class="brand-mark">${icon('coffee')}</span><span>gami<span class="brand-light">task</span></span></a>
          <div class="chip-group room-switch" role="group" aria-label="Changer de salle"><button class="chip" data-room="cafe" aria-pressed="true">${icon('coffee')}<span>Le café</span><span class="room-count" id="count-cafe" hidden>0</span></button><button class="chip" data-room="garden" aria-pressed="false">${icon('leaf')}<span>Le jardin</span><span class="room-count" id="count-garden" hidden>0</span></button><button class="chip" data-room="private" aria-pressed="false">${icon('home')}<span>Chez moi</span></button></div>
        </div>
        <div class="hud-zone hud-center"><div class="chip-group progress-group">
          <button id="progress-chip" class="chip progress" aria-label="Ma progression" title="Ma progression">
            <span class="coins">${icon('coins')}<strong id="coins">0</strong></span><span class="level-badge" id="level-badge">Niveau 0</span><span class="streak" id="streak" hidden>${icon('flame')}<span id="streak-count">0</span></span>
            <span class="xp-bar" role="progressbar" aria-label="Expérience" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="xp-fill"></span></span>
            <span class="energy-bar" role="progressbar" aria-label="Énergie" aria-valuemin="0" aria-valuemax="50" aria-valuenow="50" title="Énergie"><span id="energy-fill"></span></span>
          </button>
        </div></div>
        <div class="hud-zone hud-right">
          <details class="identity-menu" id="identity-menu"><summary id="identity-chip" class="chip" aria-label="Mon compte"><span class="swatch-dot" id="identity-dot"></span><span id="identity-name"></span><span id="role-badge" class="role-badge" hidden></span><span class="chev">${icon('chevron-down')}</span></summary>
            <div class="menu" role="menu"><button id="me-edit" role="menuitem">${icon('smile')}Mon personnage</button><button id="account-button" role="menuitem" hidden>${icon('user-cog')}Mon compte</button><button id="guests-button" role="menuitem" hidden>${icon('user-x')}Gérer ma pièce</button><button id="workshop-btn" role="menuitem" hidden>${icon('hammer')}Atelier</button><hr><button id="logout-button" role="menuitem" class="danger">${icon('log-out')}Se déconnecter</button></div></details>
          <div class="chip-group view-controls"><button id="follow" class="chip icon active" title="Activer ou désactiver le suivi du personnage" aria-label="Suivre le personnage" aria-pressed="true">${icon('locate-fixed')}</button><span class="divider"></span><button id="zoom-out" class="chip icon" aria-label="Dézoomer">${icon('minus')}</button><output id="zoom-value">100%</output><button id="zoom-in" class="chip icon" aria-label="Zoomer">${icon('plus')}</button><span class="divider"></span><button id="recenter" class="chip icon" title="Vue initiale" aria-label="Recentrer la vue">${icon('rotate-ccw')}</button></div>
        </div>
      </div>
      <div class="world-bottom"><div class="world-left"><div class="chip-group ambience-controls"><button id="light" class="chip">${icon('sun')}<span>Lumière du jour</span></button><button id="sound" class="chip" aria-pressed="false">${icon('headphones')}<span>Pluie douce</span><span class="sound-bars"><b></b><b></b><b></b></span></button><span class="divider"></span><button id="help" class="chip icon" aria-label="Comment se déplacer" title="Comment se déplacer">${icon('help-circle')}</button></div></div></div>
      <div class="timer-dock">
        <div class="timer-tabs-top" role="tablist" aria-label="Minuteur"><button class="chip" role="tab" id="tab-solo" aria-selected="true" aria-controls="pane-solo">Solo</button><button class="chip" role="tab" id="tab-room" aria-selected="false" aria-controls="pane-room">Avec la salle<span class="tab-dot" id="room-dot" hidden></span><span class="tab-count" id="room-count" hidden>0</span></button></div>
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
      <button id="open-tasks" class="chip active open-tasks" aria-label="Mes tâches" aria-expanded="false">${icon('list-checks')}<span id="tasks-count" class="tasks-count"></span></button>
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
        <div class="task-tabs" id="task-tabs" role="tablist" aria-label="Type de tâche">${(['habit','daily','todo'] as const).map(k=>`<button type="button" role="tab" data-kind="${k}" aria-selected="${k==='todo'}">${KIND_LABELS[k].many}<span class="tab-count" data-count="${k}"></span></button>`).join('')}</div>
        <p class="task-help" id="task-help"><span id="task-help-text"></span><button type="button" class="icon-button" id="task-help-close" aria-label="Masquer l’aide">${icon('x')}</button></p>
        <form id="task-form" class="task-form" autocomplete="off">
          <div class="task-row"><input id="task-text" maxlength="120" placeholder="Une chose à faire…" aria-label="Nouvelle tâche" /><button type="button" id="task-difficulty" class="diff-chip" aria-label="Difficulté" title="${DIFFICULTY_HINT}"></button><button type="button" id="task-more" class="icon-button" aria-expanded="false" aria-label="Options de la tâche" title="Catégorie, jours, sens, échéance">${icon('settings-2')}</button><button type="submit" class="icon-button add-task" aria-label="Ajouter la tâche">${icon('plus')}</button></div>
          <div class="task-options" id="task-options" hidden>
            <div class="opt"><span class="opt-label">Catégorie</span><div class="chips" id="task-cats" role="group" aria-label="Catégorie">${CATEGORIES.map(c=>`<button type="button" data-cat="${c.id}" style="--cat:${c.color}" aria-pressed="false">${c.label}</button>`).join('')}</div></div>
            <div class="opt" id="task-days-opt" hidden><span class="opt-label">Jours</span><div class="days" id="task-days" role="group" aria-label="Jours">${DAY_LABELS.map((d,i)=>`<button type="button" data-day="${i}" aria-pressed="true">${d}</button>`).join('')}</div></div>
            <div class="opt" id="task-dirs-opt" hidden><span class="opt-label">Sens</span><div class="chips" id="task-dirs" role="group" aria-label="Sens"><button type="button" data-dir="up" aria-pressed="true" title="On peut la cocher en +">${icon('plus')} Bonne</button><button type="button" data-dir="down" aria-pressed="false" title="On peut la cocher en −">${icon('minus')} Mauvaise</button></div></div>
            <div class="opt" id="task-due-opt" hidden><span class="opt-label">Échéance</span><label class="due-field" id="task-due-field">${icon('calendar')}<input type="date" id="task-due" aria-label="Date butoir" /></label></div>
          </div>
        </form>
        <ul id="task-list" class="task-list"></ul>
        <p id="tasks-empty" class="tasks-empty">Rien pour l’instant. Une seule chose suffit pour commencer.</p>
        <div class="task-foot"><button type="button" class="icon-button" id="task-help-toggle" aria-label="Comment ça marche ?" title="Comment ça marche ?">${icon('help-circle')}</button><div class="task-filter" id="task-filter"><button type="button" data-filter="remaining" aria-pressed="true">Restantes</button><button type="button" data-filter="all" aria-pressed="false">Toutes</button></div></div>
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
  <dialog id="progress-dialog" class="card card-honey"><header class="card-head"><span class="card-icon">${icon('trophy')}</span><span class="card-eyebrow">MA PROGRESSION</span><h2>Petit à petit.</h2><button type="button" class="icon-button close-dialog" aria-label="Fermer">${icon('x')}</button></header><div class="card-body">
    <div class="progress-summary"><span class="coins">${icon('coins')}<strong id="coins-big">0</strong> pièces</span><span class="level-badge" id="level-big">Niveau 0</span></div>
    <div class="xp-bar" aria-hidden="true"><span id="xp-fill-big"></span></div><div class="xp-label" id="xp-label">0 / 50 XP</div>
    <div class="energy-row"><span class="energy-icon">${icon('coffee')}</span><span>Énergie</span><div class="energy-bar big" aria-hidden="true"><span id="energy-fill-big"></span></div><span class="energy-label" id="energy-label">50 / 50</span></div>
    <div class="day-stats"><div><strong id="sessions">0</strong><span>sessions aujourd’hui</span></div><span class="stat-divider"></span><div><strong><span id="minutes">0</span><small> min</small></strong><span>rien que pour toi</span></div></div>
    <div class="session-dots"><span class="filled"></span><span></span><span></span><span></span><small id="cycle-label">Un pas après l’autre</small></div>
    <section><h3>Succès <span class="pill" id="achievements-count">0/7</span></h3><ul class="achievements-list" id="achievements-list"></ul></section>
  </div></dialog>
  <dialog id="settings-dialog" class="card card-terra"><form id="settings-form"><header class="card-head"><span class="card-icon">${icon('clock-3')}</span><span class="card-eyebrow">TON RYTHME</span><h2>À ton tempo.</h2><button type="button" class="icon-button close-dialog" aria-label="Fermer">${icon('x')}</button></header><div class="card-body"><p>Choisis la durée de tes sessions, en minutes.</p><div class="field-rows"><label>Concentration<input name="focus" type="number" min="1" max="90" required /></label><label>Petite pause<input name="short" type="number" min="1" max="90" required /></label><label>Longue pause<input name="long" type="number" min="1" max="90" required /></label></div><p class="form-note">Enregistrer remet le minuteur au début.</p><button type="submit" class="primary">Enregistrer mon rythme</button></div></form></dialog>
  <dialog id="help-dialog" class="card card-sky"><header class="card-head"><span class="card-icon">${icon('mouse-pointer-2')}</span><span class="card-eyebrow">BIENVENUE</span><h2>Prends tes marques.</h2><button type="button" class="icon-button close-dialog" aria-label="Fermer">${icon('x')}</button></header><div class="card-body"><p>Ce petit coin est à toi. Prends tes marques.</p><ul class="help-list"><li>${icon('mouse-pointer-2')}<span><strong>Un clic au sol ou sur un siège</strong>Ton personnage s’y rend en contournant les meubles, et s’installe si c’est une chaise ou le canapé.</span></li><li>${icon('move')}<span><strong>Cliquer et glisser</strong>Explore le café en déplaçant la caméra.</span></li><li>${icon('plus')}<span><strong>Molette ou boutons + / −</strong>Rapproche-toi ou prends un peu de recul.</span></li><li>${icon('locate-fixed')}<span><strong>Suivi du personnage</strong>Réactive-le pour que la caméra t’accompagne.</span></li></ul><p class="form-note">Au clavier : sélectionne la scène, puis utilise les flèches. L’orientation de la vue reste toujours fixe.</p><button class="primary close-dialog">Je m’installe</button></div></dialog>
  <dialog id="identity-dialog" class="card card-sage"><form id="identity-form" method="dialog"><header class="card-head"><span class="card-icon">${icon('smile')}</span><span class="card-eyebrow">ON SE PRÉSENTE ?</span><h2>Un pseudo, une couleur.</h2></header><div class="card-body">
    <p>Un pseudo et une couleur, c’est tout ce qu’il faut pour entrer au café.</p>
    <label>Pseudo<input name="name" type="text" minlength="2" maxlength="20" required autocomplete="nickname" /></label>
    <div class="palette" role="radiogroup" aria-label="Couleur">${PALETTE.map((p,i)=>`<label class="swatch" style="--swatch:#${p.hex.toString(16).padStart(6,'0')}" title="${p.label}"><input type="radio" name="color" value="${p.hex}" ${i===0?'checked':''}/></label>`).join('')}</div>
    <button class="primary" type="submit">${icon('coffee')}<span>Entrer au café</span></button>
  </div></form></dialog>
  <dialog id="account-dialog" class="card card-plum"><header class="card-head"><span class="card-icon">${icon('user-cog')}</span><span class="card-eyebrow">MON COMPTE</span><h2>Toi, partout.</h2><button type="button" class="icon-button close-dialog" aria-label="Fermer">${icon('x')}</button></header><div class="card-body">
    <section><h3>Twitch</h3><div class="kv"><span class="kv-key">${icon('twitch')}<span>Chaîne</span></span><span class="pill" id="account-twitch-status">Non lié</span></div>
    <p>Lie ta chaîne pour faire apparaître tes viewers dans ta salle, plus tard.</p>
    <button id="twitch-link" class="primary">${icon('link-2')}<span>Lier mon compte Twitch</span></button>
    <button id="twitch-unlink" class="secondary" hidden>${icon('unlink')}<span>Délier Twitch</span></button></section>
  </div></dialog>
  <dialog id="guests-dialog" class="card card-sage"><header class="card-head"><span class="card-icon">${icon('home')}</span><span class="card-eyebrow">MA PIÈCE</span><h2>Ta pièce, tes invités.</h2><button type="button" class="icon-button close-dialog" aria-label="Fermer">${icon('x')}</button></header><div class="card-body">
    <section><h3>Inviter</h3><p>Envoie ce lien à quelqu’un pour l’inviter directement chez toi.</p>
    <button id="invite-copy" class="primary">${icon('link-2')}<span>Copier le lien d’invitation</span></button></section>
    <section><h3>Qui est là <span class="pill" id="guests-count">0</span></h3><p>Exclus quelqu’un de ta pièce, pour un moment ou pour de bon.</p>
    <ul class="guests-list" id="guests-list"></ul>
    <div class="empty" id="guests-empty" hidden>${icon('coffee')}<span>Personne d’autre ici pour l’instant.</span></div></section>
  </div></dialog>
  <div id="net-veil" class="net-veil" role="status"><span class="veil-label">${icon('coffee')}<span id="net-text">Connexion au café…</span></span></div>
  <div id="login-screen" class="login-screen" role="dialog" aria-modal="true" aria-label="Connexion" hidden>
    <div class="login-card card card-sage">
      <header class="card-head"><span class="card-icon">${icon('coffee')}</span><span class="card-eyebrow">BIENVENUE</span><h2>Le café ouvre ses portes.</h2></header><div class="card-body">
      <p>Connecte-toi avec Google pour retrouver ton personnage sur n’importe quel appareil, ou entre directement en invité.</p>
      <div id="google-btn" class="google-btn-slot"></div>
      <div class="login-sep"><span>ou</span></div>
      <button id="login-guest" class="secondary" type="button">Continuer en invité</button>
    </div></div>
  </div>
`;
drawIcons();
// Who you are: kept locally, sent to the server at every `join`.
const uuid=()=>crypto.randomUUID?.()??`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const {identity,fresh:initialFresh}=loadIdentity(load('gamitask.identity',null),uuid);
let fresh=initialFresh;
function saveIdentity(){save('gamitask.identity',identity);renderIdentity();}
let role:'user'|'moderator'|'admin'='user';
function renderIdentity(){$('#identity-name').textContent=identity.name||'Invité';($('#identity-dot') as HTMLElement).style.setProperty('--swatch',`#${identity.color.toString(16).padStart(6,'0')}`);
  $('#role-badge').hidden=role==='user';$('#role-badge').textContent=role==='admin'?'admin':'modo';$('#workshop-btn').hidden=role==='user';}
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
function logout(){save('gamitask.token',null);save('gamitask.guest',null);save('gamitask.identity',null);location.reload();}
($('#logout-button') as HTMLButtonElement).onclick=logout;// forget who we are and land back on the login screen

// Connection: the café is unreachable until the server answers, so a veil covers the room in the meantime.
const API_URL=(import.meta.env.VITE_API_URL as string|undefined)??'http://localhost:3001';
let net:Net;
let pendingHome=false,homeAsked=false;// a saved 'private' room is resolved into a real private room id once `rooms:list` arrives
const veil=$('#net-veil') as HTMLElement,veilText=$('#net-text') as HTMLElement;
function showVeil(text:string|null){veil.hidden=text===null;if(text)veilText.textContent=text;}
let ready={room:false,tasks:false};
function maybeReady(){if(ready.room&&ready.tasks&&!pendingHome)showVeil(null);}
const GOOGLE_CLIENT_ID=(import.meta.env.VITE_GOOGLE_CLIENT_ID as string|undefined)??'';
let twitch:{login:string|null;displayName:string|null}={login:null,displayName:null};
function renderAccount(){
  const linked=!!twitch.login;
  const st=$('#account-twitch-status') as HTMLElement;st.textContent=linked?`Lié · ${twitch.displayName||twitch.login}`:'Non lié';st.classList.toggle('on',linked);
  ($('#twitch-link') as HTMLElement).hidden=linked;($('#twitch-unlink') as HTMLElement).hidden=!linked;
}
function applyAuthUser(u:{userId:string;token:string;name:string;color:number;twitchLogin?:string|null;twitchDisplayName?:string|null}){
  identity.userId=u.userId;
  if(u.name)identity.name=u.name;
  if(PALETTE.some(p=>p.hex===u.color))identity.color=u.color;
  identity.token=u.token;saveIdentity();save('gamitask.token',u.token);fresh=!identity.name;// the token also rides along in `join`
  twitch={login:u.twitchLogin??null,displayName:u.twitchDisplayName??null};renderAccount();
  ($('#account-button') as HTMLElement).hidden=false;
}
($('#account-button') as HTMLButtonElement).onclick=()=>{renderAccount();($('#account-dialog') as HTMLDialogElement).showModal();};
($('#twitch-link') as HTMLButtonElement).onclick=async()=>{
  const token=load('gamitask.token',null);if(!token){toast('Connecte-toi avec Google pour lier Twitch.');return;}
  const r=await startTwitchLink(API_URL,token);
  if('url' in r)location.href=r.url;
  else toast(r.status===401?'Ta session a expiré : déconnecte-toi puis reconnecte-toi avec Google.':r.status===500?'Twitch n’est pas configuré sur ce serveur (TWITCH_CLIENT_ID / SECRET).':r.status===0?'Le serveur ne répond pas.':`Impossible de lancer la connexion Twitch (${r.status}).`);
};
($('#twitch-unlink') as HTMLButtonElement).onclick=async()=>{
  const token=load('gamitask.token',null);if(!token)return;
  if(await unlinkTwitch(API_URL,token)){twitch={login:null,displayName:null};renderAccount();toast('Compte Twitch délié.');}
  else toast('La déconnexion Twitch a échoué.');
};
async function resolveAuth(){
  const savedToken=load('gamitask.token',null)??identity.token;// sessions opened before the token moved to its own key
  if(savedToken){const user=await verifyToken(API_URL,savedToken);if(user){applyAuthUser(user);return;}save('gamitask.token',null);identity.token=null;saveIdentity();}
  if(load('gamitask.guest',false))return;// chose « invité » before: walk straight back in, like the identity dialog does for a returning guest
  const screen=$('#login-screen') as HTMLElement;
  screen.hidden=false;
  await new Promise<void>(resolve=>{
    ($('#login-guest') as HTMLButtonElement).onclick=()=>{save('gamitask.guest',true);screen.hidden=true;resolve();};
    if(!GOOGLE_CLIENT_ID){($('#google-btn') as HTMLElement).hidden=true;return;}
    renderGoogleButton(GOOGLE_CLIENT_ID,$('#google-btn'),async credential=>{
      const user=await loginWithGoogle(API_URL,credential);
      if(!user){toast('La connexion Google a échoué, réessaie ou continue en invité.');return;}
      applyAuthUser(user);screen.hidden=true;resolve();
    }).catch(()=>{($('#google-btn') as HTMLElement).hidden=true;});
  });
}
const TWITCH_LINK_MESSAGES:Record<string,string>={linked:'Compte Twitch lié !',denied:'Connexion Twitch annulée.',expired:'Le lien a expiré, réessaie.',taken:'Ce compte Twitch est déjà lié à un autre profil.',error:'La connexion Twitch a échoué.'};
async function start(){
  await resolveAuth();
  const params=new URLSearchParams(location.search);
  const twitchParam=params.get('twitch');
  if(twitchParam){history.replaceState(null,'',location.pathname);if(TWITCH_LINK_MESSAGES[twitchParam])toast(TWITCH_LINK_MESSAGES[twitchParam]);}
  const inviteRoomId=params.get('room');
  if(inviteRoomId)history.replaceState(null,'',location.pathname);
  if(fresh){await askIdentity();look={...look,shirt:identity.color};saveLook();cafe?.setLook(look);}// the colour just chosen is the avatar's shirt
  if(room==='private'&&!inviteRoomId)pendingHome=true;// an invite link overrides « chez moi »'s own-room resolution — we're headed to someone else's room
  net=connect(API_URL,identity,room==='garden'?PUBLIC_IDS.garden:PUBLIC_IDS.cafe);// a saved garden joins the garden straight away; « chez moi » goes through the café while its room is resolved
  if(import.meta.env.DEV)(window as any).net=net;
  if(inviteRoomId)net.socket.once('room:info',()=>net.socket.emit('room:switch',{roomId:inviteRoomId}));// wait for the initial join to land before asking to move again
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
function untilLabel(until: number|null): string{
  if(until===null)return 'définitivement';
  const mins=Math.max(1,Math.round((until-Date.now())/60000));
  if(mins>=1440)return `pendant ${Math.round(mins/1440)} j`;
  if(mins>=60)return `pendant ${Math.round(mins/60)} h`;
  return `pendant ${mins} min`;
}
// Everything the HUD, the iris, the chat and the hint say about a room, in one place.
const ROOM_UI: Record<RoomKind,{label: string; icon: string; toast: string; hint: string; chat: string}>={
  cafe:{label:'Le café Petit Jour',icon:'coffee',toast:'Retour au café.',hint:'Comptoir : passer commande',chat:'AU CAFÉ'},
  garden:{label:'Le café-jardin',icon:'leaf',toast:'Bienvenue au jardin.',hint:'Bar à plantes : passer commande',chat:'AU JARDIN'},
  private:{label:'Chez moi',icon:'home',toast:'Bienvenue chez toi. Installe-toi.',hint:'Bureau : boutique et aménagement',chat:'CHEZ TOI'},
};
const roomKind=(v: string): RoomKind=>Object.hasOwn(ROOM_UI,v)?v as RoomKind:'cafe';// a saved 'public' from before the garden, or anything unknown, means the café
let cafe: any,room=roomKind(load('gamitask.room','cafe'));
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
// Owner moderation, « chez moi » only: throw someone out now, and optionally keep them out for a while.
function renderGuests(){
  const list=$('#guests-list') as HTMLElement;
  const others=[...members].filter(([id])=>id!==net?.socket.id);
  list.innerHTML=others.map(([id,m])=>`<li data-id="${id}"><span class="guest-name" style="--swatch:#${m.color.toString(16).padStart(6,'0')}">${m.name}</span><div class="kick-actions"><button data-kick="600000">10 min</button><button data-kick="3600000">1 h</button><button data-kick="86400000">24 h</button><button data-kick="" class="danger">Définitif</button></div></li>`).join('');
  ($('#guests-empty') as HTMLElement).hidden=others.length>0;($('#guests-count') as HTMLElement).textContent=String(others.length);
}
($('#guests-button') as HTMLButtonElement).onclick=()=>{renderGuests();($('#guests-dialog') as HTMLDialogElement).showModal();};
// Compte / gérer ma pièce / déconnexion used to be three lone icons in the HUD — folded into one menu to keep the bar readable.
for(const b of (($('#identity-menu') as HTMLElement).querySelectorAll('.menu button')))b.addEventListener('click',()=>{($('#identity-menu') as HTMLDetailsElement).open=false;});
($('#invite-copy') as HTMLButtonElement).onclick=async()=>{
  const url=`${location.origin}${location.pathname}?room=${net?.roomId()}`;
  try{await navigator.clipboard.writeText(url);toast('Lien d’invitation copié !');}
  catch{toast('Impossible de copier le lien.');}
};
$('#guests-list').addEventListener('click',(e: Event)=>{
  const btn=(e.target as HTMLElement).closest('button[data-kick]') as HTMLButtonElement|null;if(!btn)return;
  const li=btn.closest('li') as HTMLElement|null,id=li?.dataset.id;if(!id)return;
  const raw=btn.dataset.kick;
  net?.socket.emit('room:kick',{targetSocketId:id,durationMs:raw?Number(raw):null});
  li?.remove();
  if(!($('#guests-list') as HTMLElement).children.length)($('#guests-empty') as HTMLElement).hidden=false;
});
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
const board=createBoard($('.hud-top') as HTMLElement,{meId:()=>net?.socket.id??''});drawIcons();
chat.open();// the room's conversation is visible from the start; the round button folds it away
let chatRoomKnown=false;
const roomLabel=()=>ROOM_UI[room].chat;
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
// Object workshop: moderators build catalogue items; the server validates, stores and broadcasts them.
let catalog:import('@shared/catalog').CatalogItem[]=[];
const workshop=createWorkshop($('#app') as HTMLElement,{items:()=>catalog,save(item){net?.socket.emit('catalog:save',{item});},remove(id){net?.socket.emit('catalog:delete',{id});},onExit(){workshop.close();($('#workshop-btn') as HTMLElement).focus();}});
$('#workshop-btn').onclick=()=>{($('#identity-menu') as HTMLDetailsElement).open=false;if(role!=='user')workshop.open();};
function openEditor(){
  if(editing||!cafe||switching||placingId)return;editing=true;
  openDrawer(false);board.close();($('.world') as HTMLElement).classList.add('editing');hudInert(true);
  editor.open(look,identity.name,shop.hats);cafe.enterEditor();
}
function closeEditor(){
  if(!editing)return;editing=false;($('.world') as HTMLElement).classList.remove('editing');hudInert(false);
  previewLook=null;editor.close();cafe?.exitEditor();($('#identity-chip') as HTMLElement).focus();// never leave focus inside the hidden sheet
}
// The account menu closes once a choice is made or on any click outside it.
const menu=$('#identity-menu') as HTMLDetailsElement;const pick=(f:()=>void)=>()=>{menu.open=false;f();};
$('#me-edit').onclick=pick(openEditor);document.addEventListener('click',e=>{if(menu.open&&!menu.contains(e.target as Node))menu.open=false;});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.open){menu.open=false;($('#identity-chip') as HTMLElement).focus();}});
let builtFurniture='',furnitureSeen=false;// what the current scene was baked with, and whether the server sent its first furniture snapshot
function mountRoom(){
  if(placingId)endPlacing();cafe?.dispose();$('#scene').innerHTML='';$('.world').classList.remove('evening');$('#light').innerHTML=icon('sun')+'<span>Lumière du jour</span>';
  document.querySelectorAll('[data-room]').forEach((b: any)=>b.setAttribute('aria-pressed',String(roomKind(b.dataset.room)===room)));
  cafe=createCafe($('#scene'),onSceneState,{room,furniture:shop.placed,look:editing?previewLook??look:look});builtFurniture=JSON.stringify(shop.placed);
  cafe.onCell((col: number,row: number,arrived: boolean)=>{net?.socket.emit('move',{col,row});if(arrived)net?.socket.emit('position:save',{userId:identity.userId,col,row});});
  if(editing)cafe.enterEditor();// a remount mid-edit must come back to the mirror, not to walking mode
  drawIcons();$('#move-hint-room').textContent=ROOM_UI[room].hint;renderCounts();
}
// Iris wipe: a neutral veil grows from the button, the new room is built behind it, then the veil shrinks away.
let switching=false,prevRoom: RoomKind='cafe';// where a refused switch puts us back
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
// The badge counts the others: in the room you are in, you are not one of them.
function renderCounts(){for(const kind of ['cafe','garden'] as const){
  const badge=$(`#count-${kind}`),n=Math.max(0,((rooms.find(r=>r.id===PUBLIC_IDS[kind])?.count)??0)-(room===kind?1:0));
  badge.hidden=n===0;badge.textContent=String(n);}}
// Rooms: the server owns them. The click plays the iris and remounts, then `room:info` confirms (or corrects) where we really are.
let rooms: RoomSummary[]=[];
let homeTimer: ReturnType<typeof setTimeout>|undefined;
function switchServerRoom(next:RoomKind){
  if(next!=='private'){pendingHome=false;clearTimeout(homeTimer);maybeReady();net.socket.emit('room:switch',{roomId:PUBLIC_IDS[next]});return;}
  const mine=myPrivateRoom(rooms,identity.userId);
  if(mine){pendingHome=false;clearTimeout(homeTimer);maybeReady();net.socket.emit('room:switch',{roomId:mine.id});}
  // a refused creation is silent (guest rule, rate limit, stale row): give up after a few seconds rather than wait forever
  else if(!homeAsked){pendingHome=true;homeAsked=true;net.socket.emit('room:create-private',{name:`Chez ${identity.name}`});
    homeTimer=setTimeout(()=>{if(!myPrivateRoom(rooms,identity.userId))abandonHome();},4000);}
}
function enterRoom(next: RoomKind){room=next;save('gamitask.room',room);($('#guests-button') as HTMLElement).hidden=next!=='private';try{mountRoom();syncScene();renderShop();}catch(error){console.error(error);}}
function abandonHome(){
  clearTimeout(homeTimer);pendingHome=false;homeAsked=false;toast('Ta pièce n’a pas pu être créée.');
  if(room==='private')enterRoom('cafe');
  maybeReady();
}
document.querySelectorAll('[data-room]').forEach((b: any)=>b.onclick=async()=>{
  if(b.dataset.room===room||switching||editing)return;switching=true;
  try{
    const r=b.getBoundingClientRect(),next=roomKind(b.dataset.room),ui=ROOM_UI[next];
    prevRoom=room;await irisSwap(r.left+r.width/2,r.top+r.height/2,ui.label,ui.icon,()=>enterRoom(next));
    switchServerRoom(next);toast(ui.toast);
  }finally{switching=false;}
});
function onSceneState(state: SceneState){
    if(state.seated)toast('Tu t’installes. Prends le temps qu’il faut.');
    if('hover' in state){const h=$('#hint');if(!state.hover)h.hidden=true;else{const r=$('.world').getBoundingClientRect(),t=state.hover.task,cat=t&&catOf(t.category);
      h.innerHTML=t?`<span class="cat-dot" style="--cat:${cat?cat.color:'#d8d3c3'}"></span><strong>${esc(decodeEntities(t.text))}</strong><small>${cat?cat.label:'Sans catégorie'}${t.kind==='daily'?' · chaque jour':t.kind==='habit'?' · habitude':''} · cliquer pour la retrouver</small>`:`<span class="cat-dot" style="--cat:#d2a754"></span><strong>${state.hover.hotspot!.title}</strong><small>${state.hover.hotspot!.sub}</small>`;
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
  performance.mark('app:mount-start');// static imports (three, scene…) are all evaluated by now: this minus timeOrigin is the module cost
  mountRoom();performance.mark('app:mount-end');$('.loading')?.remove();($('#guests-button') as HTMLElement).hidden=room!=='private';
}catch(error){console.error(error);$('.loading').innerHTML='Le café 3D n’a pas pu démarrer.<br>Vérifie que l’accélération graphique est activée dans ton navigateur.';}
start();// the room is built behind the veil, then the server fills it

// Prototype: spawn as many random-looking characters as a Twitch channel's live viewers, purely local (not synced to other clients).
(window as any).spawnTwitchViewers=async(channel: string)=>{
  const res=await fetch(`${API_URL}/twitch/viewers?channel=${encodeURIComponent(channel)}`);
  if(!res.ok){console.error('[twitch] lookup failed',await res.text());return;}
  const {live,viewerCount}=await res.json();
  if(!live){console.log(`[twitch] ${channel} is offline`);return;}
  const {w,d}=DIMS[room];
  console.log(`[twitch] ${channel}: ${viewerCount} viewers, spawning…`);
  for(let i=0;i<viewerCount;i++){
    cafe.addRemote(`twitch-${channel}-${i}`,{
      name:`viewer${i+1}`,color:PALETTE[Math.floor(Math.random()*PALETTE.length)].hex,hat:null,
      look:randomLook(PALETTE.map(p=>p.hex)),col:Math.floor(Math.random()*w),row:Math.floor(Math.random()*d),state:'idle',wander:true,
    });
  }
};
// Prototype: spawn the real chatters of MY OWN linked Twitch channel — Twitch only lets a broadcaster read their own chat list.
// Still random-looking (a chatter's real gamitask look only exists once they link their own account too), but tagged with their real name.
(window as any).spawnMyChatters=async()=>{
  const token=load('gamitask.token',null);
  if(!token){console.log('[twitch] connecte-toi avec Google et lie ton compte Twitch d’abord.');return;}
  const chatters=await getMyChatters(API_URL,token);
  if(!chatters){console.error('[twitch] lookup failed — compte Twitch lié ?');return;}
  const {w,d}=DIMS[room];
  console.log(`[twitch] ${chatters.length} chatters, spawning…`);
  for(const c of chatters){
    cafe.addRemote(`twitch-chatter-${c.id}`,{
      name:c.name||c.login,color:PALETTE[Math.floor(Math.random()*PALETTE.length)].hex,hat:null,
      look:randomLook(PALETTE.map(p=>p.hex)),col:Math.floor(Math.random()*w),row:Math.floor(Math.random()*d),state:'idle',wander:true,
    });
  }
};
// Dev-only: spawn made-up names to check the name tag/look rendering without needing a live channel to test against.
(window as any).spawnFakeChatters=(names:string[])=>{
  const {w,d}=DIMS[room];
  for(const name of names){
    cafe.addRemote(`fake-chatter-${name}`,{
      name,color:PALETTE[Math.floor(Math.random()*PALETTE.length)].hex,hat:null,
      look:randomLook(PALETTE.map(p=>p.hex)),col:Math.floor(Math.random()*w),row:Math.floor(Math.random()*d),state:'idle',wander:true,
    });
  }
};
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
  $('#shop-furniture').innerHTML=FURNITURE.map(f=>{const owned=shop.furniture.includes(f.id),placed=f.id in shop.placed,set=SETS.find(s=>s.id===f.set);
    const action=!owned?`<button data-buy-furniture="${f.id}" ${progress.coins<f.price?'disabled':''}>Acheter</button>`:!home?'<small>chez toi</small>':placed?`<button data-move="${f.id}">Déplacer</button><button data-unplace="${f.id}" class="quiet">Ranger</button>`:`<button data-place="${f.id}">Placer</button>`;
    return `<li class="${owned?'owned':''}"><span class="shop-emoji">${f.emoji}</span><span class="shop-name">${f.name}<small>${owned?(placed?'Installé':'Rangé'):`${f.price} pièces`}${set?` · set ${set.emoji}`:''}</small></span><span class="shop-actions">${action}</span></li>`;}).join('');
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
  const ep=Math.round(progress.energy/50*100);$('#energy-fill').style.width=`${ep}%`;$('#energy-fill-big').style.width=`${ep}%`;$('.energy-bar').setAttribute('aria-valuenow',String(progress.energy));$('#energy-label').textContent=`${progress.energy} / 50`;
  document.body.classList.toggle('low-energy',progress.energy<25);document.body.classList.toggle('exhausted',progress.exhausted);
}
function rewardPomodoro(){net.socket.emit('pomodoro:complete',{userId:identity.userId});}
renderProgress();
// Everything the server says, applied as-is.
function bindServerEvents(){
  const s=net.socket;
  // a remote's own hat counts as owned, so validation never strips what the server already accepted
  const remote=(p: Player)=>({name:p.name,color:p.color,hat:p.hat??null,look:p.look?loadLook(p.look,p.color,p.hat?[p.hat]:[]):undefined,col:p.col,row:p.row,state:p.state});
  s.on('room-state',players=>{cafe?.clearRemotes();members.clear();for(const p of players){members.set(p.id,{name:p.name,color:p.color});cafe?.addRemote(p.id,remote(p));cafe?.setTodo(p.id,p.pendingTaskIds?.length??0);}
    if(!chatRoomKnown){chatRoomKnown=true;chat.setRoom(roomLabel());}ready.room=true;maybeReady();
    // the server spawns us at a fixed tile and resets our state: tell everyone where we really stand, and what we're doing
    const at=cafe?.playerPosition()??{x:0,z:0};s.emit('move',toCell(at.x,at.z,room));s.emit('avatar-state',{state:avatarState()});});
  s.on('player-joined',p=>{members.set(p.id,{name:p.name,color:p.color});cafe?.addRemote(p.id,remote(p));cafe?.setTodo(p.id,p.pendingTaskIds?.length??0);});
  s.on('player-moved',({id,col,row})=>cafe?.moveRemote(id,col,row));
  s.on('player-state',({id,state})=>cafe?.setRemoteState(id,state));
  s.on('player-hat',({id,hat})=>cafe?.setRemoteHat(id,hat));
  s.on('player-look',({id,look})=>cafe?.setRemoteLook(id,loadLook(look,look.shirt,look.hat?[look.hat]:[])));
  s.on('player-left',({id})=>{members.delete(id);cafe?.removeRemote(id);});
  s.on('room:kicked',({until})=>toast(`Tu as été exclu de cette pièce ${untilLabel(until)}.`));
  s.on('room:banned',({until})=>toast(`Tu ne peux pas entrer dans cette pièce, exclu ${untilLabel(until)}.`));
  // Twitch NPCs: a linked streamer's live chatters, shared with everyone in the room by the server — never in `members`, they're not real accounts to @-mention.
  const npc=(n: {name: string;color: number;look: Look;col: number;row: number})=>({name:n.name,color:n.color,hat:null,look:loadLook(n.look,n.color,[]),col:n.col,row:n.row,state:'idle' as const});
  s.on('npc:state',npcs=>{for(const n of npcs)cafe?.addRemote(n.id,npc(n));});
  s.on('npc:joined',n=>cafe?.addRemote(n.id,npc(n)));
  s.on('npc:moved',({id,col,row})=>cafe?.moveRemote(id,col,row));
  s.on('npc:left',({id})=>cafe?.removeRemote(id));
  s.on('chat-message',msg=>{const mine=msg.id===s.id,text=decodeEntities(msg.text);chat.add({...msg,mine});if(mine)cafe?.sayMe(msg.name,msg.color,text);else cafe?.say(msg.id,msg.name,msg.color,text);});
  s.on('leaderboard-update',entries=>{board.update(entries);drawIcons();});
  s.on('tasks:public-update',({socketId,taskIds})=>cafe?.setTodo(socketId,taskIds.length));
  // the server sends a completion to the rest of the room only: our own +10 already shows up as a toast
  s.on('task:completed-public',({socketId})=>{if(socketId!==s.id)cafe?.float(socketId,'+10');});
  s.on('level-up:public',({socketId,name,level})=>{cafe?.float(socketId,`Niveau ${level}`,'#647557');chat.system(`${name} passe au niveau ${level}`);});
  s.on('achievement:public',({socketId,label,icon:badge})=>{cafe?.float(socketId,`${badge} ${label}`);chat.system(`${members.get(socketId)?.name??'Quelqu’un'} débloque « ${label} »`);});
  s.on('chat:typing',({id,name})=>chat.typing(id,name));
  s.on('chat:emote',({id,emoji})=>{if(id===s.id)cafe?.emoteMe(emoji);else cafe?.emote(id,emoji);});
  s.on('rooms:list',({rooms:list})=>{rooms=list;renderCounts();if(!pendingHome)return;if(homeDecision(rooms,identity.userId,homeAsked)!=='wait')switchServerRoom('private');});
  s.on('pomo:state',st=>{applyState(roomPomo,st,Date.now());renderRoomPomo();});
  s.on('pomo:tick',t=>{applyTick(roomPomo,t,Date.now());renderRoomPomo();});
  s.on('pomo:phase',({phase,remaining,session})=>{const was=roomPomo.phase;
    applyState(roomPomo,{phase,remaining,session,running:roomPomo.participants>0,participants:roomPomo.participants},Date.now());
    if(roomPomo.joined&&was==='focus')toast('Focus terminé avec la salle. Les pièces arrivent.');
    renderRoomPomo();});
  s.on('me:state',u=>{role=u.role;renderIdentity();});
  s.on('catalog:state',({items})=>{catalog=items;setCatalog(items);renderShop();workshop.refresh();// a changed recipe rebuilds the room; the server then resends who is in it
    if(furnitureSeen){try{mountRoom();syncScene();net.socket.emit('room:refresh');}catch(error){console.error(error);}}
    // Carved pieces need the boolean toolkit: fetch it once, then rebuild so the cuts show (they rendered solid meanwhile).
    if(!csgReady()&&items.some(i=>needsCsg(i.parts)))ensureCsg().then(()=>{if(cafe){try{mountRoom();syncScene();}catch(error){console.error(error);}}});});
  s.on('catalog:error',({message})=>toast(message));
  s.on('auth:invalid',logout);// a Google account without a valid token starts over as a guest
  s.on('room:info',({roomId})=>{roomPomo=createRoomPomo();renderRoomPomo();// une autre salle, un autre pomodoro : on repart de zéro et la participation s'arrête
    if(pendingHome)return;// still on the way home: the server room is only a stop-over, no need to rebuild twice
    const here=kindOfRoomId(roomId,rooms,identity.userId);
    if(here!==room)enterRoom(here);// an unchanged kind (an unknown public id already reads as the café) never remounts
    // Room-manage panel is for the owner only — a private room can now also be a friend's, visited via an invite link.
    ($('#guests-button') as HTMLElement).hidden=!(here==='private'&&myPrivateRoom(rooms,identity.userId)?.id===roomId);
    chatRoomKnown=true;chat.setRoom(roomLabel());});
  s.on('tasks:state',({tasks:list,coins,energy,exhausted})=>{setTasks(tasks,list);setCoins(progress,coins);setEnergy(progress,energy);setExhausted(progress,!!exhausted);cafe?.setEnergy?.(progress.energy,progress.exhausted);ready.tasks=true;maybeReady();renderTasks();renderProgress();syncScene();});
  // Notes and timer settings started on the landing page follow the visitor in, once.
  s.on('tasks:state',()=>{const h=load('gamitask.landing.handoff',null);if(!h)return;localStorage.removeItem('gamitask.landing.handoff');
    for(const text of (h.notes??[]).slice(0,20))s.emit('task:add',{userId:identity.userId,text,category:null,kind:'todo',difficulty:'easy'});
    if(h.durations){Object.assign(timer.durations,h.durations);resetTimer(timer);persistTimer();}
    if(h.notes?.length)toast('Tes notes sont posées sur la table.');});
  s.on('task:added',t=>{taskAdded(tasks,t);renderTasks();syncScene();});
  s.on('task:scored',({task:t,coins,energy,xp,level,xpToNext,bossDamage})=>{const before=progress.coins;taskScored(tasks,t);setCoins(progress,coins);setXp(progress,{xp,level,xpToNext});setEnergy(progress,energy);cafe?.setEnergy?.(progress.energy,progress.exhausted);renderTasks();renderProgress();renderShop();syncScene();
    const dc=coins-before;if(dc>0||xp>0){const parts=[];if(dc>0)parts.push(`+${dc} pièces`);if(bossDamage>0)parts.push(`${bossDamage} dégâts au boss`);toast(`${t.kind==='daily'?'Fait pour aujourd’hui.':t.kind==='habit'?'Bien joué.':'C’est fait.'} ${parts.join(' · ')}`);}
    else if(t.kind==='habit')toast('Noté. Demain sera mieux.');});
  s.on('task:updated',t=>{taskUpdated(tasks,t);renderTasks();syncScene();});
  s.on('task:deleted',({taskId})=>{taskDeleted(tasks,taskId);renderTasks();syncScene();});
  s.on('coins:update',({coins})=>{setCoins(progress,coins);renderProgress();renderShop();});
  s.on('energy:update',({energy})=>{setEnergy(progress,energy);renderProgress();cafe?.setEnergy?.(progress.energy,progress.exhausted);});
  s.on('energy:exhausted',({coins})=>{setExhausted(progress,true);setCoins(progress,coins);renderProgress();renderShop();cafe?.setEnergy?.(progress.energy,true);later(()=>toast('Épuisé… tu as perdu 30 % de tes pièces. Repose-toi, demain ça repart.'),0);});
  s.on('day:rollover',({missed,energy,energyDelta})=>{setEnergy(progress,energy);renderProgress();cafe?.setEnergy?.(progress.energy,progress.exhausted);
    if(missed.length)later(()=>toast(`Hier : ${missed.length} quotidienne${missed.length>1?'s':''} oubliée${missed.length>1?'s':''}${energyDelta<0?`, −${-energyDelta} énergie`:''}. ${missed.map(t=>t.text).slice(0,3).join(', ')}${missed.length>3?'…':''}`),0);});
  s.on('xp:update',u=>{const before=progress.level;setXp(progress,u);renderProgress();if(u.levelUp&&u.level>before){cafe?.float('',`Niveau ${u.level}`,'#647557');later(()=>toast(`✨ Niveau ${u.level} ! Énergie rechargée.`),2600);}});
  s.on('streak:update',({streak,bonus})=>{setStreak(progress,streak);renderProgress();toast(`Une petite victoire de plus.${bonus>5?` Série ×${streak}.`:''}`);});
  s.on('achievement:unlocked',a=>{if(unlock(progress,a.key)){renderProgress();cafe?.float('',`${a.icon} ${a.label}`);later(()=>toast(`${a.icon} Succès : ${a.label} — ${a.desc}`),2600);}});
  s.on('profile:data',d=>{setAchievements(progress,d.achievements);setStreak(progress,d.streak);renderProgress();});
  s.on('room:full',()=>{if(ready.room){if(room!==prevRoom)enterRoom(prevRoom);// the iris already moved us: the server kept us where we were
      toast('Cette pièce est pleine pour le moment.');return;}// a refused switch leaves us where we are, no veil
    showVeil('Le café est plein pour le moment, on réessaie dans un instant…');setTimeout(()=>net.socket.emit('join',{name:identity.name,color:identity.color,col:0,row:0,userId:identity.userId,roomId:net.roomId(),tzOffsetMinutes:new Date().getTimezoneOffset()}),5000);});
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
let newCategory: string|null=null,newDifficulty=1,newDays=127,newUp=true,newDown=false,optionsOpen=false,helpHidden: boolean=load('gamitask.taskHelp',false);
const catOf=(id: string|null)=>CATEGORIES.find(c=>c.id===id);
const esc=(v: string)=>v.replace(/[&<>"']/g,(c: string)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as Record<string,string>)[c]);
const pips=(n: number)=>`<span class="pips" aria-hidden="true">${[1,2,3,4].map(i=>`<i class="${i<=n?'on':''}"></i>`).join('')}</span>`;
const dueLabel=(ts: number)=>new Date(ts).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'});
function syncScene(){cafe?.setTasks(pending(tasks));}
function renderTaskForm(){
  const k=tasks.tab;($('#task-text') as HTMLInputElement).placeholder=KIND_LABELS[k].placeholder;
  $('#task-days-opt').hidden=k!=='daily';$('#task-dirs-opt').hidden=k!=='habit';$('#task-due-opt').hidden=k!=='todo';$('#task-filter').hidden=k==='habit';
  $('#task-help').hidden=helpHidden;$('#task-help-text').textContent=KIND_LABELS[k].help;$('#task-help-toggle').hidden=!helpHidden;
  $('#task-options').hidden=!optionsOpen;$('#task-more').setAttribute('aria-expanded',String(optionsOpen));
  const tweaked=newCategory!==null||(k==='daily'&&newDays!==127)||(k==='habit'&&(newDown||!newUp))||(k==='todo'&&!!($('#task-due') as HTMLInputElement).value);$('#task-more').classList.toggle('tweaked',tweaked);// a dot on the toggle says "something is set in there"
  document.querySelectorAll('#task-days button').forEach((b: any)=>b.setAttribute('aria-pressed',String(!!(newDays&(1<<Number(b.dataset.day))))));
  document.querySelectorAll('#task-dirs button').forEach((b: any)=>b.setAttribute('aria-pressed',String(b.dataset.dir==='up'?newUp:newDown)));
  const d=DIFFICULTIES[newDifficulty];$('#task-difficulty').innerHTML=`${pips(d.pips)}<span>${d.label}</span>`;
  document.querySelectorAll('#task-tabs [role=tab]').forEach((b: any)=>b.setAttribute('aria-selected',String(b.dataset.kind===k)));
  document.querySelectorAll('#task-filter button').forEach((b: any)=>b.setAttribute('aria-pressed',String(b.dataset.filter===tasks.filter)));
}
function renderTasks(){
  const list=$('#task-list'),today=new Date();
  const open=new Set([...list.querySelectorAll('li.open')].map((l: any)=>l.dataset.id));
  list.innerHTML='';
  for(const t of visible(tasks,today)){
    const li=document.createElement('li');li.dataset.id=t.id;const cat=catOf(t.category),d=DIFFICULTIES.find(x=>x.id===t.difficulty)!;
    const tn=tint(t.value);li.className=`kind-${t.kind} tint-${tn}${t.done?' done':''}${t.kind==='daily'&&!isDue(t,today)?' not-due':''}`;if(TINT_LABELS[tn])li.title=TINT_LABELS[tn];
    const dt=esc(decodeEntities(t.text));
    const text=`<span class="task-text" contenteditable="plaintext-only" spellcheck="false">${dt}</span>`;
    const common=`<button class="cat-dot${cat?'':' empty'}" style="--cat:${cat?cat.color:'#c9cdbd'}" title="Catégorie : ${cat?cat.label:'aucune'} — cliquer pour changer" aria-label="Changer la catégorie"></button><button class="pips diff" title="Difficulté : ${d.label} — cliquer pour changer. ${DIFFICULTY_HINT}" aria-label="Changer la difficulté">${pips(d.pips)}</button>`;
    if(t.kind==='habit')li.innerHTML=`${t.down?`<button class="score-button down" data-dir="down" title="J’ai craqué (−)" aria-label="Craquée : ${dt}">${icon('minus')}</button>`:'<span class="score-spacer"></span>'}${text}${common}<small class="counts" title="Aujourd’hui : fois tenue / fois craquée">${t.up?`<b class="up">+${t.countUp}</b>`:''}${t.down?`<b class="down">−${t.countDown}</b>`:''}</small>${t.up?`<button class="score-button up" data-dir="up" title="Je l’ai tenue (+)" aria-label="Tenue : ${dt}">${icon('plus')}</button>`:'<span class="score-spacer"></span>'}<button class="icon-button remove-task" aria-label="Supprimer">${icon('x')}</button>`;
    else if(t.kind==='daily')li.innerHTML=`<button class="check-button${t.done?' done':''}" data-dir="${t.done?'down':'up'}" aria-label="${t.done?'Reprendre':'Terminer'} : ${dt}" aria-pressed="${t.done}">${icon('check')}</button>${text}${common}${t.streak>1?`<small class="streak-count" title="Série">${icon('flame')}${t.streak}</small>`:''}<small class="days-mini" aria-label="Jours">${DAY_LABELS.map((l,i)=>`<b class="${t.days&(1<<i)?'on':''}">${l}</b>`).join('')}</small><button class="icon-button remove-task" aria-label="Supprimer">${icon('x')}</button>`;
    else{const n=t.checklist.length,k=t.checklist.filter(i=>i.done).length;
      li.innerHTML=`<button class="check-button${t.done?' done':''}" data-dir="${t.done?'down':'up'}" aria-label="${t.done?'Reprendre':'Terminer'} : ${dt}" aria-pressed="${t.done}">${icon('check')}</button>${text}${common}${t.dueAt?`<small class="due" title="Date butoir">${icon('calendar')}${dueLabel(t.dueAt)}</small>`:''}<button class="icon-button toggle-list" aria-expanded="false" aria-label="Étapes" title="Étapes">${icon('chevron-down')}${n?`<b>${k}/${n}</b>`:''}</button><button class="icon-button remove-task" aria-label="Supprimer">${icon('x')}</button>
      <ul class="checklist" hidden>${t.checklist.map((i,idx)=>`<li data-idx="${idx}"><button class="check-button mini${i.done?' done':''}" aria-pressed="${i.done}">${icon('check')}</button><span>${esc(decodeEntities(i.text))}</span><button class="icon-button remove-item" aria-label="Retirer">${icon('x')}</button></li>`).join('')}<li class="add-item"><input placeholder="Une étape…" maxlength="80" aria-label="Nouvelle étape" /></li></ul>`;}
    list.append(li);
  }
  for(const li of list.querySelectorAll('li[data-id]') as NodeListOf<HTMLElement>){
    if(!open.has(li.dataset.id))continue;
    li.classList.add('open');(li.querySelector('.checklist') as HTMLElement).hidden=false;li.querySelector('.toggle-list')!.setAttribute('aria-expanded','true');
  }
  $('#tasks-empty').hidden=visible(tasks,today).length>0;const left=remaining(tasks,today);$('#tasks-count').textContent=left?`${left} à faire`:tasks.list.length?'Tout est fait':'';
  for(const k of ['habit','daily','todo'] as const){const n=k==='habit'?tasks.list.filter(t=>t.kind==='habit').length:tasks.list.filter(t=>t.kind===k&&!t.done&&(k==='todo'||isDue(t,today))).length;($(`[data-count=${k}]`) as HTMLElement).textContent=n?String(n):'';}
  document.querySelectorAll('#task-cats button').forEach((b: any)=>b.setAttribute('aria-pressed',String(b.dataset.cat===newCategory)));
  renderTaskForm();drawIcons();
}
const emitUpdate=(id: string,patch: any)=>net.socket.emit('task:update',{userId:identity.userId,taskId:id,patch});
$('#task-tabs').onclick=(e: any)=>{const b=e.target.closest('[data-kind]');if(!b)return;tasks.tab=b.dataset.kind;renderTasks();$('#task-text').focus();};
$('#task-filter').onclick=(e: any)=>{const b=e.target.closest('[data-filter]');if(!b)return;tasks.filter=b.dataset.filter;renderTasks();};
$('#task-cats').onclick=(e: any)=>{const b=e.target.closest('[data-cat]');if(!b)return;newCategory=newCategory===b.dataset.cat?null:b.dataset.cat;renderTasks();$('#task-text').focus();};
$('#task-days').onclick=(e: any)=>{const b=e.target.closest('[data-day]');if(!b)return;newDays=toggleDay(newDays,Number(b.dataset.day));renderTaskForm();};
$('#task-dirs').onclick=(e: any)=>{const b=e.target.closest('[data-dir]');if(!b)return;if(b.dataset.dir==='up')newUp=!newUp;else newDown=!newDown;if(!newUp&&!newDown)newUp=true;renderTaskForm();};
$('#task-difficulty').onclick=()=>{newDifficulty=(newDifficulty+1)%DIFFICULTIES.length;renderTaskForm();};
$('#task-more').onclick=()=>{optionsOpen=!optionsOpen;renderTaskForm();};
$('#task-due').onchange=()=>renderTaskForm();
$('#task-help-close').onclick=()=>{helpHidden=true;save('gamitask.taskHelp',true);renderTaskForm();};
$('#task-help-toggle').onclick=()=>{helpHidden=false;save('gamitask.taskHelp',false);renderTaskForm();};
$('#task-form').onsubmit=(e: any)=>{e.preventDefault();const text=cleanText(($('#task-text') as HTMLInputElement).value);if(!text)return;
  const due=($('#task-due') as HTMLInputElement).value;const dueAt=due?new Date(due+'T12:00:00').getTime():null;
  net.socket.emit('task:add',{userId:identity.userId,...newTaskPayload(tasks.tab,text,{difficulty:DIFFICULTIES[newDifficulty].id,category:newCategory,up:newUp,down:newDown,days:newDays,dueAt})});($('#task-text') as HTMLInputElement).value='';($('#task-due') as HTMLInputElement).value='';};
$('#task-list').addEventListener('click',(e: Event)=>{
  const target=e.target as HTMLElement,li=target.closest('li[data-id]') as HTMLElement|null;if(!li)return;const id=li.dataset.id!;const t=tasks.list.find(t=>t.id===id);if(!t)return;
  const scoreBtn=target.closest('[data-dir]') as HTMLElement|null;
  if(scoreBtn&&!target.closest('.checklist')){scoreBtn.setAttribute('disabled','');net.socket.emit('task:score',{userId:identity.userId,taskId:id,direction:scoreBtn.dataset.dir as 'up'|'down'});}
  else if(target.closest('.cat-dot')){const i=CATEGORIES.findIndex(c=>c.id===t.category);emitUpdate(id,{category:i+1<CATEGORIES.length?CATEGORIES[i+1].id:null});}
  else if(target.closest('.diff')){const i=DIFFICULTIES.findIndex(d=>d.id===t.difficulty);emitUpdate(id,{difficulty:DIFFICULTIES[(i+1)%DIFFICULTIES.length].id});}
  else if(target.closest('.toggle-list')){const ul=li.querySelector('.checklist') as HTMLElement,b=li.querySelector('.toggle-list')!;ul.hidden=!ul.hidden;b.setAttribute('aria-expanded',String(!ul.hidden));li.classList.toggle('open',!ul.hidden);}
  else if(target.closest('.checklist .check-button')){const idx=Number((target.closest('[data-idx]') as HTMLElement).dataset.idx);emitUpdate(id,{checklist:t.checklist.map((i,j)=>j===idx?{...i,done:!i.done}:i)});}
  else if(target.closest('.remove-item')){const idx=Number((target.closest('[data-idx]') as HTMLElement).dataset.idx);emitUpdate(id,{checklist:t.checklist.filter((_,j)=>j!==idx)});}
  else if(target.closest('.remove-task'))net.socket.emit('task:delete',{userId:identity.userId,taskId:id});
});
$('#task-list').addEventListener('keydown',(e: any)=>{
  if(e.target.matches('.task-text')&&e.key==='Enter'){e.preventDefault();e.target.blur();}
  if(e.target.matches('.add-item input')&&e.key==='Enter'){e.preventDefault();const li=e.target.closest('li[data-id]'),t=tasks.list.find(t=>t.id===li.dataset.id);const text=cleanChecklistItem(e.target.value);if(!t||!text)return;emitUpdate(t.id,{checklist:[...t.checklist,{text,done:false}]});e.target.value='';}
});
$('#task-list').addEventListener('focusout',(e: Event)=>{const el=e.target as HTMLElement;if(!el.matches('.task-text'))return;const id=(el.closest('li[data-id]') as HTMLElement).dataset.id!;const t=tasks.list.find(t=>t.id===id);const text=cleanText(el.textContent);
  if(!t||!text){if(t)el.textContent=t.text;return;}if(text!==t.text)emitUpdate(id,{text});});
renderTasks();

// Optional generated rain: no remote audio, tracking, or autoplay.
function ensureAudio(){try{audio??=new (window.AudioContext||(window as any).webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{});return audio;}catch{return null;}}
function chime(){if(!audio||audio.state!=='running')return;for(const [i,freq] of [523.25,659.25,783.99].entries()){const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(0,audio.currentTime+i*.16);gain.gain.linearRampToValueAtTime(.045,audio.currentTime+i*.16+.02);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+i*.16+.9);osc.connect(gain);gain.connect(audio.destination);osc.start(audio.currentTime+i*.16);osc.stop(audio.currentTime+i*.16+1);}}
$('#sound').onclick=()=>{
  const ctx=ensureAudio();if(!ctx){toast('Le son n’est pas disponible dans ce navigateur.');return;}
  if(!rain){const buffer=ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate),data=buffer.getChannelData(0);let last=0;for(let i=0;i<data.length;i++){last=(last+Math.random()*.04-.02)/1.02;data[i]=last*4;}rain=ctx.createBufferSource();rain.buffer=buffer;rain.loop=true;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1600;rainGain=ctx.createGain();rainGain.gain.value=0;rain.connect(filter);filter.connect(rainGain);rainGain.connect(ctx.destination);rain.start();}
  soundOn=!soundOn;rainGain.gain.setTargetAtTime(soundOn?.35:0,ctx.currentTime,.3);$('#sound').setAttribute('aria-pressed',String(soundOn));$('#sound').classList.toggle('playing',soundOn);toast(soundOn?'Un fond de pluie pour se concentrer.':'Le calme, tout simplement.');
};
