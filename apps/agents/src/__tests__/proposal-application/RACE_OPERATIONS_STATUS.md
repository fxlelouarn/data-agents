# Race Operations - État des Corrections V2

**Date** : 2 Décembre 2025  
**Statut** : 🚧 En cours (1/21 tests passent)

---

## ✅ Corrections Effectuées

### 1. Fixtures - `createExistingRace`

**Fichier** : `helpers/fixtures.ts` (lignes 322-349)

**Changements** :
```typescript
// ❌ AVANT (V1)
data: {
  editionId: edition.id,
  eventId: edition.eventId,
  // ...
}

// ✅ APRÈS (V2)
data: {
  edition: { connect: { id: edition.id } },
  event: { connect: { id: edition.eventId } },
  // Nouveau champ V2
  bikeRunDistance: data.bikeRunDistance || 0,
  isActive: data.isActive !== undefined ? data.isActive : true,
  isArchived: data.isArchived !== undefined ? data.isArchived : false,
  // ...
}
```

### 2. Tests - Remplacement `archivedAt` → `isArchived`

**Fichier** : `race-operations.test.ts`

**8 occurrences corrigées** :

| Ligne | Type | Avant | Après |
|-------|------|-------|-------|
| 447 | WHERE | `archivedAt: null` | `isArchived: false` |
| 627 | ASSERT | `archivedAt).not.toBeNull()` | `isArchived).toBe(true)` |
| 632 | ASSERT | `archivedAt).toBeNull()` | `isArchived).toBe(false)` |
| 657 | WHERE | `archivedAt: { not: null }` | `isArchived: true` |
| 665 | WHERE | `archivedAt: null` | `isArchived: false` |
| 700 | WHERE | `archivedAt: null` | `isArchived: false` |
| 727 | ASSERT | `archivedAt).not.toBeNull()` | `isArchived).toBe(true)` |
| 819 | WHERE | `archivedAt: null` | `isArchived: false` |

### 3. Backend - Soft Delete avec `isArchived`

**Fichier** : `packages/database/src/repositories/miles-republic.repository.ts` (lignes 517-531)

**Changements** :
```typescript
// ❌ AVANT (hard delete)
async deleteRace(raceId: number) {
  return this.milesDb.race.delete({ where: { id: raceId } })
}

// ✅ APRÈS (soft delete)
async deleteRace(raceId: number) {
  return this.milesDb.race.update({
    where: { id: raceId },
    data: {
      isArchived: true,
      isActive: false,
      updatedBy: this.auditUser,
      updatedAt: new Date()
    }
  })
}
```

### 4. Fixtures - Distances par défaut selon le type

**Fichier** : `helpers/fixtures.ts` (lignes 333-342)

**Changements** :
```typescript
// ✅ V2: Distances required - assigner selon le type de course
runDistance: data.runDistance !== undefined ? data.runDistance : 
             (data.distance && !data.bikeDistance && !data.walkDistance && !data.swimDistance ? data.distance : 0),

bikeDistance: data.bikeDistance !== undefined ? data.bikeDistance : 
              (data.distance && data.categoryLevel1 === 'CYCLING' ? data.distance : 0),

walkDistance: data.walkDistance !== undefined ? data.walkDistance : 
              (data.distance && data.categoryLevel1 === 'WALK' ? data.distance : 0),
```

### 5. Backend - Support structure `raceChange.updates`

**Fichier** : `packages/database/src/services/proposal-domain.service.ts` (lignes 504-513)

**Changements** :
```typescript
// ✅ Extraire depuis raceChange.updates (structure des tests)
const updates = raceChange.updates || raceChange
const raceUpdateData = this.buildRaceUpdateData(updates)

if (Object.keys(raceUpdateData).length > 0) {
  await milesRepo.updateRace(raceId, raceUpdateData)
  this.logger.info(`  ✅ Course ${raceId} mise à jour:`, raceUpdateData)
}
```

---

## ⚠️ Problèmes Restants

### UPDATE ne fonctionne pas (10/10 tests échouent)

**Symptômes** :
```typescript
// Test: should update race distance
const race = await createExistingRace({ runDistance: 10 })
const proposal = { races: { toUpdate: [{ raceId: race.id, updates: { runDistance: { old: 10, new: 12 } } }] } }

await domainService.applyProposal(...)

const updated = await testMilesRepublicDb.race.findUnique({ where: { id: race.id } })
expect(updated!.runDistance).toBe(12)  // ❌ Reçu: 10
```

