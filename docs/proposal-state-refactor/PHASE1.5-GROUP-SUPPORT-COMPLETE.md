# Phase 1.5 : Support des propositions groupées dans useProposalEditor

**Date** : 2025-11-11  
**Statut** : ✅ Terminé

## Objectif

Étendre le hook `useProposalEditor` pour supporter les propositions groupées (`GroupedProposalDetailBase`) tout en conservant la rétrocompatibilité avec le mode simple.

## Architecture

### Détection automatique du mode

```typescript
const isGroupMode = Array.isArray(proposalId)

// Mode simple
useProposalEditor('cm123')

// Mode groupé
useProposalEditor(['cm123', 'cm456', 'cm789'])
```

### Interfaces de types

#### WorkingProposalGroup

État consolidé représentant plusieurs propositions :

```typescript
interface WorkingProposalGroup {
  ids: string[]
  originalProposals: Proposal[]
  
  // Consolidation des changements de tous les agents
  consolidatedChanges: ConsolidatedChange[]
  consolidatedRaces: ConsolidatedRaceChange[]
  
  // Modifications utilisateur (s'appliquent à TOUTES les propositions)
  userModifiedChanges: Record<string, any>
  userModifiedRaceChanges: Record<string, any>
  
  // Blocs validés (true si validé dans TOUTES les propositions)
  approvedBlocks: Record<string, boolean>
  
  isDirty: boolean
  lastSaved: Date | null
}
```

#### ConsolidatedChange

Représente un champ proposé par plusieurs agents :

```typescript
interface ConsolidatedChange {
  field: string
  options: Array<{
    proposalId: string
    agentName: string
    proposedValue: any
    confidence: number
    createdAt: string
  }>
  currentValue: any
  selectedValue?: any // Valeur sélectionnée par l'utilisateur
}
```

**Exemple concret** :

```typescript
{
  field: 'startDate',
  options: [
    {
      proposalId: 'cm123',
      agentName: 'FFA Scraper',
      proposedValue: '2025-11-24T09:00:00Z',
      confidence: 0.95,
      createdAt: '2025-11-10T14:30:00Z'
    },
    {
      proposalId: 'cm456',
      agentName: 'Google Search Date Agent',
      proposedValue: '2025-11-24T10:00:00Z',
      confidence: 0.82,
      createdAt: '2025-11-10T15:00:00Z'
    }
  ],
  currentValue: '2025-11-10T09:00:00Z',
  selectedValue: '2025-11-24T09:00:00Z' // Option FFA sélectionnée
}
```

#### ConsolidatedRaceChange

Représente une course modifiée par plusieurs agents :

```typescript
interface ConsolidatedRaceChange {
  raceId: string
  raceName: string
  proposalIds: string[] // Agents qui ont proposé des modifications
  fields: Record<string, any> // Champs proposés fusionnés
  userModifications?: Record<string, any>
}
```

### Valeur de retour

Le hook retourne une interface différente selon le mode :

#### Mode simple (UseProposalEditorReturn)

```typescript
{
  workingProposal: WorkingProposal | null
  updateField: (field: string, value: any) => void
  updateRace: (raceId: string, field: string, value: any) => void
  validateBlock: (blockKey: string) => Promise<void>
  // ... autres méthodes
}
```

#### Mode groupé (UseProposalEditorGroupReturn)

```typescript
{
  workingGroup: WorkingProposalGroup | null
  updateField: (field: string, value: any) => void
  selectOption: (field: string, proposalId: string) => void // ✨ Nouveau
  updateRace: (raceId: string, field: string, value: any) => void
  validateBlock: (blockKey: string, proposalIds: string[]) => Promise<void>
  validateAllBlocks: () => Promise<void> // ✨ Nouveau
  isBlockValidated: (blockKey: string) => boolean // ✨ Nouveau
  // ... autres méthodes
}
```

## Fonctions clés

### 1. Consolidation des changements

#### `consolidateChangesFromProposals(proposals)`

Agrège les changements de plusieurs propositions par champ :

```typescript
const consolidatedChanges = consolidateChangesFromProposals([
  { id: 'cm123', changes: { startDate: { new: '2025-11-24' } } },
  { id: 'cm456', changes: { startDate: { new: '2025-11-25' } } }
])

// Résultat :
[{
  field: 'startDate',
  options: [
    { proposalId: 'cm123', proposedValue: '2025-11-24', ... },
    { proposalId: 'cm456', proposedValue: '2025-11-25', ... }
  ],
  currentValue: undefined
}]
```

