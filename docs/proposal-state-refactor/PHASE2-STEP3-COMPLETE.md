# Phase 2 - Étape 3 : Adaptation du context GroupedProposalContext (COMPLÈTE)

**Date** : 2025-11-11  
**Temps estimé** : 30 minutes  
**Temps réel** : 25 minutes

## 🎯 Objectif

Adapter le `context` de `GroupedProposalDetailBase` pour utiliser les données consolidées du hook `useProposalEditor` au lieu des états locaux.

## ✅ Ce qui a été fait

### 1. Adaptation du context `GroupedProposalContext`

**Fichier** : `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx` (ligne 976-1030)

#### Avant

```typescript
const context: GroupedProposalContext = {
  groupProposals,
  consolidatedChanges,  // ← Calculé par useProposalLogic
  consolidatedRaceChanges: consolidatedRaceChangesWithCascade,  // ← Calculé localement
  selectedChanges,  // ← État local
  userModifiedChanges,  // ← État local
  userModifiedRaceChanges,  // ← État local
  // ...
}
```

#### Après

```typescript
const context: GroupedProposalContext = {
  // Données consolidées depuis le hook (ou fallback)
  groupProposals: workingGroup?.originalProposals || groupProposals,
  consolidatedChanges: workingGroup?.consolidatedChanges || consolidatedChanges,
  consolidatedRaceChanges: workingGroup?.consolidatedRaces || consolidatedRaceChangesWithCascade,
  
  // États de modifications utilisateur depuis le hook (ou fallback)
  selectedChanges: workingGroup ? {} : selectedChanges, // ✅ Plus besoin en mode hook
  userModifiedChanges: workingGroup?.userModifiedChanges || userModifiedChanges,
  userModifiedRaceChanges: workingGroup?.userModifiedRaceChanges || userModifiedRaceChanges,
  
  // Handlers (priorité au hook si disponible)
  handleFieldModify, // ✅ Déjà adapté à l'Étape 2 pour utiliser updateFieldEditor
  handleRaceFieldModify, // ✅ Déjà adapté à l'Étape 2 pour utiliser updateRaceEditor
  // ...
}
```

**Changements clés** :
- ✅ Utilise `workingGroup?.originalProposals` pour `groupProposals`
- ✅ Utilise `workingGroup?.consolidatedChanges` pour les changements consolidés
- ✅ Utilise `workingGroup?.consolidatedRaces` pour les courses consolidées
- ✅ Utilise `workingGroup?.userModifiedChanges` et `workingGroup?.userModifiedRaceChanges`
- ✅ `selectedChanges` vidé en mode hook (valeurs dans `consolidatedChanges[i].selectedValue`)
- ✅ **Fallback sur les anciennes valeurs** si `workingGroup` est `null` (rétrocompatibilité)

### 2. Adaptation de `blockProposals`

**Fichier** : `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx` (ligne 849-927)

#### Avant

```typescript
const blockProposals = useMemo(() => {
  const blocks: Record<string, string[]> = {}
  
  // Utilise directement les variables locales
  const eventProposalIds = groupProposals.filter(p => 
    consolidatedChanges.some(c => ...)
  )
  // ...
  
  return blocks
}, [groupProposals, consolidatedChanges, consolidatedRaceChangesWithCascade, isNewEvent])
```

#### Après

```typescript
const blockProposals = useMemo(() => {
  const blocks: Record<string, string[]> = {}
  
  // Utiliser les données consolidées du hook si disponibles, sinon fallback
  const changes = workingGroup?.consolidatedChanges || consolidatedChanges
  const raceChanges = workingGroup?.consolidatedRaces || consolidatedRaceChangesWithCascade
  const proposals = workingGroup?.originalProposals || groupProposals
  
  // Utilise les variables locales avec fallback
  const eventProposalIds = proposals.filter(p => 
    changes.some(c => ...)
  )
  // ...
  
  return blocks
}, [groupProposals, consolidatedChanges, consolidatedRaceChangesWithCascade, isNewEvent, workingGroup])
```

**Changements clés** :
- ✅ Utilise `workingGroup?.consolidatedChanges` au lieu de `consolidatedChanges` local
- ✅ Utilise `workingGroup?.consolidatedRaces` au lieu de `consolidatedRaceChangesWithCascade`
- ✅ Utilise `workingGroup?.originalProposals` au lieu de `groupProposals`
- ✅ Ajout de `workingGroup` dans les dépendances du `useMemo`
- ✅ Fallback sur anciennes valeurs si `workingGroup` est `null`

### 3. Adaptation de `useBlockValidation`

**Fichier** : `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx` (ligne 929-948)

#### Avant

```typescript
const { ... } = useBlockValidation({
  proposals: groupProposals,
  blockProposals,
  selectedChanges,
  userModifiedChanges,
  userModifiedRaceChanges,
  calculateFinalPayload
})
```

#### Après