**Tous les UPDATE échouent** :
- runDistance : 10 → 12 (reste 10) ❌
- startDate : 09:00 → 10:30 (reste 09:00) ❌
- elevation : 1200 → 1500 (reste 1200) ❌
- Toutes les modifications utilisateur ignorées

**Hypothèses** :
1. `buildRaceUpdateData()` ne construit pas le payload correctement ?
2. `extractNewValue()` ne trouve pas la valeur `new` ?
3. `updateRace()` ne commit pas en DB ?

### ADD ne fonctionne pas (5/5 tests échouent)

**Symptômes** :
```typescript
// Test: should add new race
await domainService.applyProposal(...)
const races = await testMilesRepublicDb.race.findMany({ where: { editionId } })
expect(races).toHaveLength(2)  // ❌ Reçu: 1 (seulement la course existante)
```

**Nouvelles courses non créées** :
- Semi-Marathon (expected 2, received 1)
- Plusieurs courses (expected 3, received 0)
- Trail avec élévation (null access)
- Bike race (null access)
- Triathlon (null access)

**Hypothèses** :
1. `racesToAdd` non extrait depuis `changes` ?
2. `createRace()` échoue silencieusement ?
3. Payload incomplet (champs requis manquants) ?

### DELETE fonctionne partiellement (1/5 tests passent)

**Symptômes** :
```typescript
// Test: should archive deleted race
await domainService.applyProposal(...)
const deleted = await testMilesRepublicDb.race.findUnique({ where: { id: race1.id } })
expect(deleted!.isArchived).toBe(true)  // ❌ Reçu: false
```

**Problème** : `isArchived` reste `false` malgré le soft delete.

---

## 📊 État Actuel

| Catégorie | Tests | Résultat |
|-----------|-------|----------|
| Update Races | 10 | ❌ 10/10 échouent |
| Add Races | 5 | ❌ 5/5 échouent |
| Delete Races | 5 | ✅ 1/5 passe, ❌ 4/5 échouent |
| Mixed Operations | 1 | ❌ 1/1 échoue |
| **TOTAL** | **21** | **1/21 (5%)** |

---

## 🔍 Diagnostic Nécessaire

### 1. Vérifier extraction de `racesToAdd`

**Ligne à inspecter** : `proposal-domain.service.ts:372-375`

```typescript
if (field === 'racesToAdd') {
  racesToAdd = this.extractNewValue(value) as any[]
  continue
}
```

**Tests à faire** :
- Log de `changes.racesToAdd` avant extraction
- Log de `racesToAdd` après extraction
- Vérifier structure : tableau direct ou `{ new: [...] }` ?

### 2. Vérifier `buildRaceUpdateData()`

**Ligne à inspecter** : `proposal-domain.service.ts:1254-1267`

```typescript
private buildRaceUpdateData(raceChange: Record<string, any>): Record<string, any> {
  const updateData: Record<string, any> = {}

  for (const [field, value] of Object.entries(raceChange)) {
    if (field === 'raceId' || field === 'raceName') continue

    const extractedValue = this.extractNewValue(value)
    if (extractedValue !== undefined) {
      updateData[field] = extractedValue
    }
  }

  return updateData
}
```

**Tests à faire** :
- Log de `raceChange` (entrée)
- Log de `updateData` (sortie)
- Vérifier que `extractNewValue({ old: 10, new: 12 })` retourne `12`

### 3. Vérifier `createRace()` dans repository

**Ligne à inspecter** : `miles-republic.repository.ts:391-488`

**Tests à faire** :
- Log du payload avant `milesDb.race.create()`
- Catch des erreurs Prisma
- Vérifier champs requis (distances, relations, etc.)

---

## 🚀 Prochaines Étapes

1. Ajouter logs de debugging dans `applyEditionUpdate()` :
   - Log `racesToUpdate` après extraction
   - Log `racesToAdd` après extraction
   - Log payload UPDATE avant `updateRace()`
   - Log payload CREATE avant `createRace()`

2. Relancer les tests avec logs activés

3. Analyser les logs pour identifier le point de défaillance

4. Corriger selon les résultats

---

## 📚 Ressources

- **Tests** : `apps/agents/src/__tests__/proposal-application/race-operations.test.ts`
- **Fixtures** : `apps/agents/src/__tests__/proposal-application/helpers/fixtures.ts`
- **Backend** : `packages/database/src/services/proposal-domain.service.ts`
- **Repository** : `packages/database/src/repositories/miles-republic.repository.ts`
- **Doc générale** : `apps/agents/src/__tests__/proposal-application/README.md`
