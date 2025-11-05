# Implémentation de la Validation par Blocs

## 🎯 Objectif

Permettre la validation granulaire des blocs de changements (Organisateur, Courses, Édition, Événement) dans les propositions groupées, avec :
- ✅ Validation/Annulation par bloc
- 🔒 Verrouillage des blocs validés (grisés, non-éditables)
- 📋 Création/Suppression automatique de ProposalApplication
- 🎛️ Bouton "Tout valider" global

## 📐 Architecture

### Backend (Déjà en place ✅)

Le backend supporte déjà tout ce qu'il faut :

1. **`PUT /api/proposals/:id`** avec `{status: 'APPROVED'}` 
   → Crée automatiquement une `ProposalApplication` avec status `PENDING`

2. **`POST /api/proposals/:id/unapprove`**
   → Supprime les `ProposalApplication` PENDING et remet la proposition en `PENDING`

3. **`POST /api/proposals/bulk-approve`** 
   → Approuve plusieurs propositions et crée leurs applications

### Frontend (À implémenter)

## 📁 Fichiers à créer/modifier

### 1. Composant `BlockValidationButton` ✅ CRÉÉ

**Fichier**: `apps/dashboard/src/components/proposals/BlockValidationButton.tsx`

Bouton qui bascule entre "Valider" et "Annuler".

### 2. Hook `useBlockValidation`

**Fichier**: `apps/dashboard/src/hooks/useBlockValidation.ts`

```typescript
import { useState, useCallback } from 'react'
import { useUpdateProposal, useUnapproveProposal } from './useApi'

export interface BlockStatus {
  [blockKey: string]: {
    isValidated: boolean
    proposalIds: string[]
  }
}

export const useBlockValidation = () => {
  const [blockStatus, setBlockStatus] = useState<BlockStatus>({})
  const updateProposalMutation = useUpdateProposal()
  const unapproveProposalMutation = useUnapproveProposal()

  // Valider un bloc (approuver toutes ses propositions)
  const validateBlock = useCallback(async (blockKey: string, proposalIds: string[]) => {
    try {
      // Approuver toutes les propositions du bloc
      await Promise.all(
        proposalIds.map(id => 
          updateProposalMutation.mutateAsync({
            id,
            status: 'APPROVED',
            reviewedBy: 'Utilisateur'
          })
        )
      )

      // Marquer le bloc comme validé
      setBlockStatus(prev => ({
        ...prev,
        [blockKey]: {
          isValidated: true,
          proposalIds
        }
      }))
    } catch (error) {
      console.error(`Error validating block ${blockKey}:`, error)
      throw error
    }
  }, [updateProposalMutation])

  // Annuler la validation d'un bloc
  const unvalidateBlock = useCallback(async (blockKey: string) => {
    const block = blockStatus[blockKey]
    if (!block) return

    try {
      // Annuler l'approbation de toutes les propositions
      await Promise.all(
        block.proposalIds.map(id => unapproveProposalMutation.mutateAsync(id))
      )

      // Retirer le bloc du statut validé
      setBlockStatus(prev => {
        const { [blockKey]: _, ...rest } = prev
        return rest
      })
    } catch (error) {
      console.error(`Error unvalidating block ${blockKey}:`, error)
      throw error
    }
  }, [blockStatus, unapproveProposalMutation])

  // Valider tous les blocs
  const validateAllBlocks = useCallback(async (blocks: Record<string, string[]>) => {
    for (const [blockKey, proposalIds] of Object.entries(blocks)) {
      await validateBlock(blockKey, proposalIds)
    }
  }, [validateBlock])

  // Vérifier si un bloc est validé
  const isBlockValidated = useCallback((blockKey: string) => {
    return blockStatus[blockKey]?.isValidated || false
  }, [blockStatus])

  return {
    blockStatus,
    validateBlock,
    unvalidateBlock,
    validateAllBlocks,
    isBlockValidated,
    isPending: updateProposalMutation.isPending || unapproveProposalMutation.isPending
  }
}
```

### 3. Modifier `GroupedProposalDetailBase`

**Fichier**: `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`

**Modifications à apporter**:

1. Importer et utiliser le hook `useBlockValidation` :

```typescript
import { useBlockValidation } from '@/hooks/useBlockValidation'

// Dans le composant
const {
  blockStatus,
  validateBlock,
  unvalidateBlock,
  validateAllBlocks,
  isBlockValidated,
  isPending: isBlockPending
} = useBlockValidation()
```

2. Préparer la map des blocs → proposalIds :

