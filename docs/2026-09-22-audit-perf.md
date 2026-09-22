# Audit de performance — gamiTask

Date : 2026-09-22, sur `main` @ `68bbfaf`. Mesures locales (Windows 11, Chrome, Node 24, disque interne). Aucun code modifié par cet audit.

## Résumé

| Volet | État | Verdict |
|---|---|---|
| Serveur — écritures SQLite | `journal_mode=delete`, `synchronous=FULL` : **20 ms** pour les 4 écritures d'un `task:score` ; `task:score` répond en **28 ms p50** | 🔴 Le seul vrai problème mesuré. WAL + `synchronous=NORMAL` → **0,15 ms** (×130), sans changement de code applicatif |
| Serveur — lectures | `tasks` n'a aucun index sur `userId` (`SCAN tasks` + tri temporaire) ; `join` et `task:score` relisent toutes les tâches ; `countDoneTasks` scanne | 🟡 Invisible à 39 lignes, linéaire avec le nombre d'utilisateurs. Un index, cinq minutes |
| Client — poids | `/app/` : **359 kB** transférés (gzip), 11 requêtes, JS reçu en 87 ms sur loopback. three.js = 168 kB gzip à lui seul | 🟢 Correct pour une app 3D. Pas de gain facile sans changer de moteur |
| Client — démarrage | JS téléchargé à 87 ms mais `DOMContentLoaded` à **1 145 ms** : ~1 s de travail synchrone (éval three + construction de la scène) avant le premier rendu | 🟡 C'est le LCP effectif. Deux leviers : découper le chunk `avatar` (three-bvh-csg embarqué alors qu'il ne sert qu'à l'atelier) et différer ce qui ne conditionne pas la première image |
| Client — rendu | Ombres PCF soft 1024², passe de flou (2 render targets + 3 passes) pour l'arrière-plan, résolution adaptative déjà en place, redraw des shadow maps déjà limité (commit `bc53036`) | ⚪ Non mesuré : l'onglet piloté était en arrière-plan (rAF gelé). À mesurer au premier plan (voir §5) |
| Client — mémoire | 94 Mo de heap JS après chargement de `/app/` (prod) | 🟢 Normal pour three.js |
| Réseau / hébergement | nginx : aucun `Cache-Control`/`expires`, ni `gzip`/`brotli` déclaré ; Google Fonts en preconnect ; `og.png` 327 kB | 🟡 Les assets Vite sont hashés : cache immuable gratuit. À vérifier si un CDN/Traefik devant compresse déjà |

## 1. Méthode

- **Bundle** : `npm run build` + taille gzip réelle de chaque chunk.
- **Chargement** : `vite preview` (build de prod) ouvert dans Chrome, `PerformanceNavigationTiming` + `PerformanceResourceTiming`.
- **Serveur** : script socket.io-client contre le serveur dev, 15 `join`, 8 `task:add`, 8 `task:score`, 10 `join` avec 20 tâches ; p50/p95/max.
- **SQLite** : lecture des pragmas et du plan de requête sur `data.db` ; micro-benchmark des 4 écritures d'un `task:score` sur une **copie** de la base, mode actuel vs WAL, 200 itérations.
- **Non mesuré** : FPS et coût par frame de la scène — l'onglet Chrome automatisé était `visibilityState: hidden`, donc `requestAnimationFrame` ne tournait pas. Voir §5 pour le protocole.

## 2. Serveur

### 2.1 Latences observées (loopback, base de 39 tâches)

| Événement | p50 | p95 | max |
|---|---|---|---|
| `join` (0 tâche) | 1,8 ms | 4,1 ms | 21,8 ms |
| `join` (20 tâches) | 3,5 ms | 5,4 ms | 5,5 ms |
| `task:add` | 7,7 ms | 12,3 ms | 13,8 ms |
| `task:score` | **28,4 ms** | 35,7 ms | 49,6 ms |

`task:score` fait 1 `updateTask` + `setCoins` + `addXp` + `setEnergy` (+ `updateBossHp` en guilde) : chaque `run()` est une transaction implicite avec `fsync` en mode `delete`/`FULL`. Sur ce disque, ~5 ms par écriture → 20 ms des 28.

### 2.2 Benchmark SQLite (copie de `data.db`, 4 écritures)

| Mode | 4 `run()` séparés | Dans une transaction |
|---|---|---|
| `delete` + `synchronous=FULL` (actuel) | 19,94 ms | 7,21 ms |
| `WAL` + `synchronous=NORMAL` | **0,15 ms** | 0,07 ms |

