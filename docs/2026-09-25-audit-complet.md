# Audit complet — gamiTask (2026-09-25)

> **État après traitement (même jour, 42fd61c → HEAD, 50+ commits, −3 000 / +900 lignes).** Tout ce qui suit décrit l'application **avant** les corrections. Ce qui a été fait :
> - **Sécurité 1-25 : tout.** `debug:*` supprimés, `userId` pris du socket partout, pomodoro chronométré serveur, XSS pseudo/catalogue, `JWT_SECRET` et `TOKEN_KEY` obligatoires, HS256 épinglé, listeners gardés, `npm audit` à 0, nonce Twitch, `/api/feedback` et `/twitch/viewers` supprimés, `trust proxy`, en-têtes nginx (CSP à valider en prod), fuseau figé, jetons Twitch chiffrés, `NODE_ENV`, `email_verified`, pièces privées non listées, image Node 22 non-root, un seul jeton local.
> - **Code mort et doublons 26-59 : tout** (guildes, vidéo, admin, DM, réactions, prototypes Twitch, backups v1, CSS v1, catalogue/achievements/formules partagés via `@shared`…).
> - **Tableau de liège 60-67 : retiré**, puis les **chevalets sur les tables** d'avant sont revenus, sans étincelles ni gros plan.
> - **Tiroir des tâches** : variante A (titre + ligne de méta, grande case, menu ⋯), sans bouton ▶ sur les lignes.
> - **Onboarding 75-81** (sauf 80, passage pseudo gardé), **copy 82-92**, **réglages 93-100** (un dialogue, onglet Rythme), **101** classement retiré, **102** énergie active dès le niveau 1, **103-106** gelés, **mobile 107-110**.
> - **68-71** : focus lié à une tâche depuis la carte pomodoro (sélecteur), compteur de focus par tâche.
> - **111** : `index.ts` découpé en `config`, `db`, `http`, `rooms`, `pomo`, `rewards`, `handlers/*` (66 lignes restantes).
> - **Non fait** : 112 mesure FPS (à faire à la main, onglet au premier plan).

Base : `main` @ 42fd61c. Quatre passes : sécurité (lecture intégrale du serveur), pertinence produit/UX, sur‑ingénierie/code mort, et un test en direct du tableau de liège dans le navigateur (desktop 1544 px). Aucun fichier modifié.

Chiffres de base : ~8 650 lignes app+serveur ; `server/src/index.ts` = 2 874 l., `app/src/scene.ts` = 928 l. Build, typecheck et tests : verts.

---

## 0. Verdict en une page

| Axe | État | Priorité |
|---|---|---|
| **Sécurité** | **3 failles critiques** : événements `debug:*` ouverts à tous, IDOR généralisé (`userId` pris dans le payload), pomodoro déclaré par le client. 2 XSS stockés qui volent le JWT 30 jours. | **Bloquant avant toute ouverture publique** |
| **Job principal** (tâches + focus) | Fonctionne, mais **le focus ne sait pas sur quelle tâche on travaille**. Les deux widgets essentiels ne se parlent pas. | Haute |
| **Tableau de liège** | Beau, mais **~85 % de doublon en lecture seule** avec le tiroir, plus un mode caméra qui bloque l'avatar. En gros plan, les cartes restent petites (≈ 45 px de large sur 1544 px). | À réduire |
| **Signal / bruit** | **≈ 18 % du code sert le job principal.** 33 % de décor/3D, 20 % de social, 5 % de code mort. | Moyenne |
| **Code mort** | ~1 750 lignes supprimables (guildes/boss, vidéo partagée, DM, réactions, debug/admin, backups v1, CSS v1…). | Moyenne, mais gratuit |

---

## 1. Sécurité

### 1.1 Constat structurel

La seule protection anti‑usurpation est au `join` (`index.ts:1514-1522`) : jeton Google vérifié, ou `userId` déclaré pour un invité. Ensuite, **tous les handlers « par utilisateur » relisent `userId` dans le payload** et n'exigent même pas d'avoir fait `join`. Un seul handler fait le bon contrôle : `look:update` (`index.ts:2412` : `if (socketToUserId.get(socket.id) !== userId) return;`). C'est le modèle à généraliser.

### 1.2 Points d'entrée socket — synthèse

