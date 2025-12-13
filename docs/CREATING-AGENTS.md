# Guide de Création d'un Agent

Ce document décrit les étapes nécessaires pour créer un nouvel agent dans le projet Data Agents. Un agent est un processus automatisé qui extrait des données, les compare, les valide ou les nettoie.

## Table des Matières

1. [Architecture Globale](#architecture-globale)
2. [Étapes de Création](#étapes-de-création)
3. [Fichiers à Créer/Modifier](#fichiers-à-créermodifier)
4. [Détails de Chaque Étape](#détails-de-chaque-étape)
5. [Exemple Complet](#exemple-complet)
6. [Bonnes Pratiques](#bonnes-pratiques)
7. [Troubleshooting](#troubleshooting)

---

## Architecture Globale

Le système d'agents repose sur 3 couches :

```
┌─────────────────────────────────────────────────────────────┐
│                    DASHBOARD (Frontend)                      │
│  AgentCreate.tsx → useAvailableAgents() → /api/agents/available │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      API (Backend)                           │
│  agent-metadata.ts → agentConfigSchemas, getAvailableAgentsForUI │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                 AGENTS (apps/agents)                         │
│  index.ts → agentRegistry.register('TYPE', AgentClass)       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              AGENT FRAMEWORK (packages)                      │
│  BaseAgent → AgentRegistry singleton                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Étapes de Création

### Checklist Rapide

- [ ] 1. Ajouter la version dans `packages/types/src/agent-versions.ts`
- [ ] 2. Créer le schéma de config dans `packages/types/src/agent-config-schemas/mon-agent.ts`
- [ ] 3. Exporter le schéma dans `packages/types/src/agent-config-schemas/index.ts`
- [ ] 4. Créer la classe agent dans `apps/agents/src/MonAgent.ts`
- [ ] 5. (Optionnel) Créer le fichier registry dans `apps/agents/src/registry/mon-agent.ts`
- [ ] 6. Enregistrer l'agent dans `apps/agents/src/index.ts`
- [ ] 7. Ajouter les métadonnées dans `apps/api/src/services/agent-metadata.ts`
- [ ] 8. Vérifier le build avec `npm run build:types && npm run tsc`

---

## Fichiers à Créer/Modifier

| Fichier | Action | Description |
|---------|--------|-------------|
| `packages/types/src/agent-versions.ts` | Modifier | Ajouter la version |
| `packages/types/src/agent-config-schemas/mon-agent.ts` | Créer | Schéma de configuration (source unique) |
| `packages/types/src/agent-config-schemas/index.ts` | Modifier | Exporter le schéma |
| `apps/agents/src/MonAgent.ts` | Créer | Classe principale |
| `apps/agents/src/registry/mon-agent.ts` | Créer (optionnel) | Configuration par défaut |
| `apps/agents/src/index.ts` | Modifier | Enregistrer dans le registry |
| `apps/api/src/services/agent-metadata.ts` | Modifier | Ajouter labels et catégories |

---

## Détails de Chaque Étape

### 1. Ajouter la Version

**Fichier** : `packages/types/src/agent-versions.ts`

```typescript
export const AGENT_VERSIONS = {
  FFA_SCRAPER_AGENT: '2.3.0',
  GOOGLE_SEARCH_DATE_AGENT: '1.1.0',
  AUTO_VALIDATOR_AGENT: '1.0.0',
  SLACK_EVENT_AGENT: '1.0.0',
  // ✅ Ajouter votre agent
  MON_AGENT: '1.0.0'
} as const
```

### 2. Créer le Schéma de Configuration

**Fichier** : `packages/types/src/agent-config-schemas/mon-agent.ts`

```typescript
import { ConfigSchema } from '../config.js'

export const MonAgentConfigSchema: ConfigSchema = {
  title: "Configuration Mon Agent",
  description: "Agent qui fait quelque chose d'utile",
  categories: [
    { id: "general", label: "Configuration générale" },
    { id: "performance", label: "Performance" }
  ],
  fields: [
    {
      name: "sourceDatabase",
      label: "Base de données",
      type: "select",
      category: "general",
      required: true,
      description: "Base de données Miles Republic à utiliser"
    },
    {
      name: "batchSize",
      label: "Taille des lots",
      type: "number",
      category: "performance",
      required: false,
      defaultValue: 10,
      description: "Nombre d'éléments à traiter par lot",
      validation: { min: 1, max: 100 }
    }
  ]
}
```

### 3. Exporter le Schéma

**Fichier** : `packages/types/src/agent-config-schemas/index.ts`

```typescript
// Ajouter l'export
export { MonAgentConfigSchema } from './mon-agent.js'

// Ajouter dans AGENT_CONFIG_SCHEMAS
import { MonAgentConfigSchema } from './mon-agent.js'

export const AGENT_CONFIG_SCHEMAS: Record<string, ConfigSchema> = {
  // ... autres agents
  MON_AGENT: MonAgentConfigSchema
}
```

### 4. Créer la Classe Agent

**Fichier** : `apps/agents/src/MonAgent.ts`

```typescript
import { AGENT_VERSIONS, MonAgentConfigSchema } from '@data-agents/types'
import { 
  BaseAgent, 
  AgentContext, 
  AgentRunResult, 
  ProposalData, 
  ProposalType, 
  AgentType 
} from '@data-agents/agent-framework'

// Export de la version pour compatibilité
export const MON_AGENT_VERSION = AGENT_VERSIONS.MON_AGENT

// Interface de configuration typée
interface MonAgentConfig {
  sourceDatabase: string
  batchSize: number
  // ... autres options
}

export class MonAgent extends BaseAgent {
  private sourceDb: any

  constructor(config: any, db?: any, logger?: any) {
    // Configuration de l'agent
    const agentConfig = {
      id: config.id || 'mon-agent',
      name: config.name || 'Mon Agent',
      description: `Description de l'agent (v${MON_AGENT_VERSION})`,
      type: 'EXTRACTOR' as AgentType, // EXTRACTOR, VALIDATOR, COMPARATOR, CLEANER
      frequency: config.frequency || '0 */12 * * *',
      isActive: config.isActive ?? true,
      config: {
        version: MON_AGENT_VERSION,
        sourceDatabase: config.sourceDatabase || config.config?.sourceDatabase,
        batchSize: config.batchSize || config.config?.batchSize || 10,
        configSchema: MonAgentConfigSchema
      }
    }

    super(agentConfig, db, logger)
  }

  /**
   * Méthode principale d'exécution
   * DOIT être implémentée par tout agent
   */
  async run(context: AgentContext): Promise<AgentRunResult> {
    const startTime = Date.now()
    const proposals: ProposalData[] = []
    const errors: string[] = []
    
    try {
      this.logger.info('Démarrage de l\'agent')
      
      // Récupérer la configuration
      const config = this.config.config as MonAgentConfig
      
      // Se connecter à la base source (Miles Republic)
      this.sourceDb = await this.connectToSource(config.sourceDatabase)
      
      // === LOGIQUE MÉTIER ICI ===
      
      // Exemple: créer une proposition
      // proposals.push({
      //   type: ProposalType.EDITION_UPDATE,
      //   eventId: '123',
      //   editionId: '456',
      //   changes: { startDate: new Date() },
      //   justification: [{ type: 'source', message: 'Trouvé via...', metadata: {} }]
      // })
      
      this.logger.info('Agent terminé avec succès')
      
      return {
        success: true,
        proposalsCreated: proposals.length,
        duration: Date.now() - startTime,
        metadata: {
          processedItems: 0,
          // ... autres stats
        }
      }
      
    } catch (error) {
      this.logger.error('Erreur dans l\'agent', { error })
      errors.push(error instanceof Error ? error.message : String(error))
      
      return {
        success: false,
        proposalsCreated: proposals.length,
        duration: Date.now() - startTime,
        error: errors.join(', ')
      }
    }
  }
}
```

### 5. (Optionnel) Créer le Fichier Registry

**Fichier** : `apps/agents/src/registry/mon-agent.ts`

```typescript
import { MonAgent } from '../MonAgent'
import { MonAgentConfigSchema } from '@data-agents/types'
import { agentRegistry } from '@data-agents/agent-framework'

const DEFAULT_CONFIG = {
  name: 'Mon Agent',
  description: 'Description courte de l\'agent',
  type: 'EXTRACTOR' as const,
  frequency: '0 */12 * * *',
  isActive: true,
  config: {
    agentType: 'MON_AGENT',
    sourceDatabase: null,
    batchSize: 10,
    configSchema: MonAgentConfigSchema
  }
}

agentRegistry.register('MON_AGENT', MonAgent)

export { MonAgent, DEFAULT_CONFIG }
```

### 6. Enregistrer dans le Registry

**Fichier** : `apps/agents/src/index.ts`

```typescript
import { agentRegistry } from '@data-agents/agent-framework'
import { FFAScraperAgent, FFA_SCRAPER_AGENT_VERSION } from './FFAScraperAgent'
// ... autres imports

// ✅ Ajouter l'import
import { MonAgent, MON_AGENT_VERSION } from './MonAgent'

// Register all available agents
agentRegistry.register('FFA_SCRAPER', FFAScraperAgent)
// ... autres registrations

// ✅ Ajouter l'enregistrement
agentRegistry.register('MON_AGENT', MonAgent)

// Export
export { MonAgent, MON_AGENT_VERSION }
```

### 7. Ajouter les Métadonnées API

**Fichier** : `apps/api/src/services/agent-metadata.ts`

Le schéma de configuration est automatiquement importé depuis `@data-agents/types` via `AGENT_CONFIG_SCHEMAS`. Il suffit d'ajouter les métadonnées et les labels.

#### 7.1 Ajouter les métadonnées

```typescript
function loadAgentMetadata(): Record<string, AgentMetadata> {
  return {
    // ... autres agents
    
    // ✅ Ajouter votre agent
    'mon-agent': {
      version: AGENT_VERSIONS.MON_AGENT,
      description: `Description détaillée de l'agent (v${AGENT_VERSIONS.MON_AGENT})`
    }
  }
}
```

#### 7.2 Ajouter dans les mappings

```typescript
// Dans agentTypeCategories
const agentTypeCategories: Record<string, 'EXTRACTOR' | 'VALIDATOR' | 'COMPARATOR' | 'CLEANER'> = {
  // ...
  MON_AGENT: 'EXTRACTOR'  // ✅ Ajouter
}

// Dans agentTypeLabels
const agentTypeLabels: Record<string, string> = {
  // ...
  MON_AGENT: 'Mon Agent'  // ✅ Ajouter
}
```

### 8. Vérifier le Build

```bash
# D'abord builder le package types (pour que les exports soient disponibles)
npm run build:types

# Ensuite vérifier le build complet
npm run tsc
```

---

## Exemple Complet

Voici l'exemple d'un agent simple qui vérifie les URLs des événements :

### Structure des fichiers

```
apps/agents/src/
├── UrlCheckerAgent.ts
├── UrlCheckerAgent.configSchema.ts
├── registry/
│   └── url-checker.ts
└── index.ts
```

### Code complet

<details>
<summary>UrlCheckerAgent.ts (cliquez pour développer)</summary>

```typescript
import { AGENT_VERSIONS } from '@data-agents/types'
import { BaseAgent, AgentContext, AgentRunResult, ProposalData, ProposalType, AgentType } from '@data-agents/agent-framework'
import { UrlCheckerAgentConfigSchema } from './UrlCheckerAgent.configSchema'

export const URL_CHECKER_AGENT_VERSION = AGENT_VERSIONS.URL_CHECKER_AGENT

interface UrlCheckerConfig {
  sourceDatabase: string
  batchSize: number
  timeout: number
}

export class UrlCheckerAgent extends BaseAgent {
  private sourceDb: any

  constructor(config: any, db?: any, logger?: any) {
    const agentConfig = {
      id: config.id || 'url-checker-agent',
      name: config.name || 'URL Checker Agent',
      description: `Vérifie les URLs des événements (v${URL_CHECKER_AGENT_VERSION})`,
      type: 'VALIDATOR' as AgentType,
      frequency: config.frequency || '0 2 * * *', // Tous les jours à 2h
      isActive: config.isActive ?? true,
      config: {
        version: URL_CHECKER_AGENT_VERSION,
        sourceDatabase: config.sourceDatabase || config.config?.sourceDatabase,
        batchSize: config.batchSize || config.config?.batchSize || 50,
        timeout: config.timeout || config.config?.timeout || 5000,
        configSchema: UrlCheckerAgentConfigSchema
      }
    }

    super(agentConfig, db, logger)
  }

  async run(context: AgentContext): Promise<AgentRunResult> {
    const startTime = Date.now()
    const proposals: ProposalData[] = []
    let checkedUrls = 0
    let brokenUrls = 0

    try {
      const config = this.config.config as UrlCheckerConfig
      this.sourceDb = await this.connectToSource(config.sourceDatabase)

      // Récupérer les éditions avec URLs
      const editions = await this.sourceDb.edition.findMany({
        where: {
          websiteUrl: { not: null }
        },
        take: config.batchSize,
        include: {
          event: { select: { name: true } }
        }
      })

      for (const edition of editions) {
        checkedUrls++
        
        try {
          const response = await fetch(edition.websiteUrl, {
            method: 'HEAD',
            signal: AbortSignal.timeout(config.timeout)
          })
          
          if (!response.ok) {
            brokenUrls++
            this.logger.warn(`URL cassée: ${edition.websiteUrl}`)
            
            // Créer une proposition pour signaler l'URL cassée
            proposals.push({
              type: ProposalType.EDITION_UPDATE,
              eventId: edition.eventId.toString(),
              editionId: edition.id.toString(),
              changes: {
                websiteUrl: null,
                _urlStatus: response.status
              },
              justification: [{
                type: 'url_check',
                message: `URL retourne ${response.status}`,
                metadata: { url: edition.websiteUrl, status: response.status }
              }]
            })
          }
        } catch (error) {
          brokenUrls++
          this.logger.warn(`URL inaccessible: ${edition.websiteUrl}`)
        }
      }

      // Sauvegarder les propositions
      const db = await this.getDb()
      for (const proposal of proposals) {
        await db.createProposal({
          agentId: this.config.id,
          ...proposal,
          confidence: 0.9
        })
      }

      return {
        success: true,
        proposalsCreated: proposals.length,
        duration: Date.now() - startTime,
        metadata: { checkedUrls, brokenUrls }
      }

    } catch (error) {
      return {
        success: false,
        proposalsCreated: proposals.length,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}
```

</details>

---

## Bonnes Pratiques

### 1. Gestion des Erreurs

```typescript
try {
  // Opération risquée
} catch (error) {
  this.logger.error('Description de l\'erreur', { 
    error: error instanceof Error ? error.message : String(error),
    context: { /* données utiles pour debug */ }
  })
  // Ne pas faire échouer tout l'agent pour une erreur mineure
}
```

### 2. Logging Structuré

```typescript
this.logger.info('Traitement en cours', { 
  processed: 50, 
  total: 100,
  currentItem: 'Trail des Monts'
})

this.logger.debug('Détails techniques', { /* données techniques */ })
this.logger.warn('Situation anormale mais non bloquante')
this.logger.error('Erreur critique', { error })
```

### 3. Gestion de l'État (pour les agents avec progression)

```typescript
import { AgentStateService, prisma } from '@data-agents/database'

// Dans le constructeur
this.stateService = new AgentStateService(prisma)

// Sauvegarder la progression
await this.stateService.setState(this.config.id, 'progress', {
  currentPage: 5,
  totalPages: 20,
  lastProcessedId: 'abc123'
})

// Récupérer la progression
const state = await this.stateService.getState<{ currentPage: number }>(
  this.config.id, 
  'progress'
)
```

### 4. Connexion à Miles Republic

```typescript
// Utiliser la méthode héritée de BaseAgent
this.sourceDb = await this.connectToSource(config.sourceDatabase)

// Accéder aux modèles (toujours en minuscule!)
const events = await this.sourceDb.event.findMany({ ... })
const editions = await this.sourceDb.edition.findMany({ ... })
const races = await this.sourceDb.race.findMany({ ... })
```

### 5. Création de Propositions

```typescript
const proposals: ProposalData[] = []

proposals.push({
  type: ProposalType.EDITION_UPDATE,  // ou NEW_EVENT, EVENT_UPDATE, RACE_UPDATE
  eventId: event.id.toString(),       // TOUJOURS convertir en string
  editionId: edition.id.toString(),
  changes: {
    startDate: new Date('2025-06-15'),
    websiteUrl: 'https://example.com'
  },
  justification: [{
    type: 'source_type',              // ffa, google, manual, etc.
    message: 'Description lisible',
    metadata: { /* données sources */ }
  }]
})

// Sauvegarder via le service db
const db = await this.getDb()
await db.createProposal({
  agentId: this.config.id,
  ...proposal,
  confidence: 0.85
})
```

---

## Troubleshooting

### L'agent n'apparaît pas dans l'UI de création

1. Vérifier que l'agent est enregistré dans `apps/agents/src/index.ts`
2. Vérifier que les métadonnées sont dans `apps/api/src/services/agent-metadata.ts`
3. Redémarrer l'API : le hot reload ne suffit pas toujours

### Erreur "Cannot read properties of undefined" sur sourceDb

```typescript
// ❌ Mauvais - utilise majuscule
await this.sourceDb.Event.findMany(...)

// ✅ Correct - utilise minuscule
await this.sourceDb.event.findMany(...)
```

### Erreur de validation Prisma sur les IDs

```typescript
// ❌ Mauvais - ID numérique de Miles Republic
await db.createProposal({ eventId: event.id, ... })

// ✅ Correct - convertir en string
await db.createProposal({ eventId: event.id.toString(), ... })
```

### Le schéma de config ne s'affiche pas correctement

1. Vérifier que le type de champ est valide : `text`, `number`, `password`, `select`, `textarea`, `switch`, `slider`, `database_select`
2. Vérifier que les catégories référencées existent
3. Inspecter la console du navigateur pour les erreurs

---

## Contrats Obligatoires

Cette section décrit les formats standardisés que **tous les agents DOIVENT respecter** pour la création de propositions.

### SourceMetadata

Chaque proposition **DOIT** inclure un `sourceMetadata` au format standardisé. Ce champ permet au dashboard d'afficher correctement les sources (URL, images, texte Slack, etc.).

```typescript
import { SourceMetadata, createSourceMetadata } from '@data-agents/database'

const proposal = {
  // ... autres champs
  sourceMetadata: createSourceMetadata('URL', {
    url: 'https://example.com/event',
    // Optionnel
    imageUrls: ['https://example.com/image.jpg'],
    rawText: 'Texte extrait de la page...',
    extra: {
      // Métadonnées spécifiques à la source
    }
  })
}

// Ou manuellement :
const sourceMetadata: SourceMetadata = {
  type: 'URL',  // 'URL' | 'IMAGE' | 'TEXT' | 'SLACK' | 'FFA' | 'GOOGLE'
  url: 'https://example.com/event',
  extractedAt: new Date().toISOString()
}
```

**Types de sources supportés :**

| Type | Description | Champs attendus |
|------|-------------|-----------------|
| `URL` | Page web scrapée | `url` |
| `IMAGE` | Image analysée | `imageUrls` |
| `TEXT` | Texte brut | `rawText` |
| `SLACK` | Message Slack | `extra.messageLink`, `extra.channelId` |
| `FFA` | Calendrier FFA | `url`, `extra.ffaId`, `extra.ligue` |
| `GOOGLE` | Recherche Google | `url`, `extra.searchQuery` |

### Justification avec rejectedMatches

Si le matching trouve des événements similaires mais **en dessous du seuil** (0.75), ils **DOIVENT** être inclus dans la justification avec le type `rejected_matches`.

Cela permet à l'utilisateur de voir la card "Événements similaires détectés" et de convertir manuellement la proposition NEW_EVENT en EDITION_UPDATE.

```typescript
import { 
  Justification, 
  RejectedMatch,
  createRejectedMatchesJustification,
  createUrlSourceJustification 
} from '@data-agents/database'

// Utiliser les helpers (recommandé)
const justifications: Justification[] = [
  createUrlSourceJustification('https://example.com/event'),
  createRejectedMatchesJustification([
    {
      eventId: 8821,
      eventName: 'La 7 vallées race',
      eventSlug: 'la-7-vallees-race-8821',
      eventCity: 'Hesdin',
      eventDepartment: '62',
      editionId: 49092,
      editionYear: '2026',
      matchScore: 0.748,
      nameScore: 0.88,
      cityScore: 0.99,
      departmentMatch: false,
      dateProximity: 0.98
    }
  ])
]

// Ou manuellement :
const justification: Justification = {
  type: 'rejected_matches',  // Type OBLIGATOIRE pour ce cas
  content: 'Top 3 événements similaires trouvés mais rejetés',
  metadata: {
    rejectedMatches: [
      {
        eventId: 8821,
        eventName: 'La 7 vallées race',
        eventSlug: 'la-7-vallees-race-8821',
        eventCity: 'Hesdin',
        eventDepartment: '62',
        editionId: 49092,
        editionYear: '2026',
        matchScore: 0.748,
        nameScore: 0.88,
        cityScore: 0.99,
        departmentMatch: false,
        dateProximity: 0.98
      }
    ]
  }
}
```

**Types de justification supportés :**

| Type | Description | Métadonnées attendues |
|------|-------------|----------------------|
| `url_source` | Source URL | `url` |
| `rejected_matches` | Événements similaires rejetés | `rejectedMatches[]` |
| `matching` | Résultat de matching | `matchType`, `matchedEventId`, etc. |
| `extraction` | Info extraction | `extractionMethod` |
| `validation` | Résultat validation | `validationRules`, `validationScore` |

### Exemple complet

```typescript
import { 
  SourceMetadata, 
  Justification,
  createSourceMetadata,
  createUrlSourceJustification,
  createRejectedMatchesJustification
} from '@data-agents/database'

// Dans votre agent, après le matching
const proposal = {
  type: ProposalType.NEW_EVENT,
  eventName: '7 Vallées Race',
  eventCity: 'Hesdin',
  editionYear: 2026,
  changes: {
    event: { name: '7 Vallées Race', city: 'Hesdin' },
    edition: { year: '2026', startDate: '2026-06-21' },
    races: [...]
  },
  
  // ✅ OBLIGATOIRE: sourceMetadata standardisé
  sourceMetadata: createSourceMetadata('URL', {
    url: 'https://www.finishers.com/course/7-vallees-race'
  }),
  
  // ✅ OBLIGATOIRE si matching rejeté: inclure les rejectedMatches
  justification: [
    createUrlSourceJustification('https://www.finishers.com/course/7-vallees-race'),
    createRejectedMatchesJustification(matchResult.rejectedMatches)
  ],
  
  confidence: 0.58
}
```

---

## Ressources

- [CLAUDE.md](../CLAUDE.md) - Règles du projet
- [BaseAgent source](../packages/agent-framework/src/base-agent.ts) - Classe de base
- [agent-metadata.ts](../apps/api/src/services/agent-metadata.ts) - Métadonnées centralisées
- [FFAScraperAgent](../apps/agents/src/FFAScraperAgent.ts) - Exemple complet d'agent
- [Types partagés](../packages/database/src/types/) - SourceMetadata, Justification
