// One avatar rig, built from a Look. Shared by the player, the barista and remote players; the walker only needs the rig's joints.
import * as THREE from 'three';
import {C,type Primitives} from './primitives.ts';
import {type Look,defaultLook,skinHex,hairHex,trousersHex,shoesHex} from './look.ts';
export interface Rig{g:any;body:any;head:any;legL:any;legR:any;armL:any;armR:any;phase:number;look:Look;parts:{skull:any;hair:any;hat:any;hands:any[];torso:any;arms:any[];legParts:any[];skirt:any;collar:any}}
export interface AvatarOpts{apron?:string|null}
export const hexOf=(n:number)=>'#'+n.toString(16).padStart(6,'0');
export const lookFor=(color:number,hat:string|null):Look=>({...defaultLook(color),hat});
const HEAD_SCALE:Record<'round'|'oval',[number,number,number]>={round:[1,1.1,.91],oval:[.94,1.18,.9]};// the square head is a fixed box, it never reads a scale
const BODY_SCALE:Record<Look['body'],[number,number]>={slim:[.9,.9],regular:[1,1],round:[1.18,1.15]};
const shade=(hex:string,f:number)=>{const n=parseInt(hex.slice(1),16);return '#'+[n>>16&255,n>>8&255,n&255].map(v=>Math.round(f>0?v+(255-v)*f:v*(1+f)).toString(16).padStart(2,'0')).join('');};
// Where a face feature sits so it stays on the skull's surface whatever its height: the ball heads narrow towards the chin, the square head is flat.
function faceZ(look:Look,y:number,x=0):number{
  if(look.head==='square')return .27;
  const [sx,sy,sz]=HEAD_SCALE[look.head],ty=(y-.21)/(.31*sy),tx=x/(.31*sx);
  return .31*sz*Math.sqrt(Math.max(.25,1-ty*ty-tx*tx));
}
function buildEye(p:Primitives,g:any,look:Look,side:number,x:number,y:number,s:number){
  // a touch proud of the skull so the white still reads when the gap pushes the eye onto the cheek
  const e=new THREE.Group();e.position.set(side*x,y,faceZ(look,y,side*x)+.012);e.scale.setScalar(s);g.add(e);
  if(look.eyes==='wink'&&side>0){p.box(.06,.012,.01,C.dark,0,0,.012,0,e);return;}
  const w=p.ball(.045,C.white,0,0,0,e,1,.9,.55);
  if(look.eyes==='almond')w.scale.set(1.3,.72,.55);else if(look.eyes==='wide')w.scale.set(1.25,1.12,.55);
  p.ball(.024,C.dark,0,0,.022,e,1,1,.7);
  if(look.eyes==='sleepy'){// a skin-coloured cap hugging the top half of the white, slightly bigger so no white peeks out
    // deep enough in z to cover the pupil too (it sits .022 proud of the white, radius .024 → front at ~.039)
    const lid=p.mesh(new THREE.SphereGeometry(.049,12,8,0,Math.PI*2,0,Math.PI*.5),skinHex(look.skin),0,-.004,.004,e);lid.scale.set(w.scale.x*1.06,w.scale.y*1.08,.95);lid.castShadow=false;}
}
function buildFace(p:Primitives,g:any,look:Look){
  const ex=.11+look.eyesGap*.012,ey=.20+look.eyesY*.012,es=1+look.eyesSize*.12;
  for(const side of [-1,1])buildEye(p,g,look,side,ex,ey,es);
  const by=.30+look.browsY*.012,bh=look.brows==='thick'?.03:look.brows==='thin'?.012:.018;
  for(const side of [-1,1]){const b=p.box(.09,bh,.012,hairHex(look.hairColor),side*ex,by,faceZ(look,by,side*ex),0,g);b.rotation.y=-side*.25;if(look.brows==='arched')b.rotation.z=side*.35;}
  const ny=.12+look.noseY*.012,nose=new THREE.Group();nose.position.set(0,ny,faceZ(look,ny));nose.scale.setScalar(1+look.noseSize*.12);g.add(nose);
  const nc=shade(skinHex(look.skin),-.12);
  if(look.nose==='straight')p.box(.03,.07,.03,nc,0,0,.004,.008,nose);
  else if(look.nose==='wide')p.ball(.028,nc,0,0,0,nose,1.5,.8,1);
  else p.ball(look.nose==='small'?.02:.028,nc,0,0,0,nose);
  const my=.04+look.mouthY*.012,mouth=new THREE.Group();mouth.position.set(0,my,faceZ(look,my));mouth.scale.setScalar(1+look.mouthSize*.12);g.add(mouth);
  const mc='#b8604a';
  switch(look.mouth){
    case 'neutral':p.box(.07,.012,.01,mc,0,0,0,0,mouth);break;
    case 'grin':p.box(.09,.032,.012,mc,0,0,0,.008,mouth);p.box(.05,.012,.01,C.white,0,.008,.007,0,mouth);break;
    case 'open':p.ball(.03,shade(mc,-.35),0,0,0,mouth,1,1.1,.7);break;
    case 'pout':p.ball(.022,mc,0,0,0,mouth,1,1,.8);break;
    default:{const m=p.mesh(new THREE.TorusGeometry(.04,.008,6,12,Math.PI),mc,0,.012,0,mouth);m.rotation.z=Math.PI;m.scale.z=.6;}
  }
}
function buildSkull(p:Primitives,head:any,look:Look){
  const g=new THREE.Group();head.add(g);const skin=skinHex(look.skin);
  if(look.head==='square')p.box(.56,.6,.52,skin,0,.21,0,.16,g);else{const [sx,sy,sz]=HEAD_SCALE[look.head];p.ball(.31,skin,0,.21,0,g,sx,sy,sz);}
  buildFace(p,g,look);
  p.ball(.046,'#d89479',-.20,.12,.223,g,1,.45,.3);p.ball(.046,'#d89479',.20,.12,.223,g,1,.45,.3);
  if(look.headphones){p.mesh(new THREE.TorusGeometry(.335,.035,6,16,Math.PI),C.cream,0,.27,0,g);for(const dx of [-.33,.33])p.ball(.1,C.cream,dx,.23,0,g,.48,1.2,.9);}
  return g;
}
// Hair is two pieces on the head pivot: the bangs in front, the back behind. Rounded shapes read well at the editor's zoom.
function buildHair(p:Primitives,head:any,look:Look){
  const g=new THREE.Group();head.add(g);const h=hairHex(look.hairColor);
  if(look.bangs!=='none'||look.back!=='none')p.ball(.32,h,0,.34,-.045,g,1.04,.85,.98);// cap
  switch(look.bangs){
    case 'straight':p.box(.5,.16,.14,h,0,.42,.22,.05,g);break;
    case 'curtain':p.box(.2,.2,.13,h,-.17,.4,.22,.05,g);p.box(.2,.2,.13,h,.17,.4,.22,.05,g);break;
    case 'side':{const b=p.box(.46,.15,.14,h,.05,.43,.22,.05,g);b.rotation.z=-.22;break;}
    case 'curly':for(const [dx,dy] of [[-.2,.4],[-.07,.46],[.07,.46],[.2,.4]] as [number,number][])p.ball(.1,h,dx,dy,.2,g);break;
  }
  switch(look.back){
    case 'short':p.ball(.3,h,0,.28,-.12,g,1,.8,.9);break;
    case 'bob':p.box(.62,.42,.5,h,0,.2,-.06,.16,g);break;
    case 'ponytail':p.ball(.3,h,0,.28,-.12,g,1,.8,.9);{const t=p.box(.14,.42,.14,h,0,.12,-.36,.06,g);t.rotation.x=.35;}break;
    case 'braids':p.ball(.3,h,0,.28,-.12,g,1,.8,.9);for(const dx of [-.3,.3]){const b=p.box(.11,.5,.11,h,dx,.0,-.02,.05,g);b.rotation.z=dx>0?.12:-.12;}break;
  }
  return g;
}
// Hats sit on the head pivot so they turn with it. Built on demand, swapped live.
// The halo's emissive material takes options, so `p.mat` mints a fresh one on every rebuild: cache it here, like the shared map does for plain colours, so `drop()` still frees geometries only.
let haloMat:any;
export function buildHat(p:Primitives,id:string,parent:any):any{
  const g=new THREE.Group();parent.add(g);
  switch(id){
    case 'hat-party':{const cone=p.cyl(0,.17,.4,C.terra,0,.7,0,g,12);for(let i=0;i<3;i++)p.cyl(0,.17-(i+.5)*.045,.02,C.cream,0,.6+i*.1,0,g,12);p.ball(.045,C.gold,0,.9,0,g);break;}
    case 'hat-halo':{const ring=p.mesh(new THREE.TorusGeometry(.22,.03,8,24),haloMat??=p.mat(C.gold,{emissive:C.gold,emissiveIntensity:.7}),0,.82,0,g);ring.rotation.x=Math.PI/2;ring.castShadow=false;g.userData.float=true;break;}
    case 'hat-crown':{p.cyl(.25,.22,.16,C.gold,0,.58,0,g,10);for(let i=0;i<6;i++){const a=i/6*Math.PI*2;p.cyl(0,.05,.14,C.gold,Math.sin(a)*.22,.72,Math.cos(a)*.22,g,6);}for(let i=0;i<3;i++)p.ball(.03,[C.terra,C.sage,'#8aa6b8'][i],Math.sin(i*2.1)*.24,.58,Math.cos(i*2.1)*.24,g);break;}
    case 'hat-cowboy':{const brim=p.cyl(.44,.44,.035,'#8b5a2b',0,.5,0,g,20);brim.rotation.x=.08;p.cyl(.21,.24,.22,'#8b5a2b',0,.62,0,g,14);p.cyl(.245,.245,.04,C.dark,0,.55,0,g,14);break;}
    case 'hat-wizard':{p.cyl(.4,.4,.035,'#3d3a6b',0,.5,0,g,20);const cone=p.cyl(0,.25,.62,'#3d3a6b',0,.8,0,g,12);cone.rotation.z=-.12;p.ball(.045,C.gold,-.02,1.02,.1,g);for(let i=0;i<3;i++)p.ball(.025,C.gold,Math.sin(i*2.5)*.14,.62+i*.1,Math.cos(i*2.5)*.14,g);break;}
  }
  return g;
}
// Patterned shirts need their own material per (pattern, colour): kept for the page's lifetime, since every room and every thumbnail reuses the same few.
const patMats=new Map<string,any>();
function topMat(p:Primitives,look:Look):any{
  const hex=hexOf(look.shirt);
  if(look.topPattern!=='stripes'&&look.topPattern!=='dots')return p.mat(hex);
  const key=`${look.topPattern}|${hex}`,hit=patMats.get(key);if(hit)return hit;
  const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d')!;
  x.fillStyle=hex;x.fillRect(0,0,128,128);
  if(look.topPattern==='stripes'){x.fillStyle=shade(hex,-.22);for(let y=0;y<128;y+=24)x.fillRect(0,y,128,12);}
  else{x.fillStyle=shade(hex,.34);for(let i=0,y=16;y<128;y+=32,i++)for(let cx=(i%2?16:0);cx<128;cx+=32){x.beginPath();x.arc(cx,y,5,0,Math.PI*2);x.fill();}}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(2,2);
  const m=new THREE.MeshStandardMaterial({map:t,roughness:.9});patMats.set(key,m);return m;
}
// Arms, legs, skirt and collar: everything the outfit owns, rebuilt in place on the joints the walker holds.
function buildOutfit(p:Primitives,rig:Rig,look:Look){
  const top=topMat(p,look),skin=skinHex(look.skin),bottom=trousersHex(look.trousers),parts=rig.parts;
  parts.arms=[];parts.legParts=[];
  for(const arm of [rig.armL,rig.armR]){
    if(look.sleeves==='long')parts.arms.push(p.box(.17,.43,.21,top,0,0,0,.07,arm));
    else{parts.arms.push(p.box(.17,.22,.21,top,0,.105,0,.07,arm),p.box(.17,.22,.21,skin,0,-.105,0,.07,arm));}
  }
  for(const leg of [rig.legL,rig.legR]){
    if(look.bottom==='trousers')parts.legParts.push(p.box(.19,.39,.22,bottom,0,-.2,0,.07,leg));
    else if(look.bottom==='shorts')parts.legParts.push(p.box(.19,.20,.22,bottom,0,-.105,0,.07,leg),p.box(.19,.20,.22,skin,0,-.295,0,.07,leg));
    else parts.legParts.push(p.box(.19,.39,.22,skin,0,-.2,0,.07,leg));
    parts.legParts.push(p.box(.22,.12,.32,shoesHex(look.shoes),0,-.37,.045,.04,leg));
  }
  parts.skirt=look.bottom==='skirt'?p.cyl(.32,.40,.30,bottom,0,.42,0,rig.body,20):null;
  parts.collar=look.topPattern==='collar'?p.box(.34,.06,.34,C.white,0,.955,0,.02,rig.body):null;
  parts.torso.material=top;
  const [sx,sz]=BODY_SCALE[look.body];rig.body.scale.set(sx,1,sz);rig.head.scale.set(1/sx,1,1/sz);// the head rides the torso scale but keeps its own size and height (scale.y stays 1)
}
// A little person: legs pivot at the hip so they swing while walking and fold when sitting.
export function buildAvatar(p:Primitives,x:number,z:number,look:Look,{apron=null}:AvatarOpts={}):Rig{
  const g=p.group(x,.08,z),body=new THREE.Group();g.add(body);
  const legL=new THREE.Group(),legR=new THREE.Group();legL.position.set(-.14,.47,0);legR.position.set(.14,.47,0);body.add(legL,legR);
  const armL=new THREE.Group(),armR=new THREE.Group();armL.position.set(-.36,.65,0);armR.position.set(.36,.65,0);body.add(armL,armR);
  const torso=p.box(.58,.53,.36,hexOf(look.shirt),0,.69,0,.15,body);
  const hands=[p.ball(.095,skinHex(look.skin),-.36,.43,0,body),p.ball(.095,skinHex(look.skin),.36,.43,0,body)];
  const head=new THREE.Group();head.position.y=1.0;body.add(head);// pivots at the neck so the character can look around
  if(apron){// bib, skirt, waist tie and a front pocket
    p.box(.30,.22,.05,apron,0,.90,.185,.02,body);p.box(.54,.40,.05,apron,0,.60,.19,.03,body);p.box(.60,.05,.42,apron,0,.80,0,.02,body);
    p.box(.20,.12,.02,'#d8b27a',0,.55,.222,.008,body);for(const dx of [-.12,.12])p.box(.03,.30,.02,apron,dx,1.06,.19,.005,body);
  }
  const rig:Rig={g,body,head,legL,legR,armL,armR,phase:Math.random()*7,look,parts:{skull:null,hair:null,hat:null,hands,torso,arms:[],legParts:[],skirt:null,collar:null}};
  rig.parts.skull=buildSkull(p,head,look);rig.parts.hair=buildHair(p,head,look);rig.parts.hat=look.hat?buildHat(p,look.hat,head):null;
  buildOutfit(p,rig,look);
  return rig;
}
// Only geometries are freed: the materials come from the shared cache and are reused by the whole room.
const drop=(o:any)=>{if(!o)return;o.removeFromParent();o.traverse((m:any)=>{m.geometry?.dispose?.();});};
export function applyLook(p:Primitives,rig:Rig,look:Look):void{
  drop(rig.parts.skull);drop(rig.parts.hair);drop(rig.parts.hat);drop(rig.parts.skirt);drop(rig.parts.collar);
  for(const m of [...rig.parts.arms,...rig.parts.legParts])drop(m);
  rig.parts.skull=buildSkull(p,rig.head,look);rig.parts.hair=buildHair(p,rig.head,look);rig.parts.hat=look.hat?buildHat(p,look.hat,rig.head):null;
  for(const m of rig.parts.hands)m.material=p.mat(skinHex(look.skin));
  buildOutfit(p,rig,look);
  rig.look=look;
}
