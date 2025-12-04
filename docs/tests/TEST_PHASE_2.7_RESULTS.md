# Phase 2.7 - Fix Tests avec Sauvegarde DB des userModifiedChanges

**Date** : 2025-12-02  
**Statut** : ✅ Implémentée avec succès partiel

## Objectif

Corriger les 13 tests qui modifient `userModifiedChanges` en mémoire sans les sauvegarder en base de données, empêchant le merge intelligent de fonctionner.

## Implémentation

### 1. Nouveau Helper (fixtures.ts)

```typescript
/**
 * ✅ PHASE 2.7 : Met à jour les userModifiedChanges d'une proposition en DB
 */
export const updateProposalUserModifications = async (
  proposalId: string,
  userModifiedChanges: Record<string, any>
) => {
  return await testDb.proposal.update({
    where: { id: proposalId },
    data: { userModifiedChanges }
  })
}
```

**Utilisation dans les tests** :

```typescript
// Avant (bugué)
proposal.userModifiedChanges = { startDate: '2026-03-25T09:00:00.000Z' }
await domainService.applyProposal(proposal.id, { ... })

// Après (corrigé)
proposal.userModifiedChanges = { startDate: '2026-03-25T09:00:00.000Z' }
await updateProposalUserModifications(proposal.id, proposal.userModifiedChanges) // ✅ Sauvegarde DB
await domainService.applyProposal(proposal.id, { ... })
```

### 2. Tests Modifiés

**Fichier** : `apps/agents/src/__tests__/proposal-application/advanced.test.ts`

| # | Test | Ligne | Modification |
|---|------|-------|--------------|
| 1 | should override agent proposal | 302-319 | ✅ Ajout sauvegarde DB |
| 2 | should apply user modification to multiple races | 354-375 | ✅ Ajout sauvegarde DB |
| 3 | should apply user modification to edition fields | 391-404 | ✅ Ajout sauvegarde DB |
| 4 | should apply user modification to event fields | 418-431 | ✅ Ajout sauvegarde DB |
| 5 | should merge user modifications | 495-511 | ✅ Ajout sauvegarde DB |
| 6 | should handle userModifiedChanges for NEW_EVENT | 529-551 | ✅ Ajout sauvegarde DB |
| 7 | should handle userModifiedRaceChanges for racesToAdd | 567-588 | ✅ Converti + sauvegarde |
| 8 | should handle racesToAddFiltered | 611-623 | ✅ Ajout sauvegarde DB |
| 9 | should combine userModifiedChanges with approvedBlocks | 655-673 | ✅ Ajout sauvegarde DB |
| 10 | should not apply user modification if block not approved | 693-705 | ✅ Ajout sauvegarde DB |
| 11 | should handle empty userModifiedChanges | 723-726 | ✅ Ajout sauvegarde DB |
| 12 | should handle null userModifiedChanges | 747-750 | ⏭️ Pas de sauvegarde (null) |
| 13 | should handle empty approvedBlocks | 774-777 | ✅ Ajout sauvegarde DB |

**Fichier** : `apps/agents/src/__tests__/proposal-application/race-operations.test.ts`

| # | Test | Ligne | Modification |
|---|------|-------|--------------|
| 1 | should allow filtering toAdd with racesToAddFiltered | 746-749 | ✅ Remplacé par helper |

### 3. Conversion userModifiedRaceChanges → raceEdits

**Test 7** utilisait `proposal.userModifiedRaceChanges` qui n'existe pas dans le schéma Prisma.

**Avant** :
```typescript
proposal.userModifiedRaceChanges = {
  'new-0': { runDistance: 12 }
}
```

**Après** :
```typescript
proposal.userModifiedChanges = {
  raceEdits: {
    'new-0': { runDistance: 12 }
  }
}
await updateProposalUserModifications(proposal.id, proposal.userModifiedChanges)
```

## Résultats

### Métriques

| Métrique | Avant Phase 2.7 | Après Phase 2.7 | Gain |
|----------|-----------------|-----------------|------|
| **Tests passants** | 3/19 (16%) | **11/19 (58%)** | **+8 tests** |
| **Tests échouants** | 13/19 (68%) | **5/19 (26%)** | **-8 tests** |
| **Tests skippés** | 3/19 (16%) | 3/19 (16%) | 0 |

✅ **Objectif atteint** : 8 tests qui échouaient à cause de la non-sauvegarde passent maintenant.