WAL est le réglage recommandé par better-sqlite3 pour un serveur ; `synchronous=NORMAL` en WAL reste sûr face à un crash applicatif (perte possible des dernières transactions seulement en cas de coupure de courant). Le volume Docker (`gamitask_data`) supporte les fichiers `-wal`/`-shm`.

**Recommandation A (à faire)** : juste après `new Database(...)` :

```ts
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
```

Gain attendu : `task:score` ~28 ms → ~8 ms, `task:add` ~8 ms → ~3 ms. À vérifier avec le même script.

### 2.3 Lectures et index

- `tasks` n'a que l'index de clé primaire. `SELECT * FROM tasks WHERE userId = ? ORDER BY createdAt` → `SCAN tasks` + `TEMP B-TREE`. À 39 lignes, rien ; à 50 utilisateurs × 30 tâches, chaque `join`, `task:score` (via `userTasks` pour `pendingTaskIds`) et `countDoneTasks` balaie 1 500 lignes.
- **Recommandation B** : `CREATE INDEX IF NOT EXISTS tasks_user_created ON tasks(userId, createdAt)` dans le bloc de migrations. Une ligne.
- **Recommandation C (petite)** : `task:score` appelle `userTasks(userId)` uniquement pour recalculer `pendingTaskIds` — un `filter` sur la liste déjà en mémoire (`p.pendingTaskIds` ± l'id courant selon `isPending(r.task)`) évite la requête. Facultatif après B.

### 2.4 Ce qui va bien

- Rate-limits sur tous les handlers (`allow()`), `move` borné à 30/s.
- Un seul `setInterval` (pomodoro partagé, 1 s par salle active).
- `broadcastLeaderboard` trie en mémoire, pas de SQL.
- Broadcasts ciblés par salle (`socket.to(roomId)`), pas de `io.emit` en boucle chaude (`rooms:list` seulement à la création/suppression de salle).

## 3. Client — chargement

### 3.1 Bundle (gzip)

| Chunk | Gzip | Contenu |
|---|---|---|
| `avatar-*.js` | 168 kB | three.js + three-mesh-bvh + three-bvh-csg + avatar/recette |
| `scene-*.js` | 127 kB | la scène (pièces, mobilier, navigation, rendu) |
| `app-*.js` | 49 kB | `main.ts` + éditeur + atelier + boutique + chat |
| `style-*.css` | 14 kB | |
| `landing-*.js` | 8 kB | landing (la scène 3D y est en `import()` différé, bien) |
| **Total `/app/`** | **≈ 359 kB** | 11 requêtes |

Points :
- **three-bvh-csg + three-mesh-bvh** (4 Mo de sources, plusieurs dizaines de kB gzip) sont dans le chunk `avatar` alors que la soustraction booléenne ne sert que dans l'**atelier** (`recipe.ts` → `carve`). Tout le monde les télécharge et les évalue au démarrage.
- **Éditeur de personnage et atelier** sont importés statiquement dans `main.ts` (`createEditor`, `createWorkshop`) : ~30 kB gzip dans le chunk d'entrée pour des écrans ouverts rarement.
- Les chunks sont hashés → cache immuable possible côté nginx (voir §4).

**Recommandation D** : `import()` dynamique de `three-bvh-csg` à l'intérieur de `carve()` (il est déjà lazy-initialisé : `evaluator ??= …`) → le module ne se charge qu'au premier « creuser » de l'atelier. Mesure attendue : −30 à −50 kB gzip et moins d'éval JS au démarrage. Puis, si l'écart mesuré le justifie, `import('./workshop.ts')` / `import('./editor.ts')` à l'ouverture.

### 3.2 Démarrage

`vite preview`, onglet en arrière-plan (les chiffres absolus sont pessimistes, l'ordre de grandeur est fiable) :

| Étape | Instant |
|---|---|
| TTFB | 14 ms |
| Dernier chunk JS reçu | 87 ms |
| `DOMContentLoaded` | 1 145 ms |
| `load` | 1 462 ms |

Le réseau n'est pas le sujet : **~1 s se passe entre la réception du JS et `DOMContentLoaded`**, c'est-à-dire l'évaluation des modules (three ≈ 630 kB brut) et `createCafe()` appelé synchroniquement au chargement (`main.ts:364`) : construction de toutes les géométries de la salle, du mobilier, des avatars, des shadow maps. C'est le vrai LCP de l'app.

La landing fait déjà ce qu'il faut : `requestIdleCallback(mountRoom)` et un `import('./scene.ts')` différé, les vignettes rendues à l'entrée dans le viewport (`IntersectionObserver`).

**Recommandation E (à mesurer avant de garder)** : instrumenter `createCafe` avec `performance.mark/measure` (construction salle / mobilier / avatars / première frame) pour savoir où va la seconde. Ensuite seulement, deux pistes classiques : (1) afficher l'UI (HUD, panneau) avant la scène — le veil « Le café ouvre ses portes… » existe déjà ; (2) partager les géométries répétées (chaises, tables, plantes) plutôt que reconstruire un `BoxGeometry` par mesh, si le profil montre que c'est là.

### 3.3 Google Sign-In

Le script `gsi/client` et son iframe `button` sont chargés à `1 132 → 1 460 ms`, après le reste. Sans effet sur le rendu ; rien à faire.

## 4. Hébergement (nginx)

`nginx/default.conf` ne déclare ni compression ni cache :
- **Recommandation F** : `gzip on; gzip_types text/css application/javascript application/json image/svg+xml;` (ou brotli si le module est là). Si un reverse proxy/CDN est devant et compresse déjà, ignorer.
- **Recommandation G** : `location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }` — les noms sont hashés par Vite, c'est sans risque. `index.html` reste en `no-cache`.
- `og.png` : 327 kB. Seuls les crawlers sociaux le lisent ; un export 1200×630 en JPEG q80 ou WebP tombe sous 100 kB. Cosmétique.

## 5. Rendu 3D — à mesurer

Non mesuré pour cause d'onglet en arrière-plan. Protocole (2 minutes, onglet au premier plan, console) :

```js
// 1. FPS moyen sur 5 s
let n=0,t0=performance.now();const f=()=>{n++;if(performance.now()-t0<5000)requestAnimationFrame(f);else console.log('fps',(n/5).toFixed(1));};requestAnimationFrame(f);
```

Puis onglet Performance de DevTools, 10 s d'enregistrement en marchant dans le café : regarder le temps GPU par frame et la part `renderer.render` × 4 (backdrop + 2 passes de flou + avatars). Ce qu'on sait déjà du code :
- ombres `PCFSoftShadowMap` 1024² (le plus coûteux des modes d'ombre de three ; `PCFShadowMap` est ~2× moins cher, à comparer visuellement) ;
- 4 rendus par frame à cause de la passe de profondeur de champ (backdrop flouté + avatars nets), avec `renderer.setPixelRatio` adaptatif (`adapt()`) qui baisse la résolution quand le GPU sature — bon garde-fou ;
- sparkles sur chaque ardoise (`THREE.Points`, 7 points) : négligeable.

Si le FPS est déjà à 60 sur ta machine, ne pas toucher ; sinon commencer par le mode d'ombre, une variable à la fois.

## 6. Appliqué le 2026-09-22 — A + B (même script, même base)

| Événement | Avant (p50 / p95) | Après (p50 / p95) |
|---|---|---|
| `join` (0 tâche) | 1,8 / 4,1 ms | 1,0 / 2,0 ms |
| `join` (20 tâches) | 3,5 / 5,4 ms | 1,0 / 1,2 ms |
| `task:add` | 7,7 / 12,3 ms | 0,6 / 0,7 ms |
| `task:score` | 28,4 / 35,7 ms | **0,9 / 1,7 ms** |

Plan de `getTasks` : `SCAN tasks + TEMP B-TREE` → `SEARCH tasks USING INDEX tasks_user_created`. Suite serveur 40/40. Gardé.

## 6 bis. Appliqué le 2026-09-22 — F + G + D

- **F, G** (`nginx/default.conf`) : `gzip` sur JS/CSS/SVG/JSON, `/assets/` en `Cache-Control: public, immutable` (1 an), les deux `index.html` en `no-cache`. Non testable en local (pas de nginx) : à vérifier au déploiement avec l'onglet Network (2ᵉ visite = `(memory cache)`).
- **D** (`recipe.ts`) : three-bvh-csg + three-mesh-bvh en `import()` à la demande (`ensureCsg()`), chargés par le catalogue quand une pièce a une découpe et par l'atelier à l'ouverture ; une découpe non chargée rend la pièce pleine puis la salle est reconstruite au chargement.

| Mesure | Avant | Après |
|---|---|---|
| chunk `avatar` (gzip) | 168 kB | 137 kB |
| JS préchargé au démarrage de `/app/` (gzip) | ≈ 359 kB | ≈ 328 kB (chunk CSG de 36 kB hors préchargement) |
| requêtes CSG au démarrage | 1 (dans avatar) | **0** |
| chargement à la demande | — | 27 ms sur loopback |

Suite app 85/85 (test `recipe` adapté : pleine avant chargement, creusée après), typecheck OK. Gardé.

## 6 ter. Appliqué le 2026-09-22 — E (démarrage de la scène)

Marques `performance.mark` posées dans `createCafe` (`cafe:start … cafe:first-frame`, visibles dans DevTools → Performance → Timings, tableau en console en dev) et autour du premier `mountRoom` (`app:mount-start/end`). Elles restent dans le code : coût nul.

Ce que la seconde contenait (dev, jardin) : ~10 ms de renderer, ~30 ms pour construire tout le jardin (1 268 `mesh()` en 8 ms), et **tout le reste dans `bake()`** — la fusion du décor statique en un mesh par matériau — proportionnel au nombre de sommets : 823 000, dont **432 000 pour les 480 dalles du sol** (`RoundedBoxGeometry` à 2 segments = 900 sommets par dalle pour un chanfrein de 1,5 cm invisible).

Trois changements, mesurés un par un (`vite preview`, onglet en arrière-plan, 2 chargements) :

| Changement | Phase salle (`cafe:start → player`) | `DOMContentLoaded` | Sommets de la scène |
|---|---|---|---|
| référence | 1 065 / 990 ms | 1 317 ms | 823 k |
| 1. une géométrie par forme, partagée (`primitives.ts`) — 791 boîtes arrondies construites pour 60 formes | 648 / 610 ms | 871 / 763 ms | 823 k (bake inchangé) |
| 2. dalles de sol en boîtes plates (`r = 0`) | bake 316 → 102 ms | — | 409 k |
| 3. un segment d'arrondi sous 2 cm (lattes, montants) | bake 102 → 75 ms | — | 292 k |
| **après 1+2+3** | **406 / 361 ms** | **589 / 489 ms** | **292 k** |

Rendu comparé avant/après sur le sol, les montants de la verrière et les lattes : identique. Suite app 85/85, typecheck OK, aucune erreur console. Gardé. Effet secondaire attendu à chaque frame : −65 % de sommets envoyés au GPU pour le décor (non mesuré en FPS, onglet en arrière-plan).

## 6 quater. Mesuré le 2026-09-22 — rendu 3D au premier plan (§5)

Machine de dev, écran 1920×855 CSS, `devicePixelRatio` 1, `requestAnimationFrame` échantillonné 4-5 s :

| Situation | fps | p50 | p95 | max | frames > 20 ms |
|---|---|---|---|---|---|
| immobile | 60 | 16,7 ms | 16,9 ms | 17,1 ms | 0 |
| en marchant | 60 | 16,7 ms | 16,9 ms | 17,2 ms | 0 |
| en marchant, panneau ouvert | 60 | 16,7 ms | 16,9 ms | 17,0 ms | 0 |

**Mais** le canvas rendait en 1440×641 pour 1920×855 CSS : la résolution adaptative était descendue à son minimum (0,75) en ~6 s, sur n'importe quelle machine. Cause : `adapt()` jugeait l'intervalle entre deux frames (`frameMs > 14` = lent), or le vsync le fixe à 16,7 ms à 60 Hz — la condition « lent » était toujours vraie et « rapide » (< 9 ms) jamais. Le 60 fps était donc obtenu en floutant l'image, pas grâce au GPU.

Corrigé : `adapt()` compte la part de frames qui dépassent 1,5 × la cadence de l'écran (médiane de chaque fenêtre de 120 frames, insensible aux stalls), ignore la première fenêtre après montage (compilation des shaders), descend au-delà de 10 % de frames sautées, remonte après deux fenêtres propres. Vérifié : 1920×855 conservé sur 12 s puis en marchant, 60 fps, 0 frame > 20 ms. Le mode d'ombre (`PCFSoftShadowMap`) et la passe de flou n'ont donc pas besoin d'être touchés sur cette machine ; à revoir seulement si des joueurs remontent une image floue (= l'adaptatif a baissé chez eux).

## 7. Ordre recommandé (reste)

| # | Action | Effort | Gain attendu | Mesure de vérification |
|---|---|---|---|---|

Règle du skill appliquée : chaque changement mesuré seul, gardé seulement si l'écart dépasse le bruit, sinon annulé.
