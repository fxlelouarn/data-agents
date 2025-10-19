# 🤖 Architecture Détaillée des Agents

## Vue d'ensemble

Les agents du projet data-agents suivent une architecture en couches basée sur :
- **IAgent** (interface contrat)
- **BaseAgent** (classe abstraite)
- **Implémentations concrètes** (GoogleSearchDateAgent, FFAScraperAgent, etc.)

---

## 1. Hiérarchie des Classes

```
┌─────────────────────────┐
│      IAgent             │  Interface Contrat
│   (interface TypeScript)│
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   BaseAgent             │  Classe Abstraite
│ (logique commune)       │
└────────────┬────────────┘
             │
      ┌──────┴──────────────┬─────────────────┐
      │                     │                 │
      ▼                     ▼                 ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ Google Search│   │ FFA Scraper  │   │ Web Scraper  │
│  Date Agent  │   │ Agent        │   │ Agent (base) │
└──────────────┘   └──────────────┘   └──────────────┘
```

### 1.1 Interface IAgent

**Fichier** : `packages/agent-framework/src/types.ts`

```typescript
export interface IAgent {
  readonly config: AgentConfig
  
  // Exécution principale
  run(context: AgentContext): Promise<AgentRunResult>
  
  // Validation de la configuration
  validate(): Promise<boolean>
  
  // Récupération du statut
  getStatus(): Promise<{
    healthy: boolean
    lastRun?: Date
    nextRun?: Date
    message?: string
  }>
}
```

**Contrat** : Toute classe implémentant `IAgent` doit fournir ces trois méthodes.

### 1.2 Classe BaseAgent

**Fichier** : `packages/agent-framework/src/base-agent.ts`

```typescript
export abstract class BaseAgent implements IAgent {
  // Configuration de l'agent
  readonly config: AgentConfig
  
  // Connexion à la base de données
  protected db: IDatabaseService | null = null
  
  // Logger de l'agent
  protected logger: AgentLogger

  constructor(
    config: AgentConfig,
    db?: IDatabaseService,
    logger?: AgentLogger
  )

  // Méthode abstraite à implémenter par les sous-classes
  abstract run(context: AgentContext): Promise<AgentRunResult>

  // Implémentations par défaut
  async validate(): Promise<boolean>
  async getStatus(): Promise<AgentStatus>

  // Méthodes utilitaires
  protected parseDate(dateStr: string, timezone?: string): Date | undefined
  protected extractNumber(text: string, unit?: string): number | undefined
  protected calculateSimilarity(text1: string, text2: string): number
  protected normalizeEventName(name: string): string
  protected extractYear(input: Date | string | number): number
  protected createProposal(...): Promise<void>
  protected getNextRunTime(): Date | undefined
}
```

---

## 2. Cycle de Vie d'un Agent

### 2.1 Phases d'Exécution

```
┌────────────────────────────────────┐
│ 1. INITIALIZATION                  │
│ - Charge config depuis BD          │
│ - Crée instance BaseAgent          │
│ - Initialise contexte              │
└──────────────┬─────────────────────┘
               │
               ▼
┌────────────────────────────────────┐
│ 2. VALIDATION                      │
│ - Valide config                    │
│ - Vérifie permissions              │
│ - Check API keys, connexions       │
└──────────────┬─────────────────────┘
               │
               ▼
┌────────────────────────────────────┐
│ 3. EXECUTION                       │
│ - Appel agent.run()                │
│ - Extraction/validation/nettoyage  │
│ - Création propositions            │
│ - Logs générés                     │
└──────────────┬─────────────────────┘
               │
               ▼
┌────────────────────────────────────┐
│ 4. PERSISTENCE                     │
│ - Sauvegarde propositions          │
│ - Sauvegarde logs                  │
│ - Crée AgentRun                    │
│ - Mise à jour métriques            │
└──────────────┬─────────────────────┘
               │
               ▼
┌────────────────────────────────────┐
│ 5. COMPLETION                      │
│ - Sauvegarder endTime              │
│ - Calculer durée totale            │
│ - Retourner résultat               │
└────────────────────────────────────┘
```

