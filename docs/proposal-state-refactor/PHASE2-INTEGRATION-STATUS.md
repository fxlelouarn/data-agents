# Phase 2 : Intégration dans GroupedProposalDetailBase - État d'avancement

**Date de début** : 2025-11-11  
**Date de fin** : 2025-11-11  
**Statut actuel** : ✅ COMPLÈTE (Étape 4/6) - Tests validés

## ✅ Étape 1 : Initialisation du hook (COMPLÈTE)

### Ce qui a été fait

1. **Ajout de `proposalIds` stable** (ligne 137-145)
   - Utilise `useMemo` pour éviter les re-renders inutiles
   - Tri par confiance décroissante pour cohérence avec l'ancien code
   - Dépend de `groupProposalsData` et `groupKey`

2. **Initialisation du hook** (ligne 147-160)
   - Mode groupé détecté automatiquement via `Array.isArray(proposalIds)`
   - Autosave désactivé (`autosave: false`) car on sauvegarde manuellement
   - Récupération de tous les handlers et états du mode groupé

3. **Logging de debugging** (ligne 162-178)
   - Log complet de `workingGroup` après chargement
   - Affichage des échantillons de `consolidatedChanges` et `consolidatedRaces`
   - Permet de vérifier la structure des données

### Résultat attendu

Lors du chargement d'une proposition groupée, on devrait voir dans la console :

```
🚀 [GroupedProposalDetailBase] workingGroup chargé: {
  ids: ["cm...", "cm...", "cm..."],
  consolidatedChangesCount: 15,
  consolidatedRacesCount: 4,
  userModifiedChanges: {},
  userModifiedRaceChanges: {},
  approvedBlocks: {},
  isDirty: false,
  sampleChanges: [...],
  sampleRaces: [...]
}
```

## ✅ Étape 2 : Adaptation des handlers (COMPLÈTE)

### Ce qui a été fait

1. **`handleFieldModify()`** (ligne 237-251)
   - ✅ Appel de `updateFieldEditor(fieldName, newValue)` si `workingGroup` existe
   - ✅ Code ancien conservé en parallèle pour rétrocompatibilité
   - ⚠️ **À TESTER** : Vérifier que la modification est bien propagée au `workingGroup`

2. **`handleRaceFieldModify()`** (ligne 269-311)
   - ✅ Mapping `raceIndex → raceId` via `workingGroup.consolidatedRaces[raceIndex].raceId`
   - ✅ Appel de `updateRaceEditor(raceId, fieldName, newValue)`
   - ✅ Code ancien conservé en parallèle
   - ⚠️ **À TESTER** : Vérifier le mapping des indices

### Ce qui reste à faire

1. **Tester en conditions réelles**
   - Naviguer vers une proposition groupée (ex: `/proposals/group/13446-40098`)
   - Modifier un champ d'édition (ex: `startDate`)
   - Vérifier dans la console que `workingGroup` est mis à jour
   - Vérifier que `isDirty = true`

2. **Adapter `handleSelectField()`** (ligne 202-209)
   - Actuellement, `handleSelectField` appelle `setSelectedChanges`
   - **TODO** : Ajouter un appel à `selectOption(field, proposalId)` du hook
   - **Problème** : Comment récupérer le `proposalId` de l'option sélectionnée ?
   - **Solution** : Passer le `proposalId` en paramètre supplémentaire

3. **Adapter la propagation de dates Edition → Races** (ligne 172-199)
   - Actuellement utilise `consolidatedRaceChanges` calculé localement
   - **TODO** : Utiliser `workingGroup.consolidatedRaces` à la place
   - **TODO** : Adapter `confirmDatePropagation()` pour utiliser le hook

## ✅ Étape 3 : Adaptation du context (COMPLÈTE)

### Ce qui a été fait

1. **Adaptation du context `GroupedProposalContext`** (ligne 976-1030)
   - ✅ Utilise `workingGroup?.originalProposals` pour `groupProposals`
   - ✅ Utilise `workingGroup?.consolidatedChanges` pour les changements consolidés
   - ✅ Utilise `workingGroup?.consolidatedRaces` pour les courses consolidées
   - ✅ Utilise `workingGroup?.userModifiedChanges` et `workingGroup?.userModifiedRaceChanges`
   - ✅ `selectedChanges` vidé en mode hook (valeurs dans `consolidatedChanges[i].selectedValue`)
   - ✅ Fallback sur les anciennes valeurs si `workingGroup` est `null`

2. **Adaptation de `blockProposals`** (ligne 849-927)
   - ✅ Utilise `workingGroup?.consolidatedChanges` au lieu de `consolidatedChanges` local
   - ✅ Utilise `workingGroup?.consolidatedRaces` au lieu de `consolidatedRaceChangesWithCascade`
   - ✅ Utilise `workingGroup?.originalProposals` au lieu de `groupProposals`
   - ✅ Ajout de `workingGroup` dans les dépendances du `useMemo`

