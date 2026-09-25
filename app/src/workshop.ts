// The object workshop: moderators assemble catalogue items out of boxes, cylinders and balls, in the café's own light.
import * as THREE from 'three';
import type {CatalogItem,PartKind,Anchor,AnchorKind} from '@shared/catalog';
import {createPrimitives,C} from './primitives.ts';
import {buildRecipe,captureRecipe,ensureCsg} from './recipe.ts';
import {buildAvatar,buildHat} from './avatar.ts';
import {HATS,FURNITURE,isBuiltIn,withOriginals,footprint} from './shop.ts';
import {createDecor,DECOR_PIECES} from './decor.ts';
import {defaultLook,createHistory} from './look.ts';
import {PALETTE} from './identity.ts';
import {newItem,addPart,slugId,duplicate,setFunction} from './workshop-model.ts';
import {esc,drawIcons,registerIcons} from './ui.ts';
import {Hammer,Box,Cylinder,Circle,Torus,PackageOpen,Copy,Trash2,Plus,Save,X,LocateFixed,Undo2,Eye,EyeOff,FlipHorizontal2,Eraser} from 'lucide';

export interface WorkshopDeps{items():CatalogItem[];save(item:CatalogItem):void;remove(id:string):void;onExit():void}
export interface Workshop{open():void;close():void;isOpen():boolean;refresh():void;dispose():void}
registerIcons({Hammer,Box,Cylinder,Circle,Torus,PackageOpen,Copy,Trash2,Plus,Save,X,LocateFixed,Undo2,Eye,EyeOff,FlipHorizontal2,Eraser});

type Field=[string,string,number,number,number];// key, label, min, max, step
const POSE:Field[]=[['x','X',-4,4,.01],['y','Y',-2,4,.01],['z','Z',-4,4,.01],['rx','Rot X',-3.14,3.14,.01],['ry','Rot Y',-3.14,3.14,.01],['rz','Rot Z',-3.14,3.14,.01]];
const DIMS:Record<PartKind,Field[]>={box:[['w','Largeur',.02,4,.01],['h','Hauteur',.02,4,.01],['d','Profondeur',.02,4,.01],['r','Arrondi',0,.5,.01]],cyl:[['rt','Rayon haut',0,4,.01],['rb','Rayon bas',0,4,.01],['h','Hauteur',.02,4,.01],['n','Facettes',3,64,1]],ball:[['r','Rayon',.02,4,.01],['sx','Étire X',.1,4,.01],['sy','Étire Y',.1,4,.01],['sz','Étire Z',.1,4,.01]],torus:[['rad','Rayon',.01,4,.01],['tube','Épaisseur',.005,2,.005],['n','Facettes',3,64,1],['arc','Arc',.1,6.283,.01]],shell:[['w','Largeur',.02,4,.01],['h','Hauteur',.02,4,.01],['d','Profondeur',.02,4,.01],['t','Paroi',.005,1,.005],['r','Arrondi',0,.5,.01]]};
const ANCHOR:Record<AnchorKind,{label:string;color:string}>={seat:{label:'Assise',color:'#657757'},surface:{label:'Surface',color:'#d2a754'},portable:{label:'Prise en main',color:'#c9764f'},wearable:{label:'Sur la tête',color:'#8aa6b8'}};
const FUNCTIONS:[AnchorKind,string][]=[['seat','Asseyable'],['surface','Surface'],['portable','Portable'],['wearable','Porté sur la tête']];
const ANCHOR_FIELDS:Field[]=[['x','X',-4,4,.01],['y','Y',-2,4,.01],['z','Z',-4,4,.01],['rot','Orientation',-3.14,3.14,.01]],SURFACE_FIELDS:Field[]=[['w','Largeur',.05,4,.01],['d','Profondeur',.05,4,.01]];
// The coded pieces the workshop can open: shop hats and furniture plus the rooms' decor. Opening one captures its geometry.
interface Native{id:string;name:string;emoji:string;price:number;kind:CatalogItem['kind']}
const natives=():Native[]=>[...HATS.filter(h=>isBuiltIn(h.id)).map(h=>({...h,kind:'hat' as const})),...FURNITURE.filter(f=>isBuiltIn(f.id)).map(f=>({...f,kind:'furniture' as const})),...DECOR_PIECES.map(d=>({...d,emoji:'🪑',price:0,kind:'decor' as const}))];
const KIND_LABEL:Record<PartKind,string>={box:'Cube',cyl:'Cylindre',ball:'Sphère',torus:'Tore',shell:'Boîte creuse'},KIND_ICON:Record<PartKind,string>={box:'box',cyl:'cylinder',ball:'circle',torus:'torus',shell:'package-open'};

