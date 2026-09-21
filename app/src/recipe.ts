// Turns an editor recipe (a list of primitives) into one group, through the same toolkit the hand-written decor uses,
// and reads a built group back into a recipe, so the coded pieces can be opened in the workshop.
import * as THREE from 'three';
import type {Primitives} from './primitives.ts';
import type {Part} from '@shared/catalog';

export function buildRecipe(p:Primitives,parts:Part[],parent:any):any{
  const g=new THREE.Group();parent.add(g);
  for(const q of parts){
    const m=q.kind==='box'?p.box(q.w,q.h,q.d,q.color,q.x,q.y,q.z,q.r,g):q.kind==='cyl'?p.cyl(q.rt,q.rb,q.h,q.color,q.x,q.y,q.z,g,q.n):p.ball(q.r,q.color,q.x,q.y,q.z,g,q.sx,q.sy,q.sz);
    m.rotation.set(q.rx,q.ry,q.rz);
  }
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
    else if(g.type==='SphereGeometry'){const s=Math.min(scl.x,scl.y,scl.z);parts.push({kind:'ball',...base,r:r3(P.radius*s),sx:r3(scl.x/s),sy:r3(scl.y/s),sz:r3(scl.z/s)});}
  });
  return parts;
}
