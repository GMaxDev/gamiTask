// Small pictures of the café for the landing page, rendered once from the real pieces and characters: no artwork to keep in sync.
import * as THREE from 'three';
import {createPrimitives,C} from './primitives.ts';
import {createDecor} from './decor.ts';
import {buildAvatar} from './avatar.ts';
import {randomLook} from './look.ts';
import {PALETTE} from './identity.ts';
import {buildRecipe} from './recipe.ts';
import {defaultPart} from './workshop-model.ts';

export type Vignette='timer'|'tasks'|'avatar'|'room'|'twitch'|'workshop';
const seeded=(seed:number)=>()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};

export function createVignettes(){
  const W=480,H=360,renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setSize(W,H);renderer.setPixelRatio(1);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight('#fff5dc','#a8b294',1.2));
  const sun=new THREE.DirectionalLight('#ffd08f',2.2);sun.position.set(-3,10,5);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.bias=-.0005;scene.add(sun);
  const fill=new THREE.DirectionalLight('#dfe8f4',.5);fill.position.set(9,6,-3);scene.add(fill);
  const floor=new THREE.Mesh(new THREE.CircleGeometry(3.2,48),new THREE.MeshStandardMaterial({color:'#e8d5b0',roughness:.95}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  const materials=new Map<string,any>(),extras:any[]=[];let root=new THREE.Group();scene.add(root);
  const P=createPrimitives(()=>root,materials,extras);
  const D=createDecor({p:P,scene,root:()=>root,previewing:()=>true,HD:0,obstacle(){},seat(){},taskSpot(){},hotspot:(o:any)=>o,shadow(){},steam:[],pendants:[],windows:[],taskSpots:[]});
  const camera=new THREE.OrthographicCamera(-2*W/H,2*W/H,2,-2,.1,100);
  const aim=(y:number,zoom:number)=>{camera.position.set(13,12.5,16).normalize().multiplyScalar(30).add(new THREE.Vector3(0,y,0));camera.lookAt(0,y,0);camera.zoom=zoom;camera.updateProjectionMatrix();};
  const person=(x:number,z:number,seed:number,hat:string|null=null,rot=0)=>{const rig=buildAvatar(P,x,z,{...randomLook(PALETTE.map(p=>p.hex),seeded(seed)),hat});rig.g.rotation.y=rot;return rig;};
  const builders:Record<Vignette,()=>void>={
    timer(){D.squareTable(0,0);D.chair(0,1.05,Math.PI,C.terra);D.mug(.2,1.06,-.2,C.white,root,false);person(0,1.05,3,'hat-party',Math.PI).g.position.y=.3;D.lamp(-1.2,-.6);aim(.7,1.2);},
    tasks(){D.roundTable(0,0);D.chair(-1.1,0,Math.PI/2,C.sage);D.chair(1.1,0,-Math.PI/2,C.terra);for(const [x,z,i] of [[.35,.15,0],[-.15,-.35,1]] as [number,number,number][]){const t=P.box(.3,.02,.2,i?C.cream:C.peach,x,1.12,z,.003,root);t.rotation.y=.3*i;}aim(.7,1.15);},
    avatar(){person(-.55,0,7,'hat-crown',-.35);person(.55,.2,11,'hat-wizard',.25);aim(.95,1.6);},
    room(){D.sofa(-1.2,0);D.rug(.35,0);D.coffeeTable(0,0);D.plant(1.5,-1.1,1.2);D.lamp(1.6,.9);aim(.5,1.05);},
    twitch(){for(const [x,z,s] of [[-1.1,.3,21],[0,-.2,22],[1.1,.3,23]] as number[][])person(x,z,s,null,-.2);aim(.9,1.3);},
    workshop(){buildRecipe(P,([{...defaultPart('shell'),w:1.1,h:1.3,d:.5,color:C.oak},{...defaultPart('box'),w:1,h:.04,d:.42,y:.5,color:C.edge},{...defaultPart('cyl'),rt:.14,rb:.11,h:.24,x:-.25,y:.62,color:C.terra},{...defaultPart('ball'),r:.16,x:-.25,y:.86,sy:.8,color:C.sage},{...defaultPart('box'),w:.28,h:.3,d:.3,x:.3,y:.65,color:C.gold}] as any),root);D.cactus(1.3,.4);aim(.7,1.25);},
  };
  const cache=new Map<Vignette,string>();
  function draw(kind:Vignette):string{
    const hit=cache.get(kind);if(hit)return hit;
    scene.remove(root);root=new THREE.Group();scene.add(root);builders[kind]();renderer.render(scene,camera);
    const url=renderer.domElement.toDataURL('image/png');cache.set(kind,url);root.traverse((o:any)=>o.geometry?.dispose?.());return url;
  }
  return {draw,dispose(){materials.forEach(m=>m.dispose());extras.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();}};
}
