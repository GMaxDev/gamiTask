import * as THREE from 'three';
import { C } from './primitives.ts';
import type { Primitives } from './primitives.ts';

// Everything a decor helper needs from the room that hosts it. `root` and `previewing` are getters
// because the scene swaps its root group and flips the preview flag while a ghost piece is built.
export interface DecorContext {
  p: Primitives; scene: THREE.Scene; root(): any; previewing(): boolean; HD: number;
  obstacle(x: number,z: number,w: number,d: number): void;
  seat(x: number,z: number,y: number,rot: number,object: any): void;
  taskSpot(x: number,y: number,z: number): void;
  hotspot(object: any,id: string,title: string,sub: string): any;
  shadow(x: number,z: number,sx: number,sz: number,opacity?: number): any;
  steam: any[]; pendants: any[]; windows: any[]; taskSpots: any[];
}
// The room's furniture, plants, lamps and signage. Pure geometry plus the gameplay registrations the context provides.
export function createDecor(ctx: DecorContext){
  const {scene,steam,pendants,windows,taskSpots,HD}=ctx;
  const {mat,mesh,box,cyl,ball,group}=ctx.p;
  const root=()=>ctx.root(),previewing=()=>ctx.previewing();
  const obstacle=ctx.obstacle,seat=ctx.seat,taskSpot=ctx.taskSpot,shadow=ctx.shadow;
  // Finishes shared by every piece of a kind, so baking still merges them into one mesh each.
  const OAK=mat(C.oak,{roughness:.6}),TRIM=mat(C.edge,{roughness:.6}),FABRIC=mat(C.sage,{roughness:.9}),PEACH=mat(C.peach,{roughness:.9}),CREAM=mat(C.cream,{roughness:.9}),SHADE=mat(C.terra,{roughness:.45,metalness:.2});
  const windowGlow=mat('#cdd9ba',{emissive:'#b7c797',emissiveIntensity:.19});
  const BULB=mat('#ffeac0',{emissive:'#ffd595',emissiveIntensity:.8}),LAMPGLOW=mat('#ffeac0',{emissive:'#ffd595',emissiveIntensity:.6});
  function label(text: string,w: number,h: number,x: number,y: number,z: number,opts: any={}){
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=Math.round(1024*h/w);
    const c2d=canvas.getContext('2d') as CanvasRenderingContext2D;c2d.fillStyle=opts.bg||C.dark;c2d.fillRect(0,0,canvas.width,canvas.height);
    c2d.textAlign='center';c2d.textBaseline='middle';c2d.fillStyle=opts.color||C.cream;
    const lines=text.split('\n');const size=opts.size||Math.min(130,canvas.height/(lines.length+1));
    lines.forEach((line,i)=>{c2d.font=`${i===0?'600':'400'} ${i===0?size:size*.63}px ${opts.font||'Georgia'}`;c2d.fillText(line,512,canvas.height/2+(i-(lines.length-1)/2)*size*1.27);});
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
    const m=mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:texture,roughness:1}),x,y,z);m.castShadow=false;
    if(opts.ry)m.rotation.y=opts.ry;return m;
  }
  function plant(x: number,z: number,size=1,y=0,parent: any=root()){
    cyl(.23*size,.18*size,.43*size,C.cream,x,y+.215*size,z,parent);
    cyl(.215*size,.215*size,.035*size,C.soil,x,y+.43*size,z,parent);
    const stem=cyl(.023*size,.03*size,.8*size,C.dark,x,y+.78*size,z,parent);
    for(let i=0;i<8;i++){
      const a=i*2.4, hh=.52+i*.085;
      const leaf=ball(.20*size,i%2?C.sage:'#6f8551',x+Math.sin(a)*.19*size,y+hh*size,z+Math.cos(a)*.19*size,parent,.6,1.5,.32);
      leaf.rotation.set(Math.cos(a)*.7,a,Math.sin(a)*.8);
    }
    return stem;
  }
  function mug(x: number,y: number,z: number,color: any=C.white,parent: any=root(),steaming=true){
    cyl(.11,.085,.18,color,x,y+.09,z,parent);
    cyl(.087,.087,.008,'#64452e',x,y+.185,z,parent);
    const h=mesh(new THREE.TorusGeometry(.07,.022,6,12),color,x+.12,y+.10,z,parent);h.rotation.y=.3;
    cyl(.16,.16,.025,color,x,y+.01,z,parent);
    if(steaming&&!previewing())for(let i=0;i<4;i++){// wisps rise, drift, swell and fade
      const puff=ball(.045,new THREE.MeshBasicMaterial({color:'#fffaf0',transparent:true,opacity:.32,depthWrite:false}),x,y+.35,z,parent,.8,1.7,.8);
      puff.userData.keep=true;steam.push({puff,baseY:y+.22,phase:i/4,x,z,drift:Math.random()*6});
    }
  }
  function book(x: number,y: number,z: number,w=.36,color: any=C.sage,parent: any=root()){box(w,.065,.3,color,x,y,z,.014,parent);box(w-.025,.033,.29,C.cream,x,y+.003,z+.009,.002,parent);}
  function chair(x: number,z: number,rot=0,color: any=C.sage){
    const g=group(x,0,z,rot);box(.66,.14,.66,color,0,.65,0,.08,g);box(.66,.56,.13,color,0,.98,-.29,.09,g);
    for(const a of [-1,1])for(const b of [-1,1])box(.065,.61,.065,TRIM,a*.23,.31,b*.22,.014,g);
    obstacle(x,z,.65,.65);shadow(x,z,.43,.4);seat(x,z,.72,rot,g);return g;
  }
  function sofa(x: number,z: number,rot=0){
    const g=group(x,0,z,rot);
    box(1.15,.34,3.33,TRIM,0,.30,0,.06,g);box(.25,1.05,3.45,FABRIC,-.48,.94,0,.12,g);box(1.12,.3,3.14,FABRIC,.03,.64,0,.12,g);
    for(const dz of [-1.58,1.58])box(1.19,.6,.22,FABRIC,.02,.81,dz,.09,g);
    for(const dz of [-.90,.85]){const pillow=box(.23,.53,.59,dz<0?PEACH:CREAM,-.23,1.0,dz,.1,g);pillow.rotation.z=-.18;}
    const c=Math.cos(rot),sn=Math.sin(rot);obstacle(x,z,rot?3.46:1.2,rot?1.2:3.46);
    for(const dz of [-.85,.85])seat(x+.1*c+dz*sn,z-.1*sn+dz*c,.79,rot+Math.PI/2,g);
    return g;
  }
  function rug(x: number,z: number,rot=0){const g=group(x,0,z,rot);box(2.65,.022,3.63,'#d6a574',0,.062,0,.15,g);for(let i=0;i<8;i++)box(.018,.005,3.42,'#e8c697',-1.15+i*.33,.076,0,0,g);return g;}
  function coffeeTable(x: number,z: number,rot=0){
    const g=group(x,0,z,rot);box(.82,.13,1.46,OAK,0,.58,0,.13,g);for(const dz of [-.5,.5])for(const dx of [-.27,.27])box(.065,.5,.065,TRIM,dx,.29,dz,.015,g);
    obstacle(x,z,rot?1.5:.85,rot?.85:1.5);mug(.04,.66,-.35,C.white,g);book(0,.68,.25,.43,C.terra,g);g.updateWorldMatrix(true,false);const w=new THREE.Vector3(.2,.66,.62).applyMatrix4(g.matrixWorld);taskSpots.push(w);return g;
  }
  function bookcase(x: number,z: number,rot=0){
    const g=group(x,0,z,rot);box(.82,1.39,1.48,C.oak,0,.72,0,.04,g);
    for(const y of [.33,.82,1.30]){box(.05,.38,1.24,C.edge,.43,y,0,.005,g);for(let i=0;i<5;i++)box(.44,.28+(i%3)*.03,.13,[C.sage,C.cream,C.terra,C.gold,C.peach][i],-.1,y,-.47+i*.23,.01,g);}
    obstacle(x,z,rot?1.5:.85,rot?.85:1.5);return g;
  }
  function shelfWall(x: number,z: number,len: number){// tall bookshelf against the back wall
    box(len,2.45,.42,C.oak,x,1.22,z,.03);box(.06,2.3,.36,C.edge,x-len/2+.05,1.22,z+.02,.005);box(.06,2.3,.36,C.edge,x+len/2-.05,1.22,z+.02,.005);
    for(const y of [.42,.98,1.54,2.10]){box(len-.1,.05,.36,C.edge,x,y,z+.02,.005);
      for(let i=0;i<Math.floor((len-.3)/.24);i++){if((i*7+y*10)%5<1.5)continue;box(.16,.30+((i*3+y*4)%3)*.05,.22,[C.sage,C.cream,C.terra,C.gold,C.peach,C.dark][(i+Math.round(y*10))%6],x-len/2+.25+i*.24,y+.19,z+.06,.01);}}
    obstacle(x,z,len,.5);
  }
  function backWindow(x: number){// tall window in the back wall with the same soft landscape as the side one
    box(3.55,2.3,.12,C.edge,x,2.08,-HD+.09,.04);box(3.33,2.10,.08,'#bed1be',x,2.08,-HD+.175,.01);box(3.12,1.9,.025,windowGlow,x,2.1,-HD+.23,0);
    for(let i=0;i<3;i++)box(.065,2.17,.1,C.cream,x-1.6+i*1.6,2.08,-HD+.29,.008);box(3.25,.065,.1,C.cream,x,2.12,-HD+.30,.008);box(3.65,.13,.42,C.oak,x,.94,-HD+.28,.04);
    windowLight(x,2.1,-HD+.36,3.12,1.9,[x,1.1,-HD+4]);
  }
  function lamp(x: number,z: number){cyl(.22,.26,.03,C.dark,x,.02,z);cyl(.02,.02,1.7,C.edge,x,.87,z);cyl(.32,.42,.42,SHADE,x,1.75,z,root(),24);cyl(.3,.3,.02,LAMPGLOW,x,1.55,z);if(!previewing())pool(x,1.5,z,root());obstacle(x,z,.5,.5);}
  function squareTable(x: number,z: number){box(.9,.08,.9,OAK,x,1.0,z,.03);cyl(.07,.1,.95,TRIM,x,.5,z);cyl(.32,.36,.06,TRIM,x,.04,z);obstacle(x,z,.95,.95);shadow(x,z,.55,.5);taskSpot(x+.2,1.06,z-.22);}
  function armchair(x: number,z: number,rot: number){
    const g=group(x,0,z,rot);box(.95,.36,.95,C.edge,0,.24,0,.06,g);box(.9,.22,.85,C.terra,0,.5,0,.1,g);box(.95,.7,.24,C.terra,0,.78,-.36,.1,g);
    for(const dx of [-.42,.42])box(.14,.5,.9,C.terra,dx,.62,0,.06,g);const pillow=box(.4,.34,.14,C.cream,0,.72,-.24,.06,g);pillow.rotation.x=-.15;
    obstacle(x,z,1.0,1.0);shadow(x,z,.6,.55);seat(x,z,.66,rot,g);return g;
  }
  function cactus(x: number,z: number){
    cyl(.2,.16,.36,C.terra,x,.18,z);cyl(.19,.19,.03,C.soil,x,.36,z);
    cyl(.1,.12,.8,'#6f8f5a',x,.76,z);for(const [dx,h,y] of [[-.19,.36,.8],[.19,.3,.66]]){cyl(.06,.06,.2,'#6f8f5a',x+dx,y,z).rotation.z=Math.PI/2;cyl(.06,.05,h,'#6f8f5a',x+dx*1.45,y+h/2,z);}
    ball(.05,C.peach,x,1.2,z);obstacle(x,z,.55,.55);shadow(x,z,.3,.28);
  }
  function coffeeCorner(x: number,z: number){
    cyl(.38,.38,.06,C.oak,x,.72,z,root(),24);cyl(.05,.07,.66,C.edge,x,.36,z);cyl(.24,.3,.05,C.edge,x,.03,z);
    mug(x+.1,.75,z-.08,C.white,root(),true);cyl(.09,.07,.14,C.terra,x-.15,.82,z+.1);ball(.11,C.sage,x-.15,.94,z+.1,root(),1,.8,1);
    obstacle(x,z,.85,.85);shadow(x,z,.45,.4);taskSpot(x+.15,.75,z+.18);
  }
  function roundTable(x: number,z: number){
    cyl(.76,.76,.14,OAK,x,1.03,z,root(),32);cyl(.095,.14,.96,TRIM,x,.48,z);
    cyl(.4,.48,.10,TRIM,x,.07,z);shadow(x,z,.91,.8);obstacle(x,z,1.48,1.48);
    mug(x+.28,1.11,z-.12,C.white,root(),true);cyl(.16,.11,.24,C.terra,x-.29,1.21,z-.15);ball(.17,C.sage,x-.29,1.42,z-.15,root(),1,.9,1);
    book(x-.11,1.15,z+.30,.43,C.sage);taskSpot(x+.3,1.12,z+.3);
  }
  // A lamp's warm halo plus the soft circle it drops on the floor.
  function pool(x: number,y: number,z: number,parent: any,shadows=false){
    const p=new THREE.PointLight('#ffca80',11,6,2);p.position.set(x,y,z);parent.add(p);pendants.push(p);
    const s=new THREE.SpotLight('#ffb86b',26,y+2.6,1.0,.6,2);s.position.set(x,y,z);s.target.position.set(x,0,z);parent.add(s,s.target);
    if(shadows){s.castShadow=true;s.shadow.mapSize.set(512,512);s.shadow.bias=-.0009;s.shadow.normalBias=.03;}
    pendants.push(s);
  }
  function windowLight(x: number,y: number,z: number,w: number,h: number,lookAt: [number,number,number]){
    const l=new THREE.RectAreaLight('#eaf1ff',3.6,w,h);l.position.set(x,y,z);l.lookAt(...lookAt);scene.add(l);windows.push(l);
  }
  return {label,plant,mug,book,chair,sofa,rug,coffeeTable,bookcase,shelfWall,backWindow,lamp,squareTable,armchair,cactus,coffeeCorner,roundTable,pool,windowLight,OAK,TRIM,SHADE,BULB,windowGlow};
}
