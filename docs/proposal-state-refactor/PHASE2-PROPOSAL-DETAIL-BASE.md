# PHASE 2 (suite) : Migration de ProposalDetailBase

**Date** : 2025-11-12  
**Statut** : 📋 TODO  
**Priorité** : 🔴 HAUTE (pour compléter la PHASE 2)

---

## Objectif

Migrer `ProposalDetailBase` (propositions simples) vers `useProposalEditor` en mode simple, en s'inspirant de la migration déjà réussie de `GroupedProposalDetailBase`.

---

## Contexte

### Fichier cible
`apps/dashboard/src/pages/proposals/detail/base/ProposalDetailBase.tsx`

### État actuel (problèmes)

1. **Duplication d'état** (lignes 101-102)
   ```typescript
   const [userModifiedChanges, setUserModifiedChanges] = useState<Record<string, any>>({})
   const [userModifiedRaceChanges, setUserModifiedRaceChanges] = useState<Record<string, Record<string, any>>>({})
   ```

2. **Hook legacy** (lignes 126-135)
   ```typescript
   const {
     selectedChanges,
     setSelectedChanges,
     formatValue,
     formatAgentsList,
     getEventTitle,
     getEditionYear,
     consolidateChanges,
     consolidateRaceChanges
   } = useProposalLogic()
   ```

3. **Handlers manuels** (lignes 176-228)
   - `handleFieldModify` : Met à jour 2 états séparément
   - `handleRaceFieldModify` : Gère `userModifiedRaceChanges` localement
   - Pas de sauvegarde automatique

### État cible (après migration)

```typescript
// ✅ Un seul hook pour tout gérer
const {
  workingProposal,
  isLoading: isEditorLoading,
  updateField,
  updateRace,
  deleteRace,
  addRace,
  validateBlock: validateBlockEditor,
  unvalidateBlock: unvalidateBlockEditor,
  isBlockValidated: isBlockValidatedEditor,
  save: saveEditor,
  isDirty: isEditorDirty
} = useProposalEditor(proposalId, { autosave: true })

// ✅ Handlers simplifiés
const handleFieldModify = (fieldName: string, newValue: any) => {
  updateField(fieldName, newValue)
}

const handleRaceFieldModify = (raceId: string, fieldName: string, newValue: any) => {
  updateRace(raceId, fieldName, newValue)
}
```

---

## Plan de migration étape par étape

### Étape 1 : Initialisation du hook ✅ Simple

**Objectif** : Remplacer les états manuels par `useProposalEditor`.

#### 1.1 Importer le hook (ligne 21)
```typescript
import { useProposalEditor, isSimpleReturn } from '@/hooks/useProposalEditor'
```

#### 1.2 Initialiser le hook (après ligne 124)
```typescript
// 🚀 Migration vers useProposalEditor
const editorResult = useProposalEditor(proposalId, { autosave: true })

// Type narrowing pour mode simple
if (!isSimpleReturn(editorResult)) {
  throw new Error('useProposalEditor doit retourner un mode simple pour ProposalDetailBase')
}

const {
  workingProposal,
  isLoading: isEditorLoading,
  updateField: updateFieldEditor,
  updateRace: updateRaceEditor,
  deleteRace: deleteRaceEditor,
  addRace: addRaceEditor,
  validateBlock: validateBlockEditor,
  unvalidateBlock: unvalidateBlockEditor,
  isBlockValidated: isBlockValidatedEditor,
  save: saveEditor,
  isDirty: isEditorDirty
} = editorResult
```

#### 1.3 Supprimer les états manuels obsolètes (lignes 101-102)
```typescript
// ❌ SUPPRIMER CES LIGNES
// const [userModifiedChanges, setUserModifiedChanges] = useState<Record<string, any>>({})
// const [userModifiedRaceChanges, setUserModifiedRaceChanges] = useState<Record<string, Record<string, any>>>({})
```

---

### Étape 2 : Adapter les handlers

**Objectif** : Utiliser les méthodes du hook au lieu des `setState` manuels.

#### 2.1 `handleFieldModify` (lignes 176-186)
```typescript
// ❌ AVANT (supprimer)
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

// ✅ APRÈS (remplacer)
const handleFieldModify = (fieldName: string, newValue: any, reason?: string) => {
  updateFieldEditor(fieldName, newValue)
  
  // Compatibilité temporaire (PHASE 3 : supprimer)
  setSelectedChanges(prev => ({ ...prev, [fieldName]: newValue }))
}
```

