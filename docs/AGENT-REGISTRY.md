# 🗂️ Agent Registry - Système d'Enregistrement des Agents

## Vue d'ensemble

L'**AgentRegistry** est un système de **registre centralisé** permettant d'enregistrer, de créer et de gérer les instances d'agents. C'est un pattern **Factory + Registry** qui découple la création d'agents de leur utilisation.

---

## 1. Architecture du Registry

### 1.1 Classe AgentRegistry

**Emplacement** : `packages/agent-framework/src/index.ts`

```typescript
export class AgentRegistry {
  private agents = new Map<string, new (config: any) => BaseAgent>()

  // Enregistrer un nouveau type d'agent
  register<T extends BaseAgent>(
    type: string, 
    agentClass: new (config: any) => T
  ): void

  // Créer une instance d'agent
  create(type: string, config: any): BaseAgent | null

  // Lister les types d'agents disponibles
  getRegisteredTypes(): string[]
}

// Instance globale (singleton)
export const agentRegistry = new AgentRegistry()
```

### 1.2 Flux Créé d'un Agent

```
┌──────────────────────────────────────┐
│ Démarrage de l'application           │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ Import @data-agents/sample-agents    │
│ apps/agents/src/index.ts             │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ agentRegistry.register()             │
│ Chaque agent enregistré              │
│ - GoogleSearchDateAgent              │
│ - FFAScraperAgent                    │
│ - [Futures implémentations]          │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ Runtime: API reçoit demande run      │
│ POST /api/agents/:id/run             │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ Charge agent depuis BD               │
│ récupère type et config              │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ agentRegistry.create(type, config)   │
│ Instantie agent selon son type       │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ BaseAgent.run(context) exécuté       │
│ Logs et propositions générées        │
└──────────────────────────────────────┘
```

---

## 2. Enregistrement des Agents

### 2.1 Processus d'Enregistrement

**Fichier** : `apps/agents/src/index.ts`

```typescript
import { agentRegistry } from '@data-agents/agent-framework'
import { GoogleSearchDateAgent } from './GoogleSearchDateAgent'
import { FFAScraperAgent } from './ffa-scraper'

// Enregistrer tous les agents disponibles
agentRegistry.register('GOOGLE_SEARCH_DATE', GoogleSearchDateAgent)
agentRegistry.register('FFA_SCRAPER', FFAScraperAgent)

// Exporter pour vérification
export { GoogleSearchDateAgent, FFAScraperAgent }
export { agentRegistry }

console.log('📦 Sample agents registered:', agentRegistry.getRegisteredTypes())
// Output: 📦 Sample agents registered: ['GOOGLE_SEARCH_DATE', 'FFA_SCRAPER']
```

### 2.2 Conventions de Nommage

Les **types d'agents** doivent suivre ces conventions :

| Convention | Exemple | Utilisation |
|-----------|---------|-------------|
| SCREAMING_SNAKE_CASE | `GOOGLE_SEARCH_DATE` | Type d'agent dans BD |
| PascalCase | `GoogleSearchDateAgent` | Nom de la classe |
| kebab-case | `google-search-date.ts` | Nom du fichier |

### 2.3 Créer un Nouvel Agent

**Étape 1** : Créer la classe d'agent

```typescript
// apps/agents/src/MonNouvelAgent.ts

import { BaseAgent, AgentContext, AgentRunResult } from '@data-agents/agent-framework'

export class MonNouvelAgent extends BaseAgent {
  async run(context: AgentContext): Promise<AgentRunResult> {
    context.logger.info('Démarrage de MonNouvelAgent')
    
    try {
      // Logique d'extraction/validation
      const results = await this.extractData()
      
      return {
        success: true,
        proposals: results,
        message: `${results.length} propositions créées`
      }
    } catch (error) {
      return {
        success: false,
        message: `Erreur: ${error}`
      }
    }
  }

  private async extractData() {
    // Votre logique métier
    return []
  }
}
```

**Étape 2** : Enregistrer dans le registry

```typescript
// apps/agents/src/index.ts

import { agentRegistry } from '@data-agents/agent-framework'
import { MonNouvelAgent } from './MonNouvelAgent'

// Ajouter cette ligne
agentRegistry.register('MON_NOUVEL_AGENT', MonNouvelAgent)

export { MonNouvelAgent }
```

**Étape 3** : Vérifier l'enregistrement

