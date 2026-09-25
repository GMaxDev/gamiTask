// The character editor: a sheet that slides up over the café, with thumbnails rendered from the real low-poly avatar.
import * as THREE from 'three';
import {type Look,SKINS,HEADS,BANGS,BACKS,HAIR_COLORS,TROUSERS,EYES,BROWS,NOSES,MOUTHS,BODIES,PATTERNS,SLEEVES,BOTTOMS,SHOES,HAIR_SETS,withChange,equalLook,createHistory,type History,defaultLook,randomLook} from './look.ts';
import {PALETTE,cleanName} from './identity.ts';
import {HATS} from './shop.ts';
import {createPrimitives} from './primitives.ts';
import {buildAvatar,hexOf} from './avatar.ts';
import {Rotate3d,LocateFixed,Undo2,X,Check,Smile,Scissors,Shirt,PersonStanding,Dices} from 'lucide';
import {registerIcons} from './ui.ts';

export interface EditorDeps{onPreview(look:Look):void;onDone(look:Look,name:string):void;onExit():void;resetView():void}
export interface Editor{open(initial:Look,name:string,ownedHats:string[]):void;close():void;isOpen():boolean;dispose():void}
registerIcons({Rotate3d,LocateFixed,Undo2,X,Check,Smile,Scissors,Shirt,PersonStanding,Dices});// the sheet's markup

type Cat='face'|'hair'|'outfit'|'body';
type Sub='skin'|'head'|'eyes'|'brows'|'nose'|'mouth'|'sets'|'bangs'|'back'|'top'|'pattern'|'bottom'|'shoes'|'acc'|'shape';
const SUBS:Record<Cat,{id:Sub;label:string}[]>={
  face:[{id:'skin',label:'Peau'},{id:'head',label:'Tête'},{id:'eyes',label:'Yeux'},{id:'brows',label:'Sourcils'},{id:'nose',label:'Nez'},{id:'mouth',label:'Bouche'}],
  hair:[{id:'sets',label:'Sets'},{id:'bangs',label:'Frange'},{id:'back',label:'Arrière'}],
  outfit:[{id:'top',label:'Haut'},{id:'pattern',label:'Motif'},{id:'bottom',label:'Bas'},{id:'shoes',label:'Chaussures'},{id:'acc',label:'Accessoires'}],
  body:[{id:'shape',label:'Gabarit'}],
};
const TITLES:Record<Cat,string>={face:'Visage',hair:'Cheveux',outfit:'Tenue',body:'Corps'};
const COLS=5;
// Sliders sit under the grid; each one nudges a -3..3 field of the sub-tab it belongs to.
const SLIDERS:Partial<Record<Sub,{key:keyof Look;label:string}[]>>={
  eyes:[{key:'eyesY',label:'Hauteur'},{key:'eyesGap',label:'Écartement'},{key:'eyesSize',label:'Taille'}],
  brows:[{key:'browsY',label:'Hauteur'}],
  nose:[{key:'noseY',label:'Hauteur'},{key:'noseSize',label:'Taille'}],
  mouth:[{key:'mouthY',label:'Hauteur'},{key:'mouthSize',label:'Taille'}],
};

type Kind='head'|'face'|'body';
interface Item{id:string;label:string;patch:Partial<Look>;kind:Kind;group?:string}
interface Swatch{id:string;label:string;hex:string;patch:Partial<Look>}
const tiles=(list:{id:string;label:string}[],key:keyof Look,kind:Kind):Item[]=>list.map(e=>({id:e.id,label:e.label,patch:{[key]:e.id} as Partial<Look>,kind}));
const heads=(list:{id:string;label:string}[],key:keyof Look):Item[]=>tiles(list,key,'head');
const bodies=(list:{id:string;label:string}[],key:keyof Look):Item[]=>tiles(list,key,'body');
const faces=(list:{id:string;label:string}[],key:keyof Look):Item[]=>tiles(list,key,'face');

