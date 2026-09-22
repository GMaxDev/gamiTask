# Tâches façon Habitica : habitudes, quotidiennes, à-faire, énergie

Spec de design, 2026-09-22. Découle du bench `docs/2026-09-22-bench-habitica-taches.md` ; les décisions y sont justifiées, ici on décrit ce qu'on construit.

## 1. Périmètre

Dedans :
- Trois types de tâches : **habitude** (`habit`), **quotidienne** (`daily`), **à-faire** (`todo`).
- **Difficulté** à quatre niveaux, **valeur cachée** par tâche qui module les gains et teinte la carte.
- **Énergie** du personnage (0-50) qui remplace la dégradation 0-5.
- **Cron** généralisé au premier passage du jour.
- **Panneau** de tâches en trois onglets, **HUD** avec la jauge d'énergie, **ardoises 3D** teintées.
- Jours de la semaine pour les quotidiennes, checklist pour les à-faire.

Dehors (voir bench §8) : récompenses perso, checklist sur les quotidiennes, inspiration/rôles/actions collectives, heure de bascule personnalisée, étiquettes libres, répétitions hebdo/mensuelles.

## 2. Modèle de données

### 2.1 `tasks`

Migration additive sur la table existante (`ALTER TABLE … ADD COLUMN`, même pattern que les migrations en haut de `server/src/index.ts`).

| Colonne | Type | Défaut | Rôle |
|---|---|---|---|
| `kind` | TEXT | `'todo'` | `habit` / `daily` / `todo`. Remplace `type` : migration `UPDATE tasks SET kind = CASE type WHEN 'daily' THEN 'daily' ELSE 'todo' END`. La colonne `type` reste en base, plus lue |
| `difficulty` | TEXT | `'easy'` | `trivial` / `easy` / `medium` / `hard` |
| `value` | REAL | `0` | Valeur cachée, bornée à [−25, +25] |
| `note` | TEXT | `''` | Une ligne, 200 caractères max, texte brut |
| `up` | INTEGER | `1` | habit : bouton « + » actif |
| `down` | INTEGER | `0` | habit : bouton « − » actif |
| `countUp` | INTEGER | `0` | habit : coches « + » du jour |
| `countDown` | INTEGER | `0` | habit : coches « − » du jour |
| `days` | INTEGER | `127` | daily : bitmask lundi = 1 … dimanche = 64 |
| `streak` | INTEGER | `0` | daily : jours consécutifs |
| `dueAt` | INTEGER | NULL | todo : date butoir, affichage seulement |
| `checklist` | TEXT | `'[]'` | todo : JSON `[{text, done}]`, 20 items max, 80 caractères par item |
| `completedAt` | INTEGER | NULL | todo : date de validation |

`done` garde son sens : todo validée, ou daily cochée aujourd'hui (remise à 0 au cron). Pour une habitude, `done` reste 0.

### 2.2 `users`

| Colonne | Type | Défaut | Rôle |
|---|---|---|---|
| `energy` | INTEGER | `50` | 0-50 |
| `exhaustedUntil` | INTEGER | `0` | Épuisement affiché jusqu'à ce timestamp (minuit suivant) |
| `tzOffset` | INTEGER | `0` | Décalage client en minutes, pour calculer « minuit » au cron |
| `lastDailyResetAt` | existant | | Réutilisé tel quel pour le cron |
| `degradation` | existant | | Plus lue ni écrite. Supprimée dans une migration ultérieure |

### 2.3 Type partagé (`server/src/types.ts`)

```ts
export type TaskKind = 'habit' | 'daily' | 'todo';
export type Difficulty = 'trivial' | 'easy' | 'medium' | 'hard';
export interface ChecklistItem { text: string; done: boolean }
export interface Task {
  id: string; userId: string; text: string; note: string;
  kind: TaskKind; difficulty: Difficulty; value: number;
  category: string | null; createdAt: number;
  done: boolean;                       // todo validée / daily cochée aujourd'hui
  up: boolean; down: boolean; countUp: number; countDown: number;   // habit
  days: number; streak: number;                                     // daily
  dueAt: number | null; checklist: ChecklistItem[]; completedAt: number | null; // todo
}
```

