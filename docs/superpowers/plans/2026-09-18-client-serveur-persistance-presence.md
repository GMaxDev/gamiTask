# Client 3D ↔ serveur : persistance + présence — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Brancher le client 3D vanilla (`app/`) au serveur Socket.io existant (`server/`) : tâches, progression et boutique persistées côté serveur, autres joueurs visibles dans le café, le tout en TypeScript.

**Architecture:** Le serveur est la source de vérité. Le client émet des événements socket, reçoit les événements serveur et les applique à des modèles purs (`tasks.ts`, `progress.ts`, `shop.ts`) qui pilotent le rendu. La scène Three.js gagne une API d'avatars distants réutilisant `person()` + `walker`. Les types du protocole sont importés de `server/src/types.ts` via l'alias `@shared`.

**Tech Stack:** Vite 7, TypeScript 5, Three.js 0.180, socket.io-client 4 (même majeure que `socket.io` ^4.7.5 côté serveur), `node --test` sur Node 24 (type stripping natif).

**Spec:** `docs/superpowers/specs/2026-09-18-client-serveur-persistance-presence-design.md`

## Global Constraints

- Tout le code client est en TypeScript strict ; imports relatifs **avec extension `.ts`** (Node le requiert pour les tests, Vite l'accepte avec `allowImportingTsExtensions`).
- Depuis `@shared/types` on n'importe que des **types** (`import type`) : Node strip ces imports, Vite aussi, donc aucun alias n'est résolu au runtime des tests.
- Pas de `enum`, pas de paramètres de propriété dans les constructeurs (non supportés par le type stripping de Node).
- Le client ne calcule aucune récompense : coins, XP, streak, succès viennent du serveur.
- localStorage ne garde que : `gamitask.identity`, `gamitask.timer`, `gamitask.stats`, `gamitask.room`.
- Serveur : seuls changements autorisés = bornes de grille (`MAX_GRID = 32`), flag `ALLOW_GUEST_PRIVATE_ROOMS`, origine CORS configurable (`CORS_ORIGIN`). Le protocole `types.ts` est inchangé.
- Commits : message en anglais, conventional commits, se terminant par `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Commandes à lancer depuis `app/` sauf mention contraire : `npm test`, `npm run typecheck`, `npm run dev`.
- Style du code existant : dense, une fonction par responsabilité, commentaires en anglais uniquement quand ils expliquent un « pourquoi ».

---

## Structure des fichiers

| Fichier | Statut | Responsabilité |
|---|---|---|
| `app/tsconfig.json` | créer | TS strict, `noEmit`, alias `@shared/*` |
| `app/vite.config.ts` | créer | alias `@shared`, host 127.0.0.1 |
| `app/src/coords.ts` | créer | monde 3D ↔ `col/row` |
| `app/src/identity.ts` | créer | userId / pseudo / couleur (pur) |
| `app/src/net.ts` | créer | socket typé, statut, join / rejoin |
| `app/src/tasks.ts` | migrer + refondre | état des tâches alimenté par le serveur |
| `app/src/progress.ts` | migrer + refondre | coins / XP / streak / succès alimentés par le serveur |
| `app/src/shop.ts` | migrer + refondre | catalogue, état chapeaux / meubles, validation de placement |
| `app/src/timer.ts`, `navigation.ts` | migrer | inchangés fonctionnellement |
| `app/src/scene.ts` | migrer + étendre | avatars distants + étiquettes |
| `app/src/main.ts` | migrer + réécrire le câblage | UI ↔ net ↔ scène |
| `app/src/style.css` | modifier | voile de connexion, dialogue identité, étiquettes |
| `app/tests/*.test.ts` | migrer + réécrire | modèles purs |
| `server/src/index.ts` | modifier | `MAX_GRID`, flag rooms privées, CORS |

---

### Task 1 : Migration TypeScript du client

**Files:**
- Create: `app/tsconfig.json`, `app/vite.config.ts`
- Modify: `app/package.json`, `app/index.html`
- Rename: `app/src/*.js` → `.ts`, `app/tests/*.test.js` → `.test.ts`

**Interfaces:**
- Produces: alias `@shared/*` → `../server/src/*` ; scripts `npm test`, `npm run typecheck`, `npm run dev`.

- [ ] **Step 1 : Installer TypeScript et socket.io-client**

```bash
cd app && npm i socket.io-client@^4.7.5 && npm i -D typescript@^5.6
```

- [ ] **Step 2 : Créer `app/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "types": ["node"],
    "baseUrl": ".",
    "paths": { "@shared/*": ["../server/src/*"] }
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

Installer aussi les types Node : `npm i -D @types/node`.

- [ ] **Step 3 : Créer `app/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  resolve: { alias: { '@shared': fileURLToPath(new URL('../server/src', import.meta.url)) } },
});
```

- [ ] **Step 4 : Mettre à jour `app/package.json`**

```json
"scripts": {
  "dev": "vite",
  "build": "npm run typecheck && vite build",
  "preview": "vite preview",
  "test": "node --test tests/*.test.ts",
  "typecheck": "tsc --noEmit"
}
```

- [ ] **Step 5 : Renommer les fichiers**

```bash
cd app && git mv src/main.js src/main.ts && git mv src/scene.js src/scene.ts && git mv src/navigation.js src/navigation.ts && git mv src/timer.js src/timer.ts && git mv src/tasks.js src/tasks.ts && git mv src/progress.js src/progress.ts && git mv src/shop.js src/shop.ts
git mv tests/core.test.js tests/core.test.ts && git mv tests/tasks.test.js tests/tasks.test.ts && git mv tests/progress.test.js tests/progress.test.ts && git mv tests/shop.test.js tests/shop.test.ts
```

Puis, dans tous les fichiers `src/` et `tests/`, remplacer les imports `'./x.js'` / `'../src/x.js'` par `'./x.ts'` / `'../src/x.ts'`. Dans `index.html` : `<script type="module" src="/src/main.ts">`.

- [ ] **Step 6 : Lancer les tests (ils doivent déjà passer, le code est du JS valide)**

Run: `npm test`
Expected: tous les tests existants PASS (navigation, timer, tasks, progress, shop).

- [ ] **Step 7 : Faire passer `typecheck` avec un typage minimal**

Run: `npm run typecheck` — il échouera sur les paramètres implicites `any`. Corriger fichier par fichier :

- `timer.ts` : ajouter `export interface TimerState { mode: 'focus'|'short'|'long'; durations: Record<'focus'|'short'|'long', number>; remaining: number; endAt: number | null }` et typer les signatures (`createTimer(saved: Partial<TimerState> & {durations?: Record<string, unknown>} = {}, now = Date.now()): TimerState`, etc.).
- `navigation.ts` : `export interface Obstacle { x: number; z: number; w: number; d: number }`, `export interface Point { x: number; z: number }`, `createNavigator(obstacles: Obstacle[], step = 0.25, bounds: Partial<{minX: number; maxX: number; minZ: number; maxZ: number}> = {})`.
- `tasks.ts`, `progress.ts`, `shop.ts` : typer les signatures avec des interfaces locales (elles seront refondues en Task 5-7, un typage simple suffit ici).
- `scene.ts` et `main.ts` : typer les paramètres de fonction ; là où le typage Three.js devient coûteux (traversals, `userData`), utiliser `// @ts-expect-error` **avec justification** ou `as any` localement. Objectif : zéro erreur `tsc`, pas la perfection. `onState` devient `(state: SceneState) => void` avec `export interface SceneState { seated?: boolean; walking?: boolean; hover?: {task?: {id: string; text: string; category: string | null; type: string}; hotspot?: {id: string; title: string; sub: string}; x: number; y: number} | null; hotspot?: string; placing?: {id: string; cell: {c: number; r: number} | null; refused?: boolean}; focusTask?: string; zoom?: number; follow?: boolean }`.

Run: `npm run typecheck`
Expected: 0 erreur.

- [ ] **Step 8 : Vérifier que l'app démarre**

Run: `npm run dev` puis ouvrir `http://127.0.0.1:5173`.
Expected: le café s'affiche comme avant, aucune erreur console.

- [ ] **Step 9 : Commit**

```bash
git add -A app
git commit -m "chore(app): migrate the client to TypeScript

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2 : Changements serveur (grille, rooms privées, CORS)

**Files:**
- Modify: `server/src/index.ts` (handlers `move`, `furniture:place`, `furniture:move`, `room:create-private`, config socket.io CORS ~ligne 974)

**Interfaces:**
- Produces: le serveur accepte `col/row` dans `[0, 32[`, autorise `room:create-private` sans compte Google quand `ALLOW_GUEST_PRIVATE_ROOMS !== 'false'`, et accepte l'origine `http://127.0.0.1:5173`.

- [ ] **Step 1 : Ajouter les constantes de config en haut de `index.ts` (après les imports)**

```ts
// Grid bound shared by every room. The 3D café is 24x20; 32 leaves room for bigger layouts.
const MAX_GRID = 32;
// Until accounts ship, guests may own a private room. Set to "false" once auth lands.
const ALLOW_GUEST_PRIVATE_ROOMS = process.env.ALLOW_GUEST_PRIVATE_ROOMS !== "false";
const CORS_ORIGINS = (process.env.CORS_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173").split(",");
```

- [ ] **Step 2 : Remplacer les bornes en dur**

Dans `socket.on("move", …)` : `col >= 12` → `col >= MAX_GRID`, `row >= 12` → `row >= MAX_GRID`.
Dans `socket.on("furniture:place", …)` et `socket.on("furniture:move", …)` : `if (col < 0 || col >= 12 || row < 0 || row >= 12) return;` → `if (col < 0 || col >= MAX_GRID || row < 0 || row >= MAX_GRID) return;`

- [ ] **Step 3 : Flag sur la création de room privée**

Dans `socket.on("room:create-private", …)`, remplacer :

```ts
    if (!row?.googleId) return;
```
par
```ts
    if (!row?.googleId && !ALLOW_GUEST_PRIVATE_ROOMS) return;
```

- [ ] **Step 4 : CORS socket.io**

Remplacer `cors: { origin: "http://localhost:5173", methods: ["GET", "POST"] }` par `cors: { origin: CORS_ORIGINS, methods: ["GET", "POST"] }`.

- [ ] **Step 5 : Vérifier que le serveur démarre**

Run (depuis `server/`) : `npx tsc --noEmit && npm run dev`
Expected: `[+] Server running on port 3001`, 0 erreur TS. Arrêter avec Ctrl+C.

- [ ] **Step 6 : Commit**

```bash
git add server/src/index.ts
git commit -m "feat(server): widen grid bounds, allow guest private rooms behind a flag, configurable CORS

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3 : `coords.ts` — monde 3D ↔ cellule serveur

**Files:**
- Create: `app/src/coords.ts`
- Test: `app/tests/coords.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type RoomKind = 'public' | 'private';
  export const DIMS: Record<RoomKind, { w: number; d: number }>;
  export interface Cell { col: number; row: number }
  export function toCell(x: number, z: number, room: RoomKind): Cell;   // cellule contenant le point, bornée
  export function toWorld(col: number, row: number, room: RoomKind): { x: number; z: number }; // centre de la cellule
  ```

- [ ] **Step 1 : Écrire le test**

```ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {toCell,toWorld,DIMS} from '../src/coords.ts';

test('a world point maps to the floor tile that contains it',()=>{
 assert.deepEqual(toCell(-12,-10,'public'),{col:0,row:0});
 assert.deepEqual(toCell(-11.5,-9.5,'public'),{col:0,row:0});
 assert.deepEqual(toCell(0,0,'public'),{col:12,row:10});
 assert.deepEqual(toCell(11.9,9.9,'public'),{col:23,row:19});
 assert.deepEqual(toCell(-6,-5,'private'),{col:0,row:0});
});
test('points outside the room are clamped to the border tile',()=>{
 assert.deepEqual(toCell(-40,40,'public'),{col:0,row:19});
 assert.deepEqual(toCell(40,-40,'private'),{col:11,row:0});
});
test('a cell maps back to its centre',()=>{
 assert.deepEqual(toWorld(0,0,'public'),{x:-11.5,z:-9.5});
 assert.deepEqual(toWorld(23,19,'public'),{x:11.5,z:9.5});
 const c=toCell(3.2,-2.7,'private');const p=toWorld(c.col,c.row,'private');
 assert.deepEqual(toCell(p.x,p.z,'private'),c);
});
test('dimensions match the scene',()=>{assert.deepEqual(DIMS,{public:{w:24,d:20},private:{w:12,d:10}});});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `node --test tests/coords.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3 : Implémenter `app/src/coords.ts`**

```ts
// Pure mapping between Three.js world units (room centred on 0,0) and the server's integer grid.
export type RoomKind='public'|'private';
export const DIMS:Record<RoomKind,{w:number;d:number}>={public:{w:24,d:20},private:{w:12,d:10}};
export interface Cell{col:number;row:number}
const clamp=(v:number,max:number)=>Math.min(max,Math.max(0,v));
export function toCell(x:number,z:number,room:RoomKind):Cell{
  const {w,d}=DIMS[room];
  return {col:clamp(Math.floor(x+w/2),w-1),row:clamp(Math.floor(z+d/2),d-1)};
}
export function toWorld(col:number,row:number,room:RoomKind):{x:number;z:number}{
  const {w,d}=DIMS[room];
  return {x:-w/2+col+.5,z:-d/2+row+.5};
}
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add app/src/coords.ts app/tests/coords.test.ts
git commit -m "feat(app): add world/grid coordinate mapping

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4 : `identity.ts` — userId, pseudo, couleur

**Files:**
- Create: `app/src/identity.ts`
- Test: `app/tests/identity.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Identity { userId: string; name: string; color: number }
  export const PALETTE: { hex: number; label: string }[];   // 8 couleurs
  export function cleanName(raw: unknown): string | null;   // 2..20 caractères, espaces normalisés, sinon null
  export function loadIdentity(saved: unknown, uuid: () => string): { identity: Identity; fresh: boolean }; // fresh = pseudo manquant → dialogue à afficher
  ```

- [ ] **Step 1 : Écrire le test**

```ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadIdentity,cleanName,PALETTE} from '../src/identity.ts';

const uuid=()=>'u-1';
test('a first visit gets a fresh user id and needs a name',()=>{
 const {identity,fresh}=loadIdentity(null,uuid);
 assert.equal(identity.userId,'u-1');assert.equal(identity.name,'');assert.equal(fresh,true);
 assert.ok(PALETTE.some(p=>p.hex===identity.color));
});
test('a saved identity is kept as is',()=>{
 const {identity,fresh}=loadIdentity({userId:'abc',name:'Maxime',color:PALETTE[2].hex},uuid);
 assert.deepEqual(identity,{userId:'abc',name:'Maxime',color:PALETTE[2].hex});assert.equal(fresh,false);
});
test('corrupt fields fall back without losing the user id',()=>{
 const {identity,fresh}=loadIdentity({userId:'abc',name:'   ',color:'red'},uuid);
 assert.equal(identity.userId,'abc');assert.equal(identity.name,'');assert.equal(fresh,true);assert.equal(identity.color,PALETTE[0].hex);
});
test('names are trimmed, squeezed and bounded',()=>{
 assert.equal(cleanName('  Max   G '),'Max G');assert.equal(cleanName('x'),null);assert.equal(cleanName('a'.repeat(30))?.length,20);assert.equal(cleanName(42),null);
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `node --test tests/identity.test.ts` → FAIL.

- [ ] **Step 3 : Implémenter `app/src/identity.ts`**

```ts
// Who you are in the café. Stored locally until real accounts arrive; the server keys everything on userId.
export interface Identity{userId:string;name:string;color:number}
export const PALETTE=[
  {hex:0x819478,label:'Sauge'},{hex:0xc9764f,label:'Terracotta'},{hex:0x8aa6b8,label:'Ciel'},{hex:0xd2a754,label:'Miel'},
  {hex:0xa04050,label:'Grenat'},{hex:0x7a8e4a,label:'Olive'},{hex:0xb85530,label:'Brique'},{hex:0x384d43,label:'Forêt'},
];
export function cleanName(raw:unknown):string|null{
  if(typeof raw!=='string')return null;
  const name=raw.replace(/\s+/g,' ').trim().slice(0,20);
  return name.length>=2?name:null;
}
export function loadIdentity(saved:unknown,uuid:()=>string):{identity:Identity;fresh:boolean}{
  const s=(saved&&typeof saved==='object'?saved:{}) as Record<string,unknown>;
  const userId=typeof s.userId==='string'&&s.userId?s.userId:uuid();
  const name=cleanName(s.name)??'';
  const color=PALETTE.some(p=>p.hex===s.color)?s.color as number:PALETTE[0].hex;
  return {identity:{userId,name,color},fresh:!name};
}
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `npm test` → PASS.

- [ ] **Step 5 : Commit**

```bash
git add app/src/identity.ts app/tests/identity.test.ts
git commit -m "feat(app): add local player identity model

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5 : `tasks.ts` alimenté par le serveur

**Files:**
- Modify: `app/src/tasks.ts` (réécriture)
- Modify: `app/tests/tasks.test.ts` (réécriture)

**Interfaces:**
- Consumes: `import type { Task } from '@shared/types'` (`{id,userId,text,done,createdAt,category,type}`).
- Produces:
  ```ts
  export const CATEGORIES: { id: string; label: string; color: string }[];
  export interface TasksState { list: Task[] }
  export function createTasks(): TasksState;
  export function cleanText(raw: unknown): string;               // '' si vide ; 120 caractères max
  export function categoryId(id: unknown): string | null;         // id connu ou null
  export function setTasks(s: TasksState, tasks: Task[]): void;   // tasks:state
  export function taskAdded(s: TasksState, task: Task): void;     // task:added (en tête, ignore les doublons)
  export function taskToggled(s: TasksState, id: string, done: boolean): Task | null;
  export function taskUpdated(s: TasksState, id: string, text: string, category: string | null): Task | null;
  export function taskDeleted(s: TasksState, id: string): boolean;
  export function pending(s: TasksState): Task[];
  ```

- [ ] **Step 1 : Réécrire `tests/tasks.test.ts`**

```ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTasks,setTasks,taskAdded,taskToggled,taskUpdated,taskDeleted,pending,cleanText,categoryId} from '../src/tasks.ts';
import type {Task} from '@shared/types';

const t=(id:string,extra:Partial<Task>={}):Task=>({id,userId:'u',text:'Tâche '+id,done:false,createdAt:1,category:null,type:'task',...extra});

test('server state replaces the list and pending filters done tasks',()=>{
 const s=createTasks();setTasks(s,[t('a'),t('b',{done:true})]);
 assert.equal(s.list.length,2);assert.deepEqual(pending(s).map(x=>x.id),['a']);
 setTasks(s,[t('c')]);assert.deepEqual(s.list.map(x=>x.id),['c']);
});
test('added tasks go first and are never duplicated',()=>{
 const s=createTasks();setTasks(s,[t('a')]);taskAdded(s,t('b'));taskAdded(s,t('b'));
 assert.deepEqual(s.list.map(x=>x.id),['b','a']);
});
test('toggle, update and delete apply what the server says',()=>{
 const s=createTasks();setTasks(s,[t('a')]);
 assert.equal(taskToggled(s,'a',true)?.done,true);assert.equal(taskToggled(s,'zz',true),null);
 assert.equal(taskUpdated(s,'a','Relire','work')?.category,'work');assert.equal(s.list[0].text,'Relire');
 assert.equal(taskDeleted(s,'a'),true);assert.equal(taskDeleted(s,'a'),false);
});
test('text and category are validated before being sent',()=>{
 assert.equal(cleanText('  Écrire   le brief '),'Écrire le brief');assert.equal(cleanText('   '),'');assert.equal(cleanText('x'.repeat(500)).length,120);assert.equal(cleanText(null),'');
 assert.equal(categoryId('work'),'work');assert.equal(categoryId('nope'),null);
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `node --test tests/tasks.test.ts` → FAIL (exports manquants).

- [ ] **Step 3 : Réécrire `src/tasks.ts`**

```ts
// Task state fed by the server. Validation helpers run before an emit; everything else applies what the server said.
import type {Task} from '@shared/types';
export const CATEGORIES=[
  {id:'work',label:'Boulot',color:'#b85530'},
  {id:'perso',label:'Perso',color:'#7a8e4a'},
  {id:'urgent',label:'Urgent',color:'#a04050'},
  {id:'study',label:'Étude',color:'#8aa6b8'},
];
const MAX_TEXT=120;
export interface TasksState{list:Task[]}
export function createTasks():TasksState{return {list:[]};}
export const cleanText=(raw:unknown):string=>String(raw??'').replace(/\s+/g,' ').trim().slice(0,MAX_TEXT);
export const categoryId=(id:unknown):string|null=>CATEGORIES.some(c=>c.id===id)?id as string:null;
export function setTasks(s:TasksState,tasks:Task[]):void{s.list=[...tasks].sort((a,b)=>b.createdAt-a.createdAt);}
export function taskAdded(s:TasksState,task:Task):void{if(!s.list.some(t=>t.id===task.id))s.list.unshift(task);}
export function taskToggled(s:TasksState,id:string,done:boolean):Task|null{const t=s.list.find(t=>t.id===id);if(!t)return null;t.done=done;return t;}
export function taskUpdated(s:TasksState,id:string,text:string,category:string|null):Task|null{const t=s.list.find(t=>t.id===id);if(!t)return null;t.text=text;t.category=category;return t;}
export function taskDeleted(s:TasksState,id:string):boolean{const i=s.list.findIndex(t=>t.id===id);if(i<0)return false;s.list.splice(i,1);return true;}
export const pending=(s:TasksState):Task[]=>s.list.filter(t=>!t.done);
```

- [ ] **Step 4 : Lancer les tests**

Run: `npm test` → `tasks.test.ts` PASS. (`main.ts` ne compile plus : normal jusqu'à la Task 9 ; `npm run typecheck` est attendu en échec sur `main.ts` seulement entre les Tasks 5 et 9.)

- [ ] **Step 5 : Commit**

```bash
git add app/src/tasks.ts app/tests/tasks.test.ts
git commit -m "refactor(app): make the task model server-driven

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6 : `progress.ts` alimenté par le serveur

**Files:**
- Modify: `app/src/progress.ts` (réécriture)
- Modify: `app/tests/progress.test.ts` (réécriture)

**Interfaces:**
- Produces:
  ```ts
  export interface Progress { coins: number; xp: number; level: number; xpToNext: number; streak: number; achievements: string[] }
  export const ACHIEVEMENTS: { key: string; label: string; desc: string; icon: string }[];  // 8 entrées, clés serveur
  export function createProgress(): Progress;
  export function setCoins(p: Progress, coins: number): void;
  export function setXp(p: Progress, u: { xp: number; level: number; xpToNext: number }): void;
  export function setStreak(p: Progress, streak: number): void;
  export function unlock(p: Progress, key: string): boolean;       // true si nouveau
  export function setAchievements(p: Progress, keys: string[]): void; // profile:data
  export function levelOf(xp: number): number;
  export function levelInfo(p: { xp: number }): { level: number; into: number; span: number; next: number };
  ```

- [ ] **Step 1 : Réécrire `tests/progress.test.ts`**

```ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProgress,setCoins,setXp,setStreak,unlock,setAchievements,levelOf,levelInfo,ACHIEVEMENTS} from '../src/progress.ts';

test('level curve matches the server',()=>{
 assert.equal(levelOf(0),0);assert.equal(levelOf(50),1);assert.equal(levelOf(199),1);assert.equal(levelOf(200),2);assert.equal(levelOf(1250),5);
 assert.deepEqual(levelInfo({xp:120}),{level:1,into:70,span:150,next:200});
});
test('server updates are applied verbatim',()=>{
 const p=createProgress();setCoins(p,42);setXp(p,{xp:120,level:1,xpToNext:80});setStreak(p,3);
 assert.equal(p.coins,42);assert.equal(p.xp,120);assert.equal(p.level,1);assert.equal(p.xpToNext,80);assert.equal(p.streak,3);
});
test('achievements unlock once and unknown keys are ignored',()=>{
 const p=createProgress();
 assert.equal(unlock(p,'first-task'),true);assert.equal(unlock(p,'first-task'),false);assert.equal(unlock(p,'nope'),false);
 setAchievements(p,['first-pomo','zzz','first-task']);assert.deepEqual(p.achievements,['first-pomo','first-task']);
});
test('the catalogue lists the eight server achievements',()=>{
 assert.deepEqual(ACHIEVEMENTS.map(a=>a.key),['first-task','task-10','task-50','first-pomo','streak-5','coins-100','coins-500','first-collective']);
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `node --test tests/progress.test.ts` → FAIL.

- [ ] **Step 3 : Réécrire `src/progress.ts`**

```ts
// Progression state fed by the server: coins, XP, streak and achievements. Labels live here, rules live server-side.
export interface Progress{coins:number;xp:number;level:number;xpToNext:number;streak:number;achievements:string[]}
export const ACHIEVEMENTS=[
  {key:'first-task',label:'1ère tâche !',desc:'Première tâche complétée',icon:'✅'},
  {key:'task-10',label:'10 tâches !',desc:'10 tâches complétées',icon:'🔟'},
  {key:'task-50',label:'50 tâches !',desc:'50 tâches complétées',icon:'🏆'},
  {key:'first-pomo',label:'1er Pomodoro !',desc:'Premier pomodoro terminé',icon:'🍅'},
  {key:'streak-5',label:'Streak ×5 !',desc:'5 pomodoros consécutifs',icon:'🔥'},
  {key:'coins-100',label:'100 pièces !',desc:'100 pièces accumulées',icon:'💰'},
  {key:'coins-500',label:'500 pièces !',desc:'500 pièces accumulées',icon:'👑'},
  {key:'first-collective',label:'Pomo collectif !',desc:'Premier pomodoro partagé',icon:'🤝'},
];
const KEYS=new Set(ACHIEVEMENTS.map(a=>a.key));
export const levelOf=(xp:number):number=>Math.floor(Math.sqrt(Math.max(0,xp)/50));
export const xpForLevel=(level:number):number=>level*level*50;
export function createProgress():Progress{return {coins:0,xp:0,level:0,xpToNext:50,streak:0,achievements:[]};}
export function setCoins(p:Progress,coins:number):void{p.coins=Math.max(0,Math.floor(coins));}
export function setXp(p:Progress,u:{xp:number;level:number;xpToNext:number}):void{p.xp=u.xp;p.level=u.level;p.xpToNext=u.xpToNext;}
export function setStreak(p:Progress,streak:number):void{p.streak=Math.max(0,streak);}
export function unlock(p:Progress,key:string):boolean{if(!KEYS.has(key)||p.achievements.includes(key))return false;p.achievements.push(key);return true;}
export function setAchievements(p:Progress,keys:string[]):void{p.achievements=keys.filter(k=>KEYS.has(k));}
export function levelInfo(p:{xp:number}){const level=levelOf(p.xp),floor=xpForLevel(level),next=xpForLevel(level+1);return {level,into:p.xp-floor,span:next-floor,next};}
```

- [ ] **Step 4 : Lancer les tests**

Run: `npm test` → `progress.test.ts` PASS. `shop.test.ts` échoue encore (il importait `completeTask`) : corrigé en Task 7.

- [ ] **Step 5 : Commit**

```bash
git add app/src/progress.ts app/tests/progress.test.ts
git commit -m "refactor(app): make the progression model server-driven

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7 : `shop.ts` alimenté par le serveur

**Files:**
- Modify: `app/src/shop.ts` (réécriture partielle)
- Modify: `app/tests/shop.test.ts` (réécriture)

**Interfaces:**
- Produces:
  ```ts
  export const HATS, FURNITURE, SETS, GRID;                    // inchangés
  export const footprint, cellsOf, item;                       // inchangés
  export interface Placed { c: number; r: number }
  export interface ShopState { hats: string[]; hat: string | null; furniture: string[]; placed: Record<string, Placed> }
  export function createShop(): ShopState;
  export function setCosmetics(s, u: { owned: string[]; equippedHat: string | null }): void;          // cosmetics:state
  export function setFurniture(s, u: { owned: string[]; placed: string[]; positions: Record<string, { col: number; row: number }> }): void; // furniture:state
  export function canPlace(s, id: string, cell: Placed): boolean;   // validation locale avant emit
  export function takenCells(s, except?: string | null): Set<string>;
  export function completeSets(s): typeof SETS;
  export const toServerCell = (cell: Placed) => ({ col: cell.c, row: cell.r });
  ```
- Supprimés : `buy`, `equipHat`, `place`, `unplace`, `bonuses` (le serveur les fait).

- [ ] **Step 1 : Réécrire `tests/shop.test.ts`**

```ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createShop,setCosmetics,setFurniture,canPlace,takenCells,completeSets,toServerCell,GRID} from '../src/shop.ts';

test('cosmetics state sets owned hats and the worn one only if owned',()=>{
 const s=createShop();setCosmetics(s,{owned:['hat-party','ghost'],equippedHat:'hat-crown'});
 assert.deepEqual(s.hats,['hat-party']);assert.equal(s.hat,null);
 setCosmetics(s,{owned:['hat-party'],equippedHat:'hat-party'});assert.equal(s.hat,'hat-party');
});
test('furniture state keeps placed pieces with a valid, non-overlapping cell',()=>{
 const s=createShop();
 setFurniture(s,{owned:['plant','lamp','bookshelf','cactus'],placed:['plant','lamp','bookshelf','cactus'],positions:{plant:{col:1,row:5},lamp:{col:1,row:5},bookshelf:{col:6,row:10},cactus:{col:3,row:7}}});
 assert.deepEqual(s.furniture,['plant','lamp','bookshelf','cactus']);
 assert.deepEqual(s.placed,{plant:{c:1,r:5},cactus:{c:3,r:7}});// lamp overlaps the plant, the bookshelf sticks out of the room
});
test('pieces not in the placed list stay stored',()=>{
 const s=createShop();setFurniture(s,{owned:['plant'],placed:[],positions:{plant:{col:1,row:5}}});assert.deepEqual(s.placed,{});
});
test('local placement validation mirrors the room grid',()=>{
 const s=createShop();setFurniture(s,{owned:['plant','lamp','bookshelf'],placed:['plant'],positions:{plant:{col:2,row:3}}});
 assert.equal(canPlace(s,'lamp',{c:2,r:3}),false);assert.equal(canPlace(s,'lamp',{c:GRID.cols,r:0}),false);assert.equal(canPlace(s,'lamp',{c:5,r:5}),true);
 assert.equal(canPlace(s,'bookshelf',{c:0,r:GRID.rows-1}),false);assert.equal(canPlace(s,'bookshelf',{c:2,r:4}),true);
 assert.equal(canPlace(s,'plant',{c:2,r:3}),true);// moving onto its own cell
 assert.equal(canPlace(s,'cactus',{c:0,r:0}),false);// not owned
 assert.deepEqual([...takenCells(s)],['2,3']);assert.deepEqual([...takenCells(s,'plant')],[]);
 assert.deepEqual(toServerCell({c:4,r:1}),{col:4,row:1});
});
test('a set is complete when every piece is owned',()=>{
 const s=createShop();setFurniture(s,{owned:['plant','cactus','lamp'],placed:[],positions:{}});
 assert.deepEqual(completeSets(s).map(x=>x.id),['jardin']);
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `node --test tests/shop.test.ts` → FAIL.

- [ ] **Step 3 : Réécrire `src/shop.ts`**

Garder tel quel : `HATS`, `FURNITURE`, `SETS`, `GRID`, `footprint`, `cellsOf`, `item`. Remplacer le reste par :

```ts
export interface Placed{c:number;r:number}
export interface ShopState{hats:string[];hat:string|null;furniture:string[];placed:Record<string,Placed>}
export const toServerCell=(cell:Placed)=>({col:cell.c,row:cell.r});
const isHat=(id:string)=>HATS.some(h=>h.id===id),isFurniture=(id:string)=>FURNITURE.some(f=>f.id===id);
const validCell=(id:string,cell:Placed)=>{const f=footprint(id);return Number.isInteger(cell.c)&&Number.isInteger(cell.r)&&cell.c>=0&&cell.r>=0&&cell.c+f.w<=GRID.cols&&cell.r+f.d<=GRID.rows;};
export function createShop():ShopState{return {hats:[],hat:null,furniture:[],placed:{}};}
export function setCosmetics(s:ShopState,u:{owned:string[];equippedHat:string|null}):void{
  s.hats=u.owned.filter(isHat);s.hat=u.equippedHat&&s.hats.includes(u.equippedHat)?u.equippedHat:null;
}
// The server's placed list may hold pieces with a default spot that does not fit this room; those stay stored until placed by hand.
export function setFurniture(s:ShopState,u:{owned:string[];placed:string[];positions:Record<string,{col:number;row:number}>}):void{
  s.furniture=u.owned.filter(isFurniture);s.placed={};const used=new Set<string>();
  for(const id of u.placed){
    const pos=u.positions[id];if(!s.furniture.includes(id)||!pos)continue;const cell={c:pos.col,r:pos.row};
    if(!validCell(id,cell))continue;const cells=cellsOf(id,cell);if(cells.some(k=>used.has(k)))continue;
    s.placed[id]=cell;cells.forEach(k=>used.add(k));
  }
}
export function takenCells(s:ShopState,except:string|null=null):Set<string>{const t=new Set<string>();for(const [id,cell] of Object.entries(s.placed))if(id!==except)cellsOf(id,cell).forEach(k=>t.add(k));return t;}
export function canPlace(s:ShopState,id:string,cell:Placed):boolean{
  if(!s.furniture.includes(id)||!isFurniture(id)||!validCell(id,cell))return false;
  const taken=takenCells(s,id);return !cellsOf(id,cell).some(k=>taken.has(k));
}
export const completeSets=(s:ShopState)=>SETS.filter(set=>set.items.every(id=>s.furniture.includes(id)));
```

Vérifier que `footprint`/`cellsOf` sont typés : `export const footprint=(id:string)=>({w:1,d:id==='bookshelf'?2:1});` et `export const cellsOf=(id:string,{c,r}:Placed):string[]=>…`.

- [ ] **Step 4 : Lancer les tests**

Run: `npm test` → tous PASS (`core`, `coords`, `identity`, `tasks`, `progress`, `shop`).

- [ ] **Step 5 : Commit**

```bash
git add app/src/shop.ts app/tests/shop.test.ts
git commit -m "refactor(app): make the shop model server-driven

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8 : `net.ts` — socket typé, statut, join / rejoin

**Files:**
- Create: `app/src/net.ts`
- Test: `app/tests/net.test.ts`

**Interfaces:**
- Consumes: `Identity` (Task 4), `ClientToServerEvents` / `ServerToClientEvents` de `@shared/types`.
- Produces:
  ```ts
  export type NetStatus = 'connecting' | 'online' | 'offline' | 'replaced';
  export interface NetSocket {   // sous-ensemble de socket.io-client utilisé, pour pouvoir injecter un faux en test
    connected: boolean;
    on(event: string, cb: (...args: any[]) => void): unknown;
    emit(event: string, ...args: any[]): unknown;
    disconnect(): unknown;
  }
  export interface Net {
    socket: Socket<ServerToClientEvents, ClientToServerEvents>;
    status(): NetStatus;
    onStatus(cb: (s: NetStatus) => void): void;
    setRoom(roomId: string): void;      // room à (re)joindre au prochain connect
    roomId(): string;
  }
  export function createNet(identity: Identity, roomId: string, socket: NetSocket): Net;
  export function connect(url: string, identity: Identity, roomId: string): Net;  // crée le socket réel via io()
  ```
  Règles : à chaque `connect` du socket → `emit('join', {name, color, col: 0, row: 0, userId, roomId})` et statut `online` ; `disconnect` → `offline` ; `session:replaced` → `replaced` puis `socket.disconnect()` et plus aucun rejoin ; `room:info` met à jour `roomId()`.

- [ ] **Step 1 : Écrire le test avec un faux socket**

```ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNet} from '../src/net.ts';

function fakeSocket(){
  const handlers=new Map<string,((...a:any[])=>void)[]>(),sent:[string,unknown][]=[];
  const s={connected:false,disconnected:0,sent,
    on(e:string,cb:(...a:any[])=>void){handlers.set(e,[...(handlers.get(e)??[]),cb]);return s;},
    emit(e:string,...a:unknown[]){sent.push([e,a[0]]);return s;},
    disconnect(){s.connected=false;s.disconnected++;return s;},
    fire(e:string,...a:unknown[]){if(e==='connect')s.connected=true;if(e==='disconnect')s.connected=false;for(const cb of handlers.get(e)??[])cb(...a);}};
  return s;
}
const me={userId:'u1',name:'Max',color:0x819478};

test('joins on connect and again on every reconnect, with the current room',()=>{
  const s=fakeSocket(),net=createNet(me,'ocean',s);const seen:string[]=[];net.onStatus(x=>seen.push(x));
  assert.equal(net.status(),'connecting');
  s.fire('connect');assert.deepEqual(s.sent[0],['join',{name:'Max',color:0x819478,col:0,row:0,userId:'u1',roomId:'ocean'}]);assert.equal(net.status(),'online');
  s.fire('room:info',{roomId:'room-42'});assert.equal(net.roomId(),'room-42');
  s.fire('disconnect');assert.equal(net.status(),'offline');
  s.fire('connect');assert.deepEqual(s.sent[1][1],{...s.sent[0][1] as object,roomId:'room-42'});
  assert.deepEqual(seen,['online','offline','online']);
});
test('a replaced session disconnects for good',()=>{
  const s=fakeSocket(),net=createNet(me,'ocean',s);s.fire('connect');
  s.fire('session:replaced');assert.equal(net.status(),'replaced');assert.equal(s.disconnected,1);
  s.fire('connect');assert.equal(s.sent.length,1);assert.equal(net.status(),'replaced');
});
test('setRoom changes what the next join asks for',()=>{
  const s=fakeSocket(),net=createNet(me,'ocean',s);net.setRoom('forest');s.fire('connect');
  assert.equal((s.sent[0][1] as {roomId:string}).roomId,'forest');
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `node --test tests/net.test.ts` → FAIL.

- [ ] **Step 3 : Implémenter `app/src/net.ts`**

```ts
// Thin typed layer over socket.io-client: connection status and the join handshake, nothing else.
import {io,type Socket} from 'socket.io-client';
import type {ClientToServerEvents,ServerToClientEvents} from '@shared/types';
import type {Identity} from './identity.ts';

export type NetStatus='connecting'|'online'|'offline'|'replaced';
export interface NetSocket{connected:boolean;on(event:string,cb:(...args:any[])=>void):unknown;emit(event:string,...args:any[]):unknown;disconnect():unknown}
export interface Net{socket:Socket<ServerToClientEvents,ClientToServerEvents>;status():NetStatus;onStatus(cb:(s:NetStatus)=>void):void;setRoom(roomId:string):void;roomId():string}

export function createNet(identity:Identity,initialRoom:string,socket:NetSocket):Net{
  let status:NetStatus='connecting',room=initialRoom;const listeners:((s:NetStatus)=>void)[]=[];
  const set=(s:NetStatus)=>{status=s;listeners.forEach(cb=>cb(s));};
  socket.on('connect',()=>{
    if(status==='replaced')return;
    socket.emit('join',{name:identity.name,color:identity.color,col:0,row:0,userId:identity.userId,roomId:room});set('online');
  });
  socket.on('disconnect',()=>{if(status!=='replaced')set('offline');});
  socket.on('room:info',({roomId}:{roomId:string})=>{room=roomId;});
  socket.on('session:replaced',()=>{set('replaced');socket.disconnect();});
  return {socket:socket as unknown as Socket<ServerToClientEvents,ClientToServerEvents>,status:()=>status,onStatus(cb){listeners.push(cb);},setRoom(id){room=id;},roomId:()=>room};
}
export function connect(url:string,identity:Identity,roomId:string):Net{
  const socket:Socket<ServerToClientEvents,ClientToServerEvents>=io(url,{transports:['websocket'],reconnectionDelayMax:5000});
  return createNet(identity,roomId,socket as unknown as NetSocket);
}
```

- [ ] **Step 4 : Lancer les tests**

Run: `npm test` → PASS.

- [ ] **Step 5 : Commit**

```bash
git add app/src/net.ts app/tests/net.test.ts
git commit -m "feat(app): add typed socket layer with join and status handling

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9 : `main.ts` — identité, connexion, tâches et progression via le serveur

**Files:**
- Modify: `app/src/main.ts` (blocs « Progression », « Tasks », démarrage), `app/src/style.css`

**Interfaces:**
- Consumes: `loadIdentity`, `cleanName`, `PALETTE` (Task 4) ; `connect`, `Net` (Task 8) ; modèles Tasks 5-6.
- Produces: variables de module `identity: Identity`, `net: Net`, `tasks: TasksState`, `progress: Progress`, fonctions `renderTasks()`, `renderProgress()`, `toast()`, `later()`, `celebrate()` réutilisées par les Tasks 10 et 12.

- [ ] **Step 1 : Dialogue d'identité et voile de connexion dans le markup**

Dans le template `$('#app').innerHTML`, après `#help-dialog`, ajouter :

```html
  <dialog id="identity-dialog"><form id="identity-form" method="dialog"><div class="dialog-heading"><h2>On se présente ?</h2></div>
    <p>Un pseudo et une couleur, c'est tout ce qu'il faut pour entrer au café.</p>
    <label>Pseudo<input name="name" type="text" minlength="2" maxlength="20" required autocomplete="nickname" /></label>
    <div class="palette" role="radiogroup" aria-label="Couleur">${PALETTE.map((p,i)=>`<label class="swatch" style="--swatch:#${p.hex.toString(16).padStart(6,'0')}" title="${p.label}"><input type="radio" name="color" value="${p.hex}" ${i===0?'checked':''}/></label>`).join('')}</div>
    <button class="primary" type="submit">${icon('coffee')}<span>Entrer au café</span></button>
  </form></dialog>
  <div id="net-veil" class="net-veil" role="status"><span class="veil-label">${icon('coffee')}<span id="net-text">Connexion au café…</span></span></div>
```

Et dans `.hud-top`, à côté du `#progress-chip`, un bouton `<button id="identity-chip" class="identity-chip" aria-label="Changer de pseudo"><span class="swatch-dot" id="identity-dot"></span><span id="identity-name"></span></button>`.

CSS à ajouter à `style.css` :

```css
.net-veil{position:fixed;inset:0;z-index:7;background:#eee9dfe6;backdrop-filter:blur(6px);display:grid;place-items:center;transition:opacity .35s}.net-veil[hidden]{display:none}.net-veil .veil-label{opacity:1}
.palette{display:flex;gap:8px;margin:14px 0}.swatch{width:28px;height:28px;border-radius:50%;background:var(--swatch);display:grid;place-items:center;cursor:pointer;border:3px solid transparent}.swatch:has(input:checked){border-color:#fffdf2;box-shadow:0 0 0 2px #657757}.swatch input{appearance:none;margin:0}
.identity-chip{display:flex;align-items:center;gap:7px;background:#fbfcf3d9;border:1px solid #fff9;border-radius:99px;padding:6px 12px;font-size:11px;color:#66735c}.swatch-dot{width:10px;height:10px;border-radius:50%;background:var(--swatch,#819478)}
```

- [ ] **Step 2 : Charger l'identité et demander le pseudo si besoin**

En haut de `main.ts`, remplacer les imports des modèles par les nouveaux et ajouter :

```ts
import {loadIdentity,cleanName,PALETTE,type Identity} from './identity.ts';
import {connect,type Net} from './net.ts';
import {createTasks,setTasks,taskAdded,taskToggled,taskUpdated,taskDeleted,pending,cleanText,CATEGORIES} from './tasks.ts';
import {createProgress,setCoins,setXp,setStreak,unlock,setAchievements,levelInfo,ACHIEVEMENTS} from './progress.ts';
import {HATS,FURNITURE,SETS,createShop,setCosmetics,setFurniture,canPlace,takenCells,completeSets,toServerCell,item as shopItem} from './shop.ts';
```

Après `drawIcons()` :

```ts
const uuid=()=>crypto.randomUUID?.()??`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const {identity,fresh}=loadIdentity(load('gamitask.identity',null),uuid);
function saveIdentity(){save('gamitask.identity',identity);renderIdentity();}
function renderIdentity(){$('#identity-name').textContent=identity.name||'Invité';($('#identity-dot') as HTMLElement).style.setProperty('--swatch',`#${identity.color.toString(16).padStart(6,'0')}`);}
function askIdentity():Promise<void>{
  const dialog=$('#identity-dialog') as HTMLDialogElement,form=$('#identity-form') as HTMLFormElement;
  (form.elements.namedItem('name') as HTMLInputElement).value=identity.name;
  for(const r of form.querySelectorAll<HTMLInputElement>('input[name=color]'))r.checked=Number(r.value)===identity.color;
  dialog.showModal();
  return new Promise(resolve=>{form.onsubmit=e=>{const name=cleanName((form.elements.namedItem('name') as HTMLInputElement).value);if(!name){e.preventDefault();return;}
    identity.name=name;identity.color=Number((form.elements.namedItem('color') as RadioNodeList).value);saveIdentity();resolve();};});
}
renderIdentity();
```

Le dialogue de première visite ne doit pas se fermer par Échap tant que le pseudo est vide : `dialog.addEventListener('cancel',e=>{if(!identity.name)e.preventDefault();});`.

- [ ] **Step 3 : Connexion et voile**

Après le bloc identité :

```ts
const API_URL=(import.meta.env.VITE_API_URL as string|undefined)??'http://localhost:3001';
let net:Net;
const veil=$('#net-veil') as HTMLElement,veilText=$('#net-text') as HTMLElement;
function showVeil(text:string|null){veil.hidden=text===null;if(text)veilText.textContent=text;}
let ready={room:false,tasks:false};
function maybeReady(){if(ready.room&&ready.tasks)showVeil(null);}
async function start(){
  if(fresh)await askIdentity();
  net=connect(API_URL,identity,load('gamitask.room','public')==='private'?'private':'ocean');// 'private' is resolved to the real room id in Task 12
  net.onStatus(s=>{
    if(s==='online'){ready={room:false,tasks:false};showVeil('Connexion au café…');}
    if(s==='offline')showVeil('Le café est injoignable, on réessaie…');
    if(s==='replaced')showVeil('Le café est ouvert dans un autre onglet.');
  });
  bindServerEvents();
}
```

Ajouter `/// <reference types="vite/client" />` en tête de `main.ts` pour typer `import.meta.env`. Le bouton `#identity-chip` : `$('#identity-chip').onclick=()=>askIdentity().then(()=>toast('À bientôt sous ce nom. Il sera pris en compte à la prochaine connexion.'));` (le pseudo est envoyé au `join`, donc au prochain connect ; suffisant pour cette itération).

- [ ] **Step 4 : Tâches via le serveur**

Remplacer le bloc « Tasks » :

```ts
const tasks=createTasks();
let newCategory:string|null=null;
const catOf=(id:string|null)=>CATEGORIES.find(c=>c.id===id);
function syncScene(){cafe?.setTasks(pending(tasks));}
function renderTasks(){ /* inchangé, mais itère sur tasks.list sans `rewarded` et sans tri manuel supplémentaire */ }
$('#task-form').onsubmit=e=>{e.preventDefault();const text=cleanText(($('#task-text') as HTMLInputElement).value);if(!text)return;
  net.socket.emit('task:add',{userId:identity.userId,text,category:newCategory,type:($('#task-daily') as HTMLInputElement).checked?'daily':'task'});($('#task-text') as HTMLInputElement).value='';};