### 2.2 Contexte d'Exécution

```typescript
interface AgentContext {
  runId: string                    // UUID unique du run
  startedAt: Date                  // Timestamp démarrage
  logger: AgentLogger              // Logger pour logs
  config: Record<string, any>      // Config de l'agent
}
```

**Exemple** :
```typescript
const context: AgentContext = {
  runId: 'run-12345-abcde',
  startedAt: new Date(),
  logger: createLogger('GoogleSearchDateAgent', 'agent-123'),
  config: {
    batchSize: 10,
    googleApiKey: '...',
    sourceDatabase: 'db-miles-republic'
  }
}

const result = await agent.run(context)
```

### 2.3 Résultat d'Exécution

```typescript
interface AgentRunResult {
  success: boolean                 // Succès/Échec
  extractedData?: ExtractionResult[]  // Données extraites
  proposals?: ProposalData[]       // Propositions générées
  message?: string                 // Message informatif
  metrics?: Record<string, any>    // Métriques optionnelles
}
```

---

## 3. Exemple Concret : GoogleSearchDateAgent

### 3.1 Flux d'Exécution

```typescript
export class GoogleSearchDateAgent extends BaseAgent {
  async run(context: AgentContext): Promise<AgentRunResult> {
    const config = this.config.config as GoogleSearchDateConfig
    
    try {
      // 1. Initialiser connexion source
      await this.initializeSourceConnection(config)
      context.logger.info('✅ Connexion source initialisée')

      // 2. Récupérer événements TO_BE_CONFIRMED en batches
      const events = await this.getToBeConfirmedEvents(config.batchSize)
      context.logger.info(`📊 ${events.length} événements récupérés`)

      // 3. Traiter chaque événement
      const proposals: ProposalData[] = []
      for (const event of events) {
        // Vérifier cooldown
        const inCooldown = await this.isEventInCooldown(event.id, config.cooldownDays)
        if (inCooldown) continue

        // Recherche Google
        const searchResults = await this.performGoogleSearch(
          this.buildSearchQuery(event),
          config
        )

        // Extraire dates
        const dates = await this.extractDatesFromSnippets(searchResults, event)

        // Créer propositions
        const eventProposals = await this.createDateProposals(event, dates, searchResults)
        proposals.push(...eventProposals)

        // Marquer traité
        await this.markEventAsProcessed(event.id)
      }

      // 4. Sauvegarder propositions
      for (const proposal of proposals) {
        await this.createProposal(
          proposal.type,
          proposal.changes,
          proposal.justification,
          proposal.eventId,
          proposal.editionId,
          proposal.raceId,
          proposal.confidence
        )
      }

      return {
        success: true,
        proposals,
        message: `${events.length} événements traités, ${proposals.length} propositions créées`,
        metrics: {
          eventsProcessed: events.length,
          proposalsCreated: proposals.length
        }
      }
    } catch (error) {
      context.logger.error('Erreur exécution agent:', { error: String(error) })
      return {
        success: false,
        message: `Erreur: ${error}`
      }
    }
  }
}
```

### 3.2 Méthodes Spécialisées

```typescript
// 1. Initialisation connexion
private async initializeSourceConnection(config: GoogleSearchDateConfig)

// 2. Récupération événements
private async getToBeConfirmedEvents(
  batchSize: number,
  offset: number = 0
): Promise<NextProdEvent[]>

// 3. Construction requête
private buildSearchQuery(event: NextProdEvent): string

// 4. Recherche Google
private async performGoogleSearch(
  query: string,
  config: GoogleSearchDateConfig
): Promise<GoogleSearchResult | null>

// 5. Extraction dates
private async extractDatesFromSnippets(
  searchResults: GoogleSearchResult,
  event: NextProdEvent
): Promise<ExtractedDate[]>

// 6. Création propositions
private async createDateProposals(
  event: NextProdEvent,
  extractedDates: ExtractedDate[],
  searchResults: GoogleSearchResult
): Promise<ProposalData[]>

// 7. Gestion cooldown
private async isEventInCooldown(
  eventId: string,
  cooldownDays: number
): Promise<boolean>

// 8. Marquage traité
private async markEventAsProcessed(eventId: string): Promise<void>
```

