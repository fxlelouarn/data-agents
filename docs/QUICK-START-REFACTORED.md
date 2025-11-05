# ⚡ Quick Start - Agent Framework Refactorisé

**Guide rapide** pour utiliser la nouvelle architecture après refactoring Phases 1 & 2.

---

## 🎯 En Bref

**Ce qui a changé** :
- ✅ Code de connexion simplifié (1 ligne au lieu de 50)
- ✅ Modules bien séparés (Strategy, Factory patterns)
- ✅ Tests complets (28 tests unitaires)
- ✅ Zero duplication

**Ce qui n'a PAS changé** :
- ✅ API publique identique (rétrocompatible à 100%)
- ✅ Agents existants fonctionnent sans modification

---

## 🚀 Créer un Nouvel Agent (Méthode Simple)

### Template Minimal

```typescript
import { BaseAgent } from '@agent-framework'

export class MonAgent extends BaseAgent {
  constructor(config: any) {
    super({
      name: 'MonAgent',
      type: 'scraper', // ou 'api', 'etl', etc.
      ...config
    })
  }

  async execute() {
    // 1. Connexion automatique (1 ligne)
    const sourceDb = await this.initSourceConnection()
    
    // 2. Votre logique métier
    const data = await sourceDb.myTable.findMany({
      where: { status: 'active' }
    })
    
    // 3. Traiter les données
    for (const item of data) {
      await this.processItem(item)
    }
    
    // 4. Pas besoin de fermer (automatique)
  }
  
  private async processItem(item: any) {
    // Votre traitement ici
    this.logger.info(`Processing ${item.id}`)
  }
}
```

**C'est tout !** Pas de gestion de connexion manuelle. ✅

---

## 🔌 Connexions Multiples

### Connecter à la Source ET à Miles Republic

```typescript
async execute() {
  // Source externe (FFA, etc.)
  const sourceDb = await this.initSourceConnection()
  
  // Miles Republic (destination)
  const milesDb = await this.getDatabaseConnection()
  
  // Copier les données
  const events = await sourceDb.event.findMany()
  
  for (const event of events) {
    await milesDb.externalEvent.upsert({
      where: { externalId: event.id },
      create: { ...event },
      update: { ...event }
    })
  }
}
```

---

## 🗄️ Ajouter un Nouveau Type de Base de Données

### Exemple : Ajouter Support Redis

**Étape 1** : Créer la stratégie

```typescript
// packages/agent-framework/src/database/strategies.ts

import { DatabaseStrategy } from './strategies'
import { DatabaseConfig } from '../database-manager'
import { AgentLogger } from '../types'

export class RedisStrategy implements DatabaseStrategy {
  async createConnection(config: DatabaseConfig, logger: AgentLogger): Promise<any> {
    const { createClient } = await import('redis')
    
    const client = createClient({
      url: `redis://${config.username}:${config.password}@${config.host}:${config.port}`
    })
    
    await client.connect()
    logger.info(`Redis connected: ${config.name}`)
    
    return client
  }

  async testConnection(connection: any): Promise<boolean> {
    try {
      await connection.ping()
      return true
    } catch {
      return false
    }
  }

  async closeConnection(connection: any): Promise<void> {
    await connection.quit()
  }
}
```

**Étape 2** : Enregistrer dans la Factory

```typescript
// packages/agent-framework/src/database/factory.ts

import { RedisStrategy } from './strategies'

export class DatabaseStrategyFactory {
  private static strategies = new Map<string, DatabaseStrategy>([
    ['postgresql', new PostgresStrategy()],
    ['mysql', new MySQLStrategy()],
    ['mongodb', new MongoDBStrategy()],
    ['miles-republic', new MilesRepublicStrategy()],
    ['redis', new RedisStrategy()], // ✅ Ajouté
  ])
  