| Événement | Join requis | Propriété vérifiée | Notes |
|---|---|---|---|
| `task:add / update / delete / score` (l.2004-2143) | ✗ | ✗ `payload.userId` | IDOR : n'importe qui crée/supprime/coche les tâches d'autrui |
| `shop:buy`, `furniture:buy`, `cosmetic:equip` (l.2190-2409) | ✗ | ✗ | Dépense les pièces d'autrui, déséquipe son chapeau |
| `furniture:move / place / toggle-place` | ✔ | ✗ compare `r.ownerId` au `userId` **du payload** | Un invité réarrange les meubles du propriétaire |
| `pomodoro:complete` (l.2432) | ✗ | ✗ | Aucune preuve qu'un pomodoro a eu lieu |
| `debug:unlock / grant-xp / grant-coins / set-energy / reset-xp` (l.2150-2187) | ✗ | ✗ | **Aucun contrôle, aucun garde `NODE_ENV`** |
| `position:save` | ✗ | ✗ | Crash si `col` est un objet |
| `join` | – | – | `name`, `color` stockés sans validation |
| `room:switch` | ✔ | n/a | Les ids des rooms « privées » sont publics (`rooms:list`) |
| `admin:*`, `catalog:*` | ✔ | rôle relu en DB ✔ | Correct |
| `look:update` | ✔ | ✔ | Le seul bon exemple |
| `guild:*`, `video:*`, `private-message`, `chat:react` | ✔ | ✔ | **Code mort** côté client, mais surface d'attaque active |

HTTP : `POST /api/feedback` (l.2801) sans auth ni limite → spam d'issues GitHub avec le jeton du serveur ; `GET /twitch/viewers` = proxy ouvert vers Helix ; `GET /api/rooms` expose les `ownerId`.

### 1.3 Constats par sévérité

**CRITIQUE**

- **F‑01 — `debug:*` sans contrôle** (`index.ts:2150-2187`). `emit("debug:grant-coins",{userId:X,amount:1e9})` depuis la console, sans `join` ni jeton. Montant négatif accepté → vider un compte. `userId` d'autrui obtenu par `profile:request` (l.2710) ou `rooms:list`. Confiance 10/10. *Fix : supprimer en prod, ou `isAdmin()` + bornes.*
- **F‑02 — IDOR généralisé** (tâches, boutique, cosmétiques, mobilier, pomodoro). Les `taskId` fuient par `pendingTaskIds` diffusé à la room (l.1596-1608) et `tasks:public-update`. Confiance 10/10. *Fix : `const uid = socketToUserId.get(socket.id); if (!uid) return;` en tête de chaque handler ; retirer `userId` des types `ClientToServerEvents` (`types.ts:339-391`) pour que le client cesse de l'envoyer.*
- **F‑03 — Pomodoro déclaré par le client** (`index.ts:2432-2472`). Boucle `pomodoro:complete` toutes les 15 s → ~300 pièces et ~300 XP/heure, série infinie. Confiance 9/10. *Fix : `pomodoro:start` horodaté serveur ; récompense seulement si `now − startedAt ≥ durée − tolérance`. Le pomodoro collectif (l.1273-1361) fait déjà autorité serveur : réutiliser.*

**ÉLEVÉ**

- **F‑04 — XSS stocké via le pseudo** → vol du JWT 30 jours. `join` accepte `name` sans filtre (l.1514, persisté l.1639) ; `app/src/main.ts:169` injecte `${m.name}` en `innerHTML` dans « Gérer ma pièce ». Le formulaire limite à 20 caractères, le socket non. Confiance 9/10. *Fix : `esc(m.name)` (helper `ui.ts:16`) ; serveur : `name = sanitize(String(name)).slice(0,20)`, `color` entier borné.*
- **F‑05 — XSS par un modérateur via le nom d'objet du catalogue** → escalade modo → admin. `catalog.ts:59` tronque à 30 caractères sans échapper ; rendu `innerHTML` dans `main.ts:383,386,402` et `workshop.ts:100`. `<img src=x onerror=…>` tient en 28 caractères. Confiance 8/10.
- **F‑06 — Secret JWT par défaut** `gamitask_dev_secret` (`index.ts:655`), aussi utilisé pour le `state` OAuth Twitch. Si la variable manque, une session admin se forge. Confiance 8/10. *Fix : fail‑fast au démarrage si absent ou < 32 caractères ; `algorithms:["HS256"]` sur chaque `verify`.*
- **F‑07 — Crash serveur par payload mal typé.** Aucun handler n'est enveloppé ; `join {name:{}}`, `chat {text:1}`, `task:add {text:null}`, `room:create-private {name:1}` → `uncaughtException` → processus terminé, sessions et pomodoros collectifs perdus. Confiance 9/10. *Fix : wrapper try/catch générique + `typeof === "string"` avant `.trim()`/`sanitize`.*

