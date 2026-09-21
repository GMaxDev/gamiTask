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
| app | `VITE_API_URL` | `http://localhost:3001` | URL du serveur. **En production, obligatoire et non vide** : la valeur est figée dans le bundle au build (`docker compose build`). |
| server | `PORT` | `3001` | Port HTTP / socket |
| server | `CORS_ORIGIN` | `http://localhost:5173,http://127.0.0.1:5173` | Origines autorisées (séparées par des virgules). **En production, doit lister l'origine publique du front** (ex. `https://gamitask.gmaxdev.com`), sinon la connexion socket est refusée. |
| server | `ALLOW_GUEST_PRIVATE_ROOMS` | `true` | Rooms privées pour les invités (à passer à `false` avec l'auth) |
| server | `GOOGLE_CLIENT_ID` | — | Client OAuth Google ; sans lui, `/auth/google` refuse et l'app reste en mode invité. |
| server | `ADMIN_EMAIL` | — | Le compte Google qui porte cette adresse obtient `role = 'admin'` à la connexion. |
| server | `JWT_SECRET` | `gamitask_dev_secret` | Signe les jetons de session (30 jours). À changer en production. |
| app | `VITE_GOOGLE_CLIENT_ID` | — | Le même client id, pour le bouton « Continuer avec Google ». Fichier `app/.env.local` en local. |

Les fichiers `.env` et `.env.local` sont ignorés par git.

## Tests

```bash
cd app && npm test && npm run typecheck
cd server && npm test && npx tsc --noEmit
```

## Pièces

- **Le café Petit Jour** (salle `ocean`) : la salle publique d’origine, comptoir et ardoises de tâches.
- **Le café-jardin** (salle `forest`) : la seconde salle publique, verrière, plantes suspendues et bar à plantes.
- **Chez moi** : ta pièce privée, meublée avec la boutique. Les boutons du HUD affichent le nombre d’autres personnes présentes dans chaque salle publique.

## Personnage

L'éditeur v2 règle le visage au détail (yeux, sourcils, nez, bouche, avec curseurs de hauteur, d'écartement et de taille), propose des sets de coiffure, des tenues (motif, manches, bas, chaussures), trois gabarits de corps et un bouton « Au hasard ». L'éditeur s'ouvre depuis le chip « Mon personnage » de la barre du haut ou en cliquant sur le miroir dans « Chez moi ». Le look choisi est envoyé au serveur à la validation (`look:update`), qui le range en base et le diffuse aux autres joueurs (`player-look`) : ils voient le nouveau visage, la coiffure et la tenue immédiatement, et le retrouvent à leur prochaine arrivée dans la salle. Le serveur le renvoie à la connexion (`cosmetics:state`), donc `localStorage` (clé `gamitask.look`) n'est qu'un cache pour afficher le bon personnage avant la réponse. Le chapeau porté reste piloté par la boutique (`cosmetic:equip`).

## Comptes et rôles

Sans connexion, tu es un invité : un identifiant local (`gamitask.identity` dans `localStorage`) envoyé tel quel au serveur. « Continuer avec Google » (dans « On se présente ? » ou le chip « Connexion ») échange le jeton Google contre un jeton de session ; `join` le transmet et le serveur en déduit qui tu es. Un compte Google ne peut plus être rejoint sans jeton valide (`auth:invalid` → retour en invité), donc l'identifiant seul ne suffit pas à l'usurper.

Chaque utilisateur a un `role` : `user`, `moderator` ou `admin`. `ADMIN_EMAIL` promeut son compte en admin ; les modérateurs se nomment en SQL (`UPDATE users SET role = 'moderator' WHERE email = …`). Le serveur renvoie le rôle après le join (`me:state`) ; un badge l'affiche à côté du pseudo. Les vérifications de droits sont toujours faites côté serveur (`canEdit` dans `server/src/auth.ts`).

## Atelier d'objets

