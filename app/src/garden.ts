import { C } from './primitives.ts';
import type { DecorContext, createDecor } from './decor.ts';

const GLASS='#dbe7d8',NEAR='#7a9a68',FAR='#5f7f52',WOOD='#d9c7a3';
// The Café-jardin: a bright veranda. Glazing on the back and left walls, hanging pots, sage benches
// and a plant bar. Returns the hook `toggleLight` calls so the glass and the garden behind it go dark at dusk.
export function buildGarden(d: ReturnType<typeof createDecor>,ctx: DecorContext,{W,D,HW,HD}: {W: number;D: number;HW: number;HD: number}){
  const {mat,box,cyl,ball}=ctx.p;
  const {label,plant,mug,book,chair,squareTable,roundTable,pool,windowLight}=d;
  const {obstacle,seat,taskSpot,hotspot,shadow}=ctx;
  const root=()=>ctx.root();
  const glass=mat(GLASS,{transparent:true,opacity:.55,depthWrite:false,roughness:.3,emissive:GLASS,emissiveIntensity:.12});
  const near=mat(NEAR,{roughness:1}),far=mat(FAR,{roughness:1});
  const flat=(m: any)=>{m.castShadow=false;return m;};

  // --- Glazing: light timber mullions every 2 m, a kick panel below the sill, a transom above. ---
  const bz=-HD+.06,bx=-HW+.06;
  box(W+.3,.16,.26,C.oak,0,.92,bz,.03);box(W+.3,.12,.22,C.oak,0,3.06,bz,.03);
  box(.26,.16,D+.3,C.oak,bx,.92,0,.03);box(.22,.12,D+.3,C.oak,bx,3.06,0,.03);
  for(let i=0;i<=W/2;i++)box(.13,3.8,.24,C.oak,-HW+i*2,1.95,bz,.02);
  for(let i=0;i<=D/2;i++)box(.24,3.8,.13,C.oak,bx,1.95,-HD+i*2,.02);
  for(let i=0;i<W/2;i++){const x=-HW+1+i*2;
    box(1.9,.7,.14,WOOD,x,.49,bz,.02);flat(box(1.9,2.06,.05,glass,x,1.99,bz,0));flat(box(1.9,.62,.05,glass,x,3.44,bz,0));}
  for(let i=0;i<D/2;i++){const z=-HD+1+i*2;
    box(.14,.7,1.9,WOOD,bx,.49,z,.02);flat(box(.05,2.06,1.9,glass,bx,1.99,z,0));flat(box(.05,.62,1.9,glass,bx,3.44,z,0));}
  // --- The garden outside: two curtains of foliage at different depths, never in the shadow map. ---
  flat(box(W+1.4,4.3,.08,near,-.6,2.1,-HD-.7,0));flat(box(W+2.6,5.0,.08,far,-1.2,2.4,-HD-1.3,0));
  flat(box(.08,4.3,D+1.4,near,-HW-.7,2.1,.6,0));flat(box(.08,5.0,D+2.6,far,-HW-1.3,2.4,1.2,0));
  for(let i=0;i<9;i++){flat(ball(.8+(i%3)*.22,near,-HW+1.5+i*2.6,1.6+(i%2)*.45,-HD-1,root(),1,.8,1));
    flat(ball(.8+(i%3)*.22,far,-HW-1,1.6+(i%2)*.45,-HD+1.5+i*2.4,root(),1,.8,1));}
  windowLight(-5,2.1,-HD+.32,6,2.2,[-5,1.1,-HD+4]);windowLight(5,2.1,-HD+.32,6,2.2,[5,1.1,-HD+4]);
  windowLight(-HW+.32,2.1,0,8,2.2,[-HW+4,1.1,0]);

  // --- Hanging pots. Foliage stops at 2.4 m, well above a head at 2.1, and never over a seat. ---
  function hanging(x: number,z: number,size=1){
    for(const dx of [-.14,.14])cyl(.012,.012,1.0,C.edge,x+dx,3.55,z);
    cyl(.30*size,.23*size,.34*size,C.terra,x,3.0,z);cyl(.285*size,.285*size,.03,C.soil,x,3.17,z);
    for(let i=0;i<7;i++){const a=i*2.4,r=.24*size;
      const leaf=ball(.19*size,i%2?C.sage:NEAR,x+Math.sin(a)*r,2.86-(i%3)*.09,z+Math.cos(a)*r,root(),.9,1.5,.55);leaf.rotation.set(0,a,Math.cos(a)*.6);}
    for(const [dx,dz] of [[-.19,.09],[.17,-.13],[.04,.2]])box(.06,.42,.06,FAR,x+dx,2.6,z+dz,.02);
  }
  for(const z of [-8.6,-3.2,3.2,8.6])hanging(-11.3,z,1);
  for(const x of [-8.5,-4,.5])hanging(x,-9.25,.9);
  // Two mullions wear a climbing plant from the skirting to the transom.
  for(const [x,z,along] of [[4,bz,'x'],[bx,-6,'z']] as [number,number,string][])
    for(let i=0;i<16;i++){const y=.3+i*.19,a=i*1.9,o=Math.sin(a)*.15;
      ball(.08+(i%3)*.02,i%2?FAR:'#4f6b45',x+(along==='x'?o:.1),y,z+(along==='x'?.1:o),root(),1,.85,1);}

  // --- Sage benches along the left glazing, each with its own table and a chair opposite. ---
  function bench(z: number){
    const x=-HW+.9;
    box(1.0,.46,2.7,C.edge,x,.23,z,.06);const cushion=box(.96,.2,2.6,C.sage,x,.6,z,.09);
    box(.22,.8,2.6,C.sage,x-.45,1.03,z,.1);
    for(const dz of [-1.29,1.29])box(1.0,.58,.2,C.sage,x,.86,z+dz,.08);
    for(const dz of [-.7,.7]){const p=box(.2,.5,.55,dz<0?C.cream:'#e7d3ad',x-.31,1.0,z+dz,.09);p.rotation.z=-.16;}
    obstacle(x,z,1.05,2.8);shadow(x,z,.6,1.5);for(const dz of [-.68,.68])seat(x,z+dz,.72,Math.PI/2,cushion);
  }
  for(const z of [-6.5,0,6.5]){bench(z);squareTable(-9.9,z);chair(-8.85,z,-Math.PI/2,z===0?C.cream:C.sage);
    mug(-10.05,1.05,z-.2,C.white,root(),z===0);book(-9.75,1.05,z+.22,.34,C.sage);}

  // --- Four round tables down the middle. ---
  for(const [x,z] of [[-5.5,-6],[-5.5,4],[-1,-1],[-1.5,8]]){
    roundTable(x,z);chair(x-1.1,z,Math.PI/2,C.cream);chair(x+1.1,z,-Math.PI/2,C.sage);}
  // --- The communal table. ---
  box(4.4,.16,1.4,WOOD,6.5,1.05,2.5,.09);for(const x of [5,6.5,8])taskSpot(x,1.14,2.25);
  for(const x of [4.5,8.5])for(const z of [1.95,3.05])box(.1,.98,.1,C.edge,x,.52,z,.02);
  obstacle(6.5,2.5,4.45,1.45);shadow(6.5,2.5,2.3,.9);
  for(const x of [5.1,6.5,7.9]){chair(x,1.35,0,x===6.5?C.cream:C.sage);chair(x,3.65,Math.PI,x===6.5?C.sage:C.cream);}
  mug(5.2,1.15,2.2,C.terra,root(),true);mug(7.8,1.15,2.8,C.sage);book(6.4,1.17,2.85,.46,C.sage);
  cyl(.16,.11,.24,C.terra,6.6,1.25,2.2);ball(.17,C.sage,6.6,1.46,2.2,root(),1,.9,1);
  // --- Reading corner, front right. ---
  for(const [z,rot] of [[-5.2,Math.PI/4],[-2.8,Math.PI*.75]]){
    chair(9.3,z,rot,C.cream);const p=ball(.3,C.peach,9.3,.78,z,root(),1,.25,1);p.castShadow=false;}
  squareTable(10.5,-4);book(10.55,1.06,-4.15,.4,C.terra);

  // --- The plant bar, at the back on the right. ---
  hotspot(box(5,1.0,1.0,WOOD,7.2,.5,-8.2,.06),'tasks','Passer commande','tes tâches du jour');
  box(5.3,.13,1.2,C.cream,7.2,1.07,-8.2,.04);obstacle(7.2,-8.2,5.1,1.1);shadow(7.2,-8.2,2.6,.6);
  for(let i=0;i<8;i++)box(.09,.76,.05,C.oak,5.0+i*.63,.5,-7.69,.01);
  for(let i=0;i<5;i++){const x=5.3+i*.95;cyl(.17,.13,.26,i%2?C.terra:C.cream,x,1.26,-8.2);ball(.2,i%2?C.sage:NEAR,x,1.5,-8.2,root(),1,.8,1);}
  cyl(.19,.21,.32,'#9fb3a5',9.4,1.29,-8.35);const spout=cyl(.03,.03,.5,'#9fb3a5',9.7,1.4,-8.35);spout.rotation.z=-.85;
  box(.55,.62,.4,'#6b543c',9.9,.31,-9.1,.07);obstacle(9.9,-9.1,.6,.45);
  // Pot shelf: the shop. An open light-wood rack, its pots facing into the room.
  hotspot(box(1.6,2.2,.16,WOOD,10.9,1.1,-6.35,.03),'shop','La boutique','chapeaux, mobilier et sets');
  for(const dx of [-.78,.78])box(.12,2.2,.5,WOOD,10.9+dx,1.1,-6.05,.03);
  for(const y of [.5,1.1,1.7]){box(1.5,.07,.5,C.oak,10.9,y,-6.05,.01);
    for(let i=0;i<4;i++){const x=10.35+i*.37;cyl(.12,.09,.19,[C.terra,C.cream,C.sage,C.gold][i],x,y+.13,-6.07);ball(.13,i%2?NEAR:C.sage,x,y+.3,-6.07,root(),1,.8,1);}}
  obstacle(10.9,-6.15,1.7,.8);shadow(10.9,-6.15,1.0,.5);
  // The sign, on a light wood panel above the plant bar.
  box(2.5,1.4,.14,WOOD,7.2,2.6,-9.72,.04);
  label('respirer,\npousser,\nrecommencer',2.2,1.15,7.2,2.6,-9.64,{bg:C.sage,color:C.cream,size:120});

  // --- Potted plants, the welcome mat and four hanging lanterns. ---
  for(const [x,z,s] of [[-7.6,-9,1.3],[2.5,-9,1.15],[11,8.5,1.35],[-11.3,-9.2,1.1]]){plant(x,z,s);obstacle(x,z,.75,.75);shadow(x,z,.5,.45);}
  box(1.5,.022,.68,C.sage,8.5,.061,9.4,.08);
  for(const [x,z,cast] of [[-9.9,0,0],[-5.5,-6,1],[-5.5,4,0],[6.5,2.5,1]]){
    cyl(.014,.014,.9,C.edge,x,3.45,z);cyl(.2,.38,.4,mat('#e2c9a4',{roughness:.5}),x,2.9,z,root(),8);
    cyl(.34,.34,.025,mat('#ffeac0',{emissive:'#ffd9a0',emissiveIntensity:.8}),x,2.72,z);pool(x,2.6,z,root(),!!cast);}

  return (evening: boolean)=>{// dusk: the glazing tints and the garden behind it falls into shade
    glass.opacity=evening?.35:.55;glass.color.set(evening?'#1f2a2e':GLASS);glass.emissive.set(evening?'#1f2a2e':GLASS);glass.emissiveIntensity=evening?.05:.12;
    near.color.set(evening?'#33452f':NEAR);far.color.set(evening?'#26331f':FAR);
  };
}