$('#task-list').addEventListener('click',e=>{
  const li=(e.target as HTMLElement).closest('li');if(!li)return;const id=li.dataset.id!;const target=e.target as HTMLElement;
  if(target.closest('.check-button'))net.socket.emit('task:toggle',{userId:identity.userId,taskId:id});
  else if(target.closest('.cat-dot')){const t=tasks.list.find(t=>t.id===id);if(!t)return;const i=CATEGORIES.findIndex(c=>c.id===t.category);net.socket.emit('task:update',{userId:identity.userId,taskId:id,text:t.text,category:i+1<CATEGORIES.length?CATEGORIES[i+1].id:null});}
  else if(target.closest('.remove-task'))net.socket.emit('task:delete',{userId:identity.userId,taskId:id});
});
$('#task-list').addEventListener('focusout',e=>{const el=e.target as HTMLElement;if(!el.matches('.task-text'))return;const id=el.closest('li')!.dataset.id!;const t=tasks.list.find(t=>t.id===id);const text=cleanText(el.textContent);
  if(!t||!text){if(t)el.textContent=t.text;return;}if(text!==t.text)net.socket.emit('task:update',{userId:identity.userId,taskId:id,text,category:t.category});});
```

Supprimer : la migration `gamitask.intention`, `persistTasks`, le `setInterval` de reset quotidien, `rewardTask`.

- [ ] **Step 5 : Progression via le serveur**

Remplacer le bloc « Progression » :

```ts
const progress=createProgress();
function renderProgress(){ /* comme avant, en lisant progress.coins / levelInfo(progress) / progress.streak / progress.achievements */ }
function rewardPomodoro(){net.socket.emit('pomodoro:complete',{userId:identity.userId});}
```

Dans `renderTimer`, l'appel `rewardPomodoro()` reste au même endroit. Supprimer `save('gamitask.progress',…)` et `saveShop()`.

- [ ] **Step 6 : Réception des événements serveur**

```ts
function bindServerEvents(){
  const s=net.socket;
  s.on('tasks:state',({tasks:list,coins})=>{setTasks(tasks,list);setCoins(progress,coins);ready.tasks=true;maybeReady();renderTasks();renderProgress();syncScene();});
  s.on('task:added',t=>{taskAdded(tasks,t);renderTasks();syncScene();});
  s.on('task:toggled',({taskId,done,coins})=>{const t=taskToggled(tasks,taskId,done);const before=progress.coins;setCoins(progress,coins);renderTasks();renderProgress();syncScene();
    if(t&&done)toast(`${t.type==='daily'?'Fait pour aujourd’hui.':'C’est fait.'}${coins>before?` +${coins-before} pièces.`:''}`);});
  s.on('task:updated',({taskId,text,category})=>{taskUpdated(tasks,taskId,text,category);renderTasks();syncScene();});
  s.on('task:deleted',({taskId})=>{taskDeleted(tasks,taskId);renderTasks();syncScene();});
  s.on('coins:update',({coins})=>{setCoins(progress,coins);renderProgress();renderShop();});
  s.on('xp:update',u=>{const before=progress.level;setXp(progress,u);renderProgress();if(u.levelUp&&u.level>before)later(()=>toast(`✨ Niveau ${u.level} ! Le café te va de mieux en mieux.`),2600);});
  s.on('streak:update',({streak,bonus})=>{setStreak(progress,streak);renderProgress();toast(`Une petite victoire de plus.${bonus>5?` Série ×${streak}.`:''}`);});
  s.on('achievement:unlocked',a=>{if(unlock(progress,a.key)){renderProgress();later(()=>toast(`${a.icon} Succès : ${a.label} — ${a.desc}`),2600);}});
  s.on('profile:data',d=>{setAchievements(progress,d.achievements);setStreak(progress,d.streak);renderProgress();});
  s.on('room:full',()=>{showVeil('Le café est plein pour le moment, on réessaie dans un instant…');setTimeout(()=>net.socket.emit('join',{name:identity.name,color:identity.color,col:0,row:0,userId:identity.userId,roomId:net.roomId()}),5000);});
  // room-state, cosmetics, furniture and presence handlers are added in Tasks 10 and 12
}
$('#progress-chip').onclick=()=>{net.socket.emit('profile:request',{socketId:null});($('#progress-dialog') as HTMLDialogElement).showModal();};
```

Remplacer l'appel de démarrage `mountRoom()` existant : garder `mountRoom()` (la scène s'affiche derrière le voile) puis appeler `start()`.

- [ ] **Step 7 : Typecheck, puis vérification manuelle**

Run: `npm run typecheck` — corriger jusqu'à 0 erreur (les références à `shop.owned`, `buy`, `equipHat`, `place`, `unplace`, `bonuses` dans le bloc shop de `main.ts` sont réécrites en Task 10 ; d'ici là, commenter ce bloc avec un `// TODO Task 10` est acceptable **uniquement** pour cette étape intermédiaire et doit disparaître en Task 10).