#### 2.2 `handleEditionStartDateChange` (lignes 138-164)
```typescript
// ✅ MODIFIER (remplacer setUserModifiedChanges + setSelectedChanges)
const handleEditionStartDateChange = (fieldName: string, newValue: any) => {
  if (fieldName !== 'startDate' || !newValue) {
    // ✅ Utiliser le hook
    updateFieldEditor(fieldName, newValue)
    setSelectedChanges(prev => ({ ...prev, [fieldName]: newValue })) // Compatibilité
    return
  }
  
  // ... logique de comptage des courses (inchangée)
  
  if (racesCount > 0) {
    setDatePropagationModal({ open: true, newStartDate: newValue })
  } else {
    // ✅ Utiliser le hook
    updateFieldEditor(fieldName, newValue)
    setSelectedChanges(prev => ({ ...prev, [fieldName]: newValue })) // Compatibilité
  }
}
```

#### 2.3 `handleRaceFieldModify` (lignes 188-228)
```typescript
// ✅ MODIFIER (remplacer setUserModifiedRaceChanges)
const handleRaceFieldModify = (raceId: string, fieldName: string, newValue: any) => {
  // ... logique de validation des dates (inchangée)
  
  // ✅ Utiliser le hook au lieu de setUserModifiedRaceChanges
  updateRaceEditor(raceId, fieldName, newValue)
  // ❌ Ne PAS appeler saveEditor() ici (race condition React)
  // La sauvegarde est faite lors de validateBlock()
}
```

#### 2.4 Callbacks de modales (lignes ~320-370)
```typescript
// Modale de propagation des dates
const handleConfirmDatePropagation = (propagateToRaces: boolean) => {
  if (!datePropagationModal) return
  
  const { newStartDate } = datePropagationModal
  
  // ✅ Utiliser le hook
  updateFieldEditor('startDate', newStartDate)
  
  if (propagateToRaces) {
    // Propager aux courses via le hook
    const raceIds = Object.keys(workingProposal?.races || {})
    raceIds.forEach(raceId => {
      updateRaceEditor(raceId, 'startDate', newStartDate)
    })
  }
  
  setDatePropagationModal(null)
}

// Modale de mise à jour des dates d'édition
const handleConfirmEditionDateUpdate = (updateEditionDate: boolean) => {
  if (!editionDateUpdateModal) return
  
  const { dateType, newRaceDate, raceId } = editionDateUpdateModal
  
  if (updateEditionDate) {
    // ✅ Mettre à jour l'édition via le hook
    updateFieldEditor(dateType, newRaceDate)
  }
  
  // ✅ Appliquer la modification de la course
  updateRaceEditor(raceId, 'startDate', newRaceDate)
  
  setEditionDateUpdateModal(null)
}
```

---

### Étape 3 : Adapter useBlockValidation

**Objectif** : Passer les données depuis `workingProposal` au lieu des états manuels.

#### 3.1 Extraire les valeurs proposées (avant `useBlockValidation`)
```typescript
// Extraire les valeurs proposées depuis workingProposal
const proposedValues = useMemo(() => {
  if (!workingProposal) return selectedChanges
  
  const values: Record<string, any> = {}
  
  // Pour les propositions simples, workingProposal.changes contient déjà tout
  Object.entries(workingProposal.changes).forEach(([field, value]) => {
    if (value !== undefined) {
      values[field] = value
    }
  })
  
  return values
}, [workingProposal, selectedChanges])
```

#### 3.2 Adapter l'appel à useBlockValidation
```typescript
const {
  blockStatus,
  validateBlock: validateBlockBase,
  unvalidateBlock: unvalidateBlockBase,
  isBlockValidated,
  isPending: isBlockPending
} = useBlockValidation({
  proposals: workingProposal?.originalProposal ? [workingProposal.originalProposal] : (proposal ? [proposal] : []),
  blockProposals,
  // ✅ Passer les données depuis workingProposal
  selectedChanges: proposedValues,
  userModifiedChanges: workingProposal?.userModifiedChanges || {},
  userModifiedRaceChanges: workingProposal?.userModifiedRaceChanges || {}
})
```

---

### Étape 4 : Adapter le context

**Objectif** : Passer `workingProposal` au context au lieu des états manuels.

