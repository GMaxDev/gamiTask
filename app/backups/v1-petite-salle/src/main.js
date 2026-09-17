import {createIcons,Coffee,Sun,Moon,Plus,Minus,LocateFixed,Volume2,VolumeX,Settings2,RotateCcw,Play,Pause,Check,MousePointer2,Move,Leaf,Headphones,X,HelpCircle,Clock3,ArrowUpRight} from 'lucide';
import {createCafe} from './scene.js';
import {createTimer,remainingSeconds,toggleTimer,resetTimer} from './timer.js';
import './style.css';

const icons={Coffee,Sun,Moon,Plus,Minus,LocateFixed,Volume2,VolumeX,Settings2,RotateCcw,Play,Pause,Check,MousePointer2,Move,Leaf,Headphones,X,HelpCircle,Clock3,ArrowUpRight};
const icon=(name,cls='')=>`<i data-lucide="${name}" class="${cls}" aria-hidden="true"></i>`;
const $=s=>document.querySelector(s);
function drawIcons(){createIcons({icons,attrs:{'stroke-width':1.65}});}
function load(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function save(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{/* The experience also works without persistent browser storage. */}}
const today=()=>new Date().toLocaleDateString('sv-SE');
let timer=createTimer(load('gamitask.timer',{})),stats=load('gamitask.stats',{});
if(stats.date!==today())stats={date:today(),sessions:0,minutes:0};
stats.sessions=Number.isFinite(stats.sessions)?Math.max(0,stats.sessions):0;stats.minutes=Number.isFinite(stats.minutes)?Math.max(0,stats.minutes):0;

$('#app').innerHTML=`
  <header class="topbar">
    <a class="brand" href="/" aria-label="gamitask, accueil"><span class="brand-mark">${icon('coffee')}</span><span>gami<span class="brand-light">task</span><small>DU TEMPS POUR L’ESSENTIEL</small></span></a>
    <div class="header-center"><span class="tiny-sun">✳</span> Un petit café. Un peu de concentration.</div>
    <div class="header-right"><span class="private"><span class="status-dot"></span> Espace personnel</span><span class="profile" title="Ton avatar">M<span></span></span></div>
  </header>
  <main class="workspace">
    <section class="world" aria-label="Ton café">
      <div class="world-heading"><div class="eyebrow"><span></span> TON PETIT REFUGE</div><h1>Le café <em>Petit Jour.</em></h1><p>Installe-toi. Le reste peut attendre.</p></div>
      <div class="scene" id="scene"><div class="loading">Le café ouvre ses portes…</div></div>
      <div class="room-tag">${icon('coffee')} <span>Un café pour soi</span><span class="tag-dot">•</span><span class="muted">À ton rythme</span></div>
      <div class="view-controls"><button id="follow" class="icon-button active" title="Activer ou désactiver le suivi du personnage" aria-label="Suivre le personnage" aria-pressed="true">${icon('locate-fixed')}</button><span class="divider"></span><button id="zoom-out" class="icon-button" aria-label="Dézoomer">${icon('minus')}</button><output id="zoom-value">100%</output><button id="zoom-in" class="icon-button" aria-label="Zoomer">${icon('plus')}</button><span class="divider"></span><button id="recenter" class="icon-button" title="Vue initiale" aria-label="Recentrer la vue">${icon('rotate-ccw')}</button></div>
      <div class="world-bottom"><div class="ambience-controls"><button id="light" class="ambience-button">${icon('sun')}<span>Lumière du jour</span></button><span class="divider"></span><button id="sound" class="ambience-button" aria-pressed="false">${icon('headphones')}<span>Pluie douce</span><span class="sound-bars"><b></b><b></b><b></b></span></button></div><button id="help" class="help-button" aria-label="Comment se déplacer">${icon('help-circle')}</button></div>
      <div class="movement-hint">${icon('mouse-pointer-2')} Cliquer pour marcher ou s’asseoir <span>·</span> ${icon('move')} Glisser pour explorer</div>
      <div id="toast" class="toast" role="status"></div>
    </section>
    <aside class="sidebar" aria-label="Concentration">
      <div class="sidebar-title"><span class="eyebrow">LE TEMPS DE SE POSER</span><span class="leaf">${icon('leaf')}</span></div>
      <h2>Une chose<br>à la fois.</h2><p class="sidebar-intro">Les petites avancées font les beaux projets.</p>
      <section class="timer-card" aria-label="Pomodoro">
        <div class="card-top"><span>${icon('clock-3')} Mon pomodoro</span><button id="settings" class="icon-button" aria-label="Régler les durées">${icon('settings-2')}</button></div>
        <div class="timer-tabs" role="group" aria-label="Type de session"><button data-mode="focus" aria-pressed="true">Focus</button><button data-mode="short" aria-pressed="false">Pause</button><button data-mode="long" aria-pressed="false">Longue</button></div>
        <div class="timer-dial"><svg viewBox="0 0 220 220" aria-hidden="true"><circle class="dial-track" cx="110" cy="110" r="97"/><circle id="dial-progress" cx="110" cy="110" r="97"/></svg><div class="dial-content"><span id="timer-kicker">ON Y VA DOUCEMENT</span><output id="timer-value" aria-label="Temps restant">25:00</output><span id="session-label">Session de concentration</span></div><span class="dial-leaf">${icon('leaf')}</span></div>
        <div class="timer-actions"><button id="start" class="primary">${icon('play')}<span>C’est parti</span></button><button id="reset" class="reset-button" aria-label="Réinitialiser le minuteur">${icon('rotate-ccw')}</button></div>
        <div class="session-dots"><span class="filled"></span><span></span><span></span><span></span><small id="cycle-label">Un pas après l’autre</small></div>
      </section>
      <section class="intention-card"><label class="eyebrow" for="intention">MA PETITE INTENTION</label><div class="intention-row"><button id="intention-check" class="check-button" aria-label="Marquer mon intention comme terminée" aria-pressed="false">${icon('check')}</button><input id="intention" maxlength="90" placeholder="Sur quoi veux-tu avancer ?" autocomplete="off" /></div><span class="intention-note">Juste une chose, pour commencer.</span></section>
      <div class="day-stats"><div><strong id="sessions">0</strong><span>sessions aujourd’hui</span></div><span class="stat-divider"></span><div><strong><span id="minutes">0</span><small> min</small></strong><span>rien que pour toi</span></div></div>
      <div class="sidebar-footer">${icon('coffee')}<p>Pas besoin d’aller vite.<br><strong>Juste de faire un petit pas.</strong></p></div>
    </aside>
  </main>
  <dialog id="settings-dialog"><form id="settings-form"><div class="dialog-heading"><h2>Ton propre rythme.</h2><button type="button" class="icon-button close-dialog" aria-label="Fermer">${icon('x')}</button></div><p>Choisis la durée de tes sessions, en minutes.</p><label>Concentration<input name="focus" type="number" min="1" max="90" required /></label><label>Petite pause<input name="short" type="number" min="1" max="90" required /></label><label>Longue pause<input name="long" type="number" min="1" max="90" required /></label><p class="form-note">Enregistrer remet le minuteur au début.</p><button type="submit" class="primary">Enregistrer mon rythme</button></form></dialog>
  <dialog id="help-dialog"><div class="dialog-heading"><h2>Bienvenue au café.</h2><button class="icon-button close-dialog" aria-label="Fermer">${icon('x')}</button></div><p>Ce petit coin est à toi. Prends tes marques.</p><ul class="help-list"><li>${icon('mouse-pointer-2')}<span><strong>Un clic au sol ou sur un siège</strong>Ton personnage s’y rend en contournant les meubles, et s’installe si c’est une chaise ou le canapé.</span></li><li>${icon('move')}<span><strong>Cliquer et glisser</strong>Explore le café en déplaçant la caméra.</span></li><li>${icon('plus')}<span><strong>Molette ou boutons + / −</strong>Rapproche-toi ou prends un peu de recul.</span></li><li>${icon('locate-fixed')}<span><strong>Suivi du personnage</strong>Réactive-le pour que la caméra t’accompagne.</span></li></ul><p class="form-note">Au clavier : sélectionne la scène, puis utilise les flèches. L’orientation de la vue reste toujours fixe.</p><button class="primary close-dialog">Je m’installe</button></dialog>
`;
drawIcons();
let toastTimeout;
let audio,rain,rainGain,soundOn=false;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('#toast').classList.remove('visible'),4500);}
let cafe;
try{
  cafe=createCafe($('#scene'),state=>{
    if(state.seated)toast('Tu t’installes. Prends le temps qu’il faut.');
    if(state.zoom){$('#zoom-value').textContent=`${Math.round(state.zoom*100)}%`;$('#follow').classList.toggle('active',state.follow);$('#follow').setAttribute('aria-pressed',String(state.follow));}
  });
  $('.loading').remove();
}catch(error){console.error(error);$('.loading').innerHTML='Le café 3D n’a pas pu démarrer.<br>Vérifie que l’accélération graphique est activée dans ton navigateur.';}
$('#zoom-in').onclick=()=>cafe?.zoomIn();$('#zoom-out').onclick=()=>cafe?.zoomOut();$('#recenter').onclick=()=>cafe?.recenter();$('#follow').onclick=()=>cafe?.setFollow();
$('#light').onclick=()=>{if(!cafe)return;const evening=cafe.toggleLight();$('#light').innerHTML=icon(evening?'moon':'sun')+`<span>${evening?'Douce soirée':'Lumière du jour'}</span>`;$('.world').classList.toggle('evening',evening);drawIcons();};
$('#help').onclick=()=>$('#help-dialog').showModal();
document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));

