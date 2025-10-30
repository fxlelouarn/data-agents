# 📚 Documentation Data-Agents - Index

Bienvenue dans la documentation complète du projet **data-agents**. Ce projet est un système intelligent d'extraction et de validation de données d'événements sportifs.

---

## 🚀 Quick Start

1. **Nouveau sur le projet?** → Commencez par [ARCHITECTURE.md](./ARCHITECTURE.md)
2. **Veux créer un agent?** → Voir [AGENT-REGISTRY.md](./AGENT-REGISTRY.md)
3. **Travailler sur le dashboard?** → Consulter [DASHBOARD-PROPOSALS.md](./DASHBOARD-PROPOSALS.md)
4. **Besoin de tester?** → Consulter [TEST-ENVIRONMENT.md](./TEST-ENVIRONMENT.md)
5. **Configurer un agent?** → [CONFIGURATION-SYSTEM.md](./CONFIGURATION-SYSTEM.md)

---

## 📖 Documentation Complète

### 1. Vue d'Ensemble

| Document | Description | Pour qui |
|----------|-------------|----------|
| [**ARCHITECTURE.md**](./ARCHITECTURE.md) | Structure globale monorepo, packages, apps, flux de données | Tous |
| [**README racine**](../README.md) | Présentation projet, features, quick start | Tous |
| [**SPECS.md**](../SPECS.md) | Spécifications des agents et interfaces | Architectes |

### 2. Agents et Framework

| Document | Description | Pour qui |
|----------|-------------|----------|
| [**AGENT-REGISTRY.md**](./AGENT-REGISTRY.md) | Enregistrement, création, gestion des agents | Développeurs |
| [**AGENTS-ARCHITECTURE.md**](./AGENTS-ARCHITECTURE.md) | Hiérarchie classes, cycle de vie, patterns | Développeurs |
| [**DATABASE-MANAGER.md**](./DATABASE-MANAGER.md) | Gestion connexions bases de données source | Développeurs |
| [**CONFIGURATION-SYSTEM.md**](./CONFIGURATION-SYSTEM.md) | Configuration dynamique des agents | Développeurs |

### 3. Dashboard et Interface

| Document | Description | Pour qui |
|----------|-------------|----------|
| [**DASHBOARD-PROPOSALS.md**](./DASHBOARD-PROPOSALS.md) | Architecture propositions, tables de changements, validation | Frontend |
| [**TIMEZONE-SUPPORT.md**](./TIMEZONE-SUPPORT.md) | Gestion des timezones dans l'application | Développeurs |
| [**USER-MODIFICATIONS.md**](./USER-MODIFICATIONS.md) | Système de modifications utilisateur | Développeurs |

### 4. Développement et Test

| Document | Description | Pour qui |
|----------|-------------|----------|
| [**TEST-ENVIRONMENT.md**](./TEST-ENVIRONMENT.md) | Console interactive pour tester agents | Développeurs |
| [**AGENT-AUTO-DISABLE.md**](./AGENT-AUTO-DISABLE.md) | Désactivation automatique en cas d'erreur | DevOps |

---

## 🏗️ Architecture Globale (Résumé)

```
data-agents (monorepo)
│
├── packages/
│   ├── agent-framework      # BaseAgent, AgentRegistry, Logger, DatabaseManager
│   ├── database             # Prisma ORM, Services (Agent, Proposal, Run, Log, DB)
│   └── types                # Types TypeScript partagés
│
├── apps/
│   ├── agents               # GoogleSearchDateAgent, FFAScraperAgent, etc.
│   ├── api                  # Express API REST
│   └── dashboard            # React + MUI Pro interface web
│
├── test-environment/        # Console interactive pour tests
└── scripts/                 # Scripts utilitaires
```

---

## 🤖 Composantes Clés

### Packages

**`agent-framework`**
- `BaseAgent` - Classe abstraite pour tous les agents
- `WebScraperAgent` - Spécialisation pour web scraping
- `AgentRegistry` - Système d'enregistrement des agents
- `DatabaseManager` - Gestion connexions bases de données
- Logging system centralisé

