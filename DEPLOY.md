# Guide de Déploiement - Data Agents sur Render

## 📋 Prérequis

- Compte Render.com
- Repository Git avec le code
- Base de données PostgreSQL (créée automatiquement par Render)

## 🎯 Ordre des opérations (CRITIQUE)

Le déploiement suit un ordre strict pour éviter les erreurs de dépendances :

```
1. Installation des dépendances (npm ci)
   ↓
2. Migration de la base de données (db:migrate:deploy)
   ↓
3. Génération des clients Prisma (prisma:generate:all)
   ├── 3a. Client principal (packages/database/prisma/schema.prisma)
   └── 3b. Client Miles Republic (apps/agents/prisma/miles-republic.prisma)
   ↓
4. Build de l'application (build:prod)
   ├── 4a. types
   ├── 4b. database
   ├── 4c. agent-framework
   ├── 4d. sample-agents
   └── 4e. api
   ↓
5. Démarrage de l'application
```

## 🚀 Déploiement Automatique (render.yaml)

Le fichier `render.yaml` est configuré pour déployer automatiquement :

```yaml
services:
  - type: web
    name: data-agents-api
    env: node
    plan: starter
    buildCommand: |
      npm ci && \
      npm run db:migrate:deploy && \
      npm run prisma:generate:all && \
      npm run build:prod
    startCommand: node apps/api/dist/index.js
```

### Variables d'environnement requises

Render configurera automatiquement :
- `DATABASE_URL` - URL de connexion PostgreSQL principale
- `DATABASE_DIRECT_URL` - URL directe pour les migrations
- `NODE_ENV=production`
- `PORT=4001`
- `FRONTEND_URL` - URL du dashboard

### Pour les bases externes (Miles Republic)

Si vous connectez l'application à une base Miles Republic externe, ajoutez manuellement dans Render :

```
MILES_REPUBLIC_URL=postgresql://user:password@host:port/database
```

