# Hook useProposalEditor

**Date** : 2025-11-11  
**Statut** : ✅ IMPLÉMENTÉ (Phase 1)

## Vue d'ensemble

`useProposalEditor` est un hook React custom qui gère l'**état consolidé** d'une proposition avec ses modifications utilisateur. Il remplace la gestion dispersée de l'état dans `GroupedProposalDetailBase` et `ProposalDetailBase`.

## Principe : Single Source of Truth

```
Backend Proposal + User Edits = Working Proposal (Single Source of Truth)
```

Au lieu de jongler entre 4 états différents (`proposal.changes`, `proposal.userModifiedChanges`, `selectedChanges`, `userModifiedRaceChanges`), le hook maintient **un seul état consolidé** : `workingProposal`.

## Interface

```typescript
interface WorkingProposal {
  id: string
  originalProposal: Proposal // Backend (immuable)
  
  // État consolidé (merged)
  changes: Record<string, any> // Champs édition/événement
  races: Record<string, RaceData> // Courses (clé = raceId)
  approvedBlocks: Record<string, boolean>
  
  // Métadonnées
  isDirty: boolean // Modifications non sauvegardées ?
  lastSaved: Date | null
}

function useProposalEditor(
  proposalId: string | string[],
  options?: {
    autosave?: boolean // true par défaut
    autosaveDelay?: number // 2000ms par défaut
  }
): {
  // État
  workingProposal: WorkingProposal | null
  isLoading: boolean
  isSaving: boolean
  error: Error | null
  
  // Actions d'édition
  updateField: (field: string, value: any) => void
  updateRace: (raceId: string, field: string, value: any) => void
  deleteRace: (raceId: string) => void
  addRace: (race: RaceData) => void
  
  // Actions de validation
  validateBlock: (blockKey: string) => Promise<void>
  unvalidateBlock: (blockKey: string) => Promise<void>
  
  // Sauvegarde
  save: () => Promise<void>
  
  // Export
  getPayload: () => Record<string, any>
  
  // Utilitaires
  reset: () => void
  hasUnsavedChanges: () => boolean
}
```

## Utilisation

### Exemple de base

```typescript
import { useProposalEditor } from '@/hooks/useProposalEditor'

function ProposalDetail({ proposalId }: { proposalId: string }) {
  const {
    workingProposal,
    isLoading,
    updateField,
    updateRace,
    validateBlock,
    getPayload
  } = useProposalEditor(proposalId)
  
  if (isLoading) return <Loading />
  if (!workingProposal) return <Error />
  
  return (
    <div>
      {/* Afficher les champs */}
      <EditionFields
        changes={workingProposal.changes}
        onEdit={updateField}
      />
      
      {/* Afficher les courses */}
      <RacesTable
        races={workingProposal.races}
        onEdit={updateRace}
      />
      
      {/* Valider un bloc */}
      <Button onClick={() => validateBlock('edition')}>
        Valider l'édition
      </Button>
      
      {/* Approuver la proposition */}
      <Button onClick={() => approveProposal(proposalId, getPayload())}>
        Approuver
      </Button>
    </div>
  )
}
```

### Avec autosave désactivé

```typescript
const { updateField, save } = useProposalEditor(proposalId, {
  autosave: false // Sauvegarde manuelle uniquement
})

// Éditer
updateField('startDate', '2025-12-01')

// Sauvegarder manuellement
await save()
```

### Validation par blocs

```typescript
const { validateBlock, workingProposal } = useProposalEditor(proposalId)

// Valider le bloc "races"
await validateBlock('races')

// Vérifier l'état
console.log(workingProposal.approvedBlocks) // { races: true }
```

## Fonctionnement interne

### 1. Chargement initial

```
Backend Proposal
    ↓
mergeChanges(proposal.changes, proposal.userModifiedChanges)
    ↓
extractRaces(mergedChanges)
    ↓
WorkingProposal { changes, races, approvedBlocks }
```

### 2. Édition

Toute modification met à jour `workingProposal` et déclenche l'autosave (debounced) :

```typescript
updateField('city', 'Paris')
  → workingProposal.changes.city = 'Paris'
  → workingProposal.isDirty = true
  → scheduleAutosave() (2s delay)
  → save() → API backend
```

### 3. Sauvegarde

```
calculateDiff(workingProposal, originalProposal)
    ↓
{ city: 'Paris', raceEdits: { '141829': { distance: 13 } } }
    ↓
PUT /api/proposals/:id { userModifiedChanges: diff }
    ↓
workingProposal.isDirty = false
```

### 4. Validation de bloc

