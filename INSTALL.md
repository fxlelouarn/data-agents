# Guide d'Installation - Data Agents

Ce document détaille les étapes pour installer et configurer le projet Data Agents.

## 📋 Prérequis

- **Node.js** : v18+ (recommandé v22)
- **npm** : v9+
- **PostgreSQL** : v15+ (recommandé avec Docker)
- **Git** : pour cloner le repository

## ⚙️ Architecture du Monorepo

Le projet est organisé avec les packages suivants pour éviter les dépendances circulaires :

```
packages/
├── types/              # ← Types partagés (CRITIQUES)
├── agent-framework/    # Dépend de: types (lazy load database)
└── database/           # Dépend de: types

apps/
├── agents/            # Implémentations d'agents
├── api/               # API REST
└── dashboard/         # Interface web React
```

### ⚠️ Résolution des Dépendances Circulaires

**Important**: Le cycle `agent-framework → database → sample-agents` a été résolu en créant un package `@data-agents/types` contenant les types partagés. Cela permet :

- `agent-framework` de ne dépendre que de `types` (avec lazy loading de `database` au runtime)
- `database` de dépendre de `types` uniquement
- Élimination complète des dépendances circulaires

**Ordre de build automatique** : Turbo gère l'ordre grâce aux dépendances déclarées dans chaque `package.json`.

## 🚀 Installation Pas-à-Pas

### 1. Cloner le Repository

```bash
git clone <repository-url>
cd data-agents
```

### 2. Installer les Dépendances

```bash
# Installer npm globally (turbo)
npm install -g turbo

# Installer les dépendances du projet
npm install
```

**Note**: L'installation inclut automatiquement le build du package `@data-agents/types` qui est nécessaire pour les autres packages.

### 3. Configurer l'Environnement

```bash
# Copier le fichier template (si existant)
cp .env.example .env

# Éditer .env avec vos configurations
```

Fichier `.env` minimal requis :
```
# Base de données
DATABASE_URL="postgresql://user:password@localhost:5432/data-agents"
DATABASE_DIRECT_URL="postgresql://user:password@localhost:5432/data-agents"

# Application
NODE_ENV="development"
PORT=4001

# Optional
LOG_LEVEL="INFO"
```

### 4. Configuration de la Base de Données

#### Option A: Avec Docker
```bash
# Démarrer les services (PostgreSQL, Redis si utilisé)
docker-compose up -d

# Vérifier la connexion
docker-compose ps
```

#### Option B: Avec PostgreSQL local
```bash
# Créer une base de données
createdb data-agents

# Vérifier la connexion avec psql
psql -U postgres -d data-agents -c "SELECT 1"
```

### 5. Initialiser la Base de Données

```bash
# Générer le client Prisma
npm run db:generate

# Appliquer les migrations
npm run db:migrate

# Seed la base (optionnel)
npm run db:seed
```

### 6. Builder le Projet

```bash
# Build tous les packages dans le bon ordre
npm run build

# Ou build un package spécifique
npm run build -- --filter=@data-agents/agent-framework
npm run build -- --filter=@data-agents/database
```

**Important** : Le build incluera automatiquement :
1. `@data-agents/types` (types partagés)
2. `@data-agents/database` (dépend de types)
3. `@data-agents/agent-framework` (dépend de types)
4. Autres applications

### 7. Démarrer le Développement

```bash
# Démarrer tous les services en mode dev
npm run dev

# Ou démarrer séparément :
npm run dev:api         # API sur http://localhost:4001
npm run dev:dashboard   # Dashboard sur http://localhost:4000
```

## 📦 Scripts NPM Disponibles

### Development
```bash
npm run dev              # Démarrer tous les packages en mode watch
npm run dev:api          # Démarrer l'API uniquement
npm run dev:dashboard    # Démarrer le dashboard uniquement
```

### Build
```bash
npm run build            # Build tous les packages (respects dependencies)
npm run build:prod       # Build pour production
turbo build --filter=@data-agents/database  # Build un package spécifique
```

### Linting & Types
```bash
npm run lint            # Lint tous les packages
npm run tsc             # Vérifier les types TypeScript
```

### Tests
```bash
npm run test            # Exécuter les tests
```

### Database
```bash
npm run db:generate     # Générer le client Prisma
npm run db:migrate      # Appliquer les migrations
npm run db:migrate:dev  # Créer et appliquer une nouvelle migration
npm run db:push         # Push le schema sans migration
npm run db:studio       # Ouvrir Prisma Studio (GUI pour la DB)
npm run db:seed         # Seed la base de données
```

### Nettoyage
```bash
npm run clean           # Nettoyer tous les caches Turbo
```

## 🔍 Vérification Post-Installation

### 1. Vérifier les Builds
```bash
# Tous les builds doivent réussir
npm run build

# Sortie attendue : Tasks: 6 successful (ou plus)
```