Un seul type plat plutôt qu'une union : le client rend les trois kinds dans la même liste et le serveur lit une seule table. Les champs hors-kind gardent leur défaut.

## 3. Règles (module `server/src/scoring.ts`)

Module pur, sans base ni socket, testé unitairement comme `waitlist.ts`. `index.ts` ne fait que lire les lignes, appeler ces fonctions, écrire et émettre.

```ts
export const PRIORITY = { trivial: 0.1, easy: 1, medium: 1.5, hard: 2 } as const;
export const VALUE_MIN = -25, VALUE_MAX = 25, DELTA_CAP = 3, ENERGY_MAX = 50;
export const IMMUNITY_LEVEL = 3;       // pas de perte d'énergie avant ce niveau
export const CRON_ENERGY_CAP = 20;     // perte max d'énergie par cron, tous jours confondus

export function delta(task: Pick<Task,'value'|'difficulty'|'kind'|'checklist'>): number
// 0.9747 ** value * PRIORITY[difficulty], × (1 + done/(2·total)) si todo avec checklist, plafonné à DELTA_CAP

export function rewards(d: number): { coins: number; xp: number; bossDamage: number }
// coins = round(10·d), xp = round(15·d), bossDamage = round(5·d)

export function energyLoss(d: number, level: number): number
// level < IMMUNITY_LEVEL ? 0 : round(3·d)

export function score(task, direction: 'up'|'down', level): { task: Task; coins; xp; bossDamage; energyDelta }
// applique une coche : value ± d (borné), gains ou perte, et les compteurs propres au kind (voir §4)

export function rollover(tasks: Task[], from: Date, to: Date, level): { tasks: Task[]; energyDelta: number; missed: Task[] }
// applique le cron pour chaque jour manqué entre from (exclu) et to (inclus), voir §5

export function isDue(task: Task, date: Date): boolean   // daily : bit du jour dans `days`
export function tint(value: number): 0|1|2|3|4           // 5 paliers pour la couleur : ≥8, ≥2, >−2, >−10, ≤−10
export function levelOf(xp: number): number              // déplacé depuis index.ts (computeLevel), inchangé
```

`value` est arrondi à 3 décimales en base pour rester lisible.

## 4. Cocher une tâche : `task:score`

Un seul événement remplace `task:toggle` :

```ts
"task:score": (payload: { userId: string; taskId: string; direction: 'up' | 'down' }) => void;
```

| Kind | `up` | `down` |
|---|---|---|
| habit | Refusé si `!task.up`. `countUp++`, `value += d`, gains | Refusé si `!task.down`. `countDown++`, `value −= d`, `energy −= energyLoss(d)` |
| daily | Refusé si `done`. `done = 1`, `streak++`, `value += d`, gains, `energy = min(50, energy + 1)` | « Décocher » : refusé si `!done`. `done = 0`, `streak−−`, `value −= d`, gains retirés (pièces plancher 0) |
| todo | Refusé si `done`. `done = 1`, `completedAt`, `value += d`, gains, `energy + 1` | « Décocher » : refusé si `!done`. `done = 0`, `completedAt = null`, `value −= d`, gains retirés |

Une daily non due aujourd'hui reste cochable et rapporte (comme Habitica).

Gains : `coins` s'ajoutent aux bonus mobilier existants (`fengBonus`, `getSetBonuses().coinsTask`, lampe +5 XP), qui restent des additifs. `bossDamage` remplace les 15 dégâts fixes dans la guilde. Achievements existants (`first-task`, `task-10`, `task-50`, `coins-*`) inchangés, calculés sur `done = 1` des todo + daily.

Réponse : `task:scored { task, coins, xp, level, xpToNext, levelUp, energy, bossDamage }`. Le client remplace la tâche entière (le serveur est la source des compteurs et de la valeur). `xp:update`, `coins:update`, `guild:*` continuent d'être émis là où ils le sont déjà pour les autres flux (pomodoro).

Rate-limit : `allow(socket.id, "task:score", 30, 10000)`.

## 5. Le cron

`checkAndApplyDailyReset` devient `runRollover(socket, userId)` et appelle `scoring.rollover`. Toujours déclenché au `join`, jamais par minuterie serveur.

