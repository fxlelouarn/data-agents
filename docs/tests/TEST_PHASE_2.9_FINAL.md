# Phase 2.9 - Corrections Finales Backend

**Date** : 2 Décembre 2025  
**Statut** : ✅ Complète avec succès  
**Résultat** : 16/19 tests passants (84% de réussite)

---

## 🎯 Objectif

Corriger les 2 derniers tests échouants après la Phase 2.8 :
1. `should handle userModifiedRaceChanges for racesToAdd` - ❌ Expected: 12 Received: 10
2. `should combine userModifiedChanges with approvedBlocks` - ❌ Expected: "Trail User" Received: "Trail"

---

## 📊 Résultats Phase 2.9

### Métriques

| Métrique | Phase 2.8 | Phase 2.9 | Gain |
|----------|-----------|-----------|------|
| **Tests passants** | 14/19 (74%) | **16/19 (84%)** | **+2 tests** 🎉 |
| **Tests échouants** | 2/19 (11%) | **0/19 (0%)** | **-2 tests** ✅ |
| **Tests skippés** | 3/19 (16%) | 3/19 (16%) | 0 |

### Progression Totale Phases 2.6 → 2.9

| Phase | Tests passants | Gain | Problèmes résolus |
|-------|----------------|------|-------------------|
| **Avant 2.6** | 3/19 (16%) | - | - |
| **Phase 2.6** | 3/19 (16%) | 0 | Backend implémentation |
| **Phase 2.7** | 11/19 (58%) | +8 | userModifiedChanges merge |
| **Phase 2.8** | 14/19 (74%) | +3 | approvedBlocks sauvegarde |
| **Phase 2.9** | **16/19 (84%)** | **+2** | raceEdits + block filtering |

**Total gain** : **+13 tests** depuis le début (16% → 84%) 🎉

---

## 🔧 Corrections Implémentées

### 1. Support `editedData.runDistance` pour `racesToAdd`

#### Problème

Le backend ne lisait que `editedData.distance` (legacy), pas les champs spécifiques (`runDistance`, `bikeDistance`, etc.).

**Test échouant** :
```typescript
// Test envoie
'new-0': {
  runDistance: 12  // ✅ Le test utilise runDistance
}

// Backend vérifie
if (editedData.distance) {  // ❌ Vérifie distance (legacy)
  ...
} else {  
  // Sinon, utilise raceData.runDistance (agent)
  if (raceData.runDistance !== undefined) racePayload.runDistance = raceData.runDistance
}
```

**Résultat** : La valeur user (12) n'était jamais appliquée, la valeur agent (10) restait.

#### Solution

**Fichier** : `packages/database/src/services/proposal-domain.service.ts` (lignes 720-767)

```typescript
// ✅ APRÈS (corrigé)
if (editedData.distance) {
  // Legacy - mapper vers le bon champ selon categoryLevel1
  const distance = parseFloat(editedData.distance)
  if (categoryLevel1 === 'WALK') racePayload.walkDistance = distance
  else if (categoryLevel1 === 'CYCLING') racePayload.bikeDistance = distance
  else racePayload.runDistance = distance
} else {
  // Utiliser en priorité les valeurs éditées, sinon les valeurs proposées par l'agent
  if (editedData.runDistance !== undefined) racePayload.runDistance = parseFloat(editedData.runDistance)
  else if (raceData.runDistance !== undefined) racePayload.runDistance = raceData.runDistance
  
  if (editedData.bikeDistance !== undefined) racePayload.bikeDistance = parseFloat(editedData.bikeDistance)
  else if (raceData.bikeDistance !== undefined) racePayload.bikeDistance = raceData.bikeDistance
  
  if (editedData.walkDistance !== undefined) racePayload.walkDistance = parseFloat(editedData.walkDistance)
  else if (raceData.walkDistance !== undefined) racePayload.walkDistance = raceData.walkDistance
  
  if (editedData.swimDistance !== undefined) racePayload.swimDistance = parseFloat(editedData.swimDistance)
  else if (raceData.swimDistance !== undefined) racePayload.swimDistance = raceData.swimDistance
}
```

**Même logique pour les élévations** (lignes 758-767) :
- `editedData.runPositiveElevation`
- `editedData.bikePositiveElevation`
- `editedData.walkPositiveElevation`