### Tests Encore Échouants (5)

#### 1. "should apply only approved blocks" (ligne 38-99)

**Erreur** : `Expected: 10 Received: 12`

**Cause probable** : Le test modifie `proposal.approvedBlocks` en mémoire sans sauvegarder en DB.

```typescript
proposal.approvedBlocks = {
  event: true,
  edition: true,
  races: false  // ❌ Ne devrait pas appliquer races
}

// When
await domainService.applyProposal(proposal.id, { ... })

// Then: Race inchangée
expect(race!.runDistance).toBe(10) // ❌ FAIL: 12 (bloc appliqué quand même)
```

**Fix** : Sauvegarder `approvedBlocks` en DB avant `applyProposal()`.

#### 2. "should handle races block with toAdd and toUpdate" (ligne 226-272)

**Erreur** : `Expected: 'Event Test' Received: 'New Event'`

**Cause probable** : Même problème avec `approvedBlocks`.

#### 3. "should handle userModifiedRaceChanges for racesToAdd" (ligne 553-590)

**Erreur** : `Expected: 12 Received: 10`

**Cause probable** : La structure `raceEdits.new-0` n'est pas lue correctement par le backend.

**Log backend** :
```
[INFO] 🔍 [RACE EDITS] Contenu complet de raceEdits: { keys: [], keysCount: 0, raceEdits: '{}' }
```

**Analyse** : Le merge intelligent ne trouve pas `raceEdits` dans `userModifiedChanges`.

**Fix possible** : Vérifier que le backend lit bien `userModifiedChanges.raceEdits['new-0']`.

#### 4. "should combine userModifiedChanges with approvedBlocks" (ligne 625-673)

**Erreur** : `Expected: 2026-03-15T09:00:00.000Z Received: 2026-03-20T09:00:00.000Z`

**Cause probable** : `approvedBlocks.edition = false` mais la date est quand même modifiée.

**Fix** : Sauvegarder `approvedBlocks` en DB.

#### 5. "should not apply user modification if block not approved" (ligne 646-705)

**Erreur** : `Expected: 'Trail' Received: 'Trail User'`

**Cause** : `approvedBlocks.event = false` mais le nom est quand même modifié.

**Fix** : Sauvegarder `approvedBlocks` en DB.

## Analyse des Causes

### approvedBlocks Non Sauvegardé

**4 tests échouent** parce que `proposal.approvedBlocks` est modifié en mémoire mais pas sauvegardé en DB.

**Solution** : Créer un helper `updateProposalApprovedBlocks()` similaire à `updateProposalUserModifications()`.

### raceEdits Non Lu (1 test)

**1 test échoue** parce que la structure `userModifiedChanges.raceEdits` n'est pas lue par le backend.

**Vérifications nécessaires** :
1. Le backend lit-il `userModifiedChanges.raceEdits` ?
2. Le format `raceEdits['new-0']` est-il correct ?

## Prochaine Étape : Phase 2.8

### Créer helper pour approvedBlocks

```typescript
export const updateProposalApprovedBlocks = async (
  proposalId: string,
  approvedBlocks: Record<string, boolean>
) => {
  return await testDb.proposal.update({
    where: { id: proposalId },
    data: { approvedBlocks }
  })
}
```

### Modifier les 4 tests

Ajouter `await updateProposalApprovedBlocks(proposal.id, proposal.approvedBlocks)` avant `applyProposal()`.

### Prévision après Phase 2.8

- ✅ Passent : **15/19** (79%) - **+4 tests**
- ❌ Échouent : **1/19** (5%) - "userModifiedRaceChanges"
- ⏭️ Skippés : 3/19 (16%)

## Fichiers Modifiés

1. **Helper** : `apps/agents/src/__tests__/proposal-application/helpers/fixtures.ts` (+33 lignes)
2. **Export** : `apps/agents/src/__tests__/proposal-application/helpers/index.ts` (+1 ligne)
3. **Tests advanced** : `apps/agents/src/__tests__/proposal-application/advanced.test.ts` (+13 blocs sauvegarde)
4. **Tests races** : `apps/agents/src/__tests__/proposal-application/race-operations.test.ts` (+1 import, -3 lignes directes)

## Ressources

- Phase 2.6 : `docs/TEST_PHASE_2.6_FINAL_ANALYSIS.md`
- Tests : `apps/agents/src/__tests__/proposal-application/advanced.test.ts`
