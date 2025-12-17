# Implémentation: Unification de la logique de suppression des courses

**Date**: 2025-12-17  
**Branche**: `fix/unify-races-delete-logic`  
**Statut**: ✅ Implémenté

## Résumé des modifications

### Problème résolu

Lors de l'application d'une ProposalApplication pour l'événement 1108 (Rotatrail), les courses étaient supprimées **deux fois** par deux chemins différents, et l'ordre d'exécution causait des mises à jour de courses avant leur suppression.

**Logs avant fix** :
```
🗑️  Suppression de 2 course(s) (via raceEdits._deleted)
  ✅ Course 151163 supprimée
  ✅ Course 151165 supprimée
...
🗑️  Suppression de 2 course(s) de l'édition 42592
  ✅ Course 151163 supprimée  ← DOUBLON
  ✅ Course 151165 supprimée  ← DOUBLON
```

### Solution implémentée

1. **Nouvelle méthode `extractAllRacesToDelete()`** qui consolide toutes les sources de suppression
2. **Ordre d'exécution unifié** : DELETE → UPDATE → ADD
3. **Suppression des sections dupliquées** de suppression

## Fichiers modifiés

| Fichier | Modifications |
|---------|---------------|
| `packages/database/src/services/proposal-domain.service.ts` | Refactoring principal |

## Détails techniques

### 1. Nouvelle méthode `extractAllRacesToDelete()`

**Localisation** : Ligne ~2071

```typescript
private extractAllRacesToDelete(
  changes: Record<string, any>,
  userModifiedChanges: Record<string, any> | null,
  racesToUpdate: any[] | undefined
): Set<number>
```

**Sources consolidées** :
1. `changes.racesToDelete` (number[] ou {raceId, raceName}[])
2. `changes.races.toDelete` (number[] ou {raceId, raceName}[])
3. `userModifiedChanges.racesToDelete` (format objet)
4. `userModifiedChanges.raceEdits[key]._deleted === true`

**Retourne** : Un `Set<number>` pour garantir l'unicité des IDs

### 2. Nouvel ordre d'exécution dans `applyEditionUpdate()`

**Avant** (ordre problématique) :
```
1. UPDATE races (racesChanges)
2. UPDATE races (racesToUpdate)
3. ADD races
4. UPDATE via raceEdits
5. DELETE via racesToDeleteFromEdits  ← Suppression #1
6. DELETE via racesToDelete           ← Suppression #2 (doublon!)
```

**Après** (ordre unifié) :
```
PHASE 1/3: DELETE - Suppression unifiée via extractAllRacesToDelete()
PHASE 2/3: UPDATE - Mise à jour (ignore les courses supprimées)
PHASE 3/3: ADD - Ajout de nouvelles courses
```

### 3. Ignorer les courses supprimées lors des UPDATE

Chaque section UPDATE vérifie maintenant si la course est dans `racesToDeleteSet` :

```typescript
// ✅ FIX 2025-12-17: Ignorer les courses déjà supprimées
if (racesToDeleteSet.has(raceId)) {
  this.logger.info(`  ⏭️  Course ${raceId} ignorée (déjà supprimée)`)
  continue
}
```

### 4. Sections supprimées

Les sections suivantes ont été supprimées car redondantes :

- **Section "Traiter les suppressions"** (anciennement lignes ~1107-1124)
  - Supprimait via `racesToDeleteFromEdits`
  
- **Section "Delete races if any"** (anciennement lignes ~1178-1191)
  - Supprimait via `racesToDelete`

## Logs après fix

```
🗑️  [PHASE 1/3] SUPPRESSION de 2 course(s) - Ordre unifié
  📋 IDs à supprimer: [151163, 151165]
  📍 Source userModifiedChanges.racesToDelete: 2 ID(s)
  📍 Source raceEdits._deleted: +0 ID(s)  ← Déjà dans la source précédente
  ✅ Course 151163 supprimée
  ✅ Course 151165 supprimée

✏️  [PHASE 2/3] UPDATE - Mise à jour des courses existantes
  ⏭️  Course 151163 ignorée (déjà supprimée)
  ⏭️  Course 151165 ignorée (déjà supprimée)
  ✅ Course 151164 mise à jour

➕ [PHASE 3/3] ADD - Ajout de nouvelles courses
  ✅ Course créée: 200640 (Trail 11 km)
```

## Tests

Les tests existants passent tous (84 tests).

Un nouveau fichier de test a été créé pour documenter les comportements attendus :
- `apps/agents/src/__tests__/proposal-application/race-delete-unification.test.ts`

Note : Ces tests nécessitent une base de données de test configurée pour s'exécuter.

## Rétrocompatibilité

✅ **Tous les formats existants sont supportés** :

| Format | Source | Exemple |
|--------|--------|---------|
| `number[]` | changes.racesToDelete | `[151163, 151165]` |
| `{raceId}[]` | changes.racesToDelete | `[{raceId: 151163, raceName: "Marche"}]` |
| `number[]` | changes.races.toDelete | `[151163]` |
| Clé numérique | raceEdits | `{"151163": {_deleted: true}}` |
| Clé existing-index | raceEdits | `{"existing-0": {_deleted: true}}` |
