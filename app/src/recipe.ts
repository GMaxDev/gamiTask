// Turns an editor recipe (a list of primitives) into one group, through the same toolkit the hand-written decor uses,
// and reads a built group back into a recipe, so the coded pieces can be opened in the workshop.
import * as THREE from 'three';
import type {Evaluator} from 'three-bvh-csg';
import type {Primitives} from './primitives.ts';
import type {Part} from '@shared/catalog';

// One child per part, in order, so the workshop can map a clicked mesh back to its part. A cutting part is carved out
// of every solid part before it; in the game it leaves an empty group, in the workshop a translucent ghost to grab.
export function buildRecipe(p:Primitives,parts:Part[],parent:any,ghosts=false):any{
  const g=new THREE.Group();parent.add(g);const solids:any[]=[];
  for(const q of parts){
    const m=q.kind==='box'?p.box(q.w,q.h,q.d,q.color,q.x,q.y,q.z,q.r,g):q.kind==='cyl'?p.cyl(q.rt,q.rb,q.h,q.color,q.x,q.y,q.z,g,q.n):q.kind==='ball'?p.ball(q.r,q.color,q.x,q.y,q.z,g,q.sx,q.sy,q.sz)
      :q.kind==='torus'?p.mesh(new THREE.TorusGeometry(q.rad,q.tube,8,q.n,q.arc),q.color,q.x,q.y,q.z,g):shell(p,q,g);
    m.rotation.set(q.rx,q.ry,q.rz);
    const meshes:any[]=[];m.traverse((o:any)=>{if(o.isMesh)meshes.push(o);});
    if(q.op!=='cut'){solids.push(...meshes);continue;}
    g.updateWorldMatrix(true,true);for(const s of solids)for(const c of meshes)carve(s,c);
    if(ghosts){for(const c of meshes){c.material=GHOST;c.castShadow=c.receiveShadow=false;c.renderOrder=1;}}
    else{g.remove(m);m.traverse((o:any)=>o.geometry?.dispose?.());g.add(new THREE.Group());}
  }
  return g;
}
const GHOST=new THREE.MeshStandardMaterial({color:'#c94f4f',transparent:true,opacity:.35,depthWrite:false});
// The boolean toolkit (three-bvh-csg + three-mesh-bvh, ~32 kB gzip) is fetched on demand: only recipes with a cut need it.
// Until it lands, a cut is skipped and the piece renders solid; callers that know they carve await ensureCsg() and rebuild.
type Csg=typeof import('three-bvh-csg');
let csg:Csg|null=null,loading:Promise<void>|null=null,evaluator:Evaluator|null=null;
export const csgReady=():boolean=>!!csg;
export function ensureCsg():Promise<void>{return csg?Promise.resolve():(loading??=import('three-bvh-csg').then(m=>{csg=m;}));}
export const needsCsg=(parts:Part[]):boolean=>parts.some(p=>p.op==='cut');
function carve(target:any,cutter:any){
  if(!csg)return;
  evaluator??=Object.assign(new csg.Evaluator(),{useGroups:false});
  const a=new csg.Brush(target.geometry),b=new csg.Brush(cutter.geometry);
  target.matrixWorld.decompose(a.position,a.quaternion,a.scale);cutter.matrixWorld.decompose(b.position,b.quaternion,b.scale);a.updateMatrixWorld(true);b.updateMatrixWorld(true);
  const out=evaluator.evaluate(a,b,csg.SUBTRACTION);target.geometry.dispose();target.geometry=out.geometry;// the result sits in the target's own frame
}
// Back, two sides, bottom and top: the front stays open so shelves and things can sit inside.
function shell(p:Primitives,q:Extract<Part,{kind:'shell'}>,parent:any){
  const g=new THREE.Group();g.position.set(q.x,q.y,q.z);parent.add(g);const {w,h,d,t,r,color}=q;
  p.box(w,h,t,color,0,0,-d/2+t/2,r,g);for(const s of [-1,1])p.box(t,h,d,color,s*(w-t)/2,0,0,r,g);for(const s of [-1,1])p.box(w,t,d,color,0,s*(h-t)/2,0,r,g);
  return g;
}
const r3=(v:number)=>Math.round(v*1000)/1000||0;
// Only box, cylinder and sphere geometries are read; transparent materials (steam, shadow discs) are effects, not shape.
// A parent's scale is folded into the dimensions, so `plant(size)` captures at its true size.
export function captureRecipe(root:any):Part[]{
  root.updateWorldMatrix(true,true);const s=root.scale,inv=new THREE.Matrix4().copy(root.matrixWorld).scale(new THREE.Vector3(1/s.x,1/s.y,1/s.z)).invert(),parts:Part[]=[];// the root's own scale stays in the parts
  const pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scl=new THREE.Vector3(),eul=new THREE.Euler();
  root.traverse((o:any)=>{
    if(!o.isMesh||o===root||o.material?.transparent)return;
    new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld).decompose(pos,quat,scl);eul.setFromQuaternion(quat);
    const g=o.geometry,P=g.parameters??{},color='#'+o.material.color.getHexString();
    const base={x:r3(pos.x),y:r3(pos.y),z:r3(pos.z),rx:r3(eul.x),ry:r3(eul.y),rz:r3(eul.z),color};
    if(g.type==='BoxGeometry'||g.type==='RoundedBoxGeometry')parts.push({kind:'box',...base,w:r3(P.width*scl.x),h:r3(P.height*scl.y),d:r3(P.depth*scl.z),r:r3((P.radius??0)*scl.x)});
    else if(g.type==='CylinderGeometry')parts.push({kind:'cyl',...base,rt:r3(P.radiusTop*scl.x),rb:r3(P.radiusBottom*scl.x),h:r3(P.height*scl.y),n:P.radialSegments});
    else if(g.type==='TorusGeometry')parts.push({kind:'torus',...base,rad:r3(P.radius*scl.x),tube:r3(P.tube*scl.x),n:P.tubularSegments,arc:r3(P.arc)});
    else if(g.type==='SphereGeometry'){const s=Math.min(scl.x,scl.y,scl.z);parts.push({kind:'ball',...base,r:r3(P.radius*s),sx:r3(scl.x/s),sy:r3(scl.y/s),sz:r3(scl.z/s)});}
  });
  return parts;
}
