# Phase 4 : Nettoyage complet de GroupedProposalDetailBase

**Date** : 2025-11-12  
**Objectif** : Supprimer tout le code legacy de consolidation manuelle et simplifier `GroupedProposalDetailBase` pour utiliser exclusivement `workingGroup`

---

## 🎯 Contexte

Après la Phase 2, `GroupedProposalDetailBase` utilise `useProposalEditor` en mode groupé avec `workingGroup`, mais conserve **beaucoup de code legacy** :

- ❌ `selectedChanges` / `setSelectedChanges` (état local)
- ❌ Fonctions `consolidateChanges()` / `consolidateRaceChanges()` (logique manuelle)
- ❌ `useEffect` pour auto-sélection (redondant avec le hook)
- ❌ Handlers qui dupliquent la logique du hook

**Problème** : Duplication de responsabilités entre le hook et le composant.

**Solution** : Single Source of Truth totale → `workingGroup` du hook.

---

## 📊 État actuel (après Phase 3)

### Code à nettoyer

```typescript
// ❌ LEGACY: États locaux redondants (lignes 193)
const [selectedChanges, setSelectedChanges] = useState<Record<string, any>>({})

// ❌ LEGACY: Fonctions de consolidation manuelles (lignes 210-218)
const consolidateChanges = (proposals: any[], isNewEvent: boolean) => {
  if (!workingGroup) return []
  return workingGroup.consolidatedChanges
}

const consolidateRaceChanges = (proposals: any[]) => {
  if (!workingGroup) return []
  return workingGroup.consolidatedRaces
}

// ❌ LEGACY: Mémos redondants (lignes 221-234)
const consolidatedChanges = useMemo(() => {
  const changes = consolidateChanges(groupProposals, isNewEvent)
  // ... filtrage manual ...
}, [groupProposals, isNewEvent, consolidateChanges])

const consolidatedRaceChanges = useMemo(() =>
  consolidateRaceChanges(groupProposals),
  [groupProposals, consolidateRaceChanges]
)

// ❌ LEGACY: Auto-sélection manuelle (lignes 461-473)
useEffect(() => {
  const newSelections: Record<string, any> = {}
  
  consolidatedChanges.forEach(change => {
    if (!selectedChanges[change.field] && change.options.length > 0) {
      newSelections[change.field] = change.options[0].proposedValue
    }
  })
  
  if (Object.keys(newSelections).length > 0) {
    setSelectedChanges(prev => ({ ...prev, ...newSelections }))
  }
}, [consolidatedChanges, selectedChanges, setSelectedChanges])

// ❌ LEGACY: handleSelectField redondant (lignes 301-313)
const handleSelectField = (fieldName: string, selectedValue: any) => {
  if (fieldName === 'startDate') {
    handleEditionStartDateChange(fieldName, selectedValue)
    return
  }
  
  updateFieldEditor(fieldName, selectedValue)  // ✅ Bon
  setSelectedChanges(prev => ({ ...prev, [fieldName]: selectedValue })) // ❌ Redondant
}
```

### Utilisation de `workingGroup`

```typescript
// ✅ Déjà utilisé correctement
const {
  workingGroup,              // Consolidation automatique
  updateField,               // Mise à jour unifiée
  updateRace,                // Gestion races simplifiée
  selectOption,              // Sélection parmi options (PHASE 1.5)
  validateBlock,             // Validation par blocs
  save                       // Autosave
} = useProposalEditor(proposalIds, { autosave: true })
```

---

## 🗑️ Suppressions

### 1. États locaux redondants

**Lignes 193-194** : Supprimer

```typescript
// ❌ SUPPRIMER
const [selectedChanges, setSelectedChanges] = useState<Record<string, any>>({})
```

**Raison** : Les valeurs sélectionnées sont déjà dans `workingGroup.consolidatedChanges[i].selectedValue`.

---

### 2. Fonctions de consolidation manuelles

**Lignes 210-218** : Supprimer

```typescript
// ❌ SUPPRIMER
const consolidateChanges = (proposals: any[], isNewEvent: boolean) => {
  if (!workingGroup) return []
  return workingGroup.consolidatedChanges
}

const consolidateRaceChanges = (proposals: any[]) => {
  if (!workingGroup) return []
  return workingGroup.consolidatedRaces
}
```

**Raison** : Ces fonctions ne font que retourner `workingGroup.*`, elles sont inutiles.

---

### 3. Mémos redondants

**Lignes 221-234** : Simplifier