**`database`**
- Schéma Prisma pour la persistance
- Services métier : AgentService, ProposalService, RunService, etc.
- Support Prisma + PostgreSQL

**`types`**
- Types TypeScript partagés : AgentType, ProposalType, LogLevel, etc.

### Applications

**`apps/agents`**
- Implémentations concrètes d'agents
- Enregistrement dans AgentRegistry

**`apps/api`**
- API REST : agents, databases, proposals, runs, logs
- Validation, middleware, orchestration

**`apps/dashboard`**
- Interface web React
- Pages : Agents, Propositions, Runs, Logs, Administration
- React Query + Material-UI Pro

---

## 📊 Flux Principaux

### 1. Exécution d'Agent
```
User trigger → API /agents/:id/run → AgentRegistry.create() → BaseAgent.run() 
→ Extract/Validate → Créer propositions → Sauvegarder BD → Résultat
```

### 2. Validation Propositions
```
User Dashboard → GET propositions → Afficher alternatives → Approuver/Rejeter 
→ PUT /api/proposals → Sync Miles Republic
```

### 3. Auto-Désactivation
```
Agent échoue → Incrémenter compteur → Check seuil (défaut 3) 
→ Auto-désactiver → Notification
```

---

## 🔧 Concepts Clés

### BaseAgent

Classe abstraite implémentant `IAgent` interface.

**Méthodes requises** :
- `abstract run(context)` - Exécution logique agent
- `validate()` - Vérifier configuration valide
- `getStatus()` - Récupérer statut agent

**Méthodes utilitaires** :
- `parseDate()` - Parser dates multiples formats
- `extractNumber()` - Extraire nombres
- `calculateSimilarity()` - Comparer chaînes
- `createProposal()` - Créer propositions

### AgentRegistry

Pattern Factory + Registry pour créer agents.

```typescript
agentRegistry.register('GOOGLE_SEARCH_DATE', GoogleSearchDateAgent)
const agent = agentRegistry.create('GOOGLE_SEARCH_DATE', config)
```

### DatabaseManager

Gestion centralisée connexions multiples bases de données.

```typescript
const connection = await dbManager.getConnection('db-miles-republic')
const events = await connection.Event.findMany()
```

---

## 📈 Types d'Agents

### 1. **EXTRACTOR** - Extraction de données
- Google Search Date Agent
- FFA Scraper
- Web Scraper (généralisé)

### 2. **VALIDATOR** - Validation propositions
- Validateurs spécialisés par source
- Validation automatique certains champs

### 3. **CLEANER** - Nettoyage données
- Détection doublons
- Correction catégories

### 4. **DUPLICATOR** - Reconduction éditions
- Duplication automatique événements passés
- Passage en TO_BE_CONFIRMED

---

## 🧪 Testing

### Test Environment

Console interactive pour tester agents :

```bash
# Test simple
node test-environment/console-tester.js test-agent

# Test GoogleSearchDateAgent
node test-environment/console-tester.js GoogleSearchDateAgent \
  --config test-environment/configs/google-agent.json \
  --dry-run --verbose

# Mode interactif
node test-environment/console-tester.js test-agent --interactive
```

### Fonctionnalités
- Mock services (DB, HTTP, Browser)
- Logging coloré détaillé
- Mode simulation (dry-run)
- Configuration dynamique

---

## 🔐 Sécurité

- ✅ Validation de configuration agent obligatoire
- ✅ Gestion sécurisée mots de passe (pas de logs en clair)
- ✅ Vérification d'utilisation avant suppression ressources
- ✅ Test connexion avant validation agent
- ✅ Isolation connexions par agent

---

## 📋 Schéma Données Principal

```prisma
model Agent
  id, name, description, type, frequency, isActive, config

model AgentRun
  id, agentId, startedAt, completedAt, success, error, metrics

model AgentLog
  id, agentId, runId, level, message, data, timestamp

model Proposal
  id, type, status, agentId, eventId, editionId, raceId, changes, justification

model DatabaseConnection
  id, name, type, host, port, database, username, password, ssl, isActive

model AgentState
  agentId, key, value (persistence d'état)
```

---

## 🚀 Déploiement

