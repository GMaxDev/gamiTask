import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createNavigator } from './navigation.js';

const C={cream:'#f4e4c9',wood:'#bd8356',edge:'#905e3d',oak:'#d9aa72',sage:'#819478',dark:'#384d43',terra:'#c9764f',peach:'#e5a27a',white:'#fff4df',gold:'#d2a754',soil:'#594438'};

export function createCafe(container, onState) {
  const scene=new THREE.Scene();
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  renderer.domElement.setAttribute('aria-label','Café en 3D : cliquer au sol pour marcher, glisser pour déplacer la vue, molette pour zoomer');
  renderer.domElement.tabIndex=0;container.append(renderer.domElement);
  const camera=new THREE.OrthographicCamera(-10,10,10,-10,.1,100);
  const materials=new Map(), obstacles=[], steam=[], pendants=[], seats=[];
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function mat(color,extra={}){if(Object.keys(extra).length)return new THREE.MeshStandardMaterial({color,roughness:.82,...extra});if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.82}));return materials.get(color);}
  function mesh(geo,color,x,y,z,parent=scene,extra={}){const m=new THREE.Mesh(geo,typeof color==='string'?mat(color,extra):color);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  function box(w,h,d,color,x,y,z,r=.04,parent=scene){return mesh(r?new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/3,h/3,d/3)):new THREE.BoxGeometry(w,h,d),color,x,y,z,parent);}
  function cyl(rt,rb,h,color,x,y,z,parent=scene,n=16){return mesh(new THREE.CylinderGeometry(rt,rb,h,n),color,x,y,z,parent);}
  function ball(r,color,x,y,z,parent=scene,sx=1,sy=1,sz=1){const m=mesh(new THREE.SphereGeometry(r,12,8),color,x,y,z,parent);m.scale.set(sx,sy,sz);return m;}
  function group(x,y,z,rot=0){const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=rot;scene.add(g);return g;}
  function obstacle(x,z,w,d){obstacles.push({x,z,w,d});}
  // A seat: world position, cushion height, the direction it faces and the mesh that catches the click.
  function seat(x,z,y,rot,object){seats.push({x,z,y,rot,object});}
  function shadow(x,z,sx,sz,opacity=.12){const m=mesh(new THREE.CircleGeometry(1,32),new THREE.MeshBasicMaterial({color:'#694a30',transparent:true,opacity,depthWrite:false}),x,.018,z);m.rotation.x=-Math.PI/2;m.scale.set(sx,sz,1);m.castShadow=false;}
  function label(text,w,h,x,y,z,opts={}){
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=Math.round(1024*h/w);
    const ctx=canvas.getContext('2d');ctx.fillStyle=opts.bg||C.dark;ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=opts.color||C.cream;
    const lines=text.split('\n');const size=opts.size||Math.min(130,canvas.height/(lines.length+1));
    lines.forEach((line,i)=>{ctx.font=`${i===0?'600':'400'} ${i===0?size:size*.63}px ${opts.font||'Georgia'}`;ctx.fillText(line,512,canvas.height/2+(i-(lines.length-1)/2)*size*1.27);});
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
    const m=mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:texture,roughness:1}),x,y,z);m.castShadow=false;
    if(opts.ry)m.rotation.y=opts.ry;return m;
  }
  function plant(x,z,size=1,y=0,parent=scene){
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
  function mug(x,y,z,color=C.white,parent=scene,steaming=false){
    cyl(.11,.085,.18,color,x,y+.09,z,parent);
    cyl(.087,.087,.008,'#64452e',x,y+.185,z,parent);
    const h=mesh(new THREE.TorusGeometry(.07,.022,6,12),color,x+.12,y+.10,z,parent);h.rotation.y=.3;
    cyl(.16,.16,.025,color,x,y+.01,z,parent);
    if(steaming)for(let i=0;i<3;i++){
      const puff=ball(.035,new THREE.MeshBasicMaterial({color:'#fff9e9',transparent:true,opacity:.32,depthWrite:false}),x,y+.35,z,parent,.8,1.7,.8);
      steam.push({puff,baseY:y+.23,phase:i/3,x,z});
    }
  }
  function book(x,y,z,w=.36,color=C.sage,parent=scene){box(w,.065,.3,color,x,y,z,.014,parent);box(w-.025,.033,.29,C.cream,x,y+.003,z+.009,.002,parent);}
  function chair(x,z,rot=0,color=C.sage){
    const g=group(x,0,z,rot);box(.66,.14,.66,color,0,.65,0,.08,g);box(.66,.56,.13,color,0,.98,-.29,.09,g);
    for(const a of [-1,1])for(const b of [-1,1])box(.065,.61,.065,C.edge,a*.23,.31,b*.22,.014,g);
    obstacle(x,z,.65,.65);shadow(x,z,.43,.4);seat(x,z,.72,rot,g);return g;
  }
  function roundTable(x,z){
    cyl(.76,.76,.14,C.oak,x,1.03,z,scene,32);cyl(.095,.14,.96,C.edge,x,.48,z);
    cyl(.4,.48,.10,C.edge,x,.07,z);shadow(x,z,.91,.8);obstacle(x,z,1.48,1.48);
    mug(x+.28,1.11,z-.12,C.white,scene,true);cyl(.16,.11,.24,C.terra,x-.29,1.21,z-.15);ball(.17,C.sage,x-.29,1.42,z-.15,scene,1,.9,1);
    book(x-.11,1.15,z+.30,.43,C.sage);
  }

  scene.add(new THREE.HemisphereLight('#fff5dc','#b3bca4',2.6));
  const sun=new THREE.DirectionalLight('#ffe0ae',3.2);sun.position.set(-3,10,5);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-10,right:10,top:10,bottom:-10,near:.5,far:35});sun.shadow.normalBias=.035;sun.shadow.bias=-.00015;sun.shadow.radius=4;scene.add(sun);
  const fill=new THREE.DirectionalLight('#f9f4e8',1.1);fill.position.set(9,6,-3);scene.add(fill);
  // A freestanding diorama; the front and right sides remain open.
  box(12.35,.38,10.35,C.edge,0,-.24,0,.12);
  box(12.25,.20,10.25,C.oak,0,-.05,0,.08);
  for(let iz=0;iz<10;iz++)for(let ix=0;ix<12;ix++) {
    const colors=['#d7b48d','#d9b892','#d4ae87','#debc97'];
    box(.98,.045,.98,colors[(ix*3+iz*7)%4],ix-5.5,.025,iz-4.5,.015);
  }
  box(12.28,3.85,.20,C.cream,0,1.93,-5.07,.035);
  box(.20,3.85,10.28,'#ecd8b8',-6.07,1.93,0,.035);
  box(12.42,.18,.34,C.oak,0,3.91,-5.07,.035);
  box(.34,.18,10.45,C.oak,-6.07,3.91,0,.035);
  box(12.1,.15,.08,C.edge,0,.17,-4.94,.01);
  box(.08,.15,10.1,C.edge,-5.94,.17,0,.01);
  // Terracotta backsplash made from actual staggered brick geometry.
  for(let row=0;row<6;row++)for(let col=0;col<20;col++){
    let x=-5.75+col*.59+(row%2)*.28;if(x>5.8)continue;
    box(.555,.235,.045,['#c78962','#d59a73','#cc8e68'][(col+row)%3],x,1.47+row*.26,-4.938,.014);
  }
  // Tall sage window on the left wall, with a soft landscape behind its panes.
  box(.12,2.3,3.55,C.edge,-5.91,2.08,-1.7,.04);
  box(.08,2.10,3.33,'#bed1be',-5.825,2.08,-1.7,.01);
  const windowGlow=mat('#cdd9ba',{emissive:'#b7c797',emissiveIntensity:.19});
  box(.025,1.9,3.12,windowGlow,-5.77,2.1,-1.7,.0);
  for(let i=0;i<3;i++)box(.1,2.17,.065,C.cream,-5.71,2.08,-3.3+i*1.6,.008);
  box(.1,.065,3.25,C.cream,-5.70,2.12,-1.7,.008);
  box(.42,.13,3.65,C.oak,-5.72,.94,-1.7,.04);
  plant(-5.63,-2.85,.48,1.02);plant(-5.63,-.6,.56,1.02);
  // A low wall panel with vertical timber slats behind the sofa.
  box(.10,1.0,3.8,C.sage,-5.91,.6,2.75,.02);
  for(let i=0;i<16;i++)box(.06,.91,.042,'#6f846b',-5.82,.59,.94+i*.235,.01);
  label('slow mornings',2.1,.62,-5.79,2.95,2.7,{ry:Math.PI/2,bg:'#ecd8b8',color:C.edge,size:145});
  // Counter with a fluted front and a cream stone top.
  box(7.1,1.18,1.40,C.wood,.85,.66,-3.42,.08);obstacle(.85,-3.42,7.15,1.45);
  for(let i=0;i<36;i++)box(.075,1.04,.045,C.oak,-2.55+i*.195,.65,-2.691,.01);
  box(7.34,.18,1.58,C.cream,.85,1.30,-3.42,.05);
  box(7.0,.08,.12,C.edge,.85,.16,-2.66,.015);
  // Back worktop and overhead shelves.
  box(5.3,.95,.6,C.oak,.5,.6,-4.52,.02);box(5.5,.1,.8,C.white,.5,1.12,-4.48,.02);
  for(let x=-2;x<3.2;x+=1.05){box(.025,.75,.025,C.edge,x,.62,-4.205,.003);box(.23,.035,.05,C.edge,x+.43,.88,-4.18,.007);}
  for(const y of [2.22,2.90]){
    box(2.20,.11,.45,C.oak,3.78,y,-4.70,.02);
    for(let i=0;i<5;i++){
      if(y>2.5){box(.23,.35+(i%2)*.07,.2,[C.terra,C.sage,C.gold,C.peach,C.cream][i],2.98+i*.38,y+.24,-4.66,.015);box(.17,.10,.015,C.cream,2.98+i*.38,y+.24,-4.547,.002);}
      else mug(3.04+i*.34,y+.07,-4.63,i%2?C.sage:C.white);
    }
  }
  // Espresso machine with two groups, a drip tray and stacked cups.
  box(1.42,.75,.64,C.terra,-1.40,1.77,-3.57,.09);
  box(1.18,.39,.065,'#c4bbaa',-1.40,1.69,-3.22,.01);
  box(1.47,.07,.82,C.edge,-1.40,1.44,-3.47,.015);
  for(const x of [-1.76,-1.10]){
    cyl(.08,.08,.12,'#454b43',x,1.71,-3.10);box(.08,.06,.25,C.dark,x,1.73,-2.99,.02);
    mug(x,1.49,-3.23);ball(.035,'#93b98a',x,1.93,-3.235);
  }
  for(let i=0;i<4;i++)mug(-1.86+i*.30,2.15,-3.58,C.white);
  // Coffee grinder.
  box(.40,.41,.44,C.dark,-.28,1.62,-3.62,.035);cyl(.19,.14,.36,'#946844',-.28,2.0,-3.62);cyl(.21,.21,.045,C.dark,-.28,2.2,-3.62);
  // Pastry display: a transparent hood, timber frame and individual pastries.
  box(2.10,.10,.92,C.oak,2.49,1.43,-3.30,.04);
  const glass=mat('#e6f4ed',{transparent:true,opacity:.18,roughness:.12,metalness:.05,depthWrite:false});
  box(2.05,.68,.87,glass,2.49,1.81,-3.30,.025);
  for(const x of [1.46,3.52])for(const z of [-3.73,-2.87])box(.045,.77,.045,C.gold,x,1.83,z,.007);
  box(2.16,.055,.99,C.oak,2.49,2.23,-3.30,.02);
  for(let i=0;i<3;i++)for(let j=0;j<2;j++){
    const x=1.82+i*.62,z=-3.53+j*.43;cyl(.22,.22,.028,C.white,x,1.51,z);
    if(i===1){cyl(.145,.145,.17,'#965c3b',x,1.60,z);cyl(.148,.148,.035,'#eed8b5',x,1.70,z);ball(.035,C.terra,x,1.75,z);}
    else {const croissant=mesh(new THREE.TorusGeometry(.12,.063,7,10,Math.PI*1.4),i===0?'#d29a50':'#ba7847',x,1.59,z);croissant.rotation.x=Math.PI/2;}
  }
  mug(.55,1.40,-3.1,C.sage,scene,true);plant(4.09,-3.48,.52,1.4);
  // Menus: textures are only used for lettering; every object remains 3D.
  box(1.40,1.51,.09,C.edge,-1.45,2.99,-4.85,.02);
  label('LE MENU\nEspresso     2,5\nCappuccino     4\nMatcha latte     4,5\nUn peu de douceur',1.25,1.36,-1.45,2.99,-4.796,{size:111});
  box(1.12,1.51,.09,C.edge,.12,2.99,-4.85,.02);
  label('fait maison\n& avec amour\n—\ncookies • cakes\ncroissants',.98,1.36,.12,2.99,-4.796,{bg:C.terra,size:130});
  label('CAFÉ PETIT JOUR',3.9,.53,1.2,3.57,-4.945,{bg:C.cream,color:C.edge,size:115});
  // Hanging plant at the counter corner.
  plant(-4.7,-4.43,.80,2.17);for(let i=0;i<4;i++)ball(.16,C.sage,-4.43+i*.04,2.55-i*.20,-4.30,scene,.8,1.2,.7);
  for(const x of [-4.85,-4.57])cyl(.012,.012,1.1,C.edge,x,3.11,-4.43);
  // Sofa, two pillows and a woven rug.
  const sofa=group(-4.92,0,2.28);
  box(1.15,.34,3.33,C.edge,0,.30,0,.06,sofa);
  box(.25,1.05,3.45,C.sage,-.48,.94,0,.12,sofa);
  box(1.12,.3,3.14,C.sage,.03,.64,0,.12,sofa);
  for(const z of [-1.58,1.58])box(1.19,.6,.22,C.sage,.02,.81,z,.09,sofa);
  for(const z of [-.90,.85]){const pillow=box(.23,.53,.59,z<0?C.peach:C.cream,-.23,1.0,z,.1,sofa);pillow.rotation.z=-.18;}
  obstacle(-4.92,2.28,1.2,3.46);shadow(-4.86,2.3,.9,1.85);for(const z of [-.85,.85])seat(-4.82,2.28+z,.79,Math.PI/2,sofa);
  const rug=box(2.65,.022,3.63,'#d6a574',-3.17,.062,2.25,.15);for(let i=0;i<8;i++)box(.018,.005,3.42,'#e8c697',-4.32+i*.33,.076,2.25,0);
  // Coffee table and an open book.
  box(.82,.13,1.46,C.oak,-3.55,.58,2.3,.13);for(const z of [1.80,2.80])for(const x of [-3.82,-3.28])box(.065,.5,.065,C.edge,x,.29,z,.015);
  obstacle(-3.55,2.3,.85,1.5);mug(-3.51,.66,1.95,C.white);book(-3.55,.68,2.55,.43,C.terra);
  // Two café tables, plus a shared desk with a laptop.
  roundTable(-1.3,-.1);chair(-2.42,-.1,Math.PI/2,C.terra);chair(-.19,-.1,-Math.PI/2,C.sage);
  roundTable(.30,3.02);chair(-.78,3.15,Math.PI/2,C.sage);chair(1.4,3.02,-Math.PI/2,C.terra);
  box(1.6,.16,2.45,C.oak,3.81,1.05,.46,.09);
  for(const x of [3.22,4.40])for(const z of [-.50,1.42])box(.10,.98,.10,C.edge,x,.52,z,.02);
  obstacle(3.81,.46,1.64,2.5);shadow(3.81,.46,1.0,1.45);
  chair(2.49,-.21,Math.PI/2,C.terra);chair(2.49,1.17,Math.PI/2,C.sage);
  chair(5.03,-.21,-Math.PI/2,C.sage);chair(5.03,1.17,-Math.PI/2,C.terra);
  const laptop=group(3.60,1.16,-.15,Math.PI/2);
  box(.65,.035,.46,'#c2baa8',0,0,0,.025,laptop);
  const screen=box(.65,.43,.035,C.dark,0,.215,-.21,.025,laptop);screen.rotation.x=-.18;
  const display=box(.57,.34,.01,'#c0d1b5',0,.215,-.184,.012,laptop);display.rotation.x=-.18;
  book(3.71,1.17,.96,.46,C.sage);mug(4.18,1.15,.67,C.terra,scene,true);plant(4.10,-.37,.4,1.15);
  // Entrance plants and a small bookcase to complete the open edges.
  plant(5.05,3.91,1.45);obstacle(5.05,3.91,.75,.75);shadow(5.05,3.91,.52,.47);
  plant(-4.65,-2.90,1.4);obstacle(-4.65,-2.90,.78,.78);
  box(.82,1.39,1.48,C.oak,5.30,-0.03+.75,-3.96,.04);obstacle(5.3,-3.96,.85,1.5);
  for(const y of [.33,.82,1.30]){
    box(.05,.38,1.24,C.edge,5.73,y,-3.96,.005);
    for(let i=0;i<5;i++){const b=box(.44,.28+(i%3)*.03,.13,[C.sage,C.cream,C.terra,C.gold,C.peach][i],5.20,y,-4.43+i*.23,.01);}
  }
  plant(5.23,-3.95,.65,1.43);
  // Two pendant lamps. Fine cords preserve the low-poly silhouette.
  for(const x of [-1.3,3.7]){
    cyl(.014,.014,.9,C.edge,x,3.45,.2);
    cyl(.18,.43,.32,C.terra,x,2.92,.2,scene,24);
    cyl(.39,.39,.025,mat('#ffeac0',{emissive:'#ffd595',emissiveIntensity:.8}),x,2.765,.2);
    const light=new THREE.PointLight('#ffca80',2,5,2);light.position.set(x,2.6,.2);scene.add(light);pendants.push(light);
  }
  // Little welcome mat at the open entrance.
  box(1.5,.022,.68,C.sage,3.08,.061,4.47,.08);

  const avatar=group(.15,.08,1.3);const body=new THREE.Group();avatar.add(body);
  // Legs pivot at the hip so they swing while walking and fold when sitting.
  const legL=new THREE.Group(),legR=new THREE.Group();legL.position.set(-.14,.47,0);legR.position.set(.14,.47,0);body.add(legL,legR);
  for(const leg of [legL,legR]){box(.19,.39,.22,C.cream,0,-.2,0,.07,leg);box(.22,.12,.32,C.edge,0,-.37,.045,.04,leg);}
  box(.58,.53,.36,C.sage,0,.69,0,.15,body);
  const armL=box(.17,.43,.21,C.sage,-.36,.65,0,.07,body),armR=box(.17,.43,.21,C.sage,.36,.65,0,.07,body);
  ball(.095,'#ebbf97',-.36,.43,0,body);ball(.095,'#ebbf97',.36,.43,0,body);
  ball(.31,'#edc39d',0,1.21,0,body,1,1.1,.91);
  const hair=ball(.32,'#634535',0,1.34,-.045,body,1.04,.85,.98);
  ball(.14,'#634535',-.20,1.38,.17,body);ball(.13,'#634535',.02,1.44,.19,body);
  for(const x of [-.11,.11])ball(.023,C.dark,x,1.20,.258,body,1,1.2,.6);
  ball(.046,'#d89479',-.20,1.12,.223,body,1,.45,.3);ball(.046,'#d89479',.20,1.12,.223,body,1,.45,.3);
  const headphones=mesh(new THREE.TorusGeometry(.335,.035,6,16,Math.PI),C.cream,0,1.27,0,body);headphones.rotation.z=0;
  for(const x of [-.33,.33])ball(.1,C.cream,x,1.23,0,body,.48,1.2,.9);
  const ring=mesh(new THREE.RingGeometry(.39,.43,40),new THREE.MeshBasicMaterial({color:C.white,transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false}),0,.004,0,avatar);ring.rotation.x=-Math.PI/2;
  const marker=mesh(new THREE.RingGeometry(.13,.19,32),new THREE.MeshBasicMaterial({color:'#fff5dc',transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}),0,.085,0);marker.rotation.x=-Math.PI/2;marker.castShadow=false;

  const navigation=createNavigator(obstacles);let route=[],time=0,zoom=1,follow=true,dragging=false,dragStart=null,moved=false;
  let pendingSeat=null,seated=null,standPoint=null,sitBlend=0,glowing=null,glowTime=0;
  // Slow pulse on the selected seat. Materials are shared per colour, so each mesh gets a private clone while it glows.
  function glow(object){
    glowing?.traverse(o=>{if(o.userData.mat){o.material.dispose();o.material=o.userData.mat;delete o.userData.mat;}});
    glowing=object;glowTime=0;
    object?.traverse(o=>{if(o.isMesh){o.userData.mat=o.material;o.material=o.material.clone();o.material.emissive.set('#ffd595');}});
  }
  const camTarget=new THREE.Vector3(0,.85,0),pan=new THREE.Vector3(),cameraOffset=new THREE.Vector3(13,12.5,16);
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),floor=new THREE.Plane(new THREE.Vector3(0,1,0),-.08);
  let width=1,height=1;
  function resize(){width=container.clientWidth;height=container.clientHeight;renderer.setSize(width,height);const aspect=width/height,span=Math.max(8.4,10.6/aspect);camera.left=-span*aspect;camera.right=span*aspect;camera.top=span;camera.bottom=-span;camera.updateProjectionMatrix();}
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  function setZoom(value){zoom=THREE.MathUtils.clamp(value,.72,1.85);camera.zoom=zoom;camera.updateProjectionMatrix();onState?.({zoom,follow});}
  function recenter(){follow=true;pan.set(0,0,0);setZoom(1);onState?.({zoom,follow});}
  function setFollow(){follow=!follow;if(follow)pan.set(0,0,0);onState?.({zoom,follow});}
  function point(e){const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/width*2-1,-(e.clientY-rect.top)/height*2+1);ray.setFromCamera(pointer,camera);const out=new THREE.Vector3();return ray.ray.intersectPlane(floor,out)?out:null;}
  function standUp(){if(!seated)return;avatar.position.set(standPoint.x,.08,standPoint.z);seated=null;sitBlend=0;onState?.({seated:false});}
  function moveTo(p){
    if(!p||p.x<-6||p.x>6||p.z<-5||p.z>5)return;
    const next=navigation.path(seated?standPoint:avatar.position,p);if(!next.length)return;standUp();route=next;pendingSeat=null;glow(null);
    const end=route.at(-1);marker.position.set(end.x,.085,end.z);marker.material.opacity=.9;
    onState?.({walking:true});
  }
  renderer.domElement.addEventListener('pointerdown',e=>{if(e.button>1)return;dragStart={x:e.clientX,y:e.clientY,pan:pan.clone()};dragging=true;moved=false;try{renderer.domElement.setPointerCapture(e.pointerId);}catch{}});
  renderer.domElement.addEventListener('pointermove',e=>{
    if(!dragging)return;const dx=e.clientX-dragStart.x,dy=e.clientY-dragStart.y;
    if(Math.hypot(dx,dy)>5)moved=true;
    if(moved){if(follow){pan.copy(camTarget).sub(new THREE.Vector3(0,.85,0));dragStart.pan.copy(pan);follow=false;onState?.({zoom,follow});}
      const factor=(camera.top-camera.bottom)/height/zoom;
      pan.copy(dragStart.pan).add(new THREE.Vector3(-.776*dx-.84*dy,0,.631*dx-1.03*dy).multiplyScalar(factor));
      pan.x=THREE.MathUtils.clamp(pan.x,-6,6);pan.z=THREE.MathUtils.clamp(pan.z,-5,5);
    }
  });
  function seatAt(){const hit=ray.intersectObjects(seats.map(s=>s.object),true)[0];if(!hit)return null;const near=seats.filter(s=>s.object===hit.object.parent);return near.sort((a,b)=>Math.hypot(a.x-hit.point.x,a.z-hit.point.z)-Math.hypot(b.x-hit.point.x,b.z-hit.point.z))[0]||null;}
  renderer.domElement.addEventListener('pointerup',e=>{
    if(dragging&&!moved&&e.button===0){const p=point(e),target=seatAt();if(target&&target!==seated){moveTo(target);if(route.length){pendingSeat=target;marker.material.opacity=0;glow(target.object);}}else if(!target)moveTo(p);}
    dragging=false;
  });
  renderer.domElement.addEventListener('pointercancel',()=>{dragging=false;});
  renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();setZoom(zoom*Math.exp(-e.deltaY*.001));},{passive:false});
  renderer.domElement.addEventListener('keydown',e=>{
    const moves={ArrowUp:[0,-.75],ArrowDown:[0,.75],ArrowLeft:[-.75,0],ArrowRight:[.75,0]};
    if(moves[e.key]){e.preventDefault();const [x,z]=moves[e.key];moveTo({x:avatar.position.x+x,z:avatar.position.z+z});}
  });
  let evening=false;
  function toggleLight(){evening=!evening;sun.intensity=evening?1.1:3.2;fill.intensity=evening?.6:1.1;sun.color.set(evening?'#ffa26e':'#ffe0ae');pendants.forEach(l=>l.intensity=evening?5:2);return evening;}
  let previous=performance.now(),raf;
  function animate(now){
    const dt=Math.min((now-previous)/1000,.05);previous=now;time+=dt;
    let walking=route.length>0;
    if(walking){const p=route[0],dx=p.x-avatar.position.x,dz=p.z-avatar.position.z,d=Math.hypot(dx,dz),speed=2.4*dt;
      if(d<=speed){avatar.position.x=p.x;avatar.position.z=p.z;route.shift();if(!route.length){onState?.({walking:false});if(pendingSeat){seated=pendingSeat;pendingSeat=null;standPoint={x:p.x,z:p.z};glow(null);onState?.({seated:true});}}}
      else{avatar.position.x+=dx/d*speed;avatar.position.z+=dz/d*speed;}
      if(d>.01){const desired=Math.atan2(dx,dz),delta=Math.atan2(Math.sin(desired-avatar.rotation.y),Math.cos(desired-avatar.rotation.y));avatar.rotation.y+=delta*Math.min(1,dt*13);}
    }
    if(seated){// Slide onto the cushion, turn the way the seat faces and fold the legs forward.
      sitBlend=reducedMotion?1:Math.min(1,sitBlend+dt*3);const k=1-(1-sitBlend)**3;
      avatar.position.set(standPoint.x+(seated.x-standPoint.x)*k,.08+(seated.y-.47-.08)*k,standPoint.z+(seated.z-standPoint.z)*k);
      const delta=Math.atan2(Math.sin(seated.rot-avatar.rotation.y),Math.cos(seated.rot-avatar.rotation.y));avatar.rotation.y+=delta*Math.min(1,dt*8);
      legL.rotation.x=legR.rotation.x=-Math.PI/2*k;armL.rotation.x=armR.rotation.x=-.5*k;body.position.y=0;
    } else {
      const stride=walking&&!reducedMotion?Math.sin(time*13)*.45:0;legL.rotation.x=stride;legR.rotation.x=-stride;armL.rotation.x=-stride*.65;armR.rotation.x=stride*.65;body.position.y=walking&&!reducedMotion?Math.abs(Math.sin(time*13))*.045:0;
    }
    if(!reducedMotion)steam.forEach(({puff,baseY,phase,x,z})=>{const p=(time*.40+phase)%1;puff.position.set(x+Math.sin(p*5+phase)*.045,baseY+p*.55,z);puff.material.opacity=(1-p)*.23;});
    marker.material.opacity=Math.max(0,marker.material.opacity-dt*.22);
    if(glowing){glowTime+=dt;const k=reducedMotion?.3:.3+.3*Math.sin(glowTime*2.5);glowing.traverse(o=>{if(o.userData.mat)o.material.emissiveIntensity=k;});}
    const desired=follow?new THREE.Vector3(avatar.position.x*.55,.85,avatar.position.z*.45-.52):new THREE.Vector3(0,.85,0).add(pan);
    camTarget.lerp(desired,1-Math.exp(-dt*(reducedMotion?20:3.5)));camera.position.copy(camTarget).add(cameraOffset);camera.lookAt(camTarget);
    renderer.render(scene,camera);raf=requestAnimationFrame(animate);
  }
  camera.position.copy(camTarget).add(cameraOffset);camera.lookAt(camTarget);raf=requestAnimationFrame(animate);
  return {zoomIn:()=>setZoom(zoom+.12),zoomOut:()=>setZoom(zoom-.12),recenter,setFollow,toggleLight,dispose(){cancelAnimationFrame(raf);observer.disconnect();scene.traverse(o=>{o.geometry?.dispose();});materials.forEach(m=>m.dispose());renderer.dispose();}};
}