```bash
# Lancer l'application
npm run dev

# Vérifier les agents enregistrés
curl http://localhost:4001/api/agents/types
# Response: ["GOOGLE_SEARCH_DATE", "FFA_SCRAPER", "MON_NOUVEL_AGENT"]
```

---

## 3. Utilisation du Registry

### 3.1 Créer une Instance d'Agent

```typescript
import { agentRegistry } from '@data-agents/agent-framework'

// Récupérer une instance du registry
const config = {
  id: 'agent-123',
  name: 'Google Search Date Agent',
  type: 'EXTRACTOR',
  frequency: '0 */6 * * *',
  isActive: true,
  config: {
    batchSize: 10,
    googleApiKey: process.env.GOOGLE_API_KEY,
    // ... autres paramètres
  }
}

// Créer l'agent (null si type non trouvé)
const agent = agentRegistry.create('GOOGLE_SEARCH_DATE', config)

if (agent) {
  const result = await agent.run(context)
  console.log(result)
} else {
  console.error('Agent type not found')
}
```

### 3.2 Lister les Agents Disponibles

```typescript
import { agentRegistry } from '@data-agents/agent-framework'

const types = agentRegistry.getRegisteredTypes()
console.log('Available agent types:', types)
// Output: Available agent types: ['GOOGLE_SEARCH_DATE', 'FFA_SCRAPER', ...]
```

### 3.3 Cas d'Utilisation Réel : Exécution d'Agent depuis l'API

**Fichier** : `apps/api/src/routes/agents.ts`

```typescript
import { Router } from 'express'
import { agentRegistry } from '@data-agents/agent-framework'
import { AgentService } from '@data-agents/database'

const router = Router()
const agentService = new AgentService()

// POST /api/agents/:id/run - Exécuter un agent manuellement
router.post('/:id/run', async (req, res) => {
  try {
    // 1. Récupérer la configuration de l'agent depuis la BD
    const agent = await agentService.getAgent(req.params.id)
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' })
    }

    // 2. Valider que l'agent est actif
    if (!agent.isActive) {
      return res.status(400).json({ error: 'Agent is not active' })
    }

    // 3. Créer une instance via le registry
    const agentInstance = agentRegistry.create(agent.type, agent)
    if (!agentInstance) {
      return res.status(400).json({ 
        error: `Agent type '${agent.type}' not registered` 
      })
    }

    // 4. Créer le contexte d'exécution
    const context = {
      runId: uuidv4(),
      startedAt: new Date(),
      logger: createLogger(agent.name, agent.id),
      config: agent.config
    }

    // 5. Exécuter l'agent
    const result = await agentInstance.run(context)

    // 6. Retourner le résultat
    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
```

---

## 4. Validation et Sécurité

### 4.1 Vérification à l'Enregistrement

```typescript
// apps/agents/src/index.ts

// ✅ BON : Vérifier que l'agent a les méthodes requises
class BaseAgent {
  async validate(): Promise<boolean> {
    // Validation base
    if (!this.config.name || !this.config.type || !this.config.frequency) {
      return false
    }
    // Validation cron expression
    const cronRegex = /^.../ // Voir base-agent.ts
    if (!cronRegex.test(this.config.frequency)) {
      return false
    }
    return true
  }
}

// ❌ MAUVAIS : Créer agent sans vérification
const agent = agentRegistry.create(untrustedType, config)
// Risque: type peut être n'importe quoi
```

### 4.2 Gestion des Types Non Trouvés

```typescript
const agent = agentRegistry.create('INVALID_TYPE', config)

// Le registry retourne null si type pas trouvé
if (!agent) {
  logger.error(`Agent type 'INVALID_TYPE' not found`)
  logger.info(`Available types: ${agentRegistry.getRegisteredTypes().join(', ')}`)
}
```

### 4.3 Erreurs Courantes

| Erreur | Cause | Solution |
|--------|-------|----------|
| Agent type not found | Type pas enregistré | Ajouter `agentRegistry.register()` |
| Cannot instantiate | Classe malformée | Vérifier constructeur accepte `config` |
| Missing method | run() pas implémenté | Implémenter `run()` dans la classe |

---

## 5. Patterns et Bonnes Pratiques

### 5.1 Pattern Singleton

L'instance globale `agentRegistry` est un **singleton**:

```typescript
// packages/agent-framework/src/index.ts
export const agentRegistry = new AgentRegistry()  // Instance unique

// À l'import, on récupère toujours la même instance
import { agentRegistry } from '@data-agents/agent-framework'
// agentRegistry === la même instance partout
```

### 5.2 Pattern Factory

