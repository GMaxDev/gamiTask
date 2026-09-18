# Branchement du client 3D au serveur : persistance + présence

**Date :** 2026-09-18 · **Branche :** `rework` · **Statut :** implémenté (branche rework)

## 1. Objectif

Le client 3D (`app/`, vanilla + Three.js) est aujourd'hui 100 % local (localStorage).
Cette itération le branche au serveur Socket.io existant (`server/`) pour :

1. persister tâches, coins, XP, streak, succès, chapeaux et meubles côté serveur ;
2. afficher les autres joueurs (avatars distants) dans le café 3D ;
3. migrer le client en TypeScript, avec les types du protocole partagés avec le serveur.

Hors périmètre : écran d'auth (Google), chat, pomodoro collectif, leaderboard,
choix entre les 3 rooms publiques, invitations, grades admin/modo.

## 2. Règles produit (à terme)

- Un inscrit a une room privée éditable (« Chez moi »).
- Un guest n'accède qu'aux rooms publiques, sauf invitation dans une room privée (non éditable).
- Les rooms publiques ne sont éditables que par admin / modo (grades à venir).

Pour cette itération, tout le monde est guest (pas d'auth). « Chez moi » reste
fonctionnel : le serveur autorise temporairement la création de room privée sans
compte Google, derrière un flag. La règle d'accès finale viendra avec l'auth.

## 3. Identité

- `userId` : UUID généré au premier lancement, stocké en localStorage (`gamitask.identity`), comme sur `main`.
- Pseudo + couleur : dialogue au premier lancement (style des dialogues existants), modifiable depuis le HUD.
- Le serveur persiste l'utilisateur par `userId` (`upsertUser`) : un guest garde sa progression tant que son localStorage vit.

## 4. Architecture client

### Fichiers

| Fichier | Rôle |
|---|---|
| `src/identity.ts` | userId / pseudo / couleur, dialogue de première visite |
| `src/net.ts` | wrapper `socket.io-client` typé (`ClientToServerEvents` / `ServerToClientEvents`), statut de connexion |
| `src/coords.ts` | conversion pure monde 3D ↔ `col/row` serveur |
| `src/tasks.ts`, `src/shop.ts`, `src/progress.ts` | conteneurs d'état + validation, alimentés par les événements serveur |
| `src/scene.ts` | ajoute les avatars distants |
| `src/main.ts` | câblage UI ↔ net ↔ scène |

Les types du protocole sont importés depuis `../../server/src/types.ts` (alias Vite `@shared`).

### Source de vérité

Le serveur. Flux : action UI → `emit` → événement serveur → mise à jour de l'état → rendu.
Pas de prédiction optimiste.

Conséquences sur les modèles existants :
- `tasks.ts` : plus de `dailyReset` ni de `rewarded` côté client (le serveur reset et récompense). Garde `CATEGORIES`, `pending`, la validation de texte.
- `progress.ts` : plus de `completeTask` / `completePomodoro`. Garde `levelInfo`, `ACHIEVEMENTS` (libellés) et l'état `{coins, xp, streak, achievements}` mis à jour par `coins:update`, `xp:update`, `streak:update`, `achievement:unlocked`, `profile:data`.
- `shop.ts` : plus de `buy` local. Garde catalogue, `footprint`, `cellsOf`, validation de placement (feedback immédiat avant `emit`).
- Le localStorage ne garde que : identité, timer, `gamitask.room`, préférences (son, lumière).

### Mapping des actions

| Action UI | Émis | Reçu → état |
|---|---|---|
| Ajouter / éditer / cocher / supprimer une tâche | `task:add` / `task:update` / `task:toggle` / `task:delete` | `task:added` / `task:updated` / `task:toggled` (+coins) / `task:deleted` |
| Fin d'un focus | `pomodoro:complete` | `coins:update`, `streak:update`, `xp:update`, `achievement:unlocked` |
| Timer démarre / pause / stop | `avatar-state` focus / pause / idle | — |
| Acheter chapeau / meuble | `shop:buy` / `furniture:buy` | `shop:bought` + `cosmetics:state` / `furniture:bought` + `furniture:state` |
| Porter un chapeau | `cosmetic:equip` | `player-hat` (pour les autres) |
| Poser / déplacer / ranger un meuble | `furniture:place` / `furniture:move` / `furniture:toggle-place` | `furniture:state` |
| Aller au café / chez moi | `room:switch` (crée la room privée via `room:create-private` au premier passage) | `room:info`, `room-state` |
| Marcher | `move` à chaque cellule atteinte, `position:save` à l'arrivée | `player-moved` (pour les autres) |
| Ouvrir « Ma progression » | `profile:request` | `profile:data` |

Timer : reste local (durées, restant, `endAt` en localStorage).

### Rooms

- Le café public = room serveur `ocean` (`DEFAULT_ROOM_ID`).
- « Chez moi » = room privée serveur de l'utilisateur. Au premier passage : `room:create-private` puis `room:switch` vers l'id reçu dans `rooms:list`. Ensuite `room:switch` direct.
- Les meubles ne se posent que dans sa propre room privée (règle serveur inchangée).
- `room:full` → toast, on reste où on est.

## 5. Présence dans la scène

- `scene.ts` expose : `addRemote(id, {name, color, hat, col, row, state})`, `moveRemote(id, col, row)`, `setRemoteState(id, state)`, `setRemoteHat(id, hat)`, `removeRemote(id)`, `clearRemotes()`.
- Un avatar distant = `person()` + `walker` existants (déjà utilisés pour le barista), t-shirt à la couleur du joueur, étiquette pseudo (sprite canvas) au-dessus de la tête.
- Déplacement distant : marche jusqu'à la cellule reçue via `navigation.path`. Si un siège libre est à cette cellule, il s'y assoit.
- État distant : `focus` / `pause` → petite bulle au-dessus de la tête (réutilise le style des étiquettes), `idle` → rien.
- `room-state` : instancie tous les joueurs sauf soi. `player-joined` / `player-left` : ajoute / retire. Changement de room : `clearRemotes()`.

## 6. Coordonnées

`coords.ts` (pur, testé) :
- `toCell(x, z, room)` → `{col: round(x + W/2), row: round(z + D/2)}` avec `W×D` = 24×20 (café) ou 12×10 (chez moi), borné à la grille.
- `toWorld(col, row, room)` → `{x: col - W/2, z: row - D/2}`.
- Le serveur stocke `col/row` entiers ; la précision d'une cellule suffit pour la présence.

## 7. Changements serveur

1. **Bornes de grille** : constante `MAX_GRID = 32` remplace le `12` en dur dans `move`, `furniture:place`, `furniture:move`.
2. **Rooms privées sans compte Google** : flag `ALLOW_GUEST_PRIVATE_ROOMS` (env, défaut `true`) qui court-circuite le test `googleId` dans `room:create-private`. À repasser à `false` quand l'auth arrive.
3. **CORS socket.io** : l'origine est en dur (`http://localhost:5173`) alors que Vite sert sur `127.0.0.1:5173`. Variable `CORS_ORIGIN` (liste séparée par des virgules), défaut `http://localhost:5173,http://127.0.0.1:5173`.

Aucun autre changement. Le protocole (`types.ts`) est inchangé.

## 8. États de connexion

- Au démarrage : voile « Connexion au café… » par-dessus la scène jusqu'à `room-state` + `tasks:state` reçus.
- Coupure : reconnexion auto socket.io ; le voile réapparaît avec « Le café est injoignable, on réessaie… ». À la reconnexion, on ré-émet `join` et l'état est rechargé depuis les événements serveur.
- `session:replaced` : voile définitif « Le café est ouvert dans un autre onglet », socket fermé.
- Pas de mode local de secours.

Config : `VITE_API_URL`, défaut `http://localhost:3001`.

## 9. Migration TypeScript

- Renommage `src/*.js` → `.ts`, `tests/*.test.js` → `.test.ts`. Vite compile le TS nativement ; `node --test` (Node 24, type stripping natif) exécute les tests `.ts` sans outillage.
- `tsconfig.json` strict, `noEmit`, alias `@shared` → `../server/src`. Script `npm run typecheck` (`tsc --noEmit`).
- Étape 1 du plan : migration mécanique (types minimaux, `any` toléré temporairement dans `scene.ts`), tests verts, puis le reste.

## 10. Tests

- Node : `coords`, application des événements serveur aux modèles (`tasks:state`, `task:toggled`, `furniture:state`, `cosmetics:state`, `xp:update`), validation de placement.
- Manuel : serveur + deux onglets. Vérifier présence, déplacement, chapeau, état focus, tâche persistée après rechargement, changement de room, coupure / reconnexion.

## 11. Suite (hors itération)

Chat → pomodoro collectif → sélection de room + visiteurs chez moi → leaderboard / toasts publics → auth (Google, règles d'accès, flag serveur à `false`).