Manuel : `cd server && npm run dev` dans un terminal, `cd app && npm run dev` dans un autre. Ouvrir `http://127.0.0.1:5173`.
Expected :
- premier lancement : dialogue pseudo/couleur, puis voile « Connexion au café… » qui disparaît ;
- ajouter une tâche → elle apparaît (ardoise dans le café), cocher → toast avec les pièces, `#coins` augmente ;
- recharger → tâche et pièces toujours là ;
- arrêter le serveur → voile « injoignable », relancer → voile disparaît, état rechargé ;
- ouvrir un second onglet avec le même localStorage → le premier affiche « ouvert dans un autre onglet ».

- [ ] **Step 8 : Commit**

```bash
git add app/src/main.ts app/src/style.css
git commit -m "feat(app): connect identity, tasks and progression to the server

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10 : `main.ts` — boutique et mobilier via le serveur

**Files:**
- Modify: `app/src/main.ts` (bloc « shop » et « Placement »)

**Interfaces:**
- Consumes: `ShopState` et helpers (Task 7), `net`, `progress`, `toast`, `renderProgress` (Task 9), `cafe.startPlacing/stopPlacing/setHat` (scène existante).
- Produces: `shop: ShopState`, `renderShop()`, handlers `cosmetics:state`, `furniture:state`, `shop:bought`, `furniture:bought`.

- [ ] **Step 1 : État et rendu**

```ts
const shop=createShop();
function renderShop(){
  const home=room==='private',done=completeSets(shop);
  $('#shop-coins').textContent=String(progress.coins);$('#shop-where').textContent=home?'— chez toi':'— à installer chez toi';
  $('#shop-hats').innerHTML=HATS.map(h=>{const owned=shop.hats.includes(h.id),worn=shop.hat===h.id;
    return `<li class="${owned?'owned':''}"><span class="shop-emoji">${h.emoji}</span><span class="shop-name">${h.name}<small>${owned?(worn?'Porté':'À toi'):`${h.price} pièces`}</small></span><span class="shop-actions">${owned?`<button data-hat="${h.id}">${worn?'Retirer':'Porter'}</button>`:`<button data-buy="${h.id}" ${progress.coins<h.price?'disabled':''}>Acheter</button>`}</span></li>`;}).join('');
  $('#shop-furniture').innerHTML=FURNITURE.map(f=>{const owned=shop.furniture.includes(f.id),placed=f.id in shop.placed,set=SETS.find(s=>s.id===f.set)!;
    const action=!owned?`<button data-buy-furniture="${f.id}" ${progress.coins<f.price?'disabled':''}>Acheter</button>`:!home?'<small>chez toi</small>':placed?`<button data-move="${f.id}">Déplacer</button><button data-unplace="${f.id}" class="quiet">Ranger</button>`:`<button data-place="${f.id}">Placer</button>`;
    return `<li class="${owned?'owned':''}"><span class="shop-emoji">${f.emoji}</span><span class="shop-name">${f.name}<small>${owned?(placed?'Installé':'Rangé'):`${f.price} pièces`} · set ${set.emoji}</small></span><span class="shop-actions">${action}</span></li>`;}).join('');
  $('#shop-sets').innerHTML=SETS.map(s=>{const have=s.items.filter(id=>shop.furniture.includes(id)).length,full=done.includes(s);
    return `<li class="${full?'owned':''}"><span class="shop-emoji">${s.emoji}</span><span class="shop-name">${s.name}<small>${s.desc} · ${have}/${s.items.length}</small></span></li>`;}).join('');
}
```

- [ ] **Step 2 : Actions → emit**

```ts
$('#tab-shop').addEventListener('click',e=>{
  const b=(e.target as HTMLElement).closest('button');if(!b)return;const d=b.dataset;
  if(d.buy)net.socket.emit('shop:buy',{userId:identity.userId,itemId:d.buy});
  else if(d.buyFurniture)net.socket.emit('furniture:buy',{userId:identity.userId,itemId:d.buyFurniture});
  else if(d.hat)net.socket.emit('cosmetic:equip',{userId:identity.userId,hatId:shop.hat===d.hat?null:d.hat});
  else if(d.place||d.move)startPlacing(d.place||d.move!);
  else if(d.unplace)net.socket.emit('furniture:toggle-place',{userId:identity.userId,itemId:d.unplace});
});
```

Le serveur ne renvoie pas d'erreur explicite quand il manque des pièces : les boutons « Acheter » sont déjà désactivés en dessous du prix, c'est suffisant.

- [ ] **Step 3 : Placement**

```ts
function startPlacing(id:string){
  if(room!=='private'||!cafe)return;placingId=id;placingCell=null;openDrawer(false);
  $('#place-text').innerHTML=`Clique une case pour ${shop.placed[id]?'déplacer':'poser'} <strong>${shopItem(id)!.emoji} ${shopItem(id)!.name}</strong>`;($('#place-ok') as HTMLButtonElement).disabled=true;($('#place-bar') as HTMLElement).hidden=false;drawIcons();
  cafe.startPlacing(id,shop.placed[id]??null,takenCells(shop,id));
}
$('#place-ok').onclick=()=>{if(!placingId||!placingCell||!canPlace(shop,placingId,placingCell))return;
  net.socket.emit(shop.placed[placingId]?'furniture:move':'furniture:place',{userId:identity.userId,itemId:placingId,...toServerCell(placingCell)});endPlacing();};
