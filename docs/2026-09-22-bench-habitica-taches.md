# Bench : le système de tâches d'Habitica, et ce qu'on en reprend dans gamiTask

Date : 2026-09-22. Aucun code n'a été écrit ; ce document sert à décider.

## 1. Méthode

- Compte Habitica réel (niveau 21, guerrier) manipulé dans Chrome : ouverture des quatre formulaires de création, clic « + » sur une habitude, coche puis décoche d'une quotidienne (compte remis en l'état).
- Lecture du code gamiTask : `server/src/index.ts` (tables `users`/`tasks`, `task:toggle`, `checkAndApplyDailyReset`, `emitXpUpdate`, boss de guilde), `app/src/tasks.ts`, `app/src/progress.ts`, `app/src/main.ts` (panneau), `app/src/scene.ts` (ardoises 3D).
- Les formules Habitica citées viennent de la doc publique (wiki) ; elles sont marquées « ≈ » quand je n'ai pas pu les vérifier sur le compte.

## 2. Habitica, mécanique par mécanique

### 2.1 Les quatre colonnes

| Colonne | Ce que c'est | Champs du formulaire | Interaction |
|---|---|---|---|
| **Habitudes** | Comportements sans horaire, cochables plusieurs fois par jour | Titre, notes, **Positif / Négatif** (l'un, l'autre ou les deux), difficulté, étiquettes, **remise à zéro du compteur** (quotidienne / hebdo / mensuelle) | Bouton « + » : gains. Bouton « − » : perte de PV. Compteurs +/− affichés sur la carte |
| **Quotidiennes** | Tâches récurrentes planifiées | Titre, notes, **checklist**, difficulté, **date de début**, répétition (quotidienne / hebdo / mensuelle / annuelle), « tous les N », **jours de la semaine**, étiquettes | Case à cocher. Une quotidienne **due et non cochée à minuit** fait perdre des PV. Compteur de **série** (jours consécutifs). Une quotidienne non due (grisée) reste cochable et rapporte |
| **À faire** | Une seule fois | Titre, notes, **checklist**, difficulté, **date butoir**, étiquettes | Case à cocher. Pas de punition à minuit ; mais sa **valeur baisse chaque jour** (vire au rouge) donc elle **rapporte de plus en plus** quand on la finit enfin |
| **Récompenses** | Ce qu'on s'achète avec l'or | Titre, notes, **prix**, étiquettes | Onglets : équipement du jeu / récompenses perso / liste de souhaits |

Filtres par colonne : Habitudes (Tous / Faibles / Fortes), Quotidiennes (Tous / Restantes / Non échues), À faire (Actives / Planifiées / Accomplies). Recherche et étiquettes au-dessus des colonnes. Un seul bouton « Ajouter une tâche » avec menu à quatre entrées.

### 2.2 Difficulté

Quatre niveaux, multiplicateur `priority` sur tout (gains et dégâts) :

| Niveau | Multiplicateur |
|---|---|
| Banal | 0,1 |
| Facile | 1 |
| Moyen | 1,5 |
| Difficile | 2 |

### 2.3 Valeur cachée et couleur (le cœur du système)

- Chaque tâche a une **valeur** `v`, 0 à la création.
- Réussir : `v` monte. Rater / cliquer « − » : `v` baisse. Une à-faire perd un peu de valeur chaque jour où elle traîne.
- **Le gain d'une action est `delta ≈ 0,9747^v × priority`** : plus la tâche est « bleue » (bien tenue), moins elle rapporte ; plus elle est « rouge » (négligée), plus elle rapporte, et plus elle fait mal quand on la rate.
- La couleur de la carte suit `v` : bleu foncé (≥ 6), bleu clair, jaune (≈ 0), orange, rouge, rouge foncé (< −20). C'est le seul retour visuel, et il suffit : on voit d'un coup d'œil ce qu'on néglige.

Observé sur le compte : cocher une quotidienne grise (non due) → **+2 or, +7 XP, +2 dégâts au boss**, série 0 → 1.

### 2.4 Gains et pertes (≈ formules wiki)

| Quoi | Formule | Modulateurs |
|---|---|---|
| XP | `≈ 28 × delta` | Intelligence (classe mage) |
| Or | `≈ 3 × delta` | Perception (classe voleur) |
| Dégâts au boss de quête | `≈ delta × (force)` | Force (classe guerrier) |
| Perte de PV (quotidienne ratée, habitude « − ») | `≈ 2 × delta` (plafonnée) | Constitution (classe soigneur) |
| Bonus série | Les quotidiennes en série rapportent un petit bonus ; succès tous les 21 jours | — |
| Checklist | Chaque étape cochée augmente le `delta` de la tâche parente à sa validation | — |

