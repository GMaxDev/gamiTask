# Éditeur de personnage : interface et premières options

**Date :** 2026-09-18 · **Branche :** `rework` · **Statut :** implémenté (branche rework)

## 1. Objectif

Donner au joueur un écran de personnalisation de son avatar, dans l'esprit des créateurs de personnages Nintendo (Tomodachi Life en premier, Miitopia, Monster Hunter Stories) : catégories en rail vertical, grille de vignettes, palette de couleurs, aperçu en direct, Undo / Exit / Done.

Cette itération livre **l'interface complète et un premier catalogue réel mais court**. L'apparence est persistée par le serveur et vue par les autres joueurs en direct (`localStorage` reste un cache). Les curseurs de position (yeux, nez…), les « Sets » de coiffure et les grades d'accès viendront ensuite.

Hors périmètre : protocole serveur, tenues détaillées (motifs, manches), curseurs de morphologie, vignettes animées, mobile.

## 2. Décisions produit (validées)

- **Emplacement** : écran plein qui **monte depuis le bas de la page**, par-dessus la pièce. Le café reste rendu derrière.
- **Aperçu** : la **caméra du café** plonge sur le personnage (spike validé). Le décor est **flouté, clair et doux, sans assombrissement** ; le personnage est **net** ; les autres joueurs continuent de bouger, flous, derrière.
- **Entrées** : le chip pseudo du HUD (renommé « Mon personnage ») et un **miroir** dans « Chez moi » (hotspot). Le dialogue pseudo / couleur de première visite reste ; la couleur choisie devient le t-shirt par défaut.
- **Contenu v1** : vraies options, peu nombreuses, appliquées en direct.
- **Catégories v1** : Visage & peau · Cheveux (Frange / Arrière + couleur) · Tenue & accessoires.
- **Style** : Nintendo assumé (gros onglets ronds, vignettes en grille, motif de fond, animations « pop ») dans la palette et la typo du café.
- **Validation** : aperçu live, Undo pas à pas, Exit annule tout, Done applique et sauvegarde.
- **Persistance** : le `Look` appartient au serveur (`look:update` à la validation, renvoyé par `cosmetics:state` et diffusé par `player-look`) ; `localStorage` n'en est plus qu'un cache d'affichage immédiat.

## 3. Modèle `Look` (`src/look.ts`, pur, testé)

```ts
export interface Look {
  skin: string;          // id catalogue
  head: 'round' | 'oval' | 'square';
  bangs: string;         // id, 'none' autorisé
  back: string;          // id, 'none' autorisé
  hairColor: string;     // id catalogue
  shirt: number;         // hex, palette t-shirt (PALETTE d'identity.ts)
  trousers: string;      // id catalogue
  headphones: boolean;
  hat: string | null;    // id boutique, doit être possédé
}
```

Catalogue (constantes exportées, chaque entrée `{id, label, …}`) :

| Catégorie | Entrées v1 |
|---|---|
| `SKINS` | 6 teintes (porcelaine → ébène) |
| `HEADS` | round / oval / square (scale du crâne) |
| `BANGS` | none, droite, rideau, mèche de côté, bouclée |
| `BACKS` | none, court, carré, queue de cheval, nattes |
| `HAIR_COLORS` | 8 (noir, brun, châtain, roux, blond, cendré, blanc, sauge) |
| `TROUSERS` | 4 couleurs (crème, sable, olive, ardoise) |
| t-shirt | `PALETTE` d'`identity.ts` (8) |
| chapeau | `HATS` de `shop.ts`, filtré sur `shop.hats` (possédés) + « aucun » |

Fonctions :
- `defaultLook(shirt: number): Look` — peau 2, tête round, frange droite, arrière court, brun, headphones on, hat null.
- `loadLook(saved: unknown, shirt: number, ownedHats: string[]): Look` — validation champ par champ, repli sur le défaut, chapeau non possédé → null.
- `withChange(look, patch): Look` — copie immuable.
- `createHistory(initial)` — `{ current, push(look), undo(): Look | null, canUndo, reset(): Look }` ; pile bornée à 50.
- `equalLook(a, b)`.

## 4. Module avatar (`src/avatar.ts` + `src/primitives.ts`)

