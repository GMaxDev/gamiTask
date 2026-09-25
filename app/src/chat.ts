// The room chat: a discreet panel bottom-left, plus the pure helpers the panel and the tests share.
// The server escapes <>&"' before echoing a message, so every text goes through decodeEntities() and lands via textContent — never innerHTML.
import {hexOf} from './ui.ts';
export interface ChatMsg{id: string; name: string; color: number; text: string; ts: number; mine: boolean}
export interface Member{id: string; name: string; color: number}
export interface ChatDeps{send(text: string): boolean; typing(): void; emote(emoji: string): void; members(): Member[]; myName(): string; onMention?(): void}
export interface Chat{open(): void; close(): void; toggle(): void; focus(): void; isOpen(): boolean; add(msg: ChatMsg): void; system(text: string): void; typing(id: string,name: string): void; setRoom(label: string): void; clear(): void; emotes: string[]; dispose(): void}

const ENTITIES: Record<string,string>={'&lt;':'<','&gt;':'>','&amp;':'&','&quot;':'"','&#39;':'\'','&#x27;':'\''};
export const decodeEntities=(s: string): string=>s.replace(/&(?:lt|gt|amp|quot|#39|#x27);/g,m=>ENTITIES[m]??m);

const MENTION_RE=/(?<=^|\s)@[\p{L}\p{N}_-]+/gu;
const QUERY_RE=/(?:^|\s)@([^\s]{0,20})$/u;
export function mentionQuery(value: string,caret: number): {start: number; query: string}|null{
  const m=QUERY_RE.exec(value.slice(0,caret));
  return m?{start:caret-m[1].length-1,query:m[1]}:null;
}
export function applyMention(value: string,start: number,caret: number,name: string): {value: string; caret: number}{
  const head=value.slice(0,start)+'@'+name+' ';
  return {value:head+value.slice(caret),caret:head.length};
}
const escapeRe=(s: string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function mentionsMe(text: string,myName: string): boolean{
  // same boundaries as segments(): a mention only counts at the start or after a space, so what is highlighted is what pings
  return myName.trim()?new RegExp(`(^|\\s)@${escapeRe(myName.trim())}(?![\\p{L}\\p{N}_-])`,'iu').test(text):false;
}
export function segments(text: string): {kind: 'text'|'mention'; value: string}[]{
  const out: {kind: 'text'|'mention'; value: string}[]=[];let last=0;
  for(const m of text.matchAll(MENTION_RE)){
    if(m.index>last)out.push({kind:'text',value:text.slice(last,m.index)});
    out.push({kind:'mention',value:m[0]});last=m.index+m[0].length;
  }
  if(last<text.length)out.push({kind:'text',value:text.slice(last)});
  return out;
}
export function createThread(){
  const MAX=200,list: ChatMsg[]=[];
  return {list,MAX,push(msg: ChatMsg){list.push(msg);if(list.length>MAX)list.splice(0,list.length-MAX);},clear(){list.length=0;}};
}

export const EMOTES=['👋','😄','❤️','👍','☕','🍅','🎉','😴'];
const hhmm=(ts: number)=>new Date(ts).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
const SEPARATORS: Record<string,string>={'CHEZ TOI':'Tu es chez toi','AU JARDIN':'Tu es au jardin'};

export function createChat(host: HTMLElement,deps: ChatDeps): Chat{
  const root=document.createElement('section');root.id='chat';root.className='chat';root.setAttribute('aria-label','Chat de la pièce');
  root.innerHTML=`<button class="chat-toggle" aria-expanded="false" aria-label="Chat de la pièce"><i data-lucide="message-circle" aria-hidden="true"></i><span class="chat-unread" hidden>0</span></button>
  <div class="chat-panel">
    <div class="chat-head"><span class="eyebrow" id="chat-room">AU CAFÉ</span><button type="button" class="icon-button chat-collapse" aria-label="Replier"><i data-lucide="chevron-down" aria-hidden="true"></i></button></div>
    <ol class="chat-list" id="chat-list" aria-live="polite"></ol>
    <p class="chat-typing" id="chat-typing" hidden></p>
    <form class="chat-form" id="chat-form" autocomplete="off">
      <button type="button" class="icon-button chat-emote-btn" aria-label="Emotes"><i data-lucide="smile" aria-hidden="true"></i></button>
      <input id="chat-input" maxlength="200" placeholder="Dire quelque chose…" aria-label="Message" />
      <button type="submit" class="icon-button chat-send" aria-label="Envoyer"><i data-lucide="send" aria-hidden="true"></i></button>
      <div class="chat-emotes" id="chat-emotes" hidden role="listbox" aria-label="Emotes"></div>
      <ul class="chat-mentions" id="chat-mentions" hidden role="listbox" aria-label="Mentionner"></ul>
    </form>
    <p class="chat-warn" id="chat-warn" hidden>Doucement, une chose à la fois.</p>
  </div>`;
  host.prepend(root);
  const q=<T extends HTMLElement>(s: string)=>root.querySelector(s) as T;
  const toggleBtn=q<HTMLButtonElement>('.chat-toggle'),unread=q<HTMLElement>('.chat-unread'),eyebrow=q<HTMLElement>('#chat-room');
  const list=q<HTMLElement>('#chat-list'),typingEl=q<HTMLElement>('#chat-typing'),warn=q<HTMLElement>('#chat-warn');
  const form=q<HTMLFormElement>('#chat-form'),input=q<HTMLInputElement>('#chat-input'),sendBtn=q<HTMLButtonElement>('.chat-send');
  const emotesEl=q<HTMLElement>('#chat-emotes'),mentionsEl=q<HTMLElement>('#chat-mentions');
  const thread=createThread();
  let open=false,unreadCount=0,lastTyping=0,warnTimer: ReturnType<typeof setTimeout>|undefined,mentionStart=-1,picked=0,lastQuery: string|null=null,matches: Member[]=[];
  const typers=new Map<string,{name: string; at: number}>();// keyed by socket id: two people may share a pseudo

  for(const e of EMOTES){const b=document.createElement('button');b.type='button';b.className='chat-emote';b.setAttribute('role','option');b.setAttribute('aria-selected','false');b.textContent=e;b.title=`Envoyer ${e}`;b.onclick=()=>{deps.emote(e);showEmotes(false);input.focus();};emotesEl.append(b);}

  function atBottom(){return list.scrollHeight-list.scrollTop-list.clientHeight<24;}
  function renderMsg(msg: ChatMsg,text: string,mentioned: boolean){
    const li=document.createElement('li');
    if(msg.mine)li.classList.add('mine');
    if(mentioned)li.classList.add('mention-me');
    const dot=document.createElement('span');dot.className='chat-dot';dot.style.setProperty('--c',hexOf(msg.color));
    const who=document.createElement('strong');who.textContent=msg.name;
    const body=document.createElement('span');body.className='chat-text';
    for(const s of segments(text)){const e=document.createElement('span');if(s.kind==='mention')e.className='chat-at';e.textContent=s.value;body.append(e);}
    const time=document.createElement('time');time.dateTime=new Date(msg.ts).toISOString();time.textContent=hhmm(msg.ts);
    li.append(dot,who,body,time);return li;
  }
  function add(msg: ChatMsg){
    const stick=atBottom(),text=decodeEntities(msg.text),mentioned=!msg.mine&&mentionsMe(text,deps.myName());
    thread.push(msg);
    const rows=list.querySelectorAll('li:not(.chat-sep):not(.chat-system)');if(rows.length>=thread.MAX)rows[0].remove();// the separator and system lines stay, only messages scroll out
    list.append(renderMsg(msg,text,mentioned));if(stick)list.scrollTop=list.scrollHeight;
    if(typers.delete(msg.id))renderTyping();
    if(mentioned)deps.onMention?.();
    if(!open&&!msg.mine){unreadCount++;unread.textContent=String(Math.min(99,unreadCount));unread.hidden=false;}
  }
  // A discreet line in the thread: no pseudo, no bubble, never an unread.
  function system(text: string){
    const stick=atBottom(),li=document.createElement('li');li.className='chat-system';li.textContent=text;
    const rows=list.querySelectorAll('li.chat-system');if(rows.length>=20)rows[0].remove();// bounded like the thread, without eating a message
    list.append(li);if(stick)list.scrollTop=list.scrollHeight;
  }
  function renderTyping(){
    const now=Date.now();
    for(const [id,t] of typers)if(now-t.at>=3000)typers.delete(id);// dropped here, so the 1 Hz tick falls silent on its own
    const names=[...typers.values()].map(t=>t.name);
    typingEl.hidden=names.length===0;if(!names.length)return;
    typingEl.textContent=names.length===1?`${names[0]} écrit…`:names.length===2?`${names[0]} et ${names[1]} écrivent…`:'plusieurs personnes écrivent…';
  }
  function showEmotes(on: boolean){emotesEl.hidden=!on;if(on)showMentions([]);}
  function showMentions(found: Member[]){
    matches=found;mentionsEl.hidden=found.length===0;mentionsEl.replaceChildren();
    if(!found.length){mentionStart=-1;return;}
    picked=Math.min(picked,found.length-1);
    found.forEach((m,i)=>{const li=document.createElement('li');li.setAttribute('role','option');li.setAttribute('aria-selected',String(i===picked));if(i===picked)li.classList.add('on');
      const dot=document.createElement('span');dot.className='chat-dot';dot.style.setProperty('--c',hexOf(m.color));
      const label=document.createElement('span');label.textContent=m.name;li.append(dot,label);
      li.onmousedown=e=>{e.preventDefault();pick(i);};mentionsEl.append(li);});
  }
  function refreshMentions(){
    const found=mentionQuery(input.value,input.selectionStart??input.value.length);
    if(!found){lastQuery=null;showMentions([]);return;}
    if(found.query!==lastQuery){lastQuery=found.query;picked=0;}
    mentionStart=found.start;const qy=found.query.toLowerCase();
    showMentions(deps.members().filter(m=>m.name.toLowerCase().includes(qy)).slice(0,6));
  }
  function pick(i: number){
    const m=matches[i];if(!m||mentionStart<0)return;
    const next=applyMention(input.value,mentionStart,input.selectionStart??input.value.length,m.name);
    input.value=next.value;input.setSelectionRange(next.caret,next.caret);showMentions([]);input.focus();
  }
  function warned(){
    warn.hidden=false;sendBtn.disabled=true;clearTimeout(warnTimer);
    warnTimer=setTimeout(()=>{warn.hidden=true;sendBtn.disabled=false;},1000);
  }
  function submit(){
    const text=input.value.trim();if(!text)return;
    if(!deps.send(text)){warned();return;}
    input.value='';showMentions([]);showEmotes(false);
  }
  function setOpen(on: boolean){
    open=on;root.classList.toggle('open',on);toggleBtn.setAttribute('aria-expanded',String(on));
    if(on){unreadCount=0;unread.hidden=true;list.scrollTop=list.scrollHeight;}else{showEmotes(false);showMentions([]);}
  }

  toggleBtn.onclick=()=>setOpen(!open);
  q<HTMLButtonElement>('.chat-collapse').onclick=()=>{setOpen(false);toggleBtn.focus();};
  q<HTMLButtonElement>('.chat-emote-btn').onclick=()=>showEmotes(emotesEl.hidden);
  form.onsubmit=e=>{e.preventDefault();submit();};
  input.oninput=()=>{refreshMentions();const now=Date.now();if(input.value.trim()&&now-lastTyping>2000){lastTyping=now;deps.typing();}};
  input.onblur=()=>showMentions([]);
  input.onkeydown=e=>{
    if(!mentionsEl.hidden){
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();picked=(picked+(e.key==='ArrowDown'?1:matches.length-1))%matches.length;showMentions(matches);return;}
      if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();pick(picked);return;}
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();showMentions([]);return;}
    }
    if(e.key==='Escape'){e.stopPropagation();if(!emotesEl.hidden){showEmotes(false);return;}setOpen(false);toggleBtn.focus();}
  };
  const tick=setInterval(()=>{if(typers.size)renderTyping();},1000);

  return {
    open:()=>setOpen(true),close:()=>setOpen(false),toggle:()=>setOpen(!open),focus:()=>input.focus(),isOpen:()=>open,
    add,system,typing(id: string,name: string){typers.set(id,{name,at:Date.now()});renderTyping();},
    setRoom(label: string){
      thread.clear();list.replaceChildren();typers.clear();renderTyping();
      eyebrow.textContent=label;
      const sep=document.createElement('li');sep.className='chat-sep';sep.textContent=SEPARATORS[label]??'Tu es au café';list.append(sep);
    },
    clear(){thread.clear();list.replaceChildren();},
    emotes:EMOTES,
    dispose(){clearInterval(tick);clearTimeout(warnTimer);root.remove();},
  };
}
