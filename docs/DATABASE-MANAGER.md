# 🗄️ DatabaseManager - Gestion des Connexions aux Bases de Données

## Vue d'ensemble

Le **DatabaseManager** est responsable de la **gestion centralisée des connexions** aux bases de données source (Miles Republic, FFA, etc.). Il fournit une interface uniforme pour accéder à plusieurs types de bases de données.

---

## 1. Architecture du DatabaseManager

### 1.1 Classe DatabaseManager

**Fichier** : `packages/agent-framework/src/database-manager.ts`

```typescript
export class DatabaseManager {
  private connections = new Map<string, any>()        // Pool connexions actives
  private configs = new Map<string, DatabaseConfig>() // Configurations chargées
  private logger: AgentLogger
  private configsLoaded = false

  constructor(logger: AgentLogger)

  // Charger configurations depuis BD
  private async loadConfigurations(): Promise<void>

  // Obtenir une connexion
  async getConnection(databaseId: string): Promise<any>

  // Créer une nouvelle connexion
  private async createConnection(config: DatabaseConfig): Promise<any>

  // Lister bases disponibles
  async getAvailableDatabases(): Promise<DatabaseConfig[]>

  // Récupérer base par défaut
  getDefaultDatabase(): DatabaseConfig | null

  // Tester une connexion
  async testConnection(databaseId: string): Promise<boolean>

  // Fermer toutes connexions
  async closeAllConnections(): Promise<void>

  // Ajouter/modifier configuration
  addOrUpdateConfig(config: DatabaseConfig): void

  // Supprimer configuration
  removeConfig(databaseId: string): void

  // Ajouter configurations de test
  addTestConfigs(testConfigs: DatabaseConfig[]): void
}
```

### 1.2 Configuration de Base de Données

```typescript
export interface DatabaseConfig {
  id: string                      // UUID unique
  name: string                    // Nom convivial
  type: 'postgresql' | 'mysql' | 'mongodb' | 'medusa'  // Type BD
  host: string                    // Serveur
  port: number                    // Port connexion
  database: string                // Nom BD
  username: string                // Utilisateur
  password: string                // Mot de passe
  ssl: boolean                    // Utiliser SSL
  isDefault: boolean              // Base par défaut
  isActive: boolean               // Connexion active
  description?: string            // Description
  connectionString?: string       // URL connexion complète (optionnel)
}
```

---

## 2. Flux de Chargement des Configurations

### 2.1 Initialisation Lazy

```
┌──────────────────────────────────────┐
│ Nouveau DatabaseManager              │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ Configurations non chargées           │
│ (lazy loading)                        │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ Premier appel à getConnection()       │
│ ou getAvailableDatabases()           │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ Trigger loadConfigurations()          │
│ Lire DatabaseConnection table        │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ Mapper configurations Prisma         │
│ Stock dans Map interne               │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ Marquer configsLoaded = true         │
│ Prêt à utiliser                      │
└──────────────────────────────────────┘
```

### 2.2 Chargement depuis BD

```typescript
private async loadDatabaseConfigurations() {
  try {
    // Créer client Prisma temporaire
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL
        }
      }
    })

    await prisma.$connect()
    
    // Récupérer toutes les connexions actives
    const dbConnections = await prisma.databaseConnection.findMany({
      where: {
        isActive: true
      }
    })

    // Mapper chaque connexion
    for (const dbConn of dbConnections) {
      const config: DatabaseConfig = {
        id: dbConn.id,
        name: dbConn.name,
        type: this.mapDatabaseType(dbConn.type),
        // ... autres champs
      }
      
      this.configs.set(config.id, config)
    }

    await prisma.$disconnect()
  } catch (error) {
    this.logger.warn('Impossible de charger configs BD', { error })
  }
}
```

---

## 3. Gestion des Connexions

### 3.1 Obtenir une Connexion

```typescript
async getConnection(databaseId: string): Promise<any> {
  try {
    // S'assurer configs chargées
    if (!this.configsLoaded) {
      await this.loadConfigurations()
      this.configsLoaded = true
    }

    // Vérifier connexion en pool
    if (this.connections.has(databaseId)) {
      return this.connections.get(databaseId)
    }

    // Récupérer configuration
    const config = this.configs.get(databaseId)
    if (!config) {
      throw new Error(`Config DB non trouvée: ${databaseId}`)
    }

    if (!config.isActive) {
      throw new Error(`Base inactive: ${config.name}`)
    }

    // Créer nouvelle connexion
    const connection = await this.createConnection(config)
    this.connections.set(databaseId, connection)

    this.logger.info(`Connexion établie: ${config.name}`)
    return connection

  } catch (error) {
    this.logger.error(`Erreur connexion ${databaseId}`, { error })
    throw error
  }
}
```

### 3.2 Créer une Connexion