```typescript
// Identifier les propositions par bloc
const blockProposals = useMemo(() => {
  const blocks: Record<string, string[]> = {}
  
  // Bloc Edition
  const editionProposalIds = groupProposals
    .filter(p => consolidatedChanges.some(c => 
      !['organizer', 'racesToAdd'].includes(c.field) &&
      c.options.some(o => o.proposalId === p.id)
    ))
    .map(p => p.id)
  if (editionProposalIds.length > 0) {
    blocks['edition'] = editionProposalIds
  }

  // Bloc Organisateur
  const organizerProposalIds = groupProposals
    .filter(p => consolidatedChanges.some(c => 
      c.field === 'organizer' &&
      c.options.some(o => o.proposalId === p.id)
    ))
    .map(p => p.id)
  if (organizerProposalIds.length > 0) {
    blocks['organizer'] = organizerProposalIds
  }

  // Bloc Courses
  const raceProposalIds = groupProposals
    .filter(p => consolidatedRaceChanges.some(rc =>
      rc.proposalIds.includes(p.id)
    ))
    .map(p => p.id)
  if (raceProposalIds.length > 0) {
    blocks['races'] = raceProposalIds
  }

  // Bloc Événement (si NEW_EVENT ou EVENT_UPDATE)
  if (isNewEvent || groupProposals[0]?.type === 'EVENT_UPDATE') {
    blocks['event'] = groupProposals
      .filter(p => ['NEW_EVENT', 'EVENT_UPDATE'].includes(p.type))
      .map(p => p.id)
  }

  return blocks
}, [groupProposals, consolidatedChanges, consolidatedRaceChanges, isNewEvent])
```

3. Ajouter au context :

```typescript
const context: GroupedProposalContext = {
  // ... existant
  
  // Ajouter validation de blocs
  validateBlock,
  unvalidateBlock,
  validateAllBlocks: () => validateAllBlocks(blockProposals),
  isBlockValidated,
  isBlockPending,
  blockProposals
}
```

### 4. Modifier les tables de changements

#### `CategorizedEditionChangesTable`

**Fichier**: `apps/dashboard/src/components/proposals/CategorizedEditionChangesTable.tsx`

**Modifications**:

1. Ajouter les props :

```typescript
interface Props {
  // ... existant
  isBlockValidated?: boolean
  onValidateBlock?: () => Promise<void>
  onUnvalidateBlock?: () => Promise<void>
  isBlockPending?: boolean
}
```

2. Désactiver l'édition si validé :

```typescript
const effectiveDisabled = disabled || isBlockValidated
```

3. Griser les lignes si validé :

```typescript
<TableRow 
  sx={{ 
    bgcolor: isBlockValidated ? 'action.disabledBackground' : 'transparent',
    opacity: isBlockValidated ? 0.6 : 1
  }}
>
```

4. Ajouter le bouton Valider dans les actions :

```typescript
{onValidateBlock && onUnvalidateBlock && (
  <BlockValidationButton
    blockKey="edition"
    isValidated={isBlockValidated || false}
    onValidate={onValidateBlock}
    onUnvalidate={onUnvalidateBlock}
    disabled={effectiveDisabled}
    isPending={isBlockPending}
  />
)}
```

**Faire la même chose pour** :
- `CategorizedEventChangesTable`
- `OrganizerSection`  
- `RaceChangesSection`

### 5. Modifier `ProposalNavigation`

**Fichier**: `apps/dashboard/src/components/proposals/ProposalNavigation.tsx`

Ajouter un bouton "Tout valider" :

```typescript
interface Props {
  // ... existant
  onValidateAll?: () => Promise<void>
  showValidateAllButton?: boolean
  isValidateAllPending?: boolean
}

// Dans le render
{showValidateAllButton && onValidateAll && (
  <Button
    variant="contained"
    color="success"
    onClick={onValidateAll}
    disabled={isValidateAllPending}
    startIcon={<CheckCircleIcon />}
  >
    Tout valider
  </Button>
)}
```

### 6. Intégrer dans les vues groupées

#### Exemple pour `EditionUpdateGroupedDetail`

**Fichier**: `apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateGroupedDetail.tsx`

```typescript
<GroupedProposalDetailBase
  groupKey={groupKey}
  renderMainContent={(context) => {
    const {
      // ... existant
      validateBlock,
      unvalidateBlock,
      isBlockValidated,
      isBlockPending,
      blockProposals
    } = context

    return (
      <>
        {hasRealEditionChanges && (
          <CategorizedEditionChangesTable
            // ... props existantes
            isBlockValidated={isBlockValidated('edition')}
            onValidateBlock={() => validateBlock('edition', blockProposals['edition'])}
            onUnvalidateBlock={() => unvalidateBlock('edition')}
            isBlockPending={isBlockPending}
          />
        )}

        {organizerChange && (
          <OrganizerSection
            // ... props existantes
            isBlockValidated={isBlockValidated('organizer')}
            onValidateBlock={() => validateBlock('organizer', blockProposals['organizer'])}
            onUnvalidateBlock={() => unvalidateBlock('organizer')}
            isBlockPending={isBlockPending}
          />
        )}

        {hasRaceChanges && (
          <RaceChangesSection
            // ... props existantes
            isBlockValidated={isBlockValidated('races')}
            onValidateBlock={() => validateBlock('races', blockProposals['races'])}
            onUnvalidateBlock={() => unvalidateBlock('races')}
            isBlockPending={isBlockPending}
          />
        )}
      </>
    )
  }}
  customHeaderProps={{
    actions: (
      <Button
        variant="contained"
        color="success"
        onClick={() => context.validateAllBlocks()}
        disabled={context.isBlockPending}
        startIcon={<CheckCircleIcon />}
      >
        Tout valider
      </Button>
    )
  }}
/>
```