```

`cosmetic:equip` côté serveur ne renvoie rien au joueur lui-même (seulement `player-hat` aux autres) : après l'emit, appliquer localement `shop.hat=…; cafe?.setHat(shop.hat); renderShop();` — c'est le seul cas d'application optimiste, justifié par le protocole.

- [ ] **Step 4 : Réception**

Dans `bindServerEvents()` :

```ts
  s.on('cosmetics:state',u=>{setCosmetics(shop,u);cafe?.setHat(shop.hat);renderShop();});
  s.on('shop:bought',({itemId})=>{const it=shopItem(itemId);if(it)toast(`${it.emoji} ${it.name} est à toi.`);net.socket.emit('cosmetic:equip',{userId:identity.userId,hatId:itemId});shop.hat=itemId;cafe?.setHat(itemId);});
  s.on('furniture:bought',({itemId})=>{const it=shopItem(itemId);if(it)toast(`${it.emoji} ${it.name} t’attend chez toi.`);});
  s.on('furniture:state',u=>{const before=JSON.stringify(shop.placed);setFurniture(shop,u);renderShop();if(room==='private'&&JSON.stringify(shop.placed)!==before)rearrange('C’est posé.');});
```

`rearrange()` existant reste (rebuild de la pièce avec `shop.placed`) ; `mountRoom()` passe `furniture:shop.placed,hat:shop.hat` comme avant.

- [ ] **Step 5 : Typecheck et vérification manuelle**

Run: `npm run typecheck` → 0 erreur, plus aucun `TODO Task 10`.
Manuel (serveur + app lancés) : acheter un chapeau (donner des pièces via quelques tâches) → il apparaît sur l'avatar, persiste au rechargement ; acheter un meuble → toast. Le placement chez soi est vérifié en Task 12 (il faut la room privée serveur).

- [ ] **Step 6 : Commit**

```bash
git add app/src/main.ts
git commit -m "feat(app): drive the shop and furniture from the server

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11 : `scene.ts` — avatars distants

