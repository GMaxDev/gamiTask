import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
export const C={cream:'#f4e4c9',wood:'#bd8356',edge:'#905e3d',oak:'#d9aa72',sage:'#819478',dark:'#384d43',terra:'#c9764f',peach:'#e5a27a',white:'#fff4df',gold:'#d2a754',soil:'#594438'};
export interface Primitives{mat(color:any,extra?:any):any;disposeGeometries():void;mesh(geo:any,color:any,x:number,y:number,z:number,parent?:any,extra?:any):any;box(w:number,h:number,d:number,color:any,x:number,y:number,z:number,r?:number,parent?:any):any;cyl(rt:number,rb:number,h:number,color:any,x:number,y:number,z:number,parent?:any,n?:number):any;ball(r:number,color:any,x:number,y:number,z:number,parent?:any,sx?:number,sy?:number,sz?:number):any;group(x:number,y:number,z:number,rot?:number):any}
// Low-poly building blocks shared by the room and the avatars. `getRoot` is a getter because the scene swaps its root while previewing furniture.
// extras collects the one-off materials an `extra` bypasses the cache with: the caller owns them and disposes them.
export function createPrimitives(getRoot:()=>any,materials:Map<string,any>,extras:any[]=[]):Primitives{
  // One geometry per shape, shared by every mesh of that shape: a room asks for ~800 rounded boxes but only ~60 distinct ones
  // (measured 345 ms → ~25 ms). A shared geometry ignores per-mesh dispose(); disposeGeometries() frees them all with the scene.
  const geos=new Map<string,any>();
  // Small radii (slats, mullions, trims) get one rounding segment: 324 vertices instead of 900, no visible difference.
  function shape(key:string,make:()=>any):any{let g=geos.get(key);if(!g){g=make();g.dispose=()=>{};geos.set(key,g);}return g;}
  function disposeGeometries(){for(const g of geos.values())THREE.BufferGeometry.prototype.dispose.call(g);geos.clear();}
  function mat(color:any,extra:any={}):any{if(Object.keys(extra).length){const m=new THREE.MeshStandardMaterial({color,roughness:.82,...extra});extras.push(m);return m;}if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.82}));return materials.get(color);}
  function mesh(geo:any,color:any,x:number,y:number,z:number,parent?:any,extra:any={}):any{parent??=getRoot();const m=new THREE.Mesh(geo,typeof color==='string'?mat(color,extra):color);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  function box(w:number,h:number,d:number,color:any,x:number,y:number,z:number,r=.04,parent?:any):any{const rr=r?Math.min(r,w/3,h/3,d/3):0;return mesh(shape(`b:${w},${h},${d},${rr}`,()=>rr?new RoundedBoxGeometry(w,h,d,rr<=.02?1:2,rr):new THREE.BoxGeometry(w,h,d)),color,x,y,z,parent??getRoot());}
  function cyl(rt:number,rb:number,h:number,color:any,x:number,y:number,z:number,parent?:any,n=16):any{return mesh(shape(`c:${rt},${rb},${h},${n}`,()=>new THREE.CylinderGeometry(rt,rb,h,n)),color,x,y,z,parent??getRoot());}
  function ball(r:number,color:any,x:number,y:number,z:number,parent?:any,sx=1,sy=1,sz=1):any{const m=mesh(shape(`s:${r}`,()=>new THREE.SphereGeometry(r,12,8)),color,x,y,z,parent??getRoot());m.scale.set(sx,sy,sz);return m;}
  function group(x:number,y:number,z:number,rot=0):any{const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=rot;getRoot().add(g);return g;}
  return {mat,mesh,box,cyl,ball,group,disposeGeometries};
}
