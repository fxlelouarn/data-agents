# Phase 2 : Migration de GroupedProposalDetailBase

**Date** : 2025-11-11  
**Statut** : 🟡 EN COURS

## Objectif

Refactorer `GroupedProposalDetailBase` pour utiliser le nouveau hook `useProposalEditor` au lieu de gérer manuellement 4 sources de vérité différentes.

## Stratégie de migration

⚠️ **Migration progressive** : On garde l'ancien code en parallèle pendant la transition pour éviter de casser l'existant.

### Étape 1 : Préparation ✅

- [x] Import de `useProposalEditor`
- [x] Commentaires TODO pour marquer les zones à migrer

### Étape 2 : Initialisation du hook (EN COURS)

**Problème à résoudre** : Le hook actuel ne supporte que les propositions simples (`proposalId: string`), mais `GroupedProposalDetailBase` gère des groupes de propositions.

**Solutions possibles** :

#### Option A : Utiliser le hook pour la première proposition du groupe
```typescript
const firstProposalId = groupProposals[0]?.id
const {
  workingProposal,
  updateField,
  updateRace,
  validateBlock,
  unvalidateBlock,
  getPayload
} = useProposalEditor(firstProposalId, { autosave: true })
```

**Avantages** :
- Simple à implémenter
- Fonctionne immédiatement

**Inconvénients** :
- Les autres propositions du groupe ne bénéficient pas du nouveau système
- Perte de la consolidation multi-propositions

#### Option B : Étendre le hook pour supporter les groupes (RECOMMANDÉ)
```typescript
const proposalIds = groupProposals.map(p => p.id)
const {
  workingProposals, // Tableau de WorkingProposal
  consolidatedChanges, // Merge automatique
  updateField, // Appliqué à toutes les propositions
  updateRace,
  validateBlock,
  getPayload
} = useProposalEditor(proposalIds, { autosave: true })
```

**Avantages** :
- Architecture propre
- Support natif des groupes
- Consolidation automatique

**Inconvénients** :
- Nécessite de modifier `useProposalEditor`
- Plus de travail initial

### Étape 3 : Migration des handlers

**Handlers à migrer** :

#### 3.1 Édition de champs
```typescript
// ❌ ANCIEN (complexe)
const handleFieldModify = (fieldName: string, newValue: any, reason?: string) => {
  setUserModifiedChanges(prev => ({
    ...prev,
    [fieldName]: newValue
  }))
  
  setSelectedChanges(prev => ({
    ...prev,
    [fieldName]: newValue
  }))
}

// ✅ NOUVEAU (simple)
const handleFieldModify = (fieldName: string, newValue: any) => {
  updateField(fieldName, newValue)
}
```

#### 3.2 Édition de courses
```typescript
// ❌ ANCIEN (état local séparé)
const handleRaceFieldModify = (raceIndex: number, fieldName: string, newValue: any) => {
  setUserModifiedRaceChanges(prev => ({
    ...prev,
    [raceIndex]: {
      ...prev[raceIndex],
      [fieldName]: newValue
    }
  }))
}

// ✅ NOUVEAU (état consolidé)
const handleRaceFieldModify = (raceId: string, fieldName: string, newValue: any) => {
  updateRace(raceId, fieldName, newValue)
}
```

#### 3.3 Validation de blocs
```typescript
// ❌ ANCIEN (calcul manuel du payload)
const validateBlock = async (blockKey: string, proposalIds: string[]) => {
  const payload = calculateFinalPayload(proposal, userModifiedChanges)
  // Merge des raceEdits...
  await validateBlockBase(blockKey, proposalIds)
}

// ✅ NOUVEAU (payload automatique)
const validateBlockWrapper = async (blockKey: string) => {
  await validateBlock(blockKey)
}
```

### Étape 4 : Migration des composants enfants

**Composants à adapter** :

1. **CategorizedEditionChangesTable**
   - Props actuelles : `selectedChanges`, `onFieldSelect`, `onFieldModify`
   - Props futures : `changes` (déjà consolidé), `onEdit` (callback unique)

2. **RacesChangesTable**
   - Props actuelles : `proposal`, `selectedChanges`, `userModifiedChanges`, `onRaceEdit`, `syncWithBackend`
   - Props futures : `races`, `onEdit`

### Étape 5 : Nettoyage

- [ ] Supprimer `selectedChanges`
- [ ] Supprimer `userModifiedChanges`
- [ ] Supprimer `userModifiedRaceChanges`
- [ ] Supprimer `useProposalLogic` (calculateFinalPayload, etc.)
- [ ] Supprimer `useBlockValidation` (intégré dans useProposalEditor)

## Décision à prendre

**Question** : Faut-il étendre `useProposalEditor` pour supporter les groupes (Option B) ou utiliser une approche plus simple (Option A) ?

**Recommandation** : Option B (support natif des groupes)

**Raison** :
- Architecture plus propre
- Réutilisable pour d'autres vues groupées
- Moins de code à terme
- Cohérence avec l'objectif de "Single Source of Truth"

## Prochaines actions

1. Décider entre Option A et Option B
2. Si Option B : Modifier `useProposalEditor` pour supporter `proposalId: string | string[]`
3. Initialiser le hook dans `GroupedProposalDetailBase`
4. Migrer les handlers un par un
5. Adapter les composants enfants
6. Tester en parallèle
7. Basculer et supprimer l'ancien code

## Ressources

- `docs/PLAN-PROPOSAL-STATE-REFACTOR.md` - Plan global
- `docs/HOOK-PROPOSAL-EDITOR.md` - Documentation du hook
- `apps/dashboard/src/hooks/useProposalEditor.ts` - Implémentation actuelle
