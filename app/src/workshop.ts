// The object workshop: moderators assemble catalogue items out of boxes, cylinders and balls, in the café's own light.
import * as THREE from 'three';
import type {CatalogItem,PartKind,Anchor,AnchorKind} from '@shared/catalog';
import {createPrimitives} from './primitives.ts';
import {buildRecipe} from './recipe.ts';
import {buildAvatar} from './avatar.ts';
import {defaultLook,createHistory} from './look.ts';
import {PALETTE} from './identity.ts';
import {newItem,addPart,slugId,duplicate,setFunction} from './workshop-model.ts';
import {createIcons,Hammer,Box,Cylinder,Circle,Copy,Trash2,Plus,Save,X,LocateFixed,Undo2} from 'lucide';

export interface WorkshopDeps{items():CatalogItem[];save(item:CatalogItem):void;remove(id:string):void;onExit():void}
export interface Workshop{open():void;close():void;isOpen():boolean;refresh():void;dispose():void}
export const WORKSHOP_ICONS={Hammer,Box,Cylinder,Circle,Copy,Trash2,Plus,Save,X,LocateFixed,Undo2};

type Field=[string,string,number,number,number];// key, label, min, max, step
const POSE:Field[]=[['x','X',-4,4,.01],['y','Y',-2,4,.01],['z','Z',-4,4,.01],['rx','Rot X',-3.14,3.14,.01],['ry','Rot Y',-3.14,3.14,.01],['rz','Rot Z',-3.14,3.14,.01]];
const DIMS:Record<PartKind,Field[]>={box:[['w','Largeur',.02,4,.01],['h','Hauteur',.02,4,.01],['d','Profondeur',.02,4,.01],['r','Arrondi',0,.5,.01]],cyl:[['rt','Rayon haut',0,4,.01],['rb','Rayon bas',0,4,.01],['h','Hauteur',.02,4,.01],['n','Facettes',3,64,1]],ball:[['r','Rayon',.02,4,.01],['sx','Étire X',.1,4,.01],['sy','Étire Y',.1,4,.01],['sz','Étire Z',.1,4,.01]]};
const ANCHOR:Record<AnchorKind,{label:string;color:string}>={seat:{label:'Assise',color:'#657757'},surface:{label:'Surface',color:'#d2a754'},portable:{label:'Prise en main',color:'#c9764f'},wearable:{label:'Sur la tête',color:'#8aa6b8'}};
const FUNCTIONS:[AnchorKind,string][]=[['seat','Asseyable'],['surface','Surface'],['portable','Portable'],['wearable','Porté sur la tête']];
const ANCHOR_FIELDS:Field[]=[['x','X',-4,4,.01],['y','Y',-2,4,.01],['z','Z',-4,4,.01],['rot','Orientation',-3.14,3.14,.01]],SURFACE_FIELDS:Field[]=[['w','Largeur',.05,4,.01],['d','Profondeur',.05,4,.01]];
const KIND_LABEL:Record<PartKind,string>={box:'Cube',cyl:'Cylindre',ball:'Sphère'},KIND_ICON:Record<PartKind,string>={box:'box',cyl:'cylinder',ball:'circle'};