**Files:**
- Modify: `app/src/scene.ts` (après la création du `barista`, et dans `animate`, `dispose`, l'objet retourné)

**Interfaces:**
- Consumes: `person()`, `walker()`, `buildHat()`, `seats`, `navigation`, `reducedMotion`, `HW/HD`, `room` (existants dans la closure de `createCafe`).
- Produces (ajouts à l'objet retourné) :
  ```ts
  export interface RemoteInfo { name: string; color: number; hat: string | null; col: number; row: number; state: 'idle'|'walking'|'focus'|'pause'|'collective' }
  addRemote(id: string, info: RemoteInfo): void;      // idempotent : remplace si l'id existe
  moveRemote(id: string, col: number, row: number): void;
  setRemoteState(id: string, state: RemoteInfo['state']): void;
  setRemoteHat(id: string, hat: string | null): void;
  removeRemote(id: string): void;
  clearRemotes(): void;
  onCell(cb: (col: number, row: number, arrived: boolean) => void): void;  // mon avatar : cellule franchie / arrivée
  ```

- [ ] **Step 1 : Étiquette de pseudo (sprite canvas)**

Après `buildHat` :

```ts
  // A name tag as a camera-facing sprite. Cheap to build, one texture per avatar.
  function nameTag(text:string,color:number){
    const c=document.createElement('canvas'),ctx=c.getContext('2d')!;c.width=256;c.height=64;
    ctx.font='600 30px Manrope, DM Sans, sans-serif';const w=Math.min(240,ctx.measureText(text).width+28);
    ctx.fillStyle='#fffdf6e6';ctx.beginPath();ctx.roundRect((256-w)/2,8,w,48,24);ctx.fill();
    ctx.fillStyle='#'+color.toString(16).padStart(6,'0');ctx.beginPath();ctx.arc((256-w)/2+22,32,8,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#4d5b43';ctx.textBaseline='middle';ctx.fillText(text,(256-w)/2+38,33,w-50);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false}));s.scale.set(1.6,.4,1);s.position.y=2.15;return s;
  }
  function stateBubble(state:string){
    const c=document.createElement('canvas'),ctx=c.getContext('2d')!;c.width=64;c.height=64;
    ctx.font='40px serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(state==='focus'?'🍅':'☕',32,34);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false}));s.scale.set(.45,.45,1);s.position.set(.45,1.85,0);return s;
  }
```

- [ ] **Step 2 : Registre des avatars distants**

```ts
  const cellCentreOf=(col:number,row:number)=>({x:-HW+col+.5,z:-HD+row+.5});
  const seatNear=(p:{x:number;z:number})=>seats.find(s=>!s.taken&&Math.hypot(s.x-p.x,s.z-p.z)<.75)??null;
  interface Remote{p:ReturnType<typeof person>;w:ReturnType<typeof walker>;hat:THREE.Group|null;tag:THREE.Sprite;bubble:THREE.Sprite|null}
  const remotes=new Map<string,Remote>();
  function addRemote(id:string,info:RemoteInfo){
    removeRemote(id);const at=cellCentreOf(info.col,info.row);
    const p=person(at.x,at.z,{shirt:'#'+info.color.toString(16).padStart(6,'0')}),w=walker(p,2.4);
    const tag=nameTag(info.name,info.color);p.g.add(tag);
    const r:Remote={p,w,hat:null,tag,bubble:null};remotes.set(id,r);
    setRemoteHat(id,info.hat);setRemoteState(id,info.state);
    const seat=seatNear(at);if(seat)w.go(seat,seat);
  }
  function moveRemote(id:string,col:number,row:number){const r=remotes.get(id);if(!r)return;const at=cellCentreOf(col,row);const seat=seatNear(at);r.w.go(seat??at,seat);}
  function setRemoteState(id:string,state:RemoteInfo['state']){const r=remotes.get(id);if(!r)return;r.bubble?.removeFromParent();r.bubble=null;if(state==='focus'||state==='pause'||state==='collective'){r.bubble=stateBubble(state==='pause'?'pause':'focus');r.p.g.add(r.bubble);}}
  function setRemoteHat(id:string,hat:string|null){const r=remotes.get(id);if(!r)return;r.hat?.removeFromParent();r.hat=hat?buildHat(hat,r.p.head):null;}
  function removeRemote(id:string){const r=remotes.get(id);if(!r)return;r.w.standUp();r.w.cancel();r.p.g.removeFromParent();r.p.g.traverse(o=>{(o as THREE.Mesh).geometry?.dispose?.();});(r.tag.material as THREE.SpriteMaterial).map?.dispose();remotes.delete(id);}
  function clearRemotes(){for(const id of [...remotes.keys()])removeRemote(id);}
```

`person()` doit accepter une couleur de chemise arbitraire : c'est déjà le cas (`shirt` passe par `mat(color)`).

- [ ] **Step 3 : Animer et signaler mes cellules**

Dans `animate`, après `bar?.step(dt)` : `for(const r of remotes.values())r.w.step(dt);`.

Cellule franchie par mon avatar : ajouter un état `let lastCell='';let cellListener:((col:number,row:number,arrived:boolean)=>void)|null=null;` et, dans `animate` après `me.step(dt)` :

```ts
    {const col=Math.floor(avatar.position.x+HW),row=Math.floor(avatar.position.z+HD),k=`${col},${row}`,arrived=me.route.length===0&&!me.pendingSeat;
      if(k!==lastCell||(arrived&&lastArrived!==arrived)){lastCell=k;cellListener?.(col,row,arrived);}lastArrived=arrived;}
```
(avec `let lastArrived=false;` déclaré à côté). Le walker de l'avatar principal étant `me`, `me.route` et `me.pendingSeat` sont accessibles.

Dans `dispose()` : `clearRemotes();` avant le `renderer.dispose()`.

Objet retourné : ajouter `addRemote,moveRemote,setRemoteState,setRemoteHat,removeRemote,clearRemotes,onCell(cb){cellListener=cb;}`.

- [ ] **Step 4 : Typecheck et vérification visuelle rapide**

Run: `npm run typecheck` → 0 erreur.
Manuel : dans la console du navigateur (app lancée), rien n'appelle encore `addRemote`. Ajouter temporairement dans `main.ts` après `mountRoom()` : `cafe.addRemote('t',{name:'Test',color:0xc9764f,hat:'hat-crown',col:14,row:12,state:'focus'});setTimeout(()=>cafe.moveRemote('t',6,6),2000);` → un second personnage terracotta avec couronne, étiquette « Test » et bulle 🍅 apparaît, puis marche. **Retirer cette ligne avant le commit.**

- [ ] **Step 5 : Commit**

```bash
git add app/src/scene.ts
git commit -m "feat(app): render remote players in the 3D café

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12 : `main.ts` — présence, états d'avatar, rooms serveur

**Files:**
- Modify: `app/src/main.ts` (bloc rooms, `onSceneState`, `renderTimer`, `bindServerEvents`)

**Interfaces:**
- Consumes: API scène (Task 11), `toCell`/`toWorld` (Task 3), `net.setRoom/roomId` (Task 8).
- Produces: café jouable à plusieurs.

- [ ] **Step 1 : Émettre mes déplacements**

Dans `mountRoom()`, après `cafe=createCafe(...)` :

```ts
  cafe.onCell((col,row,arrived)=>{net?.socket.emit('move',{col,row});if(arrived)net?.socket.emit('position:save',{userId:identity.userId,col,row});});
```

- [ ] **Step 2 : État d'avatar piloté par le timer**

Dans `renderTimer`, dans le bloc `if(lastRunning!==running||lastMode!==timer.mode)` (il ne s'exécute qu'aux changements) :

```ts
    net?.socket.emit('avatar-state',{state:running?(timer.mode==='focus'?'focus':'pause'):'idle'});
```

- [ ] **Step 3 : Réception de la présence**

Dans `bindServerEvents()` :

```ts
  s.on('room-state',players=>{cafe?.clearRemotes();for(const p of players)cafe?.addRemote(p.id,{name:p.name,color:p.color,hat:p.hat??null,col:p.col,row:p.row,state:p.state});ready.room=true;maybeReady();
    // the server spawns us at a fixed tile; tell everyone where we really stand
    const c=toCell(cafe?.playerPosition().x??0,cafe?.playerPosition().z??0,room);s.emit('move',c);});
  s.on('player-joined',p=>cafe?.addRemote(p.id,{name:p.name,color:p.color,hat:p.hat??null,col:p.col,row:p.row,state:p.state}));
  s.on('player-moved',({id,col,row})=>cafe?.moveRemote(id,col,row));
  s.on('player-state',({id,state})=>cafe?.setRemoteState(id,state));
  s.on('player-hat',({id,hat})=>cafe?.setRemoteHat(id,hat));
  s.on('player-left',({id})=>cafe?.removeRemote(id));
```

Ajouter dans l'objet retourné par `createCafe` : `playerPosition:()=>({x:avatar.position.x,z:avatar.position.z})`.

- [ ] **Step 4 : Rooms serveur et « Chez moi »**

Remplacer le handler des boutons `[data-room]` :

```ts
let rooms:RoomSummary[]=[];// import type {RoomSummary} from '@shared/types'
const myPrivateRoom=()=>rooms.find(r=>r.isPrivate&&r.ownerId===identity.userId)??null;
function switchServerRoom(next:'public'|'private'){
  if(next==='public'){net.socket.emit('room:switch',{roomId:'ocean'});return;}
  const mine=myPrivateRoom();
  if(mine)net.socket.emit('room:switch',{roomId:mine.id});
  else{pendingHome=true;net.socket.emit('room:create-private',{name:`Chez ${identity.name}`});}
}
let pendingHome=false;
document.querySelectorAll<HTMLButtonElement>('[data-room]').forEach(b=>b.onclick=async()=>{
  if(b.dataset.room===room||switching)return;switching=true;
  const r=b.getBoundingClientRect(),next=b.dataset.room as 'public'|'private',home=next==='private';
  await irisSwap(r.left+r.width/2,r.top+r.height/2,home?'Chez moi':'Le café Petit Jour',home?'home':'coffee',()=>{room=next;save('gamitask.room',room);try{mountRoom();syncScene();}catch(error){console.error(error);}});
  switchServerRoom(next);toast(home?'Bienvenue chez toi. Installe-toi.':'Retour au café.');switching=false;
});
```

Dans `bindServerEvents()` :

```ts
  s.on('rooms:list',({rooms:list})=>{rooms=list;if(pendingHome){const mine=myPrivateRoom();if(mine){pendingHome=false;s.emit('room:switch',{roomId:mine.id});}}});
  s.on('room:info',({roomId})=>{const isHome=rooms.find(r=>r.id===roomId)?.isPrivate??false;if(isHome!==(room==='private')){room=isHome?'private':'public';save('gamitask.room',room);mountRoom();syncScene();}});
```

Au démarrage (`start()`), passer `'ocean'` à `connect(...)` dans tous les cas, puis si `load('gamitask.room','public')==='private'`, appeler `switchServerRoom('private')` juste après la première réception de `rooms:list` (utiliser `pendingHome=true` avant `connect`). Le `room:info` reçu bascule la scène si besoin.

- [ ] **Step 5 : Typecheck, tests, vérification manuelle à deux onglets**

Run: `npm run typecheck && npm test` → 0 erreur, tous PASS.

Manuel (serveur + app) :
1. Onglet A (profil normal) et onglet B (fenêtre de navigation privée, autre pseudo) sur `http://127.0.0.1:5173`.
2. Les deux avatars se voient avec leurs pseudos et couleurs. Cliquer au sol dans A → l'avatar bouge dans B, s'assoit si un siège est visé.
3. Lancer le timer dans A → bulle 🍅 au-dessus de A dans B ; pause → ☕ ; stop → rien.
4. Équiper un chapeau dans A → visible dans B.
5. A clique « Chez moi » → A disparaît de B, A voit sa pièce vide, peut poser un meuble (persiste au rechargement), B ne voit rien changer chez lui. A revient au café → réapparaît dans B.
6. Fermer B → l'avatar disparaît dans A.
7. Recharger A → revient dans la même room (café ou chez moi) avec ses chapeaux/meubles.

- [ ] **Step 6 : Commit**

```bash
git add app/src/main.ts app/src/scene.ts
git commit -m "feat(app): live presence and server rooms in the 3D café

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13 : Nettoyage, doc et vérification finale

**Files:**
- Modify: `app/src/main.ts` (supprimer les restes), `README.md` (racine), `docs/superpowers/specs/2026-09-18-…-design.md` (statut)
- Delete: `app/src/style.css` règles orphelines si repérées (facultatif)

- [ ] **Step 1 : Chasser les restes**

Run: `grep -nE "gamitask\.(progress|shop|tasks|intention)|rewardTask|dailyReset|bonuses\(|saveShop|TODO Task" app/src/*.ts`
Expected: aucun résultat. Sinon supprimer.

- [ ] **Step 2 : README racine**

Remplacer le contenu de `README.md` par :

````markdown
# gamiTask

Un café 3D pour avancer sur ses tâches, ensemble.

## Lancer en local

```bash
cd server && npm i && npm run dev      # Socket.io + SQLite sur :3001
cd app && npm i && npm run dev         # Vite sur http://127.0.0.1:5173
```

Variables utiles :

| Où | Variable | Défaut | Rôle |
|---|---|---|---|
| app | `VITE_API_URL` | `http://localhost:3001` | URL du serveur |
| server | `PORT` | `3001` | Port HTTP / socket |
| server | `CORS_ORIGIN` | `http://localhost:5173,http://127.0.0.1:5173` | Origines autorisées (séparées par des virgules) |
| server | `ALLOW_GUEST_PRIVATE_ROOMS` | `true` | Rooms privées pour les invités (à passer à `false` avec l'auth) |

## Tests

```bash
cd app && npm test && npm run typecheck
```
````

- [ ] **Step 3 : Statut de la spec**

Dans la spec, remplacer `**Statut :** validé, en attente du plan` par `**Statut :** implémenté (branche rework)`.

- [ ] **Step 4 : Vérification complète**

Run: `cd app && npm test && npm run typecheck && npm run build`
Expected: tests PASS, 0 erreur TS, build Vite OK.

- [ ] **Step 5 : Commit**

```bash
git add README.md docs app/src
git commit -m "docs: document local setup and env vars for the connected client

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Auto-revue du plan (faite)

- **Couverture spec** : §3 identité → T4/T9 ; §4 architecture, source de vérité, mapping → T5-T10 ; §4 rooms → T12 ; §5 présence → T11/T12 ; §6 coords → T3 ; §7 serveur → T2 ; §8 connexion → T8/T9 ; §9 TS → T1 ; §10 tests → chaque task + T12 étape 5.
- **Cohérence des noms** : `net.socket`, `net.roomId()`, `net.setRoom()` (T8) utilisés en T9/T12 ; `shop.hats/furniture/placed` (T7) en T10 ; `addRemote/moveRemote/setRemoteState/setRemoteHat/removeRemote/clearRemotes/onCell/playerPosition` (T11) en T12 ; `toCell` (T3) en T12 ; `setCoins/setXp/setStreak/unlock/setAchievements` (T6) en T9.
- **Point d'attention connu** : `cosmetic:equip` n'a pas d'accusé serveur vers l'émetteur, d'où l'application locale en T10 ; `furniture:buy` place le meuble à une position par défaut serveur, que `setFurniture` ignore si elle sort de la pièce (bibliothèque en `row 10`) — le meuble apparaît alors « Rangé », à poser à la main.
