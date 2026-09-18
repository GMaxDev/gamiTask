// The character editor: a sheet that slides up over the café, with thumbnails rendered from the real low-poly avatar.
import * as THREE from 'three';
import {type Look,SKINS,HEADS,BANGS,BACKS,HAIR_COLORS,TROUSERS,withChange,createHistory,type History,defaultLook} from './look.ts';
import {PALETTE,cleanName} from './identity.ts';
import {HATS} from './shop.ts';
import {createPrimitives} from './primitives.ts';
import {buildAvatar,hexOf} from './avatar.ts';
import {Rotate3d,LocateFixed,Undo2,X,Check,Smile,Scissors,Shirt} from 'lucide';

export interface EditorDeps{onPreview(look:Look):void;onDone(look:Look,name:string):void;onExit():void;resetView():void}
export interface Editor{open(initial:Look,name:string,ownedHats:string[]):void;close():void;isOpen():boolean;dispose():void}
export const EDITOR_ICONS={Rotate3d,LocateFixed,Undo2,X,Check,Smile,Scissors,Shirt};// the sheet's markup, registered by whoever calls lucide's createIcons

type Cat='face'|'hair'|'outfit';
type Sub='skin'|'head'|'bangs'|'back'|'top'|'bottom'|'acc';
const SUBS:Record<Cat,{id:Sub;label:string}[]>={face:[{id:'skin',label:'Peau'},{id:'head',label:'Tête'}],hair:[{id:'bangs',label:'Frange'},{id:'back',label:'Arrière'}],outfit:[{id:'top',label:'Haut'},{id:'bottom',label:'Bas'},{id:'acc',label:'Accessoires'}]};
const TITLES:Record<Cat,string>={face:'Visage',hair:'Cheveux',outfit:'Tenue'};
const COLS=5;

interface Item{id:string;label:string;patch:Partial<Look>;kind:'head'|'body'}
interface Swatch{id:string;label:string;hex:string;patch:Partial<Look>}

function items(sub:Sub,ownedHats:string[]):Item[]{
  switch(sub){
    case 'skin':return SKINS.map(s=>({id:s.id,label:s.label,patch:{skin:s.id},kind:'head'} as Item));
    case 'head':return HEADS.map(h=>({id:h.id,label:h.label,patch:{head:h.id},kind:'head'} as Item));
    case 'bangs':return BANGS.map(b=>({id:b.id,label:b.label,patch:{bangs:b.id},kind:'head'} as Item));
    case 'back':return BACKS.map(b=>({id:b.id,label:b.label,patch:{back:b.id},kind:'head'} as Item));
    case 'top':return PALETTE.map(c=>({id:hexOf(c.hex),label:c.label,patch:{shirt:c.hex},kind:'body'} as Item));
    case 'bottom':return TROUSERS.map(t=>({id:t.id,label:t.label,patch:{trousers:t.id},kind:'body'} as Item));
    case 'acc':return [
      {id:'headphones-on',label:'Casque',patch:{headphones:true},kind:'head'} as Item,
      {id:'headphones-off',label:'Sans casque',patch:{headphones:false},kind:'head'} as Item,
      ...HATS.filter(h=>ownedHats.includes(h.id)).map(h=>({id:h.id,label:h.name,patch:{hat:h.id},kind:'head'} as Item)),
      {id:'hat-none',label:'Sans chapeau',patch:{hat:null},kind:'head'} as Item,
    ];
  }
}
function palette(sub:Sub):Swatch[]{
  if(sub==='bangs'||sub==='back')return HAIR_COLORS.map(c=>({id:c.id,label:c.label,hex:c.hex,patch:{hairColor:c.id}}));
  if(sub==='top')return PALETTE.map(c=>({id:hexOf(c.hex),label:c.label,hex:hexOf(c.hex),patch:{shirt:c.hex}}));
  if(sub==='bottom')return TROUSERS.map(t=>({id:t.id,label:t.label,hex:t.hex,patch:{trousers:t.id}}));
  return [];
}
const applied=(look:Look,patch:Partial<Look>)=>(Object.keys(patch) as (keyof Look)[]).every(k=>look[k]===patch[k]);

