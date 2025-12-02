# Analyse Phase 2.5 - Problème Identifié

**Date** : 2025-12-02

## Modifications Phase 2.5

### ✅ Ce qui a été fait

1. **`applyEventUpdate`** (ligne 323) : Change `buildUpdateData(selectedChanges)` → `buildUpdateData(changes)`
2. **`applyRaceUpdate`** (ligne 880) : Change `buildUpdateData(selectedChanges)` → `buildUpdateData(changes)`

### ❌ Problème identifié

**Le vrai problème n'est PAS dans les fonctions `apply*`, mais dans la fonction `applyProposal`** :

#### Flux actuel (ligne 36-127)

```typescript
async applyProposal(
  proposalId: string,
  selectedChanges: Record<string, any>,  // ❌ Passé depuis les tests, ne contient PAS userModifiedChanges
  options: ApplyOptions = {}
) {
  // ... récupère proposal

  // ✅ Merge intelligent créé
  const finalChanges = this.mergeUserModificationsIntoChanges(
    proposal.changes,
    proposal.userModifiedChanges
  )

  // ❌ PROBLÈME: selectedChanges est utilisé tel quel pour le filtrage
  filteredSelectedChanges = this.filterChangesByApprovedBlocks(selectedChanges, approvedBlocks)
  filteredFinalChanges = this.filterChangesByApprovedBlocks(finalChanges, approvedBlocks)

  // ❌ Les fonctions apply* reçoivent filteredSelectedChanges qui ne contient PAS userModifiedChanges
  result = await this.applyEditionUpdate(
    proposal.editionId,
    filteredFinalChanges,      // ✅ Contient userMods
    filteredSelectedChanges,   // ❌ Ne contient PAS userMods
    options,
    proposal
  )
}
```

#### Tests actuels (advanced.test.ts ligne 83)

```typescript
const selectedChanges = convertChangesToSelectedChanges(proposal.changes as any)
await domainService.applyProposal(
  proposal.id,
  selectedChanges,  // ❌ Ne contient que proposal.changes, pas userModifiedChanges
  { milesRepublicDatabaseId: 'miles-republic-test' }
)
```

## Diagnostic

### Symptôme

- **13 tests échouent** : Les modifications utilisateur ne sont pas appliquées
- **Même les tests qui passaient avant régressent** : Les valeurs agent sont appliquées au lieu des valeurs user

### Cause racine

**`selectedChanges` n'est jamais régénéré depuis `finalChanges`**.

Le paramètre `selectedChanges` passé à `applyProposal` provient de `proposal.changes` (via les tests), mais il devrait être recalculé depuis `finalChanges` (après merge).

### Solution requise

**Option A : Supprimer le paramètre `selectedChanges` de `applyProposal`**

Puisque `finalChanges` contient déjà le merge complet (agent + user), on peut :

1. Supprimer le paramètre `selectedChanges` de la signature `applyProposal`
2. Re-calculer `selectedChanges` depuis `finalChanges` via `convertChangesToSelectedChanges`
3. Utiliser ce nouveau `selectedChanges` pour le filtrage

```typescript
async applyProposal(
  proposalId: string,
  // ❌ Supprimer: selectedChanges: Record<string, any>,
  options: ApplyOptions = {}
) {
  const proposal = await this.proposalRepo.findById(proposalId)

  // Merge intelligent
  const finalChanges = this.mergeUserModificationsIntoChanges(
    proposal.changes,
    proposal.userModifiedChanges
  )

  // ✅ NOUVEAU: Régénérer selectedChanges depuis finalChanges
  const selectedChanges = convertChangesToSelectedChanges(finalChanges)

  // Filtrage avec le bon selectedChanges
  filteredSelectedChanges = this.filterChangesByApprovedBlocks(selectedChanges, approvedBlocks)
  filteredFinalChanges = this.filterChangesByApprovedBlocks(finalChanges, approvedBlocks)

  // ✅ Les fonctions apply* reçoivent maintenant les bonnes valeurs
  result = await this.applyEditionUpdate(
    proposal.editionId,
    filteredFinalChanges,
    filteredSelectedChanges,  // ✅ Contient maintenant userMods
    options,
    proposal
  )
}
```

**Option B : Garder le paramètre mais le réutiliser uniquement pour les tests legacy**

Ajouter un paramètre optionnel pour les tests :

```typescript
async applyProposal(
  proposalId: string,
  selectedChanges?: Record<string, any>,  // Optionnel
  options: ApplyOptions = {}
) {
  const proposal = await this.proposalRepo.findById(proposalId)

  const finalChanges = this.mergeUserModificationsIntoChanges(
    proposal.changes,
    proposal.userModifiedChanges
  )

  // ✅ Si selectedChanges n'est pas fourni, le régénérer
  if (!selectedChanges) {
    selectedChanges = convertChangesToSelectedChanges(finalChanges)
  }

  // Suite identique...
}
```

## Impact des modifications Phase 2.5

| Fonction | Avant | Après Phase 2.5 | Impact |
|----------|-------|-----------------|--------|
| `applyEventUpdate` | `buildUpdateData(selectedChanges)` | `buildUpdateData(changes)` | ✅ Lit `changes` (contient userMods) |
| `applyRaceUpdate` | `buildUpdateData(selectedChanges)` | `buildUpdateData(changes)` | ✅ Lit `changes` (contient userMods) |
| `applyEditionUpdate` | Déjà `for (const [field, value] of Object.entries(changes))` | Inchangé | ✅ Lit déjà `changes` |

**Conclusion** : Les modifications Phase 2.5 sont **partiellement correctes** mais insuffisantes. Le vrai problème est **en amont** dans `applyProposal`.

## Prochaines étapes

### Étape 2.6 : Régénération de selectedChanges

1. **Importer `convertChangesToSelectedChanges`** dans `proposal-domain.service.ts`
2. **Supprimer le paramètre** `selectedChanges` de la signature `applyProposal` (Option A)
3. **Régénérer `selectedChanges`** depuis `finalChanges` après le merge
4. **Adapter les tests** pour ne plus passer `selectedChanges` en paramètre
5. **Réexécuter les tests** pour validation

### Étape 2.7 : Vérification complète

1. Tous les tests doivent passer (16/19 avec 3 skippés)
2. Les userModifiedChanges doivent être appliqués
3. Le filtrage par blocs doit fonctionner
4. Créer documentation finale Phase 2

## Métriques

### Avant Phase 2.5
- ✅ Passent : 3/19 (16%)
- ❌ Échouent : 13/19 (68%)
- ⏭️ Skippés : 3/19 (16%)

### Après Phase 2.5
- ✅ Passent : 3/19 (16%) - **AUCUN CHANGEMENT**
- ❌ Échouent : 13/19 (68%)
- ⏭️ Skippés : 3/19 (16%)

**Raison** : Le problème de `selectedChanges` non régénéré n'a pas été adressé.

## Ressources

- Tests : `apps/agents/src/__tests__/proposal-application/advanced.test.ts`
- Service : `packages/database/src/services/proposal-domain.service.ts`
- Résultats Phase 1&2 : `docs/TEST_PHASE_1_2_RESULTS.md`
