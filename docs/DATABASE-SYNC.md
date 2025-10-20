# 🔄 Synchronisation Base de Données - Miles Republic

Cette documentation explique comment utiliser la nouvelle fonctionnalité de synchronisation avec Miles Republic lors de l'application des propositions.

## Vue d'ensemble

Le `ProposalApplicationService` applique maintenant par défaut :
1. **Les changements au cache local** 
2. **La synchronisation avec la vraie base de données Miles Republic**

Utiliser `applyToDatabase: false` pour appliquer seulement au cache.

## Options d'Application

```typescript
interface ApplyOptions {
  applyToDatabase?: boolean     // Synchroniser avec Miles Republic (défaut: true)
  force?: boolean              // Outrepasser la validation d'approbation
  dryRun?: boolean            // Simulation sans modification
  milesRepublicDatabaseId?: string // ID spécifique de connexion Miles Republic
}
```

## Utilisation

### 1. Application Complète (Défaut)

```typescript
import { DatabaseService } from '@data-agents/database'

const db = new DatabaseService()

// Applique au cache ET synchronise avec Miles Republic (par défaut)
const result = await db.applyProposal('proposal-123', {
  name: 'Marathon de Paris 2024',
  startDate: '2024-04-14T08:00:00Z'
})

if (result.success && result.syncedToDatabase) {
  console.log('✅ Appliqué et synchronisé avec Miles Republic')
} else if (result.success && result.syncError) {
  console.log('⚠️ Appliqué au cache mais erreur de sync:', result.syncError)
}
```

### 2. Application Cache Seulement

```typescript
// Applique uniquement au cache local (pas de sync Miles Republic)
const result = await db.applyProposal('proposal-123', {
  name: 'Marathon de Paris 2024',
  startDate: '2024-04-14T08:00:00Z'
}, {
  applyToDatabase: false
})

console.log(result.success) // true
console.log(result.syncedToDatabase) // undefined (pas de sync)
```

### 3. Simulation (Dry Run)

```typescript
// Simule l'application sans modifications réelles
const result = await db.applyProposal('proposal-123', {
  name: 'Nouveau nom'
}, {
  dryRun: true
})

console.log(result.dryRun) // true
console.log(result.appliedChanges) // Changements qui seraient appliqués
```

### 4. Force Application

```typescript
// Force l'application même si pas approuvée
const result = await db.applyProposal('proposal-pending', {
  name: 'Test Event'
}, {
  force: true,
  applyToDatabase: true
})
```

## Réponse du Service

```typescript
interface ProposalApplicationResult {
  success: boolean
  appliedChanges: Record<string, any>
  
  // Nouveaux champs pour la sync
  syncedToDatabase?: boolean    // true si sync réussie
  syncError?: string           // Message d'erreur de sync
  dryRun?: boolean            // true si simulation
  
  // Avertissements
  warnings?: Array<{
    field: string
    message: string
    severity: 'warning'
  }>
  
  // Autres champs existants...
  createdIds?: { eventId?: string, editionId?: string, raceIds?: string[] }
  errors?: Array<{ field: string, message: string, severity: 'error' | 'warning' }>
}
```

## Configuration Miles Republic

### 1. Via Base de Données

Créer une connexion dans la table `database_connections` :

```sql
INSERT INTO database_connections (
  name,
  type,
  host,
  port,
  database,
  username,
  password,
  is_active
) VALUES (
  'Miles Republic Production',
  'MILES_REPUBLIC',
  'prod-db.milesrepublic.com',
  5432,
  'miles_republic',
  'app_user',
  'secure_password',
  true
);
```

### 2. Utilisation avec ID Spécifique

```typescript
const result = await db.applyProposal('proposal-123', changes, {
  applyToDatabase: true,
  milesRepublicDatabaseId: 'db-miles-republic-prod'
})
```

## Types de Propositions Supportées

### NEW_EVENT
Crée un nouvel événement, ses éditions et courses dans Miles Republic :

```typescript
// Cache: eventCache, editionCache, raceCache
// Miles Republic: Event, Edition, Race
```

### EVENT_UPDATE
Met à jour un événement existant :