```typescript
private async createConnection(config: DatabaseConfig): Promise<any> {
  const { PrismaClient } = await import('@prisma/client')
  
  try {
    let connectionUrl: string

    // Utiliser URL fournie ou la construire
    if (config.connectionString) {
      connectionUrl = config.connectionString
    } else {
      const protocol = config.type === 'postgresql' ? 'postgresql' : 'mysql'
      const sslParam = config.ssl ? '?ssl=true' : ''
      connectionUrl = `${protocol}://${config.username}:${config.password}@${config.host}:${config.port}/${config.database}${sslParam}`
    }

    // Créer client Prisma
    const client = new PrismaClient({
      datasources: {
        db: {
          url: connectionUrl
        }
      }
    })

    // Tester connexion
    await client.$connect()
    
    return client

  } catch (error) {
    this.logger.error(`Création connexion échouée pour ${config.name}`, { error })
    throw error
  }
}
```

### 3.3 Pool de Connexions

Le DatabaseManager maintient un **pool de connexions**:

```
┌─────────────────────────────────────┐
│  Connexions Actives (Map)           │
├─────────────────────────────────────┤
│ db-miles-republic -> PrismaClient   │
│ db-ffa -> PrismaClient              │
│ db-external-api -> PrismaClient     │
└─────────────────────────────────────┘
        ▲
        │ getConnection(id)
        │ returns existing or creates new
        │
     Agents
```

**Avantages**:
- ✅ Réutilisation de connexions
- ✅ Moins d'overhead réseau
- ✅ Gestion centralisée

---

## 4. Utilisation dans les Agents

### 4.1 Accès depuis un Agent

```typescript
export class GoogleSearchDateAgent extends BaseAgent {
  private dbManager: DatabaseManager
  private sourceDb: any

  constructor(config: any, db?: any, logger?: any) {
    super(config, db, logger)
    this.dbManager = new DatabaseManager(this.logger)
  }

  async run(context: AgentContext): Promise<AgentRunResult> {
    const config = this.config.config as GoogleSearchDateConfig
    
    try {
      // Initialiser connexion source
      await this.initializeSourceConnection(config)

      // Utiliser la connexion
      const events = await this.sourceDb.Event.findMany({
        where: { /* ... */ }
      })

      // ...
    } catch (error) {
      // ...
    }
  }

