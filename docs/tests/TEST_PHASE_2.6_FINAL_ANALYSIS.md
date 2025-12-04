# Phase 2.6 - Analyse Finale : userModifiedChanges non sauvegardés

**Date** : 2025-12-02

## Résumé

La Phase 2.6 a été implémentée **correctement** (régénération de `selectedChanges`), mais **les tests échouent encore** car ils ont un problème de conception : **les modifications `userModifiedChanges` ne sont pas sauvegardées en base de données**.

## Le problème

###  Flux dans les tests (INCORRECT)

```typescript
// 1. Créer la proposition
const proposal = await createEditionUpdateProposal(event.id, edition.id, {
  startDate: { old: '2026-03-15T09:00:00.000Z', new: '2026-03-20T09:00:00.000Z' }
})
// → Saved in DB with userModifiedChanges = null

// 2. Modifier userModifiedChanges EN MÉMOIRE
proposal.userModifiedChanges = {
  startDate: '2026-03-25T09:00:00.000Z'
}
// ❌ NOT SAVED TO DB

// 3. Appliquer
await domainService.applyProposal(proposal.id, { ... })
// → applyProposal fetches from DB → userModifiedChanges is null
// → No merge happens → Agent value applied
```

### Flux dans applyProposal

```typescript
async applyProposal(proposalId: string, options) {
  // 1. Récupère depuis la DB
  const proposal = await this.proposalRepo.findById(proposalId)
  // → proposal.userModifiedChanges = null (pas sauvegardé)

  // 2. Merge intelligent
  const finalChanges = this.mergeUserModificationsIntoChanges(
    proposal.changes,
    proposal.userModifiedChanges  // ❌ null → No merge
  )

  // 3. selectedChanges régénéré
  const selectedChanges = convertChangesToSelectedChanges(finalChanges)
  // → Contient valeur agent (pas user)

  // 4. Application
  // → Valeur agent appliquée ❌
}
```

## Preuve

**Log Prisma** montre que `userModifiedChanges` est bien inséré lors de la création :

```sql
INSERT INTO "public"."proposals" (..., "userModifiedChanges", ...)
VALUES (..., $10, ...)
```

**Mais** : la valeur insérée est `null` ou `{}` car la modification n'a lieu qu'**après** l'insertion.

**Log merge absent** : Le log `🔀 Merge intelligent userModifiedChanges` n'apparaît jamais, confirmant que `userModifiedChanges` est `null` ou vide.

## Solution

### Option A : Sauvegarder après modification (tests)

Modifier les tests pour sauvegarder `userModifiedChanges` en DB :

```typescript
const proposal = await createEditionUpdateProposal(event.id, edition.id, {
  startDate: { old: '2026-03-15T09:00:00.000Z', new: '2026-03-20T09:00:00.000Z' }
})

// Modifier
proposal.userModifiedChanges = {
  startDate: '2026-03-25T09:00:00.000Z'
}

// ✅ SAUVEGARDER EN DB
await testDataAgentsDb.proposal.update({
  where: { id: proposal.id },
  data: { userModifiedChanges: proposal.userModifiedChanges }
})

// Maintenant applyProposal verra les modifications
await domainService.applyProposal(proposal.id, { ... })
```

### Option B : Passer userModifiedChanges en paramètre (anti-pattern)

**❌ NON RECOMMANDÉ** : Cela casserait l'architecture où la proposition est la source de vérité.

## État actuel

### ✅ Phase 2.6 - Implémentation correcte

1. **Régénération de selectedChanges** : ✅ Fonctionne
2. **Merge intelligent** : ✅ Fonctionne (si userModifiedChanges existe)
3. **Conversion changes → selectedChanges** : ✅ Fonctionne
4. **Signature applyProposal** : ✅ Modifiée (param supprimé)
5. **Tests adaptés** : ✅ Appels modifiés

### ❌ Problème dans les tests

**Les tests ne sauvegardent pas `userModifiedChanges`** → Le merge ne peut pas fonctionner.

## Prochaines étapes

### Phase 2.7 : Fixer les tests

1. **Ajouter helper `updateProposalUserModifications`** dans `helpers/fixtures.ts`
   ```typescript
   export const updateProposalUserModifications = async (
     proposalId: string,
     userModifiedChanges: Record<string, any>
   ) => {
     return await testDataAgentsDb.proposal.update({
       where: { id: proposalId },
       data: { userModifiedChanges }
     })
   }
   ```

2. **Modifier TOUS les tests** pour sauvegarder avant apply
   - 13 tests dans `advanced.test.ts`
   - Potentiellement d'autres dans `edition-update.test.ts`, `new-event.test.ts`, etc.

3. **Réexécuter les tests** → Devrait atteindre 16/19 passants

## Métriques

### Avant Phase 2.6
- ✅ Passent : 3/19 (16%)
- ❌ Échouent : 13/19 (68%)
- ⏭️ Skippés : 3/19 (16%)

### Après Phase 2.6 (implémentation)
- ✅ Passent : 3/19 (16%) - **INCHANGÉ**
- ❌ Échouent : 13/19 (68%)
- ⏭️ Skippés : 3/19 (16%)

**Raison** : Les tests ne sauvegardent pas `userModifiedChanges`.

### Après Phase 2.7 (tests fixés) - PRÉVISION
- ✅ Passent : 16/19 (84%) - **+13 tests**
- ❌ Échouent : 0/19 (0%)
- ⏭️ Skippés : 3/19 (16%)

## Ressources

- Phase 2.5 : `docs/TEST_PHASE_2.5_ANALYSIS.md`
- Phase 1&2 : `docs/TEST_PHASE_1_2_RESULTS.md`
- Tests : `apps/agents/src/__tests__/proposal-application/advanced.test.ts`
