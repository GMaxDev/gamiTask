# Éditeur de personnage — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un écran de personnalisation du personnage (style Tomodachi Life) qui monte du bas de la page, avec la caméra du café qui plonge sur l'avatar, un fond flouté clair, un premier catalogue réel (peau, tête, cheveux, couleurs, pantalon, casque, chapeaux possédés), Undo / Quitter / Valider, persistance locale.

**Architecture:** Un modèle pur `look.ts` (catalogue, validation, historique) ; les primitives Three.js de `scene.ts` extraites dans `primitives.ts` ; un constructeur d'avatar `avatar.ts` partagé par le joueur, le barista et les avatars distants ; un mode édition dans `scene.ts` (ressort caméra, double passe flou + avatar net, état exclusif) ; un module DOM `editor.ts` (rail, grille, palette, vignettes rendues depuis le vrai modèle) ; `main.ts` orchestre ouverture / aperçu / validation.

**Tech Stack:** TypeScript strict, Three.js 0.180 (`WebGLRenderTarget`, `ShaderMaterial`, `Object3D.layers`), Vite 7, `node --test` (Node 24).

**Spec:** `docs/superpowers/specs/2026-09-18-editeur-personnage-design.md`

## Global Constraints

- TypeScript strict, `npm run typecheck` à 0 erreur à chaque commit ; `npm test` vert à chaque commit (tests existants : 36).
- Imports relatifs avec extension `.ts` ; `import type` pour les types ; pas d'`enum` ; style dense comme le reste de `src/`.
- Aucun changement serveur ni protocole : l'apparence est locale (`gamitask.look`). Les autres joueurs voient couleur de t-shirt (`identity.color`) + chapeau.
- Le rendu du café hors édition doit rester **identique** après l'extraction des primitives et le passage à `buildAvatar` (capture avant / après).
- Flou de fond : double passe, render target 0,5× (0,4× si `devicePixelRatio > 1.5`), flou gaussien séparable, **sans désaturation ni assombrissement** ; avatar net sur la couche `AVATAR_LAYER = 1` ; render target et shaders préchauffés au montage.
- Ressort caméra 600 ms ease-out ; panneau `translateY(100%) → 0` en 500 ms `cubic-bezier(.2,.9,.25,1.06)` ; `prefers-reduced-motion` → coupes directes.
- Copie UI en français : « Mon personnage », « Tourner », « Vue par défaut », « Annuler », « Quitter », « Valider », onglets « Visage », « Cheveux », « Tenue », sous-onglets « Peau », « Tête », « Frange », « Arrière », « Haut », « Bas », « Accessoires ».
- Commits conventional commits en anglais, trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Pas de push.
- Commandes depuis `app/` : `npm test`, `npm run typecheck`, `npm run dev`. Serveurs de dev : API `http://localhost:3001` (`server/`, `npm rebuild better-sqlite3` si le binaire ne charge pas), Vite sur un port libre (`npx vite --port 5174`, 5173 est occupé par un autre processus).

---

## Structure des fichiers

| Fichier | Statut | Responsabilité |
|---|---|---|
| `app/src/look.ts` | créer | type `Look`, catalogue, `defaultLook`, `loadLook`, `withChange`, `createHistory`, `equalLook` |
| `app/tests/look.test.ts` | créer | tests du modèle |
| `app/src/primitives.ts` | créer | `createPrimitives(getRoot, materials)` : `mat / mesh / box / cyl / ball / group` + `C` (palette) |
| `app/src/avatar.ts` | créer | `buildAvatar`, `applyLook`, `buildHat`, `lookFor(color, hat)` |
| `app/src/scene.ts` | modifier | consomme primitives + avatar ; mode édition ; miroir ; `setLook` |
| `app/src/editor.ts` | créer | DOM du panneau, vignettes, historique, callbacks |
| `app/src/main.ts` | modifier | chargement / sauvegarde du look, ouverture / fermeture, verrou `editing` |
| `app/src/style.css` | modifier | panneau, rail, grille, palette, HUD estompé |

---

### Task 1 : `look.ts` — modèle, catalogue, historique

**Files:**
- Create: `app/src/look.ts`
- Test: `app/tests/look.test.ts`

**Interfaces:**
- Consumes: `PALETTE` de `./identity.ts` (`{hex:number;label:string}[]`), `HATS` de `./shop.ts` (`{id,name,price,emoji}[]`).
- Produces:
  ```ts
  export interface Look { skin:string; head:'round'|'oval'|'square'; bangs:string; back:string; hairColor:string; shirt:number; trousers:string; headphones:boolean; hat:string|null }
  export const SKINS:{id:string;label:string;hex:string}[];        // 6
  export const HEADS:{id:Look['head'];label:string}[];               // 3
  export const BANGS:{id:string;label:string}[];                      // none + 4
  export const BACKS:{id:string;label:string}[];                      // none + 4
  export const HAIR_COLORS:{id:string;label:string;hex:string}[];    // 8
  export const TROUSERS:{id:string;label:string;hex:string}[];       // 4
  export function defaultLook(shirt:number):Look;
  export function loadLook(saved:unknown,shirt:number,ownedHats:string[]):Look;
  export function withChange(look:Look,patch:Partial<Look>):Look;
  export function equalLook(a:Look,b:Look):boolean;
  export interface History { current():Look; push(look:Look):void; undo():Look|null; canUndo():boolean; reset():Look }
  export function createHistory(initial:Look):History;              // pile bornée à 50
  export const skinHex=(id:string)=>string; hairHex=(id:string)=>string; trousersHex=(id:string)=>string;
  ```

- [ ] **Step 1 : Écrire le test**

```ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultLook,loadLook,withChange,equalLook,createHistory,SKINS,HEADS,BANGS,BACKS,HAIR_COLORS,TROUSERS,skinHex} from '../src/look.ts';

test('the catalogue has the sizes the spec asks for',()=>{
 assert.equal(SKINS.length,6);assert.equal(HEADS.length,3);assert.equal(BANGS.length,5);assert.equal(BACKS.length,5);assert.equal(HAIR_COLORS.length,8);assert.equal(TROUSERS.length,4);
 assert.equal(BANGS[0].id,'none');assert.equal(BACKS[0].id,'none');
});
test('the default look wears the identity colour and no hat',()=>{
 const l=defaultLook(0xc9764f);
 assert.equal(l.shirt,0xc9764f);assert.equal(l.hat,null);assert.equal(l.headphones,true);assert.equal(l.head,'round');
 assert.ok(SKINS.some(s=>s.id===l.skin));assert.ok(HAIR_COLORS.some(c=>c.id===l.hairColor));
});
test('saved looks are validated field by field',()=>{
 const l=loadLook({skin:'zzz',head:'oval',bangs:'curtain',back:'nope',hairColor:HAIR_COLORS[3].id,shirt:'red',trousers:TROUSERS[2].id,headphones:0,hat:'hat-crown'},0x819478,['hat-crown']);
 assert.equal(l.skin,defaultLook(0).skin);assert.equal(l.head,'oval');assert.equal(l.bangs,'curtain');assert.equal(l.back,defaultLook(0).back);
 assert.equal(l.hairColor,HAIR_COLORS[3].id);assert.equal(l.shirt,0x819478);assert.equal(l.trousers,TROUSERS[2].id);assert.equal(l.headphones,false);assert.equal(l.hat,'hat-crown');
 assert.equal(loadLook({hat:'hat-crown'},0,[]).hat,null);assert.equal(loadLook(null,0x111111,[]).shirt,0x111111);
});
test('withChange is immutable and equalLook compares by value',()=>{
 const a=defaultLook(1),b=withChange(a,{skin:SKINS[4].id});
 assert.notEqual(a,b);assert.equal(a.skin,defaultLook(1).skin);assert.equal(b.skin,SKINS[4].id);
 assert.ok(equalLook(a,defaultLook(1)));assert.ok(!equalLook(a,b));
});
test('history undoes step by step, resets to the initial look and is bounded',()=>{
 const h=createHistory(defaultLook(1));
 assert.equal(h.canUndo(),false);assert.equal(h.undo(),null);
 h.push(withChange(h.current(),{head:'square'}));h.push(withChange(h.current(),{back:'bob'}));
 assert.equal(h.current().back,'bob');assert.equal(h.undo()?.back,BACKS[1].id);assert.equal(h.current().head,'square');
 assert.equal(h.reset().head,'round');assert.equal(h.canUndo(),false);
 for(let i=0;i<80;i++)h.push(withChange(h.current(),{shirt:i}));
 let n=0;while(h.undo())n++;assert.equal(n,50);
});
test('hex helpers resolve ids',()=>{assert.equal(skinHex(SKINS[0].id),SKINS[0].hex);assert.equal(skinHex('zzz'),SKINS[1].hex);});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `node --test tests/look.test.ts` → FAIL (module introuvable).

- [ ] **Step 3 : Implémenter `app/src/look.ts`**

```ts
// What a character looks like. Pure: catalogue, validation, undo history. Rendering lives in avatar.ts.
import {PALETTE} from './identity.ts';
export interface Look{skin:string;head:'round'|'oval'|'square';bangs:string;back:string;hairColor:string;shirt:number;trousers:string;headphones:boolean;hat:string|null}
export const SKINS=[
  {id:'porcelain',label:'Porcelaine',hex:'#f7dcc4'},{id:'peach',label:'Pêche',hex:'#edc39d'},{id:'honey',label:'Miel',hex:'#d9a982'},
  {id:'caramel',label:'Caramel',hex:'#b8845c'},{id:'cocoa',label:'Cacao',hex:'#8a5a3c'},{id:'ebony',label:'Ébène',hex:'#5a3a28'},
];
export const HEADS:{id:Look['head'];label:string}[]=[{id:'round',label:'Ronde'},{id:'oval',label:'Ovale'},{id:'square',label:'Carrée'}];
export const BANGS=[{id:'none',label:'Sans'},{id:'straight',label:'Droite'},{id:'curtain',label:'Rideau'},{id:'side',label:'Mèche'},{id:'curly',label:'Bouclée'}];
export const BACKS=[{id:'none',label:'Sans'},{id:'short',label:'Court'},{id:'bob',label:'Carré'},{id:'ponytail',label:'Queue'},{id:'braids',label:'Nattes'}];
export const HAIR_COLORS=[
  {id:'black',label:'Noir',hex:'#2b2422'},{id:'brown',label:'Brun',hex:'#634535'},{id:'chestnut',label:'Châtain',hex:'#8a6242'},{id:'ginger',label:'Roux',hex:'#b8552e'},
  {id:'blond',label:'Blond',hex:'#d9b56a'},{id:'ash',label:'Cendré',hex:'#9a948a'},{id:'white',label:'Blanc',hex:'#efe6d8'},{id:'sage',label:'Sauge',hex:'#819478'},
];
export const TROUSERS=[{id:'cream',label:'Crème',hex:'#f4e4c9'},{id:'sand',label:'Sable',hex:'#d8b27a'},{id:'olive',label:'Olive',hex:'#7a8e4a'},{id:'slate',label:'Ardoise',hex:'#5b6570'}];
const pick=<T extends {id:string}>(list:T[],id:unknown,fallback:T):T=>list.find(e=>e.id===id)??fallback;
export const skinHex=(id:string)=>pick(SKINS,id,SKINS[1]).hex;
export const hairHex=(id:string)=>pick(HAIR_COLORS,id,HAIR_COLORS[1]).hex;
export const trousersHex=(id:string)=>pick(TROUSERS,id,TROUSERS[0]).hex;
export function defaultLook(shirt:number):Look{return {skin:'peach',head:'round',bangs:'straight',back:'short',hairColor:'brown',shirt,trousers:'cream',headphones:true,hat:null};}
export function loadLook(saved:unknown,shirt:number,ownedHats:string[]):Look{
  const d=defaultLook(shirt),s=(saved&&typeof saved==='object'?saved:{}) as Record<string,unknown>;
  return {
    skin:pick(SKINS,s.skin,{id:d.skin,label:'',hex:''}).id,head:pick(HEADS,s.head,{id:d.head,label:''}).id,
    bangs:pick(BANGS,s.bangs,{id:d.bangs,label:''}).id,back:pick(BACKS,s.back,{id:d.back,label:''}).id,
    hairColor:pick(HAIR_COLORS,s.hairColor,{id:d.hairColor,label:'',hex:''}).id,
    shirt:PALETTE.some(p=>p.hex===s.shirt)?s.shirt as number:shirt,
    trousers:pick(TROUSERS,s.trousers,{id:d.trousers,label:'',hex:''}).id,
    headphones:typeof s.headphones==='boolean'?s.headphones:d.headphones,
    hat:typeof s.hat==='string'&&ownedHats.includes(s.hat)?s.hat:null,
  };
}
export const withChange=(look:Look,patch:Partial<Look>):Look=>({...look,...patch});
export const equalLook=(a:Look,b:Look)=>(Object.keys(a) as (keyof Look)[]).every(k=>a[k]===b[k]);
export interface History{current():Look;push(look:Look):void;undo():Look|null;canUndo():boolean;reset():Look}
const LIMIT=50;
export function createHistory(initial:Look):History{
  let now=initial;const past:Look[]=[];
  return {current:()=>now,push(look){past.push(now);if(past.length>LIMIT)past.shift();now=look;},undo(){const p=past.pop();if(!p)return null;now=p;return now;},canUndo:()=>past.length>0,reset(){past.length=0;now=initial;return now;}};
}
```

- [ ] **Step 4 : Lancer les tests**

Run: `npm test` → PASS (36 + 6). `npm run typecheck` → 0 erreur.

- [ ] **Step 5 : Commit**

```bash
git add app/src/look.ts app/tests/look.test.ts
git commit -m "feat(app): add the character look model and catalogue

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2 : `primitives.ts` — extraire les helpers Three.js de la scène

**Files:**
- Create: `app/src/primitives.ts`
- Modify: `app/src/scene.ts:8-32` (palette `C`, `mat/mesh/box/cyl/ball/group`)

**Interfaces:**
- Produces:
  ```ts
  export const C:{cream,wood,edge,oak,sage,dark,terra,peach,white,gold,soil:string};
  export interface Primitives { mat(color:any,extra?:any):any; mesh(geo:any,color:any,x:number,y:number,z:number,parent?:any,extra?:any):any; box(w,h,d,color,x,y,z,r?:number,parent?:any):any; cyl(rt,rb,h,color,x,y,z,parent?:any,n?:number):any; ball(r,color,x,y,z,parent?:any,sx?,sy?,sz?):any; group(x,y,z,rot?:number):any }
  export function createPrimitives(getRoot:()=>any, materials:Map<string,any>):Primitives;
  ```
  `root` est réassigné dans la scène (aperçu fantôme des meubles), d'où le getter.