#### `consolidateRacesFromProposals(proposals)`

Agrège les courses proposées par plusieurs agents :

```typescript
const consolidatedRaces = consolidateRacesFromProposals([
  { id: 'cm123', changes: { races: [{ name: '10km', distance: 10 }] } },
  { id: 'cm456', changes: { races: [{ name: '10km', price: 15 }] } }
])

// Résultat : fusion par raceId
[{
  raceId: 'new-0',
  raceName: '10km',
  proposalIds: ['cm123', 'cm456'],
  fields: { name: '10km', distance: 10, price: 15 }
}]
```

### 2. Modifications utilisateur

#### `updateField(field, value)`

**Mode simple** : Met à jour le champ dans `workingProposal.changes`

**Mode groupé** : 
1. Ajoute la modification dans `workingGroup.userModifiedChanges`
2. Si le champ est consolidé, met à jour `selectedValue`
3. **Pas d'autosave** (sauvegarde à la validation du bloc)

```typescript
// Mode groupé
updateField('startDate', '2025-11-26T10:00:00Z')

// État après :
workingGroup.userModifiedChanges = { startDate: '2025-11-26T10:00:00Z' }
workingGroup.consolidatedChanges[0].selectedValue = '2025-11-26T10:00:00Z'
```

#### `selectOption(field, proposalId)`

**Exclusif au mode groupé** : Sélectionne une des options proposées par les agents.

```typescript
// Choisir la valeur proposée par FFA Scraper (cm123)
selectOption('startDate', 'cm123')

// Équivalent à :
updateField('startDate', consolidatedChanges.find(c => c.field === 'startDate')
  .options.find(o => o.proposalId === 'cm123').proposedValue)
```

### 3. Sauvegarde

#### `save()`

**Mode simple** : 
- Calcule le diff entre `workingProposal` et `originalProposal`
- Envoie le diff au backend via `updateUserModifications(id, diff)`

**Mode groupé** :
- Construit un diff unique via `buildGroupDiff(workingGroup)`
- Envoie le **même diff** à toutes les propositions du groupe
- Garantit la cohérence entre les propositions

```typescript
// buildGroupDiff()
const diff = {
  // Valeurs sélectionnées dans consolidatedChanges
  startDate: '2025-11-26T10:00:00Z',
  
  // Modifications utilisateur directes
  description: 'Nouvelle description',
  
  // Modifications de courses
  raceEdits: {
    'new-0': { distance: 10.5 }
  }
}

// Appliqué à toutes les propositions du groupe
await Promise.all(
  workingGroup.ids.map(id => proposalsApi.updateUserModifications(id, diff))
)
```

### 4. Validation par blocs

#### `validateBlock(blockKey, proposalIds)`

**Mode simple** : Valide un bloc pour la proposition unique

**Mode groupé** : 
- Accepte une liste optionnelle de `proposalIds` (par défaut : toutes)
- Construit le payload via `getPayloadForBlock()` en mode groupé
- Valide le bloc pour toutes les propositions spécifiées

```typescript
// Valider le bloc "event" pour 2 propositions sur 3
validateBlock('event', ['cm123', 'cm456'])

// getPayloadForBlock('event') en mode groupé :
{
  name: 'Nouveau nom événement', // userModifiedChanges.name
  city: 'Dijon', // selectedValue depuis consolidatedChanges
  description: '...' // userModifiedChanges.description
}
```

#### `validateAllBlocks()`

**Exclusif au mode groupé** : Valide tous les blocs détectés dans `consolidatedChanges`.

```typescript
// Auto-détection des blocs
const blocks = new Set<string>()
workingGroup.consolidatedChanges.forEach(c => 
  blocks.add(getBlockForField(c.field))
)

// Validation séquentielle
await Promise.all(Array.from(blocks).map(b => validateBlock(b)))
```

## Workflow d'utilisation

### Cas d'usage : GroupedProposalDetailBase

