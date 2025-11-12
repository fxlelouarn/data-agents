# Prochaines étapes : Phase 2 - Intégration dans GroupedProposalDetailBase

**Date** : 2025-11-11  
**Statut actuel** : Phase 1.5 ✅ terminée

## ✅ Ce qui est fait (Phase 1.5)

Le hook `useProposalEditor` supporte maintenant les propositions groupées :

- ✅ Détection automatique du mode (simple vs groupé)
- ✅ Consolidation des changements multi-agents
- ✅ Sauvegarde groupée (même diff sur toutes les propositions)
- ✅ Validation par blocs avec support `proposalIds[]`
- ✅ Nouveaux handlers : `selectOption()`, `validateAllBlocks()`, `isBlockValidated()`
- ✅ Rétrocompatibilité totale avec mode simple

**Documentation complète** : `docs/PHASE1.5-GROUP-SUPPORT-COMPLETE.md`

## 🎯 Objectif Phase 2

Intégrer le hook dans `GroupedProposalDetailBase.tsx` pour remplacer les états locaux actuels et éliminer la duplication d'état.

## 📝 Plan d'action

### Étape 1 : Initialiser le hook (15 min)

**Fichier** : `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`

```typescript
// Ligne 151 - Après useProposalGroup()
const proposalIds = useMemo(() => {
  return groupProposals.map(p => p.id)
}, [groupProposals])

const {
  workingGroup,
  isLoading: isEditorLoading,
  updateField,
  selectOption,
  updateRace,
  validateBlock,
  validateAllBlocks,
  isBlockValidated
} = useProposalEditor(proposalIds, { autosave: false })
```

**Attention** : Le hook est appelé avec `proposalIds` qui doit être stable (useMemo).

### Étape 2 : Adapter les handlers existants (30 min)

#### A. `handleFieldModify()`

**Ancien code** (ligne 302) :
```typescript
const handleFieldModify = (fieldName: string, newValue: any) => {
  setUserModifiedChanges(prev => ({ ...prev, [fieldName]: newValue }))
  setSelectedChanges(prev => ({ ...prev, [fieldName]: newValue }))
}
```

**Nouveau code** :
```typescript
const handleFieldModify = (fieldName: string, newValue: any) => {
  updateField(fieldName, newValue)
}
```

#### B. `handleRaceFieldModify()`

**Ancien code** (ligne 339) :
```typescript
const handleRaceFieldModify = (raceIndex: number, fieldName: string, newValue: any) => {
  setUserModifiedRaceChanges(prev => ({
    ...prev,
    [raceIndex]: {
      ...(prev[raceIndex] || {}),
      [fieldName]: newValue
    }
  }))
}
```

**Nouveau code** :
```typescript
const handleRaceFieldModify = (raceIndex: number, fieldName: string, newValue: any) => {
  const raceId = `race-${raceIndex}` // Adapter selon la structure
  updateRace(raceId, fieldName, newValue)
}
```

### Étape 3 : Adapter les composants enfants (45 min)

#### A. Passer `workingGroup` au lieu des états locaux

**Ancien code** (ligne 650-700) :
```typescript
const context: GroupedProposalContext = {
  groupProposals,
  selectedChanges,
  userModifiedChanges,
  userModifiedRaceChanges,
  consolidatedChanges, // Calculé par useProposalLogic
  // ...
}
```

**Nouveau code** :
```typescript
const context: GroupedProposalContext = {
  groupProposals: workingGroup.originalProposals,
  consolidatedChanges: workingGroup.consolidatedChanges,
  consolidatedRaces: workingGroup.consolidatedRaces,
  userModifiedChanges: workingGroup.userModifiedChanges,
  userModifiedRaceChanges: workingGroup.userModifiedRaceChanges,
  approvedBlocks: workingGroup.approvedBlocks,
  // Handlers du hook
  handleFieldModify: updateField,
  handleRaceFieldModify: updateRace,
  validateBlock,
  validateAllBlocks,
  isBlockValidated,
  // ...
}
```

#### B. Adapter les sections de rendu

**Fichiers à vérifier** :
- `CategorizedEventChangesTable.tsx` (ligne 100-200)
- `CategorizedEditionChangesTable.tsx` (ligne 150-250)
- `RacesChangesTable.tsx` (ligne 75-150)

**Changement clé** : Les composants doivent maintenant consommer `workingGroup.consolidatedChanges` au lieu de `consolidatedChanges` calculé localement.

### Étape 4 : Supprimer les anciens états (15 min)

Une fois que tout fonctionne, supprimer :

```typescript
// ❌ À supprimer
const [userModifiedChanges, setUserModifiedChanges] = useState<Record<string, any>>({})
const [userModifiedRaceChanges, setUserModifiedRaceChanges] = useState<Record<number, Record<string, any>>>({})

// ❌ À supprimer de useProposalLogic
const {
  selectedChanges,
  setSelectedChanges,
  consolidateChanges,
  consolidateRaceChanges,
  // ...
} = useProposalLogic()
```

### Étape 5 : Tests manuels (30 min)

