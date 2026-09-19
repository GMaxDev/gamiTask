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

## Tests

```bash
cd app && npm test && npm run typecheck
```

## Pièces

- **Le café Petit Jour** (salle `ocean`) : la salle publique d’origine, comptoir et ardoises de tâches.
- **Le café-jardin** (salle `forest`) : la seconde salle publique, verrière, plantes suspendues et bar à plantes.
- **Chez moi** : ta pièce privée, meublée avec la boutique. Les boutons du HUD affichent le nombre d’autres personnes présentes dans chaque salle publique.

## Personnage

L'éditeur s'ouvre depuis le chip « Mon personnage » de la barre du haut ou en cliquant sur le miroir dans « Chez moi ». Le look choisi est envoyé au serveur à la validation (`look:update`), qui le range en base et le diffuse aux autres joueurs (`player-look`) : ils voient le nouveau visage, la coiffure et la tenue immédiatement, et le retrouvent à leur prochaine arrivée dans la salle. Le serveur le renvoie à la connexion (`cosmetics:state`), donc `localStorage` (clé `gamitask.look`) n'est qu'un cache pour afficher le bon personnage avant la réponse. Le chapeau porté reste piloté par la boutique (`cosmetic:equip`).