function items(sub:Sub,ownedHats:string[]):Item[]{
  switch(sub){
    case 'skin':return heads(SKINS,'skin');
    case 'head':return heads(HEADS,'head');
    case 'eyes':return faces(EYES,'eyes');
    case 'brows':return faces(BROWS,'brows');
    case 'nose':return faces(NOSES,'nose');
    case 'mouth':return faces(MOUTHS,'mouth');
    case 'sets':return HAIR_SETS.map(s=>({id:s.id,label:s.label,patch:{bangs:s.bangs,back:s.back,hairColor:s.hairColor},kind:'head'} as Item));
    case 'bangs':return heads(BANGS,'bangs');
    case 'back':return heads(BACKS,'back');
    case 'top':return PALETTE.map(c=>({id:hexOf(c.hex),label:c.label,patch:{shirt:c.hex},kind:'body'} as Item));
    case 'pattern':return [...bodies(PATTERNS,'topPattern'),...bodies(SLEEVES,'sleeves').map((it,i)=>i?it:{...it,group:'Manches'})];
    case 'bottom':return bodies(BOTTOMS,'bottom');
    case 'shoes':return bodies(SHOES,'shoes');
    case 'shape':return bodies(BODIES,'body');
    case 'acc':return [
      {id:'headphones-on',label:'Casque',patch:{headphones:true},kind:'head'} as Item,
      {id:'headphones-off',label:'Sans casque',patch:{headphones:false},kind:'head'} as Item,
      ...HATS.filter(h=>ownedHats.includes(h.id)).map(h=>({id:h.id,label:h.name,patch:{hat:h.id},kind:'head'} as Item)),
      {id:'hat-none',label:'Sans chapeau',patch:{hat:null},kind:'head'} as Item,
    ];
  }
}
function palette(sub:Sub):Swatch[]{
  if(sub==='bangs'||sub==='back'||sub==='sets')return HAIR_COLORS.map(c=>({id:c.id,label:c.label,hex:c.hex,patch:{hairColor:c.id}}));
  if(sub==='top')return PALETTE.map(c=>({id:hexOf(c.hex),label:c.label,hex:hexOf(c.hex),patch:{shirt:c.hex}}));
  if(sub==='bottom')return TROUSERS.map(t=>({id:t.id,label:t.label,hex:t.hex,patch:{trousers:t.id}}));
  if(sub==='shoes')return SHOES.map(s=>({id:s.id,label:s.label,hex:s.hex,patch:{shoes:s.id}}));
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
  function draw(kind:Kind,look:Look):string{
    // A head and a face show the same fields from two distances; a body ignores the face, which it is far too small to show.
    const k=kind+JSON.stringify(kind==='body'?[look.skin,look.shirt,look.trousers,look.shoes,look.topPattern,look.sleeves,look.bottom,look.body,look.head,look.bangs,look.back,look.hairColor,look.headphones,look.hat]
      :[look.skin,look.head,look.bangs,look.back,look.hairColor,look.headphones,look.hat,look.eyes,look.brows,look.nose,look.mouth,look.eyesY,look.eyesGap,look.eyesSize,look.browsY,look.noseY,look.noseSize,look.mouthY,look.mouthSize]);
    const hit=cache.get(k);if(hit)return hit;
    root.clear();const rig=buildAvatar(P,0,0,look);
    if(kind==='face'){cam.zoom=3.4;cam.position.set(.3,1.5,3);cam.lookAt(0,1.3,0);}
    else if(kind==='head'){cam.zoom=2.1;cam.position.set(2.2,3.6,3.2);cam.lookAt(0,1.28,0);}
    else{cam.zoom=1.05;cam.position.set(2.2,2.9,3.2);cam.lookAt(0,.8,0);}
    cam.updateProjectionMatrix();rig.g.rotation.y=kind==='face'?-.08:-.35;renderer.render(scene,cam);
    const url=renderer.domElement.toDataURL('image/png');if(cache.size>300)cache.clear();cache.set(k,url);
    root.traverse((o:any)=>o.geometry?.dispose?.());
    return url;
  }
  return {draw,dispose(){root.traverse((o:any)=>o.geometry?.dispose?.());P.disposeGeometries();materials.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();}};
}

const MARKUP=`<div class="editor-topbar">
  <div class="editor-tools"><span class="tool"><i data-lucide="rotate-3d"></i>Tourner : glisser</span><button id="ed-reset" class="tool-btn"><i data-lucide="locate-fixed"></i>Vue par défaut</button><button id="ed-random" class="tool-btn"><i data-lucide="dices"></i>Au hasard</button><button id="ed-undo" class="tool-btn" disabled><i data-lucide="undo-2"></i>Annuler</button></div>
  <div class="editor-actions"><button id="ed-exit" class="ghost-btn"><i data-lucide="x"></i>Quitter</button><button id="ed-done" class="primary"><i data-lucide="check"></i>Valider</button></div>
</div>
<section class="editor-sheet" aria-label="Mon personnage">
  <nav class="editor-rail" role="tablist" aria-label="Catégories"><button role="tab" data-cat="face" aria-selected="true" title="Visage"><i data-lucide="smile"></i></button><button role="tab" data-cat="hair" aria-selected="false" title="Cheveux"><i data-lucide="scissors"></i></button><button role="tab" data-cat="outfit" aria-selected="false" title="Tenue"><i data-lucide="shirt"></i></button><button role="tab" data-cat="body" aria-selected="false" title="Corps"><i data-lucide="person-standing"></i></button></nav>
  <div class="editor-body">
    <header class="editor-head"><h2 id="ed-title">Visage</h2><div class="subtabs" id="ed-subtabs" role="tablist"></div></header>
    <div class="editor-main"><div class="editor-grid" id="ed-grid" role="listbox"></div><div class="editor-palette" id="ed-palette" role="listbox" aria-label="Couleur"></div></div>
    <div class="ed-sliders" id="ed-sliders"></div>
    <label class="editor-name">Pseudo<input id="ed-name" maxlength="20" minlength="2" autocomplete="nickname"/></label>
  </div>
</section>`;

