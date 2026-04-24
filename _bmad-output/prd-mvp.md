# GamiTask — Product Requirements Document (MVP)

**Version :** 1.1
**Date initiale :** 2026-03-27
**Dernière mise à jour :** 2026-04-24
**Auteur :** Maxime
**Statut :** MVP livré — itération Phase 2 en cours

---

## 0. État d'Avancement (2026-04-24)

Le MVP initial (F1–F7) est **livré et fonctionnel**. Le projet est en phase 2, avec plusieurs features initialement hors-scope déjà en production.

### ✅ MVP livré

- F1 Room isométrique publique — moteur custom (PixiJS non retenu, rendu sur canvas via `IsoEngine`)
- F2 Avatar + déplacement au clic — pathfinding A\* sur grille de tiles
- F3 Timer Pomodoro collectif + `/pomo` — timer autoritaire côté serveur, auto-chaînage des phases
- F4 Chat en room — temps réel, rate limiting
- F5 Statuts visuels — bulles focus/pause/libre
- F6 Accès guest — entrée immédiate sans compte
- F7 Inscription — email/password + Google OAuth, préservation du pseudo

### 🚀 Livré au-delà du MVP (Phase 2+)

- **Système de tâches** — TaskPanel, dailies avec reset quotidien, dégradation
- **Économie** — pièces (`coins`), leaderboard temps réel
- **Shop + cosmétiques** — items, chapeaux équipables
- **Guildes** — GuildPanel, état partagé
- **Audio / Ambiance** — SoundEngine, AmbiancePanel, AudioPanel
- **Vidéo YouTube partagée** — un utilisateur contrôle, les autres suivent en sync (latecomer resync)
- **Tâches publiques** — les tâches en cours de chaque joueur sont visibles par les autres
- **Meubles déplaçables** — placement/positions persistés par utilisateur
- **Minimap, Onboarding, Feedback modal, Profil**
- **Déploiement prod** — Dockerfile.nginx, docker-compose.prod.yml

### 🔜 Pistes en cours / à arbitrer

