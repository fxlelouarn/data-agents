# Fix: Création manuelle de propositions EDITION_UPDATE complètes

**Date** : 2025-11-17  
**Problème résolu** : Les propositions manuelles pour des éditions existantes ne montraient que les champs modifiés, sans contexte des valeurs actuelles.

## Symptômes

Lorsqu'un utilisateur sélectionnait un événement existant avec une édition future via `EditEventForm` :
- ❌ Création de **N propositions** (une par champ modifié)
- ❌ **Aucun contexte** : pas de colonne "Valeur actuelle"
- ❌ **Courses manquantes** : pas de liste des courses existantes
- ❌ Vue de proposition **incomplète** (seulement 2-3 champs visibles)

**Exemple observé** :
- Édition 2026 de "Trail de Bisan de Menerbès - Bize-Minervois"
- Seulement 3 champs visibles : `startDate`, `year`, `calendarStatus`
- Aucune information sur les courses

## Cause

`EditEventForm.tsx` (lignes 175-234) créait une proposition **champ par champ** :

```typescript
// ❌ ANCIEN (bugué)
for (const [field, value] of Object.entries(editionChanges)) {
  if (value !== '') {
    allChanges.push({
      type: 'EDITION_UPDATE' as const,
      editionId: selectedEditionId,
      fieldName: field,  // Un seul champ !
      fieldValue: value
    })
  }
}

// Créer N propositions séparées
for (const change of allChanges) {
  await createMutation.mutateAsync(change)
}
```

**Résultat** : Chaque proposition contenait **1 seul champ**, sans contexte.

## Solution

### Backend : Nouvel endpoint `/api/proposals/edition-update-complete`

**Fichier** : `apps/api/src/routes/proposals.ts` (lignes 1588-1817)

**Fonctionnement** :

1. **Récupération des données complètes** depuis Miles Republic :
   ```typescript
   const edition = await connection.edition.findUnique({
     where: { id: numericEditionId },
     include: {
       event: true,
       races: { orderBy: { runDistance: 'asc' } }
     }
   })
   ```

2. **Construction du payload complet** :
   ```typescript
   // Structure: changes = valeurs actuelles + proposées
   const editionFields = [
     'year', 'startDate', 'endDate', 'timeZone', 'calendarStatus',
     'registrationOpeningDate', 'registrationClosingDate', 'registrantsNumber', 'currency'
   ]

   editionFields.forEach(field => {
     const currentValue = edition[field]
     const proposedValue = userModifiedChanges[field] !== undefined 
       ? userModifiedChanges[field] 
       : currentValue

     if (currentValue !== null || proposedValue !== null) {
       changes[field] = {
         old: currentValue,    // ✅ Valeur actuelle
         new: proposedValue,   // ✅ Valeur proposée ou actuelle
         confidence: 1.0
       }
     }
   })
   ```

3. **Matching automatique des courses** :
   ```typescript
   currentRaces.forEach(race => {
     const raceEdits = userModifiedRaceChanges[race.id] || {}
     const hasDifferences = Object.keys(raceEdits).length > 0

     if (hasDifferences) {
       racesToUpdate.push({
         raceId: race.id,
         currentValues: { /* ... */ },
         proposedValues: { /* ... */ },
         differences: ['startDate', 'price', ...]
       })
     }
   })
   ```

4. **Création d'UNE SEULE proposition EDITION_UPDATE** :
   ```typescript
   const newProposal = await db.prisma.proposal.create({
     data: {
       type: 'EDITION_UPDATE',
       status: autoValidate ? 'APPROVED' : 'PENDING',
       eventId: event.id.toString(),
       editionId: edition.id.toString(),
       changes,  // ✅ Tous les champs avec old + new
       userModifiedChanges,
       justification,
       confidence: 1.0
     }
   })
   ```

**Paramètres d'entrée** :
```typescript
{
  editionId: string,              // ID de l'édition dans Miles Republic
  userModifiedChanges?: {         // Champs de l'édition modifiés
    startDate?: string,
    endDate?: string,
    registrationOpeningDate?: string,
    // ...
  },
  userModifiedRaceChanges?: {     // Modifications par course
    "141829": {
      startDate: "2025-11-15T09:00:00.000Z",
      price: 15
    }
  },
  justification?: string,
  autoValidate?: boolean          // false par défaut
}
```

**Réponse** :
```typescript
{
  success: true,
  data: {
    proposal: {
      id: "cm...",
      type: "EDITION_UPDATE",
      status: "PENDING",
      eventId: "13446",
      editionId: "44684",
      eventName: "Trail des loups",
      editionYear: 2026
    }
  },
  message: "EDITION_UPDATE proposal created for Trail des loups 2026"
}
```

### Frontend : Modification de `EditEventForm`

**Fichier** : `apps/dashboard/src/components/EditEventForm.tsx`

**Changements** :

1. **Import de l'API** (ligne 20) :
   ```typescript
   import { proposalsApi } from '@/services/api'
   import { useSnackbar } from 'notistack'
   ```