---

## 4. Validation des Agents

### 4.1 Validation Automatique

La méthode `validate()` effectue des vérifications :

```typescript
async validate(): Promise<boolean> {
  // Validation base
  if (!this.config.name || !this.config.type || !this.config.frequency) {
    return false
  }
  
  // Validation cron expression
  const cronRegex = /^(\*|[0-5]?\d) (\*|[01]?\d|2[0-3]) (\*|[012]?\d|3[01]) (\*|[0-9]|1[012]|JAN|...) (\*|[0-7]|SUN|...)/
  if (!cronRegex.test(this.config.frequency)) {
    return false
  }
  
  return true
}
```

### 4.2 Validation Spécialisée

Pour Google Search Date Agent :

```typescript
async validate(): Promise<boolean> {
  const baseValid = await super.validate()
  if (!baseValid) return false

  const config = this.config.config as GoogleSearchDateConfig
  
  // Vérifier paramètres requis
  if (!config.batchSize || config.batchSize <= 0) {
    this.logger.error('batchSize doit être un nombre positif')
    return false
  }

  // Vérifier base de données source
  try {
    const sourceDbId = config.sourceDatabase
    const available = await this.dbManager.getAvailableDatabases()
    
    if (!available.find(db => db.id === sourceDbId)) {
      this.logger.error(`Base de données source non disponible: ${sourceDbId}`)
      return false
    }
    
    // Test de connexion
    const testResult = await this.dbManager.testConnection(sourceDbId)
    if (!testResult) {
      this.logger.error(`Test de connexion échoué pour: ${sourceDbId}`)
      return false
    }
  } catch (error) {
    this.logger.error('Impossible de se connecter', { error: String(error) })
    return false
  }

  return true
}
```

---

## 5. Gestion des Erreurs

### 5.1 Stratégie d'Erreur

```
┌──────────────────────────┐
│ Erreur lors du run       │
└──────────────┬───────────┘
               │
               ▼
     ┌─────────────────────┐
     │ Sauvegarder erreur  │
     │ dans AgentRun       │
     └─────────────────────┘
               │
               ▼
     ┌─────────────────────┐
     │ Incrémenter compteur│
     │ erreurs consécutives│
     └─────────────────────┘
               │
               ▼
    ┌──────────────────────┐
    │ Vérifier seuil       │
    │ (défaut: 3 erreurs)  │
    └───────────┬──────────┘
                │
        ┌───────┴──────────┐
        │                  │
   < seuil          >= seuil
        │                  │
        │                  ▼
        │         ┌────────────────────┐
        │         │ AUTO-DÉSACTIVER    │
        │         │ l'agent            │
        │         └────────────────────┘
        │
        ▼
   Continue normal
```

### 5.2 Gestion d'Exception

```typescript
try {
  const results = await this.extractData()
  // Traiter résultats
} catch (error) {
  // 1. Logger l'erreur avec contexte
  this.logger.error('Erreur extraction données:', {
    error: String(error),
    stack: error.stack,
    eventId: event.id
  })
  
  // 2. Retourner résultat d'erreur
  return {
    success: false,
    message: `Erreur: ${error.message}`
  }
  
  // 3. API capture et incrémente compteur
}
```

---

## 6. État Persistant de l'Agent

### 6.1 Utilisation du StateService

Pour la **pagination** (offset dans GoogleSearchDateAgent) :

```typescript
// Récupérer l'offset persistant
const offset = await this.stateService.getState<number>(this.config.id, 'offset') || 0

// Traiter batch
const events = await this.getToBeConfirmedEvents(batchSize, offset)

// Mettre à jour offset pour le prochain run
const newOffset = offset + events.length
await this.stateService.setState(this.config.id, 'offset', newOffset)
```

