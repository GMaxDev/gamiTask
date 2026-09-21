import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPrimitives} from '../src/primitives.ts';
import {buildRecipe,captureRecipe} from '../src/recipe.ts';

const root=new THREE.Group(),P=createPrimitives(()=>root,new Map());
test('a recipe becomes one group of meshes, placed, turned and coloured as written',()=>{
  const g=buildRecipe(P,[
    {kind:'box',x:0,y:.5,z:0,rx:0,ry:0,rz:0,w:1,h:1,d:1,r:.04,color:'#c9764f'},
    {kind:'cyl',x:0,y:1.2,z:0,rx:0,ry:.5,rz:0,rt:0,rb:.2,h:.4,n:12,color:'#ffffff'},
    {kind:'ball',x:.3,y:0,z:0,rx:0,ry:0,rz:1,r:.2,sx:1,sy:2,sz:1,color:'#819478'},
  ],root);
  assert.equal(g.parent,root);assert.equal(g.children.length,3);
  const [box,cyl,ball]=g.children as THREE.Mesh[];
  assert.equal(box.position.y,.5);assert.equal((box.material as THREE.MeshStandardMaterial).color.getHexString(),'c9764f');
  assert.equal(cyl.rotation.y,.5);assert.equal((cyl.geometry as THREE.CylinderGeometry).parameters.radialSegments,12);
  assert.equal(ball.rotation.z,1);assert.equal(ball.scale.y,2);
});
test('capturing a built group reads back the same parts, scale folded into the dimensions',()=>{
  const g=new THREE.Group();g.position.set(2,0,1);g.rotation.y=.5;g.scale.setScalar(2);root.add(g);
  P.box(1,.5,.25,'#c9764f',0,.25,0,.04,g);const c=P.cyl(.1,.2,.4,'#ffffff',.3,0,0,g,12);c.rotation.z=1;P.ball(.2,'#819478',0,1,0,g,1,2,1);
  const ghost=P.ball(.1,new THREE.MeshBasicMaterial({transparent:true,opacity:.3}),0,0,0,g);void ghost;// effects and shadows are transparent: never captured
  const parts=captureRecipe(g);
  assert.deepEqual(parts,[
    {kind:'box',x:0,y:.5,z:0,rx:0,ry:0,rz:0,w:2,h:1,d:.5,r:.08,color:'#c9764f'},
    {kind:'cyl',x:.6,y:0,z:0,rx:0,ry:0,rz:1,rt:.2,rb:.4,h:.8,n:12,color:'#ffffff'},
    {kind:'ball',x:0,y:2,z:0,rx:0,ry:0,rz:0,r:.4,sx:1,sy:2,sz:1,color:'#819478'},
  ]);
});
