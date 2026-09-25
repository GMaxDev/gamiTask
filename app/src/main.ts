/// <reference types="vite/client" />
import {$,icon,drawIcons,load,save,toast,showRecap,esc,today} from './ui.ts';
import {createCafe} from './scene.ts';
import type {SceneState} from './scene.ts';
import {loadIdentity,cleanName,PALETTE} from './identity.ts';
import {loadLook,randomLook,type Look} from './look.ts';
import {createEditor} from './editor.ts';
import {createWorkshop} from './workshop.ts';
import {ensureCsg,csgReady,needsCsg} from './recipe.ts';
import {createBoard} from './board.ts';
import {connect,type Net} from './net.ts';
import {toCell,DIMS} from './coords.ts';
import type {RoomKind} from './coords.ts';
import {homeDecision,kindOfRoomId,myPrivateRoom,PUBLIC_IDS} from './rooms.ts';
import type {Player,RoomSummary} from '@shared/types';
import {createProgress,setCoins,setXp,setStreak,setEnergy,setExhausted,unlock,setAchievements,levelInfo,ACHIEVEMENTS} from './progress.ts';
import {HATS,FURNITURE,SETS,createShop,setCosmetics,setFurniture,setCatalog,canPlace,takenCells,completeSets,toServerCell,item as shopItem} from './shop.ts';
import {createChat,decodeEntities} from './chat.ts';
import {createAmbience} from './ambience.ts';
import {createPomodoro} from './pomodoro-ui.ts';
import {createTasksUi} from './tasks-ui.ts';
import {createJournal,record,summaryLine,timeLabel} from './journal.ts';
import {focusDoneLine,focusWithLine} from './pomo.ts';
import {hudMarkup} from './hud.ts';
import {verifyToken,loginWithGoogle,renderGoogleButton,startTwitchLink,unlinkTwitch,getMyChatters} from './auth.ts';
import './style.css';

const shop=createShop();// declared here: mountRoom() reads shop.placed / shop.hat before the shop block runs
let placingId: string|null=null,placingCell: {c: number; r: number}|null=null;

$('#app').innerHTML=hudMarkup();
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
let firstSteps=!load('gamitask.firstSteps',false);
function maybeReady(){if(!(ready.room&&ready.tasks)||pendingHome)return;showVeil(null);
  if(firstSteps){save('gamitask.firstSteps',true);showRecap('Bienvenue au café.','Clique au sol pour marcher, sur une chaise pour t’asseoir. Glisse pour regarder autour.');}}