- **PV max 50**. PV à 0 → **perte d'un niveau, de tout l'or et d'un objet d'équipement**. Monter de niveau **restaure les PV**.
- **XP pour le niveau suivant** `≈ round((0,25 L² + 10 L + 139,75) / 10) × 10` → 150 XP au niveau 1, ≈ 460 au niveau 21 (confirmé : la barre affichait `0 / 460`).
- **Mana** : max `30 + 2 × niveau` ; +10 par jour, +1 par tâche réussie ; dépensée dans les compétences de classe.
- **Classes** (débloquées au niveau 10) : guerrier (force → dégâts, crit), mage (intelligence → XP, mana), soigneur (constitution → encaisse), voleur (perception → or). Chaque classe a 4 compétences (coût 10-35 mana) : soin d'équipe, boost de tâche, etc. Le compte les affichait dans un bandeau « Compétences Guerrier » en bas d'écran.

### 2.5 Le « cron » (minuit)

À la première connexion d'un nouveau jour, Habitica :
1. Parcourt les quotidiennes **dues la veille** et non cochées : PV −, `v` −, série remise à 0.
2. Décoche toutes les quotidiennes.
3. Baisse légèrement `v` des à-faire.
4. Remet les compteurs d'habitudes selon leur période.
5. Applique les dégâts de quête si le groupe rate ses quotidiennes.

Heure de bascule paramétrable (« début de journée personnalisé »), utile pour les couche-tard.

## 3. gamiTask aujourd'hui

| Point | État |
|---|---|
| Types | `type: 'task' \| 'daily'` sur une seule table. Case « chaque jour » à la création |
| Champs | Texte (120 car.), catégorie (Boulot / Perso / Urgent / Étude), fait/pas fait |
| Gains | **+10 pièces fixes** par validation, quel que soit le type. +XP seulement via la lampe (+5). Décocher rend 10 pièces |
| XP / niveau | XP surtout par pomodoro (+50). `level = floor(sqrt(xp / 50))` |
| Punition | Quotidiennes non faites à minuit → jauge `degradation` 0-5 (immunité < niveau 5) et le boss de guilde regagne 5 PV par raté. **La jauge n'est affichée nulle part côté client** (`degradation:update` reçu mais non rendu) |
| Boss de guilde | −15 PV par tâche (dans `task:toggle`), −10 par pomodoro. Récompense collective à la mort |
| Récompenses | Boutique : chapeaux, mobilier, décor ; sets de mobilier qui donnent des bonus passifs (XP pomo, pièces tâche) ; atelier d'objets pour les modos |
| Succès | 8 achievements (tâches, pomodoros, pièces) |
| Visuel | Ardoises de tâches dans la pièce 3D, badge « chaque jour », survol qui résume la tâche |

Ce qui manque le plus par rapport à Habitica : **pas de boucle de feedback**. Toutes les tâches valent pareil, rien ne rougit, rien ne fait mal, et l'échec (dégradation) est invisible.

## 4. Comparatif et verdict

Légende : ✅ reprendre · 🔧 adapter · ⏭ plus tard · ❌ écarter