  // ... reste du code
}
```

**Étape 3** : Utiliser

```typescript
const config: DatabaseConfig = {
  id: 'my-redis',
  name: 'Redis Cache',
  type: 'redis', // ✅ Nouveau type
  host: 'localhost',
  port: 6379,
  // ...
}

const connection = await dbManager.getConnection('my-redis')
await connection.set('key', 'value')
```

---

## 🧪 Tests

### Tester votre Agent

```typescript
// apps/agents/src/__tests__/MonAgent.test.ts

import { describe, it, expect } from 'vitest'
import { MonAgent } from '../MonAgent'
import { DatabaseManager } from '@agent-framework'

describe('MonAgent', () => {
  it('devrait se connecter et traiter les données', async () => {
    // Arrange
    DatabaseManager.resetInstance()
    
    const mockConfig = {
      sourceDatabase: { id: 'test-db', type: 'postgresql', /* ... */ }
    }
    
    const agent = new MonAgent(mockConfig)
    
    // Act
    await agent.run()
    
    // Assert
    expect(agent.status).toBe('completed')
  })
})
```

### Lancer les Tests

```bash
# Tous les tests
npm test

# Tests d'un agent spécifique
npm test -- MonAgent.test.ts

# Mode watch
npm test -- --watch
```

---

## 📦 Structure des Fichiers

```
data-agents/
├── packages/
│   └── agent-framework/
│       ├── src/
│       │   ├── base-agent.ts           # ✅ Classe de base
│       │   ├── connection-manager.ts   # ✅ Gestion connexions (Phase 1)
│       │   ├── database-manager.ts     # ✅ Refactorisé (Phase 2)
│       │   ├── database/
│       │   │   ├── config-loader.ts    # ✅ Chargement configs
│       │   │   ├── strategies.ts       # ✅ Stratégies DB
│       │   │   └── factory.ts          # ✅ Factory
│       │   ├── logger.ts
│       │   ├── types.ts
│       │   └── index.ts                # Exports publics
│       └── __tests__/
│           ├── connection-manager.test.ts
│           └── database-strategies.test.ts
│
└── apps/
    └── agents/
        ├── src/
        │   ├── MonAgent.ts             # Votre agent
        │   ├── GoogleSearchDateAgent.ts # ✅ Refactorisé
        │   └── FFAScraperAgent.ts      # ✅ Refactorisé
        └── __tests__/
            └── MonAgent.test.ts
```

---

## 🔧 Configuration

### Variables d'Environnement

```bash
# .env
DATABASE_URL=postgresql://user:pass@localhost:5432/miles_republic
```

### Configuration Agent

```typescript
const config = {
  // Connexion source (optionnelle)
  sourceDatabase: {
    id: 'ffa-db',
    name: 'FFA Database',
    type: 'postgresql',
    host: 'ffa.example.com',
    port: 5432,
    database: 'ffa',
    username: 'user',
    password: 'secret',
    ssl: true,
    isActive: true,
    isDefault: false
  },
  
  // Options agent
  runMode: 'once', // ou 'schedule'
  schedule: '0 2 * * *', // Cron (si schedule)
  
  // Votre config custom
  myCustomOption: 'value'
}
```

---

## 🐛 Debugging

### Activer Logs Détaillés

```typescript
// Dans votre agent
this.logger.setLevel('debug') // 'debug' | 'info' | 'warn' | 'error'