- `primitives.ts` : `createPrimitives(root, materials)` expose `box / ball / cyl / mesh / mat / group`, extraits tels quels de la closure de `createCafe` (même signatures, même cache de matériaux par couleur). `scene.ts` les consomme via cette fabrique : **aucun changement de rendu**.
- `avatar.ts` : `buildAvatar(look: Look, p: Primitives, opts: {x, z, apron?, shirtOverride?}) → Rig` avec `Rig = {g, body, head, legL, legR, armL, armR, phase, look}`. Reprend `person()` et y ajoute :
  - peau → matériau de la tête et des mains ; tête → scale (round 1/1.1/.91, oval .94/1.18/.9, square 1.06/1.02/.96 avec `RoundedBox` léger) ;
  - frange / arrière → petites géométries dédiées par id (boules, capsules, boîtes arrondies) sur le pivot `head`, couleur `hairColor` ;
  - `headphones` → le casque actuel devient optionnel ;
  - `trousers` → couleur des jambes ;
  - `hat` → `buildHat` (déplacé dans `avatar.ts`, même rendu).
  - `applyLook(rig, look)` reconstruit la tête (crâne, cheveux, chapeau) et recolore corps / jambes **en place**, sans recréer `g` : le walker garde ses références.
- Le barista et les avatars distants passent par `buildAvatar` avec un `Look` dérivé (couleur de t-shirt = `color` du joueur, reste par défaut). Rendu inchangé pour eux.
- Distance : les cheveux sont conçus pour être lisibles au zoom éditeur (~8,5) : arêtes arrondies, pas de boule isolée flottante.

## 5. Scène : mode édition (`scene.ts`)

API ajoutée à l'objet retourné par `createCafe` :

- `setLook(look)` : `applyLook` sur le joueur.
- `enterEditor(): Promise<void>` / `exitEditor(): Promise<void>` :
  - sauvegarde `{zoom, follow, pan, camTarget}` ; le joueur se lève s'il est assis (`standUp`), sa route est annulée ;
  - ressort 600 ms ease-out sur `camera.zoom` (cible calculée pour ~3 m visibles en hauteur, `setZoom` n'est pas borné en mode édition) et sur `camTarget`, décalé pour placer le personnage dans le **tiers gauche** ;
  - le personnage se tourne vers la caméra ; un drag horizontal le fait pivoter ; `resetView()` remet l'angle ;
  - masqués pendant l'édition : flèche de curseur, anneau au sol, marqueur de destination, étiquette du joueur ;
  - clic sol / siège / ardoise / molette / flèches neutralisés (état exclusif `mode: 'walk' | 'place' | 'edit'`, remplace les `if` épars du prototype) ;
  - un `SpotLight` « studio » doux s'allume au-dessus du personnage, s'éteint à la sortie.
- **Flou de fond** : pendant l'édition, la scène est rendue dans un `WebGLRenderTarget` à 0,5× (0,4× si `devicePixelRatio > 1.5`), floutée par deux passes gaussiennes séparables (horizontale puis verticale, rayon ≈ 6 px à demi-résolution), **sans désaturation ni assombrissement**, dessinée plein écran, puis le personnage (couche caméra dédiée) est rendu net par-dessus. Render target et shaders sont **préchauffés au montage** de la pièce (pas de hoquet à l'ouverture). `resize()` redimensionne le render target. `dispose()` libère tout.
- `prefers-reduced-motion` : ressort remplacé par une coupe directe.
- Pendant l'édition la position continue d'être émise (le joueur reste immobile pour les autres). Pas d'état serveur.

## 6. Écran d'édition (`src/editor.ts` + `style.css`)

Structure DOM (créée une fois par `createEditor(container, deps)`, `deps = { onPreview(look), onDone(look, name), onExit(), resetView() }`) :

