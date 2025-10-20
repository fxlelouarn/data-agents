# Service d'Application des Propositions

Le service `ProposalApplicationService` permet d'appliquer automatiquement les propositions approuvées dans le cache Miles Republic.

## Fonctionnalités

### 1. Application automatique lors de l'approbation

Quand une proposition est marquée comme `APPROVED` via l'API, le service applique automatiquement les changements sélectionnés :

```typescript
// PUT /api/proposals/:id
{
  "status": "APPROVED",
  "reviewedBy": "user@example.com", 
  "appliedChanges": {
    "name": "Marathon de Paris 2024",
    "startDate": "2024-04-14T08:00:00Z",
    "price": 85.00
  }
}
```

### 2. Application manuelle

Vous pouvez appliquer une proposition manuellement via l'endpoint dédié :

```typescript
// POST /api/proposals/:id/apply
{
  "selectedChanges": {
    "name": "Marathon de Paris 2024",
    "startDate": "2024-04-14T08:00:00Z"
    // Seuls les champs sélectionnés seront appliqués
  },
  "force": false // true pour forcer l'application même si pas approuvée
}
```

### 3. Prévisualisation

Avant d'appliquer, vous pouvez prévisualiser les changements :

```typescript
// POST /api/proposals/:id/preview
{
  "selectedChanges": {
    "name": "Marathon de Paris 2024",
    "startDate": "2024-04-14T08:00:00Z"
  }
}
```

Réponse :
```json
{
  "success": true,
  "data": {
    "proposalType": "EDITION_UPDATE",
    "targetId": "edition-123",
    "selectedChanges": { ... },
    "summary": {
      "totalChanges": 2,
      "changeTypes": {
        "basic_info": 1,
        "dates": 1
      }
    },
    "warnings": []
  }
}
```

## Types de Propositions

### NEW_EVENT - Nouvel Événement

Crée un nouvel événement avec ses éditions et courses associées.

**Exemple de données :**
```typescript
{
  "name": "Trail des Volcans",
  "city": "Clermont-Ferrand",
  "country": "FR",
  "year": "2024",
  "startDate": "2024-06-15T09:00:00Z",
  "runDistance": 21.1,
  "price": 45.00
}
```

**Résultat :** Crée automatiquement :
- 1 EventCache avec un ID unique
- 1 EditionCache pour l'année spécifiée
- 1 ou plusieurs RaceCache selon les données

### EVENT_UPDATE - Modification d'Événement

Met à jour les informations d'un événement existant.

**Champs supportés :**
- `name`, `city`, `country`
- `websiteUrl`, `facebookUrl`, `instagramUrl`
- `fullAddress`, `latitude`, `longitude`
- `isPrivate`, `isFeatured`, `isRecommended`

### EDITION_UPDATE - Modification d'Édition

Met à jour une édition spécifique.

**Champs supportés :**
- `calendarStatus`, `clientStatus`
- `startDate`, `endDate`
- `registrationOpeningDate`, `registrationClosingDate`
- `registrantsNumber`, `federationId`
- `currency`, `timeZone`

### RACE_UPDATE - Modification de Course

Met à jour une course spécifique.

**Champs supportés :**
- `name`, `startDate`, `price`
- Distances : `runDistance`, `bikeDistance`, `swimDistance`, etc.
- Dénivelés : `runPositiveElevation`, `runNegativeElevation`, etc.
- `categoryLevel1`, `categoryLevel2`, `distanceCategory`

## Gestion des Erreurs

### Logging Automatique

Toutes les applications sont loggées avec :
- **INFO** : Application réussie
- **ERROR** : Échec d'application
- Détails complets dans `data.applicationResult`

### Rollback (Non Implémenté)

Le service inclut une méthode `rollbackProposal()` pour annuler une application, mais elle n'est pas encore intégrée aux routes API.

```typescript
await db.proposalApplication.rollbackProposal(proposalId, {
  createdIds: {
    eventId: "event-123",
    editionId: "edition-456",
    raceIds: ["race-789"]
  },
  originalValues: { ... }
})
```

## Utilisation Programmatique

```typescript
import { DatabaseService } from '@data-agents/database'

const db = new DatabaseService()

// Application directe
const result = await db.applyProposal(proposalId, {
  name: "Nouveau nom",
  startDate: "2024-04-14T08:00:00Z"
})

if (result.success) {
  console.log('Appliqué avec succès:', result.createdIds)
} else {
  console.error('Erreurs:', result.errors)
}

// Via le service direct
const applicationService = db.proposalApplication
const result2 = await applicationService.applyNewEvent(changes, selectedChanges)
```

## Architecture

```
ProposalApplicationService
├── applyProposal() - Point d'entrée principal
├── applyNewEvent() - Création d'événement
├── applyEventUpdate() - Mise à jour événement  
├── applyEditionUpdate() - Mise à jour édition
├── applyRaceUpdate() - Mise à jour course
└── rollbackProposal() - Annulation (future)
```

Le service utilise des transactions Prisma pour garantir la cohérence des données et génère automatiquement les IDs selon les conventions Miles Republic.

## Sécurité

- Validation des types de propositions
- Vérification du statut `APPROVED` (sauf avec `force: true`)
- Transactions atomiques
- Logging complet pour audit
- Gestion des erreurs avec messages explicites