Le registry implémente le **pattern Factory** :

```
┌─────────────────┐
│  AgentRegistry  │  Factory Pattern
│                 │
│ register()      │  ─── Enregistre constructeurs
│ create()        │  ─── Crée instances
│ getTypes()      │  ─── List types
└─────────────────┘
```

### 5.3 Pattern Strategy

Chaque agent implémente une **stratégie d'extraction** différente:

```
     ┌──────────────────┐
     │   IAgent         │
     │  (interface)     │
     └─────────┬────────┘
               │
      ┌────────┼────────┐
      │        │        │
      ▼        ▼        ▼
 Google   FFA      Web
 Search   Scraper  Scraper
 Agent    Agent    Agent
```

### 5.4 Extensibilité

Le système est extensible sans modification du code existant (**Open/Closed Principle**):

```typescript
// Ajouter un nouvel agent ne requiert que:
// 1. Créer la classe
class MonAgent extends BaseAgent { ... }

// 2. Enregistrer
agentRegistry.register('MON_AGENT', MonAgent)

// Pas de modification du registry lui-même !
```

---

## 6. Configuration Dynamique du Registry

### 6.1 Enregistrement Conditionnel

```typescript
import { agentRegistry } from '@data-agents/agent-framework'

// Enregistrer uniquement en production
if (process.env.NODE_ENV === 'production') {
  agentRegistry.register('VALIDATOR', ValidatorAgent)
}

// Enregistrer conditionnellement selon API keys
if (process.env.GOOGLE_API_KEY) {
  agentRegistry.register('GOOGLE_SEARCH_DATE', GoogleSearchDateAgent)
}

// Enregistrer dynamiquement depuis config
const agents = JSON.parse(process.env.ENABLED_AGENTS || '[]')
agents.forEach(agentType => {
  const Agent = agentModules[agentType]
  if (Agent) {
    agentRegistry.register(agentType, Agent)
  }
})
```

### 6.2 Mock pour Tests

```typescript
// test-environment/utils/mock-context.js
class MockAgentRegistry {
  constructor() {
    this.agents = new Map()
  }

  register(type, AgentClass) {
    this.agents.set(type, AgentClass)
  }

  create(type, config) {
    const AgentClass = this.agents.get(type)
    if (!AgentClass) {
      return {
        run: async () => ({ success: false, message: 'Mock agent' })
      }
    }
    return new AgentClass(config)
  }

  getRegisteredTypes() {
    return Array.from(this.agents.keys())
  }
}

// Utilisation en test
const mockRegistry = new MockAgentRegistry()
mockRegistry.register('TEST_AGENT', TestAgent)
```

---

## 7. Intégration avec l'API

### 7.1 Endpoint : Lister types d'agents

```typescript
// GET /api/agents/types
router.get('/types', (req, res) => {
  const types = agentRegistry.getRegisteredTypes()
  res.json({
    types,
    count: types.length,
    timestamp: new Date()
  })
})

// Response
{
  "types": ["GOOGLE_SEARCH_DATE", "FFA_SCRAPER"],
  "count": 2,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### 7.2 Endpoint : Détails schema d'un agent

```typescript
// GET /api/agents/types/:type/schema
router.get('/types/:type/schema', (req, res) => {
  const agent = agentRegistry.create(req.params.type, {})
  if (!agent || !agent.getConfigSchema) {
    return res.status(404).json({ error: 'Schema not found' })
  }
  res.json(agent.getConfigSchema())
})
```

---

## 8. Dépannage

### Problème : Agent type not found

```bash
# Vérifier les agents enregistrés
curl http://localhost:4001/api/agents/types

# Vérifier que l'import est correct
grep "register.*YOUR_AGENT" apps/agents/src/index.ts

# Vérifier que le type correspond exactement (case sensitive)
```

### Problème : Instance not created

```typescript
// ❌ MAUVAIS : oublier await
const agent = agentRegistry.create('GOOGLE_SEARCH_DATE', config)
// agent pourrait être null

// ✅ BON : vérifier null
const agent = agentRegistry.create('GOOGLE_SEARCH_DATE', config)
if (!agent) {
  throw new Error(`Agent type not found`)
}
```

---

## Voir aussi

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Vue d'ensemble système
- [AGENTS-ARCHITECTURE.md](./AGENTS-ARCHITECTURE.md) - Détails des agents
- [CONFIGURATION-SYSTEM.md](./CONFIGURATION-SYSTEM.md) - Configuration agents