const MARKUP=`<aside class="ws-side"><header class="ws-head"><h2><i data-lucide="hammer"></i>Atelier</h2><button id="ws-new" class="tool-btn"><i data-lucide="plus"></i>Nouvel objet</button></header><ul id="ws-items" class="ws-items"></ul></aside>
<div class="ws-view"><canvas id="ws-canvas" tabindex="0" aria-label="Aperçu de l’objet"></canvas><span class="ws-hint">Glisser le fond : tourner · Glisser un bloc : déplacer (Maj : hauteur) · Molette : zoom · Suppr, Ctrl+D, flèches · Z bleu = devant</span><div class="ws-guard" id="ws-guard" hidden><span>Modifications non enregistrées.</span><button id="ws-guard-save" class="primary">Enregistrer</button><button id="ws-guard-drop" class="ghost-btn">Abandonner</button><button id="ws-guard-stay" class="ghost-btn">Rester</button></div><div class="ws-view-actions"><button id="ws-undo" class="tool-btn" disabled><i data-lucide="undo-2"></i>Annuler</button><button id="ws-reset" class="tool-btn"><i data-lucide="locate-fixed"></i>Vue par défaut</button><button id="ws-exit" class="ghost-btn"><i data-lucide="x"></i>Quitter</button></div></div>
<aside class="ws-side ws-panel">
  <section class="ws-meta"><label>Nom<input id="ws-name" maxlength="30" required/></label><div class="ws-row"><label>Emoji<input id="ws-emoji" maxlength="8"/></label><label>Prix<input id="ws-price" type="number" min="0" max="99999"/></label></div>
    <div class="ws-row"><label>Type<select id="ws-kind"><option value="furniture">Mobilier</option><option value="hat">Chapeau</option><option value="decor" disabled>Décor</option></select></label><label class="ws-cells">Cases<input id="ws-w" type="number" min="1" max="4"/>×<input id="ws-d" type="number" min="1" max="4"/></label></div></section>
  <section class="ws-parts"><div class="ws-add"><span>Blocs</span><button data-add="box" title="Ajouter un cube"><i data-lucide="box"></i></button><button data-add="cyl" title="Ajouter un cylindre"><i data-lucide="cylinder"></i></button><button data-add="ball" title="Ajouter une sphère"><i data-lucide="circle"></i></button><button data-add="torus" title="Ajouter un tore"><i data-lucide="torus"></i></button><button data-add="shell" title="Ajouter une boîte creuse (ouverte devant)"><i data-lucide="package-open"></i></button></div><ul id="ws-parts"></ul></section>
  <section class="ws-parts ws-fns"><div class="ws-add"><span>Fonctions</span></div><div id="ws-fns" class="ws-checks"></div><ul id="ws-anchors"></ul></section>
  <section class="ws-inspector" id="ws-inspector"></section>
  <footer class="ws-foot"><button id="ws-delete" class="ghost-btn"><i data-lucide="trash-2"></i>Supprimer</button><button id="ws-dup" class="ghost-btn"><i data-lucide="copy"></i>Dupliquer</button><button id="ws-save" class="primary"><i data-lucide="save"></i>Enregistrer</button></footer>
</aside>`;

