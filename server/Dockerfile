FROM node:20-slim

# Outils nécessaires pour compiler better-sqlite3 (module natif)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
# Installe toutes les dépendances (tsx est en devDependencies)
RUN npm ci

COPY src/ ./src/
COPY tsconfig.json ./

EXPOSE 3001
CMD ["npm", "start"]