  private async initializeSourceConnection(config: GoogleSearchDateConfig) {
    try {
      // Récupérer connexion via DatabaseManager
      this.sourceDb = await this.dbManager.getConnection(config.sourceDatabase)
      
      this.logger.info(`✅ Connexion établie: ${config.sourceDatabase}`)
    } catch (error) {
      this.logger.error('Erreur connexion source', { error })
      throw error
    }
  }
}
```

### 4.2 Validation d'Agent avec BD

```typescript
async validate(): Promise<boolean> {
  // ... validation base ...

  const config = this.config.config as GoogleSearchDateConfig
  
  // Vérifier la base source
  try {
    const sourceDbId = config.sourceDatabase
    const available = await this.dbManager.getAvailableDatabases()
    
    if (!available.find(db => db.id === sourceDbId)) {
      this.logger.error(`Base source non disponible: ${sourceDbId}`)
      return false
    }
    
    // Test de connexion
    const testResult = await this.dbManager.testConnection(sourceDbId)
    if (!testResult) {
      this.logger.error(`Test connexion échoué: ${sourceDbId}`)
      return false
    }
    
  } catch (error) {
    this.logger.error('Impossible de valider connexion', { error })
    return false
  }

  return true
}
```

---

## 5. Test de Connexion

### 5.1 Endpoint API

```typescript
// POST /api/databases/:id/test
router.post('/:id/test', async (req, res) => {
  try {
    const dbManager = new DatabaseManager(logger)
    const success = await dbManager.testConnection(req.params.id)
    
    res.json({
      success,
      message: success ? 'Connection OK' : 'Connection failed'
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})
```

### 5.2 Implémentation du Test

```typescript
async testConnection(databaseId: string): Promise<boolean> {
  try {
    // S'assurer configs chargées
    if (!this.configsLoaded) {
      await this.loadConfigurations()
      this.configsLoaded = true
    }

    // Récupérer config
    const config = this.configs.get(databaseId)
    if (!config) {
      throw new Error(`Config non trouvée: ${databaseId}`)
    }

    // Créer connexion test
    const connection = await this.createConnection(config)
    
    // Essayer une simple requête
    await connection.$queryRaw`SELECT 1`
    
    // Fermer
    await connection.$disconnect()

    this.logger.info(`Test réussi: ${config.name}`)
    return true

  } catch (error) {
    this.logger.error(`Test échoué pour ${databaseId}`, { error })
    return false
  }
}
```

---

## 6. Types de Bases de Données Supportées

### 6.1 Mapping des Types

```typescript
private mapDatabaseType(prismaType: any): DatabaseType {
  switch (prismaType) {
    case 'POSTGRESQL': return 'postgresql'
    case 'MYSQL': return 'mysql'
    case 'MONGODB': return 'mongodb'
    case 'MILES_REPUBLIC': return 'medusa'
    case 'EXTERNAL_API': return 'postgresql'  // Fallback
    case 'SQLITE': return 'postgresql'        // Fallback
    default: return 'postgresql'
  }
}
```

### 6.2 Exemples de Configuration

**PostgreSQL**:
```json
{
  "id": "db-miles-republic",
  "name": "Miles Republic Production",
  "type": "postgresql",
  "host": "prod-db.example.com",
  "port": 5432,
  "database": "miles_republic",
  "username": "app_user",
  "password": "secure_password",
  "ssl": true,
  "isActive": true
}
```

**MySQL**:
```json
{
  "id": "db-ffa",
  "name": "FFA Calendar",
  "type": "mysql",
  "host": "ffa-server.org",
  "port": 3306,
  "database": "ffa_events",
  "username": "ffa_reader",
  "password": "ffa_pass",
  "ssl": false,
  "isActive": true
}
```

**Connection String complète**:
```json
{
  "id": "db-external",
  "name": "External Service",
  "type": "postgresql",
  "connectionString": "postgresql://user:pass@host:5432/db?ssl=true",
  "isActive": true
}
```

---

## 7. Gestion de l'État des Bases de Données

### 7.1 Ajouter/Modifier Configuration

```typescript
addOrUpdateConfig(config: DatabaseConfig): void {
  this.configs.set(config.id, config)
  
  // Fermer connexion existante
  if (this.connections.has(config.id)) {
    const connection = this.connections.get(config.id)
    connection.$disconnect().catch(() => {})
    this.connections.delete(config.id)
  }
}
```

### 7.2 Supprimer Configuration

```typescript
removeConfig(databaseId: string): void {
  // Fermer connexion
  if (this.connections.has(databaseId)) {
    const connection = this.connections.get(databaseId)
    connection.$disconnect().catch(() => {})
    this.connections.delete(databaseId)
  }
  
  // Supprimer config
  this.configs.delete(databaseId)
}
```

### 7.3 Fermer Toutes Connexions

```typescript
async closeAllConnections(): Promise<void> {
  for (const [id, connection] of this.connections.entries()) {
    try {
      await connection.$disconnect()
      this.logger.info(`Connexion fermée: ${id}`)
    } catch (error) {
      this.logger.error(`Erreur fermeture ${id}`, { error })
    }
  }
  this.connections.clear()
}
```

---

## 8. Configurations de Test

### 8.1 Ajouter Configs de Test

Utile pour l'environnement de test :

```typescript
addTestConfigs(testConfigs: DatabaseConfig[]): void {
  for (const config of testConfigs) {
    this.configs.set(config.id, config)
  }
  this.logger.info(`Ajout de ${testConfigs.length} configs de test`)
}
```

### 8.2 Exemple Utilisazione en Test

```typescript
// test-environment/utils/mock-context.js

const dbManager = new DatabaseManager(logger)

const testConfigs = [
  {
    id: 'test-miles-republic',
    name: 'Test Miles Republic',
    type: 'postgresql',
    host: 'localhost',
    port: 5432,
    database: 'test_miles',
    username: 'test_user',
    password: 'test_pass',
    ssl: false,
    isActive: true,
    isDefault: true
  }
]

dbManager.addTestConfigs(testConfigs)

// Utiliser comme en production
const connection = await dbManager.getConnection('test-miles-republic')
```

---

## 9. Sécurité

### 9.1 Gestion des Mots de Passe

⚠️ **Important** : Les mots de passe ne doivent JAMAIS être loggés en clair :

```typescript
// ❌ MAUVAIS
this.logger.info(`Connexion avec user=${config.username}, pass=${config.password}`)

// ✅ BON
this.logger.info(`Connexion avec user=${config.username}`)

// ✅ BON avec masquage
const maskedUrl = connectionUrl.replace(/\/\/[^@]+@/, '//***:***@')
this.logger.info(`Connexion URL`, { url: maskedUrl })
```

### 9.2 Isolation des Connexions

Chaque agent obtient sa propre instance de connexion :

```
Agent 1 -> DatabaseManager -> Connection 1
Agent 2 -> DatabaseManager -> Connection 2
Agent 3 -> DatabaseManager -> Connection 1 (reuse)
```

---

## 10. Dépannage

### Problème : Connection Refused

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution** :
1. Vérifier host/port corrects
2. Vérifier base BD en ligne
3. Vérifier firewall/réseau

### Problème : Authentication Failed

```
Error: password authentication failed for user "app_user"
```

**Solution** :
1. Vérifier username/password
2. Vérifier permissions utilisateur BD
3. Réinitialiser mot de passe si nécessaire

### Problème : Database Not Found

```
Error: database "miles_republic" does not exist
```

**Solution** :
1. Vérifier nom de la base
2. Créer la base si elle n'existe pas
3. Vérifier permissions de l'utilisateur

---

## Voir aussi

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Vue d'ensemble
- [AGENTS-ARCHITECTURE.md](./AGENTS-ARCHITECTURE.md) - Détails agents
- [CONFIGURATION-SYSTEM.md](./CONFIGURATION-SYSTEM.md) - Configuration agents