```typescript
// ❌ AVANT (redondant)
const consolidatedChanges = useMemo(() => {
  const changes = consolidateChanges(groupProposals, isNewEvent)
  const isEventUpdateDisplay = groupProposals.length > 0 && groupProposals[0]?.type === 'EVENT_UPDATE'
  
  return isEventUpdateDisplay
    ? changes.filter(c => c.field !== 'calendarStatus' && c.field !== 'timeZone')
    : changes
}, [groupProposals, isNewEvent, consolidateChanges])

const consolidatedRaceChanges = useMemo(() =>
  consolidateRaceChanges(groupProposals),
  [groupProposals, consolidateRaceChanges]
)

// ✅ APRÈS (direct)
const consolidatedChanges = useMemo(() => {
  if (!workingGroup) return []
  
  const isEventUpdateDisplay = workingGroup.originalProposals[0]?.type === 'EVENT_UPDATE'
  return isEventUpdateDisplay
    ? workingGroup.consolidatedChanges.filter(c => 
        c.field !== 'calendarStatus' && c.field !== 'timeZone'
      )
    : workingGroup.consolidatedChanges
}, [workingGroup])

const consolidatedRaceChanges = useMemo(() => {
  return workingGroup?.consolidatedRaces || []
}, [workingGroup])
```

---

### 4. Auto-sélection manuelle

**Lignes 461-473** : Supprimer

```typescript
// ❌ SUPPRIMER (géré par le hook)
useEffect(() => {
  const newSelections: Record<string, any> = {}
  
  consolidatedChanges.forEach(change => {
    if (!selectedChanges[change.field] && change.options.length > 0) {
      newSelections[change.field] = change.options[0].proposedValue
    }
  })
  
  if (Object.keys(newSelections).length > 0) {
    setSelectedChanges(prev => ({ ...prev, ...newSelections }))
  }
}, [consolidatedChanges, selectedChanges, setSelectedChanges])
```

**Raison** : Le hook `useProposalEditor` initialise déjà `selectedValue` à `options[0].proposedValue` lors de la consolidation.

---

### 5. Handler `handleSelectField` redondant

**Lignes 301-313** : Simplifier

```typescript
// ❌ AVANT (duplication)
const handleSelectField = (fieldName: string, selectedValue: any) => {
  if (fieldName === 'startDate') {
    handleEditionStartDateChange(fieldName, selectedValue)
    return
  }
  
  updateFieldEditor(fieldName, selectedValue)
  setSelectedChanges(prev => ({ ...prev, [fieldName]: selectedValue })) // ❌ Redondant
}

// ✅ APRÈS (simplifié)
const handleSelectField = (fieldName: string, selectedValue: any, proposalId?: string) => {
  if (fieldName === 'startDate') {
    handleEditionStartDateChange(fieldName, selectedValue)
    return
  }
  
  // Si proposalId fourni, utiliser selectOption (sélectionner parmi options)
  if (proposalId) {
    selectOption(fieldName, proposalId)
  } else {
    // Sinon, mettre à jour directement (modification manuelle)
    updateFieldEditor(fieldName, selectedValue)
  }
}
```

**Note** : Cette version simplifie le code ET ajoute le support de `selectOption()` ajouté en Phase 1.5.

---

### 6. Handler `handleFieldModify` redondant

**Lignes 315-324** : Simplifier

```typescript
// ❌ AVANT (duplication)
const handleFieldModify = (fieldName: string, newValue: any, reason?: string) => {
  updateFieldEditor(fieldName, newValue)
  
  setSelectedChanges(prev => ({
    ...prev,
    [fieldName]: newValue
  }))
}

// ✅ APRÈS (direct)
const handleFieldModify = (fieldName: string, newValue: any, reason?: string) => {
  updateFieldEditor(fieldName, newValue)
  // Plus besoin de setSelectedChanges, workingGroup.userModifiedChanges est mis à jour
}
```

---

### 7. `proposedValues` mémo redondant

**Lignes 834-849** : Supprimer

```typescript
// ❌ SUPPRIMER (géré par le hook)
const proposedValues = useMemo(() => {
  if (!workingGroup) return selectedChanges
  
  const values: Record<string, any> = {}
  workingGroup.consolidatedChanges.forEach(change => {
    const value = change.selectedValue !== undefined 
      ? change.selectedValue 
      : change.options[0]?.proposedValue
    
    if (value !== undefined) {
      values[change.field] = value
    }
  })
  return values
}, [workingGroup, selectedChanges])
```

**Raison** : Le hook expose déjà `workingGroup.userModifiedChanges` qui contient les valeurs consolidées.

---

### 8. Context `selectedChanges` legacy