#### 4.1 Calcul des données consolidées
```typescript
const consolidatedChanges = useMemo(() => {
  if (workingProposal) {
    // ✅ Utiliser workingProposal.changes directement
    return Object.entries(workingProposal.changes).map(([field, value]) => ({
      field,
      options: [{
        proposalId: proposal!.id,
        agentName: proposal!.agentName || 'Agent',
        proposedValue: value,
        confidence: proposal!.confidence || 0,
        createdAt: proposal!.createdAt
      }],
      currentValue: (proposal!.changes as any)?.[field]?.current
    }))
  }
  
  // Fallback (compatibilité)
  return consolidateChanges([proposal!], isNewEvent)
}, [workingProposal, proposal, isNewEvent, consolidateChanges])

const consolidatedRaceChanges = useMemo(() => {
  if (workingProposal) {
    // ✅ Utiliser workingProposal.races directement
    return Object.entries(workingProposal.races).map(([raceId, raceData]) => ({
      raceId,
      raceName: raceData.name || 'Course',
      proposalIds: [proposal!.id],
      fields: raceData
    }))
  }
  
  // Fallback (compatibilité)
  return consolidateRaceChanges([proposal!])
}, [workingProposal, proposal, consolidateRaceChanges])
```

#### 4.2 Context final
```typescript
const context: ProposalContext = {
  proposal: workingProposal?.originalProposal || proposal!,
  consolidatedChanges,
  consolidatedRaceChanges,
  
  // ✅ États depuis workingProposal
  selectedChanges: workingProposal ? {} : selectedChanges, // Vidé en mode hook
  userModifiedChanges: workingProposal?.userModifiedChanges || {},
  userModifiedRaceChanges: workingProposal?.userModifiedRaceChanges || {},
  
  // Handlers (déjà adaptés)
  handleFieldSelect,
  handleFieldModify,
  handleEditionStartDateChange,
  handleApproveAll,
  handleRejectAll,
  handleRaceFieldModify,
  handleKillEvent,
  handleReviveEvent,
  
  // Utilitaires (inchangés)
  formatValue,
  formatAgentsList,
  getEventTitle,
  getEditionYear,
  
  // États UI (inchangés)
  isLoading: isLoading || isEditorLoading,
  isPending: updateProposalMutation.isPending,
  isEventDead,
  editionTimezone,
  isNewEvent,
  allPending,
  hasApproved,
  killDialogOpen,
  setKillDialogOpen,
  isEditionCanceled,
  
  // Validation par blocs
  validateBlock,
  unvalidateBlock,
  isBlockValidated,
  isBlockPending,
  blockProposals
}
```

---

### Étape 5 : Tests de non-régression

**Objectif** : Vérifier que la migration n'a cassé aucune fonctionnalité.

#### 5.1 Tests manuels dans l'interface

**Cas 1 : Édition de champs simples**
1. Ouvrir une proposition simple (ex: EDITION_UPDATE)
2. Modifier le champ `name`
3. ✅ Vérifier que la modification est visible immédiatement
4. ✅ Vérifier que l'autosave fonctionne (icône de sauvegarde)
5. Rafraîchir la page
6. ✅ Vérifier que la modification est persistée

**Cas 2 : Édition de courses**
1. Modifier la distance d'une course
2. ✅ Vérifier que la modification est visible
3. Valider le bloc "races"
4. ✅ Vérifier que le payload contient la distance modifiée

**Cas 3 : Propagation de dates**
1. Modifier `Edition.startDate`
2. ✅ Modale de propagation s'affiche
3. Accepter la propagation
4. ✅ Vérifier que toutes les courses ont la nouvelle date
5. Valider le bloc "edition"
6. ✅ Vérifier que le payload contient les courses mises à jour

**Cas 4 : Validation par blocs**
1. Modifier plusieurs champs dans différents blocs
2. Valider le bloc "event"
3. ✅ Seuls les champs du bloc "event" sont validés
4. ✅ Le payload contient tous les champs modifiés du bloc

#### 5.2 Vérification des logs

Dans la console DevTools, vérifier :
- ✅ Pas d'erreurs TypeScript
- ✅ Logs d'autosave : `Autosaving proposal...`
- ✅ Logs de validation : `Validating block: event`

---

## Différences avec GroupedProposalDetailBase

### Simplifications possibles

1. **Pas de consolidation multi-agents**
   - Mode simple = 1 seule proposition
   - `workingProposal.changes` est déjà un objet plat
   - Pas besoin de `selectOption()` ni de `consolidatedChanges[i].options`

2. **Pas de `selectOption()`**
   - Cette méthode est exclusive au mode groupé
   - En mode simple, seul `updateField()` est utilisé

