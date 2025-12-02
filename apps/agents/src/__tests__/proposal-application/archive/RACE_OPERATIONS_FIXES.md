# Corrections Race Operations Tests - Miles Republic V2

**Date** : 2 Décembre 2025  
**Statut** : 🚧 En cours (20/21 tests échouent)

---

## 📋 Analyse des Problèmes

### 1. Schéma Race - Changements V1 → V2

| Champ V1 | Champ V2 | Type V2 | Impact |
|----------|----------|---------|--------|
| `archivedAt` | `isArchived` | `Boolean` | ❌ Tests échouent : `Unknown argument 'archivedAt'` |
| - | `isActive` | `Boolean` | ✅ Nouveau champ |
| `runDistance` | `runDistance` | `Float` (required) | ⚠️ Était `Float?` en V1 |
| `swimDistance` | `swimDistance` | `Float` (required) | ⚠️ Était `Float?` en V1 |
| `bikeDistance` | `bikeDistance` | `Float` (required) | ⚠️ Était `Float?` en V1 |
| `walkDistance` | `walkDistance` | `Float` (required) | ⚠️ Était `Float?` en V1 |
| - | `bikeRunDistance` | `Float` @default(0) | ✅ Nouveau champ |
| - | `edition` (relation) | `Edition` (required) | ❌ Tests échouent : `Argument 'edition' is missing` |

###2. Tests de Suppression (DELETE)

**Problème** : Les tests utilisent `archivedAt` mais le schéma utilise `isArchived`

**Avant (V1)** :
```typescript
// Archivage (soft delete)
archivedAt: DateTime?  // null = actif, timestamp = archivé

// Requêtes
where: { archivedAt: null }  // Courses actives
where: { archivedAt: { not: null } }  // Courses archivées
```

**Après (V2)** :
```typescript
// Archivage (soft delete)
isArchived: Boolean @default(false)  // false = actif, true = archivé
isActive: Boolean @default(true)     // true = actif, false = inactif

// Requêtes
where: { isArchived: false }  // Courses actives
where: { isArchived: true }   // Courses archivées
```

### 3. Backend - Gestion des Courses

**Problèmes détectés** :

1. **UPDATE ne fonctionne pas** : Les modifications ne sont pas appliquées
   - `runDistance: 10 → 12` reste à 10
   - `startDate` ne change pas
   - `elevation` ne change pas

2. **ADD ne fonctionne pas** : Les nouvelles courses ne sont pas créées
   - `toAdd: [...]` → 0 course créée
   - Erreur : `Cannot read properties of null`

3. **DELETE ne fonctionne pas** : `isArchived` n'est pas mis à `true`

### 4. Fixtures - createExistingRace

**Erreur** : `Argument 'edition' is missing`

**Cause** : Le schéma V2 exige une relation `edition` explicite

**Avant (V1)** :
```typescript
await testMilesRepublicDb.race.create({
  data: {
    editionId: edition.id,
    name: '10km',
    // ...
  }
})
```

**Après (V2)** :
```typescript
await testMilesRepublicDb.race.create({
  data: {
    edition: {
      connect: { id: edition.id }
    },
    event: {
      connect: { id: edition.eventId }
    },
    name: '10km',
    // ...
  }
})
```

---

## 🔧 Corrections Nécessaires

### 1. Fixtures (helpers/fixtures.ts)

#### createExistingRace

```typescript
// ❌ AVANT
return await testMilesRepublicDb.race.create({
  data: {
    editionId: edition.id,
    eventId: edition.eventId,
    name: data.name || '10km Test',
    runDistance: data.runDistance !== undefined ? data.runDistance : (data.distance || 10),
    // ...
  }
})

// ✅ APRÈS
return await testMilesRepublicDb.race.create({
  data: {
    edition: {
      connect: { id: edition.id }
    },
    event: {
      connect: { id: edition.eventId }
    },
    name: data.name || '10km Test',
    runDistance: data.runDistance !== undefined ? data.runDistance : (data.distance || 10),
    runDistance2: data.runDistance2 || 0,       // ✅ Required
    bikeDistance: data.bikeDistance || 0,       // ✅ Required
    walkDistance: data.walkDistance || 0,       // ✅ Required
    swimDistance: data.swimDistance || 0,       // ✅ Required
    swimRunDistance: data.swimRunDistance || 0, // ✅ Required
    // ...
  }
})
```

### 2. Tests (race-operations.test.ts)

#### Remplacer `archivedAt` par `isArchived`