**Ligne 890** : Simplifier

```typescript
// ❌ AVANT (conditionnel confus)
selectedChanges: workingGroup ? {} : selectedChanges,

// ✅ APRÈS (direct)
selectedChanges: {}, // Obsolète, garder pour compatibilité interface mais vide
```

**Note** : On garde le champ dans l'interface `GroupedProposalContext` pour ne pas casser les composants enfants, mais il sera toujours vide. Les composants doivent lire `consolidatedChanges[i].selectedValue` à la place.

---

## ✅ Modifications

### 1. Cascade dates avec `workingGroup`

**Lignes 237-268** : Simplifier

```typescript
// ❌ AVANT (utilise selectedChanges legacy)
const consolidatedRaceChangesWithCascade = useMemo(() => {
  const startDateChange = consolidatedChanges.find(c => c.field === 'startDate')
  const editionStartDate = selectedChanges['startDate'] || startDateChange?.options[0]?.proposedValue
  // ...
}, [consolidatedRaceChanges, consolidatedChanges, selectedChanges])

// ✅ APRÈS (utilise workingGroup)
const consolidatedRaceChangesWithCascade = useMemo(() => {
  if (!workingGroup) return []
  
  // Récupérer startDate depuis workingGroup
  const startDateChange = workingGroup.consolidatedChanges.find(c => c.field === 'startDate')
  const editionStartDate = startDateChange?.selectedValue || startDateChange?.options[0]?.proposedValue
  
  if (!editionStartDate) return workingGroup.consolidatedRaces
  
  // Propager startDate aux courses
  return workingGroup.consolidatedRaces.map(raceChange => ({
    ...raceChange,
    fields: Object.entries(raceChange.fields).reduce((acc, [fieldName, fieldData]) => {
      if (fieldName === 'startDate') {
        const firstOption = fieldData.options?.[0]
        if (!firstOption) {
          return { ...acc, [fieldName]: fieldData }
        }
        
        return {
          ...acc,
          [fieldName]: {
            ...fieldData,
            options: [{
              ...firstOption,
              proposedValue: editionStartDate
            }]
          }
        }
      }
      return { ...acc, [fieldName]: fieldData }
    }, {})
  }))
}, [workingGroup])
```

---

### 2. Edition timezone depuis `workingGroup`

**Lignes 429-446** : Simplifier

```typescript
// ❌ AVANT (utilise selectedChanges legacy)
const editionTimezone = useMemo(() => {
  if (selectedChanges.timeZone) {
    return selectedChanges.timeZone
  }
  // ... complexe ...
}, [groupProposals, selectedChanges.timeZone])

// ✅ APRÈS (utilise workingGroup)
const editionTimezone = useMemo(() => {
  if (!workingGroup) return 'Europe/Paris'
  
  // Chercher timeZone dans userModifiedChanges (priorité)
  if (workingGroup.userModifiedChanges?.timeZone) {
    return workingGroup.userModifiedChanges.timeZone
  }
  
  // Sinon chercher dans consolidatedChanges
  const timeZoneChange = workingGroup.consolidatedChanges.find(c => c.field === 'timeZone')
  if (timeZoneChange?.selectedValue) {
    return timeZoneChange.selectedValue
  }
  if (timeZoneChange?.options[0]?.proposedValue) {
    return timeZoneChange.options[0].proposedValue
  }
  
  return 'Europe/Paris' // Fallback
}, [workingGroup])
```

---

### 3. `isEditionCanceled` depuis `workingGroup`

**Lignes 449-454** : Simplifier

```typescript
// ❌ AVANT (utilise selectedChanges legacy)
const isEditionCanceled = useMemo(() => {
  const calendarStatus = workingGroup?.userModifiedChanges?.['calendarStatus'] || 
                        selectedChanges['calendarStatus'] || 
                        consolidatedChanges.find(c => c.field === 'calendarStatus')?.options[0]?.proposedValue
  return calendarStatus === 'CANCELED'
}, [selectedChanges, workingGroup, consolidatedChanges])

// ✅ APRÈS (utilise workingGroup uniquement)
const isEditionCanceled = useMemo(() => {
  if (!workingGroup) return false
  
  // Chercher calendarStatus dans userModifiedChanges (priorité)
  if (workingGroup.userModifiedChanges?.calendarStatus) {
    return workingGroup.userModifiedChanges.calendarStatus === 'CANCELED'
  }
  
  // Sinon chercher dans consolidatedChanges
  const calendarStatusChange = workingGroup.consolidatedChanges.find(c => c.field === 'calendarStatus')
  const calendarStatus = calendarStatusChange?.selectedValue || calendarStatusChange?.options[0]?.proposedValue
  return calendarStatus === 'CANCELED'
}, [workingGroup])
```