Pour le **cooldown** (GoogleSearchDateAgent) :

```typescript
// Récupérer dernier traitement
const lastProcessedTimestamp = await this.stateService.getState<number>(
  this.config.id,
  `lastProcessed_${eventId}`
)

// Calculer si en cooldown
const daysDiff = Math.floor((now.getTime() - lastProcessedDate.getTime()) / (1000 * 60 * 60 * 24))
const inCooldown = daysDiff < cooldownDays

// Marquer comme traité
await this.stateService.setState(
  this.config.id,
  `lastProcessed_${eventId}`,
  Date.now()
)
```

---

## 7. Méthodes Utilitaires du BaseAgent

### 7.1 Parsing de Dates

```typescript
protected parseDate(dateStr: string, timezone?: string): Date | undefined {
  // Essaie plusieurs formats
  const formats = [
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})/,      // MM/DD/YYYY ou DD/MM/YYYY
    /^(\d{4})-(\d{1,2})-(\d{1,2})/,        // YYYY-MM-DD
    /^(\d{1,2})-(\d{1,2})-(\d{4})/,        // DD-MM-YYYY ou MM-DD-YYYY
  ]
  
  for (const format of formats) {
    const match = dateStr.match(format)
    if (match) {
      // Parser et valider
      return parsedDate
    }
  }
  
  // Fallback: essai native Date parsing
  const parsed = new Date(dateStr)
  return isNaN(parsed.getTime()) ? undefined : parsed
}
```

### 7.2 Extraction de Nombres

```typescript
protected extractNumber(text: string, unit?: string): number | undefined {
  try {
    // Nettoyer symboles/unités
    let cleaned = text.replace(/[€$£,\s]/g, '')
    
    if (unit) {
      cleaned = cleaned.replace(new RegExp(unit, 'gi'), '')
    }

    // Extraire nombre
    const match = cleaned.match(/(\d+(?:\.\d+)?)/)
    return match ? parseFloat(match[1]) : undefined
  } catch {
    return undefined
  }
}
```

### 7.3 Calcul Similarité

```typescript
protected calculateSimilarity(text1: string, text2: string): number {
  // Utilise string-similarity library
  const stringSimilarity = require('string-similarity')
  return stringSimilarity.compareTwoStrings(
    text1.toLowerCase(),
    text2.toLowerCase()
  )
  // Retourne [0-1]
}
```

---

## 8. Patterns d'Implémentation

### 8.1 Pattern Template Method

```typescript
// BaseAgent définit le template
abstract class BaseAgent {
  async run(context: AgentContext): Promise<AgentRunResult> {
    // Chaque sous-classe implémente sa logique
  }
  
  // Méthodes communes
  async validate(): Promise<boolean> { ... }
}

// Sous-classe implémente
class GoogleSearchDateAgent extends BaseAgent {
  async run(context: AgentContext): Promise<AgentRunResult> {
    // Logique spécifique Google Search
  }
}
```

### 8.2 Pattern Strategy

Différentes **stratégies d'extraction** :
- **GoogleSearchDateAgent** : Extraction via snippets Google
- **FFAScraperAgent** : Extraction via parsing HTML FFA
- **WebScraperAgent** : Extraction générique avec Playwright

Chacune implémente sa propre logique d'extraction.

### 8.3 Pattern Builder

Construction des propositions :

```typescript
class ProposalBuilder {
  private proposal: ProposalData = {}
  
  withType(type: ProposalType) { ... }
  withEventId(id: string) { ... }
  withChanges(changes) { ... }
  withJustification(justification) { ... }
  
  build(): ProposalData {
    return this.proposal
  }
}
```

---

## Voir aussi

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Vue d'ensemble
- [AGENT-REGISTRY.md](./AGENT-REGISTRY.md) - Enregistrement agents
- [DATABASE-MANAGER.md](./DATABASE-MANAGER.md) - Gestion connexions BD
- [CONFIGURATION-SYSTEM.md](./CONFIGURATION-SYSTEM.md) - Configuration agents