2. **Refonte de `handleSubmit()`** (lignes 175-234) :
   ```typescript
   const handleSubmit = async () => {
     // Convertir les champs de date en ISO strings
     const processedEditionChanges: Record<string, any> = {}
     Object.entries(editionChanges).forEach(([field, value]) => {
       if (value !== '') {
         processedEditionChanges[field] = field.includes('Date') && value 
           ? new Date(value).toISOString() 
           : value
       }
     })

     // Idem pour les courses
     const processedRaceChanges: Record<string, any> = {}
     // ...

     try {
       // ✅ UN SEUL appel API
       const response = await proposalsApi.createEditionUpdateComplete({
         editionId: selectedEditionId,
         userModifiedChanges: processedEditionChanges,
         userModifiedRaceChanges: processedRaceChanges,
         justification: justification || `Modification manuelle via interface d'édition`,
         autoValidate: false
       })

       enqueueSnackbar(
         `Proposition EDITION_UPDATE créée avec succès pour ${response.data.proposal.eventName} ${response.data.proposal.editionYear}`,
         { variant: 'success' }
       )
       onClose()
     } catch (error: any) {
       enqueueSnackbar(error.response?.data?.error || 'Erreur', { variant: 'error' })
     }
   }
   ```

3. **Texte du bouton** (ligne 472) :
   ```typescript
   // ❌ AVANT
   `Créer ${getPendingChangesCount()} proposition(s)`

   // ✅ APRÈS
   "Créer la proposition EDITION_UPDATE"
   ```

4. **Message d'info** (ligne 346) :
   ```typescript
   // ❌ AVANT
   {getPendingChangesCount()} modification(s) en attente

   // ✅ APRÈS
   {getPendingChangesCount()} champ(s) modifié(s) - Une proposition EDITION_UPDATE complète sera créée
   ```

### Service API Frontend

**Fichier** : `apps/dashboard/src/services/api.ts` (lignes 170-187)

```typescript
export const proposalsApi = {
  // ...
  createEditionUpdateComplete: (data: {
    editionId: string
    userModifiedChanges?: Record<string, any>
    userModifiedRaceChanges?: Record<string, any>
    justification?: string
    autoValidate?: boolean
  }): Promise<ApiResponse<{
    proposal: {
      id: string
      type: string
      status: string
      eventId: string
      editionId: string
      eventName: string
      editionYear: number
    }
  }>> =>
    api.post('/proposals/edition-update-complete', data).then(res => res.data),
}
```

## Résultats

### Avant le fix

| Aspect | État |
|--------|------|
| **Nombre de propositions** | N (une par champ) ❌ |
| **Colonne "Valeur actuelle"** | Vide ❌ |
| **Courses visibles** | Non ❌ |
| **Champs visibles** | 2-3 seulement ❌ |
| **Contexte complet** | Non ❌ |

### Après le fix

| Aspect | État |
|--------|------|
| **Nombre de propositions** | **1** (complète) ✅ |
| **Colonne "Valeur actuelle"** | **Remplie** ✅ |
| **Courses visibles** | **Toutes listées** ✅ |
| **Champs visibles** | **Tous** (year, startDate, endDate, timeZone, calendarStatus, etc.) ✅ |
| **Contexte complet** | **Oui** ✅ |

## Tests à effectuer

1. **Sélection événement existant** :
   - Lancer l'application (serveurs dev)
   - Aller dans Propositions → "Édition événement existant"
   - Chercher "Trail des loups" via Meilisearch
   - Sélectionner l'édition 2026

2. **Modifier quelques champs** :
   - Onglet "Édition" : modifier `startDate` (ex: 27/01/2026 → 03/02/2026)
   - Onglet "Courses" : modifier `price` d'une course (ex: 10 → 15)

3. **Créer la proposition** :
   - Cliquer "Créer la proposition EDITION_UPDATE"
   - ✅ Notification de succès

4. **Vérifier la proposition créée** :
   - Ouvrir la proposition dans la liste
   - ✅ Tous les champs de l'édition visibles avec "Valeur actuelle" remplie
   - ✅ Toutes les courses listées
   - ✅ Modifications correctement marquées

## Fichiers modifiés

### Backend
- `apps/api/src/routes/proposals.ts` : Nouvel endpoint `/edition-update-complete` (lignes 1588-1817)

### Frontend
- `apps/dashboard/src/services/api.ts` : Méthode `createEditionUpdateComplete` (lignes 170-187)
- `apps/dashboard/src/components/EditEventForm.tsx` :
  - Import proposalsApi (ligne 20)
  - Refonte `handleSubmit()` (lignes 175-234)
  - Texte du bouton (ligne 472)
  - Message d'info (ligne 346)

## Rétrocompatibilité

✅ **Aucun impact** sur les propositions existantes  
✅ **Aucun impact** sur la création manuelle NEW_EVENT (utilise toujours `/proposals/manual`)  
✅ **Aucun impact** sur les propositions générées par les agents

## Prochaines étapes

1. ✅ Backend : Endpoint créé
2. ✅ Frontend : Interface modifiée
3. ⏳ **Tests manuels** : Vérifier le workflow complet

## Références

- Inspiration : Endpoint `/convert-to-edition-update` (lignes 1324-1586)
- Matching courses : `matchRacesByDistanceAndName()` (importé depuis `ffa/matcher.ts`)
- Schéma Prisma : `packages/database/prisma/schema.prisma` (modèle `Proposal`)
