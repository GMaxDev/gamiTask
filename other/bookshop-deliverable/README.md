# gamiTask · Café Bookshop — Design System

Direction artistique retenue : **Cozy Café · variante Bookshop**.
Famille **sans-serif**, ambiance librairie-café, terracotta dominante.

> « Tire un livre, prends une tasse, le timer attend. »

---

## Contenu du dossier

| Fichier | Usage |
|---|---|
| `bookshop.html` | Maquette complète, autonome — salle principale + écran d'accueil + boutique + fiche design system |
| `tokens.css` | Variables CSS prêtes à coller dans `App.css` (avec import Google Fonts intégré) |
| `README.md` | Ce document |

---

## Fondations

### Typographie

| Rôle | Famille | Poids | Notes |
|---|---|---|---|
| Display (titres, marque, panneaux) | **DM Sans** | 600 / 700 | Sans-serif chaleureuse, letter-spacing serré (-0.02em) |
| Body (texte courant, tâches, formulaires) | **Inter** | 400 / 500 / 600 | Lisibilité, taille de base 14px |
| Mono (timer, monnaie, XP) | **JetBrains Mono** | 500 / 600 | Chiffres tabulaires |

### Palette

| Token | Hex | Rôle |
|---|---|---|
| `--bg-app` | `#f1e3c8` | Fond application (wheat) |
| `--bg-panel` | `#fbf3df` | Panneaux (paper) |
| `--bg-panel-2` | `#f0e0c0` | Surfaces secondaires (aged paper) |
| `--bg-canvas` | `#e6d3ad` | Fond room iso |
| `--bg-deep` | `#3a2418` | Toasts, modales sombres (bark) |
| `--ink` | `#3a2418` | Texte principal |
| `--ink-2` | `#6a4a30` | Texte secondaire |
| `--accent` | `#b85530` | **Primaire** — terracotta |
| `--moss` | `#7a8e4a` | Succès, pauses, break |
| `--gold` | `#c89a3a` | Récompenses, XP, monnaie |
| `--berry` | `#a04050` | Danger, urgence, mails |

### Rayons & ombres

- `--radius-sm: 8px` — chips, cases à cocher
- `--radius: 14px` — boutons, inputs
- `--radius-lg: 20px` — panneaux principaux
- `--radius-xl: 28px` — modales, cartes hero
- Ombres en sépia (teinte chaude `rgba(74,47,27,…)`), jamais grises pures

---

## Migration depuis `App.css`

1. **Ajouter** l'import Google Fonts en tête du fichier (déjà inclus dans `tokens.css`).
2. **Remplacer** votre bloc `:root { … }` par le contenu de `tokens.css`.
3. Toutes les classes existantes (`#timer-panel`, `#task-panel`, `.badge`, `.cb`, etc.) reprennent automatiquement la nouvelle DA — aucun renommage nécessaire.
4. Côté `App.tsx`, mettre à jour la constante `PALETTE` (couleurs avatars) pour pointer sur `--av-1` … `--av-6`.
5. Côté rendu iso (Pixi/canvas, dans `net/types.ts` ou équivalent), remplacer les constantes `ROOM_META` par les variables `--room-*`.

### Bloc minimal à coller

```css
:root {
  --font-display: "DM Sans", system-ui, sans-serif;
  --bg-deep: #f1e3c8;          /* inversion vs ancienne version sombre */
  --bg-panel: #fbf3df;
  --bg-hover: rgba(184, 85, 48, 0.08);
  --accent: #b85530;
  --gold: #c89a3a;
  --green: #7a8e4a;
  --red: #a04050;
  --text: #3a2418;
  --blur: none;                /* pas de glassmorphism */
  --radius-lg: 20px;
}
```

---

## Composants couverts par la maquette

- **Top bar** : marque + timer Pomodoro (pulse) + onglets (Tâches / Chat / Boutique / Classement / Ambiance) + badges (or, streak, niveau)
- **Panneau Tâches** : sections (Quotidiennes, Projet), cases avec catégorie colorée et points XP, input d'ajout
- **Salle iso pixel-art** : fond café, étagères de livres au mur, avatars 4-directionnels avec bulle de statut (focus 🍅, pause ☕, chat 💬), tapis, plantes, vapeur de café
- **Profil joueur** : avatar + niveau + barre XP + stats (pomodoros, heures focus, streak max, tâches)
- **Classement hebdomadaire** : top 5, ligne « toi » mise en valeur
- **Chat de salon** : header avec dot online, messages utilisateurs + messages système, input
- **Toast de récompense** : pilule sombre flottante, ex. « +10 🪙 »
- **Coin pop** : animation de monnaie qui flotte
- **FAB** : bouton flottant « ✨ Pomodoro collectif »
- **Écran d'accueil (join)** : carte centrale, sélecteur de couleur d'avatar, CTA primaire
- **Boutique cosmétique** : grille 2 colonnes, items possédés marqués, prix en or

---

## Règles d'usage

### À faire

- Utiliser **terracotta** (`--accent`) pour les CTAs, le timer en focus, les barres de progression
- Utiliser **olive** (`--moss`) pour les actions terminées, les pauses, les indicateurs « online »
- Utiliser **honey** (`--gold`) **uniquement** pour les récompenses (monnaie, XP, badges or)
- Garder **3-4 niveaux d'élévation max** : panneau plat, panneau ombré, FAB/toast, modale
- Conserver le pixel-art **uniquement** pour la room iso (cohérence narrative)
- Texte minimum **13.5 px** dans l'UI ; **11 px** pour les méta/labels en MAJUSCULES + tracking 0.06em

### À éviter

- Pas de gradient sur les boutons, les badges ou les panneaux (gradients réservés à la barre de progression XP)
- Pas de glassmorphism / blur (`--blur: none`)
- Pas de serif — toute la typo est sans-serif (DM Sans + Inter)
- Pas d'emoji décoratif dans les titres (ils restent dans les badges et bulles d'avatar)
- Pas de couleur saturée hors palette — tout passe par les tokens

---

## Inspirations

Shakespeare and Company · librairies indépendantes scandinaves · illustrations The Letterheads · intérieurs Cereal Magazine côté livres · Stardew Valley intérieurs · ambiance Ghibli après-midi.