export function createWorkshop(host:HTMLElement,deps:WorkshopDeps):Workshop{
  const el=document.createElement('div');el.id='workshop';el.className='workshop';el.setAttribute('aria-hidden','true');el.innerHTML=MARKUP;host.appendChild(el);
  const q=(s:string):any=>el.querySelector(s);
  const canvas:HTMLCanvasElement=q('#ws-canvas'),itemsEl:HTMLElement=q('#ws-items'),partsEl:HTMLElement=q('#ws-parts'),fnsEl:HTMLElement=q('#ws-fns'),anchorsEl:HTMLElement=q('#ws-anchors'),insp:HTMLElement=q('#ws-inspector');
  const nameIn:HTMLInputElement=q('#ws-name'),emojiIn:HTMLInputElement=q('#ws-emoji'),priceIn:HTMLInputElement=q('#ws-price'),kindIn:HTMLSelectElement=q('#ws-kind'),wIn:HTMLInputElement=q('#ws-w'),dIn:HTMLInputElement=q('#ws-d'),delBtn:HTMLButtonElement=q('#ws-delete');
  let draft=newItem(),sel=0,selA=-1,opened=false,raf=0,armed=false,saved='',pending:(()=>void)|null=null;
  // Snapshots of the draft as JSON: `mark` lands one after each discrete edit, sliders only on release.
  let history=createHistory(JSON.stringify(draft));const undoBtn:HTMLButtonElement=q('#ws-undo');
  const snap=()=>JSON.stringify(draft);function mark(){const now=snap();if(now!==history.current()){history.push(now);undoBtn.disabled=false;}}
  function undo(){const prev=history.undo();if(prev===null)return;draft=JSON.parse(prev);sel=Math.min(sel,draft.parts.length-1);selA=Math.min(selA,draft.anchors.length-1);undoBtn.disabled=!history.canUndo();rebuild();renderMeta();renderParts();renderFunctions();renderInspector();}
  const dirty=()=>snap()!==saved;// selA ≥ 0: an anchor is selected instead of a part

  // Same light and tone mapping as the café by day, so what is built here is what is seen there.
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight('#fff5dc','#a8b294',1.2));
  const sun=new THREE.DirectionalLight('#ffd08f',2.2);sun.position.set(-3,10,5);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.bias=-.0005;scene.add(sun);
  const fill=new THREE.DirectionalLight('#dfe8f4',.5);fill.position.set(9,6,-3);scene.add(fill);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(12,12),new THREE.MeshStandardMaterial({color:'#e8d5b0',roughness:.95}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  const grid=new THREE.GridHelper(8,8,'#b08a5a','#cfb58c');(grid.material as any).transparent=true;(grid.material as any).opacity=.5;grid.position.y=.002;scene.add(grid);
  const axes=new THREE.AxesHelper(1);(axes.material as any).depthTest=false;axes.renderOrder=3;scene.add(axes);// X red, Y green, Z blue: what the inspector's fields mean, blue being the front
  const materials=new Map<string,any>(),extras:any[]=[];let root=new THREE.Group();scene.add(root);
  const P=createPrimitives(()=>root,materials,extras);
  const D=createDecor({p:P,scene,root:()=>root,previewing:()=>true,HD:0,obstacle(){},seat(){},taskSpot(){},hotspot:(o:any)=>o,shadow(){},steam:[],pendants:[],windows:[],taskSpots:[]});
  const BUILDERS:Record<string,()=>any>={plant:()=>D.plant(0,0),cactus:()=>D.cactus(0,0),lamp:()=>D.lamp(0,0),bookshelf:()=>D.bookcase(0,0),coffee:()=>D.coffeeCorner(0,0),couch:()=>D.armchair(0,0,0),chair:()=>D.chair(0,0),sofa:()=>D.sofa(0,0),rug:()=>D.rug(0,0),'coffee-table':()=>D.coffeeTable(0,0),'square-table':()=>D.squareTable(0,0),'round-table':()=>D.roundTable(0,0),mug:()=>D.mug(0,0,0,C.white,root,false),book:()=>D.book(0,0,0)};
  function captureNative(n:Native):CatalogItem{
    const g=withOriginals(()=>n.kind==='hat'?buildHat(P,n.id,root):BUILDERS[n.id]());const parts=captureRecipe(g);g.traverse((o:any)=>o.geometry?.dispose?.());root.remove(g);
    const f=footprint(n.id);return {id:n.id,kind:n.kind,name:n.name,emoji:n.emoji,price:n.price,w:f.w,d:f.d,parts,anchors:[]};
  }
  const isNative=()=>isBuiltIn(draft.id)||draft.kind==='decor';
  const overridden=(id:string)=>deps.items().some(i=>i.id===id);
  function openNative(n:Native){const o=deps.items().find(i=>i.id===n.id);load(o?structuredClone(o):captureNative(n));}
  const camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,100),target=new THREE.Vector3();let yaw=Math.atan2(13,16),pitch=Math.atan2(12.5,Math.hypot(13,16));// the café's own angle
  function aim(){camera.position.set(Math.cos(pitch)*Math.sin(yaw),Math.sin(pitch),Math.cos(pitch)*Math.cos(yaw)).multiplyScalar(30).add(target);camera.lookAt(target);camera.updateProjectionMatrix();}
  let recipe:any=null,markers:any=null,outline:THREE.BoxHelper|null=null;const hidden=new Set<number>();// parts hidden in the workshop only, to look inside
  // An anchor shows as a ring with an arrow the way it faces; a surface as the translucent slab things will sit on.
  function marker(a:Anchor,parent:any){
    const g=new THREE.Group();g.position.set(a.x,a.y,a.z);g.rotation.y=a.rot;parent.add(g);const col=ANCHOR[a.kind].color,m=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.75,depthTest:false});extras.push(m);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.12,.02,6,20),m);ring.rotation.x=Math.PI/2;g.add(ring);const tip=new THREE.Mesh(new THREE.ConeGeometry(.06,.14,10),m);tip.rotation.x=Math.PI/2;tip.position.z=.2;g.add(tip);
    if(a.kind==='surface'){const slab=new THREE.Mesh(new THREE.BoxGeometry(a.w??1,.02,a.d??1),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.3,depthTest:false}));extras.push(slab.material);g.add(slab);}
    for(const c of g.children)c.renderOrder=2;return g;
  }
  function resetView(){yaw=Math.atan2(13,16);pitch=Math.atan2(12.5,Math.hypot(13,16));const hat=draft.kind==='hat';target.set(0,hat?1.35:.45,0);camera.zoom=hat?3.2:1.15;aim();}
  function resize(){const w=canvas.clientWidth||1,h=canvas.clientHeight||1;renderer.setSize(w,h,false);const a=w/h;camera.left=-2*a;camera.right=2*a;camera.top=2;camera.bottom=-2;camera.updateProjectionMatrix();}
  new ResizeObserver(resize).observe(canvas);

  function rebuild(){
    root.traverse((o:any)=>o.geometry?.dispose?.());scene.remove(root);root=new THREE.Group();scene.add(root);if(outline)scene.remove(outline);outline=null;
    if(draft.kind==='hat'){const rig=buildAvatar(P,0,0,defaultLook(PALETTE[0].hex));recipe=buildRecipe(P,draft.parts,rig.head,true);}
    else recipe=buildRecipe(P,draft.parts,root,true);
    for(const i of hidden)if(recipe.children[i])recipe.children[i].visible=false;
    markers=new THREE.Group();recipe.parent.add(markers);for(const a of draft.anchors)marker(a,markers);
    const m=selA>=0?markers.children[selA]:recipe.children[sel];if(m){outline=new THREE.BoxHelper(m,new THREE.Color('#c9764f'));(outline.material as any).depthTest=false;scene.add(outline);}
  }
  function render(){renderer.render(scene,camera);}
  function loop(){if(!opened)return;outline?.update();render();raf=requestAnimationFrame(loop);}

  // Left column: what exists. Clicking loads a copy, so a half-done edit never leaks into the list.
  function renderItems(){
    const row=(it:{id:string;emoji:string;name:string},sub:string,open:()=>void)=>{const li=document.createElement('li');const b=document.createElement('button');b.className='ws-item';b.setAttribute('aria-current',String(it.id===draft.id));
      b.innerHTML=`<span class="ws-emoji">${esc(it.emoji)}</span><span>${esc(it.name)}<small>${sub}</small></span>`;b.onclick=()=>guard(open);li.appendChild(b);return li;};
    const heading=(t:string)=>{const li=document.createElement('li');li.className='ws-group';li.textContent=t;return li;};
    const mine=deps.items().filter(it=>!isBuiltIn(it.id)&&it.kind!=='decor');
    itemsEl.replaceChildren(heading('Mes objets'),...mine.map(it=>row(it,it.kind==='hat'?'chapeau':`mobilier · ${it.w}×${it.d}`,()=>load(structuredClone(it)))),
      heading('Objets du jeu'),...natives().map(n=>row(n,(n.kind==='hat'?'chapeau':n.kind==='decor'?'décor':'mobilier')+(overridden(n.id)?' · modifié':''),()=>openNative(n))));
  }
  function renderMeta(){nameIn.value=draft.name;emojiIn.value=draft.emoji;priceIn.value=String(draft.price);kindIn.value=draft.kind;wIn.value=String(draft.w);dIn.value=String(draft.d);const nat=isNative();for(const i of [nameIn,emojiIn,priceIn,kindIn])i.disabled=nat;(q('.ws-cells') as HTMLElement).hidden=draft.kind!=='furniture'||nat;(q('.ws-fns') as HTMLElement).hidden=nat;// a coded piece keeps its own seats and metadata: only its shape is overridden
    delBtn.hidden=!draft.id||!overridden(draft.id);disarm();}
  function renderParts(){
    partsEl.replaceChildren(...draft.parts.map((p,i)=>{
      const li=document.createElement('li');li.setAttribute('aria-current',String(i===sel));
      li.innerHTML=`<button class="ws-part${p.op==='cut'?' cut':''}"><i data-lucide="${KIND_ICON[p.kind]}"></i><span style="--c:${p.op==='cut'?'#c94f4f':p.color}"></span>${KIND_LABEL[p.kind]} ${i+1}${p.op==='cut'?' · creuse':''}</button><button class="ws-mini" title="${hidden.has(i)?'Afficher':'Masquer'}"><i data-lucide="${hidden.has(i)?'eye-off':'eye'}"></i></button><button class="ws-mini" title="Dupliquer"><i data-lucide="copy"></i></button><button class="ws-mini" title="Retirer" ${draft.parts.length<2?'disabled':''}><i data-lucide="trash-2"></i></button>`;
      const [pick,eye,dup,del]=li.querySelectorAll('button');
      eye.onclick=()=>{if(hidden.has(i))hidden.delete(i);else hidden.add(i);rebuild();renderParts();};
      pick.onclick=()=>{sel=i;selA=-1;rebuild();renderParts();renderFunctions();renderInspector();};
      dup.onclick=()=>duplicatePart(i);
      del.onclick=()=>removePart(i);
      return li;
    }));
    drawIcons();
  }
  function duplicatePart(i:number,patch:Partial<Record<string,number>>={}){if(!draft.parts[i])return;draft.parts.splice(i+1,0,{...draft.parts[i],...patch} as any);sel=i+1;selA=-1;hidden.clear();mark();rebuild();renderParts();renderInspector();}
  function removePart(i:number){if(draft.parts.length<2||!draft.parts[i])return;draft.parts.splice(i,1);sel=Math.min(sel,draft.parts.length-1);hidden.clear();mark();rebuild();renderParts();renderInspector();}
  function nudge(key:'x'|'y'|'z',by:number){const t=(selA>=0?draft.anchors[selA]:draft.parts[sel]) as any;if(!t)return;t[key]=Math.round((t[key]+by)*1000)/1000;mark();rebuild();renderInspector();}
  function renderFunctions(){
    fnsEl.replaceChildren(...FUNCTIONS.map(([kind,label])=>{
      const l=document.createElement('label'),c=document.createElement('input');c.type='checkbox';c.checked=draft.kind==='hat'&&kind==='wearable'||draft.anchors.some(a=>a.kind===kind);c.disabled=draft.kind==='hat'&&kind==='wearable';
      c.onchange=()=>{draft=setFunction(draft,kind,c.checked);selA=c.checked?draft.anchors.findIndex(a=>a.kind===kind):-1;mark();rebuild();renderParts();renderFunctions();renderInspector();};l.append(c,label);return l;
    }));
    anchorsEl.replaceChildren(...draft.anchors.map((a,i)=>{
      const li=document.createElement('li');li.setAttribute('aria-current',String(i===selA));
      li.innerHTML=`<button class="ws-part"><span style="--c:${ANCHOR[a.kind].color}"></span>${ANCHOR[a.kind].label} ${i+1}</button><button class="ws-mini" title="Dupliquer"><i data-lucide="copy"></i></button><button class="ws-mini" title="Retirer"><i data-lucide="trash-2"></i></button>`;
      const [pick,dup,del]=li.querySelectorAll('button');
      pick.onclick=()=>{selA=i;rebuild();renderFunctions();renderParts();renderInspector();};
      dup.onclick=()=>{draft.anchors.splice(i+1,0,{...a});selA=i+1;mark();rebuild();renderFunctions();renderInspector();};
      del.onclick=()=>{draft.anchors.splice(i,1);selA=-1;mark();rebuild();renderFunctions();renderInspector();};
      return li;
    }));
    drawIcons();
  }
  // One row per field: the slider and the number share a value, and editing either only rebuilds the meshes.
  function renderInspector(){
    const anchor=selA>=0,p=(anchor?draft.anchors[selA]:draft.parts[sel]) as any;if(!p){insp.replaceChildren();return;}
    const fields=anchor?[...ANCHOR_FIELDS,...(p.kind==='surface'?SURFACE_FIELDS:[])]:[...DIMS[p.kind as PartKind],...POSE];
    const rows=fields.map(([key,label,min,max,step])=>{
      const l=document.createElement('label');l.className='ws-field';
      const range=document.createElement('input');range.type='range';range.min=String(min);range.max=String(max);range.step=String(step);range.value=String(p[key]);
      const num=document.createElement('input');num.type='number';num.min=range.min;num.max=range.max;num.step=range.step;num.value=String(p[key]);
      const set=(v:number)=>{if(!Number.isFinite(v))return;p[key]=Math.max(min,Math.min(max,v));range.value=num.value=String(p[key]);rebuild();};
      range.oninput=()=>set(+range.value);range.onchange=mark;num.onchange=()=>{set(+num.value);mark();};
      l.append(Object.assign(document.createElement('span'),{textContent:label}),range,num);return l;
    });
    const color=document.createElement('label');color.className='ws-field ws-color';const ci=document.createElement('input');ci.type='color';ci.value=p.color;
    ci.oninput=()=>{p.color=ci.value;rebuild();(partsEl.children[sel]?.querySelector('.ws-part span') as HTMLElement|null)?.style.setProperty('--c',ci.value);};ci.onchange=mark;
    const swatches=document.createElement('span');swatches.className='ws-swatches';
    for(const [name,hex] of Object.entries(C)){const b=document.createElement('button');b.type='button';b.title=name;b.style.background=hex;b.onclick=()=>{p.color=hex;ci.value=hex;mark();rebuild();renderParts();};swatches.appendChild(b);}
    color.append(Object.assign(document.createElement('span'),{textContent:'Couleur'}),ci,swatches);
    // Solid or cutter, and mirrored copies: the quickest way to a second leg or arm.
    const tools=document.createElement('div');tools.className='ws-tools';
    tools.innerHTML=`<button type="button" class="tool-btn${p.op==='cut'?' active':''}" title="Retire sa forme des blocs pleins placés avant lui"><i data-lucide="eraser"></i>${p.op==='cut'?'Creuse':'Plein'}</button><button type="button" class="tool-btn" title="Copie symétrique sur X"><i data-lucide="flip-horizontal-2"></i>Miroir X</button><button type="button" class="tool-btn" title="Copie symétrique sur Z"><i data-lucide="flip-horizontal-2"></i>Miroir Z</button>`;
    const [cut,mx,mz]=tools.querySelectorAll('button');
    cut.onclick=()=>{if(p.op==='cut')delete p.op;else p.op='cut';mark();rebuild();renderParts();renderInspector();};
    mx.onclick=()=>duplicatePart(sel,{x:-p.x,ry:-p.ry,rz:-p.rz});mz.onclick=()=>duplicatePart(sel,{z:-p.z,rx:-p.rx,ry:-p.ry});
    const title=document.createElement('h3');title.textContent=anchor?`${ANCHOR[p.kind as AnchorKind].label} ${selA+1}`:`${KIND_LABEL[p.kind as PartKind]} ${sel+1}`;
    insp.replaceChildren(title,...(anchor?[]:[color,tools]),...rows);drawIcons();
  }
  function load(it:CatalogItem){draft=it;sel=0;selA=-1;hidden.clear();saved=snap();history=createHistory(saved);undoBtn.disabled=true;resetView();rebuild();renderItems();renderMeta();renderParts();renderFunctions();renderInspector();}
  // Leaving a dirty draft (exit, another item, a new one) first asks what to do with it; the action waits in `pending`.
  function guard(action:()=>void){if(!dirty()){action();return;}pending=action;(q('#ws-guard') as HTMLElement).hidden=false;}
  function settle(run:boolean){(q('#ws-guard') as HTMLElement).hidden=true;const a=pending;pending=null;if(run&&a)a();}
  q('#ws-guard-stay').onclick=()=>settle(false);q('#ws-guard-drop').onclick=()=>settle(true);q('#ws-guard-save').onclick=()=>{if(save())settle(true);else settle(false);};
  function disarm(){armed=false;delBtn.innerHTML=`<i data-lucide="trash-2"></i>${isNative()?'Rétablir l’original':'Supprimer'}`;drawIcons();}

  nameIn.oninput=()=>{draft.name=nameIn.value;nameIn.setCustomValidity('');};emojiIn.oninput=()=>{draft.emoji=emojiIn.value;};priceIn.oninput=()=>{draft.price=+priceIn.value||0;};
  for(const i of [nameIn,emojiIn,priceIn,wIn,dIn])i.onchange=mark;
  kindIn.onchange=()=>{draft.kind=kindIn.value as CatalogItem['kind'];mark();resetView();rebuild();renderMeta();renderFunctions();};wIn.oninput=()=>{draft.w=+wIn.value||1;};dIn.oninput=()=>{draft.d=+dIn.value||1;};
  for(const b of el.querySelectorAll<HTMLElement>('[data-add]'))b.onclick=()=>{draft=addPart(draft,b.dataset.add as PartKind);sel=draft.parts.length-1;selA=-1;mark();rebuild();renderParts();renderFunctions();renderInspector();};
  q('#ws-new').onclick=()=>guard(()=>load(newItem()));undoBtn.onclick=undo;
  q('#ws-reset').onclick=resetView;
  q('#ws-exit').onclick=()=>guard(deps.onExit);
  function save():boolean{
    const name=draft.name.replace(/\s+/g,' ').trim();if(!name){nameIn.setCustomValidity('Donne un nom à l’objet.');nameIn.reportValidity();return false;}
    draft.name=name;if(!draft.id)draft.id=slugId(name,deps.items().map(i=>i.id));deps.save(structuredClone(draft));saved=snap();renderItems();renderMeta();return true;
  }
  q('#ws-save').onclick=save;
  // Deleting takes two clicks: the first arms the button, the second fires, no blocking dialog.
  delBtn.onclick=()=>{if(!armed){armed=true;delBtn.textContent=isNative()?'Sûr ? Rétablir':'Sûr ? Supprimer';return;}const n=natives().find(x=>x.id===draft.id);deps.remove(draft.id);saved='';load(n?captureNative(n):newItem());};
  q('.ws-panel').addEventListener('click',(e:Event)=>{if(armed&&!delBtn.contains(e.target as Node))disarm();});
  q('#ws-dup').onclick=()=>guard(()=>{const d=duplicate(draft,deps.items().map(i=>i.id));if(d.kind==='decor')d.kind='furniture';load(d);});// a copy of a coded piece is a new shop item

  // Pressing on a block or an anchor selects it and drags it: along the floor, or up and down with Shift, snapped to 5 cm.
  // Pressing on the background orbits the camera. The wheel zooms.
  const ray=new THREE.Raycaster();
  const cast=(e:PointerEvent)=>{const r=canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1),camera);return ray;};
  let drag:{x:number;y:number;moved:boolean;move?:{t:any;start:{x:number;y:number;z:number};p0:THREE.Vector3;plane:THREE.Plane;parent:any}}|null=null;
  canvas.onpointerdown=e=>{
    drag={x:e.clientX,y:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);if(!recipe)return;
    const hit=cast(e).intersectObjects([...markers.children,...recipe.children.filter((c:any)=>c.visible)],true)[0];if(!hit)return;
    let o:any=hit.object;while(o.parent&&o.parent!==markers&&o.parent!==recipe)o=o.parent;
    if(o.parent===markers)selA=markers.children.indexOf(o);else{sel=recipe.children.indexOf(o);selA=-1;}rebuild();renderParts();renderFunctions();renderInspector();
    const t=(selA>=0?draft.anchors[selA]:draft.parts[sel]) as any,parent=selA>=0?markers:recipe;parent.updateWorldMatrix(true,false);
    const world=parent.localToWorld(new THREE.Vector3(t.x,t.y,t.z)),normal=e.shiftKey?camera.getWorldDirection(new THREE.Vector3()):new THREE.Vector3(0,1,0);
    const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,world),p0=new THREE.Vector3();if(!ray.ray.intersectPlane(plane,p0))return;
    drag.move={t,start:{x:t.x,y:t.y,z:t.z},p0,plane,parent};
  };
  canvas.onpointermove=e=>{
    if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>4)drag.moved=true;if(!drag.moved)return;
    if(!drag.move){yaw-=dx*.01;pitch=Math.max(.05,Math.min(1.5,pitch+dy*.01));aim();drag.x=e.clientX;drag.y=e.clientY;return;}
    const {t,start,p0,plane,parent}=drag.move,p1=new THREE.Vector3();if(!cast(e).ray.intersectPlane(plane,p1))return;
    const d=parent.worldToLocal(p1.clone()).sub(parent.worldToLocal(p0.clone())),snap=(v:number)=>Math.round(v*20)/20;
    if(e.shiftKey)t.y=snap(start.y+d.y);else{t.x=snap(start.x+d.x);t.z=snap(start.z+d.z);}rebuild();
  };
  canvas.onpointerup=()=>{const d=drag;drag=null;if(d?.move&&d.moved){mark();renderInspector();}};
  canvas.onwheel=e=>{e.preventDefault();camera.zoom=Math.max(.4,Math.min(8,camera.zoom*(e.deltaY<0?1.1:1/1.1)));camera.updateProjectionMatrix();};
  const onKey=(e:KeyboardEvent)=>{if(!opened)return;const typing=(e.target as HTMLElement).closest('input:not([type=range]):not([type=checkbox]):not([type=color]),select');
    if(e.key==='Escape'&&!typing){e.preventDefault();if(pending)settle(false);else guard(deps.onExit);}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!typing){e.preventDefault();undo();}
    if(typing||pending)return;const step=e.shiftKey?.01:.05;
    if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();if(selA>=0){draft.anchors.splice(selA,1);selA=-1;mark();rebuild();renderFunctions();renderInspector();}else removePart(sel);}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();if(selA<0)duplicatePart(sel);}
    const arrow:Record<string,['x'|'y'|'z',number]>={ArrowLeft:['x',-1],ArrowRight:['x',1],ArrowUp:['z',-1],ArrowDown:['z',1],PageUp:['y',1],PageDown:['y',-1]};
    if(arrow[e.key]){e.preventDefault();nudge(arrow[e.key][0],arrow[e.key][1]*step);}};
  document.addEventListener('keydown',onKey);
  drawIcons();

  return {
    open(){if(opened)return;opened=true;el.classList.add('open');el.setAttribute('aria-hidden','false');load(newItem());resize();loop();nameIn.focus();ensureCsg().then(()=>{if(opened)rebuild();});},// cuts carve for real once the toolkit is in
    close(){if(!opened)return;opened=false;cancelAnimationFrame(raf);el.classList.remove('open');el.setAttribute('aria-hidden','true');},
    isOpen:()=>opened,
    refresh(){if(opened){renderItems();renderMeta();}},
    dispose(){this.close();document.removeEventListener('keydown',onKey);root.traverse((o:any)=>o.geometry?.dispose?.());P.disposeGeometries();materials.forEach(m=>m.dispose());extras.forEach(m=>m.dispose());renderer.dispose();el.remove();},
  };
}