## 🎨 Comportement visuel

### État Non-Validé

```
┌────────────────────────────────────────────┐
│ Édition                      [Valider]     │
├────────────────────────────────────────────┤
│ startDate    [Modifier] [✓]               │
│ endDate      [Modifier] [✓]               │
└────────────────────────────────────────────┘
```

### État Validé (grisé, non-éditable)

```
┌────────────────────────────────────────────┐
│ Édition                      [Annuler]     │
├────────────────────────────────────────────┤
│ startDate    2025-04-06 ✓ (non-éditable)  │
│ endDate      2025-04-06 ✓ (gris)          │
└────────────────────────────────────────────┘
```

## 🔄 Flux de validation

1. **Utilisateur clique "Valider" sur un bloc**
   → `validateBlock('edition', [proposalId1, proposalId2])`

2. **Hook appelle l'API pour chaque proposition**
   → `PUT /api/proposals/:id` avec `{status: 'APPROVED'}`

3. **Backend crée automatiquement ProposalApplication**
   → Une par proposition approuvée

4. **State local mis à jour**
   → `blockStatus['edition'] = { isValidated: true, proposalIds: [...] }`

5. **UI réagit**
   → Bouton devient "Annuler"
   → Lignes grisées
   → Champs désactivés

### Annulation

1. **Utilisateur clique "Annuler"**
   → `unvalidateBlock('edition')`

2. **Hook appelle l'API pour chaque proposition**
   → `POST /api/proposals/:id/unapprove`

3. **Backend supprime les ProposalApplication PENDING**
   → Remet propositions en status `PENDING`

4. **State local mis à jour**
   → Retire `blockStatus['edition']`

5. **UI réagit**
   → Bouton redevient "Valider"
   → Lignes normales
   → Champs éditables

## ✅ Checklist d'implémentation

- [x] Créer `BlockValidationButton.tsx`
- [ ] Créer `useBlockValidation.ts`
- [ ] Modifier `GroupedProposalDetailBase.tsx`
- [ ] Modifier `CategorizedEditionChangesTable.tsx`
- [ ] Modifier `CategorizedEventChangesTable.tsx`
- [ ] Modifier `OrganizerSection.tsx`
- [ ] Modifier `RaceChangesSection.tsx`
- [ ] Modifier `ProposalNavigation.tsx`
- [ ] Intégrer dans `EditionUpdateGroupedDetail.tsx`
- [ ] Intégrer dans `EventUpdateGroupedDetail.tsx`
- [ ] Intégrer dans `NewEventGroupedDetail.tsx`
- [ ] Intégrer dans `RaceUpdateGroupedDetail.tsx`
- [ ] Tester validation individuelle
- [ ] Tester annulation individuelle
- [ ] Tester "Tout valider"
- [ ] Tester verrouillage des champs
- [ ] Tester création/suppression ProposalApplications

## 🧪 Tests recommandés

1. **Valider un seul bloc** → Vérifier que seul ce bloc est verrouillé
2. **Annuler un bloc validé** → Vérifier que le bloc redevient éditable
3. **Tout valider** → Vérifier que tous les blocs sont verrouillés
4. **Modifier puis valider** → Les modifications doivent être prises en compte
5. **Valider puis annuler** → La ProposalApplication doit être supprimée
6. **Rafraîchir la page** → L'état des validations doit être restauré

## 📝 Notes importantes

- Les ProposalApplications ne sont créées qu'avec status `PENDING`
- Elles ne sont appliquées (Miles Republic) que manuellement plus tard
- Un bloc peut contenir plusieurs propositions (1 par agent)
- Toutes les propositions d'un bloc sont validées ensemble
- L'état de validation est local (pas persisté en DB)
- Au refresh, il faut le recalculer depuis les statuts des propositions

## 🚀 Pour aller plus loin

- Persister l'état de validation en DB (nouveau champ?)
- Ajouter des animations de transition validé/non-validé
- Afficher le nombre de blocs validés / total
- Permettre la validation partielle d'un bloc
- Ajouter un mode "auto-validation" (valider dès qu'on modifie)
