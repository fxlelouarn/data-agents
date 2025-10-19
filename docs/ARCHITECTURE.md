# 🏗️ Architecture Global - Data Agents

## Vue d'ensemble

Le projet **data-agents** est un système intelligent d'extraction et de validation automatique de données d'événements sportifs. Il est organisé comme un **monorepo** avec plusieurs packages et applications interconnectés.

```
data-agents (monorepo)
├── packages/
│   ├── agent-framework      # Framework de base pour les agents
│   ├── database             # Couche données avec Prisma
│   └── types                # Types TypeScript partagés
├── apps/
│   ├── agents               # Implémentations d'agents
│   ├── api                  # API REST
│   └── dashboard            # Interface web React
├── test-environment/        # Environnement de test console
└── scripts/                 # Scripts utilitaires
```

## 1. Packages (Couches Partagées)

### 1.1 `packages/types`
**Rôle** : Définit les types TypeScript partagés à travers tout le projet

```typescript
// Types principaux
- AgentType                 // EXTRACTOR, VALIDATOR, CLEANER, etc.
- ProposalType              // EDITION_UPDATE, RACE_UPDATE, EVENT_CREATE, etc.
- ProposalStatus            // PENDING, APPROVED, REJECTED, ARCHIVED
- LogLevel                  // DEBUG, INFO, WARN, ERROR
```

**Utilité** : Garantit une cohérence de typage dans l'écosystème

---

### 1.2 `packages/agent-framework`
**Rôle** : Framework de base pour créer et gérer les agents

**Composants clés** :

#### a) **AgentRegistry** (classes/registry)
```typescript
class AgentRegistry {
  // Enregistrement de nouveaux types d'agents
  register(type: string, agentClass)
  
  // Création d'instances d'agents
  create(type: string, config): BaseAgent
  
  // Listing des agents disponibles
  getRegisteredTypes(): string[]
}
```

**Exemple d'utilisation** :
```typescript
import { agentRegistry } from '@data-agents/agent-framework'
import { GoogleSearchDateAgent } from '@data-agents/sample-agents'

agentRegistry.register('GOOGLE_SEARCH_DATE', GoogleSearchDateAgent)
const agent = agentRegistry.create('GOOGLE_SEARCH_DATE', config)
```

#### b) **BaseAgent** (classes/base-agent.ts)
Classe abstraite pour tous les agents
```typescript
abstract class BaseAgent implements IAgent {
  readonly config: AgentConfig           // Configuration de l'agent
  protected db: IDatabaseService         // Accès base de données
  protected logger: AgentLogger           // Logging

  abstract run(context: AgentContext): Promise<AgentRunResult>
  async validate(): Promise<boolean>
  async getStatus(): Promise<AgentStatus>
  
  // Méthodes utilitaires
  protected parseDate(dateStr, timezone?)
  protected extractNumber(text, unit?)
  protected calculateSimilarity(text1, text2)
  protected normalizeEventName(name)
}
```

#### c) **WebScraperAgent** (classes/web-scraper-agent.ts)
Spécialisation de BaseAgent pour web scraping
- Utilise Playwright pour la navigation
- Parsing DOM structuré
- Captures d'écrans

#### d) **DatabaseManager**
Gestion centralisée des connexions aux bases de données source

```typescript
class DatabaseManager {
  // Charger les configurations depuis la BD
  async loadDatabaseConfigurations()
  
  // Obtenir une connexion à une base
  async getConnection(databaseId: string)
  
  // Lister les bases disponibles
  async getAvailableDatabases()
  
  // Tester une connexion
  async testConnection(databaseId: string)
}
```

#### e) **Logging System**
Logger centralisé pour tous les agents
```typescript
interface AgentLogger {
  debug(message: string, data?: any)
  info(message: string, data?: any)
  warn(message: string, data?: any)
  error(message: string, data?: any)
}

export const createLogger = (agentName: string, agentId: string) => AgentLogger
```

**Flux de dépendances** :
```
BaseAgent 
  ├── utilise AgentRegistry pour enregistrement
  ├── utilise DatabaseManager pour les connexions
  ├── utilise AgentLogger pour logging
  └── implémente IAgent (interface contrat)

WebScraperAgent 
  └── étend BaseAgent
```

---

### 1.3 `packages/database`
**Rôle** : Couche données avec Prisma ORM et services métier

**Structure** :
```
packages/database/
├── prisma/
│   ├── schema.prisma        # Schéma Prisma principal
│   └── migrations/          # Historique des migrations
├── src/
│   ├── services/
│   │   ├── agent-service.ts         # CRUD agents
│   │   ├── proposal-service.ts      # CRUD propositions
│   │   ├── run-service.ts           # CRUD runs
│   │   ├── log-service.ts           # CRUD logs
│   │   ├── database-service.ts      # CRUD connexions DB
│   │   └── state-service.ts         # État persistant
│   └── index.ts
└── package.json
```

**Schéma Prisma** (entités principales) :
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
  key, value (pour persistence état agent comme offset, lastProcessed)