const GOOGLE_CLIENT_ID=(import.meta.env.VITE_GOOGLE_CLIENT_ID as string|undefined)??'';
let twitch:{login:string|null;displayName:string|null}={login:null,displayName:null};
function renderAccount(){
  $('#account-name').textContent=identity.name||'—';$('#account-mode').textContent=load('gamitask.token',null)?'Google':'Invité·e';
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
($('#account-button') as HTMLButtonElement).onclick=()=>ambience.openPanel('compte');
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
    if(s==='offline'){pomo.leaveRoom();showVeil('Le café est injoignable, on réessaie…');}
    if(s==='replaced'){pomo.leaveRoom();showVeil('Le café est ouvert dans un autre onglet.');}
  });
  bindServerEvents();
}
let warnedLow=false;
$('#recap-close').onclick=()=>{$('#recap').hidden=true;};
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
const ambience=createAmbience({cafe:()=>cafe,onOpen:renderAccount});
let look: Look=loadLook(load('gamitask.look',null),identity.color,[]);
function saveLook(){save('gamitask.look',look);}
// Character editor: a sheet over the scene, the café avatar itself is the preview.
let editing=false,previewLook: Look|null=null;// what the sheet is showing, so a scene remount can rebuild it
const editor=createEditor($('#app') as HTMLElement,{
  onPreview(l){previewLook=l;cafe?.setLook(l);},
  onDone(l,name){look=l;saveLook();cafe?.setLook(l);identity.name=name;identity.color=l.shirt;saveIdentity();
    // the server owns the worn hat: equip first, so the `cosmetics:state` echoed by `look:update` already carries the new hat
    if(l.hat!==shop.hat){shop.hat=l.hat;net?.socket.emit('cosmetic:equip',{hatId:l.hat});renderShop();}
    net?.socket.emit('look:update',{look:l});// the server stores it and tells the room right away
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
  list.innerHTML=others.map(([id,m])=>`<li data-id="${esc(id)}"><span class="guest-name" style="--swatch:#${((Number(m.color)||0)>>>0).toString(16).padStart(6,'0').slice(-6)}">${esc(String(m.name))}</span><div class="kick-actions"><button data-kick="600000">10 min</button><button data-kick="3600000">1 h</button><button data-kick="86400000">24 h</button><button data-kick="" class="danger">Définitif</button></div></li>`).join('');
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
const chat=createChat($('.world-left') as HTMLElement,{
  send(text){if(!net)return false;if(!allowLocal())return false;net?.socket.emit('chat',{text});return true;},
  typing(){net?.socket.emit('chat:typing');},
  emote(emoji){net?.socket.emit('chat:emote',{emoji});},
  members:()=>[...members].filter(([id])=>id!==net?.socket.id).map(([id,m])=>({id,...m})),
  myName:()=>identity.name,
  onMention:ambience.mentionChime,
});
const board=createBoard($('.hud-top') as HTMLElement,{meId:()=>net?.socket.id??''});drawIcons();
if(matchMedia('(min-width:501px)').matches)chat.open();// visible d'emblée sur grand écran ; sur téléphone il couvrirait la scène, le bouton rond l'ouvre
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
  if(placingId)endPlacing();cafe?.dispose();$('#scene').innerHTML='';
  document.querySelectorAll('[data-room]').forEach((b: any)=>b.setAttribute('aria-pressed',String(roomKind(b.dataset.room)===room)));
  cafe=createCafe($('#scene'),onSceneState,{room,furniture:shop.placed,look:editing?previewLook??look:look});builtFurniture=JSON.stringify(shop.placed);
  cafe.onCell((col: number,row: number,arrived: boolean)=>{net?.socket.emit('move',{col,row});if(arrived)net?.socket.emit('position:save',{col,row});});
  ambience.applyLight();// la nouvelle scène naît à l'heure qu'il est, pas en plein midi
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
function enterRoom(next: RoomKind){room=next;save('gamitask.room',room);($('#guests-button') as HTMLElement).hidden=next!=='private';try{mountRoom();tasksUi.sync();renderShop();}catch(error){console.error(error);}}
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
    if(state.walking&&firstSteps){firstSteps=false;$('#recap').hidden=true;}// le premier pas vaut « compris »
    if(state.board===false)pomo.resumeMove();// le gros plan se ferme : un siège demandé entre-temps se prend maintenant
    if(state.seated)toast('Tu t’installes. Prends le temps qu’il faut.');
    if('hover' in state){const h=$('#hint');if(!state.hover)h.hidden=true;else{const r=$('.world').getBoundingClientRect(),t=state.hover.task,cat=t&&tasksUi.catOf(t.category);
      h.innerHTML=t?`<span class="cat-dot" style="--cat:${cat?cat.color:'#d8d3c3'}"></span><strong>${esc(decodeEntities(t.text))}</strong><small>${cat?cat.label:'Sans catégorie'}${t.kind==='daily'?' · chaque jour':t.kind==='habit'?' · habitude':''} · ${state.hover.up?'cliquer pour la retrouver':'cliquer pour lire le tableau'}</small>`:`<span class="cat-dot" style="--cat:#d2a754"></span><strong>${state.hover.hotspot!.title}</strong><small>${state.hover.hotspot!.sub}</small>`;
      h.hidden=false;h.style.left=`${state.hover.x-r.left}px`;h.style.top=`${state.hover.y-r.top}px`;}}
    if(state.hotspot==='mirror')openEditor();
    if(state.hotspot==='tasks')openDrawer(true);
    if(state.hotspot==='timer')$('#settings').click();
    if(state.hotspot==='shop')openDrawer(true,'shop');
    if(state.placing){placingCell=state.placing.cell;$('#place-ok').disabled=!placingCell;if(state.placing.refused)toast('Pas la place ici.');}
    if(state.focusTask){openDrawer(true);tasksUi.revealKind(state.focusTask);
      const li=document.querySelector(`#task-list li[data-id="${state.focusTask}"]`) as any;if(li){li.scrollIntoView({block:'nearest',behavior:'smooth'});li.classList.remove('flash');void li.offsetWidth;li.classList.add('flash');}}
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
$('#progress-chip').onclick=()=>{net.socket.emit('profile:request',{socketId:null});renderJournal();($('#progress-dialog') as HTMLDialogElement).showModal();};
// The task list lives in a drawer: opened from the HUD button, the counter in the room, or a slate.
let drawerTab='tasks';
function showTab(tab: string){drawerTab=tab;document.querySelectorAll('.drawer-tabs [data-tab]').forEach((b: any)=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));$('#tab-tasks').hidden=tab!=='tasks';$('#tab-shop').hidden=tab!=='shop';$('#drawer-title').innerHTML=tab==='shop'?'La petite<br>boutique.':'Mes petites<br>tâches.';if(tab==='shop')renderShop();}
function openDrawer(open=true,tab=drawerTab){$('#tasks-drawer').classList.toggle('open',open);$('#tasks-drawer').setAttribute('aria-hidden',String(!open));$('#open-tasks').setAttribute('aria-expanded',String(open));showTab(open?tab:drawerTab);if(open&&tab==='tasks')setTimeout(()=>$('#task-text').focus(),250);}
document.querySelectorAll('.drawer-tabs [data-tab]').forEach((b: any)=>b.onclick=()=>showTab(b.dataset.tab));
$('#open-tasks').onclick=()=>{if(!editing)openDrawer(!$('#tasks-drawer').classList.contains('open'));};
$('.drawer-close').onclick=()=>openDrawer(false);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!editing&&$('#tasks-drawer').classList.contains('open'))openDrawer(false);});
document.querySelectorAll('.close-dialog').forEach((b: any)=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',(e: any)=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));

// Progression: coins, XP, streak and achievements — the server owns the rules, the client only renders them.
const progress=createProgress();
// Le journal du jour : chaque gain, succès ou coup dur y laisse une ligne. Le lendemain il repart vide.
let journal=createJournal(load('gamitask.journal',null),today());
const JOURNAL_GLYPH: Record<string,string>={task:'✓',pomo:'⏱',achievement:'🏆',level:'✨',streak:'🔥',exhausted:'☕',rollover:'🌅'};
function note(e: {kind: 'task'|'pomo'|'achievement'|'level'|'streak'|'exhausted'|'rollover'; text: string; coins?: number; xp?: number}){
  journal=record(journal,e,today());save('gamitask.journal',journal);if($('#progress-dialog').open)renderJournal();
}
// Un focus paie en deux messages qui suivent sa ligne de quelques secondes : on les lui rattache.
function attachToLastPomo(field: 'coins'|'xp',delta: number){
  const e=journal.entries.at(-1);if(delta<=0||!e||e.kind!=='pomo'||e[field]!==undefined||Date.now()-e.at>5000)return;
  e[field]=delta;save('gamitask.journal',journal);if($('#progress-dialog').open)renderJournal();
}
function renderJournal(){
  const line=summaryLine(journal);$('#journal-summary').textContent=line;$('#journal-summary').hidden=!line;
  const items=journal.entries.slice(-40).reverse();
  $('#journal-list').innerHTML=items.map(e=>`<li><time>${timeLabel(e.at)}</time><i>${JOURNAL_GLYPH[e.kind]??''}</i><span>${esc(e.text)}</span><b>${[e.coins?`+${e.coins} pièce${e.coins>1?'s':''}`:'',e.xp?`+${e.xp} XP`:''].filter(Boolean).join(' · ')}</b></li>`).join('');
  $('#journal-empty').hidden=items.length>0;
}
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
  if(d.buy)net.socket.emit('shop:buy',{itemId:d.buy});
  else if(d.buyFurniture)net.socket.emit('furniture:buy',{itemId:d.buyFurniture});
  else if(d.hat){const hatId=shop.hat===d.hat?null:d.hat;net.socket.emit('cosmetic:equip',{hatId});
    shop.hat=hatId;look={...look,hat:hatId};saveLook();cafe?.setLook(look);renderShop();}// the server answers `player-hat` to the others only, so we apply it here
  else if(d.place||d.move)startPlacing(d.place||d.move!);
  else if(d.unplace)net.socket.emit('furniture:toggle-place',{itemId:d.unplace});
});
// Placement: the room shows its free tiles, you click one, then confirm. Moving a piece starts from where it stands.
function startPlacing(id:string){
  if(room!=='private'||!cafe||editing)return;placingId=id;placingCell=null;openDrawer(false);
  $('#place-text').innerHTML=`Clique une case pour ${shop.placed[id]?'déplacer':'poser'} <strong>${shopItem(id)!.emoji} ${shopItem(id)!.name}</strong>`;($('#place-ok') as HTMLButtonElement).disabled=true;($('#place-bar') as HTMLElement).hidden=false;drawIcons();
  cafe.startPlacing(id,shop.placed[id]??null,takenCells(shop,id));
}
$('#place-ok').onclick=()=>{if(!placingId||!placingCell||!canPlace(shop,placingId,placingCell))return;
  net.socket.emit(shop.placed[placingId]?'furniture:move':'furniture:place',{itemId:placingId,...toServerCell(placingCell)});endPlacing();};