// Exemple
this.logger.debug('Détail technique', { data: someObject })
this.logger.info('Info importante')
this.logger.warn('Attention', { reason: 'xyz' })
this.logger.error('Erreur critique', { error: err })
```

### Inspecter Connexions

```typescript
async execute() {
  const connManager = ConnectionManager.getInstance(this.logger)
  
  // Voir toutes les connexions actives
  const sources = connManager.getActiveSources()
  this.logger.info(`${sources.length} source(s) active(s)`)
  
  // Tester une connexion spécifique
  const isOk = await connManager.testConnection('my-source')
  this.logger.info(`Connexion OK: ${isOk}`)
}
```

---

## 🚨 Erreurs Courantes

### 1. "Cannot find module '@agent-framework'"

**Cause** : Package non buildé

```bash
cd packages/agent-framework
npm run build
```

### 2. "Source database not configured"

**Cause** : Configuration manquante dans l'agent

```typescript
// Vérifier que sourceDatabase est défini
constructor(config: any) {
  super({
    name: 'MonAgent',
    sourceDatabase: config.sourceDatabase, // ✅ Important
    ...config
  })
}
```

### 3. "Prisma client not generated"

**Cause** : Client Prisma manquant

```bash
cd apps/agents
npx prisma generate
```

---

## 📚 Documentation Complète

| Doc | Quand l'utiliser |
|-----|------------------|
| [`QUICK-START-REFACTORED.md`](./QUICK-START-REFACTORED.md) | ⚡ Démarrer rapidement |
| [`REFACTORING-SUMMARY.md`](./REFACTORING-SUMMARY.md) | 📊 Vue d'ensemble changements |
| [`REFACTORING-PHASE1-COMPLETE.md`](./REFACTORING-PHASE1-COMPLETE.md) | 🔍 Détails Phase 1 |
| [`REFACTORING-PHASE2-COMPLETE.md`](./REFACTORING-PHASE2-COMPLETE.md) | 🔍 Détails Phase 2 |
| [`REFACTORING-RECOMMENDATIONS.md`](./REFACTORING-RECOMMENDATIONS.md) | 🎯 Analyse initiale |

---

## 💡 Bonnes Pratiques

### ✅ À Faire

```typescript
// 1. Utiliser initSourceConnection() pour source externe
const sourceDb = await this.initSourceConnection()

// 2. Utiliser getDatabaseConnection() pour Miles Republic
const milesDb = await this.getDatabaseConnection()

// 3. Logger les étapes importantes
this.logger.info('Début traitement', { count: events.length })

// 4. Gérer les erreurs
try {
  await this.processData()
} catch (error) {
  this.logger.error('Erreur traitement', { error: String(error) })
  throw error
}
```

### ❌ À Éviter

```typescript
// ❌ Ne pas créer de connexions manuelles
const prisma = new PrismaClient() // NON !

// ❌ Ne pas oublier de fermer les connexions externes
// (mais avec le nouveau framework, c'est automatique ✅)

// ❌ Ne pas dupliquer la logique de connexion
// Utiliser les méthodes du framework
```

---

## 🎓 Exemples Complets

### Agent Simple (Lecture)

```typescript
export class SimpleReaderAgent extends BaseAgent {
  async execute() {
    const db = await this.initSourceConnection()
    
    const records = await db.myTable.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' }
    })
    
    this.logger.info(`Trouvé ${records.length} enregistrements`)
    
    for (const record of records) {
      this.logger.debug(`Record: ${record.id}`)
    }
  }
}
```

### Agent ETL (Extract-Transform-Load)

```typescript
export class ETLAgent extends BaseAgent {
  async execute() {
    // Extract
    const sourceDb = await this.initSourceConnection()
    const sourceData = await sourceDb.externalData.findMany()
    
    // Transform
    const transformed = sourceData.map(item => ({
      id: item.external_id,
      name: item.nom.toUpperCase(),
      date: new Date(item.date_evt)
    }))
    
    // Load
    const milesDb = await this.getDatabaseConnection()
    await milesDb.event.createMany({
      data: transformed,
      skipDuplicates: true
    })
    
    this.logger.info(`${transformed.length} événements synchronisés`)
  }
}
```

---

## 🆘 Support

**Problème ?** Consultez :
1. Cette documentation
2. Les tests existants (`__tests__/`)
3. Les agents de référence (GoogleSearchDateAgent, FFAScraperAgent)
4. L'équipe de développement

---

*Happy coding! 🚀*