3. **Adaptation de `useBlockValidation`** (ligne 929-948)
   - ✅ Passe `workingGroup?.originalProposals` à la place de `groupProposals`
   - ✅ Passe `workingGroup?.userModifiedChanges` et `workingGroup?.userModifiedRaceChanges`
   - ✅ `selectedChanges` vidé en mode hook
   - ✅ Fallback sur anciennes valeurs si pas de `workingGroup`

### Résultat attendu

Lors du chargement d'une proposition groupée, les composants enfants devraient maintenant recevoir les données depuis `workingGroup` via le context :

```typescript
// Dans CategorizedEventChangesTable
const { consolidatedChanges } = useGroupedProposalContext()
// consolidatedChanges provient de workingGroup.consolidatedChanges

// Dans RacesChangesTable
const { consolidatedRaceChanges } = useGroupedProposalContext()
// consolidatedRaceChanges provient de workingGroup.consolidatedRaces
```

### Compatibilité

✅ **Rétrocompatibilité garantie** : Fallback sur les anciennes valeurs si `workingGroup` est `null`.

```typescript
consolidatedChanges: workingGroup?.consolidatedChanges || consolidatedChanges
```

Cela permet de continuer à utiliser les anciennes données si le hook n'est pas initialisé ou si une erreur se produit.

## ✅ Étape 4 : Tests manuels et validation (COMPLÈTE)

**À faire avant de supprimer les anciens états**.

### Résultats des tests

#### 1️⃣ Chargement
- [x] Naviguer vers `/proposals/group/3874-40011`
- [x] Vérifier que `workingGroup` est loggé dans la console
- [x] Vérifier que `consolidatedChanges` contient les options multi-agents
- [x] Vérifier que l'affichage est correct dans les tables
- [x] Vérifier que les fallback fonctionnent si `workingGroup` est null

**Log observé** :
```
🚀 [PHASE 2] workingGroup chargé: {
  propositionsCount: 3,
  consolidatedChangesCount: 5,
  consolidatedRacesCount: 3,
  isDirty: false,
  hasUserModifications: false
}
```

#### 2️⃣ Modification manuelle d'un champ Edition
- [x] Modifier `endDate` avec le crayon d'édition
- [x] Vérifier log `handleFieldModify` dans la console
- [x] Vérifier que `workingGroup.isDirty = true`
- [x] Vérifier que l'affichage change

**Log observé** :
```
🔄 [PHASE 2] handleFieldModify: {
  fieldName: 'endDate',
  newValue: '2025-12-04T23:00:00.000Z',
  hasWorkingGroup: true
}
```

#### 3️⃣ Sélection d'une option
- [x] Sélectionner une valeur dans le select
- [x] Vérifier log `handleSelectField` dans la console
- [x] Vérifier que la valeur est appliquée

**Log observé** :
```
🔍 [PHASE 2] handleSelectField: {
  fieldName: 'endDate',
  selectedValue: '2025-10-17T22:00:00.000Z',
  hasWorkingGroup: true
}
```

#### 4️⃣ Validation d'un bloc
- [x] Valider le bloc "edition"
- [x] Vérifier que toutes les propositions du groupe reçoivent la validation
- [x] Recharger la page et vérifier que le bloc reste validé
- [x] Vérifier que les modifications sont conservées

**Logs observés** :
```
✅ [PHASE 2] Validation bloc "edition" { proposalIds: 3 }
✅ [useBlockValidation] Bloc "edition" - Payload simple: {...}
✅ [useBlockValidation] Bloc "edition" - Payload simple: {...}
✅ [useBlockValidation] Bloc "edition" - Payload simple: {...}
```

#### ⚠️ Modification d'une course (NON TESTÉ)
- [ ] `RacesChangesTable` utilise `syncWithBackend()` direct
- [ ] Ne passe PAS par `handleRaceFieldModify` du context
- [ ] Nécessite un refactoring séparé (voir Étape 5)

**Log observé** :
```
📡 [RacesChangesTable] syncWithBackend: {
  proposalId: 'cmhurzkeu02dibzxvvbreb0ac',
  updates: { raceEdits: {...} }
}
```

### Commandes de test

```bash
# Démarrer le dashboard
cd apps/dashboard
npm run dev

# Ouvrir une proposition groupée dans le navigateur
open http://localhost:5173/proposals/group/13446-40098
```

### Logs à surveiller

```
🚀 [GroupedProposalDetailBase] workingGroup chargé: { ... }
🔄 [handleFieldModify] updateFieldEditor appelé: { field, value }
🔄 [handleRaceFieldModify] updateRaceEditor appelé: { raceId, field, value }
✅ [GroupedProposalDetailBase] AVANT validation bloc "edition"
✅ [GroupedProposalDetailBase] APRÈS validation bloc "edition"
```

## ⌛ Étape 5 : Refactoring RacesChangesTable + Suppression des anciens états (TODO)

**À faire maintenant que l'étape 4 (tests) est validée**.

### ⚠️ Problème identifié : RacesChangesTable

**Diagnostic** : `RacesChangesTable` ne passe pas par le context mais fait ses propres mutations directes.

**Flux actuel** :
```
RacesChangesTable → syncWithBackend() → updateProposalMutation (direct)
```