- **Platform** : Render
- **Configuration** : `render.yaml` + `Dockerfile`
- **Variables env requises** : 
  - `DATABASE_URL` - Connexion PostgreSQL
  - `MILES_REPUBLIC_DATABASE_URL` - Base Miles Republic
  - `GOOGLE_API_KEY` - Google Search API
  - `PORT` - Port serveur

---

## 📚 Par Rôle

### Pour Développeurs Backend
1. [ARCHITECTURE.md](./ARCHITECTURE.md) - Vue d'ensemble
2. [AGENTS-ARCHITECTURE.md](./AGENTS-ARCHITECTURE.md) - Détails implémentation
3. [AGENT-REGISTRY.md](./AGENT-REGISTRY.md) - Créer nouveaux agents
4. [TEST-ENVIRONMENT.md](./TEST-ENVIRONMENT.md) - Tester localement

### Pour Développeurs Frontend
1. [ARCHITECTURE.md](./ARCHITECTURE.md) - Vue d'ensemble
2. [CONFIGURATION-SYSTEM.md](./CONFIGURATION-SYSTEM.md) - Schéma config agents
3. API Endpoints dans [README racine](../README.md)

### Pour DevOps
1. [ARCHITECTURE.md](./ARCHITECTURE.md) - Infrastructure générale
2. [AGENT-AUTO-DISABLE.md](./AGENT-AUTO-DISABLE.md) - Gestion automatique erreurs
3. [README racine](../README.md) - Déploiement

### Pour Product Managers
1. [README racine](../README.md) - Features
2. [SPECS.md](../SPECS.md) - Spécifications
3. [ARCHITECTURE.md](./ARCHITECTURE.md) - Vue d'ensemble technique

---

## 🛠️ Commandes Utiles

```bash
# Installation
npm install

# Développement
npm run dev              # Tous les services
npm run dev:api         # API seulement
npm run dev:dashboard   # Dashboard seulement

# Build
npm run build

# Base de données
npm run db:generate     # Générer client Prisma
npm run db:migrate      # Appliquer migrations
npm run db:studio       # Interface Prisma Studio

# Test
npm run test
npm run lint

# Test environment
node test-environment/console-tester.js [agent-name] [options]
```

---

## ❓ FAQ

**Q: Comment ajouter un nouvel agent?**
R: Voir [AGENT-REGISTRY.md](./AGENT-REGISTRY.md) section "Créer un Nouvel Agent"

**Q: Comment configurer un agent?**
R: Consulter [CONFIGURATION-SYSTEM.md](./CONFIGURATION-SYSTEM.md)

**Q: Comment tester localement?**
R: [TEST-ENVIRONMENT.md](./TEST-ENVIRONMENT.md)

**Q: Comment se connecter à Miles Republic?**
R: [DATABASE-MANAGER.md](./DATABASE-MANAGER.md)

**Q: Comment l'agent se désactive automatiquement?**
R: [AGENT-AUTO-DISABLE.md](./AGENT-AUTO-DISABLE.md)

---

## 🤝 Contribution

1. Créer branche feature `git checkout -b feature/mon-agent`
2. Développer + tester avec test-environment
3. Commit descriptif `git commit -m 'Add mon-agent'`
4. Push `git push origin feature/mon-agent`
5. Ouvrir Pull Request

---

## 📞 Support

- 📖 Consulter la documentation d'abord
- 🐛 Bug report avec logs de debug
- 💬 Questions directement aux développeurs

---

## Dernière mise à jour

Documentation générée le **2025-10-30**

---

**Navigation rapide** :
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Architecture complète
- [AGENT-REGISTRY.md](./AGENT-REGISTRY.md) - Enregistrement agents  
- [AGENTS-ARCHITECTURE.md](./AGENTS-ARCHITECTURE.md) - Détails agents
- [DATABASE-MANAGER.md](./DATABASE-MANAGER.md) - Gestion BD
- [CONFIGURATION-SYSTEM.md](./CONFIGURATION-SYSTEM.md) - Configuration
- [DASHBOARD-PROPOSALS.md](./DASHBOARD-PROPOSALS.md) - Dashboard propositions
- [TEST-ENVIRONMENT.md](./TEST-ENVIRONMENT.md) - Testing
