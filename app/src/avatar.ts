// One avatar rig, built from a Look. Shared by the player, the barista and remote players; the walker only needs the rig's joints.
import * as THREE from 'three';
import {C,type Primitives} from './primitives.ts';
import {type Look,defaultLook,skinHex,hairHex,trousersHex} from './look.ts';
export interface Rig{g:any;body:any;head:any;legL:any;legR:any;armL:any;armR:any;phase:number;look:Look;parts:{skull:any;hair:any;hat:any;hands:any[];shirt:any[];legs:any[]}}
export interface AvatarOpts{apron?:string|null}
export const hexOf=(n:number)=>'#'+n.toString(16).padStart(6,'0');
export const lookFor=(color:number,hat:string|null):Look=>({...defaultLook(color),hat});
const HEAD_SCALE:Record<'round'|'oval',[number,number,number]>={round:[1,1.1,.91],oval:[.94,1.18,.9]};// the square head is a fixed box, it never reads a scale

function buildSkull(p:Primitives,head:any,look:Look){
  const g=new THREE.Group();head.add(g);const skin=skinHex(look.skin);
  if(look.head==='square')p.box(.56,.6,.52,skin,0,.21,0,.16,g);else{const [sx,sy,sz]=HEAD_SCALE[look.head];p.ball(.31,skin,0,.21,0,g,sx,sy,sz);}
  for(const dx of [-.11,.11])p.ball(.023,C.dark,dx,.20,.258,g,1,1.2,.6);
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
// A little person: legs pivot at the hip so they swing while walking and fold when sitting.
export function buildAvatar(p:Primitives,x:number,z:number,look:Look,{apron=null}:AvatarOpts={}):Rig{
  const g=p.group(x,.08,z),body=new THREE.Group();g.add(body);
  const legL=new THREE.Group(),legR=new THREE.Group();legL.position.set(-.14,.47,0);legR.position.set(.14,.47,0);body.add(legL,legR);
  const legs:any[]=[];for(const leg of [legL,legR]){legs.push(p.box(.19,.39,.22,trousersHex(look.trousers),0,-.2,0,.07,leg));p.box(.22,.12,.32,C.edge,0,-.37,.045,.04,leg);}
  const shirtHex=hexOf(look.shirt),torso=p.box(.58,.53,.36,shirtHex,0,.69,0,.15,body);
  const armL=p.box(.17,.43,.21,shirtHex,-.36,.65,0,.07,body),armR=p.box(.17,.43,.21,shirtHex,.36,.65,0,.07,body);
  const hands=[p.ball(.095,skinHex(look.skin),-.36,.43,0,body),p.ball(.095,skinHex(look.skin),.36,.43,0,body)];
  const head=new THREE.Group();head.position.y=1.0;body.add(head);// pivots at the neck so the character can look around
  if(apron){// bib, skirt, waist tie and a front pocket
    p.box(.30,.22,.05,apron,0,.90,.185,.02,body);p.box(.54,.40,.05,apron,0,.60,.19,.03,body);p.box(.60,.05,.42,apron,0,.80,0,.02,body);
    p.box(.20,.12,.02,'#d8b27a',0,.55,.222,.008,body);for(const dx of [-.12,.12])p.box(.03,.30,.02,apron,dx,1.06,.19,.005,body);
  }
  const rig:Rig={g,body,head,legL,legR,armL,armR,phase:Math.random()*7,look,parts:{skull:null,hair:null,hat:null,hands,shirt:[torso,armL,armR],legs}};
  rig.parts.skull=buildSkull(p,head,look);rig.parts.hair=buildHair(p,head,look);rig.parts.hat=look.hat?buildHat(p,look.hat,head):null;
  return rig;
}
// Only geometries are freed: the materials come from the shared cache and are reused by the whole room.
const drop=(o:any)=>{if(!o)return;o.removeFromParent();o.traverse((m:any)=>{m.geometry?.dispose?.();});};
export function applyLook(p:Primitives,rig:Rig,look:Look):void{
  drop(rig.parts.skull);drop(rig.parts.hair);drop(rig.parts.hat);
  rig.parts.skull=buildSkull(p,rig.head,look);rig.parts.hair=buildHair(p,rig.head,look);rig.parts.hat=look.hat?buildHat(p,look.hat,rig.head):null;
  for(const m of rig.parts.hands)m.material=p.mat(skinHex(look.skin));
  for(const m of rig.parts.shirt)m.material=p.mat(hexOf(look.shirt));
  for(const m of rig.parts.legs)m.material=p.mat(trousersHex(look.trousers));
  rig.look=look;
}
