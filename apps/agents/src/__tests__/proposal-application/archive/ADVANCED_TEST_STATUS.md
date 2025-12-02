# Tests Advanced - État actuel

**Date** : 2 Décembre 2025  
**Fichier** : `apps/agents/src/__tests__/proposal-application/advanced.test.ts`  
**Status** : 🟡 **3/19 tests passent** (16% de réussite)

---

## ✅ Tests qui passent (3/19)

### Edge Cases
- ✅ `should handle empty userModifiedChanges` 
- ✅ `should handle null userModifiedChanges`
- ❌ `should handle empty approvedBlocks with userModifiedChanges`

---

## ❌ Tests qui échouent (16/19)

### Block Application (5 tests - 0/5 passent)
Tous échouent avec des erreurs liées à l'application partielle des blocs `approvedBlocks`.

1. ❌ `should apply only approved blocks`
   - **Erreur** : `expect(received).toBe(expected)` - Les modifications des blocs non approuvés sont quand même appliquées
   - **Attente** : Race avec `runDistance = 10` (bloc races non approuvé)
   - **Résultat** : Race modifiée

2. ❌ `should apply all blocks if approvedBlocks is empty`
3. ❌ `should handle partial block approval`
4. ❌ `should apply organizer block correctly`
5. ❌ `should handle races block with toAdd and toUpdate`

### User Modifications Override (12 tests - 0/12 passent)
Tous échouent car les modifications utilisateur (`userModifiedChanges`) ne sont pas correctement appliquées.

6. ❌ `should override agent proposal with user modification`
7. ❌ `should apply user modification to multiple races`
8. ❌ `should apply user modification to edition fields`
9. ❌ `should apply user modification to event fields`
10. ❌ `should apply user modification to organizer fields`
11. ❌ `should merge user modifications with agent proposal`
12. ❌ `should handle userModifiedChanges for NEW_EVENT`
13. ❌ `should handle userModifiedRaceChanges for racesToAdd`
14. ❌ `should handle racesToAddFiltered`
15. ❌ `should combine userModifiedChanges with approvedBlocks`
16. ❌ `should not apply user modification if block not approved`

### Edge Cases (1 test restant)
17. ❌ `should handle empty approvedBlocks with userModifiedChanges`

---

## 🔍 Problèmes identifiés

### 1. Application partielle des blocs (`approvedBlocks`)

**Symptôme** : Les blocs non approuvés sont quand même appliqués.

**Exemple** :
```typescript
proposal.approvedBlocks = {
  event: true,
  edition: true,
  races: false  // ❌ Ce bloc devrait être ignoré
}

// Résultat : Les races sont quand même modifiées
```

**Cause probable** : La logique de filtrage des blocs dans `proposal-domain.service.ts` ne fonctionne pas correctement.

### 2. Modifications utilisateur (`userModifiedChanges`) non appliquées

**Symptôme** : Les modifications manuelles de l'utilisateur ne prennent pas le dessus sur les propositions agent.

**Exemple** :
```typescript
// Agent propose
proposal.changes = {
  races: {
    toUpdate: [{ raceId: 123, updates: { runDistance: { old: 10, new: 10 } } }]
  }
}

// User override
proposal.userModifiedChanges = {
  races: {
    123: { runDistance: 12 }  // ❌ Cette valeur devrait être appliquée
  }
}

// Résultat : runDistance = 10 (agent) au lieu de 12 (user)
```

**Cause probable** : Les `userModifiedChanges` ne sont pas mergés correctement avec les `changes` avant application.

---

## 🚧 Corrections nécessaires dans `proposal-domain.service.ts`

### Priorité 1 : Filtrage des blocs (`approvedBlocks`)

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`  
**Lignes** : ~100-120 (fonction `filterChangesByApprovedBlocks`)

**Action requise** :
- ✅ Vérifier que les blocs non approuvés sont bien exclus
- ✅ Gérer le cas `approvedBlocks = {}` (tout approuver)
- ✅ Gérer les sous-blocs (races.toUpdate, races.toAdd, races.toDelete)

### Priorité 2 : Merge des modifications utilisateur

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`  
**Lignes** : ~50-60 (début de `applyProposal`)

**Action requise** :
- ✅ Merger `userModifiedChanges` dans `changes` AVANT filtrage des blocs
- ✅ Priorité : `userModifiedChanges` > `changes` (agent)
- ✅ Gérer les modifications de races (`userModifiedRaceChanges`)
- ✅ Gérer le filtrage des courses (`racesToAddFiltered`)

---

## 📝 Plan d'action

### Étape 1 : Analyser le code actuel
- [ ] Lire `proposal-domain.service.ts` lignes 50-150
- [ ] Comprendre la logique actuelle de `filterChangesByApprovedBlocks`
- [ ] Comprendre le merge de `userModifiedChanges`

### Étape 2 : Corriger le filtrage des blocs
- [ ] Fix ligne ~107 : Vérifier que `selectedChanges` n'est pas null avant `Object.keys`
- [ ] Fix `filterChangesByApprovedBlocks` : Exclure correctement les blocs non approuvés
- [ ] Gérer les sous-structures (`races.toUpdate`, `races.toAdd`, etc.)

### Étape 3 : Corriger le merge des modifications utilisateur
- [ ] Merger `userModifiedChanges` dans `changes` avant tout traitement
- [ ] Priorité explicite : user > agent
- [ ] Gérer `userModifiedRaceChanges` correctement
- [ ] Gérer `racesToAddFiltered`

### Étape 4 : Validation
- [ ] Lancer `npm run test:proposals:advanced`
- [ ] Objectif : **19/19 tests passent** ✅

---

## 🎯 Objectif final

| Suite | Tests | Statut actuel | Objectif |
|-------|-------|---------------|----------|
| NEW_EVENT | 28 | ✅ 28/28 (100%) | ✅ |
| EDITION_UPDATE | 14 | ✅ 14/14 (100%) | ✅ |
| RACE_OPERATIONS | 21 | ✅ 21/21 (100%) | ✅ |
| **ADVANCED** | **19** | **🟡 3/19 (16%)** | **✅ 19/19 (100%)** |
| **TOTAL** | **82** | **🟡 66/82 (80%)** | **✅ 82/82 (100%)** |

---

## 📚 Ressources

- Tests : `apps/agents/src/__tests__/proposal-application/advanced.test.ts`
- Service : `packages/database/src/services/proposal-domain.service.ts`
- Helpers : `apps/agents/src/__tests__/proposal-application/helpers/`
- Documentation : `apps/agents/src/__tests__/proposal-application/README.md`

---

**Maintenu par** : Équipe Data Agents  
**Dernière mise à jour** : 2 Décembre 2025 11:40 CET
