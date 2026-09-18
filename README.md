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
| app | `VITE_API_URL` | `http://localhost:3001` | URL du serveur |
| server | `PORT` | `3001` | Port HTTP / socket |
| server | `CORS_ORIGIN` | `http://localhost:5173,http://127.0.0.1:5173` | Origines autorisées (séparées par des virgules) |
| server | `ALLOW_GUEST_PRIVATE_ROOMS` | `true` | Rooms privées pour les invités (à passer à `false` avec l'auth) |

## Tests

```bash
cd app && npm test && npm run typecheck
```
