# Phase 2 - Step 6 : Nettoyage final - EN COURS 🚧

**Date** : 2025-11-12  
**Statut** : 🟡 En cours (70% complété)

## Objectifs du Step 6

1. ✅ Ajouter type guard `isGroupReturn()` dans useProposalEditor
2. ✅ Ajouter `isDirty` au type de retour groupé
3. ✅ Supprimer les anciens états locaux (`userModifiedChanges`, `userModifiedRaceChanges`)
4. ⚠️ **EN COURS** : Remplacer toutes les références aux anciens états par `workingGroup.*`
5. ⚠️ **EN COURS** : Supprimer les logs de debugging Phase 2
6. ❌ **TODO** : Fixer les composants RaceUpdate* (hors scope Step 6, à faire séparément)
7. ❌ **TODO** : Tests de compilation et validation

## Modifications déjà effectuées ✅

### 1. Hook useProposalEditor (apps/dashboard/src/hooks/useProposalEditor.ts)

**✅ Type guard ajouté** (ligne 148) :
```typescript
export function isGroupReturn(result: UseProposalEditorReturn | UseProposalEditorGroupReturn): result is UseProposalEditorGroupReturn {
  return 'workingGroup' in result
}
```

**✅ isDirty ajouté au type** (ligne 123) :
```typescript
export interface UseProposalEditorGroupReturn {
  // État
  workingGroup: WorkingProposalGroup | null
  isLoading: boolean
  isSaving: boolean
  error: Error | null
  isDirty: boolean  // ← Ajouté
  // ... reste inchangé
}
```

**✅ isDirty retourné** (ligne 977) :
```typescript
return {
  workingGroup,
  isLoading,
  isSaving,
  error,
  isDirty: workingGroup?.isDirty || false,  // ← Ajouté
  // ...
}
```

## Modifications restantes à faire ⚠️

### 2. GroupedProposalDetailBase.tsx

**Fichier** : `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`

#### A. Type narrowing au début du composant

**Ligne ~163** - Remplacer :
```typescript
const {
  workingGroup,
  isLoading: isEditorLoading,
  updateField: updateFieldEditor,
  selectOption,
  updateRace: updateRaceEditor,
  // ...
} = useProposalEditor(proposalIds, { autosave: false })
```

Par :
```typescript
const editorResult = useProposalEditor(proposalIds, { autosave: false })

// Type narrowing pour mode groupé
if (!isGroupReturn(editorResult)) {
  throw new Error('useProposalEditor doit retourner un mode groupé pour GroupedProposalDetailBase')
}

const {
  workingGroup,
  isLoading: isEditorLoading,
  updateField: updateFieldEditor,
  selectOption,
  updateRace: updateRaceEditor,
  deleteRace: deleteRaceEditor,
  addRace: addRaceEditor,
  validateBlock: validateBlockEditor,
  validateAllBlocks: validateAllBlocksEditor,
  isBlockValidated: isBlockValidatedEditor,
  save: saveEditor,
  isDirty: isEditorDirty
} = editorResult
```

#### B. Supprimer les anciens états locaux

**Ligne ~126** - Supprimer complètement :
```typescript
const [userModifiedChanges, setUserModifiedChanges] = useState<Record<string, any>>({})
const [userModifiedRaceChanges, setUserModifiedRaceChanges] = useState<Record<string, Record<string, any>>>({})
```

#### C. Supprimer les logs de debugging Phase 2

**Lignes ~178-195** - Supprimer complètement :
```typescript
// 🔍 PHASE 2: Debugging - Logger l'état du workingGroup après chargement
useEffect(() => {
  if (workingGroup) {
    console.log('🚀 [PHASE 2] workingGroup chargé:', {
      // ...
    })
    // ...
  }
}, [workingGroup])
```

**Lignes ~241, ~261, ~281-346** - Supprimer tous les `console.log` contenant `[PHASE 2]` ou `[handleRaceFieldModify]`

#### D. Simplifier les handlers

**handleSelectField** (ligne ~240) - Remplacer par :
```typescript
const handleSelectField = (fieldName: string, selectedValue: any) => {
  // Si c'est startDate, déléguer à handleEditionStartDateChange
  if (fieldName === 'startDate') {
    handleEditionStartDateChange(fieldName, selectedValue)
    return
  }
  
  // Utiliser le hook pour mettre à jour
  updateFieldEditor(fieldName, selectedValue)
  
  // Garder selectedChanges pour compatibilité
  setSelectedChanges(prev => ({ ...prev, [fieldName]: selectedValue }))\n}
```

**handleFieldModify** (ligne ~260) - Remplacer par :
```typescript
const handleFieldModify = (fieldName: string, newValue: any, reason?: string) => {
  // Utiliser le hook pour mettre à jour
  updateFieldEditor(fieldName, newValue)
  
  // Garder selectedChanges pour compatibilité
  setSelectedChanges(prev => ({
    ...prev,
    [fieldName]: newValue
  }))
}
```