export function createEditor(host:HTMLElement,deps:EditorDeps):Editor{
  const el=document.createElement('div');el.id='editor';el.className='editor';el.setAttribute('aria-hidden','true');el.innerHTML=MARKUP;host.appendChild(el);
  const q=(s:string):any=>el.querySelector(s);
  const sheet:HTMLElement=q('.editor-sheet'),grid:HTMLElement=q('#ed-grid'),pal:HTMLElement=q('#ed-palette'),sliders:HTMLElement=q('#ed-sliders'),subtabs:HTMLElement=q('#ed-subtabs'),title:HTMLElement=q('#ed-title'),name:HTMLInputElement=q('#ed-name'),undoBtn:HTMLButtonElement=q('#ed-undo');
  let cat:Cat='face',sub:Sub='skin',hats:string[]=[],opened=false,focused=0,closeTimer=0,pass=0,heldSlider:keyof Look|null=null;
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
    grid.replaceChildren(...list.flatMap((it,i)=>{
      const b=document.createElement('button');b.className='editor-tile';b.role='option';b.setAttribute('aria-label',it.label);b.title=it.label;
      b.setAttribute('aria-selected',String(applied(look,it.patch)));b.tabIndex=i===focused?0:-1;
      const img=document.createElement('img');img.alt='';b.appendChild(img);imgs.push(img);
      b.onclick=()=>{focused=i;select(it.patch);};
      b.onfocus=()=>{focused=i;};
      if(!it.group)return [b];
      // A group heading breaks the row: it spans the grid so what follows reads as its own list.
      const h=document.createElement('span');h.className='sub-group';h.textContent=it.group;return [h,b];
    }));
    // replaceChildren dropped the focused tile: keyboard selection has to land back on its replacement.
    if(keepFocus)(grid.querySelectorAll<HTMLElement>('.editor-tile')[focused])?.focus();
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
    const defs=SLIDERS[sub]??[];
    sliders.style.display=defs.length?'':'none';grid.classList.toggle('compact',defs.length>0);
    sliders.replaceChildren(...defs.map(d=>{
      const l=document.createElement('label');l.className='ed-slider';
      const span=document.createElement('span');span.textContent=d.label;
      const input=document.createElement('input');input.type='range';input.min='-3';input.max='3';input.step='1';input.value=String(look[d.key]);
      const out=document.createElement('output');out.textContent=input.value;
      // Dragging previews live; only the release (change) lands one entry in the history.
      input.oninput=()=>{out.textContent=input.value;deps.onPreview(withChange(history.current(),{[d.key]:+input.value} as Partial<Look>));};
      input.onchange=()=>{heldSlider=d.key;select({[d.key]:+input.value} as Partial<Look>);};
      l.append(span,input,out);return l;
    }));
    // The rerender that follows a slider's change threw its input away: arrow keys need it back.
    if(heldSlider){const i=defs.findIndex(d=>d.key===heldSlider);heldSlider=null;if(i>=0)(sliders.children[i]?.querySelector('input') as HTMLElement|null)?.focus();}
    undoBtn.disabled=!history.canUndo();
  }
  // Reselecting what is already worn must not cost an Undo step.
  function select(patch:Partial<Look>){const next=withChange(history.current(),patch);if(equalLook(next,history.current()))return;history.push(next);deps.onPreview(next);render();}
  function exit(){deps.onPreview(history.reset());deps.onExit();}

  q('#ed-reset').onclick=()=>deps.resetView();
  // One roll, one history entry: the hat stays put (it is owned, not drawn) and the nickname is not part of the look.
  q('#ed-random').onclick=()=>select({...randomLook(PALETTE.map(p=>p.hex)),hat:history.current().hat});
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
