import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { createNavigator } from './navigation.ts';
import { GRID, footprint, cellsOf, custom, isBuiltIn } from './shop.ts';
import { buildRecipe } from './recipe.ts';
import type { Cell } from './shop.ts';
import { C, createPrimitives } from './primitives.ts';
import { createDecor } from './decor.ts';
import type { DecorContext } from './decor.ts';
import { buildGarden } from './garden.ts';
import { DIMS } from './coords.ts';
import type { RoomKind } from './coords.ts';
import { buildAvatar, applyLook, lookFor, hexOf, type Rig } from './avatar.ts';
import type { Look } from './look.ts';
import { tint } from '../../server/src/scoring.ts';
import { decodeEntities } from './chat.ts';

export interface SceneState { seated?: boolean; walking?: boolean; hover?: {task?: {id: string; text: string; category: string | null; kind: string}; hotspot?: {id: string; title: string; sub: string}; x: number; y: number} | null; hotspot?: string; placing?: {id: string; cell: {c: number; r: number} | null; refused?: boolean}; focusTask?: string; zoom?: number; follow?: boolean; editing?: boolean }
export interface RemoteInfo { name: string; color: number; hat: string | null; look?: Look; col: number; row: number; state: 'idle'|'walking'|'focus'|'pause'|'collective'; wander?: boolean }
interface LightSet { hemi: [string,string,number]; sun: [string,number]; fill: number; lamps: number }
// Daylight and evening per room, read both when the lights are created and every time `toggleLight` flips them.
const CAFE_LIGHT: {day: LightSet; evening: LightSet}={
  day:{hemi:['#fff5dc','#a8b294',1.2],sun:['#ffd08f',2.2],fill:.5,lamps:1},
  evening:{hemi:['#8ea2cc','#a8b294',.35],sun:['#ff8c4c',.35],fill:.15,lamps:3},
};
const LIGHT: Record<RoomKind,{day: LightSet; evening: LightSet}>={
  cafe:CAFE_LIGHT,private:CAFE_LIGHT,
  garden:{day:{hemi:['#f4f8ff','#c8d2bc',1.5],sun:['#fff0d0',2.4],fill:.6,lamps:1},
    evening:{hemi:['#9fb0c8','#3f4a44',.35],sun:['#ffa26e',.3],fill:.15,lamps:3}},
};
export function createCafe(container: HTMLElement, onState: (state: SceneState) => void, {room='cafe',furniture={},look}: {room?: RoomKind; furniture?: Record<string, Cell>; look: Look}) {
  const scene=new THREE.Scene();
  const tick=(n: string)=>performance.mark('cafe:'+n);let firstFrame=false;tick('start');
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
  const BASE_PR=Math.min(window.devicePixelRatio,2);let pixelRatio=BASE_PR;// adaptive: never above the base, never below .75 — 1.25 used to cap Retina screens well under native, blurring fine detail like bubble text
  renderer.setPixelRatio(pixelRatio);
  tick('renderer');
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  // Shadows are rendered on demand. `stir` counts the frames still owed one; two frames cover a mover's last step and the pose it settles into.
  renderer.shadowMap.autoUpdate=false;let stir=3;
  const restage=()=>{stir=Math.max(stir,2);};
  const stage=()=>{if(stir>0){stir--;renderer.shadowMap.needsUpdate=true;}};
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
  renderer.domElement.setAttribute('aria-label','Café en 3D : cliquer au sol pour marcher, glisser pour déplacer la vue, molette pour zoomer');
  renderer.domElement.tabIndex=0;container.append(renderer.domElement);
  const camera=new THREE.OrthographicCamera(-10,10,10,-10,.1,100);
  const AVATAR_LAYER=1;// the editor renders the avatar alone on this layer, sharp, over the blurred backdrop
  const {w:W,d:D}=DIMS[room],HW=W/2,HD=D/2;// the public rooms are 24x20; your own is a cosy 12x10
  let root: any=scene;// helpers build into this; a translated group lets the original layout keep its coordinates
  const materials=new Map<string, any>(), extras: any[]=[], obstacles: any[]=[], steam: any[]=[], pendants: any[]=[], windows: any[]=[], seats: any[]=[], taskSpots: any[]=[], hotspots: any[]=[];
  const P=createPrimitives(()=>root,materials,extras);const {mat,mesh,box,cyl,ball,group}=P;
  function hotspot(object: any,id: string,title: string,sub: string){object.userData.keep=true;object.userData.hotspot={id,title,sub};hotspots.push(object);return object;}
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rootOrigin=()=>{root.updateWorldMatrix(true,false);return new THREE.Vector3().setFromMatrixPosition(root.matrixWorld);};
  let previewing=false;// while a ghost piece is being built, nothing is registered for gameplay
  function obstacle(x: number,z: number,w: number,d: number){if(previewing)return;const o=rootOrigin();obstacles.push({x:x+o.x,z:z+o.z,w,d});}
  // A seat: world position, cushion height, the direction it faces and the mesh that catches the click.
  function taskSpot(x: number,y: number,z: number){if(previewing)return;const o=rootOrigin();taskSpots.push(new THREE.Vector3(x+o.x,y,z+o.z));}
  function seat(x: number,z: number,y: number,rot: number,object: any){if(previewing)return;object.userData.keep=true;const o=rootOrigin();seats.push({x:x+o.x,z:z+o.z,y,rot,object});}
  // Movers never write the shadow maps — those would have to be redrawn every frame they walk, the single biggest cost on
  // integrated GPUs. Each gets a soft disc that follows it instead; the maps only refresh when the room itself changes.
  function ground(rig: any){
    rig.g.traverse((o: any)=>{if(o.isMesh)o.castShadow=false;});
    if(!rig.g.userData.blob&&rig.g.parent){const b=new THREE.Mesh(new THREE.CircleGeometry(.3,24),new THREE.MeshBasicMaterial({color:'#694a30',transparent:true,opacity:.14,depthWrite:false}));
      b.rotation.x=-Math.PI/2;b.scale.set(1,.85,1);b.castShadow=b.receiveShadow=false;b.userData.keep=true;b.position.set(rig.g.position.x,.018,rig.g.position.z);rig.g.parent.add(b);rig.g.userData.blob=b;}
    return rig;
  }
  function shadow(x: number,z: number,sx: number,sz: number,opacity=.12){const m=mesh(new THREE.CircleGeometry(1,32),new THREE.MeshBasicMaterial({color:'#694a30',transparent:true,opacity,depthWrite:false}),x,.018,z);m.rotation.x=-Math.PI/2;m.scale.set(sx,sz,1);m.castShadow=false;}
  const dctx: DecorContext={p:P,scene,root:()=>root,previewing:()=>previewing,HD,obstacle,seat,taskSpot,hotspot,shadow,steam,pendants,windows,taskSpots};
  tick('primitives');
  const D_=createDecor(dctx);
  const {label,plant,mug,book,chair,sofa,rug,coffeeTable,bookcase,shelfWall,backWindow,lamp,squareTable,armchair,cactus,coffeeCorner,roundTable,pool,windowLight,OAK,TRIM,SHADE,BULB,windowGlow}=D_;
  // Your room is a grid of floor tiles; a piece sits centred on its footprint.
  const cellCentre=(id: string,{c,r}: Cell): [number,number]=>{const f=footprint(id);return [-HW+c+f.w/2,-HD+r+f.d/2];};
  const furnitureObstacles: Record<string, number[]>={};// obstacle indices per placed piece, so a piece being moved does not block itself
  function buildPiece(id: string,x: number,z: number,rot=0){
    const c=isBuiltIn(id)?null:custom(id);if(c){const g=buildRecipe(P,c.parts,root);g.position.set(x,0,z);g.rotation.y=rot;obstacle(x,z,c.w*.95,c.d*.95);shadow(x,z,c.w*.5,c.d*.45);
      const cs=Math.cos(rot),sn=Math.sin(rot);for(const a of c.anchors)if(a.kind==='seat')seat(x+a.x*cs+a.z*sn,z-a.x*sn+a.z*cs,a.y,rot+a.rot,g);return;}
    (({plant:()=>{plant(x,z,1.3);obstacle(x,z,.75,.75);shadow(x,z,.5,.45);},cactus:()=>cactus(x,z),lamp:()=>lamp(x,z),bookshelf:()=>bookcase(x,z,0),coffee:()=>coffeeCorner(x,z),couch:()=>armchair(x,z,rot)}) as Record<string, ()=>void>)[id]?.();
  }
  function placeFurniture(id: string,cell: Cell){
    if(!cell)return;const [x,z]=cellCentre(id,cell),before=obstacles.length;
    buildPiece(id,x,z,Math.atan2(-x,-z));restage();furnitureObstacles[id]=Array.from({length:obstacles.length-before},(_,i)=>before+i);
  }

  RectAreaLightUniformsLib.init();// RectAreaLight is unlit garbage without its LTC tables
  const daylight=LIGHT[room].day;
  const hemi=new THREE.HemisphereLight(...daylight.hemi);scene.add(hemi);
  const sun=new THREE.DirectionalLight(...daylight.sun);sun.position.set(-3,10,5);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);sun.shadow.normalBias=.035;sun.shadow.bias=-.00015;sun.shadow.radius=4;scene.add(sun);
  // Fit the shadow frustum to this room's box in the sun's own axes, so a 1024 map is never spent on empty space — the small room gets a sharper one for free.
  function fitSun(){
    const cam=sun.shadow.camera;cam.position.copy(sun.position);cam.lookAt(0,0,0);cam.updateMatrixWorld();
    const inverse=new THREE.Matrix4().copy(cam.matrixWorld).invert(),b=new THREE.Box3();
    for(const x of [-HW-1,HW+1])for(const y of [-.4,4.4])for(const z of [-HD-1,HD+1])b.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(inverse));
    Object.assign(cam,{left:b.min.x,right:b.max.x,top:b.max.y,bottom:b.min.y,near:-b.max.z-.5,far:-b.min.z+.5});cam.updateProjectionMatrix();
  }
  fitSun();
  const fill=new THREE.DirectionalLight('#dfe8f4',daylight.fill);fill.position.set(9,6,-3);scene.add(fill);
  const FLOOR=(room==='garden'?['#e8e2cf','#e1dbc6','#e8e2cf','#e1dbc6']:['#d7b48d','#d9b892','#d4ae87','#debc97']).map(c=>mat(c,{roughness:.95}));
  // A freestanding diorama; the front and right sides remain open.
  box(W+.35,.38,D+.35,C.edge,0,-.24,0,.12);
  box(W+.25,.20,D+.25,C.oak,0,-.05,0,.08);
  for(let iz=0;iz<D;iz++)for(let ix=0;ix<W;ix++) {
    box(.98,.045,.98,FLOOR[(ix*3+iz*7)%4],ix-HW+.5,.025,iz-HD+.5,0);// flat: a .015 bevel on a floor tile is invisible and cost 900 vertices a tile
  }
  if(room!=='garden'){// the veranda glazes both walls itself, and a solid wall would hide the garden behind it
    box(W+.28,3.85,.20,C.cream,0,1.93,-HD-.07,.035);
    box(.20,3.85,D+.28,'#ecd8b8',-HW-.07,1.93,0,.035);
  }
  box(W+.42,.18,.34,C.oak,0,3.91,-HD-.07,.035);
  box(.34,.18,D+.45,C.oak,-HW-.07,3.91,0,.035);
  box(W-.1,.15,.08,room==='garden'?C.sage:C.edge,0,.17,-HD+.06,.01);
  box(.08,.15,D-.1,room==='garden'?C.sage:C.edge,-HW+.06,.17,0,.01);
  let dusk: ((evening: boolean)=>void)|null=null;// the garden tints its glazing at nightfall
  if(room==='cafe'){
  // The original café, untouched, tucked into the back-left corner of the bigger room.
  root=group(-HW+6,0,-HD+5);
  // Terracotta backsplash made from actual staggered brick geometry.
  for(let row=0;row<6;row++)for(let col=0;col<20;col++){
    let x=-5.75+col*.59+(row%2)*.28;if(x>5.8)continue;
    box(.555,.235,.045,['#c78962','#d59a73','#cc8e68'][(col+row)%3],x,1.47+row*.26,-4.938,.014);
  }
  // Tall sage window on the left wall, with a soft landscape behind its panes.
  box(.12,2.3,3.55,C.edge,-5.91,2.08,-1.7,.04);
  box(.08,2.10,3.33,'#bed1be',-5.825,2.08,-1.7,.01);
  box(.025,1.9,3.12,windowGlow,-5.77,2.1,-1.7,.0);
  for(let i=0;i<3;i++)box(.1,2.17,.065,C.cream,-5.71,2.08,-3.3+i*1.6,.008);
  box(.1,.065,3.25,C.cream,-5.70,2.12,-1.7,.008);
  box(.42,.13,3.65,C.oak,-5.72,.94,-1.7,.04);
  windowLight(-HW+.4,2.1,-HD+3.3,3.12,1.9,[-HW+4,1.1,-HD+3.3]);// same pane, but the café group is offset so this one is placed in world space
  plant(-5.63,-2.85,.48,1.02);plant(-5.63,-.6,.56,1.02);
  // A low wall panel with vertical timber slats behind the sofa.
  box(.10,1.0,3.8,C.sage,-5.91,.6,2.75,.02);
  for(let i=0;i<16;i++)box(.06,.91,.042,'#6f846b',-5.82,.59,.94+i*.235,.01);
  label('slow mornings',2.1,.62,-5.79,2.95,2.7,{ry:Math.PI/2,bg:'#ecd8b8',color:C.edge,size:145});
  // Counter with a fluted front and a cream stone top.
  hotspot(box(7.1,.83,1.40,C.wood,.85,.485,-3.10,.08),'tasks','Passer commande','tes tâches du jour');obstacle(.85,-3.10,7.15,1.45);
  for(let i=0;i<36;i++)box(.075,.69,.045,C.oak,-2.55+i*.195,.475,-2.371,.01);
  box(7.34,.18,1.58,C.cream,.85,.95,-3.10,.05);
  box(7.0,.08,.12,C.edge,.85,.16,-2.34,.015);
  // Back worktop and overhead shelves.
  box(5.3,.95,.45,C.oak,.5,.6,-4.72,.02);box(5.5,.1,.6,C.white,.5,1.12,-4.65,.02);
  for(let x=-2;x<3.2;x+=1.05){box(.025,.75,.025,C.edge,x,.62,-4.47,.003);box(.23,.035,.05,C.edge,x+.43,.88,-4.44,.007);}
  for(const y of [2.22,2.90]){
    box(2.20,.11,.45,C.oak,3.78,y,-4.70,.02);
    for(let i=0;i<5;i++){
      if(y>2.5){box(.23,.35+(i%2)*.07,.2,[C.terra,C.sage,C.gold,C.peach,C.cream][i],2.98+i*.38,y+.24,-4.66,.015);box(.17,.10,.015,C.cream,2.98+i*.38,y+.24,-4.547,.002);}
      else mug(3.04+i*.34,y+.07,-4.63,i%2?C.sage:C.white,root,false);
    }
  }
  const cafe=root;root=group(0,-.35,.32);// everything on the counter rides along with it
  // Espresso machine with two groups, a drip tray and stacked cups.
  box(1.42,.75,.64,C.terra,-1.40,1.77,-3.57,.09);
  box(1.18,.39,.065,'#c4bbaa',-1.40,1.69,-3.22,.01);
  box(1.47,.07,.82,C.edge,-1.40,1.44,-3.47,.015);
  for(const x of [-1.76,-1.10]){
    cyl(.08,.08,.12,'#454b43',x,1.71,-3.10);box(.08,.06,.25,C.dark,x,1.73,-2.99,.02);
    mug(x,1.49,-3.23,C.white,root,false);ball(.035,'#93b98a',x,1.93,-3.235);
  }
  for(let i=0;i<4;i++)mug(-1.86+i*.30,2.15,-3.58,C.white,root,false);
  // Coffee grinder.
  box(.40,.41,.44,C.dark,-.28,1.62,-3.62,.035);cyl(.19,.14,.36,'#946844',-.28,2.0,-3.62);cyl(.21,.21,.045,C.dark,-.28,2.2,-3.62);
  // Pastry display: a transparent hood, timber frame and individual pastries.
  box(2.10,.10,.92,C.oak,2.49,1.43,-3.30,.04);
  const glass=mat('#e6f4ed',{transparent:true,opacity:.18,roughness:.12,metalness:.05,depthWrite:false});
  hotspot(box(2.05,.68,.87,glass,2.49,1.81,-3.30,.025),'shop','La boutique','chapeaux, mobilier et sets');
  for(const x of [1.46,3.52])for(const z of [-3.73,-2.87])box(.045,.77,.045,C.gold,x,1.83,z,.007);
  box(2.16,.055,.99,C.oak,2.49,2.23,-3.30,.02);
  for(let i=0;i<3;i++)for(let j=0;j<2;j++){
    const x=1.82+i*.62,z=-3.53+j*.43;cyl(.22,.22,.028,C.white,x,1.51,z);
    if(i===1){cyl(.145,.145,.17,'#965c3b',x,1.60,z);cyl(.148,.148,.035,'#eed8b5',x,1.70,z);ball(.035,C.terra,x,1.75,z);}
    else {const croissant=mesh(new THREE.TorusGeometry(.12,.063,7,10,Math.PI*1.4),i===0?'#d29a50':'#ba7847',x,1.59,z);croissant.rotation.x=Math.PI/2;}
  }
  mug(.55,1.40,-3.1,C.sage,root,true);plant(4.09,-3.48,.52,1.4);
  root=cafe;
  // Menus: textures are only used for lettering; every object remains 3D.
  box(1.40,1.51,.09,C.edge,-1.45,2.99,-4.85,.02);
  label('LE MENU\nEspresso     2,5\nCappuccino     4\nMatcha latte     4,5\nUn peu de douceur',1.25,1.36,-1.45,2.99,-4.796,{size:111});
  box(1.12,1.51,.09,C.edge,.12,2.99,-4.85,.02);
  label('fait maison\n& avec amour\n—\ncookies • cakes\ncroissants',.98,1.36,.12,2.99,-4.796,{bg:C.terra,size:130});
  label('CAFÉ PETIT JOUR',3.9,.53,1.2,3.57,-4.945,{bg:C.cream,color:C.edge,size:115});
  // Hanging plant at the counter corner.
  plant(-4.7,-4.43,.80,2.17);for(let i=0;i<4;i++)ball(.16,C.sage,-4.43+i*.04,2.55-i*.20,-4.30,root,.8,1.2,.7);
  for(const x of [-4.85,-4.57])cyl(.012,.012,1.1,C.edge,x,3.11,-4.43);
  // Sofa, two pillows, a woven rug and a coffee table.
  sofa(-4.92,2.28);shadow(-4.86,2.3,.9,1.85);rug(-3.17,2.25);coffeeTable(-3.55,2.3);
  // Two café tables, plus a shared desk with a laptop.
  roundTable(-1.3,-.1);chair(-2.42,-.1,Math.PI/2,C.terra);chair(-.19,-.1,-Math.PI/2,C.sage);
  roundTable(.30,3.02);chair(-.78,3.15,Math.PI/2,C.sage);chair(1.4,3.02,-Math.PI/2,C.terra);
  box(1.6,.16,2.45,OAK,3.81,1.05,.46,.09);taskSpot(4.3,1.14,-.3);taskSpot(3.4,1.14,1.3);
  for(const x of [3.22,4.40])for(const z of [-.50,1.42])box(.10,.98,.10,TRIM,x,.52,z,.02);
  obstacle(3.81,.46,1.64,2.5);shadow(3.81,.46,1.0,1.45);
  chair(2.49,-.21,Math.PI/2,C.terra);chair(2.49,1.17,Math.PI/2,C.sage);
  chair(5.03,-.21,-Math.PI/2,C.sage);chair(5.03,1.17,-Math.PI/2,C.terra);
  const laptop=group(3.60,1.16,-.15,Math.PI/2);
  box(.65,.035,.46,'#c2baa8',0,0,0,.025,laptop);
  const screen=box(.65,.43,.035,C.dark,0,.215,-.21,.025,laptop);screen.rotation.x=-.18;
  const display=box(.57,.34,.01,'#c0d1b5',0,.215,-.184,.012,laptop);display.rotation.x=-.18;
  book(3.71,1.17,.96,.46,C.sage);mug(4.18,1.15,.67,C.terra,root,true);plant(4.10,-.37,.4,1.15);
  // Entrance plants and a small bookcase to complete the open edges.
  plant(5.05,3.91,1.45);obstacle(5.05,3.91,.75,.75);shadow(5.05,3.91,.52,.47);
  plant(-4.65,-2.90,1.4);obstacle(-4.65,-2.90,.78,.78);
  bookcase(5.30,-3.96);
  plant(5.23,-3.95,.65,1.43);
  // Two pendant lamps. Fine cords preserve the low-poly silhouette.
  for(const x of [-1.3,3.7]){
    cyl(.014,.014,.9,C.edge,x,3.45,.2);
    cyl(.18,.43,.32,SHADE,x,2.92,.2,root,24);
    cyl(.39,.39,.025,BULB,x,2.765,.2);
    pool(x,2.6,.2,root,true);// the two lamps over the tables are the only ones in the café that drop a shadow
  }

  // --- The rest of the bigger room, in world coordinates. ---
  root=scene;
  // Back wall, right half: a reading corner between two tall bookshelves and a window.
  backWindow(6.2);shelfWall(2.4,-HD+.3,3.2);shelfWall(10.2,-HD+.3,3.2);
  sofa(6.2,-6.9,-Math.PI/2);shadow(6.2,-6.8,1.85,.9);rug(6.2,-5.6,Math.PI/2);coffeeTable(6.2,-5.4,Math.PI/2);
  chair(4.4,-4.4,Math.PI*.8,C.terra);chair(8.0,-4.4,-Math.PI*.8,C.sage);
  lamp(3.6,-8.3);lamp(8.8,-8.3);plant(11.3,-8.6,1.3);obstacle(11.3,-8.6,.75,.75);
  label('lire, rêver,\nrecommencer',2.6,.8,6.2,3.45,-HD+.06,{bg:C.terra,size:120});
  // Left wall, front half: a long banquette with three small tables.
  box(.10,1.0,7.6,C.sage,-HW+.09,.6,5.2,.02);for(let i=0;i<32;i++)box(.06,.91,.042,'#6f846b',-HW+.18,.59,1.5+i*.235,.01);
  box(.95,.48,7.2,C.edge,-11.3,.24,5.2,.06);box(.22,.75,7.2,C.sage,-11.66,1.0,5.2,.1);
  for(const dz of [-3.5,3.5])box(1.0,.6,.22,C.sage,-11.3,.8,5.2+dz,.09);
  obstacle(-11.3,5.2,1.0,7.4);shadow(-11.2,5.2,.6,3.7);
  const bench=box(.9,.22,7.1,C.sage,-11.28,.6,5.2,.1);
  for(const z of [2.7,5.2,7.7]){seat(-11.2,z,.72,Math.PI/2,bench);squareTable(-10.2,z);chair(-9.15,z,-Math.PI/2,z===5.2?C.terra:C.sage);mug(-10.35,1.05,z-.2,C.white,root,z===5.2);book(-10.05,1.05,z+.22,.34,C.sage);}
  plant(-11.3,9.3,1.35);obstacle(-11.3,9.3,.75,.75);plant(-11.3,1.0,1.1);obstacle(-11.3,1.0,.7,.7);
  label('petits matins',2.1,.62,-HW+.11,2.95,5.2,{ry:Math.PI/2,bg:'#ecd8b8',color:C.edge,size:145});
  // Middle and front-right: a communal table, two more café tables and the entrance.
  box(4.4,.16,1.4,OAK,5.6,1.05,2.6,.09);for(const x of [4.0,6.2,7.4])taskSpot(x,1.14,2.35);for(const x of [3.6,7.6])for(const z of [2.05,3.15])box(.10,.98,.10,TRIM,x,.52,z,.02);
  obstacle(5.6,2.6,4.45,1.45);shadow(5.6,2.6,2.3,.9);
  for(const x of [4.2,5.6,7.0]){chair(x,1.45,0,x===5.6?C.terra:C.sage);chair(x,3.75,Math.PI,x===5.6?C.sage:C.terra);}
  mug(4.3,1.15,2.3,C.terra,root,true);mug(6.9,1.15,2.9,C.sage);book(5.5,1.17,2.9,.46,C.sage);cyl(.16,.11,.24,C.terra,5.7,1.25,2.3);ball(.17,C.sage,5.7,1.46,2.3,root,1,.9,1);
  roundTable(1.0,6.6);chair(-.1,6.6,Math.PI/2,C.sage);chair(2.1,6.6,-Math.PI/2,C.terra);
  roundTable(9.0,6.8);chair(7.9,6.8,Math.PI/2,C.terra);chair(10.1,6.8,-Math.PI/2,C.sage);
  plant(4.6,9.2,1.4);obstacle(4.6,9.2,.75,.75);plant(11.3,3.2,1.2);obstacle(11.3,3.2,.7,.7);
  bookcase(11.4,-3.2);bookcase(11.4,-1.6);
  // Little welcome mat at the open entrance.
  box(1.5,.022,.68,C.sage,7.0,.061,9.5,.08);
  for(const [x,z] of [[6.2,-6.5],[5.6,2.6],[-10.2,5.2],[1.0,6.6]]){
    cyl(.014,.014,.9,C.edge,x,3.45,z);cyl(.18,.43,.32,SHADE,x,2.92,z,root,24);cyl(.39,.39,.025,BULB,x,2.765,z);
    pool(x,2.6,z,scene);
  }
  } else if(room==='garden'){
  dusk=buildGarden(D_,dctx,{W,D,HW,HD});
  } else {
  // --- Your own room: a quiet corner with a desk, a small sofa and space left for the furniture you will buy. ---
  backWindow(-1.2);
  box(.10,1.0,6.4,C.sage,-HW+.09,.6,1.2,.02);for(let i=0;i<27;i++)box(.06,.91,.042,'#6f846b',-HW+.18,.59,-1.9+i*.235,.01);
  label('chez moi',2.1,.62,-HW+.11,2.95,1.2,{ry:Math.PI/2,bg:'#ecd8b8',color:C.edge,size:145});
  // desk against the back wall, with a laptop, a mug and a lamp
  hotspot(box(2.2,.12,.9,OAK,2.6,1.02,-HD+.75,.05),'shop','Aménager','boutique et mobilier de ta pièce');for(const x of [1.65,3.55])for(const z of [-HD+.4,-HD+1.1])box(.08,.96,.08,TRIM,x,.5,z,.015);
  obstacle(2.6,-HD+.75,2.25,.95);shadow(2.6,-HD+.75,1.3,.6);taskSpot(1.8,1.1,-HD+.55);
  const laptop=group(2.9,1.08,-HD+.7,Math.PI);box(.65,.035,.46,'#c2baa8',0,0,0,.025,laptop);const screen=box(.65,.43,.035,C.dark,0,.215,-.21,.025,laptop);screen.rotation.x=-.18;const display=box(.57,.34,.01,'#c0d1b5',0,.215,-.184,.012,laptop);display.rotation.x=-.18;
  mug(2.05,1.08,-HD+.95,C.terra);book(3.5,1.1,-HD+1.0,.4,C.sage);lamp(4.1,-HD+.55);
  chair(2.6,-HD+1.65,Math.PI,C.terra);
  // full-length mirror on the back wall, left of the desk: where you go to change how you look
  box(1.0,1.35,.04,OAK,1.25,1.75,-HD+.04,.03);
  hotspot(box(.9,1.25,.06,'#cfd8d2',1.25,1.75,-HD+.06,.03),'mirror','Mon personnage','changer de tête, de coiffure ou de tenue');
  // reading corner
  sofa(-3.6,-2.9,-Math.PI/2);shadow(-3.6,-2.8,1.85,.9);rug(-3.6,-1.6,Math.PI/2);coffeeTable(-3.6,-1.4,Math.PI/2);
  plant(-5.3,-4.3,1.2);obstacle(-5.3,-4.3,.7,.7);plant(5.3,4.2,1.35);obstacle(5.3,4.2,.75,.75);bookcase(5.4,-3.6);
  box(1.5,.022,.68,C.sage,3.0,.061,4.5,.08);// welcome mat
  tick('room');
  for(const [id,slot] of Object.entries(furniture))placeFurniture(id,slot);// what you bought and put here
  tick('furniture');
  for(const [x,z] of [[-3.6,-1.4],[2.6,1.2]]){
    cyl(.014,.014,.9,C.edge,x,3.45,z);cyl(.18,.43,.32,SHADE,x,2.92,z,root,24);cyl(.39,.39,.025,BULB,x,2.765,z);
    pool(x,2.6,z,scene,true);// both pendants at home are over the sofa and the desk, so both cast
  }
  }

  // Bake the static décor: one mesh per material instead of one per box. Seats stay separate so they can glow and be clicked.
  function bake(target: any){
    const buckets=new Map<any, any>(),doomed: any[]=[];target.updateWorldMatrix(true,true);const inverse=new THREE.Matrix4().copy(target.matrixWorld).invert();
    target.traverse((o: any)=>{
      if(!o.isMesh||o===target)return;
      for(let a=o;a&&a!==target;a=a.parent)if(a.userData.keep&&a!==target)return;
      const g=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld));// RoundedBoxGeometry is non-indexed, so everything merges non-indexed
      const b=buckets.get(o.material)??{geos:[],cast:false};b.geos.push(g);b.cast||=o.castShadow;buckets.set(o.material,b);doomed.push(o);
    });
    for(const o of doomed){o.parent.remove(o);o.geometry.dispose();}
    for(const [material,{geos,cast}] of buckets){
      const m=new THREE.Mesh(mergeGeometries(geos,false),material);geos.forEach((g: any)=>g.dispose());
      m.castShadow=cast;m.receiveShadow=true;m.userData.keep=true;target.add(m);
    }
  }
  for(const {object} of seats)if(object.isGroup)bake(object);
  bake(scene);
  scene.traverse((o: any)=>{if(o.isLight)o.layers.enable(AVATAR_LAYER);});// else the sharp avatar pass draws it unlit

  const player: Rig=ground(buildAvatar(P,0,room==='private'?2:2.5,look)),avatar=player.g;
  tick('player');
  // applyLook rebuilds the skull, hair and hat, and the new meshes start on layer 0 only
  function reskin(l: Look){applyLook(P,player,l);if(mode!=='edit')ground(player);restage();if(mode==='edit')avatar.traverse((o: any)=>o.layers.enable(AVATAR_LAYER));}
  function setLook(l: Look){reskin(l);}
  // A name tag as a camera-facing sprite. Cheap to build, one texture per avatar.
  // Fixed screen size regardless of zoom (like the chat bubbles below) — never lets a name shrink below NAME_TAG_PX on a far-out camera.
  const NAME_TAG_PX=14;
  function nameTag(text: string,color: number){
    const c=document.createElement('canvas'),ctx=c.getContext('2d')!;c.width=256;c.height=64;
    ctx.font='600 30px Manrope, DM Sans, sans-serif';
    // Layout budget: left pad + dot + gap + text + right pad. Only the rare very-long name gets squeezed (240 cap) — everyone else renders at their natural width.
    const LEFT=16,DOT=16,GAP=10,RIGHT=16,textWidth=ctx.measureText(text).width;
    const w=Math.min(240,LEFT+DOT+GAP+textWidth+RIGHT);
    ctx.fillStyle='#fffdf6e6';ctx.beginPath();ctx.roundRect((256-w)/2,8,w,48,24);ctx.fill();
    ctx.fillStyle='#'+color.toString(16).padStart(6,'0');ctx.beginPath();ctx.arc((256-w)/2+LEFT+DOT/2,32,8,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#000';ctx.textBaseline='middle';ctx.fillText(text,(256-w)/2+LEFT+DOT+GAP,33,w-LEFT-DOT-GAP-RIGHT);
    const k=NAME_TAG_PX/30;return sprite(c,1.6,.4,0,2.15,256*k,64*k);
  }
  function stateBubble(state: string){
    const c=document.createElement('canvas'),ctx=c.getContext('2d')!;c.width=64;c.height=64;
    ctx.font='40px serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(state==='focus'?'🍅':'☕',32,34);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false}));s.scale.set(.45,.45,1);s.position.set(.45,1.85,0);return s;
  }
  function dropSprite(s: THREE.Sprite){const m=s.material as THREE.SpriteMaterial;s.removeFromParent();m.map?.dispose();m.dispose();}
  // Placement mode: the floor shows its free tiles, a ghost of the piece follows the pointer, a click picks a tile.
  let mode: 'walk'|'place'|'edit'='walk';// exclusive: walking the room, placing a piece, or posing in the editor
  let placing: any=null;const gridGroup=new THREE.Group();scene.add(gridGroup);
  const key=(c: number,r: number)=>`${c},${r}`;
  function blockedCells(ignore: Set<number>){
    const set=new Set<string>();
    for(let r=0;r<GRID.rows;r++)for(let c=0;c<GRID.cols;c++){const x=-HW+c+.5,z=-HD+r+.5;
      if(obstacles.some((o: any,i: number)=>!ignore.has(i)&&Math.abs(x-o.x)<o.w/2+.3&&Math.abs(z-o.z)<o.d/2+.3))set.add(key(c,r));}
    return set;
  }
  function cellFits(cell: Cell){const f=footprint(placing.id);return cell.c>=0&&cell.r>=0&&cell.c+f.w<=GRID.cols&&cell.r+f.d<=GRID.rows&&cellsOf(placing.id,cell).every((k: string)=>!placing.blocked.has(k));}
  function tintGhost(ok: boolean){placing.ghost.traverse((o: any)=>{if(o.isMesh&&o.material.emissive){o.material.emissive.set(ok?'#7fbf7a':'#d9705a');o.material.emissiveIntensity=.35;}});}
  function paintGrid(){for(const [k,q] of placing.quads){const chosen=placing.cell&&cellsOf(placing.id,placing.cell).includes(k),hover=placing.hover&&cellsOf(placing.id,placing.hover).includes(k);(q as any).material.color.set(chosen?'#5f9e5a':hover?(placing.hoverOk?'#d2a754':'#d9705a'):'#8a9a78');(q as any).material.opacity=chosen?.7:hover?.7:.22;}}
  function startPlacing(id: string,cell: Cell|null,taken: Set<string>){
    stopPlacing();const ignore=new Set<number>(furnitureObstacles[id]??[]);
    placing={id,cell:null,hover:null,blocked:new Set([...blockedCells(ignore),...taken]),quads:new Map(),ghost:null};
    for(let r=0;r<GRID.rows;r++)for(let c=0;c<GRID.cols;c++){if(placing.blocked.has(key(c,r)))continue;
      const q=mesh(new THREE.PlaneGeometry(.9,.9),new THREE.MeshBasicMaterial({color:'#8a9a78',transparent:true,opacity:.22,depthWrite:false}),-HW+c+.5,.095,-HD+r+.5,gridGroup);q.rotation.x=-Math.PI/2;q.castShadow=false;placing.quads.set(key(c,r),q);}
    const lines: number[]=[];for(const k of placing.quads.keys()){const [c,r]=k.split(',').map(Number),x0=-HW+c,z0=-HD+r;lines.push(x0,.1,z0,x0+1,.1,z0,x0+1,.1,z0,x0+1,.1,z0+1,x0+1,.1,z0+1,x0,.1,z0+1,x0,.1,z0+1,x0,.1,z0);}
    gridGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(lines,3)),new THREE.LineBasicMaterial({color:'#4d5b43',transparent:true,opacity:.6,depthWrite:false})));
    previewing=true;const prev=root;root=placing.ghost=new THREE.Group();scene.add(root);buildPiece(id,0,0,0);root=prev;previewing=false;
    placing.ghost.traverse((o: any)=>{if(o.isMesh){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.55;o.castShadow=false;}});
    placing.ghost.visible=false;renderer.domElement.style.cursor='crosshair';mode='place';
    if(cell&&cellFits(cell))pickCell(cell);else paintGrid();
  }
  function moveGhost(cell: Cell,at: [number,number]|null=null){placing.hover=cell;const ok=placing.hoverOk=cellFits(cell);if(placing.cell&&at){paintGrid();return ok;}const [x,z]=at??cellCentre(placing.id,cell);placing.ghost.visible=true;placing.ghost.position.set(x,0,z);placing.ghost.rotation.y=placing.id==='couch'?Math.atan2(-x,-z):0;tintGhost(ok);paintGrid();return ok;}
  function pickCell(cell: Cell){if(!cellFits(cell))return false;placing.cell={c:cell.c,r:cell.r};moveGhost(cell);onState?.({placing:{id:placing.id,cell:placing.cell}});return true;}
  function stopPlacing(){
    if(!placing)return;gridGroup.traverse((o: any)=>{if(o!==gridGroup){o.geometry?.dispose();o.material?.dispose?.();}});gridGroup.clear();scene.remove(placing.ghost);placing.ghost.traverse((o: any)=>{o.geometry?.dispose();o.material?.dispose?.();});
    placing=null;renderer.domElement.style.cursor='';restage();if(mode==='place')mode='walk';
  }
  const cellAt=(e: any)=>{const p=point(e);if(!p)return null;const f=footprint(placing.id);return {c:Math.floor(p.x+HW-(f.w-1)/2),r:Math.floor(p.z+HD-(f.d-1)/2),at:[p.x,p.z] as [number,number]};};
  // One host per public room: a barista behind the café counter, a gardener at the plant bar.
  const npc=room==='cafe'?buildAvatar(P,-7.5,-9.25,{...lookFor(0xf4e4c9,null),skin:'honey',hairColor:'black',trousers:'slate',headphones:false,bangs:'side',back:'short'},{apron:'#4d5b52'})
    :room==='garden'?buildAvatar(P,7.2,-9.3,{...lookFor(0xf4e4c9,null),skin:'caramel',hairColor:'ginger',trousers:'olive',headphones:false,bangs:'curly',back:'bob'},{apron:'#5f7f52'}):null;
  if(npc)ground(npc);
  tick('npc');
  // A small bobbing arrow above the player's head, so they stand out once the café gets busy.
  // Nearest tables to where the player starts get the first notes, so a new task is visible right away.
  taskSpots.sort((a,b)=>a.distanceTo(avatar.position)-b.distanceTo(avatar.position));
  const tickets=new Map<string, any>(),cameraYaw=Math.atan2(13,16);let hovered: any=null,lastPointer: any=null;
  function hoverTicket(g: any){// g: a note group, a hotspot mesh, or null
    if(hovered&&hovered!==g){if(hovered.userData.material)hovered.userData.material.emissiveIntensity=0;hovered=null;renderer.domElement.style.cursor='';onState?.({hover:null});}
    if(g&&hovered!==g){hovered=g;if(g.userData.material)g.userData.material.emissiveIntensity=.22;renderer.domElement.style.cursor='pointer';}
  }
  function anchor(g: any){
    const v=(g.userData.card??g).getWorldPosition(new THREE.Vector3());v.y+=g.userData.card?.34/Math.sqrt(zoom):(g.userData.hotspot.id==='timer'?.7:1.1);v.project(camera);
    const rect=renderer.domElement.getBoundingClientRect();return {task:g.userData.task,hotspot:g.userData.hotspot,x:rect.left+(v.x+1)/2*width,y:rect.top+(1-v.y)/2*height};
  }
  function ticketAt(e: any){
    const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/width*2-1,-(e.clientY-rect.top)/height*2+1);ray.setFromCamera(pointer,camera);
    const hit=ray.intersectObjects([...[...tickets.values()].map(g=>g.userData.card),...hotspots])[0];return hit?((hit.object as any).userData.note??hit.object):null;
  }
  // A task is a little chalk slate on a wooden easel, the kind cafés put on tables for the day's special.
  const TINTS=['#3a5040','#3d4a44','#3d4a44','#4a4238','#553a34'];// chalk board: kept → neglected
  function paintTicket(ctx: CanvasRenderingContext2D,task: any){
    ctx.clearRect(0,0,256,176);ctx.fillStyle=TINTS[tint(task.value??0)];ctx.fillRect(0,0,256,176);
    ctx.fillStyle='#ffffff10';for(let i=0;i<40;i++)ctx.fillRect(Math.random()*256,Math.random()*176,Math.random()*30,2);// chalk dust
    ctx.fillStyle='#f4eedd';ctx.font='500 27px "DM Sans", sans-serif';ctx.textBaseline='alphabetic';
    const words=decodeEntities(task.text).split(' '),lines=[];let line='';// wrap on three lines, then an ellipsis
    for(const w of words){const t=line?line+' '+w:w;if(ctx.measureText(t).width>216&&line){lines.push(line);line=w;}else line=t;}
    if(line)lines.push(line);if(lines.length>3){lines.length=3;lines[2]=lines[2].slice(0,14)+'…';}
    const top=88-(lines.length-1)*17;lines.forEach((l,i)=>ctx.fillText(l,20,top+i*34));
    ctx.fillStyle='#f4eedd80';ctx.fillRect(20,top+lines.length*34-18,58,2);// a little chalk underline
    if(task.kind==='habit'){ctx.fillStyle='#f4eeddb0';ctx.font='600 30px "DM Sans", sans-serif';ctx.fillText('±',214,40);}// habits carry a chalk ± in the corner
  }
  function ticket(task: any){
    const cat=task.category?({work:'#b85530',perso:'#7a8e4a',urgent:'#a04050',study:'#8aa6b8'} as Record<string,string>)[task.category]:null;
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=176;const ctx=canvas.getContext('2d') as CanvasRenderingContext2D;
    paintTicket(ctx,task);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
    const material=new THREE.MeshStandardMaterial({map:texture,roughness:1,emissive:'#fff1d6',emissiveIntensity:0});
    const g=new THREE.Group();g.rotation.y=cameraYaw;scene.add(g);
    const board=new THREE.Group();board.position.y=.31;board.rotation.x=-.22;g.add(board);
    box(.84,.58,.05,C.oak,0,0,0,.012,board);// wooden frame
    const card=mesh(new THREE.PlaneGeometry(.72,.46),material,0,0,.028,board);card.castShadow=false;card.userData.note=g;
    for(const dx of [-.16,.16]){const leg=box(.035,.34,.035,C.edge,dx,-.17,-.09,.006,g);leg.rotation.x=.42;}// easel legs
    box(.36,.045,.2,C.edge,0,.022,-.02,.01,g);// foot
    if(cat)box(.2,.07,.03,cat,-.26,.31,.02,.012,board);// category tag clipped to the frame
    if(task.kind==='daily'){const bean=mesh(new THREE.SphereGeometry(.035,10,8),mat(C.gold,{emissive:C.gold,emissiveIntensity:.5}),.3,.34,.02,board);bean.scale.set(1,.75,1);bean.castShadow=false;}
    const n=7,seeds=Float32Array.from({length:n*3},()=>Math.random());// sparkles: each one drifts up on its own loop
    const sparks=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3)),new THREE.PointsMaterial({color:'#ffbd4a',size:4,sizeAttenuation:false,transparent:true,opacity:.9,depthWrite:false}));
    g.add(sparks);
    g.userData={material,texture,canvas,ctx,card,sparks,seeds,task,phase:Math.random()*7};return g;
  }
  function setTasks(tasks: any[]){
    const keep=new Set<string>();
    for(const [id,g] of tickets)if(!tasks.some(t=>t.id===id)){scene.remove(g);g.userData.texture.dispose();g.userData.material.dispose();g.userData.sparks.material.dispose();g.traverse((o: any)=>o.geometry?.dispose());if(hovered===g)hoverTicket(null);tickets.delete(id);}
    for(const task of tasks){keep.add(task.id);
      const g=tickets.get(task.id);
      if(g){const old=g.userData.task;
        if(old.category!==task.category){scene.remove(g);g.userData.texture.dispose();g.userData.material.dispose();g.userData.sparks.material.dispose();g.traverse((o: any)=>o.geometry?.dispose());if(hovered===g)hoverTicket(null);tickets.delete(task.id);}
        else{if(old.text!==task.text||old.value!==task.value){paintTicket(g.userData.ctx,task);g.userData.texture.needsUpdate=true;}g.userData.task=task;continue;}
      }
      const created=ticket(task);tickets.set(task.id,created);
    }
    restage();
    let i=0;for(const g of tickets.values()){const n=taskSpots.length,spot=taskSpots[i%n],round=Math.floor(i/n);g.userData.base=spot.clone().add(new THREE.Vector3(round*.12,round*.34,round*.12));i++;}
  }
  // A wall clock whose single hand sweeps through the current pomodoro.
  const clock=new THREE.Group();clock.position.set(room==='private'?-4.2:-1.5,3.15,-HD+(room==='garden'?.38:.03));scene.add(clock);
  const clockBody=cyl(.56,.56,.07,C.oak,0,0,0,clock,32);clockBody.rotation.x=Math.PI/2;
  const clockFace=cyl(.49,.49,.02,mat('#fff6e4',{emissive:'#fff1d6',emissiveIntensity:.18}),0,0,.04,clock,32);clockFace.rotation.x=Math.PI/2;
  for(let i=0;i<12;i++){const a=i*Math.PI/6,tick=box(i%3?.025:.05,i%3?.06:.1,.015,C.dark,Math.sin(a)*.41,Math.cos(a)*.41,.06,0,clock);tick.rotation.z=-a;}
  const clockRing=mesh(new THREE.RingGeometry(.43,.455,48),new THREE.MeshBasicMaterial({color:C.terra,transparent:true,opacity:.9,side:THREE.DoubleSide}),0,0,.055,clock);clockRing.castShadow=false;
  const hand=new THREE.Group();hand.position.z=.07;clock.add(hand);box(.045,.4,.02,C.terra,0,.18,0,.01,hand);cyl(.05,.05,.03,C.dark,0,0,.005,hand).rotation.x=Math.PI/2;
  hotspot(clockBody,'timer','Mon pomodoro','cliquer pour régler le rythme');
  let clockTarget=0,clockRunning=false;
  function setClock(fraction: number,running: boolean){clockTarget=THREE.MathUtils.clamp(fraction,0,1);clockRunning=running;clockRing.material.opacity=running?.95:.35;}
  const cursor=mesh(new THREE.ConeGeometry(.11,.22,4),mat(C.gold,{emissive:C.gold,emissiveIntensity:.35,roughness:.5}),0,1.95,0,avatar);cursor.rotation.x=Math.PI;cursor.castShadow=false;
  const ring=mesh(new THREE.RingGeometry(.39,.43,40),new THREE.MeshBasicMaterial({color:C.white,transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false}),0,.004,0,avatar);ring.rotation.x=-Math.PI/2;
  const marker=mesh(new THREE.RingGeometry(.13,.19,32),new THREE.MeshBasicMaterial({color:'#fff5dc',transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}),0,.085,0);marker.rotation.x=-Math.PI/2;marker.castShadow=false;

  const navigation=createNavigator(obstacles,.25,{minX:-HW+.5,maxX:HW-.5,minZ:-HD+.5,maxZ:HD-.5});
  tick('navigation');
  let time=0,zoom=1,follow=true,dragging=false,dragStart: any=null,moved=false,glowing: any=null,glowTime=0;
  // Walking, sitting and limb animation shared by the player and the barista.
  function walker(p: any,speed: number,hooks: any={}){
    const w: any={route:[],pendingSeat:null,seated:null,standPoint:null,sitBlend:0,speed,
      standUp(){if(!w.seated)return;p.g.position.set(w.standPoint.x,.08,w.standPoint.z);w.seated.taken=null;w.seated=null;w.sitBlend=0;hooks.onStand?.();},
      go(target: any,seat: any=null){// seat: sit down on arrival. Returns false when there is no way there.
        if(!target||target.x<-HW-.5||target.x>HW+.5||target.z<-HD-.5||target.z>HD+.5)return false;
        const next=navigation.path(w.seated?w.standPoint:p.g.position,target);if(!next.length)return false;
        w.standUp();w.cancel();w.route=next;w.pendingSeat=seat;if(seat)seat.taken=w;w.working=false;return true;
      },
      cancel(){w.route=[];if(w.pendingSeat)w.pendingSeat.taken=null;w.pendingSeat=null;},
      step(dt: number){
        const pos=p.g.position,walking=w.route.length>0;p.g.userData.blob?.position.set(pos.x,.018,pos.z);
        if(walking){const n=w.route[0],dx=n.x-pos.x,dz=n.z-pos.z,d=Math.hypot(dx,dz),s=w.speed*dt;
          if(d<=s){pos.x=n.x;pos.z=n.z;w.route.shift();if(!w.route.length){if(w.pendingSeat){w.seated=w.pendingSeat;w.pendingSeat=null;w.standPoint={x:n.x,z:n.z};}hooks.onArrive?.(w.seated);}}
          else{pos.x+=dx/d*s;pos.z+=dz/d*s;}
          if(d>.01){const desired=Math.atan2(dx,dz),delta=Math.atan2(Math.sin(desired-p.g.rotation.y),Math.cos(desired-p.g.rotation.y));p.g.rotation.y+=delta*Math.min(1,dt*13);}
        }
        if(w.seated){// Slide onto the cushion, turn the way the seat faces and fold the legs forward.
          const seat=w.seated,from=w.standPoint;w.sitBlend=reducedMotion?1:Math.min(1,w.sitBlend+dt*3);const k=1-(1-w.sitBlend)**3;
          pos.set(from.x+(seat.x-from.x)*k,.08+(seat.y-.47-.08)*k,from.z+(seat.z-from.z)*k);
          const delta=Math.atan2(Math.sin(seat.rot-p.g.rotation.y),Math.cos(seat.rot-p.g.rotation.y));p.g.rotation.y+=delta*Math.min(1,dt*8);
          const i=reducedMotion?0:time+p.phase;// seated idle: breathe, glance around, one arm resting on the knee
          p.legL.rotation.x=p.legR.rotation.x=-Math.PI/2*k;p.armL.rotation.x=(-.5+Math.sin(i*1.3)*.08)*k;p.armR.rotation.x=(-.6+Math.sin(i*1.7+1)*.1)*k;p.body.position.y=Math.sin(i*2)*.008*k;
          p.head.rotation.y=Math.sin(i*.5)*.35*k;p.head.rotation.x=(Math.sin(i*.8)*.06+.05)*k;
        } else if(walking){
          const t=(time+p.phase)*13,stride=reducedMotion?0:Math.sin(t)*.45;p.legL.rotation.x=stride;p.legR.rotation.x=-stride;p.armL.rotation.x=-stride*.65;p.armR.rotation.x=stride*.65;p.body.position.y=reducedMotion?0:Math.abs(Math.sin(t))*.045;
          p.head.rotation.set(0,0,0);
        } else {
          const i=reducedMotion?0:time+p.phase;p.legL.rotation.x=p.legR.rotation.x=0;p.body.position.y=Math.sin(i*2)*.01;
          if(w.working){// busy behind the counter: face it and keep the hands moving
            const delta=Math.atan2(Math.sin(-p.g.rotation.y),Math.cos(-p.g.rotation.y));p.g.rotation.y+=delta*Math.min(1,dt*6);
            p.armL.rotation.x=-1.1+Math.sin(i*5)*.3;p.armR.rotation.x=-1.1-Math.sin(i*5)*.3;p.head.rotation.x=.22;p.head.rotation.y=Math.sin(i*.9)*.15;
          } else {// standing idle: breathe, sway the arms a little, look around now and then
            p.armL.rotation.x=Math.sin(i*1.4)*.06;p.armR.rotation.x=Math.sin(i*1.4+1)*.06;
            p.head.rotation.y=Math.sin(i*.45)*.4;p.head.rotation.x=Math.sin(i*.7)*.05;
          }
        }
      }};
    return w;
  }
  const me=walker(player,2.4,{onArrive(seat: any){glow(null);onState?.({walking:false});if(seat)onState?.({seated:true});},onStand(){onState?.({seated:false});}});
  let energy=50,exhausted=false,nextYawn=0,yawnUntil=0,idleSince=0;
  const BASE_SPEED=2.4;
  const nearestFreeSeat=()=>{const p=player.g.position;return seats.filter(s=>!s.taken).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0]??null;};
  function setEnergy(e: number,ex: boolean){energy=e;exhausted=ex;me.speed=exhausted||energy<10?BASE_SPEED*.7:BASE_SPEED;
    // Materials are pooled by colour (primitives.ts `mat()`) and shared with the barista and every remote player,
    // so the player's rig needs its own clone before it can be greyed — mutating the pooled material would greige the whole room.
    const grey=exhausted?.55:1;
    player.g.traverse((o: any)=>{
      const m=o.material;if(!m?.color)return;
      if(m!==o.userData.ownMaterial){o.userData.ownMaterial?.dispose();o.userData.sharedColor=m.color.clone();o.material=m.clone();o.userData.ownMaterial=o.material;}
      o.material.color.copy(o.userData.sharedColor).multiplyScalar(grey).lerp(new THREE.Color('#9a9a94'),exhausted?.35:0);
    });
    if(exhausted&&!me.seated){const seat=nearestFreeSeat();if(seat)moveTo(seat,seat);}}
  // The host wanders between its work spots, free seats and random spots, pausing in between.
  const bar: any=npc&&walker(npc,1.9,{onArrive(){bar.working=bar.atWork;bar.wait=bar.seated?8+Math.random()*12:bar.working?6+Math.random()*10:1+Math.random()*4;}});if(bar)bar.wait=2;
  const workSpots=room==='garden'?[{x:6.0,z:-9.2},{x:8.4,z:-9.2},{x:.5,z:-9.2},{x:-10.9,z:-3.2}]:[{x:-7.5,z:-9.25},{x:-4.5,z:-9.25},{x:-2.5,z:-9.25}];
  function npcThink(dt: number){
    if(!bar)return;bar.wait-=dt;if(bar.route.length||bar.wait>0)return;
    const roll=Math.random();
    bar.atWork=false;
    if(roll<.35){const spot=workSpots[Math.floor(Math.random()*workSpots.length)];if(bar.go(spot)){bar.atWork=true;return;}}
    if(roll<.6){const free=seats.filter(s=>!s.taken);const seat=free[Math.floor(Math.random()*free.length)];if(seat&&bar.go(seat,seat))return;}
    for(let i=0;i<6;i++)if(bar.go({x:(Math.random()-.5)*(W-2),z:(Math.random()-.5)*(D-2)}))return;
    bar.wait=1;
  }
  // Remote players: one person + walker each, driven by the cells the server sends.
  const cellCentreOf=(col: number,row: number)=>({x:-HW+col+.5,z:-HD+row+.5});
  const seatNear=(p: {x: number;z: number})=>seats.find(s=>!s.taken&&Math.hypot(s.x-p.x,s.z-p.z)<.75)??null;
  interface Remote{p: Rig;w: ReturnType<typeof walker>;tag: THREE.Sprite;bubble: THREE.Sprite|null;todo: THREE.Sprite|null;wander:boolean;wait:number}
  const remotes=new Map<string, Remote>();
  function addRemote(id: string,info: RemoteInfo){
    removeRemote(id);const at=cellCentreOf(info.col,info.row);
    const p=ground(buildAvatar(P,at.x,at.z,info.look??lookFor(info.color,info.hat))),w=walker(p,2.4);
    const tag=nameTag(info.name,info.color);p.g.add(tag);
    // Local decorative NPCs (a Twitch crowd) wander on their own; real players are driven by moveRemote instead — never both.
    const r: Remote={p,w,tag,bubble:null,todo:null,wander:!!info.wander,wait:1+Math.random()*3};remotes.set(id,r);restage();
    setRemoteState(id,info.state);
    const seat=seatNear(at);if(seat)w.go(seat,seat);
  }
  // Same wander/rest/sit rhythm as the café host, just without its counter-work spots.
  function remoteThink(dt: number){
    for(const r of remotes.values()){
      if(!r.wander)continue;
      r.wait-=dt;if(r.w.route.length||r.wait>0)continue;
      if(Math.random()<.4){const free=seats.filter(s=>!s.taken);const seat=free[Math.floor(Math.random()*free.length)];
        if(seat&&r.w.go(seat,seat)){r.wait=8+Math.random()*12;continue;}}
      let moved=false;
      for(let i=0;i<6;i++)if(r.w.go({x:(Math.random()-.5)*(W-2),z:(Math.random()-.5)*(D-2)})){moved=true;break;}
      r.wait=moved?1+Math.random()*4:1;
    }
  }
  function moveRemote(id: string,col: number,row: number){const r=remotes.get(id);if(!r)return;const at=cellCentreOf(col,row),seat=seatNear(at);r.w.go(seat??at,seat);}
  function setRemoteState(id: string,state: RemoteInfo['state']){
    const r=remotes.get(id);if(!r)return;
    if(r.bubble){dropSprite(r.bubble);r.bubble=null;}
    if(state==='focus'||state==='pause'||state==='collective'){r.bubble=stateBubble(state==='pause'?'pause':'focus');r.p.g.add(r.bubble);}
  }
  function setRemoteHat(id: string,hat: string|null){const r=remotes.get(id);if(!r)return;applyLook(P,r.p,{...r.p.look,hat});ground(r.p);}
  function setRemoteLook(id: string,look: Look){const r=remotes.get(id);if(!r)return;applyLook(P,r.p,look);ground(r.p);}
  function removeRemote(id: string){
    const r=remotes.get(id);if(!r)return;
    r.w.standUp();r.w.cancel();r.p.g.removeFromParent();r.p.g.userData.blob?.removeFromParent();
    r.p.g.traverse((o: any)=>{o.geometry?.dispose?.();});
    dropSprite(r.tag);if(r.bubble)dropSprite(r.bubble);if(r.todo)dropSprite(r.todo);dropBubbles(id);dropFloats(id);
    remotes.delete(id);restage();
  }
  function clearRemotes(){for(const id of [...remotes.keys()])removeRemote(id);}
  // Chat bubbles and emotes: camera-facing sprites in their own slots, so a message never replaces the focus/pause bubble.
  // Bubbles keep a fixed size on screen (12px text) whatever the zoom: their world scale is recomputed every frame from pixels-per-unit.
  interface Bubble{s: THREE.Sprite;until: number;float: boolean;bottom: number;px: {w: number;h: number}}
  const bubbles=new Map<string, Bubble>();// key `${id}:chat` / `${id}:emote`, id '' being the player
  const BUBBLE_TEXT_PX=16;
  function sprite(c: HTMLCanvasElement,sx: number,sy: number,x: number,y: number,pxW: number,pxH: number){
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    // No mip chain: these are kept at a fixed, small on-screen size on purpose (see the per-frame
    // rescale in animate()), so there's never a reason to minify — and picking a mip level here is
    // exactly what turned text grey and mangled once the adaptive renderer resolution dropped.
    tex.generateMipmaps=false;tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false}));
    s.scale.set(sx,sy,1);s.position.set(x,y,0);s.raycast=()=>{};s.userData.px={w:pxW,h:pxH};return s;// never in the way of a click on the room
  }
  function chatBubble(name: string,color: number,text: string,y: number){
    const t=text.length>60?text.slice(0,59)+'…':text;
    const c=document.createElement('canvas'),ctx=c.getContext('2d')!;
    const REG='500 34px "DM Sans", Manrope, sans-serif',BOLD='700 34px "DM Sans", Manrope, sans-serif',PAD=12;
    // tokens: the speaker's name on a pill in their colour, then the words; wrapped over two lines at most
    const tokens=[{s:name,b:true},...t.split(/\s+/).map(s=>({s,b:false}))];
    const width=(tok: {s: string;b: boolean})=>{ctx.font=tok.b?BOLD:REG;return ctx.measureText(tok.s).width+(tok.b?PAD*2:0);};
    const space=(()=>{ctx.font=REG;return ctx.measureText(' ').width;})();
    const lines: {s: string;b: boolean}[][]=[[]];let lw=0;
    for(const tok of tokens){const w=width(tok),add=lines.at(-1)!.length?space+w:w;
      if(lines.at(-1)!.length&&lw+add>440){if(lines.length===2)break;lines.push([tok]);lw=w;}else{lines.at(-1)!.push(tok);lw+=add;}}
    const lineW=(l: {s: string;b: boolean}[])=>l.reduce((a,tok,i)=>a+width(tok)+(i?space:0),0);
    const w=Math.min(500,Math.max(...lines.map(lineW))+40),pillH=lines.length>1?100:62;
    // Canvas fits the pill snugly (a few px of edge margin only) so stacked bubbles don't inherit a fat transparent band.
    const cw=512,ch=pillH+10;c.width=cw;c.height=ch;
    ctx.fillStyle='#fffdf6f2';ctx.beginPath();ctx.roundRect((cw-w)/2,(ch-pillH)/2,w,pillH,20);ctx.fill();
    ctx.textAlign='left';ctx.textBaseline='middle';
    lines.forEach((l,i)=>{let x=cw/2-lineW(l)/2;const yy=ch/2+(i-(lines.length-1)/2)*40;for(const tok of l){const tw=width(tok);ctx.font=tok.b?BOLD:REG;
      if(tok.b){ctx.fillStyle=hexOf(color);ctx.beginPath();ctx.roundRect(x,yy-21,tw,42,12);ctx.fill();ctx.fillStyle='#fff';ctx.fillText(tok.s,x+PAD,yy+1);}
      else{ctx.fillStyle='#000';ctx.fillText(tok.s,x,yy);}
      x+=tw+space;}});
    const k=BUBBLE_TEXT_PX/34;return sprite(c,cw*k/128,ch*k/128,0,y,cw*k,ch*k);// 34px font on the canvas → BUBBLE_TEXT_PX on screen
  }
  function emoteBubble(emoji: string,y: number){
    const c=document.createElement('canvas'),ctx=c.getContext('2d')!;c.width=128;c.height=128;
    ctx.font='88px serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(emoji,64,72);
    return sprite(c,.7,.7,0,y,72,72);// centred right above the head
  }
  function showBubble(key: string,group: THREE.Object3D,s: THREE.Sprite,life: number,float: boolean){
    const old=bubbles.get(key);if(old)dropSprite(old.s);
    group.add(s);bubbles.set(key,{s,until:time+life,float,bottom:s.position.y-s.scale.y/2,px:s.userData.px});
  }
  const pixelsPerUnit=()=>height*camera.zoom/(camera.top-camera.bottom);
  // `lift` stacks an emote above a chat bubble of the same avatar instead of overlapping it.
  function fitBubble(b: Bubble,lift=0){const ppu=pixelsPerUnit(),w=b.px.w/ppu,h=b.px.h/ppu;b.s.scale.set(w,h,1);b.s.position.y=Math.max(b.bottom,lift)+h/2+(b.float&&!reducedMotion?Math.sin(time*3)*.15:0);return b.s.position.y+h/2;}
  function dropBubbles(id: string){const key=`${id}:emote`,b=bubbles.get(key);if(b){dropSprite(b.s);bubbles.delete(key);}dropChatStack(id);}
  // Chat messages queue instead of replacing one another: several in a row each get their own bubble, newest closest to
  // the head and older ones pushed up above it, each fading on its own 5s-then-1s-fade clock regardless of the others.
  interface ChatEntry{s: THREE.Sprite;until: number;px: {w: number;h: number}}
  const chatStacks=new Map<string, {anchorY: number;items: ChatEntry[]}>();// key: id, '' for the player
  const CHAT_LIFE=5,CHAT_FADE=1,CHAT_GAP=.04;
  function pushChat(key: string,group: THREE.Object3D,anchorY: number,build: (y: number)=>THREE.Sprite){
    let stack=chatStacks.get(key);if(!stack){stack={anchorY,items:[]};chatStacks.set(key,stack);}
    const s=build(anchorY);group.add(s);stack.items.push({s,until:time+CHAT_LIFE,px:s.userData.px});
  }
  function dropChatStack(id: string){const stack=chatStacks.get(id);if(!stack)return;for(const b of stack.items)dropSprite(b.s);chatStacks.delete(id);}
  function say(id: string,name: string,color: number,text: string){const r=remotes.get(id);if(r)pushChat(id,r.p.g,2.6,y=>chatBubble(name,color,text,y));}
  function sayMe(name: string,color: number,text: string){pushChat('',avatar,2.5,y=>chatBubble(name,color,text,y));}
  function emote(id: string,emoji: string){const r=remotes.get(id);if(r)showBubble(`${id}:emote`,r.p.g,emoteBubble(emoji,2.5),3,true);}
  function emoteMe(emoji: string){showBubble(':emote',avatar,emoteBubble(emoji,2.5),3,true);}
  // Public feedback above an avatar: a word that rises and fades (+10, a level, a badge), and a small "n à faire" pill under a remote's name tag.
  interface Float{id: string;s: THREE.Sprite;born: number;base: number;px: {w: number;h: number}}
  const floats: Float[]=[],FLOAT_LIFE=1.6,FLOAT_RISE=.6;
  function floatSprite(text: string,color: string){
    const c=document.createElement('canvas'),ctx=c.getContext('2d')!;c.width=512;c.height=96;
    ctx.font='700 34px Manrope, "DM Sans", sans-serif';
    const w=Math.min(500,ctx.measureText(text).width+40),h=56;
    ctx.fillStyle='#fffdf6f2';ctx.beginPath();ctx.roundRect((512-w)/2,(96-h)/2,w,h,18);ctx.fill();
    ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,49,w-30);
    const k=BUBBLE_TEXT_PX/34;return sprite(c,2,.5,0,0,512*k,96*k);// 34px on the canvas → 16px on screen, whatever the zoom
  }
  function float(id: string,text: string,color='#c9764f'){
    const group=id?remotes.get(id)?.p.g:avatar;if(!group)return;// a float for someone who just left is simply dropped
    const s=floatSprite(text,color);group.add(s);
    // above the chat slot, so neither bubble is covered; a second float at the same instant sits on top of the first
    floats.push({id,s,born:time,base:(id?2.6:2.5)+.3+.42*floats.filter(f=>f.id===id).length,px:s.userData.px});
  }
  function dropFloats(id: string){for(let i=floats.length-1;i>=0;i--)if(floats[i].id===id){dropSprite(floats[i].s);floats.splice(i,1);}}
  function todoSprite(n: number){
    const c=document.createElement('canvas'),ctx=c.getContext('2d')!;c.width=256;c.height=64;
    const label=`${n} à faire`;ctx.font='600 26px Manrope, "DM Sans", sans-serif';
    const w=Math.min(244,ctx.measureText(label).width+28),h=40;
    ctx.fillStyle='#e8eedf';ctx.beginPath();ctx.roundRect((256-w)/2,12,w,h,20);ctx.fill();
    ctx.fillStyle='#647557';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,128,33,w-20);
    const k=12/26;return sprite(c,1,.25,0,1.9,256*k,64*k);// 12px on screen, just under the name tag
  }
  function setTodo(id: string,n: number){
    const r=remotes.get(id);if(!r)return;// never for the player: their own drawer already lists it
    if(r.todo){dropSprite(r.todo);r.todo=null;}
    if(n>0){r.todo=todoSprite(n);r.p.g.add(r.todo);}
  }
  // Both keep a fixed size on screen, so their world scale is recomputed every frame like the bubbles'.
  function fitFeedback(){
    const ppu=pixelsPerUnit();
    for(let i=floats.length-1;i>=0;i--){
      const f=floats[i],t=(time-f.born)/FLOAT_LIFE;
      if(t>=1){dropSprite(f.s);floats.splice(i,1);continue;}
      const h=f.px.h/ppu;f.s.scale.set(f.px.w/ppu,h,1);f.s.position.y=f.base+h/2+t*FLOAT_RISE;
      (f.s.material as THREE.SpriteMaterial).opacity=t<.5?1:2-2*t;
    }
    for(const r of remotes.values()){if(!r.todo)continue;const h=r.todo.userData.px.h/ppu;
      r.todo.scale.set(r.todo.userData.px.w/ppu,h,1);r.todo.position.y=1.95-h/2;}
  }
  let lastCell='',lastArrived=false,cellListener: ((col: number,row: number,arrived: boolean)=>void)|null=null;
  // Slow pulse on the selected seat. Materials are shared per colour, so each mesh gets a private clone while it glows.
  function glow(object: any){
    glowing?.traverse((o: any)=>{if(o.userData.mat){o.material.dispose();o.material=o.userData.mat;delete o.userData.mat;}});
    glowing=object;glowTime=0;
    object?.traverse((o: any)=>{if(o.isMesh){o.userData.mat=o.material;o.material=o.material.clone();o.material.emissive.set('#ffd595');}});
  }
  const camTarget=new THREE.Vector3(0,.85,0),pan=new THREE.Vector3(),cameraOffset=new THREE.Vector3(13,12.5,16);
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),floor=new THREE.Plane(new THREE.Vector3(0,1,0),-.08);
  let width=1,height=1;
  // --- Editor mode: the camera dives onto the avatar, the room behind it goes soft. ---
  const camRight=new THREE.Vector3(cameraOffset.z,0,-cameraOffset.x).normalize(),EDIT_H=3.0;
  let editAnim: null|{t:number;z0:number;z1:number;p0:THREE.Vector3;p1:THREE.Vector3}=null;
  let savedView: null|{zoom:number;follow:boolean;pan:THREE.Vector3;target:THREE.Vector3}=null;
  let editYaw=0,studio: THREE.SpotLight|null=null;
  const editZoom=()=>2*camera.top/EDIT_H;// the framing is a fixed world height, so it survives a resize
  const editTarget=()=>avatar.position.clone().setY(.95).add(camRight.clone().multiplyScalar(.28*EDIT_H*width/height));
  const hideWhileEditing=()=>[cursor,ring,marker];
  const spring=(t: number)=>1-Math.pow(1-t,4);// strong ease-out: settles smoothly, never overshoots
  function enterEditor(){
    if(mode==='edit')return;if(mode==='place')stopPlacing();mode='edit';
    savedView={zoom,follow,pan:pan.clone(),target:camTarget.clone()};me.cancel();me.standUp();hoverTicket(null);dragging=false;
    avatar.traverse((o: any)=>{if(o.isMesh)o.castShadow=true;});
    editYaw=cameraYaw;
    editAnim={t:0,z0:camera.zoom,z1:editZoom(),p0:camTarget.clone(),p1:editTarget()};
    dropBubbles('');dropFloats('');// a live chat, emote or float sprite would inherit the avatar layer and float in the sharp pass
    avatar.traverse((o: any)=>o.layers.enable(AVATAR_LAYER));for(const o of hideWhileEditing())o.visible=false;
    studio=new THREE.SpotLight('#fff3d8',26,9,.5,.6,1.4);studio.position.copy(avatar.position).add(new THREE.Vector3(2.2,4.2,2.6));studio.target=avatar;studio.layers.enable(AVATAR_LAYER);scene.add(studio);restage();
    onState?.({editing:true});
  }
  function exitEditor(){
    if(mode!=='edit'||!savedView)return;
    avatar.traverse((o: any)=>o.layers.disable(AVATAR_LAYER));for(const o of hideWhileEditing())o.visible=true;
    if(studio){scene.remove(studio);studio.dispose();studio=null;}ground(player);restage();
    editAnim={t:0,z0:camera.zoom,z1:savedView.zoom,p0:camTarget.clone(),p1:savedView.target.clone()};
    zoom=savedView.zoom;follow=savedView.follow;pan.copy(savedView.pan);savedView=null;mode='walk';dragging=false;
    onState?.({editing:false,zoom,follow});
  }
  function resetView(){editYaw=cameraYaw;}
  // Backdrop blur: two separable 5-tap gaussians at half resolution. No colour grading — the room only goes soft, never darker.
  // Off-screen passes render linear and untone-mapped (three forces that for a render target), so the last one tone maps and encodes exactly as the direct pass would.
  const rt=()=>new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:true});
  const blur={rtA:rt(),rtB:rt(),cam:new THREE.OrthographicCamera(-1,1,1,-1,0,1),scene:new THREE.Scene(),quad:null as any,mat:null as any};
  blur.mat=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,transparent:true,premultipliedAlpha:true,uniforms:{tex:{value:null},dir:{value:new THREE.Vector2()},finish:{value:0},exposure:{value:renderer.toneMappingExposure}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`uniform sampler2D tex;uniform vec2 dir;uniform float finish,exposure;varying vec2 vUv;
      const mat3 ACES_IN=mat3(vec3(.59719,.07600,.02840),vec3(.35458,.90834,.13383),vec3(.04823,.01566,.83777));
      const mat3 ACES_OUT=mat3(vec3(1.60475,-.10208,-.00327),vec3(-.53108,1.10813,-.07276),vec3(-.07367,-.00605,1.07602));
      vec3 fit(vec3 v){vec3 a=v*(v+.0245786)-.000090537,b=v*(.983729*v+.432951)+.238081;return a/b;}
      void main(){vec4 c=texture2D(tex,vUv)*.227;
        c+=(texture2D(tex,vUv+dir*1.385)+texture2D(tex,vUv-dir*1.385))*.316;
        c+=(texture2D(tex,vUv+dir*3.231)+texture2D(tex,vUv-dir*3.231))*.070;
        if(finish<.5){gl_FragColor=c;return;}
        vec3 t=c.a>.001?c.rgb/c.a:c.rgb;
        t=clamp(ACES_OUT*fit(ACES_IN*(t*exposure/.6)),0.,1.);
        t=mix(pow(t,vec3(.41666))*1.055-vec3(.055),t*12.92,vec3(lessThanEqual(t,vec3(.0031308))));
        gl_FragColor=vec4(t*c.a,c.a);}`});
  blur.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),blur.mat);blur.quad.frustumCulled=false;blur.scene.add(blur.quad);
  function blurSize(){
    const r=renderer.getPixelRatio(),s=r>1.5?.4:.5,w=Math.max(1,Math.round(width*r*s)),h=Math.max(1,Math.round(height*r*s));
    if(blur.rtA.width!==w||blur.rtA.height!==h){blur.rtA.setSize(w,h);blur.rtB.setSize(w,h);}
    return {w,h};
  }
  function drawEditing(){
    const {w,h}=blurSize();
    camera.layers.enableAll();renderer.setRenderTarget(blur.rtA);renderer.clear();renderer.render(scene,camera);
    for(let i=0;i<2;i++){
      blur.mat.uniforms.tex.value=blur.rtA.texture;blur.mat.uniforms.dir.value.set(2.2/w,0);renderer.setRenderTarget(blur.rtB);renderer.render(blur.scene,blur.cam);
      blur.mat.uniforms.tex.value=blur.rtB.texture;blur.mat.uniforms.dir.value.set(0,2.2/h);renderer.setRenderTarget(blur.rtA);renderer.render(blur.scene,blur.cam);
    }
    renderer.setRenderTarget(null);renderer.clear();blur.mat.uniforms.tex.value=blur.rtA.texture;blur.mat.uniforms.dir.value.set(0,0);blur.mat.uniforms.finish.value=1;renderer.render(blur.scene,blur.cam);blur.mat.uniforms.finish.value=0;
    renderer.clearDepth();camera.layers.set(AVATAR_LAYER);renderer.autoClear=false;renderer.render(scene,camera);// the backdrop pass above already consumed any pending update, so the sharp pass never triggers one
    renderer.autoClear=true;camera.layers.enableAll();
  }
  function resize(){width=container.clientWidth;height=container.clientHeight;renderer.setSize(width,height);const aspect=width/height,span=Math.max(HW*1.067,HW*1.417/aspect);camera.left=-span*aspect;camera.right=span*aspect;camera.top=span;camera.bottom=-span;camera.updateProjectionMatrix();
    if(mode==='edit'){// the editor frames a fixed world height, so a resize re-derives the zoom rather than keeping it
      if(editAnim){editAnim.z1=editZoom();editAnim.p1=editTarget();}
      else{camera.zoom=editZoom();camera.updateProjectionMatrix();camTarget.copy(editTarget());}
    }
    blurSize();
  }
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  renderer.compile(blur.scene,blur.cam);// compile the blur shader while the room mounts, so opening the editor does not hitch
  tick('compile');
  // The editor owns the camera; the view buttons must not fight editAnim. setZoom covers zoomIn, zoomOut and the wheel.
  function setZoom(value: number){if(mode==='edit')return;zoom=THREE.MathUtils.clamp(value,.72,4);camera.zoom=zoom;camera.updateProjectionMatrix();onState?.({zoom,follow});}
  function recenter(){if(mode==='edit')return;follow=true;pan.set(0,0,0);setZoom(1);onState?.({zoom,follow});}
  function setFollow(){if(mode==='edit')return;follow=!follow;if(follow)pan.set(0,0,0);onState?.({zoom,follow});}
  function point(e: any){const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/width*2-1,-(e.clientY-rect.top)/height*2+1);ray.setFromCamera(pointer,camera);const out=new THREE.Vector3();return ray.ray.intersectPlane(floor,out)?out:null;}
  function moveTo(target: any,seat: any=null){
    if(!me.go(target,seat))return;glow(null);
    if(seat){marker.material.opacity=0;glow(seat.object);}else{const end=me.route.at(-1);marker.position.set(end.x,.085,end.z);marker.material.opacity=.9;}
    onState?.({walking:true});
  }
  renderer.domElement.addEventListener('pointerdown',(e: PointerEvent)=>{if(e.button>1)return;dragStart={x:e.clientX,y:e.clientY,pan:pan.clone()};dragging=true;moved=false;try{renderer.domElement.setPointerCapture(e.pointerId);}catch{}});
  renderer.domElement.addEventListener('pointermove',(e: PointerEvent)=>{
    lastPointer={clientX:e.clientX,clientY:e.clientY};if(mode==='place'&&!dragging){const cell=cellAt(e);if(cell)moveGhost(cell,cell.at);return;}if(!dragging)return;const dx=e.clientX-dragStart.x,dy=e.clientY-dragStart.y;
    if(Math.hypot(dx,dy)>5)moved=true;
    if(mode==='edit'){editYaw-=dx*.012;dragStart.x=e.clientX;dragStart.y=e.clientY;return;}// dragging turns the avatar instead of the view
    if(moved){if(follow){pan.copy(camTarget).sub(new THREE.Vector3(0,.85,0));dragStart.pan.copy(pan);follow=false;onState?.({zoom,follow});}
      const factor=(camera.top-camera.bottom)/height/zoom;
      pan.copy(dragStart.pan).add(new THREE.Vector3(-.776*dx-.84*dy,0,.631*dx-1.03*dy).multiplyScalar(factor));
      pan.x=THREE.MathUtils.clamp(pan.x,-HW,HW);pan.z=THREE.MathUtils.clamp(pan.z,-HD,HD);
    }
  });
  function seatAt(): any{const hit=ray.intersectObjects(seats.map(s=>s.object),true)[0];if(!hit)return null;const near=seats.filter(s=>s.object===hit.object.parent||s.object===hit.object);return near.sort((a,b)=>Math.hypot(a.x-hit.point.x,a.z-hit.point.z)-Math.hypot(b.x-hit.point.x,b.z-hit.point.z))[0]||null;}
  renderer.domElement.addEventListener('pointerup',(e: PointerEvent)=>{
    if(mode==='edit'){dragging=false;return;}
    if(mode==='place'){if(!moved&&e.button===0){const cell=cellAt(e);if(cell&&!pickCell(cell))onState?.({placing:{id:placing.id,cell:null,refused:true}});}dragging=false;return;}
    if(dragging&&!moved&&e.button===0){const picked=ticketAt(e);if(picked){onState?.(picked.userData.hotspot?{hotspot:picked.userData.hotspot.id}:{focusTask:picked.userData.task.id});dragging=false;return;}const p=point(e),target=seatAt();if(target&&target!==me.seated){if(target.taken&&target.taken!==me){target.taken.standUp();target.taken.cancel();target.taken.wait=0;restage();}moveTo(target,target);}else if(!target)moveTo(p);}
    dragging=false;
  });
  renderer.domElement.addEventListener('pointercancel',()=>{dragging=false;});
  renderer.domElement.addEventListener('pointerleave',()=>{lastPointer=null;hoverTicket(null);});
  renderer.domElement.addEventListener('wheel',(e: WheelEvent)=>{e.preventDefault();setZoom(zoom*Math.exp(-e.deltaY*.001));},{passive:false});
  renderer.domElement.addEventListener('keydown',(e: KeyboardEvent)=>{
    const moves: Record<string, [number,number]>={ArrowUp:[0,-.75],ArrowDown:[0,.75],ArrowLeft:[-.75,0],ArrowRight:[.75,0]};
    if(moves[e.key]&&mode==='walk'){e.preventDefault();const [x,z]=moves[e.key];moveTo({x:avatar.position.x+x,z:avatar.position.z+z});}
  });
  let evening=false;
  const day=[...pendants,...windows].map(l=>l.intensity);// the lamps' own daylight values, captured once so toggling back is exact
  function toggleLight(){
    evening=!evening;const n=pendants.length,L=LIGHT[room][evening?'evening':'day'];
    pendants.forEach((l,i)=>l.intensity=day[i]*L.lamps);
    windows.forEach((l,i)=>l.intensity=evening?0:day[n+i]);
    sun.color.set(L.sun[0]);sun.intensity=L.sun[1];fill.intensity=L.fill;
    hemi.color.set(L.hemi[0]);hemi.groundColor.set(L.hemi[1]);hemi.intensity=L.hemi[2];
    dusk?.(evening);restage();
    return evening;
  }
  function simulate(dt: number){
    me.step(dt);npcThink(dt);bar?.step(dt);remoteThink(dt);
    // Yawning is pure flourish and respects reducedMotion; walking to a seat is the actual spec'd behaviour and must not be gated by it.
    if(energy<25&&!me.seated&&!me.route.length){
      if(!idleSince)idleSince=time;
      if(!reducedMotion){
        if(time>nextYawn){yawnUntil=time+.6;nextYawn=time+20+Math.random()*20;}
        if(time<yawnUntil){const k=Math.sin((yawnUntil-time)/.6*Math.PI);player.head.rotation.x=-.35*k;player.armR.rotation.x=-2.2*k;}
      }
      if(energy<10&&time-idleSince>8){const seat=nearestFreeSeat();if(seat){moveTo(seat,seat);idleSince=0;}}
    }else idleSince=0;
    for(const r of remotes.values())r.w.step(dt);
  }
  function setRatio(value: number){pixelRatio=value;renderer.setPixelRatio(value);resize();restage();}
  // Adaptive resolution: a smoothed frame time steps the ratio down when the GPU is drowning and back up when it is bored. The editor keeps its sharp avatar pass, so it never adapts.
  let frameMs=1000/60,slow=0,fast=0;
  function adapt(dt: number){
    frameMs+=(dt*1000-frameMs)*.1;
    if(mode==='edit'){slow=fast=0;return;}
    if(frameMs>14){slow+=dt;fast=0;}else if(frameMs<9){fast+=dt;slow=0;}else slow=fast=0;
    if(slow>2&&pixelRatio>.75){setRatio(Math.max(.75,pixelRatio-.25));slow=0;}
    else if(fast>5&&pixelRatio<BASE_PR){setRatio(Math.min(BASE_PR,pixelRatio+.25));fast=0;}
  }
  let previous=performance.now(),raf: number;
  function animate(now: number){
    if(!firstFrame){firstFrame=true;tick('first-frame');if(import.meta.env.DEV){const t=performance.getEntriesByType('mark').filter(m=>m.name.startsWith('cafe:'));console.table(Object.fromEntries(t.map((m,i)=>[m.name.slice(5),Math.round(m.startTime-(i?t[i-1].startTime:0))+' ms'])));}}
    const dt=Math.min((now-previous)/1000,.05);previous=now;time+=dt;adapt(dt);
    simulate(dt);
    {const col=Math.min(W-1,Math.max(0,Math.floor(avatar.position.x+HW))),row=Math.min(D-1,Math.max(0,Math.floor(avatar.position.z+HD))),k=`${col},${row}`,arrived=me.route.length===0&&!me.pendingSeat;
      if(k!==lastCell||(arrived&&lastArrived!==arrived)){lastCell=k;cellListener?.(col,row,arrived);}lastArrived=arrived;}
    if(!reducedMotion)steam.forEach(({puff,baseY,phase,x,z,drift})=>{const p=(time*.32+phase)%1;puff.position.set(x+Math.sin(p*4+drift)*.06*p,baseY+p*.7,z+Math.cos(p*3+drift)*.04*p);puff.scale.set(.6+p*1.1,1.4+p*1.2,.6+p*1.1);puff.material.opacity=Math.sin(p*Math.PI)*.42;});
    marker.material.opacity=Math.max(0,marker.material.opacity-dt*.22);
    for(const [k,b] of bubbles){if(k.endsWith(':emote')&&time>b.until){dropSprite(b.s);bubbles.delete(k);}}
    const tops=new Map<string, number>();// chat bubbles first, so emotes can sit on top of the stack
    const ppu=pixelsPerUnit();
    for(const r of remotes.values()){const p=r.tag.userData.px;r.tag.scale.set(p.w/ppu,p.h/ppu,1);}
    for(const [id,stack] of chatStacks){
      for(let i=stack.items.length-1;i>=0;i--)if(time>stack.items[i].until+CHAT_FADE){dropSprite(stack.items[i].s);stack.items.splice(i,1);}
      if(!stack.items.length){chatStacks.delete(id);continue;}
      let y=stack.anchorY;
      for(let i=stack.items.length-1;i>=0;i--){// newest (pushed last) sits at the anchor; older ones stack above it
        const b=stack.items[i],h=b.px.h/ppu,w=b.px.w/ppu,sp=b.s as THREE.Sprite;
        sp.scale.set(w,h,1);sp.position.y=y+h/2;
        (sp.material as THREE.SpriteMaterial).opacity=time<=b.until?1:Math.max(0,1-(time-b.until)/CHAT_FADE);
        y+=h+CHAT_GAP;
      }
      tops.set(id,y+.05);
    }
    for(const [k,b] of bubbles)if(k.endsWith(':emote'))fitBubble(b,tops.get(k.slice(0,-6))??0);
    fitFeedback();
    for(const g of tickets.values()){const b=g.userData.base;g.position.set(b.x,b.y+(reducedMotion?.06:.06+Math.sin(time*1.4+g.userData.phase)*.03),b.z);g.rotation.y=cameraYaw+(reducedMotion?0:Math.sin(time*.8+g.userData.phase)*.08);g.scale.setScalar((g===hovered?1.35:1.2)/Math.sqrt(zoom));
      const {sparks,seeds}=g.userData,pos=sparks.geometry.attributes.position;sparks.material.size=4.5*Math.sqrt(zoom)*Math.min(devicePixelRatio,1.5);
      for(let k=0;k<pos.count;k++){const life=reducedMotion?seeds[k*3+2]:(time*.35+seeds[k*3+2])%1,a=seeds[k*3]*6.28+life*2;pos.setXYZ(k,Math.cos(a)*(.34+seeds[k*3+1]*.2),.05+life*.75,Math.sin(a)*(.28+seeds[k*3+1]*.2));}
      pos.needsUpdate=true;sparks.material.opacity=.65+.35*Math.sin(time*2+g.userData.phase);}
    if(!dragging&&mode==='walk')hoverTicket(lastPointer?ticketAt(lastPointer):null);
    if(hovered)onState?.({hover:anchor(hovered)});
    hand.rotation.z+=(-clockTarget*Math.PI*2-hand.rotation.z)*Math.min(1,dt*4);clockRing.scale.setScalar(clockRunning&&!reducedMotion?1+Math.sin(time*2)*.015:1);
    if(player.parts.hat?.userData.float)player.parts.hat.position.y=(reducedMotion?0:Math.sin(time*2.2)*.03);
    cursor.position.y=1.95+(reducedMotion?0:Math.sin(time*3)*.06)-(me.seated?.47*me.sitBlend:0);cursor.rotation.y=time*1.2;
    if(glowing){glowTime+=dt;const k=reducedMotion?.3:.3+.3*Math.sin(glowTime*2.5);glowing.traverse((o: any)=>{if(o.userData.mat)o.material.emissiveIntensity=k;});}
    if(mode==='edit'){const d=Math.atan2(Math.sin(editYaw-avatar.rotation.y),Math.cos(editYaw-avatar.rotation.y));avatar.rotation.y+=d*Math.min(1,dt*(reducedMotion?60:14));if(Math.abs(d)>.002)stir=2;}
    if(editAnim){
      editAnim.t=Math.min(1,editAnim.t+dt/(reducedMotion?.001:.6));const k=spring(editAnim.t);
      camera.zoom=editAnim.z0+(editAnim.z1-editAnim.z0)*k;camera.updateProjectionMatrix();
      camTarget.lerpVectors(editAnim.p0,editAnim.p1,k);
      if(editAnim.t>=1)editAnim=null;
    } else if(mode!=='edit'){
      // At 100% the whole room fits, so the camera only leans toward the player; the more you zoom in, the more it locks onto them.
      const k=Math.min(1,.7+(zoom-1)*.3),desired=follow?new THREE.Vector3(avatar.position.x*k,.85,avatar.position.z*k-.5*(1-k)):new THREE.Vector3(0,.85,0).add(pan);
      camTarget.lerp(desired,1-Math.exp(-dt*(reducedMotion?20:3.5)));
    }
    camera.position.copy(camTarget).add(cameraOffset);camera.lookAt(camTarget);
    stage();
    if(mode==='edit')drawEditing();else renderer.render(scene,camera);
    raf=requestAnimationFrame(animate);
  }
  tick('ready');// the whole construction, phase by phase, is readable in DevTools → Performance → Timings (and logged once in dev)
  camera.position.copy(camTarget).add(cameraOffset);camera.lookAt(camTarget);raf=requestAnimationFrame(animate);
  if(import.meta.env.DEV)(window as any).__cafe={scene,renderer,camera};// dev only: lets a console profile the live scene
  return {setTasks,setClock,setEnergy,setLook,startPlacing,stopPlacing,enterEditor,exitEditor,resetView,isEditing:()=>mode==='edit',playerPosition:()=>({x:avatar.position.x,z:avatar.position.z}),addRemote,moveRemote,setRemoteState,setRemoteHat,setRemoteLook,removeRemote,clearRemotes,say,sayMe,emote,emoteMe,float,setTodo,onCell(cb: (col: number,row: number,arrived: boolean)=>void){cellListener=cb;},zoomIn:()=>setZoom(zoom*1.18),zoomOut:()=>setZoom(zoom/1.18),recenter,setFollow,toggleLight,dispose(){cancelAnimationFrame(raf);observer.disconnect();clearRemotes();for(const b of bubbles.values())dropSprite(b.s);bubbles.clear();for(const stack of chatStacks.values())for(const b of stack.items)dropSprite(b.s);chatStacks.clear();for(const f of floats)dropSprite(f.s);floats.length=0;scene.traverse((o: any)=>{o.geometry?.dispose();});materials.forEach(m=>m.dispose());for(const m of extras)m.dispose();extras.length=0;
    blur.rtA.dispose();blur.rtB.dispose();blur.mat.dispose();blur.quad.geometry.dispose();studio?.dispose();
    P.disposeGeometries();renderer.dispose();renderer.forceContextLoss();/* free the GL context, else a few room switches exhaust the browser's context budget */}};
}