**handleRaceFieldModify** (ligne ~280) - Remplacer par :
```typescript
const handleRaceFieldModify = (raceId: string, fieldName: string, newValue: any) => {
  // Si c'est une modification de startDate d'une course, vérifier si elle sort de la plage d'édition
  if (fieldName === 'startDate' && newValue) {
    const newRaceDate = new Date(newValue)
    const currentStartDate = selectedChanges.startDate || consolidatedChanges.find(c => c.field === 'startDate')?.options[0]?.proposedValue
    const currentEndDate = selectedChanges.endDate || consolidatedChanges.find(c => c.field === 'endDate')?.options[0]?.proposedValue
    
    // Récupérer le nom de la course depuis consolidatedRaceChanges
    const raceChange = consolidatedRaceChangesWithCascade.find(r => r.raceId === raceId)
    const raceName = raceChange?.raceName || 'Course'
    
    // Si la course est AVANT la startDate de l'édition
    if (currentStartDate && newRaceDate < new Date(currentStartDate)) {
      setEditionDateUpdateModal({
        open: true,
        dateType: 'startDate',
        currentEditionDate: currentStartDate,
        newRaceDate: newValue,
        raceName,
        raceIndex: 0
      })
      return
    }
    
    // Si la course est APRÈS la endDate de l'édition
    if (currentEndDate && newRaceDate > new Date(currentEndDate)) {
      setEditionDateUpdateModal({
        open: true,
        dateType: 'endDate',
        currentEditionDate: currentEndDate,
        newRaceDate: newValue,
        raceName,
        raceIndex: 0
      })
      return
    }
  }
  
  // Utiliser le hook pour mettre à jour + sauvegarder immédiatement
  updateRaceEditor(raceId, fieldName, newValue)
  saveEditor()
}
```

**handleEditionStartDateChange** (ligne ~210) - Remplacer les lignes avec `setUserModifiedChanges` par `updateFieldEditor` :
```typescript
// Avant :
setUserModifiedChanges(prev => ({ ...prev, [fieldName]: newValue }))

// Après :
updateFieldEditor(fieldName, newValue)
```

#### E. Passer workingGroup aux composants enfants

Rechercher toutes les occurrences de :
- `userModifiedChanges={userModifiedChanges}` → `userModifiedChanges={workingGroup.userModifiedChanges}`
- `userModifiedRaceChanges={userModifiedRaceChanges}` → `userModifiedRaceChanges={workingGroup.userModifiedRaceChanges}`

Exemples de lignes concernées (recherche approximative) :
- Ligne ~879
- Ligne ~909
- Ligne ~613 (dans context)
- Toute utilisation dans les sections de rendu (EditionUpdateGroupedDetail, NewEventGroupedDetail, etc.)

#### F. Supprimer les `setUserModifiedChanges` et `setUserModifiedRaceChanges`

Rechercher et **commenter** (pas supprimer immédiatement) toutes les lignes contenant :
- `setUserModifiedChanges`
- `setUserModifiedRaceChanges`

Ces lignes deviennent obsolètes car `updateFieldEditor` et `updateRaceEditor` gèrent maintenant les modifications.

## Composants hors scope Step 6 ❌

Ces composants ont des erreurs TypeScript mais sont **hors scope** du Step 6. À traiter séparément après validation du Step 6 :

### RaceUpdateDetail.tsx
**Erreurs** :
- `ConsolidatedRaceChange[]` n'est pas assignable à `RaceChange[]`
- Signature `handleRaceFieldModify(raceId: string, ...)` incompatible avec `(raceIndex: number, ...)`

**Solution** : Adapter le composant pour accepter `ConsolidatedRaceChange[]` ou créer un adaptateur.

### RaceUpdateGroupedDetail.tsx
**Mêmes erreurs** que RaceUpdateDetail.

## Checklist de validation Step 6 ✅

Avant de considérer le Step 6 terminé :

1. [ ] Type guard `isGroupReturn` ajouté et importé
2. [ ] `isDirty` ajouté au type et retourné
3. [ ] Anciens états `userModifiedChanges` et `userModifiedRaceChanges` supprimés
4. [ ] Tous les `console.log` Phase 2 supprimés
5. [ ] Handlers simplifiiés (plus d'appels `set*`)
6. [ ] Props passées avec `workingGroup.*` partout
7. [ ] Compilation TypeScript sans erreurs **dans GroupedProposalDetailBase**
8. [ ] Tests manuels : éditer une proposition groupée et vérifier que les modifications sont sauvegardées

## Commandes de test

```bash
# Vérifier la compilation TypeScript (dashboard seulement)
cd apps/dashboard && npx tsc --noEmit

# Build complet
npm run build

# Compter les erreurs restantes
npm run build 2>&1 | grep "error TS" | wc -l
```

## Prochaines étapes après Step 6

1. **Step 7** : Fixer les composants RaceUpdate* (hors scope Step 6)
2. **Step 8** : Tests manuels complets
3. **Step 9** : Documentation finale de l'architecture
4. **Step 10** : Déploiement

## Notes importantes

⚠️ **Ne pas utiliser sed pour remplacer massivement** - Trop risqué, peut casser le JSX  
✅ **Utiliser edit_files avec search/replace précis** - Plus sûr  
✅ **Tester la compilation après chaque grosse modification** - Détection rapide des régressions
