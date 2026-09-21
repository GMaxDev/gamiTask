// Turns an editor recipe (a list of primitives) into one group, through the same toolkit the hand-written decor uses.
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