Pour chaque jour `D` entre `lastDailyResetAt` (exclu) et aujourd'hui (inclus), dans l'ordre :
1. Chaque daily due le jour `D − 1` et non `done` : `value −= delta`, `streak = 0`, `energyDelta −= energyLoss(delta, level)`, ajoutée à `missed`.
2. Toutes les daily : `done = 0`.
3. Toutes les habit : `countUp = countDown = 0`.
4. Chaque todo non `done` : `value −= 0.5`.

Puis `energyDelta = max(energyDelta, −CRON_ENERGY_CAP)`. Au plus 30 jours sont rejoués (au-delà, on considère un retour à neuf : mêmes remises à zéro, pas de perte).

Effets dans `index.ts` :
- Écriture des tâches et de `energy`, `lastDailyResetAt = minuit d'aujourd'hui` (heure serveur, comme aujourd'hui — fuseau : voir §10).
- Boss de guilde : `+5 PV` par daily ratée (règle existante conservée).
- Émission `day:rollover { missed: Task[], energy, energyDelta }` puis `tasks:state`.

Fuseau : le client envoie `tzOffsetMinutes` dans `join` ; le serveur calcule « minuit » avec. Une colonne `users.tzOffset` le mémorise pour le prochain cron. C'est la seule concession au fuseau dans cette itération.

## 6. Énergie

- `energy` ∈ [0, 50], envoyé dans `tasks:state` et `task:scored`, et par `energy:update { energy }` quand un autre flux la change (rollover, épuisement).
- Remontée : +1 par daily/todo réussie, remise à 50 au level-up (`emitXpUpdate` le fait déjà savoir ; on y ajoute la remise à 50 et un `energy:update`).
- **Épuisement** : quand une perte la fait passer à ≤ 0 : `energy = 50`, `coins = floor(coins × 0.7)`, émission `energy:exhausted { coins }`. Le client affiche le perso « épuisé » jusqu'au prochain rollover (flag `exhaustedUntil` = minuit suivant, en base pour survivre au rechargement).
- Immunité : `energyLoss` renvoie 0 sous le niveau 3.

Le débogage existant (`debug:set-degradation`, `admin:set-degradation`, `room:clean`) est retiré avec la dégradation ; `debug:set-energy { userId, energy }` le remplace, mêmes gardes.

## 7. Événements socket

Client → serveur :

| Événement | Payload | Note |
|---|---|---|
| `task:add` | `{ userId, text, kind, difficulty, category, note?, up?, down?, days?, dueAt?, checklist? }` | Champs hors-kind ignorés |
| `task:score` | `{ userId, taskId, direction }` | §4 |
| `task:update` | `{ userId, taskId, patch: Partial<Pick<Task,'text'|'note'|'difficulty'|'category'|'up'|'down'|'days'|'dueAt'|'checklist'>> }` | Un seul événement d'édition ; `checklist` remplacé en bloc |
| `task:delete` | `{ userId, taskId }` | inchangé |
| `join` | + `tzOffsetMinutes` | §5 |
| `debug:set-energy` | `{ userId, energy }` | §6 |

Serveur → client :

| Événement | Payload |
|---|---|
| `tasks:state` | `{ tasks, coins, energy }` |
| `task:added` | `Task` |
| `task:scored` | `{ task, coins, xp, level, xpToNext, levelUp, energy, bossDamage }` |
| `task:updated` | `Task` (entier, plus `{taskId,text,category}`) |
| `task:deleted` | `{ taskId }` |
| `day:rollover` | `{ missed: Task[], energy, energyDelta }` |
| `energy:update` | `{ energy }` |
| `energy:exhausted` | `{ coins }` |

Retirés : `task:toggle`, `task:toggled`, `degradation:update`, `debug:set-degradation`, `admin:set-degradation`, `room:clean`.

`tasks:public-update` et `task:completed-public` (les autres joueurs voient les ardoises et l'animation de validation) restent ; « pending » pour les ardoises = todo non faites + daily non cochées aujourd'hui + toutes les habitudes.

Validation serveur (dans `index.ts`, helpers dans `scoring.ts`) : `kind`, `difficulty` dans leurs enums sinon défaut ; `days` masqué à 7 bits, 0 refusé → 127 ; `checklist` tronquée à 20 items / 80 caractères, `done` forcé booléen ; `note` via `sanitize` puis 200 caractères ; `dueAt` entier ou null.

## 8. Client

### 8.1 État (`app/src/tasks.ts`)

- `TasksState { list: Task[]; tab: TaskKind; filter: 'remaining' | 'all' }`.
- `taskScored(s, task)` remplace `taskToggled` : remplace la tâche par celle du serveur.
- `taskUpdated(s, task)` prend la tâche entière.
- `visible(s, today)` : les tâches de l'onglet courant, filtrées (`remaining` : daily non cochées, todo non faites ; les habitudes ne sont jamais filtrées), triées : dues aujourd'hui d'abord pour les daily, puis `createdAt` décroissant.
- `pending(s)` : cf. §7, alimente les ardoises.
- `cleanChecklistItem`, `daysMask(toggle)`, `difficultyLabel` : helpers purs.
- `tint(value)` importé de `@shared/scoring` (le module est partagé via l'alias `@shared` existant, comme `types.ts`).

### 8.2 Progression (`app/src/progress.ts`)

- `Progress` gagne `energy: number` et `exhausted: boolean`. `setEnergy(p, energy)`.
- `levelInfo` inchangé.

### 8.3 Panneau (`app/src/main.ts`, markup dans le template existant du drawer)

```
[Habitudes 3] [Quotidiennes 2/4] [À faire 2]        ← onglets, compteur = restantes
[+ champ texte…………………………………] [▪▪ Facile ▾] [+]
  Boulot Perso Urgent Étude                             ← chips catégorie (existant)
  onglet quotidiennes : [L][M][M][J][V][S][D]           ← 7 toggles, tous actifs par défaut
  onglet habitudes    : [+ oui] [− non]                 ← deux toggles
  onglet à faire      : [📅 date] (optionnel)
─────────────────────────────────────────────────
liste de l'onglet, chaque <li> teinté par tint(value) (--tint-0 … --tint-4)
  habit : [−]? texte ·cat ▪▪   [+]?   petits compteurs « 2 · 0 »
  daily : [☐] texte ·cat ▪▪ 🔥12   « L M _ J V _ _ » en tout petit, li.not-due si pas aujourd'hui
  todo  : [☐] texte ·cat ▪▪ [›] 2/5  📅 ven.   ; le chevron déplie la checklist (☐ étape, + ajouter)
─────────────────────────────────────────────────
Restantes · Toutes                                      ← pas sur l'onglet habitudes
```

- Texte éditable en place (existant), point de catégorie cliquable (existant), pastille de difficulté cliquable → cycle des 4 niveaux (`task:update`), croix de suppression.
- Ajout : Entrée dans le champ → `task:add` avec les options de l'onglet courant. Le formulaire garde la difficulté et les jours choisis pour l'ajout suivant.
- Les cinq teintes sont des variables CSS dans `style.css`, dans la DA (craie fraîche → craie effacée → rouille) ; une seule classe `tint-N` sur le `<li>`.
- `#tasks-count` (chip du HUD) affiche le nombre de restantes (daily dues non cochées + todo non faites).

### 8.4 HUD et retours

- Jauge ☕ énergie dans le chip de progression, sous la barre d'XP, même style ; `aria-valuenow`. Dans le panneau « Ma progression » : ligne « Énergie 32 / 50 ».
- Toast de `task:scored` : « +12 pièces · +18 XP » (+ « · 6 dégâts au boss » si guilde). Direction `down` sur une habitude : « −3 énergie ».
- `day:rollover` avec `missed.length > 0` : toast persistant « Hier : 2 quotidiennes oubliées, −6 ☕ » avec les titres au survol. Sans raté et énergie inchangée : rien.
- `energy:exhausted` : toast « Épuisé… tu as perdu 30 % de tes pièces. Repose-toi, demain ça repart. »
- Level-up : le toast existant ajoute « énergie rechargée ».

### 8.5 Personnage (`app/src/scene.ts` / `avatar.ts`)

- `cafe.setEnergy(energy, exhausted)`.
- `energy < 25` : bâillement (tête qui bascule en arrière 0,6 s, bras qui monte) toutes les 20-40 s au repos.
- `energy < 10` : vitesse de marche × 0,7, s'assoit automatiquement sur le siège libre le plus proche après 8 s d'immobilité.
- `exhausted` : teinte grise du corps (multiplie la couleur du matériau), assis d'office à l'arrivée.
- Seul le joueur local est concerné ; les autres ne voient pas l'énergie (pas de diffusion).

### 8.6 Ardoises 3D (`scene.ts`)

- Une ardoise par tâche `pending` (habitudes incluses).
- Teinte : `tint(value)` module la couleur de fond du canvas (5 couleurs, mêmes valeurs que le CSS). Changement de valeur → redessin du canvas et `texture.needsUpdate`, sans recréer le mesh : `setTasks` compare `value`/`text`/`category` et rafraîchit.
- Habitude : un « ± » à la craie en haut à droite du canvas. Quotidienne : la fève dorée existante. À-faire : rien.

## 9. Migration des données existantes

- `type = 'daily'` → `kind = 'daily'`, `days = 127`, `streak = 0`.
- `type = 'task'` → `kind = 'todo'`, `completedAt = createdAt` si `done`.
- Tous : `difficulty = 'easy'`, `value = 0`.
- `users.energy = 50` pour tous, `degradation` ignorée.
- Landing (`gamitask.landing.handoff`) : les notes importées deviennent des `todo` `easy`.

## 10. Erreurs et cas limites

| Cas | Comportement |
|---|---|
| `task:score` sur une tâche d'un autre utilisateur ou inexistante | Ignoré (comme aujourd'hui) |
| Double clic rapide sur une daily | Le second `up` est refusé (`done` déjà 1) ; côté client le bouton est désactivé jusqu'au `task:scored` |
| Deux onglets ouverts | Chaque `task:scored` remplace la tâche : cohérent |
| Absence longue | ≤ 30 jours rejoués, perte d'énergie plafonnée à 20 ; > 30 jours : remises à zéro sans perte |
| Fuseau | `tzOffsetMinutes` du client ; changer de fuseau ne rejoue pas un jour déjà passé (`lastDailyResetAt` garde la référence) |
| `days = 0` | Refusé → 127 |
| Checklist > 20 items | Tronquée silencieusement |
| Énergie à 0 par une habitude « − » | Épuisement immédiat (§6), pas d'attente du cron |
| Décocher une todo dont la checklist a changé entre-temps | `value −= delta` recalculé avec la checklist courante ; l'écart éventuel est accepté |
| Pièces insuffisantes pour retirer un gain | Plancher 0 (comportement existant) |

## 11. Tests

Serveur (`server/tests/scoring.test.ts`, `node --test`) :
- `delta` : valeur 0 / facile = 1 ; difficulté ; bornes ; plafond 3 ; bonus checklist.
- `rewards` : arrondis ; `energyLoss` : immunité.
- `score` : chaque kind × direction, refus, bornes de `value`, streak.
- `rollover` : un jour, plusieurs jours, daily non due hier non punie, plafond d'énergie, > 30 jours, remise à zéro des compteurs, todo qui vieillit.
- `isDue` avec bitmask, `tint` paliers.

Client (`app/tests/tasks.test.ts`, `progress.test.ts`) :
- `visible` par onglet et filtre, tri des dues ; `pending` ; `taskScored` ; helpers de checklist et de jours ; `setEnergy` bornes.

Manuel (après `npm run dev`) : créer une tâche de chaque kind, cocher, décocher, `debug:set-energy` à 3 puis rater via `−`, forcer un rollover en reculant `lastDailyResetAt` en SQL et rejoindre.

## 12. Découpage en plan

1. `scoring.ts` + tests. Migration, `task:add` / `task:score` / `task:update`, `runRollover`, énergie, événements, retrait de la dégradation. Types partagés.
2. Client état + tests, panneau à onglets, formulaire par kind, checklist, teintes CSS.
3. HUD énergie, toasts, `day:rollover`, épuisement.
4. Ardoises teintées + « ± », animations du personnage.

Chaque étape se livre seule ; l'étape 1 se vérifie au socket avant que le panneau existe.