#### Scénarios de test

1. **Chargement groupe** :
   - Ouvrir une proposition groupée (ex: `group-13446-2026`)
   - Vérifier que `workingGroup.consolidatedChanges` contient les options multi-agents
   - Vérifier que l'affichage est correct

2. **Modification de champ** :
   - Modifier un champ (ex: `startDate`)
   - Vérifier que `workingGroup.userModifiedChanges` est mis à jour
   - Vérifier que `workingGroup.isDirty = true`

3. **Sélection d'option** :
   - Cliquer sur une option proposée par un agent
   - Vérifier que `workingGroup.consolidatedChanges[i].selectedValue` est mis à jour
   - Vérifier que la valeur affichée change

4. **Modification de course** :
   - Modifier une course (ex: distance)
   - Vérifier que `workingGroup.userModifiedRaceChanges` est mis à jour

5. **Validation de bloc** :
   - Valider un bloc (ex: "event")
   - Vérifier que toutes les propositions du groupe reçoivent la validation
   - Vérifier que `workingGroup.approvedBlocks.event = true`

6. **Sauvegarde** :
   - Faire des modifications
   - Valider un bloc (déclenche automatiquement `save()`)
   - Vérifier que les modifications sont persistées pour toutes les propositions

## 🚨 Points d'attention

### 1. Structure des IDs de courses

**Problème** : L'ancien code utilise des indices numériques (`raceIndex`), le nouveau hook utilise des IDs de type string (`raceId`).

**Solution** : Adapter le mapping dans `handleRaceFieldModify()` :

```typescript
// Option A : Utiliser les IDs existants si disponibles
const raceId = workingGroup.consolidatedRaces[raceIndex]?.raceId || `new-${raceIndex}`

// Option B : Créer un mapping stable
const raceIdMap = useMemo(() => {
  return workingGroup.consolidatedRaces.reduce((acc, race, index) => {
    acc[index] = race.raceId
    return acc
  }, {} as Record<number, string>)
}, [workingGroup.consolidatedRaces])

const raceId = raceIdMap[raceIndex]
```

### 2. Propagation des dates Edition → Races

**Fichier** : `GroupedProposalDetailBase.tsx` ligne 172-199

La logique de propagation des dates doit être adaptée pour utiliser `workingGroup` :

```typescript
// Compter les courses depuis workingGroup.consolidatedRaces
const racesCount = workingGroup?.consolidatedRaces.length || 0

if (racesCount > 0) {
  // Ouvrir modale confirmation
} else {
  // Appliquer directement
  updateField('startDate', newValue)
}
```

### 3. Validation par blocs avec proposalIds

**Important** : La signature de `validateBlock()` a changé en mode groupé.

**Ancien code** :
```typescript
await validateBlock(blockKey) // Tous les propositions
```

**Nouveau code** :
```typescript
await validateBlock(blockKey, workingGroup.ids) // Explicite
```

### 4. Consolidation des changes depuis useProposalLogic

**Actuellement** : `useProposalLogic` a sa propre fonction `consolidateChanges()`.

**Après migration** : Le hook `useProposalEditor` fait la consolidation nativement.

**Action** : Supprimer les appels à `consolidateChanges()` / `consolidateRaceChanges()` et utiliser directement `workingGroup.consolidatedChanges` / `workingGroup.consolidatedRaces`.

## 📊 Critères de succès

- ✅ Aucune erreur TypeScript
- ✅ Aucune erreur runtime lors du chargement d'une proposition groupée
- ✅ Les modifications utilisateur sont sauvegardées correctement
- ✅ La validation par blocs fonctionne pour toutes les propositions du groupe
- ✅ L'interface reste cohérente (pas de régression visuelle)
- ✅ Les tests manuels passent (voir section "Tests manuels")

## 🔄 Rollback si nécessaire

En cas de problème majeur, le code ancien est conservé en commentaires. Il suffit de :

1. Retirer les appels au hook `useProposalEditor`
2. Décommenter les anciens états `userModifiedChanges`, `selectedChanges`
3. Restaurer les anciens handlers

**Condition de rollback** : Si plus de 2 heures de debugging sans progrès.

## 📚 Ressources

- **Hook** : `apps/dashboard/src/hooks/useProposalEditor.ts`
- **Composant** : `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`
- **Documentation Phase 1.5** : `docs/PHASE1.5-GROUP-SUPPORT-COMPLETE.md`
- **Plan global** : `docs/PLAN-PROPOSAL-STATE-REFACTOR.md`
- **Tests** : `docs/PHASE2-TEST-SCENARIOS.md` (à créer)

## 💬 Notes pour la prochaine session

- Le hook est **prêt à l'emploi**
- La migration sera **progressive** (code ancien conservé en parallèle)
- Focus sur **les handlers** d'abord, puis les composants enfants
- Tester **à chaque étape** pour éviter les régressions

**Estimation totale** : 2-3 heures de travail concentré.

---

**Commencer par** : Étape 1 - Initialiser le hook avec `proposalIds` stable.