const MARKUP=`<aside class="ws-side"><header class="ws-head"><h2><i data-lucide="hammer"></i>Atelier</h2><button id="ws-new" class="tool-btn"><i data-lucide="plus"></i>Nouvel objet</button></header><ul id="ws-items" class="ws-items"></ul></aside>
<div class="ws-view"><canvas id="ws-canvas" tabindex="0" aria-label="Aperçu de l’objet"></canvas><span class="ws-hint">Glisser : tourner · Molette : zoom · Clic : choisir un bloc</span><div class="ws-guard" id="ws-guard" hidden><span>Modifications non enregistrées.</span><button id="ws-guard-save" class="primary">Enregistrer</button><button id="ws-guard-drop" class="ghost-btn">Abandonner</button><button id="ws-guard-stay" class="ghost-btn">Rester</button></div><div class="ws-view-actions"><button id="ws-undo" class="tool-btn" disabled><i data-lucide="undo-2"></i>Annuler</button><button id="ws-reset" class="tool-btn"><i data-lucide="locate-fixed"></i>Vue par défaut</button><button id="ws-exit" class="ghost-btn"><i data-lucide="x"></i>Quitter</button></div></div>
<aside class="ws-side ws-panel">
  <section class="ws-meta"><label>Nom<input id="ws-name" maxlength="30" required/></label><div class="ws-row"><label>Emoji<input id="ws-emoji" maxlength="8"/></label><label>Prix<input id="ws-price" type="number" min="0" max="99999"/></label></div>
    <div class="ws-row"><label>Type<select id="ws-kind"><option value="furniture">Mobilier</option><option value="hat">Chapeau</option></select></label><label class="ws-cells">Cases<input id="ws-w" type="number" min="1" max="4"/>×<input id="ws-d" type="number" min="1" max="4"/></label></div></section>
  <section class="ws-parts"><div class="ws-add"><span>Blocs</span><button data-add="box" title="Ajouter un cube"><i data-lucide="box"></i></button><button data-add="cyl" title="Ajouter un cylindre"><i data-lucide="cylinder"></i></button><button data-add="ball" title="Ajouter une sphère"><i data-lucide="circle"></i></button></div><ul id="ws-parts"></ul></section>
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
  const turntable=new THREE.Group();scene.add(turntable);
  const materials=new Map<string,any>(),extras:any[]=[];let root=new THREE.Group();turntable.add(root);
  const P=createPrimitives(()=>root,materials,extras);
  const camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,100),offset=new THREE.Vector3(13,12.5,16).normalize().multiplyScalar(30),target=new THREE.Vector3();
  let recipe:any=null,markers:any=null,outline:THREE.BoxHelper|null=null;
  // An anchor shows as a ring with an arrow the way it faces; a surface as the translucent slab things will sit on.
  function marker(a:Anchor,parent:any){
    const g=new THREE.Group();g.position.set(a.x,a.y,a.z);g.rotation.y=a.rot;parent.add(g);const col=ANCHOR[a.kind].color,m=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.75,depthTest:false});extras.push(m);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.12,.02,6,20),m);ring.rotation.x=Math.PI/2;g.add(ring);const tip=new THREE.Mesh(new THREE.ConeGeometry(.06,.14,10),m);tip.rotation.x=Math.PI/2;tip.position.z=.2;g.add(tip);
    if(a.kind==='surface'){const slab=new THREE.Mesh(new THREE.BoxGeometry(a.w??1,.02,a.d??1),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.3,depthTest:false}));extras.push(slab.material);g.add(slab);}
    for(const c of g.children)c.renderOrder=2;return g;
  }
  function resetView(){turntable.rotation.y=0;const hat=draft.kind==='hat';target.set(0,hat?1.35:.45,0);camera.zoom=hat?3.2:1.15;camera.position.copy(target).add(offset);camera.lookAt(target);camera.updateProjectionMatrix();}
  function resize(){const w=canvas.clientWidth||1,h=canvas.clientHeight||1;renderer.setSize(w,h,false);const a=w/h;camera.left=-2*a;camera.right=2*a;camera.top=2;camera.bottom=-2;camera.updateProjectionMatrix();}
  new ResizeObserver(resize).observe(canvas);

  function rebuild(){
    root.traverse((o:any)=>o.geometry?.dispose?.());turntable.remove(root);root=new THREE.Group();turntable.add(root);if(outline)scene.remove(outline);outline=null;
    if(draft.kind==='hat'){const rig=buildAvatar(P,0,0,defaultLook(PALETTE[0].hex));recipe=buildRecipe(P,draft.parts,rig.head);}
    else recipe=buildRecipe(P,draft.parts,root);
    markers=new THREE.Group();recipe.parent.add(markers);for(const a of draft.anchors)marker(a,markers);
    const m=selA>=0?markers.children[selA]:recipe.children[sel];if(m){outline=new THREE.BoxHelper(m,new THREE.Color('#c9764f'));(outline.material as any).depthTest=false;scene.add(outline);}
  }
  function render(){renderer.render(scene,camera);}
  function loop(){if(!opened)return;outline?.update();render();raf=requestAnimationFrame(loop);}

  // Left column: what exists. Clicking loads a copy, so a half-done edit never leaks into the list.
  function renderItems(){
    itemsEl.replaceChildren(...deps.items().map(it=>{
      const li=document.createElement('li');const b=document.createElement('button');b.className='ws-item';b.setAttribute('aria-current',String(it.id===draft.id));
      b.innerHTML=`<span class="ws-emoji">${it.emoji}</span><span>${it.name}<small>${it.kind==='hat'?'chapeau':`mobilier · ${it.w}×${it.d}`}</small></span>`;
      b.onclick=()=>guard(()=>load(structuredClone(it)));li.appendChild(b);return li;
    }));
  }
  function renderMeta(){nameIn.value=draft.name;emojiIn.value=draft.emoji;priceIn.value=String(draft.price);kindIn.value=draft.kind;wIn.value=String(draft.w);dIn.value=String(draft.d);(q('.ws-cells') as HTMLElement).hidden=draft.kind==='hat';delBtn.hidden=!draft.id||!deps.items().some(i=>i.id===draft.id);disarm();}
  function renderParts(){
    partsEl.replaceChildren(...draft.parts.map((p,i)=>{
      const li=document.createElement('li');li.setAttribute('aria-current',String(i===sel));
      li.innerHTML=`<button class="ws-part"><i data-lucide="${KIND_ICON[p.kind]}"></i><span style="--c:${p.color}"></span>${KIND_LABEL[p.kind]} ${i+1}</button><button class="ws-mini" title="Dupliquer"><i data-lucide="copy"></i></button><button class="ws-mini" title="Retirer" ${draft.parts.length<2?'disabled':''}><i data-lucide="trash-2"></i></button>`;
      const [pick,dup,del]=li.querySelectorAll('button');
      pick.onclick=()=>{sel=i;selA=-1;rebuild();renderParts();renderFunctions();renderInspector();};
      dup.onclick=()=>{draft.parts.splice(i+1,0,{...p});sel=i+1;mark();rebuild();renderParts();renderInspector();};
      del.onclick=()=>{draft.parts.splice(i,1);sel=Math.min(sel,draft.parts.length-1);mark();rebuild();renderParts();renderInspector();};
      return li;
    }));
    drawIcons();
  }
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
    color.append(Object.assign(document.createElement('span'),{textContent:'Couleur'}),ci);
    const title=document.createElement('h3');title.textContent=anchor?`${ANCHOR[p.kind as AnchorKind].label} ${selA+1}`:`${KIND_LABEL[p.kind as PartKind]} ${sel+1}`;
    insp.replaceChildren(title,...(anchor?[]:[color]),...rows);
  }
  const drawIcons=()=>createIcons({icons:WORKSHOP_ICONS,attrs:{'stroke-width':1.65}});
  function load(it:CatalogItem){draft=it;sel=0;selA=-1;saved=snap();history=createHistory(saved);undoBtn.disabled=true;resetView();rebuild();renderItems();renderMeta();renderParts();renderFunctions();renderInspector();}
  // Leaving a dirty draft (exit, another item, a new one) first asks what to do with it; the action waits in `pending`.
  function guard(action:()=>void){if(!dirty()){action();return;}pending=action;(q('#ws-guard') as HTMLElement).hidden=false;}
  function settle(run:boolean){(q('#ws-guard') as HTMLElement).hidden=true;const a=pending;pending=null;if(run&&a)a();}
  q('#ws-guard-stay').onclick=()=>settle(false);q('#ws-guard-drop').onclick=()=>settle(true);q('#ws-guard-save').onclick=()=>{if(save())settle(true);else settle(false);};
  function disarm(){armed=false;delBtn.innerHTML='<i data-lucide="trash-2"></i>Supprimer';drawIcons();}

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
  delBtn.onclick=()=>{if(!armed){armed=true;delBtn.textContent='Sûr ? Supprimer';return;}deps.remove(draft.id);load(newItem());};
  q('.ws-panel').addEventListener('click',(e:Event)=>{if(armed&&!delBtn.contains(e.target as Node))disarm();});
  q('#ws-dup').onclick=()=>guard(()=>load(duplicate(draft,deps.items().map(i=>i.id))));

  // Turntable: drag spins the object, the wheel zooms, a still click picks the block under the cursor.
  let drag:{x:number;y:number;moved:boolean}|null=null;
  canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{if(!drag)return;const dx=e.clientX-drag.x;if(Math.abs(dx)+Math.abs(e.clientY-drag.y)>4)drag.moved=true;if(drag.moved){turntable.rotation.y+=dx*.01;drag.x=e.clientX;drag.y=e.clientY;}};
  canvas.onpointerup=e=>{const d=drag;drag=null;if(!d||d.moved||!recipe)return;
    const r=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1),camera);
    const hit=ray.intersectObjects([...markers.children,...recipe.children],true)[0];if(!hit)return;
    let o:any=hit.object;while(o.parent&&o.parent!==markers&&o.parent!==recipe)o=o.parent;
    if(o.parent===markers)selA=markers.children.indexOf(o);else{sel=recipe.children.indexOf(o);selA=-1;}rebuild();renderParts();renderFunctions();renderInspector();};
  canvas.onwheel=e=>{e.preventDefault();camera.zoom=Math.max(.4,Math.min(8,camera.zoom*(e.deltaY<0?1.1:1/1.1)));camera.updateProjectionMatrix();};
  const onKey=(e:KeyboardEvent)=>{if(!opened)return;const typing=(e.target as HTMLElement).closest('input:not([type=range]):not([type=checkbox]):not([type=color]),select');
    if(e.key==='Escape'&&!typing){e.preventDefault();if(pending)settle(false);else guard(deps.onExit);}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!typing){e.preventDefault();undo();}};
  document.addEventListener('keydown',onKey);
  drawIcons();

  return {
    open(){if(opened)return;opened=true;el.classList.add('open');el.setAttribute('aria-hidden','false');load(newItem());resize();loop();nameIn.focus();},
    close(){if(!opened)return;opened=false;cancelAnimationFrame(raf);el.classList.remove('open');el.setAttribute('aria-hidden','true');},
    isOpen:()=>opened,
    refresh(){if(opened){renderItems();renderMeta();}},
    dispose(){this.close();document.removeEventListener('keydown',onKey);root.traverse((o:any)=>o.geometry?.dispose?.());materials.forEach(m=>m.dispose());extras.forEach(m=>m.dispose());renderer.dispose();el.remove();},
  };
}