| Mécanique Habitica | Verdict | Pourquoi, et la sauce gamiTask |
|---|---|---|
| 3 types Habitude / Quotidienne / À faire | ✅ | C'est le cœur de la demande. Trois onglets ou trois colonnes dans le panneau, une seule table `tasks` avec `kind` |
| 4e colonne Récompenses perso | ⏭ | La boutique joue déjà ce rôle avec du mobilier tangible dans la pièce ; une récompense texte « une bière » est moins gamiTask. À revoir si les joueurs le demandent |
| Difficulté à 4 niveaux | ✅ | Multiplicateur identique (0,1 / 1 / 1,5 / 2). Remplace les gains fixes. Se choisit à la création, modifiable ensuite |
| Valeur cachée + couleur | ✅ | La couleur remplace avantageusement la jauge de dégradation invisible. Dans la DA gamiTask : teinte de l'ardoise (craie fraîche → craie effacée / rouille) plutôt que bleu → rouge |
| PV | ✅ | Barre de vie dans le HUD, PV max 50, restaurés au level-up. Remplace `degradation`. À 0 PV : version douce (voir §5.4), pas la perte d'un objet |
| XP et or modulés par `delta` | ✅ | Formules §5.3. Les bonus de mobilier existants restent des bonus additifs par-dessus |
| Série (streak) des quotidiennes | ✅ | Compteur sur la carte, remis à 0 quand ratée. Achievement « 21 jours ». Le streak pomodoro existant reste séparé |
| Planification : jours de la semaine | ✅ | 7 cases lu-di. Pas de « tous les N », pas de mensuel/annuel : le cron reste simple (`dueToday = days.includes(weekday)`) |
| Répétition hebdo/mensuelle/annuelle, date de début | ❌ | Coût UI et logique élevé pour peu d'usage. Pas dans la première version |
| Checklist sur les à-faire | ✅ | C'est ce qui fait qu'un « projet » tient dans la colonne À faire. Bonus de `delta` par étape cochée |
| Checklist sur les quotidiennes | ⏭ | Utile mais double le travail de UI ; on commence par les à-faire |
| Compteurs +/− et remise à zéro des habitudes | 🔧 | Compteurs oui (ils donnent le sens de progression), remise à zéro **quotidienne seulement** au cron. Hebdo/mensuel = ❌ |
| Habitude négative → perte de PV | ✅ | Sinon le « − » n'a aucun sens |
| À-faire qui rougit avec le temps | ✅ | −1 de valeur par jour au cron, plafond. Sans date butoir obligatoire |
| Date butoir des à-faire | 🔧 | Optionnelle, affichage seulement (badge « pour vendredi »). Pas de punition au dépassement en v1 |
| Étiquettes libres | ❌ | On garde les 4 catégories, cohérentes avec la DA. Filtre par catégorie dans le panneau |
| Notes markdown | 🔧 | Une ligne de note texte brut, optionnelle. Pas de markdown |
| Filtres par colonne | 🔧 | Quotidiennes : « restantes » / « toutes ». À faire : « actives » / « accomplies ». Habitudes : pas de filtre |
| Cron à minuit local | 🔧 | Le `checkAndApplyDailyReset` existant fait déjà la bascule par jour ; on le généralise (voir §5.5). Heure de bascule personnalisable ⏭ |
| Boss de quête d'équipe | ✅ déjà là | Le boss de guilde existant est l'équivalent. Les dégâts passent de 15 fixes à `≈ 5 × delta` ; les quotidiennes ratées continuent de le soigner |
| Mana + classes + compétences | ⏭ | Évaluation en §6 |
| Gemmes (monnaie premium) | ❌ | Hors sujet, gamiTask a Pro « bientôt » sur la landing |

## 5. Proposition « à la sauce gamiTask »

### 5.1 Modèle de données

Une seule table `tasks`, migration additive (les `type = 'task'` deviennent `kind = 'todo'`, les `daily` restent `daily`) :

```
tasks
  id, userId, text, note, category, createdAt
  kind        'habit' | 'daily' | 'todo'
  difficulty  'trivial' | 'easy' | 'medium' | 'hard'
  value       REAL, 0 à la création, borné [-25, +25]
  -- habit
  up, down    booléens (au moins un)
  countUp, countDown  compteurs du jour
  -- daily
  days        bitmask lu-di (127 = tous les jours)
  streak      INTEGER
  doneToday   booléen (remplace `done` pour les dailies)
  -- todo
  done, completedAt
  dueAt       optionnel
  checklist   JSON [{text, done}]

users
  hp          INTEGER, 50 par défaut, max 50
  (degradation : conservée en base, plus lue ; supprimée plus tard)
```

### 5.2 Le `delta`

```
priority = {trivial: 0.1, easy: 1, medium: 1.5, hard: 2}[difficulty]
delta    = 0.9747 ** value * priority          // Habitica tel quel
// à-faire avec checklist : delta *= 1 + doneItems / (2 * totalItems)  (jusqu'à ×1,5)
```

Après une réussite : `value += delta` (borné). Après un échec (« − » ou quotidienne ratée) : `value -= delta`.

### 5.3 Gains, en chiffres gamiTask

Les nombres actuels (10 pièces par tâche, 25 par pomodoro, 50 XP par pomodoro, niveau = √(xp/50)) restent la référence pour ne pas dévaluer l'économie de la boutique.

| Action | Pièces | XP | Boss | PV |
|---|---|---|---|---|
| Réussite (habitude +, quotidienne, à-faire) | `round(10 × delta)` | `round(15 × delta)` | `round(5 × delta)` dégâts | — |
| Habitude « − » | — | — | — | `−round(3 × delta)` |
| Quotidienne due ratée (cron) | — | — | boss `+5` (existant) | `−round(3 × delta)` |
| Pomodoro (inchangé) | 25 + bonus | 50 | 10 dégâts | — |
| Level-up | — | — | — | PV = 50 |

