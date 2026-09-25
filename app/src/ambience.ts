// L'ambiance du café : lumière et horloge, pluie, carillons, notifications système, et le panneau Paramètres qui les règle.
// Le balisage du panneau et des chips reste dans main.ts avec le reste du HUD ; ce module possède tout leur comportement.
import {$,load,save,toast} from './ui.ts';
import {nightness,clockLabel,momentLabel} from './daylight.ts';

export type PanelTab='rythme'|'ambiance'|'compte'|'aide';
export interface AmbienceDeps{
  cafe(): any;// la scène courante, ou null avant le premier montage — elle change à chaque salle
  onOpen(tab: PanelTab): void;// rafraîchit l'onglet ouvert (Compte, Rythme) à chaque ouverture du panneau
}
export type Ambience=ReturnType<typeof createAmbience>;

export function createAmbience(deps: AmbienceDeps){
  let audio: any,rain: any,rainGain: any,soundOn=false;

  // Two short notes when someone calls your name, only if the ambience sound is on (the audio context is already unlocked then).
  function mentionChime(){if(!soundOn||!audio||audio.state!=='running')return;
    for(const [i,freq] of [659.25,987.77].entries()){const osc=audio.createOscillator(),gain=audio.createGain(),t0=audio.currentTime+i*.13;
      osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(0,t0);gain.gain.linearRampToValueAtTime(.04,t0+.015);gain.gain.exponentialRampToValueAtTime(.001,t0+.34);
      osc.connect(gain);gain.connect(audio.destination);osc.start(t0);osc.stop(t0+.4);}}

  function openPanel(tab: PanelTab='rythme'){
    document.querySelectorAll('.panel-tabs [data-panel]').forEach((b: any)=>b.setAttribute('aria-selected',String(b.dataset.panel===tab)));
    document.querySelectorAll('.panel-pane').forEach((p: any)=>p.hidden=p.dataset.pane!==tab);
    deps.onOpen(tab);if(!$('#panel-dialog').open)($('#panel-dialog') as HTMLDialogElement).showModal();
  }
  $('#open-panel').onclick=()=>openPanel();
  document.querySelectorAll('.panel-tabs [data-panel]').forEach((b: any)=>b.onclick=()=>openPanel(b.dataset.panel));

  // La lumière de la scène suit l'heure, toujours.
  function applyLight(){const night=nightness();deps.cafe()?.setDaylight(night);$('.world').classList.toggle('evening',night>.5);}
  $('#clock').onclick=()=>openPanel('rythme');
  function renderClock(){$('#clock-time').textContent=clockLabel();$('#clock').setAttribute('title',`Heure locale · ${momentLabel()} — clique pour régler ton rythme`);}
  // Une minute de lumière à la fois : la courbe bouge lentement, inutile de la recalculer à chaque image.
  setInterval(()=>{renderClock();applyLight();},10000);
  renderClock();applyLight();

  // Optional generated rain: no remote audio, tracking, or autoplay.
  function ensureAudio(){try{audio??=new (window.AudioContext||(window as any).webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{});return audio;}catch{return null;}}
  type Chime='start'|'end'|'reward';
  const CHIMES: Record<Chime,{freqs: number[]; step: number; decay: number; peak: number}>={
    start:{freqs:[392,523.25],step:.14,decay:.9,peak:.045},
    end:{freqs:[523.25,659.25,783.99],step:.16,decay:.9,peak:.045},
    reward:{freqs:[659.25,987.77,1318.51],step:.075,decay:.45,peak:.035},// même sinus, plus haut et plus court : une petite pièce qui tombe
  };
  // L'ancien réglage unique sert de valeur de départ aux deux nouveaux.
  let sfx: boolean=load('gamitask.sfx',load('gamitask.alerts',true)),notifs: boolean=load('gamitask.notifs',load('gamitask.alerts',true));
  function chime(kind: Chime='end'){if(sfx&&audio)playChime(kind);}
  function playChime(kind: Chime){if(!ensureAudio()||!audio)return;const{freqs,step,decay,peak}=CHIMES[kind];
    for(const [i,freq] of freqs.entries()){const osc=audio.createOscillator(),gain=audio.createGain(),at=audio.currentTime+i*step;osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(peak,at+.02);gain.gain.exponentialRampToValueAtTime(.001,at+decay);osc.connect(gain);gain.connect(audio.destination);osc.start(at);osc.stop(at+decay+.1);}}
  // Un gain arrive souvent en deux messages (pièces puis XP) : une seule récompense sonore par salve.
  let lastReward=0;
  function rewardChime(){const now=Date.now();if(now-lastReward<600)return;lastReward=now;chime('reward');}
  // Notifications système : la permission est demandée au démarrage d'un focus, une fois qu'un premier a été mené au bout — jamais au premier clic.
  function askNotify(){try{if(notifs&&typeof Notification!=='undefined'&&Notification.permission==='default'){toast('Le café peut te prévenir quand un focus se termine — ton navigateur va te le demander.');Notification.requestPermission().catch(()=>{});}}catch{}}
  function notify(title: string,body: string){if(notifs)showNotify(title,body);}
  function showNotify(title: string,body: string){try{if(typeof Notification!=='undefined'&&Notification.permission==='granted')new Notification(title,{body,icon:'/favicon.svg',tag:'gamitask-pomo'});}catch{}}
  function renderAlerts(){$('#sfx').checked=sfx;$('#notifs').checked=notifs;}
  renderAlerts();
  $('#sfx').onchange=()=>{sfx=$('#sfx').checked;save('gamitask.sfx',sfx);if(sfx)playChime('start');toast(sfx?'Les carillons sont de retour.':'Carillons coupés. Les notifications restent.');};
  $('#notifs').onchange=()=>{notifs=$('#notifs').checked;save('gamitask.notifs',notifs);if(notifs)askNotify();toast(notifs?'Les notifications sont activées.':'Notifications coupées. Les carillons restent.');};
  function renderRain(on: boolean){$('#rain-chip').setAttribute('aria-pressed',String(on));$('#rain-chip').classList.toggle('playing',on);}
  function setRain(on: boolean){
    const ctx=ensureAudio();if(!ctx){renderRain(false);toast('Le son n’est pas disponible dans ce navigateur.');return;}
    if(!rain){const buffer=ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate),data=buffer.getChannelData(0);let last=0;for(let i=0;i<data.length;i++){last=(last+Math.random()*.04-.02)/1.02;data[i]=last*4;}rain=ctx.createBufferSource();rain.buffer=buffer;rain.loop=true;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1600;rainGain=ctx.createGain();rainGain.gain.value=0;rain.connect(filter);filter.connect(rainGain);rainGain.connect(ctx.destination);rain.start();}
    soundOn=on;rainGain.gain.setTargetAtTime(on?.35:0,ctx.currentTime,.3);renderRain(on);toast(on?'Un fond de pluie pour se concentrer.':'Le calme, tout simplement.');
  }
  $('#rain-chip').onclick=()=>setRain(!soundOn);

  return {chime,notify,askNotify,ensureAudio,rewardChime,openPanel,applyLight,mentionChime};
}
