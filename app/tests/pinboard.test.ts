import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layout,slot,ASPECT,GAP} from '../src/pinboard.ts';

const W=2.6,H=1.5,MIN=.26;
const inside=(l: any,i: number)=>{const {x,y}=slot(i,l);
  return Math.abs(x)+l.cardW/2<=W/2+1e-9&&Math.abs(y)+l.cardH/2<=H/2+1e-9;};

test('un tableau vide ne demande aucune carte',()=>{
 assert.deepEqual(layout(0,W,H,MIN),{cols:0,rows:0,cardW:0,cardH:0,shown:0,hidden:0});
});

test('peu de tâches : les cartes sont grandes et tiennent toutes',()=>{
 const l=layout(3,W,H,MIN);
 assert.equal(l.shown,3);assert.equal(l.hidden,0);
 assert.ok(l.cardW>MIN*2,`cartes trop petites pour 3 tâches : ${l.cardW}`);
 assert.ok(Math.abs(l.cardW/l.cardH-ASPECT)<1e-9);
 for(let i=0;i<3;i++)assert.ok(inside(l,i),`carte ${i} déborde du panneau`);
});

test('les cartes rétrécissent quand la liste s’allonge',()=>{
 const sizes=[3,8,16].map(n=>layout(n,W,H,MIN).cardW);
 assert.ok(sizes[0]!>sizes[1]!&&sizes[1]!>sizes[2]!,`la taille ne décroît pas : ${sizes}`);
 for(const n of [3,8,16]){const l=layout(n,W,H,MIN);
  assert.equal(l.hidden,0);
  for(let i=0;i<n;i++)assert.ok(inside(l,i),`${n} tâches : la carte ${i} déborde`);}
});

test('au plancher de lisibilité, le surplus est compté au lieu d’être écrasé',()=>{
 const l=layout(60,W,H,MIN);
 assert.equal(l.cardW,MIN);
 assert.ok(l.shown>0&&l.shown<60);
 assert.equal(l.shown+l.hidden,60);
 for(let i=0;i<l.shown;i++)assert.ok(inside(l,i),`carte ${i} déborde au plancher`);
 // une de plus ne change plus rien à la grille, seulement au compteur
 const more=layout(61,W,H,MIN);
 assert.equal(more.shown,l.shown);assert.equal(more.hidden,l.hidden+1);
});

test('un panneau plus petit qu’une carte n’en porte aucune',()=>{
 const l=layout(5,.1,.1,MIN);
 assert.equal(l.shown,0);assert.equal(l.hidden,5);
});

test('la grille est centrée sur le panneau',()=>{
 const l=layout(4,W,H,MIN);
 const xs=[...Array(l.shown)].map((_,i)=>slot(i,l).x),ys=[...Array(l.shown)].map((_,i)=>slot(i,l).y);
 assert.ok(Math.abs(Math.min(...xs)+Math.max(...xs))<1e-9,'grille décentrée en x');
 assert.ok(Math.abs(Math.min(...ys)+Math.max(...ys))<1e-9,'grille décentrée en y');
 assert.ok(GAP>0);
});