---

### 4. Context `consolidatedChanges` / `consolidatedRaceChanges`

**Lignes 886-887** : Simplifier

```typescript
// ❌ AVANT (conditionnel)
consolidatedChanges: workingGroup?.consolidatedChanges || consolidatedChanges,
consolidatedRaceChanges: workingGroup?.consolidatedRaces || consolidatedRaceChangesWithCascade,

// ✅ APRÈS (direct)
consolidatedChanges: consolidatedChanges, // Déjà depuis workingGroup après nettoyage
consolidatedRaceChanges: consolidatedRaceChangesWithCascade, // Déjà depuis workingGroup après nettoyage
```

---

## 📝 Checklist de migration

### Suppressions
- [ ] Supprimer `const [selectedChanges, setSelectedChanges]` (ligne 193)
- [ ] Supprimer `consolidateChanges()` (lignes 210-213)
- [ ] Supprimer `consolidateRaceChanges()` (lignes 215-218)
- [ ] Simplifier `consolidatedChanges` mémo (lignes 221-229)
- [ ] Simplifier `consolidatedRaceChanges` mémo (lignes 231-234)
- [ ] Supprimer `useEffect` auto-sélection (lignes 461-473)
- [ ] Supprimer `proposedValues` mémo (lignes 834-849)

### Modifications
- [ ] Simplifier `handleSelectField` (lignes 301-313)
- [ ] Simplifier `handleFieldModify` (lignes 315-324)
- [ ] Simplifier `consolidatedRaceChangesWithCascade` (lignes 237-268)
- [ ] Simplifier `editionTimezone` (lignes 429-446)
- [ ] Simplifier `isEditionCanceled` (lignes 449-454)
- [ ] Nettoyer context `selectedChanges` (ligne 890)
- [ ] Nettoyer context `consolidatedChanges` / `consolidatedRaceChanges` (lignes 886-887)

### Tests
- [ ] Vérifier affichage propositions NEW_EVENT groupées
- [ ] Vérifier affichage propositions EDITION_UPDATE groupées
- [ ] Vérifier sélection d'options parmi plusieurs agents (bouton radio)
- [ ] Vérifier modification manuelle de champs
- [ ] Vérifier propagation de `startDate` aux courses
- [ ] Vérifier validation par blocs
- [ ] Vérifier sauvegarde autosave (debounced 2s)

---

## 📊 Gain estimé

| Métrique | Avant | Après | Gain |
|----------|-------|-------|------|
| **Lignes de code** | ~1082 | ~**930** | **-152 lignes** (-14%) |
| **États locaux** | 1 (`selectedChanges`) | 0 | -100% |
| **Mémos redondants** | 4 | 0 | -100% |
| **useEffect inutiles** | 1 | 0 | -100% |
| **Fonctions helpers** | 2 (`consolidateChanges`, `consolidateRaceChanges`) | 0 | -100% |
| **Complexité cyclomatique** | Haute (logique dispersée) | **Basse** (Single Source of Truth) | **-50%** estimé |

---

## 🎯 Bénéfices

### Avant (Phase 3)
- ❌ Duplication de responsabilités (hook + composant)
- ❌ Logique de consolidation en double
- ❌ États locaux synchronisés manuellement
- ❌ Risque de désynchronisation
- ❌ Code difficile à maintenir

### Après (Phase 4)
- ✅ **Single Source of Truth totale** : `workingGroup`
- ✅ Pas de logique de consolidation manuelle
- ✅ Pas d'états locaux redondants
- ✅ Code simplifié et lisible
- ✅ Maintenance facilitée

---

## 🚀 Prochaines étapes

1. **Appliquer les suppressions** (checklist ci-dessus)
2. **Tester manuellement** :
   - Propositions NEW_EVENT groupées
   - Propositions EDITION_UPDATE groupées
   - Validation par blocs
   - Autosave
3. **Documenter** les changements dans `WARP.md`
4. **Commit** : "Phase 4: Cleanup GroupedProposalDetailBase (-152 lignes)"

---

## 📚 Ressources

- `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx` - Fichier à nettoyer
- `apps/dashboard/src/hooks/useProposalEditor.ts` - Hook source de vérité
- `docs/proposal-state-refactor/PLAN-PROPOSAL-STATE-REFACTOR.md` - Plan global
- `docs/proposal-state-refactor/PHASE3-COMPLETE-2025-11-12.md` - Phase 3 terminée