- Scaling multi-room (aujourd'hui : une room publique unique)
- Audio thématique et notifications sonores
- Mobile (disclaimer "desktop recommandé" toujours valable)

---

## 1. Vision Produit

GamiTask est une application web de coworking en ligne gamifiée. Les utilisateurs incarnent un avatar dans un espace isométrique partagé — inspiré d'Habbo Hotel — et y effectuent des sessions de travail Pomodoro visibles par tous, dans une logique de présence sociale légère.

**Phrase de positionnement :**

> GamiTask, c'est Habbo Hotel pour travailler — un espace où ta productivité est visible, sociale et récompensée.

---

## 2. Problème Résolu

Le travail à distance et solo manque de présence sociale et de motivation extrinsèque. Les outils de productivité existants (Notion, Todoist, Habitica) n'offrent pas de sentiment d'être "quelque part" avec des gens. GamiTask crée un espace tiers virtuel — ni le bureau, ni la maison — où l'on ressent la présence des autres sans subir leurs interruptions.

---

## 3. Utilisateur Cible (MVP)

- Travailleur indépendant / étudiant / remote worker
- Utilise déjà la technique Pomodoro ou y est sensibilisé
- Apprécie les environnements gamifiés et l'esthétique rétro/pixel
- Veut se sentir moins seul en travaillant, sans rejoindre un appel vidéo

---

## 4. Périmètre du MVP

### ✅ Dans le MVP

| #   | Fonctionnalité            | Description                                                                                   |
| --- | ------------------------- | --------------------------------------------------------------------------------------------- |
| F1  | Room isométrique publique | Un espace partagé en vue isométrique, accessible à tous                                       |
| F2  | Avatar + déplacement      | Personnage représentant l'utilisateur, déplacement au clic ou via commandes                   |
| F3  | Timer Pomodoro partagé    | `/pomo` pour rejoindre le Pomodoro en cours ou lancer le sien ; timer visible par tous        |
| F4  | Chat en room              | Messagerie textuelle en temps réel dans la room                                               |
| F5  | Statuts visuels           | Bulles d'état sur l'avatar (focus, pause, libre) ; effet d'estompage des autres en mode focus |
| F6  | Accès guest               | Entrée immédiate sans inscription via bouton "Entrer dans une room"                           |
| F7  | Inscription / compte      | Création de compte optionnelle pour sauvegarder sa session                                    |

### ❌ Hors périmètre MVP (Phase 2+)

- XP, niveaux, pièces, cosmétiques
- Room personnelle privée
- Daily tasks et système de dégradation
- Guildes et boss collectif
- Audio thématique
- Mobile

---

## 5. User Stories

### Accès & Onboarding

**US-01** — En tant que visiteur, je peux cliquer sur "Entrer dans une room" depuis la page d'accueil et me retrouver immédiatement dans une room isométrique avec un avatar temporaire, sans créer de compte.

**US-02** — En tant que visiteur en session guest, je vois une invitation discrète à créer un compte pour ne pas perdre ma progression.

**US-03** — En tant que nouvel utilisateur inscrit, je choisis un pseudo et une apparence d'avatar de base avant d'entrer dans ma première room.

### Espace & Navigation

**US-04** — En tant qu'utilisateur, je vois la room en vue isométrique avec les avatars des autres utilisateurs présents.

**US-05** — En tant qu'utilisateur, je peux déplacer mon avatar en cliquant sur un emplacement de la room — mon personnage se déplace automatiquement jusqu'à la destination.

**US-06** — En tant qu'utilisateur, je vois le pseudo et l'état (focus / pause / libre) des autres avatars dans la room.

### Pomodoro

**US-07** — En tant qu'utilisateur, je tape `/pomo` dans le chat pour rejoindre le Pomodoro collectif en cours, ou en lancer un nouveau si aucun n'est actif.

**US-08** — En tant qu'utilisateur, je peux lancer un Pomodoro personnel indépendant du Pomodoro collectif.

**US-09** — En tant qu'utilisateur, je vois le timer Pomodoro affiché dans la room, visible par tous les participants.

**US-10** — En tant qu'utilisateur en mode Pomodoro, mon avatar affiche une animation d'écriture et une bulle de statut "focus" avec une couleur distincte.

**US-11** — En tant qu'utilisateur en pause Pomodoro, mon avatar se lève de sa chaise et la bulle de statut change de couleur.

### Statuts Visuels

**US-12** — En tant qu'utilisateur en mode focus, les avatars des autres utilisateurs s'estompent visuellement pour réduire les distractions tout en maintenant le sentiment de présence.

**US-13** — En tant qu'utilisateur, je peux passer en mode "libre" (hors Pomodoro) — mon avatar est visible normalement et je peux discuter librement.

### Chat

**US-14** — En tant qu'utilisateur, je peux envoyer des messages texte dans le chat de la room, visibles par tous les présents.

**US-15** — En tant qu'utilisateur en mode focus, les messages entrants restent accessibles dans le chat mais ne génèrent pas de notification visuelle intrusive.

---

## 6. Spécifications Fonctionnelles

### 6.1 Room Isométrique

- Vue isométrique 2.5D rendue dans le navigateur
- Room de taille fixe (définie en tiles isométriques)
- Meubles et éléments de décor statiques (non interactifs au MVP)
- Places assises limitées pour le Pomodoro collectif (ex : 8 chaises de bureau)
- Capacité maximale de la room : à définir (suggestion : 20 utilisateurs simultanés)

### 6.2 Avatar

- Apparence de base : plusieurs options de couleur/style à la création
- Animation idle (statique), walking (déplacement), typing (Pomodoro focus), sitting up (pause)
- Pseudo affiché au-dessus de l'avatar
- Bulle de statut avec icône + couleur :
  - 🟢 Libre
  - 🔴 Focus (Pomodoro actif)
  - 🟡 Pause
- En mode focus de l'utilisateur courant : autres avatars à 40% d'opacité

### 6.3 Système Pomodoro

- Durée par défaut : 25 min travail / 5 min pause (modifiable dans les paramètres)
- Un seul Pomodoro collectif actif par room à la fois
- Commande `/pomo` pour rejoindre/lancer
- Timer affiché dans l'interface (pas uniquement dans la room isométrique — aussi dans un coin de l'UI)
- Notification visuelle légère à la fin d'un cycle (pas de son au MVP)

### 6.4 Chat