### 2. Vérifier les Types
```bash
npm run tsc

# Aucune erreur TypeScript ne doit être affichée
```

### 3. Vérifier la Base de Données
```bash
# Vérifier les migrations
npm run db:studio

# Une interface graphique devrait s'ouvrir
```

### 4. Vérifier l'API
```bash
npm run dev:api

# L'API devrait démarrer sans erreurs sur le port 4001
# Tester : curl http://localhost:4001/api/health
```

### 5. Vérifier le Dashboard
```bash
npm run dev:dashboard

# Le dashboard devrait être accessible sur http://localhost:4000
```

## 🐛 Problèmes Courants et Solutions

### ❌ Erreur: "Cannot find module '@data-agents/types'"

**Cause**: Le package `types` n'a pas été buildé ou lié.

**Solution**:
```bash
# Reconstruire le package types
npm run build -- --filter=@data-agents/types

# Ou réinstaller complètement
rm -rf node_modules
npm install
npm run build
```

### ❌ Erreur Prisma: "Cannot find database"

**Cause**: La variable `DATABASE_URL` est manquante ou incorrecte.

**Solution**:
```bash
# Vérifier le fichier .env
cat .env | grep DATABASE_URL

# Vérifier la connexion PostgreSQL
psql $DATABASE_URL -c "SELECT 1"

# Recréer la base si nécessaire
dropdb data-agents
createdb data-agents
npm run db:migrate
```

### ❌ Erreur TypeScript: "Type 'X' is not assignable to type 'Y'"

**Cause**: Les types ne sont pas à jour après modifications.

**Solution**:
```bash
# Regénérer les types
npm run tsc --noEmit false

# Ou nettoyer et rebuilder
npm run clean
npm run build
```

### ❌ Erreur Docker: "Port already in use"

**Cause**: Un conteneur utilise déjà le port.

**Solution**:
```bash
# Voir les conteneurs
docker-compose ps

# Arrêter les anciens conteneurs
docker-compose down -v

# Relancer
docker-compose up -d
```

## 📚 Structure du Projet

```
data-agents/
├── packages/
│   ├── types/                # Types partagés (AgentType, LogLevel, ProposalType)
│   ├── agent-framework/      # Framework abstrait pour agents
│   ├── database/             # Couche Prisma et services DB
│   └── shared/               # Utilitaires partagés
├── apps/
│   ├── agents/               # Implémentations d'agents
│   ├── api/                  # API REST
│   └── dashboard/            # Interface React
├── package.json              # Root package.json avec workspaces
├── turbo.json               # Configuration Turbo (build order)
├── tsconfig.json            # Configuration TypeScript partagée
└── README.md                # Documentation générale
```

## 🔄 Dépendances Between Packages

```
┌──────────────────┐
│  @data-agents    │
│     /types       │ ← Package racine (no dependencies)
└────────┬─────────┘
         │
    ┌────┴────┬────────────────────┐
    │         │                    │
┌───▼──┐  ┌──▼───────────────┐ ┌──▼────┐
│agent │  │  @data-agents/   │ │ apps/ │
│frame │  │    database      │ │agents │
└──────┘  └──────────────────┘ └───────┘
   ▲            ▲
   │            │
   └────┬───────┘
        │
    (lazy load at runtime)
```

## 🚀 Déploiement

### Build pour Production
```bash
npm run build:prod
```

### Variables d'Environnement Production
```bash
NODE_ENV=production
DATABASE_URL=<production-postgres-url>
PORT=4001
LOG_LEVEL=WARN
```

## 📖 Documentation Supplémentaire

- [README.md](README.md) - Vue d'ensemble du projet
- [API Documentation](docs/API.md) - Endpoints et exemples
- [Contributing Guide](CONTRIBUTING.md) - Comment contribuer
- [Troubleshooting](docs/TROUBLESHOOTING.md) - Aide au dépannage

## 🆘 Support

En cas de problème :

1. **Vérifier les logs** : `npm run dev 2>&1 | tail -50`
2. **Consulter les issues** : GitHub Issues
3. **Nettoyer et rebuilder** : `npm run clean && npm install && npm run build`
4. **Contacter l'équipe** : Support ou maintainers

## ✅ Checklist Post-Installation

- [ ] Node.js v18+ installé (`node --version`)
- [ ] Dépendances installées (`npm install` réussi)
- [ ] Base de données configurée (`npm run db:migrate` réussi)
- [ ] Build réussi (`npm run build` sans erreurs)
- [ ] Types vérifiés (`npm run tsc` sans erreurs)
- [ ] API démarre (`npm run dev:api` accessible)
- [ ] Dashboard démarre (`npm run dev:dashboard` accessible)
- [ ] Health check OK (`curl http://localhost:4001/api/health`)

Vous êtes maintenant prêt à développer ! 🎉