**MOYEN**

- **F‑08 — Liaison Twitch : `state` non lié au navigateur.** Un attaquant génère l'URL avec son jeton, la fait cliquer à un streamer → les jetons Twitch du streamer (chatters, chat en direct) sont stockés sur le compte de l'attaquant (l.836-839). Confiance 7/10. *Fix : nonce en cookie HttpOnly comparé au callback ; retirer le scope `user:read:email` (jamais utilisé).*
- **F‑09 — `/api/feedback`** : spam d'issues GitHub, contenu non borné. Confiance 9/10. Route morte côté client : la supprimer.
- **F‑10 — `trust proxy` absent** derrière nginx : `req.ip` = IP du conteneur nginx pour tout le monde ; la waitlist est limitée à 5/min **globalement**. Confiance 9/10.
- **F‑11 — Aucun en‑tête de sécurité** (CSP, HSTS, X‑Frame‑Options, nosniff). `X-Powered-By` exposé. Les XSS ci‑dessus s'exécutent sans entrave. `.env.prod.example:5` documente `VITE_API_URL=http://…` en clair. Confiance 9/10.
- **F‑12 — Rollover journalier manipulable** par `tzOffsetMinutes` (l.932-940) : un reconnect avec +28 h de décalage remet les quotidiennes à `done:false` sans pénalité → double récompense. Confiance 7/10. *Fix : figer le fuseau, ou rollover en UTC serveur.*
- **F‑13 — Jetons Twitch (access + refresh) en clair dans SQLite.** Confiance 7/10.

**FAIBLE**

- F‑14 : traces de pile Express (`NODE_ENV` jamais défini dans le Dockerfile/compose).
- F‑15 : `email_verified` ignoré pour l'attribution admin (`index.ts:679-681`).
- F‑16 : CORS HTTP `*` alors que `CORS_ORIGINS` existe pour socket.io.
- F‑17 : `/twitch/viewers` proxy ouvert (prototype).
- F‑18 : rooms « privées » ouvertes à tous ; ban par `userId` qu'un invité régénère en vidant `localStorage`.
- F‑19 : conteneur serveur en root, `node:20-slim` (EOL avril 2026), `tsx` et devDeps en prod.
- F‑20 : jeton dupliqué dans deux clés `localStorage`, aucune révocation serveur.

### 1.4 Dépendances

`npm audit --prefix server` : **3 high** (engine.io < 6.6.7, socket.io‑parser < 4.2.7, ws ≤ 8.20.1), 2 moderate, 2 low — tous corrigeables par `npm audit fix`. App : 0 vulnérabilité.

### 1.5 Ce qui est bien fait