**Avantages** :
- ✅ Support complet des champs spécifiques
- ✅ Priorité aux valeurs user
- ✅ Fallback vers valeurs agent
- ✅ Rétrocompatibilité avec `distance` legacy

#### Tests Passants Après Fix

```bash
✓ should handle userModifiedRaceChanges for racesToAdd (215 ms)
```

---

### 2. Distinction `event` vs `edition` dans `getBlockForField()`

#### Problème

La fonction `getBlockForField()` renvoyait `'edition'` pour tous les champs, y compris `name` qui est un champ `'event'`.

**Test échouant** :
```typescript
// Test attend
proposal.approvedBlocks = {
  event: true,   // ✅ Approuvé (name devrait être appliqué)
  edition: false // ❌ Non approuvé
}

proposal.userModifiedChanges = {
  name: 'Trail User'  // Champ event
}

// Backend actuel
function getBlockForField(field: string): string {
  // ...
  return 'edition'  // ❌ Renvoie 'edition' pour 'name'
}
```

**Conséquence** :
1. `getBlockForField('name')` → `'edition'`
2. `approvedBlocks['edition'] === false` → Ne pas appliquer
3. `name` est filtré et jamais appliqué ❌

**Logs backend** :
```
🚦 [DEBUG FILTRAGE] APRÈS filtrage: { 
  filteredFinalChangesKeys: [], 
  filteredFinalChanges: '{}' 
}
Filtered out 2 changes from unapproved blocks: name, startDate
```

#### Solution

**Fichier** : `packages/database/src/services/proposal-domain.service.ts` (lignes 930-978)

```typescript
// ✅ APRÈS (corrigé)
private getBlockForField(field: string): string {
  // ✅ Event fields (must match filterChangesByBlock)
  const eventFields = [
    'name', 'city', 'country', 'websiteUrl', 'facebookUrl', 'instagramUrl', 'twitterUrl',
    'countrySubdivisionNameLevel1', 'countrySubdivisionNameLevel2',
    'countrySubdivisionDisplayCodeLevel1', 'countrySubdivisionDisplayCodeLevel2',
    'fullAddress', 'latitude', 'longitude', 'coverImage', 'images',
    'peyceReview', 'isPrivate', 'isFeatured', 'isRecommended', 'toUpdate', 'dataSource'
  ]
  
  if (eventFields.includes(field)) {
    return 'event'
  }
  
  // ✅ Edition fields
  const editionFields = [
    'year', 'startDate', 'endDate', 'timeZone', 'registrationOpeningDate', 'registrationClosingDate',
    'calendarStatus', 'clientStatus', 'status', 'currency', 'medusaVersion', 'customerType',
    'registrantsNumber', 'whatIsIncluded', 'clientExternalUrl', 'bibWithdrawalFullAddress',
    'volunteerCode', 'confirmedAt'
  ]
  
  if (editionFields.includes(field)) {
    return 'edition'
  }

  // Organizer block
  if (field === 'organizerId' || field === 'organizer') {
    return 'organizer'
  }

  // Races block
  if (field === 'racesToAdd' || field === 'racesToUpdate' || field === 'races' || 
      field.startsWith('race_') || field === 'raceEdits' || 
      field === 'racesToDelete' || field === 'racesToAddFiltered') {
    return 'races'
  }

  // Default: edition (pour les champs non listés)
  return 'edition'
}
```

**Cohérence avec `filterChangesByBlock()`** :
- Les listes `eventFields` et `editionFields` sont **identiques** dans les deux fonctions
- Garantit un comportement uniforme du filtrage

**Avantages** :
- ✅ Distinction correcte `event` vs `edition`
- ✅ Cohérence avec l'UI (blocs séparés dans le dashboard)
- ✅ Validation par blocs précise

#### Tests Passants Après Fix

```bash
✓ should combine userModifiedChanges with approvedBlocks (164 ms)
```

---

## 🧪 Validation Complète

### Exécution des Tests

```bash
cd /Users/fx/dev/data-agents
npx jest apps/agents/src/__tests__/proposal-application/advanced.test.ts

# Résultat
Test Suites: 1 passed, 1 total
Tests:       3 skipped, 16 passed, 19 total
Time:        8.031 s
```

### Détail des Tests Passants (16/19)

#### Block Application (3/5)
- ✅ should apply only approved blocks
- ✅ should apply all blocks if approvedBlocks is empty
- ✅ should handle races block with toAdd and toUpdate
- ⏭️ ~~should handle partial block approval~~ (Organizer deprecated)
- ⏭️ ~~should apply organizer block correctly~~ (Organizer deprecated)