Ordre de grandeur : une tâche facile neuve = 10 pièces / 15 XP (comme aujourd'hui pour les pièces). Une tâche difficile négligée depuis 10 jours (`value ≈ −10`) = `delta ≈ 2,6` → 26 pièces, 39 XP, 13 dégâts, et 8 PV de perte si on la rate encore. Une tâche facile tenue 20 jours (`value ≈ 15`) = `delta ≈ 0,68` → 7 pièces. C'est exactement la pente d'Habitica : ce qu'on tient devient une routine qui paie peu, ce qu'on fuit devient l'affaire du jour.

Décocher une tâche annule le gain (comme aujourd'hui) et rend le `value`.

### 5.4 PV et « mort »

- Barre de PV dans le HUD à côté de la barre d'XP, 50 max.
- Immunité débutant : pas de perte de PV avant le niveau 3 (l'existant met 5 pour la dégradation ; 5 niveaux = 1250 XP = 25 pomodoros, c'est long — à discuter).
- **0 PV, version douce** : PV remis à 50, **−30 % des pièces**, le personnage arrive « fatigué » dans la pièce (animation d'assis, teinte grise) pendant la journée. Pas de perte de niveau ni d'objet : chez Habitica c'est le premier motif d'abandon cité par les joueurs, et gamiTask vend une ambiance café, pas un rogue-like.
- La dégradation 0-5 disparaît. Si un effet visuel de pièce qui se dégrade existe dans les cartons, il se branche sur `hp / 50`.

### 5.5 Le cron gamiTask

Généralisation de `checkAndApplyDailyReset`, toujours déclenché à la première connexion du jour (pas de tâche planifiée serveur) :

1. Pour chaque `daily` due la veille (`days` contient le jour d'hier) et non `doneToday` : `value -= delta`, `hp -= round(3 × delta)`, `streak = 0`, boss `+5`.
2. Toutes les `daily` : `doneToday = 0`.
3. Toutes les `habit` : `countUp = countDown = 0`.
4. Tous les `todo` non faits : `value -= 0.5` (elles rougissent lentement).
5. Émission d'un seul événement `day:rollover` avec le récap (PV perdus, quotidiennes ratées) → toast « Hier : 2 quotidiennes oubliées, −6 PV ».

Cas à traiter : plusieurs jours d'absence (répéter l'étape 1 par jour manqué, plafonner les PV perdus à 20 par cron pour ne pas tuer quelqu'un qui revient de vacances).

### 5.6 Le panneau de tâches

Trois onglets plutôt que trois colonnes : le panneau actuel est étroit (latéral, à côté de la pièce 3D), et trois colonnes façon Habitica ne tiennent pas.

```
┌ Tâches ─────────────────────────────── ✕ ┐
│ [Habitudes 3] [Quotidiennes 4] [À faire 2] │
│ ○ Boulot ○ Perso ○ Urgent ○ Étude  (filtre)│
│──────────────────────────────────────────│
│ + Ajouter une quotidienne…      [Facile ▾]│
│   lu ma me je ve sa di   (visible si onglet quotidiennes)
│──────────────────────────────────────────│
│ ☐ Duolingo            ●Étude  🔥 12   ▪▪ │  ← ardoise teintée par value
│ ☑ Lave-linge          ●Perso  🔥 1       │
│ ☐ Pompes 3×10  (pas aujourd'hui)  grisé  │
│──────────────────────────────────────────│
│ Restantes · Toutes                        │
└──────────────────────────────────────────┘
```

- **Habitudes** : `[+]` et `[−]` de part et d'autre du texte, compteurs du jour en petit. Un seul bouton si l'habitude n'est que positive ou que négative.
- **Quotidiennes** : case à cocher, série 🔥, jours en tout petit sous le texte, grisée si non due aujourd'hui (reste cochable, comme Habitica).
- **À faire** : case à cocher, chevron qui déplie la checklist, badge date si `dueAt`, `n/m` étapes.
- **Commun** : point de catégorie cliquable (existant), texte éditable en place (existant), pastille de difficulté (▪ à ▪▪▪▪) cliquable pour changer, croix de suppression.
- **Ajout** : champ texte + difficulté + (jours si quotidienne / ligne « + étape » si à-faire, dépliable). Pas de modale : gamiTask ajoute en une ligne, on garde ça.
- **Teinte de la carte** : 5 paliers de `value` → couleur de fond de la ligne, du vert-craie (bien tenue) à la rouille (négligée). Même échelle sur l'ardoise 3D dans la pièce (`scene.ts` a déjà une ardoise par tâche et un badge doré pour les dailies).
- **HUD** : barre PV ❤ au-dessus de la barre XP. Toast de gain enrichi : « +12 pièces · +18 XP · 6 dégâts au boss ».

### 5.7 Ce qui change dans l'existant

- `task:add / toggle / update / delete` → un `task:*` par kind, ou un seul `task:score {taskId, direction: 'up'|'down'}` à la Habitica (recommandé : un seul point d'entrée pour toutes les règles de gain).
- `tasks:state` envoie `hp` avec `coins`.
- Achievements : `first-task`, `task-10`, `task-50` restent ; ajouter `streak-21` (quotidienne 21 jours), `habit-100` (100 « + »), `survivor` (revenir à 50 PV après être passé sous 10).
- Bonus mobilier (`coinsTask`, lampe) : deviennent des additifs après le calcul `delta`, inchangés sinon.
- Les tâches importées de la landing (`gamitask.landing.handoff`) deviennent des `todo` faciles.

## 6. Mana, classes, compétences : évaluation

Ce que ça apporte chez Habitica : un choix d'identité au niveau 10, une ressource (mana) qui récompense la régularité, et des actions **collectives** (soigner l'équipe, protéger des dégâts) qui font vivre le groupe.

Ce que ça coûterait à gamiTask : quatre arbres de compétences, une stat par classe, un équilibrage, et une UI de sorts. C'est un sous-projet à part entière.

Ce qui a du sens à la sauce gamiTask, si on y va :

| Idée | Se branche sur | Effort |
|---|---|---|
| **Mana = « énergie »** : +1 par tâche, +10 par jour, max `30 + 2 × niveau` | HUD (3e barre) | Faible |
| **Pas de classes, des « rôles » de café** choisis au niveau 10 : Barista (pièces +), Bibliothécaire (XP +), Jardinier (encaisse mieux), Videur (dégâts boss +) | Bonus passifs déjà gérés comme les sets de mobilier (`getSetBonuses`) | Faible : c'est un multiplicateur de plus |
| **3 actions collectives payées en énergie**, communes à tous les rôles : « Tournée » (soigne 5 PV à toute la guilde), « Coup de main » (double le prochain gain d'un membre), « Dernier appel » (10 dégâts au boss) | Guilde existante, `guild:state` | Moyen : 3 événements serveur + 3 boutons |
| Sorts par classe façon Habitica | — | Élevé, et redondant avec la boutique/mobilier qui fait déjà office de build |

Recommandation : **ne pas le mettre dans l'itération tâches**. Livrer d'abord types + difficulté + valeur + PV, mesurer si les joueurs tiennent leurs quotidiennes, puis ajouter énergie + rôles + actions collectives comme une itération « guilde ». Les rôles sont surtout intéressants si la guilde vit.

## 7. Risques et points ouverts

- **Économie** : `delta` peut faire monter les pièces par tâche à ×2,6 pour une tâche difficile négligée. Les prix de la boutique (25-130 pièces) restent cohérents, mais à surveiller ; un plafond de `delta ≤ 3` est prudent.
- **Fuseau horaire** : le cron utilise l'heure du serveur (`setHours(0,0,0,0)`). Avec des joueurs hors France ça bascule à la mauvaise heure. Stocker un `timezoneOffset` client suffit pour la v1.
- **Migration** : les tâches `daily` existantes reçoivent `days = 127`, `difficulty = 'easy'`, `value = 0`. Les `task` deviennent `todo`. Aucune perte.
- **Plusieurs onglets ouverts** : `task:score` doit être idempotent par jour pour une quotidienne (déjà le cas de `toggle` grâce à `done`).
- **Ardoise 3D** : `scene.ts` crée un mesh par tâche ; avec des habitudes cochées 10 fois par jour ça ne change rien (une ardoise par tâche, pas par coche), mais la teinte doit être mise à jour sans recréer le mesh.
- **Question** : les habitudes ont-elles leur ardoise dans la pièce ? Proposition : oui, mais sans badge doré (réservé aux quotidiennes).

## 8. Découpage proposé

1. **Modèle + règles serveur** : migration, `kind`, `difficulty`, `value`, `hp`, `task:score`, cron généralisé. Tests unitaires sur `delta` et le cron (jours manqués, immunité, plafond).
2. **Panneau** : onglets, formulaire d'ajout par kind, habitudes +/−, jours, checklist, teintes.
3. **HUD et retours** : barre PV, toast de gain détaillé, récap du matin, 0 PV « fatigué ».
4. **Pièce 3D** : teinte des ardoises, ardoises pour les habitudes.
5. **Plus tard** : récompenses perso, checklist sur quotidiennes, énergie + rôles + actions collectives, heure de bascule perso.

Chaque étape est livrable seule ; la 1 sans la 2 se teste au socket.