- SQL 100 % paramétré, y compris les `db.prepare` en ligne.
- Google Sign‑In : `verifyIdToken` avec `audience` ; pas de cookie de session, donc pas de CSRF de login.
- jsonwebtoken 9, expiration 30 j, `state` Twitch signé avec `purpose` et 10 min.
- `isAdmin()`/`canEditCatalog()` relisent le rôle en base à chaque appel ; tous les `admin:*` et `catalog:*` couverts.
- Sanitisation serveur systématique pour chat, tâches, look (énumérations fermées), catalogue (bornes, regex d'id qui exclut `__proto__`).
- Client : chat, classement, mentions, participants et infobulles passent par `textContent`/`esc()`/canvas. Deux oublis seulement (F‑04, F‑05).
- Économie : `task:score` calcule tout côté serveur, refuse le double coche ; pomodoro collectif chronométré serveur.
- Infra : serveur sans port exposé, assets hashés immuables, `.env` ignorés, aucun secret dans l'arbre suivi.

### 1.6 Ordre de traitement

1. Supprimer `debug:*` (F‑01) ; centraliser `userId = socketToUserId.get(socket.id)` (F‑02). Deux changements mécaniques.
2. `esc(m.name)` + validation `name`/`color` au `join` (F‑04) ; échapper `name`/`emoji` du catalogue (F‑05).
3. Pomodoro chronométré serveur (F‑03) ; figer le fuseau (F‑12).
4. Fail‑fast `JWT_SECRET`, `algorithms` (F‑06) ; wrapper des handlers (F‑07) ; `npm audit fix`.
5. `trust proxy`, en‑têtes nginx, `NODE_ENV=production`, CORS restreint, supprimer `/api/feedback` et `/twitch/viewers`.
6. Nonce Twitch, scopes réduits, chiffrement des jetons.

---

## 2. Le tableau de liège

### 2.1 Ce que fait le code

- Un panneau par salle (`scene.ts:360-365`) : café 3,6 × 1,7 m sur le mur du fond, chez soi 3,0 × 1,8, jardin 3,4 × 1,9.
- Chaque tâche « en attente » (`tasks.ts:27` : habitudes + à‑faire non faits + **quotidiennes non faites, dues ou non**) devient un groupe 3D : cadre bois, canvas 256×176 peint, punaise, étiquette de catégorie, grain doré = quotidienne, « ± » = habitude, fond teinté par la valeur cachée.
- Grille pure (`pinboard.ts`, testée) : les cartes rétrécissent jusqu'à `MIN_CARD = 0,3 m`, puis le surplus va dans un post‑it « + N ». Capacité : café 45, chez soi 35, jardin 48.
- Ordre : `Map` d'insertion. Au chargement du plus récent au plus ancien, **puis chaque nouvel ajout est épinglé en dernier** (`scene.ts:438`) → en cas de débordement, ce sont les tâches **fraîchement ajoutées** qui disparaissent dans le « + N ».
- Le tableau est **privé sur un mur partagé** : les autres joueurs ne voient pas vos cartes, seulement la pastille « N à faire » au‑dessus de votre tête.
- Aucune mécanique de jeu ne lit l'état des tickets : pas de récompense, pas de comportement d'avatar. C'est un rendu passif + un mode caméra.

### 2.2 Test en direct (desktop 1544 × 784)

- **Vue normale** : le tableau est un petit rectangle sombre avec 11 pavés illisibles. Aucune information lisible sans survol.
- **Gros plan** (clic sur le mur) : le tableau occupe **≈ 20 % de la largeur d'écran**, cartes ≈ 45 px de large, texte ≈ 7 px. Le commentaire du code dit « zooms until the board fills most of the view » (`scene.ts:728`) ; le clamp `1.6…4` de `boardZoom()` (l.731) l'empêche sur un écran large. Un premier essai capturé en cours d'animation montrait des cartes ≈ 80 px : le texte n'y était lisible qu'en zoomant la capture.
- **Survol** : infobulle DOM correcte (« Finir l'appart — Sans catégorie · cliquer pour lire le tableau »). C'est donc l'infobulle qui rend la carte lisible, pas la carte.
- **Clic sur une carte en gros plan** (2 essais, centre de carte) : le gros plan s'est refermé **sans ouvrir le tiroir**. Le code prévoit `focusTask` → tiroir ouvert + ligne qui clignote (`main.ts:295-297`). À confirmer à la main : soit le raycast rate les cartes à ce zoom, soit le test `dragging&&!moved` (`scene.ts:820`) échoue sur un clic synthétique.
- Après la sortie du gros plan, le zoom de la vue n'était pas toujours celui d'origine (une fois restauré, une fois plus serré).

### 2.3 Flux et clics

| Action | Depuis le tiroir | Depuis le tableau |
|---|---|---|
| Cocher une tâche | bouton tâches (1) → ✓ (2) = **2 clics** | mur (1) → carte (2) → tiroir s'ouvre → ✓ (3) = **3 clics** + Échap/clic ailleurs (4) pour remarcher |
| Lire le libellé complet | visible | survol → infobulle DOM ; la carte tronque à ~45 caractères sur 120 |
| Ajouter, éditer, supprimer, ±, checklist, série, échéance | oui | **rien** |

Le gros plan est **modal** : `mode='board'` coupe la marche et le drag, `canMove()` (`main.ts:517`) met en attente la demande de siège du pomodoro. Échap ferme **à la fois** le tiroir et le gros plan.

### 2.4 Redondance

Le tableau montre : texte tronqué, catégorie, type, teinte. Le tiroir montre tout cela **plus** la case à cocher, ±, compteurs, série, jours, échéance, checklist, filtre, édition. Seule information exclusive au tableau : voir les trois types en même temps. **≈ 85 % de doublon, en lecture seule, avec moins de contexte.**

### 2.5 Montée en charge et mobile

- 30 tâches = 30 canvas + 30 textures + ~150 meshes, reconstruits à chaque `mountRoom` (changement de salle, meuble posé, catalogue reçu) et repositionnés à chaque `task:*`.
- Poussière de craie en `Math.random()` (`scene.ts:404`) : chaque repeint change le grain.
- Quotidiennes du samedi épinglées le lundi (pas de filtre `isDue`), alors que le tiroir les grise.
- **Téléphone (390 px)** : carte ≈ 27 px, texte ≈ 3 px ; pas d'Échap au doigt, seul le « clic ailleurs » sort.

### 2.6 Verdict et options

Le tableau **ne sert pas le job principal** : il ne fait rien cocher, n'est lisible qu'avec l'infobulle, ajoute un mode caméra bloquant et un double‑Échap. Coût : ~180 lignes, un état de plus dans la scène, trois commits de polish.

1. **Réduire à un visuel passif — recommandé maintenant.** Supprimer le mode `board` (`scene.ts:728-746`, branches `mode==='board'` l.787, 807, 820, 898-900 ; `main.ts:285, 517-521` ; aide `hud.ts:137`). Garder tickets + survol + **clic = ouvre le tiroir sur la tâche** (`focusTask` existe déjà). Le mur redevient un indicateur d'ambiance (« combien il m'en reste, lesquelles rougissent ») et l'avatar n'est plus jamais bloqué. ≈ −80 lignes.
2. **Le rendre vraiment utile** (si les gens cliquent le mur) : en gros plan, clic sur un ticket = `task:score up` avec float « +10 » (2 clics comme le tiroir), appui long = ouvrir dans le tiroir ; filtrer `isDue` ; ordre stable « dû aujourd'hui » d'abord ; masquer les habitudes ; lever le clamp du zoom pour que le tableau remplisse l'écran ; désactiver le gros plan sous 800 px.
3. **Tableau = seule UI de tâches : non.** Habitudes ±, checklists, jours, édition, clavier, lecteur d'écran et téléphone exigent du DOM.

---

## 3. Inventaire et pertinence des fonctionnalités

Job principal évalué : « m'aider à faire mes tâches et rester concentré ».

| Fonctionnalité | ~Lignes | Job | Verdict |
|---|---|---|---|
| **Tiroir de tâches** (3 types, difficulté, checklist, jours, échéance, catégorie, filtre) | ~520 | tâches | **Essentiel.** Sur‑paramétré pour un débutant : tout est visible dès la première tâche. |
| **Tableau de liège** | ~180 | miroir | **À revoir** (§2). |
| **Pomodoro solo** | ~330 | focus | **Essentiel**, mais **aucun lien avec les tâches**. C'est le trou principal. |
| **Pomodoro de salle** | ~230 | focus + social | **Utile.** Deux minuteurs aux règles différentes (solo réglable / salle figée) dans le même dock. |
| **Énergie / cron du matin** | ~200 | motivation | **Utile mais inerte** : immunité jusqu'au niveau 3 (`IMMUNITY_LEVEL`) → barre immobile pendant des semaines, sans libellé. L'aide (`hud.ts:142`) décrit des seuils que le code n'applique pas (`scene.ts:511,519`). |
| **Progression** (pièces, XP, succès, journal du jour) | ~260 | motivation | **Utile.** Le journal est la meilleure pièce récente. Les succès sont des paliers génériques. |
| **Classement de la pièce** (`board.ts`) | ~100 | social | **Superflu.** Classe le **portefeuille** (`server:1424-1432`) : acheter un chapeau fait descendre, thésauriser sans rien faire = #1 à vie. |
| **Chat de salle** | ~350 | social | **Sympa mais dispensable.** Ouvert par défaut sur un fil vide dès la première seconde (`main.ts:199`). |
| **Salles** (café, jardin, chez moi, invitations, kick/ban) | ~700 | social | Café : utile. **Jardin : superflu** (même contenu, autre décor, split de la population). Kick/ban/invitations : dispensable avant d'avoir des invités. |
| **Boutique + mobilier + sets à bonus** | ~450 | motivation | **Utile** comme puits à pièces ; catalogue de 11 objets épuisé en 2 semaines ; bonus passifs invisibles qui compliquent l'économie. |
| **Éditeur de personnage v2** | ~520 | cosmétique | **Sympa mais dispensable** : 6 % du code pour un écran qu'on touche une fois. |
| **Atelier d'objets** (CSG) | ~400 + chunk 36 kB | admin | **Outil interne.** À geler. |
| **Twitch** | ~500 | social niche | **Sympa mais dispensable.** 0 contribution au job ; helpers `window.spawn*` de prototype encore en prod (`main.ts:306-345`). |
| **Ambiance** (lumière, pluie, carillons, notifications, « Écouter ») | ~150 | focus/cosmétique | Pluie + carillon : utile. Lumière figée, liste « Écouter », chip pluie en double : superflu. |
| **Landing** | ~350 | acquisition | **Utile**, copy périmée (§4), promesses non tenues. |
| **Auth Google + rôles** | ~130 | infra | **Essentiel.** |
| **Serveur mort** (guildes/boss, vidéo, DM, réactions, debug, admin) | ~400 | — | **À supprimer.** Effet visible : toast « N dégâts au boss » chez tout le monde (`main.ts:486`) sans boss dans l'UI. |

### 3.1 Répartition

| Bloc | Part |
|---|---|
| Job principal — tâches + scoring + tiroir | 6 % |
| Job principal — focus | 6,5 % |
| Boucle de motivation | 5 % |
| Social (chat, salles, classement, Twitch) | 20 % |
| Cosmétique / 3D (scène, décor, jardin, avatar, éditeur, atelier, boutique) | 33 % |
| Landing | 4 % |
| Serveur mort + CSS mort | 5 % |
| Infra | ~20 % |

**≈ 18 % du code sert directement le job principal.** Le seul lien tâche ↔ focus est la teinte des tickets.

---

## 4. Flux principal — les 5 premières minutes

1. `/` → « Entrer au café ». La landing parle de « tickets sur ta table » ; le héros montre un tableau au mur.
2. `/app/` : écran Google / invité. Sans `VITE_GOOGLE_CLIENT_ID`, un écran avec un seul bouton.
3. Dialogue pseudo + couleur, sans sortie possible, avant d'avoir rien vu.
4. **Premier message** : « Clique au sol pour marcher, sur une chaise pour t'asseoir » (`main.ts:66`). L'onboarding parle de se déplacer, pas d'une tâche. Le bouton tâches est **une icône ronde sans libellé** tant qu'il n'y a aucune tâche.
5. Écran d'arrivée : ~15 cibles cliquables (3 salles, progression, classement, compte, zoom, chat ouvert sur un fil vide, pluie, paramètres, dock à deux onglets) avant la première tâche.
6. Ajout d'une tâche : correct (bon onglet par défaut, Entrée). Mais aide, difficulté, options et filtre sont tous là dès la première.
7. Cocher : toast « +10 pièces · **5 dégâts au boss** » — le boss n'existe pas. Le float « +10 » n'est envoyé qu'aux **autres** (`main.ts:455`) : on ne voit jamais son propre +10 flotter. Toasts en file séquentielle : 5 tâches cochées d'affilée = ~17 s de toasts en retard.
8. Premier focus : « C'est parti » → **demande de permission de notifications immédiate** (`pomodoro-ui.ts:73`), au pire moment.
9. **Impasse conceptuelle** : le focus ne sait pas sur quoi on travaille. Aucun « ce pomodoro = cette tâche », aucun compteur de focus par tâche, aucune suggestion « commence par celle‑ci » (la valeur cachée qui rougit serait le candidat évident).
10. Jauge d'énergie visible mais **immobile jusqu'au niveau 3**.
11. **Téléphone (≤ 800 px)** : boutons Focus/Pause/Longue **masqués** (`style.css:42`) → impossible de lancer une pause à la main ; compteur « N à faire » masqué ; gros plan illisible ; pas d'Échap.

---

## 5. Incohérences et dettes UX

**Copy périmée (ardoises / table → tableau)**
- `hud.ts:80` : « Chaque tâche devient une petite ardoise posée sur une table du café. »
- `main.ts:483` : « Tes notes sont posées sur la table. »
- `landing.ts:18, 41, 63, 77, 93, 107, 165, 193` + `app/index.html:7, 19, 25` : « tickets posés sur ta table ».
- `README.md:37`, commentaire `scene.ts:400`.
- Trois métaphores pour la même liste : « Passer commande » au comptoir, « AU COMPTOIR / Mes petites tâches », tableau au mur.

**Promesses non tenues**
- FAQ : « Tu peux tout supprimer depuis ton compte » — aucune suppression de compte dans le code. « Serveurs en Europe » — non vérifiable. Twitch listé en Pro alors qu'il est actif en gratuit.
- `hud.ts:130` « faire apparaître tes viewers dans ta salle, **plus tard** » — livré.
- `hud.ts:98` « Succès 0/7 » en dur, 8 succès dans `progress.ts`.
- Succès « 5 pomodoros consécutifs » = 5 pomodoros espacés de moins de 2 h ; indevinable.

**Réglages en double / inutiles**
- Deux « réglages » : chip Paramètres et engrenage du minuteur. Deux horloges qui ouvrent deux dialogues différents.
- Pluie : chip HUD **et** case dans le panneau.
- « S'asseoir en focus » : case que personne ne décochera. « Focus avant la longue pause » 2‑12 + « Enchaîner » : sur‑configuration. Liste « Écouter » : 4 boutons pour tester des bips.
- `room-kicker` « 25 / 5 / 15 · SESSION 1 » en dur (`pomodoro-ui.ts:108`).

**Interactions cachées** : catégorie et difficulté changent en **cyclant au clic** sur un point / des pips (`tasks-ui.ts:79-80`), sans menu. Touche T pour le chat. Échap à double effet.

---

## 6. Sur‑ingénierie et code mort (≈ −1 750 lignes)

`tsc --noEmit` : 0 erreur des deux côtés. `depcheck` : `typescript` devDep serveur utilisée par aucun script.

Classé du plus gros au plus petit :

- **delete** Guildes entières : tables, 29 requêtes, `emitGuildState`, `handleBossDefeat`, hooks boss dans rollover/pomoTick/task:score, 4 handlers `guild:*`, types. Le client n'émet ni n'écoute aucun `guild:*`. `[index.ts:295-312,442-470,538-618,944-950,1302-1319,2113-2125,2473-2488,2726-2797 ; types.ts:405-408,565-574,587-606]` (~−290)
- **delete** Vidéo partagée : `sharedVideo`, `video:set/sync/stop`, nettoyages, `VideoState`. Jamais utilisé côté client. `[index.ts:1148-1152,1180-1188,1221-1229,1554-1561,1683-1694,1730-1738,1780-1793,2528-2569 ; types.ts:218-228,409-416]` (~−140)
- **delete** `app/backups/v1-petite-salle` suivi par git ; `git log` garde l'historique. (−527)
- **shrink** 30 blocs `try { db.exec(ALTER…) } catch {}` copiés‑collés → une boucle comme celle déjà écrite l.187‑208 ; retirer les colonnes fantômes `degradation`, `type`, `col`, `row`. `[index.ts:160-293]` (~−95)
- **delete** Prototypes Twitch console : `window.spawnTwitchViewers/spawnMyChatters/spawnFakeChatters`, `/twitch/viewers`, `/twitch/chatters`, mode `wander`, `location /twitch/` nginx. Remplacés par `twitchNpcs.ts`. `[main.ts:305-345 ; auth.ts:30-38 ; index.ts:737-751,873-896 ; twitch.ts:5-36 ; scene.ts:21,544-566 ; nginx/default.conf:64-69]` (~−140)
- **delete** `/api/feedback` → GitHub Issues + `GITHUB_TOKEN`. Aucun appel client. `[index.ts:2800-2869 ; docker-compose.prod.yml:15]` (−72)
- **delete** `admin:give-coins/give-xp/announce` + `isAdmin()` + copie inline de `sanitize`. Jamais émis. `[index.ts:2607-2647,2674-2691]` (~−70)
- **delete** `furniture:player-update` (×4) et `placed/positions` des `Player` : jamais lus. `[index.ts:1611-1620,1750-1760,2224-2233,2265-2274,2301-2310,2354-2363 ; types.ts:42-43]` (~−60)
- **delete** `room:delete-private` + `private-room:deleted`. `[index.ts:1824-1872]` (−53)
- **delete** `debug:*` (5 handlers) — aussi la faille F‑01. `[index.ts:2149-2187]` (−45)
- **delete** `PUBLIC_ROOMS_META`, `PRIVATE_ROOM_THEME`, room `sunset` inaccessible, champs miroirs de `RoomState`. Le client ne lit que `id,count,isPrivate,ownerId`. `[types.ts:233,251-297,303-316 ; index.ts:1135-1146,1482-1501]` (~−55)
- **delete** `ACHIEVEMENTS` dupliqué serveur/client (icône divergente 🌐 vs 🤝). `[index.ts:1047-1101 ; progress.ts:3-12]` (~−50)
- **delete** `private-message` et `chat:react`. `[index.ts:1964-1976,1987-2001]` (−40)
- **shrink** `createPublicRoomState` / `createPrivateRoomState` : deux copies → une. `[index.ts:1155-1231]` (~−35)
- **delete** Catalogue dupliqué client/serveur avec noms divergents (« Chapeau fête » / « Chapeau de fête »). Importer de `@shared/types`. `[shop.ts:5-24 ; types.ts:48-173]` (~−30)
- **shrink** Bloc « quitter le pomo de salle » copié ×4 → `leavePomo(room,sid)`. `[index.ts:1545-1553,1721-1728,2518-2525,2585-2593]` (~−20)
- **delete** 16 imports jamais utilisés dans `index.ts:35-62`. Activer `noUnusedLocals`. (−16)
- **delete** `position:save` + colonnes `col/row` : le serveur ne relit jamais la position. (−15)
- **delete** CSS de la v1 (sidebar/header/hud-menu/timer-dial/#intention/#sign-in… ~100 règles, 6,5 Ko sur 69). Aucun sélecteur dans `hud.ts`. `[style.css:4-9,42,64-66,77,82,160,188]`
- **delete** `getEffectivePlaced` déjà couvert par la migration l.259‑266. (−12)
- **delete** `sanitize` = `scoring.escapeHtml` + `.slice(0,200)`. Exporter `escapeHtml`. (−12)
- **delete** Duplications : `hex()` ×2 + 4 inlines, `levelOf`, `DURATION`/`DURATIONS`, `PUBLIC_IDS`, formule `50*(l+1)*(l+1)` ×4, mm:ss ×2 alors que `pomo.format` existe, `landing.ts` recopie `icon/drawIcons/load/save/today/esc` de `ui.ts`. (~−30)
- **delete** Méthodes d'API jamais appelées : `Chat.close/toggle/isOpen/clear/emotes/dispose`, `Board.open/toggle/isOpen/dispose`, `Net.setRoom`. (~−15)
- **yagni** `ALLOW_GUEST_PRIVATE_ROOMS` jamais flippé ; colonne `isAdmin` doublon de `role` ; `identity.token` dupliqué avec `gamitask.token` ; `progress.xpToNext` stocké mais recalculé.
- **delete** `package-lock.json` racine (vide), `.vite/deps/*`, `.DS_Store` suivis par git.
- **shrink** `@types/*` en `dependencies` → `devDependencies` ; `typescript` serveur sans script.
- **shrink** Commentaire Dockerfile « frontend React/Vite » : plus de React.

Coutures naturelles d'`index.ts` (2 874 l., ~1 900 après suppressions) : `db.ts` (schéma + `sql`), `http.ts` (auth + waitlist), `rooms.ts` (état + pomo collectif), `handlers/*.ts` par domaine. **Rien de tout ça n'est nécessaire avant d'avoir supprimé le mort.**

Rien à couper : tests, `vite.config.ts`, `landing.css`, dépendances app.

---

## 7. Plan d'action

### Semaine 1 — sécurité (bloquant)
1. Supprimer `debug:*`, `admin:*`, `/api/feedback`, `/twitch/viewers`, guildes, vidéo, DM, réactions (code mort **et** surface d'attaque). ≈ −700 lignes.
2. Un `uid = socketToUserId.get(socket.id)` en tête de chaque handler ; retirer `userId` des payloads client.
3. `esc(m.name)`, validation `name`/`color` au `join`, échappement du catalogue.
4. Pomodoro `start` serveur ; fuseau figé.
5. Fail‑fast `JWT_SECRET` ; wrapper try/catch ; `npm audit fix` ; `trust proxy` ; en‑têtes nginx ; `NODE_ENV=production`.

### Semaine 2 — job principal
1. **Lier focus et tâche** : bouton ▶ sur la ligne de tâche = « Focus sur… » ; compter les focus par tâche ; à la fin d'un focus, proposer de cocher.
2. **Onboarding orienté job** : premier message = « Note une chose à faire » ; bouton tâches libellé même vide ; notification demandée au premier focus terminé ; chat fermé par défaut ; formulaire minimal, options derrière « plus ».
3. **Tableau de liège → visuel passif** (option 1 du §2). Ou, si conservé en gros plan : lever le clamp de zoom, clic = cocher, sous 800 px désactivé.
4. **Mobile minimum** : rétablir Focus/Pause/Longue, afficher « N à faire », bouton de sortie visible pour tout mode caméra.

### Semaine 3 — nettoyage
1. Reste du code mort (§6), CSS v1, backups, doublons client/serveur.
2. Copy : une seule métaphore (le tableau) ; corriger tiroir, landing, README, FAQ ; retirer les promesses non tenues ; aligner l'aide énergie avec les seuils réels ; retirer « dégâts au boss ».
3. Énergie : la cacher jusqu'au niveau 3, ou lui donner un libellé et un effet dès le niveau 1.
4. Classement : le retirer, ou classer par « focus terminés aujourd'hui dans la pièce » (donnée déjà présente côté salle).
5. Geler atelier, éditeur v2, jardin, Twitch tant que la boucle tâche → focus → récompense n'est pas validée par l'usage.

### Non vérifié
- FPS réels avec 45 tickets en scène (non mesuré).
- Comportement exact du clic sur une carte en gros plan (deux essais automatisés ont fermé le gros plan sans ouvrir le tiroir ; à reproduire à la main).
