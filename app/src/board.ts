// The room leaderboard: who earns coins here, live. The server sorts and sends the whole room, we only pick what fits the card.

export interface Entry{id: string; name: string; color: number; coins: number; state: string}
export interface BoardDeps{meId(): string}
export interface Board{update(entries: Entry[]): void; open(): void; close(): void; toggle(): void; isOpen(): boolean; dispose(): void}

/** 1-based place in the board the server already sorted, null when that id is not in the room. */
export function rankOf(entries: Entry[],id: string): number|null{
  const i=entries.findIndex(e=>e.id===id);return i<0?null:i+1;
}
/** The head of the board, with my own row taking the last slot when I am below it — you always see where you stand. */
export function top(entries: Entry[],n: number,meId: string): Entry[]{
  const head=entries.slice(0,n);
  if(head.length<n||head.some(e=>e.id===meId))return head;
  const mine=entries.find(e=>e.id===meId);
  return mine?[...head.slice(0,n-1),mine]:head;
}
/** Did my own rank move between two boards? null when it did not, or when I am missing from either side. */
export function delta(prev: Entry[]|null,next: Entry[],meId: string): 'up'|'down'|null{
  if(!prev)return null;
  const a=rankOf(prev,meId),b=rankOf(next,meId);
  if(a===null||b===null||a===b)return null;
  return b<a?'up':'down';
}

const hex=(c: number)=>'#'+(c>>>0).toString(16).padStart(6,'0').slice(-6);
const STATES: Record<string,{icon: string; title: string}>={focus:{icon:'flame',title:'En concentration'},collective:{icon:'flame',title:'En concentration avec la salle'},pause:{icon:'coffee',title:'En pause'}};

export function createBoard(host: HTMLElement,deps: BoardDeps): Board{
  const anchor=document.createElement('div');anchor.className='board-anchor';
  anchor.innerHTML=`<button id="board-chip" class="board-chip" aria-haspopup="dialog" aria-expanded="false" aria-label="Classement de la pièce"><i data-lucide="trophy" aria-hidden="true"></i><span id="board-rank">—</span></button>
  <div id="board-card" class="board-card" role="dialog" aria-label="Classement de la pièce" hidden>
    <div class="board-head"><span class="eyebrow">DANS LA PIÈCE</span><button type="button" class="icon-button board-close" aria-label="Fermer"><i data-lucide="x" aria-hidden="true"></i></button></div>
    <ol id="board-list" class="board-list"></ol>
    <p class="board-note">Les pièces gagnées ici, en direct.</p>
  </div>`;
  const after=host.querySelector('#progress-chip');
  if(after)after.after(anchor);else host.append(anchor);
  const q=<T extends HTMLElement>(s: string)=>anchor.querySelector(s) as T;
  const chip=q<HTMLButtonElement>('#board-chip'),card=q<HTMLElement>('#board-card'),rankEl=q<HTMLElement>('#board-rank'),list=q<HTMLElement>('#board-list');
  let open=false,entries: Entry[]=[],prev: Entry[]|null=null,bumpTimer: ReturnType<typeof setTimeout>|undefined;

  function render(){
    const me=deps.meId(),rank=rankOf(entries,me);
    rankEl.textContent=rank?`#${rank}`:'—';
    list.replaceChildren();
    for(const e of top(entries,5,me)){
      const li=document.createElement('li');if(e.id===me)li.classList.add('me');
      const pos=document.createElement('span');pos.className='board-pos';pos.textContent=String(rankOf(entries,e.id)??'');
      const dot=document.createElement('span');dot.className='chat-dot';dot.style.setProperty('--c',hex(e.color));
      const name=document.createElement('span');name.className='board-name';name.textContent=e.name;
      const st=document.createElement('span');st.className='board-state';
      const shown=STATES[e.state];
      if(shown){st.title=shown.title;st.innerHTML=`<i data-lucide="${shown.icon}" aria-hidden="true"></i>`;}
      const coins=document.createElement('span');coins.className='board-coins';coins.textContent=String(e.coins);
      li.append(pos,dot,name,st,coins);list.append(li);
    }
  }
  function setOpen(on: boolean){open=on;card.hidden=!on;chip.setAttribute('aria-expanded',String(on));}
  function onDocDown(ev: MouseEvent){if(open&&!anchor.contains(ev.target as Node))setOpen(false);}
  function onKey(ev: KeyboardEvent){if(open&&ev.key==='Escape'){ev.stopPropagation();setOpen(false);chip.focus();}}
  chip.onclick=()=>setOpen(!open);
  q<HTMLButtonElement>('.board-close').onclick=()=>{setOpen(false);chip.focus();};
  document.addEventListener('pointerdown',onDocDown);
  document.addEventListener('keydown',onKey);

  return {
    update(next: Entry[]){
      const moved=delta(prev,next,deps.meId());
      prev=next;entries=next;render();
      if(moved==='up'){chip.classList.remove('bump');void chip.offsetWidth;chip.classList.add('bump');
        clearTimeout(bumpTimer);bumpTimer=setTimeout(()=>chip.classList.remove('bump'),400);}
    },
    open:()=>setOpen(true),close:()=>setOpen(false),toggle:()=>setOpen(!open),isOpen:()=>open,
    dispose(){clearTimeout(bumpTimer);document.removeEventListener('pointerdown',onDocDown);document.removeEventListener('keydown',onKey);anchor.remove();},
  };
}
