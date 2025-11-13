# Google Agent - Enrichissement avec currentData

**Date** : 2025-11-12  
**Statut** : ✅ Implémenté

## Problème résolu

Le Google Search Date Agent créait des propositions `EDITION_UPDATE` avec `racesToUpdate`, mais n'incluait pas les **données actuelles complètes** des courses. L'interface `RaceChangesTable` du dashboard ne pouvait donc pas afficher les valeurs actuelles à côté des valeurs proposées.

### Symptômes

Dans l'interface de validation des propositions :
- ❌ Colonne "Valeur actuelle" vide pour les courses
- ❌ Impossible de comparer l'ancien vs nouveau pour distance, dénivelé, catégorie
- ❌ Seule la date de départ était visible

## Solution

Alignement sur le FFA Scraper : ajout d'un champ `currentData` dans chaque élément de `racesToUpdate`.

### Structure des propositions (avant)

```typescript
{
  racesToUpdate: {
    new: [
      {
        raceId: "12345",
        raceName: "Semi-Marathon",
        updates: {
          startDate: {
            old: "2025-03-15T09:00:00.000Z",
            new: "2025-03-22T09:00:00.000Z"
          }
        }
        // ❌ Pas de currentData
      }
    ]
  }
}
```

### Structure des propositions (après)

```typescript
{
  racesToUpdate: {
    new: [
      {
        raceId: "12345",
        raceName: "Semi-Marathon",
        updates: {
          startDate: {
            old: "2025-03-15T09:00:00.000Z",
            new: "2025-03-22T09:00:00.000Z"
          }
        },
        // ✅ Toutes les données actuelles de la course
        currentData: {
          name: "Semi-Marathon",
          startDate: "2025-03-15T09:00:00.000Z",
          runDistance: 21.1,
          runPositiveElevation: 150,
          categoryLevel1: "RUNNING",
          categoryLevel2: "HALF_MARATHON",
          timeZone: "Europe/Paris"
        }
      }
    ]
  }
}
```

## Modifications

### Backend (GoogleSearchDateAgent.ts)

#### 1. Enrichissement de la requête Prisma

**Fichier** : `apps/agents/src/GoogleSearchDateAgent.ts` (lignes 336-346)

Ajout des champs dans la requête `getToBeConfirmedEvents()` :

```typescript
races: {
  select: {
    id: true,
    name: true,
    startDate: true,
    runDistance: true,           // ✅ Distance en km
    runPositiveElevation: true,  // ✅ Dénivelé positif
    categoryLevel1: true,        // ✅ Catégorie principale
    categoryLevel2: true,        // ✅ Sous-catégorie
    timeZone: true               // ✅ Timezone de la course
  }
}
```

#### 2. Mise à jour de l'interface TypeScript

**Fichier** : `apps/agents/src/GoogleSearchDateAgent.ts` (lignes 28-58)

```typescript
interface NextProdEvent {
  edition?: {
    races?: Array<{
      id: string
      name: string
      startDate: Date | null
      runDistance?: number                   // ✅ AJOUT
      runPositiveElevation?: number          // ✅ AJOUT
      categoryLevel1?: string                // ✅ AJOUT
      categoryLevel2?: string                // ✅ AJOUT
      timeZone?: string                      // ✅ AJOUT
    }>
  }
}
```

#### 3. Ajout de currentData dans racesToUpdate

**Fichier** : `apps/agents/src/GoogleSearchDateAgent.ts` (lignes 887-922)

```typescript
racesToUpdate.push({
  raceId: race.id,
  raceName: race.name,
  updates: {
    startDate: {
      old: currentRaceStartDate,
      new: proposedDate,
      confidence: enhancedConfidence
    }
  },
  // ✅ Ajouter toutes les données actuelles de la course
  currentData: {
    name: race.name,
    startDate: currentRaceStartDate,
    runDistance: race.runDistance,
    runPositiveElevation: race.runPositiveElevation,
    categoryLevel1: race.categoryLevel1,
    categoryLevel2: race.categoryLevel2,
    timeZone: race.timeZone
  }
})
```

### Frontend (dashboard)

**Aucune modification nécessaire** ✅

Le hook `useProposalEditor.ts` supporte déjà `currentData` depuis l'implémentation pour le FFA Scraper (lignes 445-456) :

```typescript
// Extraire les données originales depuis currentData
if (raceUpdate.currentData && typeof raceUpdate.currentData === 'object') {
  races[raceId] = {
    id: raceId,
    name: raceUpdate.currentData.name || raceUpdate.raceName || 'Course',
    startDate: raceUpdate.currentData.startDate,
    runDistance: raceUpdate.currentData.runDistance,
    runPositiveElevation: raceUpdate.currentData.runPositiveElevation,
    categoryLevel1: raceUpdate.currentData.categoryLevel1,
    categoryLevel2: raceUpdate.currentData.categoryLevel2,
    timeZone: raceUpdate.currentData.timeZone
  }
}
```

## Impact utilisateur

### Avant

```
Course: Semi-Marathon
├─ Date de départ: [vide] → 22/03/2025 09:00
```

### Après

```
Course: Semi-Marathon (21.1km, D+ 150m)
├─ Catégorie: RUNNING / HALF_MARATHON
├─ Date de départ: 15/03/2025 09:00 → 22/03/2025 09:00
├─ Timezone: Europe/Paris
```

## Avantages

1. ✅ **Cohérence** : Même structure que le FFA Scraper
2. ✅ **Affichage complet** : Toutes les infos visibles dans l'UI
3. ✅ **Pas de code frontend** : Réutilise l'infrastructure existante
4. ✅ **Type-safe** : TypeScript compile sans erreurs

## Tests

### Vérification TypeScript

```bash
cd apps/agents && npx tsc --noEmit
# ✅ Aucune erreur
```

### Test manuel

1. Lancer l'agent Google Search Date
2. Créer une proposition EDITION_UPDATE avec courses
3. Ouvrir la proposition dans le dashboard
4. Vérifier que la colonne "Valeur actuelle" est remplie pour les courses

## Ressources

- Code FFA Scraper : `apps/agents/src/FFAScraperAgent.ts` (lignes 547-555, 620-628)
- Hook frontend : `apps/dashboard/src/hooks/useProposalEditor.ts` (lignes 445-456)
- Interface RaceChangesTable : `apps/dashboard/src/components/proposals/edition-update/RacesChangesTable.tsx`

## Prochaines étapes

- ✅ Implémentation Google Agent
- ⏳ Tests manuels dans le dashboard
- ⏳ Vérifier l'affichage dans toutes les vues de propositions
