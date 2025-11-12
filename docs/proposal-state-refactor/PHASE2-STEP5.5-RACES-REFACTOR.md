# Phase 2 - Étape 5.5 : Refactoring RacesChangesTable

**Date** : 2025-11-11  
**Problème** : Architecture incohérente entre RacesChangesTable et les autres composants

## 🔴 Problème actuel

### Architecture incohérente

**Autres composants** (✅ Cohérent) :
```
CategorizedEditionChangesTable
  ↓
consolidatedChanges (mémoire)
  ↓
userModifiedChanges (mémoire)
  ↓
Sauvegarde manuelle (validation par blocs)
```

**RacesChangesTable** (❌ Incohérent) :
```
RacesChangesTable
  ↓
proposal.userModifiedChanges (DB) ← useEffect
  ↓
États locaux (racesToDelete, raceEdits)
  ↓
syncWithBackend() (direct)
```

### Conséquences

1. **Bugs d'affichage** : Modifications non visibles immédiatement
2. **Dépendance au cache React Query** : Invalidation manuelle nécessaire
3. **Double état** : Mémoire (`workingGroup`) + DB (`proposal`)
4. **Code complexe** : useEffect, synchronisation manuelle, etc.

---

## ✅ Solution : Lire depuis workingGroup

### Nouvelle architecture (cohérente)

```
RacesChangesTable
  ↓
workingGroup.consolidatedRaces (mémoire)
  ↓
workingGroup.userModifiedRaceChanges (mémoire)
  ↓
handleRaceFieldModify (context) → updateRaceEditor → saveEditor
```

### Bénéfices

1. ✅ **Cohérence** : Même architecture que les autres composants
2. ✅ **Réactivité** : Changements visibles immédiatement
3. ✅ **Simplicité** : Pas de useEffect, pas de syncWithBackend
4. ✅ **Single Source of Truth** : workingGroup uniquement

---

## 🛠️ Plan de refactoring

### Étape 1 : Modifier les props de RacesChangesTable

**Avant** :
```typescript
interface RacesChangesTableProps {
  existingRaces: ExistingRace[]
  racesToAdd: RaceToAdd[]
  proposalId?: string
  proposal?: any  // ❌ Utilisé pour lire userModifiedChanges
  // ...
}
```

**Après** :
```typescript
interface RacesChangesTableProps {
  consolidatedRaces: ConsolidatedRaceChange[]  // ✅ Depuis workingGroup
  userModifiedRaceChanges: Record<string, any> // ✅ Depuis workingGroup
  onRaceFieldModify: (raceId: string, field: string, value: any) => void
  // ...
}
```

---

### Étape 2 : Supprimer les états locaux redondants

**Supprimer** :
```typescript
const [raceEdits, setRaceEdits] = useState<Record<string, Record<string, any>>>({})
const [racesToDelete, setRacesToDelete] = useState<Set<number>>(new Set())
const [racesToAddFiltered, setRacesToAddFiltered] = useState<Set<number>>(new Set())

// Supprimer useEffect qui charge depuis proposal
useEffect(() => {
  if (proposal?.userModifiedChanges?.raceEdits) {
    setRaceEdits(proposal.userModifiedChanges.raceEdits)
  }
  // ...
}, [proposal?.userModifiedChanges])

// Supprimer syncWithBackend
const syncWithBackend = async (updates: any) => { /* ... */ }
```

**Garder** :
```typescript
const [editingRace, setEditingRace] = useState<...>(null)
const [editValue, setEditValue] = useState<string>('')
```

---

### Étape 3 : Utiliser consolidatedRaces pour l'affichage

**Avant** :
```typescript
// Lire depuis props.existingRaces (DB)
existingRaces.map((race, index) => (
  <TableRow key={race.id}>
    <TableCell>{getEditedValue('existing', index, 'name', race.name)}</TableCell>
  </TableRow>
))
```