// Thumbnails are the real low-poly avatar rendered once per (kind, relevant fields) into a small offscreen canvas.
function createThumbs(){
  const size=160,renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
  renderer.setSize(size,size);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
  const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight('#fff5dc','#b3bca4',1.6));
  const key=new THREE.DirectionalLight('#ffd08f',2.4);key.position.set(2,4,3);scene.add(key);
  const cam=new THREE.OrthographicCamera(-1,1,1,-1,.1,20);
  const materials=new Map<string,any>(),root=new THREE.Group();scene.add(root);
  const P=createPrimitives(()=>root,materials);
  const cache=new Map<string,string>();
  function draw(kind:'head'|'body',look:Look):string{
    const k=kind+JSON.stringify(kind==='head'?[look.skin,look.head,look.bangs,look.back,look.hairColor,look.headphones,look.hat]:[look.skin,look.shirt,look.trousers,look.headphones,look.hat,look.head,look.bangs,look.back,look.hairColor]);
    const hit=cache.get(k);if(hit)return hit;
    root.clear();const rig=buildAvatar(P,0,0,look);
    if(kind==='head'){cam.zoom=2.1;cam.position.set(2.2,3.6,3.2);cam.lookAt(0,1.28,0);}
    else{cam.zoom=1.05;cam.position.set(2.2,2.9,3.2);cam.lookAt(0,.8,0);}
    cam.updateProjectionMatrix();rig.g.rotation.y=-.35;renderer.render(scene,cam);
    const url=renderer.domElement.toDataURL('image/png');cache.set(k,url);
    root.traverse((o:any)=>o.geometry?.dispose?.());
    return url;
  }
  return {draw,dispose(){root.traverse((o:any)=>o.geometry?.dispose?.());materials.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();}};
}

const MARKUP=`<div class="editor-topbar">
  <div class="editor-tools"><span class="tool"><i data-lucide="rotate-3d"></i>Tourner : glisser</span><button id="ed-reset" class="tool-btn"><i data-lucide="locate-fixed"></i>Vue par défaut</button><button id="ed-undo" class="tool-btn" disabled><i data-lucide="undo-2"></i>Annuler</button></div>
  <div class="editor-actions"><button id="ed-exit" class="ghost-btn"><i data-lucide="x"></i>Quitter</button><button id="ed-done" class="primary"><i data-lucide="check"></i>Valider</button></div>
</div>
<section class="editor-sheet" aria-label="Mon personnage">
  <nav class="editor-rail" role="tablist" aria-label="Catégories"><button role="tab" data-cat="face" aria-selected="true" title="Visage"><i data-lucide="smile"></i></button><button role="tab" data-cat="hair" aria-selected="false" title="Cheveux"><i data-lucide="scissors"></i></button><button role="tab" data-cat="outfit" aria-selected="false" title="Tenue"><i data-lucide="shirt"></i></button></nav>
  <div class="editor-body">
    <header class="editor-head"><h2 id="ed-title">Visage</h2><div class="subtabs" id="ed-subtabs" role="tablist"></div></header>
    <div class="editor-main"><div class="editor-grid" id="ed-grid" role="listbox"></div><div class="editor-palette" id="ed-palette" role="listbox" aria-label="Couleur"></div></div>
    <label class="editor-name">Pseudo<input id="ed-name" maxlength="20" minlength="2" autocomplete="nickname"/></label>
  </div>
</section>`;

