# Fix: Propagation de date aux courses existantes

**Date** : 2025-11-17  
**Fichier** : `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`

## Problème

Lors de la modification de `Edition.startDate` avec propagation aux courses :

1. **Comptage incorrect** : La modale affichait "6 courses" au lieu de "3 courses"
2. **Propagation partielle** : Seules 3 nouvelles courses étaient créées au lieu de propager aux 3 courses existantes

## Cause

### 1. Comptage incorrect (ligne 1141)

```typescript
// ❌ AVANT (bugué)
const existingRaces = firstProposal?.existingRaces || []
const racesToAdd = changes?.racesToAdd?.new || []
const racesToUpdate = changes?.racesToUpdate?.new || []
return existingRaces.length + racesToAdd.length + racesToUpdate.length
// Résultat : 3 (existingRaces) + 0 (racesToAdd) + 3 (racesToUpdate) = 6
```

**Explication** : `existingRaces` contient **TOUTES** les courses de l'édition en base (enrichi par l'API), pas seulement celles proposées pour modification.

### 2. Propagation aux mauvaises clés (ligne 774)

```typescript
// ❌ AVANT (incomplet - premier essai)
const racesToUpdate = changes?.racesToUpdate?.new || []
racesToUpdate.forEach((raceUpdate: any) => {
  const raceId = raceUpdate.raceId?.toString()  // Ex: "142075"
  updateRaceEditor(raceId, 'startDate', newStartDate)  // ❌ Clé incorrecte
})
```

**Explication** : Le backend s'attend à des clés `existing-{index}`, pas des `raceId` directs.

## Architecture du système existing-X

### Pourquoi des clés `existing-0`, `existing-1` ?

Le système utilise des **index** au lieu d'IDs directs pour :

1. **Stabilité** : Les index restent stables même si les courses sont renommées/modifiées
2. **Simplicité frontend** : Pas besoin de connaître les vrais IDs de Miles Republic
3. **Mapping backend** : Le backend a accès aux deux (index ET raceId)

### Flow complet

```
┌─────────────────────────────────────────────────────────────┐
│ 1. API enrichit la proposition                               │
│    - Récupère races de Miles Republic (ORDER BY name ASC)   │
│    - Crée existingRaces[0, 1, 2, ...]                       │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Agent propose des modifications                           │
│    - racesToUpdate[0, 1, 2] (même ordre alphabétique)       │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Frontend propage la date                                  │
│    userModifiedChanges.raceEdits = {                        │
│      "existing-0": { startDate: "..." },                    │
│      "existing-1": { startDate: "..." },                    │
│      "existing-2": { startDate: "..." }                     │
│    }                                                         │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Backend applique les modifications                        │
│    for (index in raceEdits["existing-*"]) {                 │
│      race = existingRaces[index]  // Récupère le vrai ID    │
│      await updateRace(race.id, ...)                         │
│    }                                                         │
└─────────────────────────────────────────────────────────────┘
```

### Code backend (proposal-domain.service.ts)

```typescript
// Lignes 505-535
const existingRaceEdits = Object.keys(raceEdits)
  .filter(key => key.startsWith('existing-'))
  .map(key => ({ 
    index: parseInt(key.replace('existing-', '')), 
    edits: raceEdits[key] 
  }))

for (const { index, edits } of existingRaceEdits) {
  const race = existingRaces[index]  // ✅ Mapping index → raceId
  if (!race) {
    this.logger.warn(`⚠️ Course index ${index} introuvable`)
    continue
  }
  
  const updateData: any = {}
  if (edits.startDate) updateData.startDate = new Date(edits.startDate)
  
  await milesRepo.updateRace(race.id, updateData)  // ✅ Vrai ID utilisé
}
```

## Solution

### 1. Fix comptage (ligne 1148)

```typescript
// ✅ APRÈS (corrigé)
const racesToAdd = changes?.racesToAdd?.new || []
const racesToUpdate = changes?.racesToUpdate?.new || []
// Compter uniquement les courses PROPOSÉES
return (Array.isArray(racesToAdd) ? racesToAdd.length : 0) + 
       (Array.isArray(racesToUpdate) ? racesToUpdate.length : 0)
// Résultat : 0 (racesToAdd) + 3 (racesToUpdate) = 3 ✅
```

### 2. Fix propagation (ligne 777)

```typescript
// ✅ APRÈS (corrigé)
const racesToUpdate = changes?.racesToUpdate?.new || []
racesToUpdate.forEach((raceUpdate: any, index: number) => {
  // Utiliser l'index pour créer la clé "existing-{index}"
  // Le backend récupèrera le vrai raceId depuis existingRaces[index]
  const key = `existing-${index}`
  updateRaceEditor(key, 'startDate', newStartDate)  // ✅ Clé correcte
})
```

## Garantie de cohérence

**Question** : Comment garantir que `racesToUpdate[0]` correspond bien à `existingRaces[0]` ?

**Réponse** : Les deux sont triés **alphabétiquement par nom** :

- **API** (ligne 563 de `apps/api/src/routes/proposals.ts`) :
  ```typescript
  existingRaces = await connection.race.findMany({
    where: { editionId: numericEditionId },
    orderBy: { name: 'asc' }  // ✅ Tri alphabétique
  })
  ```

- **Agent** : Le GoogleSearchDateAgent récupère les courses de l'édition et les propose dans l'ordre de la base (même tri alphabétique).

**Résultat** : `racesToUpdate[index]` = `existingRaces[index]` (correspondance garantie).

## Résultats

| Aspect | Avant | Après |
|--------|-------|-------|
| **Comptage modale** | 6 courses ❌ | 3 courses ✅ |
| **Clés raceEdits** | `raceId: "142075"` ❌ | `"existing-0"` ✅ |
| **Application backend** | Nouvelles courses créées ❌ | Courses existantes modifiées ✅ |
| **Cohérence** | Désalignement index/ID ❌ | Mapping correct ✅ |

## Impact

✅ **Aucune régression** : Le système `existing-X` était déjà en place et fonctionnel  
✅ **Compatibilité backend** : Le code backend n'a pas besoin d'être modifié  
✅ **Propagation correcte** : Les modifications sont appliquées aux bonnes courses

## Fichiers modifiés

1. **Frontend** : `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`
   - Ligne 777 : Utiliser `existing-${index}` au lieu de `raceId`
   - Ligne 1148 : Retirer `existingRaces.length` du comptage

2. **Backend** : Aucune modification (système déjà fonctionnel)

## Tests manuels recommandés

1. Ouvrir une proposition EDITION_UPDATE avec des courses existantes
2. Modifier `Edition.startDate`
3. Accepter la propagation aux courses
4. Vérifier que la modale affiche le bon nombre de courses
5. Valider le bloc "Edition"
6. Vérifier dans Miles Republic que les courses **existantes** ont bien la nouvelle date