- Chat persistant sur la durée de la session (non sauvegardé côté serveur dans le MVP)
- Messages avec pseudo + horodatage
- Commandes disponibles : `/pomo`
- Filtre anti-spam basique (rate limiting côté serveur)

### 6.5 Accès Guest

- Génération d'un pseudo temporaire aléatoire (ex : "Pixel#4821")
- Avatar de base assigné aléatoirement
- Session non sauvegardée — données perdues à la fermeture
- Bannière persistante "Créer un compte pour sauvegarder"

---

## 7. Spécifications Techniques (Orientations)

### Stack suggérée

| Couche            | Technologie retenue        | Note                                              |
| ----------------- | -------------------------- | ------------------------------------------------- |
| Frontend          | React + TypeScript + Vite  | Composants réactifs, typage fort                  |
| Rendu isométrique | Moteur custom sur canvas   | `IsoEngine` maison (PixiJS/Phaser non retenus)    |
| Temps réel        | Socket.IO (WebSocket)      | Synchronisation positions, chat, timer, vidéo     |
| Backend           | Node.js + Express          | Léger, JS full-stack cohérent                     |
| Base de données   | SQLite (better-sqlite3)    | Simplicité de déploiement, suffisant au stade MVP |
| Auth              | Email/password + Google OAuth | Compte classique ou Google                     |
| Déploiement       | Docker + nginx             | `Dockerfile.nginx`, `docker-compose.prod.yml`     |

### Contraintes techniques clés

- Synchronisation temps réel des positions d'avatar (< 100ms de latence cible)
- Timer Pomodoro autoritaire côté serveur (éviter la désynchronisation)
- Pathfinding isométrique simple pour le déplacement au clic (A\* basique sur grille de tiles)

---

## 8. Critères d'Acceptation du MVP

Le MVP est considéré validé quand :

1. Un utilisateur peut entrer dans une room sans compte en moins de 3 secondes
2. Un utilisateur peut lancer ou rejoindre un Pomodoro via `/pomo`
3. Le timer est synchronisé pour tous les utilisateurs dans la room (±1s)
4. Les statuts d'avatar (focus/pause/libre) sont visibles en temps réel par tous
5. Le chat fonctionne en temps réel dans la room
6. L'application supporte au minimum 20 utilisateurs simultanés dans une room sans dégradation notable

---

## 9. Métriques de Succès (Post-lancement MVP)

| Métrique                           | Cible à 30 jours                    |
| ---------------------------------- | ----------------------------------- |
| Durée moyenne de session           | > 25 min (= 1 Pomodoro complet)     |
| Taux de retour J+1                 | > 20%                               |
| Taux de conversion guest → compte  | > 15%                               |
| NPS informel (feedback qualitatif) | Mentions du sentiment de "présence" |

---

## 10. Hors Scope & Risques

### Hors scope confirmé (MVP)

- Système de récompenses (XP, pièces, cosmétiques)
- Rooms privées
- Gestion de tâches (Daily, Grimoire)
- Guildes
- Mobile
- Audio

### Risques identifiés

| Risque                                           | Probabilité | Impact                    | Mitigation                                                                    |
| ------------------------------------------------ | ----------- | ------------------------- | ----------------------------------------------------------------------------- |
| Faible rétention (room vide = expérience creuse) | Élevée      | Élevé                     | Seeding manuel au lancement, rooms toujours "peuplées" avec bots si < 3 users |
| Complexité du pathfinding isométrique            | Moyenne     | Moyen                     | Prototyper tôt, simplifier si nécessaire (déplacement direct sans animation)  |
| Latence WebSocket inacceptable                   | Faible      | Élevé                     | Tester avec 20+ connexions dès le début                                       |
| Expérience mobile dégradée                       | Élevée      | Faible (MVP browser-only) | Disclaimer "desktop recommandé"                                               |

---

## 11. Prochaines Étapes

1. **Prototyper le rendu isométrique** — valider la faisabilité et le feeling visuel (PixiJS spike)
2. **Prototyper le WebSocket** — synchronisation positions + timer entre 2 clients
3. **Wireframes UI** — layout global (room + chat + timer + boutons)
4. **Définir le tileset** — chercher/créer l'asset pack isométrique de base
5. **Setup du projet** — monorepo front/back, CI/CD minimal