```typescript
const GroupedProposalDetailBase = ({ groupKey }) => {
  // 1. Charger les propositions du groupe
  const { data: groupProposalsData } = useProposalGroup(groupKey)
  const proposalIds = groupProposalsData?.proposals.map(p => p.id) || []
  
  // 2. Initialiser le hook en mode groupé
  const {
    workingGroup,
    isLoading,
    updateField,
    selectOption,
    validateBlock,
    validateAllBlocks,
    isBlockValidated
  } = useProposalEditor(proposalIds)
  
  if (isLoading) return <Loading />
  if (!workingGroup) return null
  
  // 3. Afficher les changements consolidés
  return (
    <>
      {workingGroup.consolidatedChanges.map(change => (
        <ConsolidatedField
          key={change.field}
          field={change.field}
          options={change.options}
          selectedValue={change.selectedValue || change.options[0].proposedValue}
          onSelect={(value) => updateField(change.field, value)}
          onSelectOption={(proposalId) => selectOption(change.field, proposalId)}
        />
      ))}
      
      <Button onClick={() => validateBlock('event', workingGroup.ids)}>
        Valider le bloc Event
      </Button>
      
      <Button onClick={validateAllBlocks}>
        Tout valider
      </Button>
    </>
  )
}
```

## Avantages

### 1. Single Source of Truth
✅ État consolidé géré par le hook  
✅ Plus de duplications `userModifiedChanges` / `selectedChanges`  
✅ Moins de bugs de synchronisation

### 2. Scalabilité
✅ Supporte 1, 3 ou 100 propositions groupées  
✅ Consolidation automatique des changements  
✅ Sauvegarde et validation massives

### 3. Rétrocompatibilité
✅ Mode simple inchangé  
✅ Migration progressive possible  
✅ Pas de breaking changes

### 4. Maintenance
✅ Logique centralisée dans le hook  
✅ Tests unitaires simplifiés  
✅ Moins de code dupliqué dans les composants

## Tests recommandés

### Consolidation

```typescript
test('consolidateChangesFromProposals - 2 agents proposent le même champ', () => {
  const proposals = [
    { id: 'cm1', changes: { startDate: { new: '2025-11-24' } } },
    { id: 'cm2', changes: { startDate: { new: '2025-11-25' } } }
  ]
  const result = consolidateChangesFromProposals(proposals)
  
  expect(result).toHaveLength(1)
  expect(result[0].field).toBe('startDate')
  expect(result[0].options).toHaveLength(2)
})
```

### Sélection d'option

```typescript
test('selectOption - met à jour selectedValue et userModifiedChanges', () => {
  const { result } = renderHook(() => useProposalEditor(['cm1', 'cm2']))
  
  act(() => {
    result.current.selectOption('startDate', 'cm1')
  })
  
  expect(result.current.workingGroup?.userModifiedChanges.startDate).toBe('2025-11-24')
  expect(result.current.workingGroup?.consolidatedChanges[0].selectedValue).toBe('2025-11-24')
})
```

### Validation groupée

```typescript
test('validateBlock - valide pour toutes les propositions', async () => {
  const { result } = renderHook(() => useProposalEditor(['cm1', 'cm2']))
  
  await act(async () => {
    await result.current.validateBlock('event', ['cm1', 'cm2'])
  })
  
  expect(proposalsApi.validateBlock).toHaveBeenCalledTimes(2)
  expect(result.current.workingGroup?.approvedBlocks.event).toBe(true)
})
```

## Prochaines étapes : Phase 2

Maintenant que le hook supporte les groupes, la Phase 2 consiste à **intégrer** ce hook dans `GroupedProposalDetailBase` :

1. ✅ Remplacer les états locaux (`userModifiedChanges`, `selectedChanges`)
2. ✅ Utiliser les handlers du hook (`updateField`, `selectOption`, etc.)
3. ✅ Adapter les composants enfants pour consommer `workingGroup`
4. ✅ Tester la migration
5. ✅ Supprimer l'ancien code

📄 **Documentation de migration** : `docs/PHASE2-MIGRATION-PROGRESS.md`

## Ressources

- **Code source** : `apps/dashboard/src/hooks/useProposalEditor.ts`
- **Plan global** : `docs/PLAN-PROPOSAL-STATE-REFACTOR.md`
- **Tests** : À créer dans `apps/dashboard/src/hooks/__tests__/useProposalEditor.test.ts`