**Flux attendu** :
```
RacesChangesTable → handleRaceFieldModify (context) → updateRaceEditor (hook)
```

**Impact** :
- ❌ Les modifications de courses ne passent pas par le hook
- ❌ `workingGroup.userModifiedRaceChanges` n'est pas mis à jour
- ❌ Les modifications de courses ne sont pas consolidées avec les autres propositions

**Solution** :
1. Ajouter `handleRaceFieldModify` dans les props de `RacesChangesTable`
2. Remplacer `syncWithBackend()` par des appels à `handleRaceFieldModify`
3. Tester que les modifications passent bien par le hook

**Fichiers concernés** :
- `apps/dashboard/src/components/proposals/edition-update/RacesChangesTable.tsx` (ligne 132-147)
- `apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateGroupedDetail.tsx` (ligne 165-177)

### États à supprimer

1. **Ligne 133-134** : `userModifiedChanges`, `userModifiedRaceChanges`
   - Remplacés par `workingGroup.userModifiedChanges` et `workingGroup.userModifiedRaceChanges`

2. **Ligne 159-169** : `useProposalLogic` (partiellement)
   - **À garder** : `formatValue`, `formatAgentsList`, `getEventTitle`, `getEditionYear`, `calculateFinalPayload`
   - **À supprimer** : `selectedChanges`, `setSelectedChanges`, `consolidateChanges`, `consolidateRaceChanges`

3. **Ligne 362-410** : `consolidatedChanges`, `consolidatedRaceChanges` calculés localement
   - Remplacés par `workingGroup.consolidatedChanges` et `workingGroup.consolidatedRaces`

4. **Ligne 468-480** : Auto-sélection des meilleures valeurs
   - Déjà géré par `consolidateChangesFromProposals()` dans le hook

### Procédure de suppression

#### 1. Chargement d'un groupe
- [ ] Naviguer vers `/proposals/group/13446-40098`
- [ ] Vérifier que `workingGroup` est loggé dans la console
- [ ] Vérifier que `consolidatedChanges` contient les options multi-agents
- [ ] Vérifier que l'affichage est correct

#### 2. Modification d'un champ
- [ ] Modifier `startDate` dans `CategorizedEditionChangesTable`
- [ ] Vérifier que `workingGroup.isDirty = true` dans le log
- [ ] Vérifier que `workingGroup.userModifiedChanges.startDate` est mis à jour

#### 3. Sélection d'une option
- [ ] Cliquer sur une option proposée par un agent
- [ ] Vérifier que `consolidatedChanges[i].selectedValue` est mis à jour
- [ ] Vérifier que l'affichage change (valeur sélectionnée en surbrillance)

#### 4. Modification d'une course
- [ ] Modifier une distance dans `RacesChangesTable`
- [ ] Vérifier que `workingGroup.userModifiedRaceChanges` est mis à jour
- [ ] Vérifier le mapping `raceIndex → raceId`

#### 5. Validation d'un bloc
- [ ] Valider le bloc "edition"
- [ ] Vérifier que `workingGroup.approvedBlocks.edition = true`
- [ ] Vérifier que toutes les propositions du groupe reçoivent la validation

#### 6. Sauvegarde
- [ ] Faire des modifications
- [ ] Valider un bloc (déclenche automatiquement `saveEditor()`)
- [ ] Vérifier que les modifications sont persistées en DB pour toutes les propositions
- [ ] Recharger la page et vérifier que les modifications sont conservées

## ⏳ Étape 6 : Documentation (TODO)

### À créer

1. **`docs/PHASE2-COMPLETE.md`** : Documentation complète de la Phase 2
2. **Mise à jour `WARP.md`** : Ajouter la Phase 2 au changelog

### Contenu suggéré

- Architecture avant/après
- Liste des fichiers modifiés
- Bénéfices de la migration
- Points d'attention pour les développeurs futurs
- Exemples d'utilisation du hook

## 📝 Notes pour la prochaine session

### Priorités

1. **Tester l'état actuel** : Naviguer vers une proposition groupée et vérifier les logs
2. **Analyser la structure** : Comparer `workingGroup.consolidatedChanges` vs ancien `consolidatedChanges`
3. **Adapter le context** : Passer `workingGroup` aux composants enfants (Étape 3)
4. **Adapter les composants** : Vérifier que `RacesChangesTable` accepte `ConsolidatedRaceChange[]`

### Questions en suspens

1. **Mapping raceIndex ↔ raceId** : Comment gérer la compatibilité avec les composants existants ?
2. **Propagation de dates** : Faut-il adapter la logique dans le hook ou garder dans le composant ?
3. **Validation par blocs** : Le hook `validateBlockEditor()` attend `proposalIds[]` en paramètre, comment les récupérer ?

### Commandes utiles

```bash
# Démarrer le dashboard en mode dev
cd apps/dashboard
npm run dev

# Ouvrir le navigateur sur une proposition groupée
open http://localhost:5173/proposals/group/13446-40098
```

---

**Estimation temps restant** : 1-2 heures pour terminer les étapes 3-6.