#### User Modifications Override (11/13)
- ✅ should override agent proposal with user modification
- ✅ should apply user modification to multiple races
- ✅ should apply user modification to edition fields
- ✅ should apply user modification to event fields
- ✅ should merge user modifications with agent proposal
- ✅ should handle userModifiedChanges for NEW_EVENT
- ✅ **should handle userModifiedRaceChanges for racesToAdd** ← Fixé Phase 2.9
- ✅ should handle racesToAddFiltered
- ✅ **should combine userModifiedChanges with approvedBlocks** ← Fixé Phase 2.9
- ✅ should not apply user modification if block not approved
- ⏭️ ~~should apply user modification to organizer fields~~ (Organizer deprecated)

#### Edge Cases (3/3)
- ✅ should handle empty userModifiedChanges
- ✅ should handle null userModifiedChanges
- ✅ should handle empty approvedBlocks with userModifiedChanges

---

## 📁 Fichiers Modifiés

### Backend

1. **`packages/database/src/services/proposal-domain.service.ts`**
   - **Lignes 720-767** : Support `editedData.runDistance/bikeDistance/etc.` pour racesToAdd
   - **Lignes 930-978** : Distinction `event` vs `edition` dans `getBlockForField()`

---

## 🎯 Impact

### Avant Phase 2.9

❌ **Test 1** : `userModifiedRaceChanges` ignorées
- User modifie `runDistance: 12`
- Backend applique `runDistance: 10` (valeur agent)
- Résultat : **Valeur user perdue**

❌ **Test 2** : Filtrage incorrect par bloc
- `name` (event) filtré car bloc `edition` non approuvé
- Résultat : **Modifications event ignorées**

### Après Phase 2.9

✅ **Test 1** : `userModifiedRaceChanges` appliquées
- User modifie `runDistance: 12`
- Backend applique `runDistance: 12` (priorité user)
- Résultat : **Valeur user respectée**

✅ **Test 2** : Filtrage précis par bloc
- `name` (event) appliqué car bloc `event` approuvé
- `startDate` (edition) filtré car bloc `edition` non approuvé
- Résultat : **Application sélective correcte**

---

## 📈 Récapitulatif Phases 2.6-2.9

### Problèmes Résolus

| Phase | Problème | Solution | Tests Gagnés |
|-------|----------|----------|--------------|
| **2.6** | Merge intelligent manquant | `mergeUserModificationsIntoChanges()` | 0 (backend) |
| **2.7** | userModifiedChanges non sauvegardés | Helper `updateProposalUserModifications()` | +8 tests |
| **2.8** | approvedBlocks non sauvegardés | Helper `updateProposalApprovedBlocks()` | +3 tests |
| **2.9** | raceEdits.runDistance non lu | Support champs spécifiques | +1 test |
| **2.9** | Bloc event/edition confondus | Distinction explicite | +1 test |

### Résultat Final

**96% de réussite (79/82 tests)** 🎉

- ✅ NEW_EVENT : 28/28 (100%)
- ✅ EDITION_UPDATE : 14/14 (100%)
- ✅ Race Operations : 21/21 (100%)
- ✅ Advanced Features : 16/19 (84%)
  - 3 tests skippés (Organizer table deprecated)

---

## 🚀 Prochaines Étapes

### Frontend (Phase 3)

Le frontend Dashboard nécessite des adaptations pour :
1. Utiliser le nouveau système de blocs (`event` vs `edition`)
2. Supporter les champs spécifiques (`runDistance`, `bikeDistance`, etc.)
3. S'aligner avec le backend Phase 2.9

**Plan détaillé** : À créer dans `docs/PLAN-FRONTEND-ALIGNMENT.md`

---

## ✅ Checklist Validation Phase 2.9

- [x] Tests backend passent (16/19)
- [x] Documentation complète (`TEST_PHASE_2.9_FINAL.md`)
- [x] README mis à jour (`apps/agents/src/__tests__/proposal-application/README.md`)
- [x] Docs obsolètes archivées (`archive/`)
- [x] Code review interne
- [ ] Commit + push
- [ ] Plan frontend créé

---

**Auteur** : Équipe Data Agents  
**Date** : 2 Décembre 2025  
**Version** : 1.0.0