```

**Services principaux** :
```typescript
// Agent Service
class AgentService {
  async createAgent(data)
  async getAgent(id)
  async updateAgent(id, data)
  async deleteAgent(id)
  async toggleAgent(id)
  async getAgentWithRuns(id)
}

// Proposal Service
class ProposalService {
  async createProposal(data)
  async updateProposal(id, status, justification)
  async getProposalsByEdition(editionId)
  async bulkApprove(proposalIds)
  async bulkReject(proposalIds)
}

// DatabaseConnection Service
class DatabaseConnectionService {
  async createConnection(config)
  async testConnection(id)
  async getAvailableConnections()
  async deleteConnection(id)
}
```

**Flux de données** :
```
Agent Service
  ├── stocke configurations agents
  ├── valide agent config
  └── empêche activation si config invalide

Proposal Service
  ├── reçoit propositions d'agents
  ├── stocke dans BD
  └── permet validation humaine

DatabaseConnection Service
  ├── gère pools de connexion
  ├── teste accessibilité
  └── fournit à DatabaseManager
```

---

## 2. Applications (Fonctionnalités)

### 2.1 `apps/agents`
**Rôle** : Implémentations concrètes d'agents opérationnels

**Structure** :
```
apps/agents/src/
├── index.ts                              # Point d'entrée, enregistrement agents
├── GoogleSearchDateAgent.ts              # Implémentation agent
├── GoogleSearchDateAgent.configSchema.ts # Schéma config dynamique
├── ffa-scraper.ts                        # Agent FFA
└── registry/
    └── google-search-date.ts             # Enregistrement spécifique
```

**Exemple d'agent** : `GoogleSearchDateAgent`
- Type : EXTRACTOR
- Fonction : Rechercher dates d'événements via Google Search API
- Configuration : API keys, batch size, cooldown
- Processus :
  1. Récupère événements TO_BE_CONFIRMED en batches
  2. Effectue recherche Google pour chaque événement
  3. Extrait dates des résultats
  4. Crée propositions EDITION_UPDATE
  5. Persiste offset pour pagination

### 2.2 `apps/api`
**Rôle** : API REST pour gestion complète du système

**Endpoints** :
```
GET    /api/agents                 # Liste agents avec filtres
POST   /api/agents                 # Créer agent
GET    /api/agents/:id             # Détails agent
PUT    /api/agents/:id             # Modifier agent
DELETE /api/agents/:id             # Supprimer agent
POST   /api/agents/:id/toggle      # Activer/désactiver
POST   /api/agents/:id/run         # Exécution manuelle

GET    /api/databases              # Liste connexions DB
POST   /api/databases              # Créer connexion
POST   /api/databases/:id/test     # Tester connexion
DELETE /api/databases/:id          # Supprimer connexion

GET    /api/proposals              # Liste propositions filtrées
PUT    /api/proposals/:id          # Approuver/rejeter proposition
POST   /api/proposals/bulk-approve # Validation en bloc

GET    /api/runs                   # Historique runs
GET    /api/logs                   # Logs centralisés

GET    /api/health                 # Health check
```

**Middleware** :
- Validation de configuration agent avant activation
- Gestion sécurisée des mots de passe
- Vérification d'utilisation avant suppression de DB

### 2.3 `apps/dashboard`
**Rôle** : Interface web React pour supervision

**Pages principales** :
- 🏠 Dashboard - Vue d'ensemble (agents, propositions, runs)
- 🤖 Agents - Liste complète, détails, logs, édition
- 📈 Propositions - Validation, comparaison avant/après
- 📜 Logs - Logs centralisés avec filtrage
- ⚙️ Administration - Gestion connexions BD

**Stack technologique** :
- React 18+
- Material-UI Pro
- React Query (gestion d'état)
- Vite (build tool)

---

### 2.4 `test-environment/`
**Rôle** : Console interactive pour tester agents

**Structure** :
```
test-environment/
├── console-tester.js              # Point d'entrée
├── utils/
│   ├── AgentTester.js            # Orchestrateur tests
│   ├── logger.js                 # Système logging coloré
│   ├── cli-parser.js             # Parsing arguments CLI
│   ├── mock-context.js           # Contexte mock
│   └── interactive-prompt.js     # Mode interactif
├── configs/
│   ├── google-agent.json
│   └── ffa-scraper.json
└── agents/
    └── test-agent.js             # Agent de test simple
```

**Utilisation** :
```bash
node test-environment/console-tester.js GoogleSearchDateAgent \
  --config test-environment/configs/google-agent.json \
  --dry-run --verbose
