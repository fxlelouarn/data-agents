# Fix: Indexation des courses existantes (existing-X)

**Date**: 2 décembre 2025  
**Problème**: Les modifications utilisateur sur les courses existantes étaient appliquées aux mauvaises courses.

## Symptômes

Lors de l'application d'une proposition EDITION_UPDATE avec modifications utilisateur sur plusieurs courses existantes :

```javascript
userModifiedChanges = {
  raceEdits: {
    'existing-0': { _deleted: true },      // Supprimer race1
    'existing-1': { name: 'Nouveau nom' }, // Modifier race2
    'existing-2': { runPositiveElevation: '2101' } // Modifier race3
  }
}
```

**Résultat attendu** : 
- Race1 supprimée
- Race2 renommée
- Race3 dénivelé modifié

**Résultat observé** :
- Race2 supprimée ❌ (au lieu de race1)
- Race3 renommée ❌ (au lieu de race2)
- Race1 dénivelé modifié ❌ (au lieu de race3)

## Cause racine

Le code utilisait un **double système d'indexation** :

1. **Frontend** : `existing-0`, `existing-1`, `existing-2` font référence aux **indices dans `racesToUpdate[]`**
2. **Backend** : Le code récupérait `existingRaces = findRacesByEditionId()` qui retourne les courses **triées par ID de base de données**

### Exemple concret

```javascript
// racesToUpdate (ordre frontend)
[
  { raceId: 551, raceName: 'Trail enfants' },  // existing-0
  { raceId: 552, raceName: 'LYONSAINTÉLYON' }, // existing-1
  { raceId: 553, raceName: 'Relais 4' }        // existing-2
]

// existingRaces (ordre base de données)
[
  { id: 551, name: 'Trail enfants' },  // Index 0 en DB
  { id: 552, name: 'LYONSAINTÉLYON' }, // Index 1 en DB
  { id: 553, name: 'Relais 4' }        // Index 2 en DB
]
```

Dans ce cas précis, les IDs correspondent, mais **ce n'est pas toujours le cas** :

```javascript
// Cas problématique : courses ajoutées dans le désordre
racesToUpdate = [
  { raceId: 555, ... }, // existing-0
  { raceId: 552, ... }, // existing-1
  { raceId: 559, ... }  // existing-2
]

existingRaces = [
  { id: 552, ... }, // Index 0 en DB (ID le plus ancien)
  { id: 555, ... }, // Index 1 en DB
  { id: 559, ... }  // Index 2 en DB
]

// existing-0 devrait pointer vers raceId 555
// mais existingRaces[0] = race 552 ❌
```

## Solution

Créer un **mapping explicite** `index → raceId` depuis `racesToUpdate` :

```typescript
// ✅ FIX: Créer un mapping index → raceId depuis racesToUpdate
const indexToRaceId = new Map<number, number>()
if (racesToUpdate && Array.isArray(racesToUpdate)) {
  racesToUpdate.forEach((raceUpdate, i) => {
    const raceId = parseInt(raceUpdate.raceId)
    if (!isNaN(raceId)) {
      indexToRaceId.set(i, raceId)
    }
  })
}

// Exemple : indexToRaceId = { 0→555, 1→552, 2→559 }

// Suppression
for (const index of racesToDeleteFromEdits) {
  const raceId = indexToRaceId.get(index) // ✅ Bon ID
  await milesRepo.deleteRace(raceId)
}

// Modification
for (const { index, edits } of existingRaceEdits) {
  const raceId = indexToRaceId.get(index) // ✅ Bon ID
  await milesRepo.updateRace(raceId, updateData)
}
```

## Fichiers modifiés

**Backend** :
- `packages/database/src/services/proposal-domain.service.ts` (lignes 816-882)
  - Création du mapping `indexToRaceId`
  - Utilisation du mapping pour suppression et modification

## Impact

**Avant** :
- ❌ Modifications appliquées aux mauvaises courses
- ❌ Suppressions appliquées aux mauvaises courses
- ❌ Incohérence entre UI et base de données

**Après** :
- ✅ Modifications appliquées aux bonnes courses
- ✅ Suppressions appliquées aux bonnes courses
- ✅ Cohérence garantie entre UI et base de données

## Tests

Tous les tests du fichier `apps/agents/src/__tests__/proposal-application/user-race-edits.test.ts` passent :

```bash
npx jest apps/agents/src/__tests__/proposal-application/user-race-edits.test.ts --runInBand --no-coverage

# ✅ 9 passed, 0 failed
```

**Tests couvrant le fix** :
- `should apply multiple user modifications to existing races` (cas principal)
- `should soft delete existing race when _deleted is true`
- `should delete multiple existing races`
- `should handle existing race distance modification`
- `should handle existing race startDate modification`

## Logs de debugging

Pour tracer le mapping :

```
🔗 [INDEX MAPPING] Map index → raceId:
  mappingSize: 3
  mapping: ["0→554", "1→555", "2→556"]
```

Pour tracer les opérations :

```
✅ Course 554 (index 0) supprimée
✅ Course 555 (index 1) mise à jour via edits utilisateur: { name: 'LYONSAINTÉLYONNNNN' }
✅ Course 556 (index 2) mise à jour via edits utilisateur: { runPositiveElevation: 2101 }
```

## Leçons apprises

1. **Ne jamais supposer l'ordre des données en base** : Les résultats de `findAll()` peuvent être triés par ID, date de création, ou tout autre critère.

2. **Mapper explicitement les indices** : Quand le frontend utilise des indices (`existing-0`, `new-2`), le backend doit reconstruire ce mapping depuis les données structurées (`racesToUpdate`, `racesToAdd`).

3. **Logs de debugging essentiels** : Les logs de mapping permettent de vérifier immédiatement si le bon ID est utilisé.

## Ressources

- Test complet : `apps/agents/src/__tests__/proposal-application/user-race-edits.test.ts`
- Service domain : `packages/database/src/services/proposal-domain.service.ts`