```
#editor (fixe, plein écran, pointer-events none sauf sur le panneau)
├─ .editor-top-left   : Tourner (glisser) · Vue par défaut · Annuler (Undo)
├─ .editor-top-right  : Quitter · Valider
└─ .editor-sheet (55 vw à droite, pleine hauteur, monte du bas)
   ├─ .rail   : 3 gros boutons ronds (Visage, Cheveux, Tenue), icône dessinée, actif = pastille terracotta
   ├─ .subtabs: pour Cheveux → Frange | Arrière ; pour Tenue → Haut | Bas | Accessoires ; pour Visage → Peau | Tête
   ├─ .grid   : vignettes 5 colonnes, carrées, coins très arrondis, sélection = fond terracotta + léger scale, hover = pop
   ├─ .palette: colonne de pastilles (couleur de cheveux / t-shirt / pantalon selon l'onglet), active entourée
   └─ .name   : champ pseudo (mêmes règles que `cleanName`)
```

Comportement :
- Ouverture : le HUD (`.hud-top`, `.view-controls`, `.world-bottom`, `.timer-hud`, `.open-tasks`, `.movement-hint`) s'estompe, le panneau monte (`translateY(100%) → 0`, 500 ms, `cubic-bezier(.2,.9,.25,1.06)`), `enterEditor()` part en même temps. Fermeture symétrique.
- Chaque clic sur une vignette ou une pastille → `history.push(withChange(...))` → `onPreview(look)` (aperçu live, non sauvegardé).
- Undo → `history.undo()` → `onPreview`. Vue par défaut → `resetView()`.
- Quitter → `onExit()` : `onPreview(initial)` puis fermeture. Échap = Quitter.
- Valider → `onDone(look, name)` : sauvegarde `gamitask.look`, `identity.name/color` mis à jour (couleur = t-shirt, envoyée au prochain `join`), toast, fermeture.
- Vignettes : `renderThumb('head' | 'body', look)` rend le vrai modèle dans un mini-renderer offscreen (160 px, fond transparent, éclairage fixe), en **cache par clé (kind + champs pertinents)** ; la grille d'une catégorie affiche la variante appliquée au look courant (une coiffure se voit avec ta couleur de cheveux). Chapeaux : vignette tête + chapeau. Les vignettes sont rendues par `editor.ts` lui-même (mini-renderer Three.js offscreen, cache par variante).
- Fond du panneau : crème `#f6efe0` avec motif répété très discret (tasse, feuille, grain de café) en SVG inline, opacité 6 %.
- Clavier : flèches dans la grille, Entrée sélectionne, Tab logique, focus visible.

## 7. Intégration (`main.ts`)

- `look = loadLook(load('gamitask.look'), identity.color, shop.hats)` au démarrage ; `mountRoom()` passe `look` à `createCafe` (le paramètre `hat` disparaît, il est dans `look`) ; `cosmetics:state` continue d'appliquer le chapeau serveur (`look.hat` mis à jour et sauvé).
- Entrées : `#identity-chip` → `openEditor()` ; hotspot `'mirror'` de la scène (miroir mural dans « Chez moi », près du bureau) → `openEditor()`.
- Un seul état `editing` ; le changement de pièce, le placement de meubles et le drawer sont bloqués pendant l'édition.
- Chapeaux possédés : la grille Accessoires lit `shop.hats` ; un chapeau non possédé n'apparaît pas (la boutique reste le lieu d'achat).
- `session:replaced` / perte de connexion pendant l'édition : le voile réseau passe au-dessus de l'éditeur, l'état de l'éditeur est conservé.

## 8. Tests

- Node : `look.ts` (défauts, validation avec valeurs corrompues, chapeau non possédé, `withChange`, historique borné, undo/reset).
- Node : `avatar.ts` n'est pas testable sans WebGL ; `primitives.ts` extraction vérifiée par `typecheck` + rendu identique (capture avant / après du café).
- Manuel (Chrome) : ouverture depuis le chip et le miroir, ressort caméra, flou clair sans assombrissement, personnage net, joueur distant qui bouge derrière, chaque catégorie modifie bien l'aperçu, Undo, Quitter restaure, Valider persiste après rechargement, Échap, reduced-motion, redimensionnement de fenêtre en édition, ms/frame ≤ baseline + 3 ms au café.

## 9. Suite (hors itération)

Éditeur à la première visite · accès (grades) si certaines options deviennent payantes. (Livrés depuis : sets de coiffure, curseurs yeux / sourcils / nez / bouche, tenues avec motifs, gabarits de corps, « Au hasard ».)