- [ ] **Step 1 : Créer `app/src/primitives.ts`** en copiant tel quel le corps des six fonctions depuis `scene.ts` (mêmes signatures, même cache `materials`, même `roughness .82`), avec `parent: any = getRoot()` comme valeur par défaut calculée dans le corps (`parent??=getRoot()` n'est pas possible pour un paramètre par défaut qui dépend d'un appel : écrire `function box(...,parent?: any){parent??=getRoot();…}`) et `C` exporté :

```ts
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
export const C={cream:'#f4e4c9',wood:'#bd8356',edge:'#905e3d',oak:'#d9aa72',sage:'#819478',dark:'#384d43',terra:'#c9764f',peach:'#e5a27a',white:'#fff4df',gold:'#d2a754',soil:'#594438'};
export interface Primitives{mat(color:any,extra?:any):any;mesh(geo:any,color:any,x:number,y:number,z:number,parent?:any,extra?:any):any;box(w:number,h:number,d:number,color:any,x:number,y:number,z:number,r?:number,parent?:any):any;cyl(rt:number,rb:number,h:number,color:any,x:number,y:number,z:number,parent?:any,n?:number):any;ball(r:number,color:any,x:number,y:number,z:number,parent?:any,sx?:number,sy?:number,sz?:number):any;group(x:number,y:number,z:number,rot?:number):any}
// Low-poly building blocks shared by the room and the avatars. `getRoot` is a getter because the scene swaps its root while previewing furniture.
export function createPrimitives(getRoot:()=>any,materials:Map<string,any>):Primitives{
  function mat(color:any,extra:any={}):any{if(Object.keys(extra).length)return new THREE.MeshStandardMaterial({color,roughness:.82,...extra});if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.82}));return materials.get(color);}
  function mesh(geo:any,color:any,x:number,y:number,z:number,parent?:any,extra:any={}):any{parent??=getRoot();const m=new THREE.Mesh(geo,typeof color==='string'?mat(color,extra):color);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  function box(w:number,h:number,d:number,color:any,x:number,y:number,z:number,r=.04,parent?:any):any{return mesh(r?new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/3,h/3,d/3)):new THREE.BoxGeometry(w,h,d),color,x,y,z,parent??getRoot());}
  function cyl(rt:number,rb:number,h:number,color:any,x:number,y:number,z:number,parent?:any,n=16):any{return mesh(new THREE.CylinderGeometry(rt,rb,h,n),color,x,y,z,parent??getRoot());}
  function ball(r:number,color:any,x:number,y:number,z:number,parent?:any,sx=1,sy=1,sz=1):any{const m=mesh(new THREE.SphereGeometry(r,12,8),color,x,y,z,parent??getRoot());m.scale.set(sx,sy,sz);return m;}
  function group(x:number,y:number,z:number,rot=0):any{const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=rot;getRoot().add(g);return g;}
  return {mat,mesh,box,cyl,ball,group};
}
```