**Après** :
```typescript
// Lire depuis props.consolidatedRaces (mémoire)
consolidatedRaces.map((race) => {
  const userEdits = userModifiedRaceChanges[race.raceId] || {}
  const displayValue = userEdits[field] ?? race.fields[field]
  
  return (
    <TableRow key={race.raceId}>
      <TableCell>{displayValue}</TableCell>
    </TableRow>
  )
})
```

---

### Étape 4 : Simplifier saveEdit

**Avant** :
```typescript
const saveEdit = () => {
  if (!editingRace) return
  
  if (handleRaceFieldModify) {
    handleRaceFieldModify(editingRace.index, editingRace.field, editValue)
  } else {
    // Fallback syncWithBackend
    const key = `${editingRace.type}-${editingRace.index}`
    const newEdits = { /* ... */ }
    setRaceEdits(newEdits)
    syncWithBackend({ raceEdits: newEdits })
  }
  
  setEditingRace(null)
}
```

**Après** :
```typescript
const saveEdit = () => {
  if (!editingRace) return
  
  // Appeler directement le handler (pas de fallback)
  onRaceFieldModify(editingRace.raceId, editingRace.field, editValue)
  setEditingRace(null)
}
```

---

### Étape 5 : Passer les bonnes props depuis le parent

**EditionUpdateGroupedDetail.tsx** :

```typescript
<RacesChangesTable
  consolidatedRaces={workingGroup?.consolidatedRaces || []}
  userModifiedRaceChanges={workingGroup?.userModifiedRaceChanges || {}}
  onRaceFieldModify={(raceId, field, value) => {
    updateRaceEditor(raceId, field, value)
    saveEditor()  // Sauvegarde immédiate
  }}
  disabled={isBlockValidated('races') || isEventDead}
  isBlockValidated={isBlockValidated('races')}
  onValidateBlock={() => validateBlock('races', blockProposals['races'] || [])}
  onUnvalidateBlock={() => unvalidateBlock('races')}
  isBlockPending={isBlockPending}
  validationDisabled={isEventDead}
/>
```

---

## 📋 Checklist

### Préparation
- [ ] Lire `workingGroup.consolidatedRaces` dans GroupedProposalDetailBase
- [ ] Vérifier que `consolidatedRaces` est bien peuplé par le hook

### Refactoring RacesChangesTable
- [ ] Modifier l'interface `RacesChangesTableProps`
- [ ] Supprimer `useEffect` qui charge depuis `proposal`
- [ ] Supprimer `syncWithBackend()`
- [ ] Supprimer états locaux `raceEdits`, `racesToDelete`, `racesToAddFiltered`
- [ ] Utiliser `consolidatedRaces` pour l'affichage
- [ ] Utiliser `userModifiedRaceChanges` pour les valeurs éditées
- [ ] Simplifier `saveEdit()` pour appeler `onRaceFieldModify`

### Intégration
- [ ] Passer les props depuis `EditionUpdateGroupedDetail`
- [ ] Passer les props depuis `EditionUpdateDetail` (propositions simples)

### Tests
- [ ] Modifier une course → Affichage immédiat ✅
- [ ] Rafraîchir la page → Modification persistée ✅
- [ ] Valider le bloc races → Application correcte ✅

---

## 🎯 Résultat attendu

### Avant (❌)
- Double état (mémoire + DB)
- Bugs d'affichage
- Code complexe (useEffect, syncWithBackend)
- Incohérence avec les autres composants

### Après (✅)
- Single Source of Truth (workingGroup)
- Affichage réactif
- Code simple et cohérent
- Architecture unifiée

---

## ⏱️ Estimation

- **Préparation** : 15 min
- **Refactoring** : 30 min
- **Tests** : 15 min

**Total** : ~1h

---

## 📚 Ressources

- `PHASE2-STEP5-FIX.md` - Tentatives précédentes
- `PHASE2-STEP5-TESTS.md` - Tests originaux
- `PLAN-PROPOSAL-STATE-REFACTOR.md` - Vision globale

---

**Prêt à commencer ?** On démarre par la préparation : vérifier que `workingGroup.consolidatedRaces` est bien peuplé. 🚀
