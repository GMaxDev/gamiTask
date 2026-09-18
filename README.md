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

## Personnage

L'éditeur s'ouvre depuis le chip « Mon personnage » de la barre du haut ou en cliquant sur le miroir dans « Chez moi ». Le look choisi (couleurs, chapeau) est sauvegardé en local dans `localStorage` (clé `gamitask.look`). Les autres joueurs voient la couleur du t-shirt (envoyée à la prochaine connexion) et le chapeau équipé (appliqué côté serveur via `cosmetic:equip`).