- [ ] **Step 2 : Brancher la scène** — dans `scene.ts`, supprimer la constante `C` locale et les six fonctions ; importer `import {C,createPrimitives} from './primitives.ts';` ; juste après la déclaration de `materials`, écrire `const P=createPrimitives(()=>root,materials);const {mat,mesh,box,cyl,ball,group}=P;`. Le reste du fichier ne change pas (les noms locaux sont conservés par la destructuration). Vérifier que tous les appels qui passaient `root` explicitement fonctionnent (ils passent un parent non-undefined, donc le getter n'est pas utilisé).

- [ ] **Step 3 : Vérifier**

Run: `npm run typecheck && npm test` → 0 erreur, 42/42.
Visuel : serveur + Vite lancés, capture du café et de « Chez moi » **avant** (commit précédent, via `git stash` si besoin) et **après** : identiques. Console propre.

- [ ] **Step 4 : Commit**

```bash
git add app/src/primitives.ts app/src/scene.ts
git commit -m "refactor(app): extract the low-poly primitives from the scene

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3 : `avatar.ts` — constructeur d'avatar piloté par `Look`

**Files:**
- Create: `app/src/avatar.ts`
- Modify: `app/src/scene.ts` (`person()`, `buildHat()`, `setHat`, `player`, `barista`, `addRemote`, `setRemoteHat`, signature de `createCafe`)

**Interfaces:**
- Consumes: `Primitives`, `C` (Task 2) ; `Look`, `skinHex`, `hairHex`, `trousersHex` (Task 1).
- Produces:
  ```ts
  export interface Rig { g:any; body:any; head:any; legL:any; legR:any; armL:any; armR:any; phase:number; look:Look; parts:{skull:any;hair:any;hat:any;hands:any[];shirt:any[];legs:any[]} }
  export interface AvatarOpts { apron?:string|null }
  export function buildAvatar(p:Primitives,x:number,z:number,look:Look,opts?:AvatarOpts):Rig;
  export function applyLook(p:Primitives,rig:Rig,look:Look):void;   // rebuilds skull/hair/hat in place, recolours shirt/legs/hands
  export function buildHat(p:Primitives,id:string,parent:any):any;  // moved from scene.ts, same geometry
  export function lookFor(color:number,hat:string|null):Look;       // default look with this shirt + hat (remotes, barista)
  export function hexOf(n:number):string;                           // 0xc9764f → '#c9764f'
  ```
  `createCafe(container,onState,{room,furniture,look})` remplace le paramètre `hat` par `look:Look`. `setHat(id)` reste (appelé par `cosmetics:state`) et devient `applyLook(P,player,{...player.look,hat:id})`. Nouvelle méthode `setLook(look:Look)`.

- [ ] **Step 1 : Écrire `app/src/avatar.ts`**

Reprendre `person()` (scene.ts l.344-360) et `buildHat()` (l.363-374) mot pour mot, puis les paramétrer :

```ts
// One avatar rig, built from a Look. Shared by the player, the barista and remote players; the walker only needs the rig's joints.
import * as THREE from 'three';
import {C,type Primitives} from './primitives.ts';
import {type Look,defaultLook,skinHex,hairHex,trousersHex} from './look.ts';
export interface Rig{g:any;body:any;head:any;legL:any;legR:any;armL:any;armR:any;phase:number;look:Look;parts:{skull:any;hair:any;hat:any;hands:any[];shirt:any[];legs:any[]}}
export interface AvatarOpts{apron?:string|null}
export const hexOf=(n:number)=>'#'+n.toString(16).padStart(6,'0');
export const lookFor=(color:number,hat:string|null):Look=>({...defaultLook(color),hat});
const HEAD_SCALE:Record<Look['head'],[number,number,number]>={round:[1,1.1,.91],oval:[.94,1.18,.9],square:[1.06,1.02,.96]};

function buildSkull(p:Primitives,head:any,look:Look){
  const g=new THREE.Group();head.add(g);const [sx,sy,sz]=HEAD_SCALE[look.head],skin=skinHex(look.skin);
  if(look.head==='square')p.box(.56,.6,.52,skin,0,.21,0,.16,g);else p.ball(.31,skin,0,.21,0,g,sx,sy,sz);
  for(const dx of [-.11,.11])p.ball(.023,C.dark,dx,.20,.258,g,1,1.2,.6);
  p.ball(.046,'#d89479',-.20,.12,.223,g,1,.45,.3);p.ball(.046,'#d89479',.20,.12,.223,g,1,.45,.3);
  if(look.headphones){p.mesh(new THREE.TorusGeometry(.335,.035,6,16,Math.PI),C.cream,0,.27,0,g);for(const dx of [-.33,.33])p.ball(.1,C.cream,dx,.23,0,g,.48,1.2,.9);}
  return g;
}
// Hair is two pieces on the head pivot: the bangs in front, the back behind. Rounded shapes read well at the editor's zoom.
function buildHair(p:Primitives,head:any,look:Look){
  const g=new THREE.Group();head.add(g);const h=hairHex(look.hairColor);
  if(look.bangs!=='none'||look.back!=='none')p.ball(.32,h,0,.34,-.045,g,1.04,.85,.98);// cap
  switch(look.bangs){
    case 'straight':p.box(.5,.16,.14,h,0,.42,.22,.05,g);break;
    case 'curtain':p.box(.2,.2,.13,h,-.17,.4,.22,.05,g);p.box(.2,.2,.13,h,.17,.4,.22,.05,g);break;
    case 'side':{const b=p.box(.46,.15,.14,h,.05,.43,.22,.05,g);b.rotation.z=-.22;break;}
    case 'curly':for(const [dx,dy] of [[-.2,.4],[-.07,.46],[.07,.46],[.2,.4]] as [number,number][])p.ball(.1,h,dx,dy,.2,g);break;
  }
  switch(look.back){
    case 'short':p.ball(.3,h,0,.28,-.12,g,1,.8,.9);break;
    case 'bob':p.box(.62,.42,.5,h,0,.2,-.06,.16,g);break;
    case 'ponytail':p.ball(.3,h,0,.28,-.12,g,1,.8,.9);{const t=p.box(.14,.42,.14,h,0,.12,-.36,.06,g);t.rotation.x=.35;}break;
    case 'braids':p.ball(.3,h,0,.28,-.12,g,1,.8,.9);for(const dx of [-.3,.3]){const b=p.box(.11,.5,.11,h,dx,.0,-.02,.05,g);b.rotation.z=dx>0?.12:-.12;}break;
  }
  return g;
}
export function buildHat(p:Primitives,id:string,parent:any):any{ /* corps de buildHat() de scene.ts, avec p.cyl / p.ball / p.mesh / p.mat au lieu des locaux */ }
export function buildAvatar(p:Primitives,x:number,z:number,look:Look,{apron=null}:AvatarOpts={}):Rig{
  const g=p.group(x,.08,z),body=new THREE.Group();g.add(body);
  const legL=new THREE.Group(),legR=new THREE.Group();legL.position.set(-.14,.47,0);legR.position.set(.14,.47,0);body.add(legL,legR);
  const legs:any[]=[];for(const leg of [legL,legR]){legs.push(p.box(.19,.39,.22,trousersHex(look.trousers),0,-.2,0,.07,leg));p.box(.22,.12,.32,C.edge,0,-.37,.045,.04,leg);}
  const shirtHex=hexOf(look.shirt),torso=p.box(.58,.53,.36,shirtHex,0,.69,0,.15,body);
  const armL=p.box(.17,.43,.21,shirtHex,-.36,.65,0,.07,body),armR=p.box(.17,.43,.21,shirtHex,.36,.65,0,.07,body);
  const hands=[p.ball(.095,skinHex(look.skin),-.36,.43,0,body),p.ball(.095,skinHex(look.skin),.36,.43,0,body)];
  const head=new THREE.Group();head.position.y=1.0;body.add(head);
  if(apron){p.box(.30,.22,.05,apron,0,.90,.185,.02,body);p.box(.54,.40,.05,apron,0,.60,.19,.03,body);p.box(.60,.05,.42,apron,0,.80,0,.02,body);p.box(.20,.12,.02,'#d8b27a',0,.55,.222,.008,body);for(const dx of [-.12,.12])p.box(.03,.30,.02,apron,dx,1.06,.19,.005,body);}
  const rig:Rig={g,body,head,legL,legR,armL,armR,phase:Math.random()*7,look,parts:{skull:null,hair:null,hat:null,hands,shirt:[torso,armL,armR],legs}};
  rig.parts.skull=buildSkull(p,head,look);rig.parts.hair=buildHair(p,head,look);rig.parts.hat=look.hat?buildHat(p,look.hat,head):null;
  return rig;
}
const drop=(o:any)=>{if(!o)return;o.removeFromParent();o.traverse((m:any)=>{m.geometry?.dispose?.();});};
export function applyLook(p:Primitives,rig:Rig,look:Look):void{
  drop(rig.parts.skull);drop(rig.parts.hair);drop(rig.parts.hat);
  rig.parts.skull=buildSkull(p,rig.head,look);rig.parts.hair=buildHair(p,rig.head,look);rig.parts.hat=look.hat?buildHat(p,look.hat,rig.head):null;
  for(const m of rig.parts.hands)m.material=p.mat(skinHex(look.skin));
  for(const m of rig.parts.shirt)m.material=p.mat(hexOf(look.shirt));
  for(const m of rig.parts.legs)m.material=p.mat(trousersHex(look.trousers));
  rig.look=look;
}
```

Le corps de `buildHat` est copié intégralement depuis `scene.ts` (les cinq `case`), en préfixant chaque primitive par `p.` et `C` importé. Ne pas le résumer.

- [ ] **Step 2 : Brancher la scène**

Dans `scene.ts` :
- `import {buildAvatar,applyLook,buildHat,lookFor,type Rig} from './avatar.ts';` et `import type {Look} from './look.ts';`
- Signature : `export function createCafe(container: HTMLElement, onState: …, {room='public',furniture={},look}: {room?: 'public'|'private'; furniture?: Record<string,{c:number;r:number}>; look: Look})`.
- Supprimer `person()` et `buildHat()` locaux. `const player: Rig=buildAvatar(P,0,room==='private'?2:2.5,look),avatar=player.g;`
- `function setHat(id: string|null){applyLook(P,player,{...player.look,hat:id});}` ; `function setLook(l: Look){applyLook(P,player,l);}` ; supprimer `playerHat` et son animation `float` (remplacer par `if(player.parts.hat?.userData.float)player.parts.hat.position.y=…` dans `animate`).
- Barista : `buildAvatar(P,-7.5,-9.25,{...lookFor(0xf4e4c9,null),skin:'honey',hairColor:'black',trousers:'slate',headphones:false,bangs:'side',back:'short'},{apron:'#4d5b52'})`.
- Remotes : `buildAvatar(P,at.x,at.z,lookFor(info.color,info.hat))` ; `setRemoteHat(id,hat)` → `applyLook(P,r.p,{...r.p.look,hat})` ; supprimer `r.hat`. `Remote.p` est typé `Rig`.
- Le `walker()` prend un `Rig` (mêmes champs `g/body/head/legL/legR/armL/armR/phase`).
- Ajouter `setLook` à l'objet retourné.

- [ ] **Step 3 : Brancher `main.ts` a minima** (le vrai câblage vient en Task 6) : `import {loadLook,type Look} from './look.ts';` ; `let look: Look=loadLook(load('gamitask.look',null),identity.color,[]);` avant `mountRoom()` ; `createCafe(...,{room,furniture:shop.placed,look:{...look,hat:shop.hat}})` ; dans `cosmetics:state`, après `cafe?.setHat(shop.hat)` rien ne change.

- [ ] **Step 4 : Vérifier**

Run: `npm run typecheck && npm test` → 0 erreur, 42/42.
Visuel : café et « Chez moi » identiques à la capture de la Task 2 (joueur, barista, un joueur distant via un second onglet, chapeau acheté visible). Console propre.

- [ ] **Step 5 : Commit**

```bash
git add app/src/avatar.ts app/src/scene.ts app/src/main.ts
git commit -m "refactor(app): build every avatar from a Look

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4 : mode édition dans la scène (caméra, flou, état exclusif, miroir)

**Files:**
- Modify: `app/src/scene.ts` (état `mode`, handlers pointeur / molette / clavier, `animate`, `resize`, `dispose`, objet retourné, pièce privée)

**Interfaces:**
- Produces (ajouts à l'API de `createCafe`) :
  ```ts
  enterEditor():void;  exitEditor():void;  resetView():void;  isEditing():boolean;
  onState({editing:boolean}) émis à l'entrée / sortie ; SceneState gagne `editing?: boolean`.
  hotspot 'mirror' (pièce privée) → onState({hotspot:'mirror'}).
  ```

- [ ] **Step 1 : État exclusif** — remplacer les tests épars sur `placing` par `let mode: 'walk'|'place'|'edit'='walk';` : `startPlacing` → `mode='place'`, `stopPlacing` → `mode='walk'` (si pas en édition), `enterEditor` → `mode='edit'`, `exitEditor` → `mode='walk'`. Dans `pointermove` / `pointerup` / `wheel` / `keydown` / `hoverTicket` : brancher sur `mode` (le code du spike ci-dessous montre les gardes ; les gardes `placing` existantes deviennent `mode==='place'`).

- [ ] **Step 2 : Caméra, couche avatar, spot studio** — ajouter après la création de `camTarget`/`cameraOffset` (code issu du spike, nettoyé) :

```ts
  const AVATAR_LAYER=1,camRight=new THREE.Vector3(cameraOffset.z,0,-cameraOffset.x).normalize();
  let editAnim: null|{t:number;z0:number;z1:number;p0:THREE.Vector3;p1:THREE.Vector3}=null,savedView: null|{zoom:number;follow:boolean;pan:THREE.Vector3;target:THREE.Vector3}=null;
  let editYaw=0,studio: THREE.SpotLight|null=null;
  const HIDE_WHILE_EDITING=()=>[cursor,ring,marker,playerTag];// playerTag: the local name tag if one exists, else omit
  function enterEditor(){
    if(mode==='edit')return;if(mode==='place')stopPlacing();mode='edit';
    savedView={zoom,follow,pan:pan.clone(),target:camTarget.clone()};me.cancel();me.standUp();hoverTicket(null);
    editYaw=cameraYaw;const visibleH=3.0,aspect=width/height;
    editAnim={t:0,z0:camera.zoom,z1:2*camera.top/visibleH,p0:camTarget.clone(),p1:avatar.position.clone().setY(.95).add(camRight.clone().multiplyScalar(.28*visibleH*aspect))};
    avatar.traverse((o: any)=>o.layers.enable(AVATAR_LAYER));for(const o of HIDE_WHILE_EDITING())if(o)o.visible=false;
    studio=new THREE.SpotLight('#fff3d8',26,9,.5,.6,1.4);studio.position.copy(avatar.position).add(new THREE.Vector3(2.2,4.2,2.6));studio.target=avatar;studio.layers.enable(AVATAR_LAYER);scene.add(studio);
    onState?.({editing:true});
  }
  function exitEditor(){
    if(mode!=='edit'||!savedView)return;
    avatar.traverse((o: any)=>o.layers.disable(AVATAR_LAYER));for(const o of HIDE_WHILE_EDITING())if(o)o.visible=true;
    if(studio){scene.remove(studio);studio.dispose();studio=null;}
    editAnim={t:0,z0:camera.zoom,z1:savedView.zoom,p0:camTarget.clone(),p1:savedView.target.clone()};
    zoom=savedView.zoom;follow=savedView.follow;pan.copy(savedView.pan);savedView=null;mode='walk';
    onState?.({editing:false,zoom,follow});
  }
  function resetView(){editYaw=cameraYaw;}
```

Toutes les lumières doivent aussi être sur la couche avatar (`scene.traverse(o=>{if(o.isLight)o.layers.enable(AVATAR_LAYER);})` une fois après la construction de la pièce, et pour toute lumière créée ensuite, dont `studio`).

- [ ] **Step 3 : Double passe de flou** — remplacer le shader 9 taps + désaturation du spike par deux passes gaussiennes séparables **sans** correction de couleur :

```ts
  const blur={rtA:new THREE.WebGLRenderTarget(1,1,{colorSpace:THREE.SRGBColorSpace}),rtB:new THREE.WebGLRenderTarget(1,1,{colorSpace:THREE.SRGBColorSpace}),cam:new THREE.OrthographicCamera(-1,1,1,-1,0,1),scene:new THREE.Scene(),quad:null as any,mat:null as any};
  blur.mat=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{tex:{value:null},dir:{value:new THREE.Vector2()}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`uniform sampler2D tex;uniform vec2 dir;varying vec2 vUv;
      void main(){vec3 c=texture2D(tex,vUv).rgb*.227;
        c+=(texture2D(tex,vUv+dir*1.385).rgb+texture2D(tex,vUv-dir*1.385).rgb)*.316;
        c+=(texture2D(tex,vUv+dir*3.231).rgb+texture2D(tex,vUv-dir*3.231).rgb)*.070;
        gl_FragColor=vec4(c,1.);}`});
  blur.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),blur.mat);blur.quad.frustumCulled=false;blur.scene.add(blur.quad);
  function blurSize(){const s=renderer.getPixelRatio()>1.5?.4:.5,w=Math.max(1,Math.round(width*renderer.getPixelRatio()*s)),h=Math.max(1,Math.round(height*renderer.getPixelRatio()*s));if(blur.rtA.width!==w||blur.rtA.height!==h){blur.rtA.setSize(w,h);blur.rtB.setSize(w,h);}return {w,h};}
  function drawEditing(){
    const {w,h}=blurSize();
    camera.layers.enableAll();renderer.setRenderTarget(blur.rtA);renderer.clear();renderer.render(scene,camera);
    // two separable gaussian taps at half resolution: wide, soft, and the colours stay as they are
    for(let i=0;i<2;i++){blur.mat.uniforms.tex.value=blur.rtA.texture;blur.mat.uniforms.dir.value.set(2.2/w,0);renderer.setRenderTarget(blur.rtB);renderer.render(blur.scene,blur.cam);
      blur.mat.uniforms.tex.value=blur.rtB.texture;blur.mat.uniforms.dir.value.set(0,2.2/h);renderer.setRenderTarget(blur.rtA);renderer.render(blur.scene,blur.cam);}
    renderer.setRenderTarget(null);renderer.clear();blur.mat.uniforms.tex.value=blur.rtA.texture;blur.mat.uniforms.dir.value.set(0,0);renderer.render(blur.scene,blur.cam);
    renderer.clearDepth();camera.layers.set(AVATAR_LAYER);renderer.autoClear=false;renderer.shadowMap.autoUpdate=false;renderer.render(scene,camera);
    renderer.autoClear=true;renderer.shadowMap.autoUpdate=true;camera.layers.enableAll();
  }
  // Prewarm: compile the blur shader and allocate the targets while the room mounts, so opening the editor does not hitch.
  blurSize();renderer.compile(blur.scene,blur.cam);
```

Dans `animate` : le bloc `editAnim` du spike (ressort 600 ms, `reducedMotion` → durée `.001`), la rotation de l'avatar vers `editYaw` en mode édition, puis `if(mode==='edit')drawEditing();else renderer.render(scene,camera);`. Drag horizontal en mode édition : `editYaw-=dx*.012`.
Dans `dispose()` : `blur.rtA.dispose();blur.rtB.dispose();blur.mat.dispose();blur.quad.geometry.dispose();studio?.dispose();`.

- [ ] **Step 4 : Miroir dans « Chez moi »** — dans le bloc de la pièce privée, sur le mur du fond à gauche du bureau : `hotspot(box(.9,1.25,.06,'#cfd8d2',0.6,1.75,-HD+.06,.03),'mirror','Mon personnage','changer de tête, de coiffure ou de tenue');box(1.0,1.35,.04,OAK,0.6,1.75,-HD+.04,.03);` (cadre derrière la glace). `obstacle` inutile (au mur).

- [ ] **Step 5 : Objet retourné** — ajouter `enterEditor,exitEditor,resetView,isEditing:()=>mode==='edit'`. Dans `SceneState` ajouter `editing?: boolean`.

- [ ] **Step 6 : Vérifier**

Run: `npm run typecheck && npm test` → 0 erreur, 42/42.
Visuel (temporairement, depuis la console du navigateur : `main.ts` n'ouvre rien encore) : exposer `(window as any).__cafe=cafe` dans `mountRoom()` **le temps du test uniquement**, puis `__cafe.enterEditor()` : ressort sur le personnage à gauche, fond flou clair (pas plus sombre qu'avant), personnage net, flèche / anneau cachés, drag = rotation, `__cafe.exitEditor()` restaure. Un second onglet qui marche derrière reste visible flou. Cliquer le miroir chez soi émet `hotspot:'mirror'` (vérifier via `onSceneState` dans la console). Retirer `__cafe` avant le commit.

- [ ] **Step 7 : Commit**

```bash
git add app/src/scene.ts
git commit -m "feat(app): editor mode in the scene — camera dive, soft blurred backdrop, mirror

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5 : `editor.ts` — panneau, vignettes, palette, historique

**Files:**
- Create: `app/src/editor.ts`
- Modify: `app/src/style.css`

**Interfaces:**
- Consumes: `Look`, catalogue, `createHistory`, `withChange`, `equalLook`, `skinHex`, `hairHex`, `trousersHex` (Task 1) ; `PALETTE`, `cleanName` (`identity.ts`) ; `HATS` (`shop.ts`) ; `buildAvatar`, `createPrimitives` (Tasks 2-3) pour les vignettes.
- Produces:
  ```ts
  export interface EditorDeps { onPreview(look:Look):void; onDone(look:Look,name:string):void; onExit():void; resetView():void }
  export interface Editor { open(initial:Look,name:string,ownedHats:string[]):void; close():void; isOpen():boolean; dispose():void }
  export function createEditor(host:HTMLElement,deps:EditorDeps):Editor;
  ```

- [ ] **Step 1 : Markup et CSS**

`createEditor` injecte dans `host` :

```html
<div id="editor" class="editor" aria-hidden="true">
  <div class="editor-topbar">
    <div class="editor-tools"><span class="tool"><i data-lucide="rotate-3d"></i>Tourner : glisser</span><button id="ed-reset" class="tool-btn"><i data-lucide="locate-fixed"></i>Vue par défaut</button><button id="ed-undo" class="tool-btn" disabled><i data-lucide="undo-2"></i>Annuler</button></div>
    <div class="editor-actions"><button id="ed-exit" class="ghost-btn"><i data-lucide="x"></i>Quitter</button><button id="ed-done" class="primary"><i data-lucide="check"></i>Valider</button></div>
  </div>
  <section class="editor-sheet" aria-label="Mon personnage">
    <nav class="editor-rail" role="tablist" aria-label="Catégories"><button role="tab" data-cat="face" aria-selected="true" title="Visage"><i data-lucide="smile"></i></button><button role="tab" data-cat="hair" aria-selected="false" title="Cheveux"><i data-lucide="scissors"></i></button><button role="tab" data-cat="outfit" aria-selected="false" title="Tenue"><i data-lucide="shirt"></i></button></nav>
    <div class="editor-body">
      <header class="editor-head"><h2 id="ed-title">Visage</h2><div class="subtabs" id="ed-subtabs" role="tablist"></div></header>
      <div class="editor-main"><div class="editor-grid" id="ed-grid" role="listbox"></div><div class="editor-palette" id="ed-palette" role="listbox" aria-label="Couleur"></div></div>
      <label class="editor-name">Pseudo<input id="ed-name" maxlength="20" minlength="2" autocomplete="nickname"/></label>
    </div>
  </section>
</div>
```

Icônes : ajouter `Undo2, Scissors, Shirt, Smile, Rotate3d` à l'import lucide de `main.ts` et à `icons` ; `createEditor` reçoit `drawIcons` via… non : pour rester découplé, `editor.ts` exporte `EDITOR_ICONS=['rotate-3d','locate-fixed','undo-2','x','check','smile','scissors','shirt']` et `main.ts` appelle `drawIcons()` après `createEditor`.

CSS (remplace les règles du spike) :

```css
.editor{position:fixed;inset:0;z-index:6;pointer-events:none}.editor[aria-hidden=true]{visibility:hidden}
.editor-topbar{position:absolute;left:28px;right:28px;top:22px;display:flex;justify-content:space-between;align-items:center;opacity:0;transition:opacity .3s .25s}.editor.open .editor-topbar{opacity:1}
.editor-tools,.editor-actions{display:flex;gap:10px;align-items:center;pointer-events:auto}.tool,.tool-btn{display:flex;align-items:center;gap:6px;font-size:12px;color:#5f6d55;background:#fffaf0d9;border:1px solid #e3d2b2;border-radius:99px;padding:8px 14px}.tool-btn:disabled{opacity:.45}.tool svg,.tool-btn svg{width:14px;height:14px}
.editor-sheet{position:absolute;right:0;top:0;bottom:0;width:55vw;min-width:460px;display:flex;pointer-events:auto;background:#f7ecd7;background-image:url("data:image/svg+xml,…motif tasse/feuille/grain en #c9a86a à 6 % d'opacité…");background-size:120px 120px;box-shadow:-24px 0 60px #4e593526;transform:translateY(100%);transition:transform .5s cubic-bezier(.2,.9,.25,1.06);will-change:transform}.editor.open .editor-sheet{transform:translateY(0)}
.editor-rail{flex:0 0 78px;display:flex;flex-direction:column;align-items:center;gap:14px;padding:26px 0;background:#00000008;border-right:1px solid #e3d2b2}.editor-rail button{width:50px;height:50px;border-radius:50%;border:1px solid #e0cba6;background:#fffaf0;color:#8b917f;display:grid;place-items:center;transition:transform .15s}.editor-rail button svg{width:22px;height:22px}.editor-rail button[aria-selected=true]{background:#c9764f;border-color:#c9764f;color:#fffdf2;transform:scale(1.08)}
.editor-body{flex:1;min-width:0;padding:26px 30px;display:flex;flex-direction:column;gap:18px}.editor-head{display:flex;align-items:center;gap:18px}.editor-head h2{font-family:var(--serif);font-weight:400;font-size:30px;margin:0;color:#4a5544}
.subtabs{display:flex;gap:4px;background:#f0e4cc;padding:4px;border-radius:99px}.subtabs button{padding:8px 16px;border-radius:99px;background:transparent;font-size:12px;color:#8b917f}.subtabs button[aria-selected=true]{background:#fffdf2;color:#c9764f;font-weight:600;box-shadow:0 1px 5px #3e4e3410}
.editor-main{display:flex;gap:18px;flex:1;min-height:0}.editor-grid{flex:1;display:grid;grid-template-columns:repeat(5,1fr);gap:14px;align-content:start;overflow:auto;padding:4px}
.editor-tile{aspect-ratio:1;border-radius:18px;border:1px solid #e3d2b2;background:#fffaf0cc;display:grid;place-items:center;padding:0;overflow:hidden;transition:transform .15s,background .15s}.editor-tile img,.editor-tile canvas{width:100%;height:100%;object-fit:contain}.editor-tile:hover{transform:scale(1.05);background:#fff}.editor-tile[aria-selected=true]{background:#c9764f;border-color:#c9764f;transform:scale(1.06);box-shadow:0 6px 18px #c9764f44}
.editor-palette{display:flex;flex-direction:column;gap:10px;padding:6px}.editor-palette button{width:40px;height:40px;border-radius:50%;border:3px solid #fffaf0;box-shadow:0 0 0 1px #00000014;transition:transform .15s}.editor-palette button[aria-selected=true]{transform:scale(1.15);box-shadow:0 0 0 3px #c9764f}
.editor-name{display:flex;align-items:center;gap:12px;font-size:12px;color:#6b7560}.editor-name input{flex:0 0 220px;background:#fffaf0;border:1px solid #e3d2b2;border-radius:10px;padding:9px 12px;color:#4a5544}
.world.editing .hud-top,.world.editing .view-controls,.world.editing .world-bottom,.world.editing .timer-hud,.world.editing .open-tasks,.world.editing .movement-hint{opacity:0;pointer-events:none;transition:opacity .28s ease}
@media(prefers-reduced-motion:reduce){.editor-sheet,.editor-topbar,.editor-tile,.editor-rail button{transition:none}}
```

Le motif de fond : trois petits pictogrammes SVG (tasse, feuille, grain de café) en tracés simples, couleur `#c9a86a`, opacité 6 %, encodés en `data:` dans la règle ci-dessus.

- [ ] **Step 2 : Logique du module**

```ts
type Cat='face'|'hair'|'outfit';type Sub='skin'|'head'|'bangs'|'back'|'top'|'bottom'|'acc';
const SUBS:Record<Cat,{id:Sub;label:string}[]>={face:[{id:'skin',label:'Peau'},{id:'head',label:'Tête'}],hair:[{id:'bangs',label:'Frange'},{id:'back',label:'Arrière'}],outfit:[{id:'top',label:'Haut'},{id:'bottom',label:'Bas'},{id:'acc',label:'Accessoires'}]};
const TITLES:Record<Cat,string>={face:'Visage',hair:'Cheveux',outfit:'Tenue'};
```

État interne : `cat`, `sub`, `history`, `ownedHats`, `open`. Fonctions :
- `items(sub, look)` → liste `{id,label,patch:Partial<Look>,thumb:{kind:'head'|'body',look:Look}}` : `skin` → `SKINS` (patch `{skin}`) ; `head` → `HEADS` ; `bangs` → `BANGS` ; `back` → `BACKS` ; `top` → `PALETTE` sous forme de vignettes corps (`{shirt:hex}`) ; `bottom` → `TROUSERS` ; `acc` → `[{id:'headphones-on'},{id:'headphones-off'}]` + `HATS` filtrés par `ownedHats` + `{id:'hat-none'}`.
- `palette(sub)` → `hair` : `HAIR_COLORS` (patch `{hairColor}`) ; `top` : `PALETTE` (`{shirt}`) ; `bottom` : `TROUSERS` (`{trousers}`) ; autres : vide (colonne masquée).
- `select(patch)` → `history.push(withChange(history.current(),patch)); deps.onPreview(history.current()); render();`
- `render()` : titre, sous-onglets, grille (vignettes + `aria-selected` sur l'item dont le patch est déjà appliqué), palette, bouton Annuler activé selon `canUndo()`.
- `open(initial,name,ownedHats)` : `history=createHistory(initial)`, champ pseudo, `cat='face'`, `render()`, ajoute `.open`, `aria-hidden=false`, focus sur le premier onglet.
- `close()` : retire `.open`, `aria-hidden=true` après la transition (écouter `transitionend` sur `.editor-sheet`, repli 600 ms).
- Boutons : Annuler → `const l=history.undo(); if(l){deps.onPreview(l);render();}` ; Vue par défaut → `deps.resetView()` ; Quitter → `deps.onPreview(history.reset()); deps.onExit()` ; Valider → `const name=cleanName(input.value); if(!name){input.setCustomValidity('Choisis un pseudo d’au moins 2 caractères.');input.reportValidity();return;} deps.onDone(history.current(),name)`.
- Clavier : `Escape` → Quitter ; flèches dans la grille déplacent le focus (`roving tabindex`), Entrée / Espace sélectionne.

- [ ] **Step 3 : Vignettes rendues depuis le modèle**

```ts
// Thumbnails are the real low-poly avatar rendered once per (kind, relevant fields) into a small offscreen canvas.
function createThumbs(){
  const size=160,renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setSize(size,size);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
  const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight('#fff5dc','#b3bca4',1.6));const key=new THREE.DirectionalLight('#ffd08f',2.4);key.position.set(2,4,3);scene.add(key);
  const cam=new THREE.OrthographicCamera(-1,1,1,-1,.1,20);cam.position.set(2.2,2.4,3.2);
  const materials=new Map<string,any>();let root=new THREE.Group();scene.add(root);const P=createPrimitives(()=>root,materials);
  const cache=new Map<string,string>();
  function draw(kind:'head'|'body',look:Look):string{
    const k=kind+JSON.stringify(kind==='head'?[look.skin,look.head,look.bangs,look.back,look.hairColor,look.headphones,look.hat]:[look.skin,look.shirt,look.trousers,look.headphones,look.hat]);
    const hit=cache.get(k);if(hit)return hit;
    root.clear();const rig=buildAvatar(P,0,0,look);
    if(kind==='head'){cam.zoom=2.6;cam.lookAt(0,1.3,0);cam.position.set(2.2,3.7,3.2);}else{cam.zoom=1.15;cam.lookAt(0,.75,0);cam.position.set(2.2,2.9,3.2);}
    cam.updateProjectionMatrix();rig.g.rotation.y=-.35;renderer.render(scene,cam);
    const url=renderer.domElement.toDataURL('image/png');cache.set(k,url);root.traverse((o:any)=>o.geometry?.dispose?.());return url;
  }
  return {draw,dispose(){renderer.dispose();renderer.forceContextLoss();materials.forEach(m=>m.dispose());}};
}
```

Chaque `.editor-tile` contient `<img alt="${label}" src="${thumbs.draw(kind, withChange(current, patch))}">`. Les items « accessoires » sans forme (casque on/off, aucun chapeau) utilisent aussi une vignette tête. `dispose()` de l'éditeur libère le renderer des vignettes.

- [ ] **Step 4 : Vérifier**

Run: `npm run typecheck` → 0 erreur (le module n'est pas encore appelé). Test visuel en Task 6.

- [ ] **Step 5 : Commit**

```bash
git add app/src/editor.ts app/src/style.css
git commit -m "feat(app): character editor panel with live thumbnails

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6 : intégration dans `main.ts`

**Files:**
- Modify: `app/src/main.ts` (imports, identité, `mountRoom`, `onSceneState`, chip, `cosmetics:state`, verrous)

**Interfaces:**
- Consumes: `createEditor` (Task 5), API scène (Task 4), `loadLook`/`equalLook` (Task 1).

- [ ] **Step 1 : Chargement / sauvegarde du look**

```ts
let look=loadLook(load('gamitask.look',null),identity.color,[]);
function saveLook(){save('gamitask.look',look);}
```
Dans `cosmetics:state` : après `setCosmetics(shop,u)`, `look=loadLook(look,identity.color,shop.hats);` puis `look={...look,hat:shop.hat};saveLook();cafe?.setLook(look);` (remplace `cafe?.setHat(shop.hat)`). `mountRoom()` passe `look` à `createCafe`.

- [ ] **Step 2 : Ouverture / fermeture**

```ts
let editing=false;
const editor=createEditor($('#app') as HTMLElement,{
  onPreview:l=>cafe?.setLook(l),
  onDone(l,name){look=l;saveLook();cafe?.setLook(l);identity.name=name;identity.color=l.shirt;saveIdentity();closeEditor();toast('C’est tout toi. Les autres te verront ainsi à ta prochaine visite.');},
  onExit(){cafe?.setLook(look);closeEditor();},
  resetView:()=>cafe?.resetView(),
});
drawIcons();
function openEditor(){
  if(editing||!cafe||switching||placingId)return;editing=true;
  openDrawer(false);($('.world') as HTMLElement).classList.add('editing');
  editor.open(look,identity.name,shop.hats);cafe.enterEditor();
}
function closeEditor(){if(!editing)return;editing=false;($('.world') as HTMLElement).classList.remove('editing');editor.close();cafe?.exitEditor();}
$('#identity-chip').onclick=openEditor;($('#identity-chip') as HTMLElement).setAttribute('aria-label','Mon personnage');
```
Dans `onSceneState` : `if(state.hotspot==='mirror')openEditor();`.
Verrous : les handlers `[data-room]`, `startPlacing`, `#open-tasks` et le raccourci Échap du drawer ignorent l'action quand `editing` est vrai. Le voile réseau (`#net-veil`, z-index 7) passe déjà au-dessus de l'éditeur (z-index 6) : rien à faire, l'état de l'éditeur est conservé.

- [ ] **Step 3 : `askIdentity` garde son rôle** pour la première visite uniquement (le chip n'y mène plus). Supprimer l'ancien `onclick` du chip.

- [ ] **Step 4 : Vérifier**

Run: `npm run typecheck && npm test` → 0 erreur, 42/42.
Visuel (Chrome, serveurs lancés, deux onglets) :
1. Chip « Mon personnage » → HUD s'estompe, panneau monte, caméra plonge, fond flou clair, personnage net et cadré à gauche, joueur de l'autre onglet visible flou derrière.
2. Visage : chaque peau et chaque forme de tête change l'aperçu et la vignette sélectionnée ; Cheveux : franges / arrières / couleurs ; Tenue : t-shirt, pantalon, casque, chapeaux possédés seulement.
3. Annuler revient d'un pas ; Vue par défaut remet l'angle ; glisser fait tourner.
4. Quitter → aspect d'avant, caméra revenue ; Échap idem.
5. Valider → toast, aspect conservé, `gamitask.look` en localStorage, rechargement → même aspect ; pseudo modifié pris en compte ; l'autre onglet voit le nouveau t-shirt après ton rechargement.
6. Miroir chez soi ouvre l'éditeur. Pendant l'édition : boutons de pièce, drawer et placement inertes.
7. Redimensionner la fenêtre en édition : cadrage et flou suivent. `prefers-reduced-motion` (émulation DevTools) : pas de ressort ni de glissement.
8. ms/frame en édition ≤ baseline + 3 ms au café (mesure `gl.finish()` sur 60 rendus, comme dans le spike).

- [ ] **Step 5 : Commit**

```bash
git add app/src/main.ts
git commit -m "feat(app): open the character editor from the HUD and the mirror

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7 : finitions et documentation

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-09-18-editeur-personnage-design.md`

- [ ] **Step 1 : README** — ajouter une section « Personnage » de trois lignes : où l'ouvrir (chip, miroir), ce qui est local (`gamitask.look`), ce que voient les autres (t-shirt + chapeau).
- [ ] **Step 2 : Spec** — `**Statut :** implémenté (branche rework)`.
- [ ] **Step 3 : Vérification complète** — `cd app && npm test && npm run typecheck && npm run build` → tout vert.
- [ ] **Step 4 : Commit**

```bash
git add README.md docs
git commit -m "docs: describe the character editor

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Auto-revue (faite)

- **Couverture spec** : §3 modèle → T1 ; §4 primitives + avatar → T2/T3 ; §5 mode édition, flou, spot, miroir → T4 ; §6 panneau, vignettes, Undo / Quitter / Valider, clavier, reduced-motion → T5 ; §7 intégration, verrous, chapeaux possédés, identité → T6 ; §8 tests → T1 (Node) + T6 étape 4 (manuel) ; docs → T7.
- **Cohérence des noms** : `createPrimitives(getRoot, materials)` / `Primitives` (T2) utilisés en T3 et T5 ; `buildAvatar(p,x,z,look,opts)`, `applyLook(p,rig,look)`, `lookFor`, `hexOf` (T3) en T4/T5/T6 ; API scène `enterEditor/exitEditor/resetView/isEditing/setLook` (T3/T4) en T6 ; `createEditor(host,deps)` → `open/close/isOpen/dispose` (T5) en T6 ; `loadLook(saved, shirt, ownedHats)` (T1) en T3/T6.
- **Points d'attention** : le hotspot `'mirror'` doit être exclu du `bake()` comme les autres hotspots (`userData.keep` est posé par `hotspot()`, déjà le cas) ; `setHat` reste pour compatibilité mais `main.ts` n'utilise plus que `setLook` ; les lumières créées après le montage (spot studio) doivent activer la couche avatar sinon le personnage net serait non éclairé.