```
validateBlock('races')
    ↓
save() (sauvegarder d'abord)
    ↓
getPayloadForBlock('races') → { races: { ... } }
    ↓
POST /api/proposals/:id/validate-block
    ↓
workingProposal.approvedBlocks.races = true
```

## Normalisation des courses

Le hook normalise automatiquement différentes structures de courses :

**Structure 1 : Imbriquée (FFA Scraper)**
```json
{
  "races": {
    "new": [
      { "name": "10km", "distance": 10 }
    ]
  }
}
```

**Structure 2 : Par ID (EDITION_UPDATE)**
```json
{
  "races": {
    "141829": { "name": "Semi", "distance": 21.1 }
  }
}
```

**Structure 3 : Plate (legacy)**
```json
{
  "race_0": { "name": "Marathon", "distance": 42.2 }
}
```

**Résultat normalisé** :
```typescript
{
  races: {
    "new-0": { id: "new-0", name: "10km", distance: 10 },
    "141829": { id: "141829", name: "Semi", distance: 21.1 },
    "legacy-0": { id: "legacy-0", name: "Marathon", distance: 42.2 }
  }
}
```

## Extraction de valeurs

Le hook gère automatiquement différents formats de valeurs :

```typescript
// Format agent standard
{ old: "Dijon", new: "Paris", confidence: 0.9 }
  → "Paris"

// Format proposé
{ proposed: "Paris" }
  → "Paris"

// Format GoogleSearchDateAgent
{ new: "2025-12-01", confidence: 0.8 }
  → "2025-12-01"

// Valeur directe
"Paris"
  → "Paris"
```

## Diff intelligent

Seules les valeurs **différentes de l'original** sont envoyées au backend :

```typescript
// Backend original
proposal.changes = {
  city: { new: "Dijon" },
  year: { new: 2025 }
}

// Modifications utilisateur
updateField('city', 'Paris') // Différent → envoyé
updateField('year', 2025)    // Identique → ignoré

// Diff envoyé
{
  city: 'Paris'
  // year n'est pas envoyé
}
```

## Autosave avec debounce

L'autosave utilise un **debounce** pour éviter les requêtes excessives :

```
Édition 1 → Timer 2s
Édition 2 (1s après) → Annule timer → Nouveau timer 2s
Édition 3 (1.5s après) → Annule timer → Nouveau timer 2s
(pause de 2s)
→ save() (1 seule requête pour les 3 éditions)
```

## Compatibilité

### Phase 1 (Actuelle) ✅
- Propositions simples uniquement
- `proposalId: string`

### Phase 2 (À venir)
- Propositions groupées
- `proposalId: string[]`
- Gestion de plusieurs propositions simultanément

## APIs backend requises

### GET /api/proposals/:id
Retourne la proposition avec `changes` et `userModifiedChanges`.

### PUT /api/proposals/:id
Sauvegarde les modifications utilisateur.
```json
{
  "userModifiedChanges": {
    "city": "Paris",
    "raceEdits": {
      "141829": { "distance": 13 }
    }
  }
}
```

### POST /api/proposals/:id/validate-block
Valide un bloc spécifique.
```json
{
  "block": "races",
  "payload": {
    "races": { ... }
  }
}
```

### POST /api/proposals/:id/unvalidate-block
Annule la validation d'un bloc.
```json
{
  "block": "races"
}
```

## Bénéfices

### 🎯 Bug résolu
- ✅ Plus de perte de modifications
- ✅ Payload toujours correct
- ✅ Une seule source de vérité

### 🧹 Code simplifié
- ✅ -300 lignes dans GroupedProposalDetailBase
- ✅ Plus de logique de merge dispersée
- ✅ Composants enfants simplifiés

### 🚀 Performance
- ✅ Autosave debounced (pas de spam API)
- ✅ Sauvegarde différentielle (seulement le diff)
- ✅ Moins de re-renders

### 🧪 Testabilité
- ✅ Logique isolée et testable
- ✅ Facile de mocker le hook pour les tests

## Prochaines étapes

1. **Phase 2** : Refactorer `GroupedProposalDetailBase` pour utiliser le hook
2. **Phase 3** : Refactorer `ProposalDetailBase` pour utiliser le hook
3. **Phase 4** : Simplifier `RacesChangesTable` (supprimer l'état local)
4. **Phase 5** : Tests unitaires et d'intégration
5. **Phase 6** : Support des propositions groupées

## Ressources

- `apps/dashboard/src/hooks/useProposalEditor.ts` - Implémentation
- `docs/PLAN-PROPOSAL-STATE-REFACTOR.md` - Plan complet
- `docs/FIX-BLOCK-VALIDATION-PAYLOAD.md` - Historique du bug