Les modérateurs et admins voient un chip « Atelier » dans la barre du haut. Il ouvre un éditeur plein écran pour créer des objets de boutique sans toucher au code, en assemblant des blocs simples : cube, cylindre, sphère, tore, et boîte creuse (un caisson ouvert sur le devant, à l'épaisseur de paroi réglable, pour donner une vraie profondeur à une étagère ou un placard).

- **Vue 3D** : mêmes lumières et tone mapping que le café, grille au sol à l'échelle d'une case, axes à l'origine (X rouge, Y vert, Z bleu = le devant). Glisser le fond fait tourner et incliner la caméra, la molette zoome. Glisser un bloc ou une ancre le déplace au sol (Maj : en hauteur), aimanté à 5 cm. Un chapeau s'aperçoit directement sur le vrai avatar.
- **Blocs** : ajouter, dupliquer, retirer, masquer (œil) ; l'inspecteur règle dimensions, position, rotation (curseur + nombre), couleur (sélecteur + palette du jeu), et propose Miroir X / Miroir Z (copie symétrique). Raccourcis : Suppr, Ctrl+D, flèches et PageUp/PageDown pour décaler de 5 cm (Maj : 1 cm), Ctrl+Z.
- **Creuser** : un bloc passé en « Creuse » retire sa forme de tous les blocs pleins placés avant lui dans la liste (soustraction booléenne, `three-bvh-csg`). Il s'affiche en fantôme rouge dans l'atelier et n'existe pas en jeu. La boîte creuse reste la solution la plus simple pour un caisson ouvert.
- **Métadonnées** : nom, emoji, prix, type (mobilier ou chapeau), empreinte en cases (mobilier).
- **Fonctions** : *Asseyable*, *Surface*, *Portable*, *Porté sur la tête*. Cocher une fonction crée une ancre placée dans la vue 3D (anneau + flèche d'orientation, dalle pour une surface) ; on peut en avoir plusieurs (deux assises sur un banc). Une ancre `seat` sur un meuble posé devient un vrai siège. `surface`, `portable` et `wearable` sont stockés pour le futur inventaire.
- **Enregistrer / Dupliquer / Supprimer** (suppression en deux clics). L'id est un slug du nom, unique et jamais celui d'un objet codé en dur.
- **Annuler** (bouton ou Ctrl+Z) revient sur la dernière modification. Quitter, changer d'objet ou en créer un nouveau avec des modifications non enregistrées demande d'abord : enregistrer, abandonner ou rester.

### Objets du jeu

La liste « Objets du jeu » de l'atelier reprend les chapeaux et meubles de la boutique ainsi que les pièces du décor des salles (chaise, banquette, tapis, tables, tasse, livre…). Ouvrir l'un d'eux capture la géométrie codée (`captureRecipe` lit cubes, cylindres, sphères et tores avec leurs transformations et couleurs) ; Enregistrer crée une **surcharge** en base sous le même id, et « Rétablir l'original » la supprime. Le code reste la référence tant qu'aucune surcharge n'existe (`piece()` dans `decor.ts`). Limites : seule la forme est surchargée — obstacles, sièges, lumières, vapeur, textures et métadonnées restent ceux du code ; une surcharge s'applique à toutes les instances, donc les variantes de couleur (chaises terracotta et sauge) deviennent une seule chaise. Une modification est diffusée aussitôt : chaque client reconstruit sa salle et redemande ses occupants (`room:refresh`).

Côté données : la table `items` garde la recette JSON, validée par `server/src/catalog.ts` (bornes, couleurs hex, 64 blocs max). Le serveur envoie `catalog:state` après le join et le rediffuse à tous après chaque `catalog:save` / `catalog:delete` — les objets apparaissent en boutique et se reconstruisent dans les pièces sans redéploiement. Côté client, `shop.ts` fusionne ces objets dans `HATS`/`FURNITURE` et `recipe.ts` (`buildRecipe`) en fait un `THREE.Group` avec les matériaux de la scène ; `buildPiece` et `buildHat` y retombent pour tout id inconnu. Les objets codés en dur (`decor.ts`) restent la source par défaut.