```typescript
// ❌ AVANT
const races = await testMilesRepublicDb.race.findMany({
  where: { editionId: edition.id, archivedAt: null }
})

expect(deleted!.archivedAt).not.toBeNull()

// ✅ APRÈS
const races = await testMilesRepublicDb.race.findMany({
  where: { editionId: edition.id, isArchived: false }
})

expect(deleted!.isArchived).toBe(true)
```

#### Lignes à corriger

| Ligne | Test | Changement |
|-------|------|------------|
| 446 | `should add new race to edition` | `archivedAt: null` → `isArchived: false` |
| 632 | `should archive deleted race` | `archivedAt).not.toBeNull()` → `isArchived).toBe(true)` |
| 637 | `should archive deleted race` | `archivedAt).toBeNull()` → `isArchived).toBe(false)` |
| 654 | `should archive multiple races` | `archivedAt: { not: null }` → `isArchived: true` |
| 662 | `should archive multiple races` | `archivedAt: null` → `isArchived: false` |
| 697 | `should not delete if racesToDelete is empty` | `archivedAt: null` → `isArchived: false` |
| 727 | `should not hard-delete races` | `archivedAt).not.toBeNull()` → `isArchived).toBe(true)` |
| 819 | `handle update + add + delete together` | `archivedAt).not.toBeNull()` → `isArchived).toBe(true)` |
| 823 | `handle update + add + delete together` | `archivedAt: null` → `isArchived: false` |

### 3. Backend (proposal-domain.service.ts)

#### A. Support UPDATE races

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`

Vérifier que `racesToUpdate` est bien géré dans `applyEditionUpdate()`.

#### B. Support ADD races

Vérifier que `racesToAdd` est bien géré avec tous les champs obligatoires.

#### C. Support DELETE races (archivage)

```typescript
// ❌ AVANT
await milesRepo.updateRace(raceId, {
  archivedAt: new Date()
})

// ✅ APRÈS
await milesRepo.updateRace(raceId, {
  isArchived: true,
  isActive: false
})
```

---

## 📏 Checklist des Corrections

### Fixtures
- [✅] Corriger `createExistingRace` : Relations `edition` et `event`
- [✅] Corriger `createExistingRace` : Champs obligatoires (distances)
- [✅] Corriger logique distances par défaut selon categoryLevel1

### Tests
- [✅] Remplacer `archivedAt: null` → `isArchived: false` (6 occurrences)
- [✅] Remplacer `archivedAt: { not: null }` → `isArchived: true` (2 occurrences)
- [✅] Remplacer `.archivedAt).not.toBeNull()` → `.isArchived).toBe(true)` (3 occurrences)
- [✅] Remplacer `.archivedAt).toBeNull()` → `.isArchived).toBe(false)` (1 occurrence)
- [✅] Corriger assertion `runDistance).toBeNull()` → `runDistance).toBe(0)` (bike race)

### Backend
- [✅] Corriger archivage : `race.delete()` → `race.update({ isArchived: true })`
- [✅] Support structure `raceChange.updates` dans `applyEditionUpdate()`
- [⚠️] Vérifier gestion `racesToUpdate` (UPDATE ne fonctionne pas)
- [⚠️] Vérifier gestion `racesToAdd` (ADD ne fonctionne pas)
- [⚠️] Vérifier création races : tous champs obligatoires

---

## 🧪 État Actuel

| Catégorie | Tests | Résultat |
|-----------|-------|----------|
| Update Races | 10 | ❌ 10/10 échouent |
| Add Races | 5 | ❌ 5/5 échouent |
| Delete Races | 5 | ❌ 4/5 échouent |
| Mixed Operations | 1 | ❌ 1/1 échoue |
| **TOTAL** | **21** | ❌ **20/21 (5%)** |

---

## 🚀 Prochaines Étapes

1. Corriger `createExistingRace` dans fixtures
2. Remplacer `archivedAt` → `isArchived` dans tous les tests
3. Vérifier/corriger le backend pour UPDATE/ADD/DELETE races
4. Relancer les tests et itérer

---

## 📚 Ressources

- Schéma Prisma Miles Republic V2 : `apps/agents/prisma/miles-republic.prisma` (lignes 377-471)
- Tests : `apps/agents/src/__tests__/proposal-application/race-operations.test.ts`
- Fixtures : `apps/agents/src/__tests__/proposal-application/helpers/fixtures.ts`
- Backend : `packages/database/src/services/proposal-domain.service.ts`