3. **Structure de `workingProposal` plus simple**
   ```typescript
   // Mode simple
   interface WorkingProposal {
     id: string
     originalProposal: Proposal
     changes: Record<string, any>  // Plat
     races: Record<string, RaceData>
     approvedBlocks: Record<string, boolean>
     isDirty: boolean
     lastSaved: Date | null
   }
   ```

### Points communs

1. **Handlers identiques** : `updateField`, `updateRace`, `validateBlock`, etc.
2. **Autosave** : Même mécanisme (debounced 2s)
3. **Validation par blocs** : Même logique
4. **Sauvegarde des modifications** : Même API backend

---

## Estimation de temps

| Étape | Durée estimée | Complexité |
|-------|---------------|------------|
| Étape 1 : Initialisation du hook | 30 min | 🟢 Simple |
| Étape 2 : Adapter les handlers | 45 min | 🟢 Simple |
| Étape 3 : Adapter useBlockValidation | 30 min | 🟡 Moyen |
| Étape 4 : Adapter le context | 30 min | 🟡 Moyen |
| Étape 5 : Tests de non-régression | 45 min | 🟡 Moyen |
| **TOTAL** | **3h** | 🟢 Gérable |

---

## Checklist de migration

### Préparation
- [ ] Lire ce document en entier
- [ ] Créer une branche Git : `git checkout -b refactor/proposal-detail-base-migration`
- [ ] Commit initial : `git commit -m "chore: début migration ProposalDetailBase"`

### Développement
- [ ] **Étape 1** : Initialiser `useProposalEditor` en mode simple
- [ ] **Étape 2** : Adapter tous les handlers
- [ ] **Étape 3** : Adapter `useBlockValidation`
- [ ] **Étape 4** : Adapter le context
- [ ] Commit : `git commit -m "refactor(ProposalDetailBase): migration vers useProposalEditor"`

### Tests
- [ ] **Étape 5.1** : Tests manuels (4 cas)
- [ ] **Étape 5.2** : Vérification des logs
- [ ] Corriger les bugs éventuels
- [ ] Commit : `git commit -m "test(ProposalDetailBase): tests de non-régression OK"`

### Finalisation
- [ ] Relire le code pour vérifier la cohérence
- [ ] Mettre à jour `STATUS-2025-11-12.md` : Cocher `ProposalDetailBase migré`
- [ ] Push et créer une PR
- [ ] Code review avec l'équipe

---

## Risques et mitigation

### ⚠️ Risque 1 : Régression sur la propagation de dates

**Impact** : Les modales de confirmation ne s'affichent plus ou les dates ne sont pas propagées.

**Mitigation** :
- Tester spécifiquement le cas de propagation des dates
- Vérifier que `updateRaceEditor()` est appelé pour chaque course
- Logs de debugging si nécessaire

### ⚠️ Risque 2 : Payload incomplet lors de la validation

**Impact** : Modifications utilisateur perdues (même problème que PHASE 1).

**Mitigation** :
- Vérifier que `useBlockValidation` reçoit bien `workingProposal.userModifiedChanges`
- Vérifier que `workingProposal.userModifiedRaceChanges` est bien rempli
- Tester la validation de chaque bloc séparément

### ⚠️ Risque 3 : TypeScript errors

**Impact** : Compilation échoue après migration.

**Mitigation** :
- Utiliser `isSimpleReturn(editorResult)` pour le type narrowing
- Vérifier que tous les types sont correctement importés
- Exécuter `npm run tsc` avant de commit

---

## Prochaines étapes après cette migration

Une fois `ProposalDetailBase` migré, la **PHASE 2 sera complète** ! 🎉

Ensuite, on pourra passer à la **PHASE 3 : Nettoyage final**
- Supprimer `selectedChanges` complètement
- Supprimer le recalcul local de `consolidatedChanges`
- Évaluer si `useProposalLogic` peut être supprimé ou simplifié
- Supprimer les fallbacks de compatibilité

---

## Ressources

- **État actuel** : `docs/proposal-state-refactor/STATUS-2025-11-12.md`
- **Plan global** : `docs/proposal-state-refactor/PLAN-PROPOSAL-STATE-REFACTOR.md`
- **Migration GroupedProposalDetailBase** (référence) : `docs/proposal-state-refactor/archive/PHASE2-MIGRATION-PROGRESS-ARCHIVED.md`
- **Hook source** : `apps/dashboard/src/hooks/useProposalEditor.ts`
- **Fichier à migrer** : `apps/dashboard/src/pages/proposals/detail/base/ProposalDetailBase.tsx`

---

## Auteur

- **Date** : 2025-11-12
- **Contexte** : Après migration réussie de `GroupedProposalDetailBase`