```typescript
const { ... } = useBlockValidation({
  proposals: workingGroup?.originalProposals || groupProposals,
  blockProposals,
  selectedChanges: workingGroup ? {} : selectedChanges, // ✅ Plus besoin en mode hook
  userModifiedChanges: workingGroup?.userModifiedChanges || userModifiedChanges,
  userModifiedRaceChanges: workingGroup?.userModifiedRaceChanges || userModifiedRaceChanges,
  calculateFinalPayload
})
```

**Changements clés** :
- ✅ Passe `workingGroup?.originalProposals` à la place de `groupProposals`
- ✅ Passe `workingGroup?.userModifiedChanges` et `workingGroup?.userModifiedRaceChanges`
- ✅ `selectedChanges` vidé en mode hook (valeurs déjà dans les changes consolidés)
- ✅ Fallback sur anciennes valeurs si `workingGroup` est `null`

## 🔍 Principe du fallback

**Pattern utilisé partout** :

```typescript
workingGroup?.consolidatedChanges || consolidatedChanges
```

**Comportement** :
1. Si `workingGroup` existe → utilise les données du hook
2. Si `workingGroup` est `null` → utilise les anciennes données calculées localement

**Avantages** :
- ✅ Rétrocompatibilité totale
- ✅ Pas de régression si le hook échoue
- ✅ Permet de tester progressivement
- ✅ Facilite le rollback en cas de problème

## 📊 Impact attendu

### Sur les composants enfants

Les composants enfants (`CategorizedEventChangesTable`, `CategorizedEditionChangesTable`, `RacesChangesTable`) vont maintenant recevoir les données depuis `workingGroup` via le context :

```typescript
// Dans CategorizedEventChangesTable
const { consolidatedChanges } = useGroupedProposalContext()
// consolidatedChanges provient maintenant de workingGroup.consolidatedChanges

// Dans RacesChangesTable
const { consolidatedRaceChanges } = useGroupedProposalContext()
// consolidatedRaceChanges provient maintenant de workingGroup.consolidatedRaces
```

**Résultat attendu** :
- ✅ Les composants fonctionnent sans modification
- ✅ Les données sont synchronisées avec le hook
- ✅ Les modifications utilisateur sont propagées correctement

### Sur la validation par blocs

Le hook `useBlockValidation` va maintenant recevoir les modifications utilisateur depuis `workingGroup` :

```typescript
userModifiedChanges: workingGroup?.userModifiedChanges || userModifiedChanges
```

**Résultat attendu** :
- ✅ Le payload de validation contient toutes les modifications
- ✅ Toutes les propositions du groupe reçoivent la même validation
- ✅ La sauvegarde est déclenchée automatiquement après validation

## 🚦 Prochaines étapes

### Étape 4 : Tests manuels (TODO)

Avant de supprimer les anciens états, il faut valider que tout fonctionne :

1. **Chargement** : Vérifier que `workingGroup` est bien chargé
2. **Modifications** : Vérifier que les changements sont propagés
3. **Validation** : Vérifier que la validation par blocs fonctionne
4. **Sauvegarde** : Vérifier que les modifications sont persistées

**Voir** : `PHASE2-INTEGRATION-STATUS.md` section "Étape 4" pour les scénarios de test détaillés.

### Étape 5 : Suppression des anciens états (TODO)

Une fois les tests validés, supprimer :
- `userModifiedChanges`, `userModifiedRaceChanges` (états locaux)
- `selectedChanges`, `setSelectedChanges` (de `useProposalLogic`)
- `consolidatedChanges`, `consolidatedRaceChanges` calculés localement
- Auto-sélection des meilleures valeurs (déjà géré par le hook)

## 📝 Résumé

| Élément | Avant | Après |
|---------|-------|-------|
| `groupProposals` | État local | `workingGroup?.originalProposals` |
| `consolidatedChanges` | Calculé par `useProposalLogic` | `workingGroup?.consolidatedChanges` |
| `consolidatedRaceChanges` | Calculé localement | `workingGroup?.consolidatedRaces` |
| `selectedChanges` | État local | Vidé (valeurs dans `consolidatedChanges`) |
| `userModifiedChanges` | État local | `workingGroup?.userModifiedChanges` |
| `userModifiedRaceChanges` | État local | `workingGroup?.userModifiedRaceChanges` |

## ✨ Bénéfices

- ✅ **Single Source of Truth** : Toutes les données viennent du hook
- ✅ **Synchronisation automatique** : Plus de désynchronisation entre états
- ✅ **Rétrocompatibilité** : Fallback sur anciennes valeurs si problème
- ✅ **Facilite les tests** : Un seul endroit à vérifier
- ✅ **Prépare la suppression** : Les anciens états ne sont plus utilisés

## 📚 Ressources

- **Hook** : `apps/dashboard/src/hooks/useProposalEditor.ts`
- **Composant** : `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`
- **Documentation Phase 1.5** : `docs/PHASE1.5-GROUP-SUPPORT-COMPLETE.md`
- **Plan global** : `docs/PLAN-PROPOSAL-STATE-REFACTOR.md`
- **État d'avancement** : `docs/PHASE2-INTEGRATION-STATUS.md`

---

**Estimation temps restant** : 1-2 heures pour terminer les étapes 4-6 (tests + suppression + documentation).