export function createEditor(host:HTMLElement,deps:EditorDeps):Editor{
  const el=document.createElement('div');el.id='editor';el.className='editor';el.setAttribute('aria-hidden','true');el.innerHTML=MARKUP;host.appendChild(el);
  const q=(s:string):any=>el.querySelector(s);
  const sheet:HTMLElement=q('.editor-sheet'),grid:HTMLElement=q('#ed-grid'),pal:HTMLElement=q('#ed-palette'),subtabs:HTMLElement=q('#ed-subtabs'),title:HTMLElement=q('#ed-title'),name:HTMLInputElement=q('#ed-name'),undoBtn:HTMLButtonElement=q('#ed-undo');
  let cat:Cat='face',sub:Sub='skin',hats:string[]=[],opened=false,focused=0,closeTimer=0,pass=0;
  let history:History=createHistory(defaultLook(PALETTE[0].hex));
  let thumbs:ReturnType<typeof createThumbs>|null=null;

  function render(){
    title.textContent=TITLES[cat];
    const look=history.current();
    subtabs.replaceChildren(...SUBS[cat].map(s=>{
      const b=document.createElement('button');b.role='tab';b.textContent=s.label;b.setAttribute('aria-selected',String(s.id===sub));
      b.onclick=()=>{sub=s.id;focused=0;render();};return b;
    }));
    const list=items(sub,hats);
    if(focused>=list.length)focused=0;
    const keepFocus=grid.contains(document.activeElement);
    const imgs:HTMLImageElement[]=[];
    grid.replaceChildren(...list.map((it,i)=>{
      const b=document.createElement('button');b.className='editor-tile';b.role='option';b.setAttribute('aria-label',it.label);b.title=it.label;
      b.setAttribute('aria-selected',String(applied(look,it.patch)));b.tabIndex=i===focused?0:-1;
      const img=document.createElement('img');img.alt='';b.appendChild(img);imgs.push(img);
      b.onclick=()=>{focused=i;select(it.patch);};
      b.onfocus=()=>{focused=i;};
      return b;
    }));
    // replaceChildren dropped the focused tile: keyboard selection has to land back on its replacement.
    if(keepFocus)(grid.children[focused] as HTMLElement|undefined)?.focus();
    // A cold tab costs ~40 ms per thumbnail, so the grid paints first and fills in two frames.
    const token=++pass,half=Math.ceil(list.length/2);
    const fill=(from:number,to:number)=>{for(let i=from;i<to;i++)imgs[i].src=thumbs!.draw(list[i].kind,withChange(look,list[i].patch));};
    setTimeout(()=>{if(token!==pass)return;fill(0,half);setTimeout(()=>{if(token===pass)fill(half,list.length);});});
    const swatches=palette(sub);
    pal.style.display=swatches.length?'':'none';
    pal.replaceChildren(...swatches.map(s=>{
      const b=document.createElement('button');b.role='option';b.style.background=s.hex;b.title=s.label;b.setAttribute('aria-label',s.label);
      b.setAttribute('aria-selected',String(applied(look,s.patch)));b.onclick=()=>select(s.patch);return b;
    }));
    undoBtn.disabled=!history.canUndo();
  }
  function select(patch:Partial<Look>){history.push(withChange(history.current(),patch));deps.onPreview(history.current());render();}
  function exit(){deps.onPreview(history.reset());deps.onExit();}

  q('#ed-reset').onclick=()=>deps.resetView();
  undoBtn.onclick=()=>{const l=history.undo();if(l){deps.onPreview(l);render();}};
  q('#ed-exit').onclick=exit;
  q('#ed-done').onclick=()=>{
    const clean=cleanName(name.value);
    if(!clean){name.setCustomValidity('Choisis un pseudo d’au moins 2 caractères.');name.reportValidity();return;}
    name.value=clean;deps.onDone(history.current(),clean);
  };
  name.oninput=()=>name.setCustomValidity('');
  for(const b of el.querySelectorAll<HTMLElement>('.editor-rail button'))b.onclick=()=>{cat=b.dataset.cat as Cat;sub=SUBS[cat][0].id;focused=0;for(const o of el.querySelectorAll('.editor-rail button'))o.setAttribute('aria-selected',String(o===b));render();};

  grid.addEventListener('keydown',e=>{
    const tiles=[...grid.querySelectorAll<HTMLElement>('.editor-tile')];if(!tiles.length)return;
    const step={ArrowRight:1,ArrowLeft:-1,ArrowDown:COLS,ArrowUp:-COLS}[e.key];
    if(step===undefined){if(e.key===' '||e.key==='Enter'){e.preventDefault();tiles[focused]?.click();}return;}
    e.preventDefault();const next=Math.max(0,Math.min(tiles.length-1,focused+step));
    focused=next;for(const[i,t]of tiles.entries())t.tabIndex=i===next?0:-1;tiles[next].focus();
  });
  const onKey=(e:KeyboardEvent)=>{if(opened&&e.key==='Escape'){e.preventDefault();exit();}};
  document.addEventListener('keydown',onKey);

  return {
    open(initial,nick,ownedHats){
      thumbs??=createThumbs();
      history=createHistory(initial);hats=ownedHats;cat='face';sub='skin';focused=0;
      name.value=nick;name.setCustomValidity('');
      for(const o of el.querySelectorAll('.editor-rail button'))o.setAttribute('aria-selected',String((o as HTMLElement).dataset.cat==='face'));
      render();
      clearTimeout(closeTimer);opened=true;el.setAttribute('aria-hidden','false');
      requestAnimationFrame(()=>{el.classList.add('open');(el.querySelector('.editor-rail button') as HTMLElement|null)?.focus();});
    },
    close(){
      if(!opened)return;opened=false;pass++;el.classList.remove('open');// pending thumbnail batches stop here
      // Tiles and rail buttons bubble their own transitionend: only the sheet's own slide ends the close.
      const done=(e?:Event)=>{if(e&&e.target!==sheet)return;clearTimeout(closeTimer);sheet.removeEventListener('transitionend',done);if(!opened)el.setAttribute('aria-hidden','true');};
      sheet.addEventListener('transitionend',done);closeTimer=setTimeout(done,600) as unknown as number;
    },
    isOpen:()=>opened,
    dispose(){pass++;clearTimeout(closeTimer);document.removeEventListener('keydown',onKey);thumbs?.dispose();thumbs=null;el.remove();},
  };
}