```

---

## 3. Flux de Données Globaux

### 3.1 Exécution d'un Agent
```
┌─────────────────────────────────────┐
│ User déclenche agent (manual ou cron)
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ API /agents/:id/run                 │
│ Charge config agent depuis BD        │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ AgentRegistry.create(type, config)  │
│ Instancie agent via sa classe       │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ BaseAgent.run(context)              │
│ - Crée contexte d'exécution         │
│ - Initialise logger + database      │
│ - Exécute logique métier            │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ Propositions générées               │
│ DatabaseConnection.getConnection()  │
│ pour accès aux sources              │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ ProposalService.createProposal()    │
│ Persiste dans BD data-agents        │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ Logs sauvegardés                    │
│ AgentRun créé avec métriques        │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ Résultat visible dans Dashboard     │
└─────────────────────────────────────┘
```

### 3.2 Validation de Propositions
```
┌─────────────────────────────────────┐
│ User ouvre proposition dans Dashboard
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ GET /api/proposals/:id              │
│ Charge proposition + autres du même │
│ événement/édition/race              │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ Dashboard affiche :                 │
│ - Valeur actuelle (BD Miles Republic)│
│ - Propositions alternatives         │
│ - Justificatifs (images, liens)     │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ User approuve/rejette/modifie       │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ PUT /api/proposals/:id              │
│ ProposalService.updateProposal()    │
│ Sauvegarde décision dans BD         │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ Sync vers Miles Republic (optionnel) │
│ selon workflow de production        │
└─────────────────────────────────────┘
```

---

## 4. Dépendances Entre Composants

### 4.1 Dépendances d'Import
```
┌────────────────────────────────────────────┐
│           apps/agents                      │
│   (Implémentations concrètes)              │
└────────┬──────────────────────────────────┘
         │ importe
         ▼
┌────────────────────────────────────────────┐
│    packages/agent-framework                │
│    (BaseAgent, AgentRegistry, Logger)      │
└────────┬──────────────────────────────────┘
         │ utilise
         ▼
┌────────────────────────────────────────────┐
│    packages/database                       │
│    (Services métier, schéma)               │
└────────┬──────────────────────────────────┘
         │ utilise
         ▼
┌────────────────────────────────────────────┐
│    packages/types                          │
│    (Types partagés)                        │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│          apps/api                          │
│    (API REST, orchestration)               │
└────────┬──────────────────────────────────┘
         │ utilise
         ▼
┌────────────────────────────────────────────┐
│  packages/database + agent-framework       │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│       apps/dashboard                       │
│    (Interface React)                       │
└────────┬──────────────────────────────────┘
         │ consomme
         ▼
┌────────────────────────────────────────────┐
│        apps/api (endpoints)                │
└────────────────────────────────────────────┘
```

### 4.2 Flux Runtime
```
Agent exécution
     │
     ├──> DatabaseManager
     │        └──> Prisma Client (data-agents DB)
     │             └──> PostgreSQL
     │
     ├──> AgentState Service (persistance offset, etc.)
     │
     ├──> Connexion source
     │    └──> DatabaseConnection config
     │        └──> Prisma Client (Miles Republic)
     │             └──> PostgreSQL Miles Republic
     │
     ├──> Propositions
     │    └──> ProposalService
     │        └──> Sauvegarde DB
     │
     └──> Logging
          └──> LogService
              └──> Sauvegarde DB
```

---

## 5. Boucles Fermées (Feedback Loops)

### 5.1 Auto-désactivation Agents
```
Agent exécution échoue
     │
     ▼
RUN sauvegardé avec error
     │
     ▼
Check: X erreurs consécutives?
     │
     ├──> NON: Continue normal
     │
     └──> OUI
         └──> API auto-désactive agent
              └──> Notification/Log
              └──> User alerte via Dashboard
```

### 5.2 Feedback User sur Propositions
```
User approuve proposition
     │
     ▼
Envoie confirmation API
     │
     ▼
Agent peut analyser approvals
pour améliorer confiance
```

---

## 6. Points de Scalabilité

1. **Agents** : Chaque nouvel agent = nouvelle classe + enregistrement
2. **Bases de données** : Support multi-types configurables
3. **Propositions** : Approuvées/rejetées indépendamment
4. **Logging** : Logs centralisés et requêtables
5. **API** : Endpoints exposent tout

---

## Résumé

| Couche | Rôle | Technologie |
|--------|------|-------------|
| **Packages** | Logique métier partagée | TypeScript |
| **Agent Framework** | Base pour créer agents | BaseAgent, Registry |
| **Database** | Persistance données | Prisma + PostgreSQL |
| **Apps/Agents** | Implémentations agents | Node.js + Playwright |
| **Apps/API** | Interface systèmes externes | Express/Fastify |
| **Apps/Dashboard** | Interface humain | React + MUI |
| **Test Environment** | Développement agents | Node.js CLI |

---

## Voir aussi
- [Agent Architecture](./AGENTS-ARCHITECTURE.md) - Détails classes agents
- [Agent Registry](./AGENT-REGISTRY.md) - Système d'enregistrement
- [Database Manager](./DATABASE-MANAGER.md) - Gestion connexions
- [Configuration System](./CONFIGURATION-SYSTEM.md) - Configuration agents
- [Test Environment](./TEST-ENVIRONMENT.md) - Environnement test