function persistTimer(){save('gamitask.timer',timer);}
let lastRunning=null,lastMode=null,lastShown=null;
function renderTimer(){
  const remaining=remainingSeconds(timer),running=timer.endAt!==null;
  if(running&&remaining===0){
    if(stats.date!==today())stats={date:today(),sessions:0,minutes:0};
    if(timer.mode==='focus'){stats.sessions++;stats.minutes+=timer.durations.focus;save('gamitask.stats',stats);toast('Une petite victoire de plus. Tu as bien mérité une pause.');resetTimer(timer,stats.sessions%4===0?'long':'short');}
    else {toast('La pause est terminée. On reprend quand tu veux.');resetTimer(timer,'focus');}
    persistTimer();chime();return renderTimer();
  }
  const text=`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
  if(text!==lastShown){$('#timer-value').textContent=text;lastShown=text;}
  const title=running?`${text} · ${timer.mode==='focus'?'Focus':'Pause'} — gamitask`:'gamitask — Le café des petites victoires';
  if(document.title!==title)document.title=title;
  $('#dial-progress').style.strokeDashoffset=609.47*(1-remaining/(timer.durations[timer.mode]*60));
  if(lastRunning!==running||lastMode!==timer.mode){
    $('#start').innerHTML=icon(running?'pause':'play')+`<span>${running?'Faire une pause':remaining<timer.durations[timer.mode]*60?'Reprendre':timer.mode==='focus'?'C’est parti':'Prendre une pause'}</span>`;
    $('#timer-kicker').textContent=running?(timer.mode==='focus'?'UN PETIT PAS À LA FOIS':'PRENDS UNE RESPIRATION'):'ON Y VA DOUCEMENT';
    $('#session-label').textContent=timer.mode==='focus'?'Session de concentration':timer.mode==='short'?'Une petite respiration':'Une pause bien méritée';
    document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('selected',b.dataset.mode===timer.mode);b.setAttribute('aria-pressed',String(b.dataset.mode===timer.mode));});
    $('.timer-card').classList.toggle('running',running);drawIcons();lastRunning=running;lastMode=timer.mode;
  }
  $('#sessions').textContent=stats.sessions;$('#minutes').textContent=stats.minutes;
  const cycle=stats.sessions%4||(stats.sessions?3:0);// a completed cycle of four keeps every dot lit instead of dropping back to one
  document.querySelectorAll('.session-dots > span').forEach((s,i)=>s.classList.toggle('filled',i<=cycle));
  $('#cycle-label').textContent=stats.sessions?`${stats.sessions} petite${stats.sessions>1?'s':''} victoire${stats.sessions>1?'s':''}`:'Un pas après l’autre';
}
$('#start').onclick=()=>{ensureAudio();toggleTimer(timer);persistTimer();renderTimer();};
$('#reset').onclick=()=>{resetTimer(timer);persistTimer();lastRunning=null;renderTimer();};
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{resetTimer(timer,b.dataset.mode);persistTimer();lastRunning=null;renderTimer();});
$('#settings').onclick=()=>{for(const [key,value] of Object.entries(timer.durations))$('#settings-form').elements[key].value=value;$('#settings-dialog').showModal();};
$('#settings-form').onsubmit=e=>{e.preventDefault();for(const key of Object.keys(timer.durations))timer.durations[key]=Number($('#settings-form').elements[key].value);resetTimer(timer);persistTimer();lastRunning=null;renderTimer();$('#settings-dialog').close();toast('Ton nouveau rythme est prêt.');};
setInterval(renderTimer,250);document.addEventListener('visibilitychange',renderTimer);renderTimer();

let intention=load('gamitask.intention',{text:'',done:false});if(!intention||typeof intention.text!=='string')intention={text:'',done:false};
$('#intention').value=intention.text;
function renderIntention(){$('#intention-check').classList.toggle('done',Boolean(intention.done));$('#intention-check').setAttribute('aria-pressed',String(Boolean(intention.done)));$('#intention').classList.toggle('done',Boolean(intention.done));}
$('#intention').oninput=e=>{intention={text:e.target.value,done:false};save('gamitask.intention',intention);renderIntention();};
$('#intention-check').onclick=()=>{if(!intention.text.trim()){$('#intention').focus();return;}intention.done=!intention.done;save('gamitask.intention',intention);renderIntention();if(intention.done)toast('C’est fait. Savoure cette petite victoire.');};renderIntention();

// Optional generated rain: no remote audio, tracking, or autoplay.
function ensureAudio(){try{audio??=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{});return audio;}catch{return null;}}
function chime(){if(!audio||audio.state!=='running')return;for(const [i,freq] of [523.25,659.25,783.99].entries()){const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(0,audio.currentTime+i*.16);gain.gain.linearRampToValueAtTime(.045,audio.currentTime+i*.16+.02);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+i*.16+.9);osc.connect(gain);gain.connect(audio.destination);osc.start(audio.currentTime+i*.16);osc.stop(audio.currentTime+i*.16+1);}}
$('#sound').onclick=()=>{
  const ctx=ensureAudio();if(!ctx){toast('Le son n’est pas disponible dans ce navigateur.');return;}
  if(!rain){const buffer=ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate),data=buffer.getChannelData(0);let last=0;for(let i=0;i<data.length;i++){last=(last+Math.random()*.04-.02)/1.02;data[i]=last*4;}rain=ctx.createBufferSource();rain.buffer=buffer;rain.loop=true;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1600;rainGain=ctx.createGain();rainGain.gain.value=0;rain.connect(filter);filter.connect(rainGain);rainGain.connect(ctx.destination);rain.start();}
  soundOn=!soundOn;rainGain.gain.setTargetAtTime(soundOn?.35:0,ctx.currentTime,.3);$('#sound').setAttribute('aria-pressed',String(soundOn));$('#sound').classList.toggle('playing',soundOn);toast(soundOn?'Un fond de pluie pour se concentrer.':'Le calme, tout simplement.');
};
