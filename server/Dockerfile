FROM node:22-slim

ENV NODE_ENV=production

# Outils nécessaires pour compiler better-sqlite3 (module natif) quand aucun binaire préconstruit ne convient
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
# Dépendances de production seulement : tsx en fait partie, il exécute le TypeScript tel quel.
RUN npm ci --omit=dev

COPY src/ ./src/
COPY tsconfig.json ./

# Le volume de données doit être accessible en écriture par l'utilisateur non-root.
RUN mkdir -p /data && chown -R node:node /app /data
USER node

EXPOSE 3001
CMD ["npm", "start"]