```typescript
// Cache: eventCache
// Miles Republic: Event
```

### EDITION_UPDATE
Met à jour une édition existante :

```typescript
// Cache: editionCache  
// Miles Republic: Edition
```

### RACE_UPDATE
Met à jour une course existante :

```typescript
// Cache: raceCache
// Miles Republic: Race
```

## Gestion des Erreurs

### Erreurs de Synchronisation

Si l'application au cache réussit mais la synchronisation échoue :

```typescript
{
  success: true,
  appliedChanges: { ... },
  syncError: "Erreur sync événement: Connection refused",
  warnings: [{
    field: 'sync',
    message: 'Création réussie dans le cache mais échec de synchronisation',
    severity: 'warning'
  }]
}
```

### Erreurs Complètes

Si l'application échoue complètement :

```typescript
{
  success: false,
  appliedChanges: {},
  errors: [{
    field: 'eventId',
    message: 'Événement non trouvé avec l\'ID: event-123',
    severity: 'error'
  }]
}
```

## Mapping des Données

### EventCache → Event (Miles Republic)

```typescript
// Cache fields                    // Miles Republic fields
id: 'event-123'                 → id: 123 (parseInt)
name: 'Marathon de Paris'       → name: 'Marathon de Paris'
city: 'Paris'                   → city: 'Paris'
// ... autres champs mapping direct
```

### EditionCache → Edition (Miles Republic)

```typescript
medusaVersion: 'V1'             → medusaVersion: 'V1' | 'V2'
calendarStatus: 'CONFIRMED'     → calendarStatus: 'CONFIRMED'
// ... mapping avec transformations
```

### RaceCache → Race (Miles Republic)

```typescript
isActive: true                  → isActive: true
price: 42.5                     → price: 42.5
// ... mapping direct pour la plupart des champs
```

## Bonnes Pratiques

### 1. Tests et Validation

```typescript
// Toujours tester d'abord avec dryRun
const dryRunResult = await db.applyProposal(proposalId, changes, { dryRun: true })

if (dryRunResult.success) {
  // Puis appliquer réellement
  const realResult = await db.applyProposal(proposalId, changes, { 
    applyToDatabase: true 
  })
}
```

### 2. Gestion des Échecs de Sync

```typescript
const result = await db.applyProposal(proposalId, changes, { applyToDatabase: true })

if (result.success && !result.syncedToDatabase) {
  // Log pour monitoring
  console.error('Sync failed:', result.syncError)
  
  // Optionnel: retry ou notification
  await notifyAdminOfSyncFailure(proposalId, result.syncError)
}
```

### 3. Environnements

```typescript
const isDevelopment = process.env.NODE_ENV === 'development'

const result = await db.applyProposal(proposalId, changes, {
  applyToDatabase: !isDevelopment, // Désactiver sync en dev si besoin
  force: isDevelopment             // Force en dev seulement
})
```

## Monitoring et Debugging

### Logs Automatiques

Le système log automatiquement :
- Connexions établies à Miles Republic
- Succès/échecs de synchronisation  
- Erreurs de mapping ou de validation

### Métriques Recommandées

- Taux de succès de synchronisation
- Temps de réponse de sync
- Types d'erreurs de sync les plus fréquentes

## Migration Existante

**⚠️ BREAKING CHANGE** : Le comportement par défaut a changé !

```typescript
// Avant (cache seulement)
await db.applyProposal(proposalId, changes)

// Après (NOUVEAU comportement par défaut : cache + sync)
await db.applyProposal(proposalId, changes)

// Pour garder l'ancien comportement (cache seulement)
await db.applyProposal(proposalId, changes, { applyToDatabase: false })
```

**Migration recommandée** :
1. Tester d'abord avec `{ applyToDatabase: false }` 
2. Puis progressivement activer la sync par défaut

## Voir Aussi

- [DATABASE-MANAGER.md](./DATABASE-MANAGER.md) - Configuration des connexions
- [PROPOSAL-APPLICATION.md](./PROPOSAL-APPLICATION.md) - Application des propositions
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Vue d'ensemble du système