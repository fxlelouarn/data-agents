# Plan de Fix : Tests Advanced - Conversion des Données

## Problème Identifié

Les tests appellent :
```typescript
await domainService.applyProposal(proposal.id, proposal.changes as any, { ... })
```

Mais `applyProposal()` attend :
```typescript
async applyProposal(
  proposalId: string,
  selectedChanges: Record<string, any>,  // ← Valeurs SÉLECTIONNÉES
  options: ApplyOptions = {}
)
```

## Différence entre `changes` et `selectedChanges`

### Structure `changes` (Agent)
```typescript
{
  name: { old: 'Trail Original', new: 'Trail Modifié' },
  startDate: { old: '2026-03-15T09:00:00.000Z', new: '2026-03-20T09:00:00.000Z' },
  races: {
    toUpdate: [{
      raceId: 123,
      raceName: '10km',
      updates: { runDistance: { old: 10, new: 12 } }
    }]
  }
}
```

### Structure `selectedChanges` (API)
```typescript
{
  name: 'Trail Modifié',  // ✅ Valeur "new" sélectionnée
  startDate: '2026-03-20T09:00:00.000Z',  // ✅ Valeur "new" sélectionnée
  races: {  // ✅ Sous-structures conservées telles quelles
    toUpdate: [{
      raceId: 123,
      raceName: '10km',
      updates: { runDistance: { old: 10, new: 12 } }
    }]
  }
}
```

## Solution

### Helper Créé
`convertChangesToSelectedChanges()` dans `helpers/fixtures.ts` :
- Extrait les valeurs `new` des champs `{ old, new }`
- Conserve les objets complexes (races, organizer) tels quels

###Utilisation dans les Tests
```typescript
import { convertChangesToSelectedChanges } from './helpers'

const proposal = await createEditionUpdateProposal(eventId, editionId, {...})

// ❌ AVANT (incorrect)
await domainService.applyProposal(proposal.id, proposal.changes as any, {...})

// ✅ APRÈS (correct)
const selectedChanges = convertChangesToSelectedChanges(proposal.changes as any)
await domainService.applyProposal(proposal.id, selectedChanges, {...})
```

## Tests à Modifier

### 1. Block Application (5 tests)
- ✅ `should apply only approved blocks`
- ✅ `should apply all blocks if approvedBlocks is empty`
- ⚠️ `should handle partial block approval` (skip organizer)
- ⚠️ `should apply organizer block correctly` (skip organizer)
- ✅ `should handle races block with toAdd and toUpdate`

### 2. User Modifications Override (11 tests)
Tous ces tests nécessitent la même modification + fix du merge userModifiedChanges :
- `should override agent proposal with user modification`
- `should apply user modification to multiple races`
- `should apply user modification to edition fields`
- `should apply user modification to event fields`
- ⚠️ `should apply user modification to organizer fields` (skip organizer)
- `should merge user modifications with agent proposal`
- `should handle userModifiedChanges for NEW_EVENT`
- `should handle userModifiedRaceChanges for racesToAdd`
- `should handle racesToAddFiltered`
- `should combine userModifiedChanges with approvedBlocks`
- `should not apply user modification if block not approved`

### 3. Edge Cases (3 tests)
- `should handle empty userModifiedChanges`
- `should handle null userModifiedChanges`
- `should handle empty approvedBlocks with userModifiedChanges`

## Ordre d'Implémentation

### Phase 1 : Conversion simple (tests Block Application)
1. Modifier les 3 tests qui ne dépendent pas d'organizer
2. Vérifier que le filtrage des blocs fonctionne

### Phase 2 : Merge intelligent userModifiedChanges
Problème actuel : `userModifiedChanges` écrase `changes.races` au lieu de fusionner.

Solution : Implémenter `mergeUserModificationsIntoChanges()` qui :
- Garde la structure `changes`
- Applique les modifications utilisateur DANS cette structure
- Exemple :
  ```typescript
  // Agent
  changes.races.toUpdate[0].updates.runDistance = { old: 10, new: 10 }
  // User
  userModifiedChanges.races[123].runDistance = 12
  // Résultat après merge intelligent
  changes.races.toUpdate[0].updates.runDistance = { old: 10, new: 12 }
  ```

### Phase 3 : Tests userModifiedChanges
1. Implémenter le merge intelligent
2. Modifier les 9 tests qui utilisent userModifiedChanges
3. Vérifier que les valeurs user sont bien appliquées

### Phase 4 : Edge cases
1. Modifier les 3 derniers tests

## Tests à Skip (Table Organizer n'existe plus)
- `should handle partial block approval`
- `should apply organizer block correctly`
- `should apply user modification to organizer fields`

Total : 3 tests à skip (temporairement)

## Métriques Cibles

| État | Tests Passing | Tests Failing | Tests Skipped |
|------|---------------|---------------|---------------|
| Actuel | 3/19 (16%) | 16/19 (84%) | 0/19 (0%) |
| Phase 1 | 6/19 (32%) | 10/19 (53%) | 3/19 (16%) |
| Phase 2-3 | 16/19 (84%) | 0/19 (0%) | 3/19 (16%) |
| Phase 4 | 19/19 (100%) | 0/19 (0%) | 0/19 (0%) |

## Prochaine Action

Commencer par la Phase 1 : Modifier le test `should apply only approved blocks` comme exemple.