function endPlacing(){cafe?.stopPlacing();placingId=null;placingCell=null;$('#place-bar').hidden=true;}
$('#place-cancel').onclick=()=>{endPlacing();openDrawer(true,'shop');};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&placingId){endPlacing();openDrawer(true,'shop');}});
// furniture is part of the baked room, so a change rebuilds your room in place, no iris
function rearrange(message: string){if(switching)return;try{mountRoom();tasksUi.sync();}catch(error){console.error(error);}toast(message);renderShop();}
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
  const low=progress.energy<25;document.body.classList.toggle('low-energy',low);document.body.classList.toggle('exhausted',progress.exhausted);
  if(low&&!progress.exhausted&&!warnedLow){warnedLow=true;toast(`Énergie basse : ${progress.energy}/50. À zéro, tu perds 30 % de tes pièces — un niveau gagné la recharge.`);}
  if(!low)warnedLow=false;
}
function rewardPomodoro(){net.socket.emit('pomodoro:complete');note({kind:'pomo',text:'Focus terminé'});}
renderProgress();
// Everything the server says, applied as-is.
function bindServerEvents(){
  const s=net.socket;
  // a remote's own hat counts as owned, so validation never strips what the server already accepted
  const remote=(p: Player)=>({name:p.name,color:p.color,hat:p.hat??null,look:p.look?loadLook(p.look,p.color,p.hat?[p.hat]:[]):undefined,col:p.col,row:p.row,state:p.state});
  s.on('room-state',players=>{cafe?.clearRemotes();members.clear();for(const p of players){members.set(p.id,{name:p.name,color:p.color});cafe?.addRemote(p.id,remote(p));cafe?.setTodo(p.id,p.pendingTaskIds?.length??0);}
    if(!chatRoomKnown){chatRoomKnown=true;chat.setRoom(roomLabel());}ready.room=true;maybeReady();
    // the server spawns us at a fixed tile and resets our state: tell everyone where we really stand, and what we're doing
    const at=cafe?.playerPosition()??{x:0,z:0};s.emit('move',toCell(at.x,at.z,room));s.emit('avatar-state',{state:pomo.avatarState()});});
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
  s.on('pomo:state',st=>pomo.onRoomState(st));
  s.on('pomo:tick',t=>pomo.onRoomTick(t));
  s.on('pomo:phase',p=>pomo.onRoomPhase(p));
  s.on('me:state',u=>{role=u.role;renderIdentity();});
  s.on('catalog:state',({items})=>{catalog=items;setCatalog(items);renderShop();workshop.refresh();// a changed recipe rebuilds the room; the server then resends who is in it
    if(furnitureSeen){try{mountRoom();tasksUi.sync();net.socket.emit('room:refresh');}catch(error){console.error(error);}}
    // Carved pieces need the boolean toolkit: fetch it once, then rebuild so the cuts show (they rendered solid meanwhile).
    if(!csgReady()&&items.some(i=>needsCsg(i.parts)))ensureCsg().then(()=>{if(cafe){try{mountRoom();tasksUi.sync();}catch(error){console.error(error);}}});});
  s.on('catalog:error',({message})=>toast(message));
  s.on('auth:invalid',logout);// a Google account without a valid token starts over as a guest
  s.on('room:info',({roomId})=>{pomo.resetRoom();// une autre salle, un autre pomodoro : on repart de zéro et la participation s'arrête
    if(pendingHome)return;// still on the way home: the server room is only a stop-over, no need to rebuild twice
    const here=kindOfRoomId(roomId,rooms,identity.userId);
    if(here!==room)enterRoom(here);// an unchanged kind (an unknown public id already reads as the café) never remounts
    // Room-manage panel is for the owner only — a private room can now also be a friend's, visited via an invite link.
    ($('#guests-button') as HTMLElement).hidden=!(here==='private'&&myPrivateRoom(rooms,identity.userId)?.id===roomId);
    chatRoomKnown=true;chat.setRoom(roomLabel());});
  s.on('tasks:state',({tasks:list,coins,energy,exhausted})=>{tasksUi.setList(list);setCoins(progress,coins);setEnergy(progress,energy);setExhausted(progress,!!exhausted);cafe?.setEnergy?.(progress.energy,progress.exhausted);ready.tasks=true;maybeReady();tasksUi.render();renderProgress();tasksUi.sync();});
  // Notes and timer settings started on the landing page follow the visitor in, once.
  s.on('tasks:state',()=>{const h=load('gamitask.landing.handoff',null);if(!h)return;localStorage.removeItem('gamitask.landing.handoff');
    for(const text of (h.notes??[]).slice(0,20))s.emit('task:add',{text,category:null,kind:'todo',difficulty:'easy'});
    if(h.durations)pomo.adoptDurations(h.durations);
    if(h.notes?.length)toast('Tes notes sont posées sur la table.');});
  s.on('task:added',t=>{tasksUi.added(t);tasksUi.render();tasksUi.sync();});
  s.on('task:scored',({task:t,coins,energy,xp,level,xpToNext,bossDamage})=>{const before=progress.coins,xpBefore=progress.xp;tasksUi.scored(t);setCoins(progress,coins);setXp(progress,{xp,level,xpToNext});setEnergy(progress,energy);cafe?.setEnergy?.(progress.energy,progress.exhausted);tasksUi.render();renderProgress();renderShop();tasksUi.sync();
    const dc=coins-before;if(dc>0||xp>0){ambience.rewardChime();note({kind:'task',text:t.text,coins:dc,xp:Math.max(0,xp-xpBefore)});const parts=[];if(dc>0)parts.push(`+${dc} pièces`);if(bossDamage>0)parts.push(`${bossDamage} dégâts au boss`);toast(`${t.kind==='daily'?'Fait pour aujourd’hui.':t.kind==='habit'?'Bien joué.':'C’est fait.'} ${parts.join(' · ')}`);}
    else if(t.kind==='habit')toast('Noté. Demain sera mieux.');});
  s.on('task:updated',t=>{tasksUi.updated(t);tasksUi.render();tasksUi.sync();});
  s.on('task:deleted',({taskId})=>{tasksUi.deleted(taskId);tasksUi.render();tasksUi.sync();});
  s.on('coins:update',({coins})=>{if(coins>progress.coins)ambience.rewardChime();attachToLastPomo('coins',coins-progress.coins);setCoins(progress,coins);renderProgress();renderShop();});
  s.on('energy:update',({energy})=>{setEnergy(progress,energy);renderProgress();cafe?.setEnergy?.(progress.energy,progress.exhausted);});
  s.on('energy:exhausted',({coins})=>{note({kind:'exhausted',text:'Épuisé·e — 30 % des pièces perdues'});setExhausted(progress,true);setCoins(progress,coins);renderProgress();renderShop();cafe?.setEnergy?.(progress.energy,true);later(()=>toast('Épuisé… tu as perdu 30 % de tes pièces. Repose-toi, demain ça repart.'),0);});
  s.on('day:rollover',({missed,energy,energyDelta})=>{setEnergy(progress,energy);renderProgress();cafe?.setEnergy?.(progress.energy,progress.exhausted);
    if(missed.length)note({kind:'rollover',text:`Hier : ${missed.length} quotidienne${missed.length>1?'s':''} oubliée${missed.length>1?'s':''}`});
    if(missed.length)showRecap(`Hier : ${missed.length} quotidienne${missed.length>1?'s':''} oubliée${missed.length>1?'s':''}${energyDelta<0?`, −${-energyDelta} énergie`:''}.`,`${missed.map(t=>t.text).slice(0,3).join(', ')}${missed.length>3?'…':''}`);});
  s.on('xp:update',u=>{const before=progress.level;if(u.xp>progress.xp||u.level>before)ambience.rewardChime();attachToLastPomo('xp',u.xp-progress.xp);setXp(progress,u);renderProgress();if(u.levelUp&&u.level>before){note({kind:'level',text:`Niveau ${u.level} — énergie rechargée`});cafe?.float('',`Niveau ${u.level}`,'#647557');later(()=>toast(`✨ Niveau ${u.level} ! Énergie rechargée.`),2600);}});
  s.on('streak:update',({streak,bonus})=>{if(bonus>5&&streak!==progress.streak)note({kind:'streak',text:`Série ×${streak}`});setStreak(progress,streak);renderProgress();toast(`Une petite victoire de plus.${bonus>5?` Série ×${streak}.`:''}`);});
  s.on('achievement:unlocked',a=>{if(unlock(progress,a.key)){note({kind:'achievement',text:`${a.icon} ${a.label}`});renderProgress();cafe?.float('',`${a.icon} ${a.label}`);later(()=>toast(`${a.icon} Succès : ${a.label} — ${a.desc}`),2600);}});
  s.on('profile:data',d=>{setAchievements(progress,d.achievements);setStreak(progress,d.streak);renderProgress();});
  s.on('room:full',()=>{if(ready.room){if(room!==prevRoom)enterRoom(prevRoom);// the iris already moved us: the server kept us where we were
      toast('Cette pièce est pleine pour le moment.');return;}// a refused switch leaves us where we are, no veil
    showVeil('Le café est plein pour le moment, on réessaie dans un instant…');setTimeout(()=>net.socket.emit('join',{name:identity.name,color:identity.color,col:0,row:0,userId:identity.userId,roomId:net.roomId(),tzOffsetMinutes:new Date().getTimezoneOffset()}),5000);});
  // `cosmetics:state` may carry the hat we owned before the purchase, so the equip waits for the state that lists the new one.
  s.on('cosmetics:state',u=>{setCosmetics(shop,u);
    if(wearNext&&shop.hats.includes(wearNext)){shop.hat=wearNext;net.socket.emit('cosmetic:equip',{hatId:wearNext});wearNext=null;}
    look=loadLook(u.look??look,identity.color,shop.hats);look={...look,hat:shop.hat};saveLook();if(!editing)cafe?.setLook(look);renderShop();});// the server owns the look, localStorage is only a cache; mid-edit the sheet owns the avatar
  s.on('shop:bought',({itemId})=>{const it=shopItem(itemId);if(it)toast(`${it.emoji} ${it.name} est à toi.`);if(HATS.some(h=>h.id===itemId))wearNext=itemId;});
  s.on('furniture:bought',({itemId})=>{const it=shopItem(itemId);if(it)toast(`${it.emoji} ${it.name} t’attend chez toi.`);});
  s.on('furniture:state',u=>{const before=JSON.stringify(shop.placed);setFurniture(shop,u);renderShop();const now=JSON.stringify(shop.placed);
    // the first snapshot after a (re)connect is not a move: rebuild silently if the room was baked without it, never toast
    if(!furnitureSeen){furnitureSeen=true;if(room==='private'&&now!==builtFurniture){try{mountRoom();tasksUi.sync();}catch(error){console.error(error);}}return;}
    if(room==='private'&&now!==before)rearrange('C’est posé.');});
}


// « Fenêtre » : un dialogue ouvert, ou le tableau de liège en gros plan. Tant qu'il y en a une, le personnage ne bouge pas.
const canMove=()=>!document.querySelector('dialog[open]')&&!cafe?.isViewingBoard?.();
const pomo=createPomodoro({cafe:()=>cafe,socket:()=>net?.socket,ambience,onComplete:rewardPomodoro,canMove,myName:()=>identity.name,
  onRoomFocusDone:others=>{chat.system(focusDoneLine(others));note({kind:'pomo',text:focusWithLine(others)});}});
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('close',()=>pomo.resumeMove()));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&cafe?.isViewingBoard?.())cafe.leaveBoard();});
// Sonde de développement : l'état de la scène et du pomodoro, lisibles depuis la console. Jamais en production.
if(import.meta.env.DEV)(window as any).gamitask={scene:()=>cafe,pomo,canMove};
// Tasks: the server holds the list, the client mirrors it as little order slips in the café.
const tasksUi=createTasksUi({cafe:()=>cafe,socket:()=>net.socket});