Puis mettez à jour la configuration dans `test-environment/configs/test-env.local.json` (ou via variables d'environnement).

## 🏗️ Déploiement Manuel (si nécessaire)

### Étape 1 : Créer la base de données

Dans Render Dashboard :
1. Allez dans "New" → "PostgreSQL"
2. Nom : `data-agents-db`
3. Database : `data_agents`
4. User : `data_agents_user`
5. Plan : Starter (gratuit)

### Étape 2 : Créer le Web Service

1. Allez dans "New" → "Web Service"
2. Connectez votre repository Git
3. Configuration :
   - **Name** : `data-agents-api`
   - **Environment** : `Node`
   - **Build Command** :
     ```bash
     npm ci && npm run db:migrate:deploy && npm run prisma:generate:all && npm run build:prod
     ```
   - **Start Command** :
     ```bash
     node apps/api/dist/index.js
     ```

### Étape 3 : Configurer les variables d'environnement

Dans l'onglet "Environment" du service :

```
NODE_ENV=production
PORT=4001
DATABASE_URL=[Internal Connection String from data-agents-db]
DATABASE_DIRECT_URL=[Internal Connection String from data-agents-db]
FRONTEND_URL=https://data-agents-dashboard.onrender.com
```

### Étape 4 : Configurer le Health Check

- **Health Check Path** : `/api/health`
- **Type** : HTTP

## 🐳 Déploiement avec Docker (Alternative)

Si vous préférez Docker :

```bash
# Build l'image
docker build -t data-agents-api .

# Test en local
docker run -p 4001:4001 \
  -e DATABASE_URL="postgresql://..." \
  -e DATABASE_DIRECT_URL="postgresql://..." \
  data-agents-api
```

Le Dockerfile est optimisé pour :
- ✅ Génération des deux clients Prisma (main + Miles Republic)
- ✅ Build multi-stage pour réduire la taille
- ✅ Health check intégré
- ✅ Support Playwright avec Chromium

## 🔍 Vérification du déploiement

### 1. Vérifier que les clients Prisma sont générés

Dans les logs de build, vous devriez voir :

```
✔ Generated Prisma Client (v5.x.x) to ./../../node_modules/@prisma/client
✔ Generated Prisma Client (v6.x.x) to ./node_modules/@prisma/client
```

**2 fois** - une pour le client principal, une pour Miles Republic.

### 2. Vérifier le build

```
Build completed successfully:
- @data-agents/types
- @data-agents/database
- @data-agents/agent-framework
- @data-agents/sample-agents
- @data-agents/api
```

### 3. Tester l'API

```bash
curl https://data-agents-api.onrender.com/api/health
# Devrait retourner: {"status":"ok","timestamp":"..."}
```

## 🐛 Troubleshooting

### Erreur : "Cannot find module '.prisma/client'"

**Cause** : Les clients Prisma n'ont pas été générés.

**Solution** : Vérifier que `prisma:generate:all` s'exécute dans le build command.

```bash
# Dans le build command
npm run prisma:generate:all
```

### Erreur : "Client Prisma non généré pour Miles Republic"

**Cause** : Le client Miles Republic n'a pas été généré ou n'est pas au bon endroit.

**Solution** : 
1. Vérifier que `apps/agents/prisma/miles-republic.prisma` existe
2. S'assurer que le script `prisma:generate:miles` s'exécute :
   ```bash
   cd apps/agents && npx prisma generate --schema=prisma/miles-republic.prisma
   ```

### Erreur : "ENOENT: no such file or directory"

**Cause** : Un fichier ou répertoire est manquant.

**Solution** : Vérifier que tous les fichiers sont bien commités dans Git :
- `packages/database/prisma/schema.prisma`
- `apps/agents/prisma/miles-republic.prisma`
- Tous les `package.json`
- `turbo.json`

### Build lent ou timeout

**Cause** : Le postinstall génère les clients à chaque `npm install`.

**Solution** : 
1. Désactiver temporairement postinstall en production
2. Utiliser le cache de Render :
   ```yaml
   # Dans render.yaml
   buildFilter:
     paths:
       - packages/**
       - apps/**
   ```

## 📊 Monitoring

### Logs essentiels à surveiller

1. **Démarrage** :
   ```
   ✅ Server started on port 4001
   ✅ Database connected
   ✅ Scheduler initialized
   ```

2. **Agents** :
   ```
   🤖 Agent [name] started
   ✅ Agent [name] completed successfully
   ```

3. **Erreurs** :
   ```
   ❌ Agent [name] failed: [error]
   ❌ Database connection error
   ```

### Health Check

L'endpoint `/api/health` retourne :

```json
{
  "status": "ok",
  "timestamp": "2025-01-05T18:20:00Z",
  "uptime": 3600,
  "database": "connected"
}
```

## 🔄 Redéploiement

Pour redéployer après des changements :

1. **Auto** : Pusher sur la branche configurée (ex: `main`)
2. **Manuel** : Dans Render Dashboard → "Manual Deploy"

## 📝 Checklist de déploiement

- [ ] Base de données créée sur Render
- [ ] Variables d'environnement configurées
- [ ] `render.yaml` à jour avec le bon build command
- [ ] Schémas Prisma présents dans Git
- [ ] Health check endpoint fonctionnel en local
- [ ] Tests passent en local
- [ ] Scripts `prisma:generate:all` et `build:prod` fonctionnent en local

## 🔐 Sécurité

- ❌ **Ne jamais** committer les fichiers `.env` ou `test-env.local.json`
- ✅ Utiliser les variables d'environnement Render
- ✅ Vérifier que `.gitignore` contient :
  ```
  .env
  .env.local
  .env.*.local
  test-env.local.json
  ```

## 📚 Ressources

- [Documentation Render](https://render.com/docs)
- [Prisma Multi-Schema Setup](./docs/PRISMA-MULTI-SCHEMA.md)
- [Architecture du Projet](./docs/ARCHITECTURE.md)

## 🆘 Support

En cas de problème :
1. Vérifier les logs de build dans Render
2. Consulter ce guide de troubleshooting
3. Vérifier que l'ordre des opérations est respecté
4. Tester le build en local avec les mêmes commandes
