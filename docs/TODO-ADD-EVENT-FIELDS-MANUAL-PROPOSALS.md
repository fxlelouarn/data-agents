# TODO: Ajouter les champs de l'événement dans les propositions manuelles

**Date** : 2025-11-17  
**Objectif** : Permettre l'édition des informations de l'événement (ville, adresse, etc.) lors de la création manuelle de propositions EDITION_UPDATE.

## État actuel

✅ **Redirection vers vue groupée** : Modifié dans `CreateProposalForEdition.tsx` (ligne 108)  
✅ **Courses affichées** : Ajoutées dans `changes.races` (backend ligne 1675-1682)  
❌ **Champs événement** : Pas encore ajoutés

## Modifications à faire

### 1. Backend : Ajouter les champs événement dans `changes`

**Fichier** : `apps/api/src/routes/proposals.ts` (endpoint `/edition-update-complete`)

**Ligne ~1640** : Après avoir ajouté les champs d'édition, ajouter aussi les champs d'événement :

```typescript
// Ajouter toutes les valeurs actuelles de l'édition
const editionFields = [
  'year', 'startDate', 'endDate', 'timeZone', 'calendarStatus',
  'registrationOpeningDate', 'registrationClosingDate', 'registrantsNumber', 'currency'
]

editionFields.forEach(field => {
  // ... code existant
})

// ✅ AJOUTER : Champs de l'événement
const eventFields = [
  'name', 'city', 'country', 'countrySubdivisionNameLevel1', 'countrySubdivisionNameLevel2',
  'fullAddress', 'latitude', 'longitude',
  'websiteUrl', 'facebookUrl', 'instagramUrl', 'twitterUrl'
]

eventFields.forEach(field => {
  const currentValue = (event as any)[field]
  const proposedValue = userModifiedChanges[field] !== undefined 
    ? userModifiedChanges[field] 
    : currentValue

  if (currentValue !== null || proposedValue !== null) {
    changes[field] = {
      old: currentValue,
      new: proposedValue,
      confidence: 1.0
    }
  }
})
```

### 2. Frontend : Afficher le bloc événement dans `EditionUpdateGroupedDetail.tsx`

**Fichier** : `apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateGroupedDetail.tsx`

**Ligne ~83** : Avant le bloc "Édition", ajouter un bloc "Événement" :

```typescript
import CategorizedEventChangesTable from '@/components/proposals/CategorizedEventChangesTable'

// ... dans renderMainContent

// Séparer les champs événement des champs édition
const eventFields = ['name', 'city', 'country', 'countrySubdivisionNameLevel1', 
  'countrySubdivisionNameLevel2', 'fullAddress', 'latitude', 'longitude',
  'websiteUrl', 'facebookUrl', 'instagramUrl', 'twitterUrl']

const eventChanges = consolidatedChanges.filter(c => eventFields.includes(c.field))
const editionChanges = consolidatedChanges.filter(c => 
  !eventFields.includes(c.field) && 
  !['organizer', 'racesToAdd', 'races'].includes(c.field)
)

// Afficher le bloc événement
const hasEventChanges = eventChanges.length > 0
const shouldShowEventBlock = hasEventChanges || isBlockValidated('event')

return (
  <>
    {/* Bloc Événement */}
    {shouldShowEventBlock && (
      <CategorizedEventChangesTable
        title="Événement"
        changes={eventChanges}
        isNewEvent={false}
        selectedChanges={selectedChanges}
        onFieldSelect={handleFieldSelect}
        onFieldApprove={handleApproveField}
        onFieldModify={handleFieldModify}
        userModifiedChanges={userModifiedChanges}
        formatValue={formatValue}
        formatAgentsList={formatAgentsList}
        disabled={isBlockValidated('event') || isEventDead || isAllApproved}
        isBlockValidated={isBlockValidated('event')}
        onValidateBlock={() => validateBlock('event', blockProposals['event'] || [])}
        onUnvalidateBlock={() => unvalidateBlock('event')}
        isBlockPending={isBlockPending}
        validationDisabled={isEventDead || isAllApproved}
      />
    )}
    
    {/* Bloc Édition (code existant) */}
    {shouldShowEditionBlock && (
      <CategorizedEditionChangesTable ... />
    )}
  </>
)
```

### 3. Validation par blocs

Le bloc "event" sera automatiquement géré par le système de validation existant car :
- `validateBlock('event', ...)` appelle `/api/proposals/validate-block-group`
- Le backend stocke `approvedBlocks.event = true`
- `isBlockValidated('event')` vérifie si le bloc est approuvé

### 4. Tests à effectuer

1. ✅ Créer une proposition pour une édition existante
2. ✅ Vérifier la redirection vers la vue groupée
3. ✅ Vérifier que le bloc "Événement" apparaît
4. ✅ Modifier un champ événement (ex: ville)
5. ✅ Valider le bloc "Événement"
6. ✅ Valider les autres blocs (Édition, Courses)
7. ✅ Appliquer la proposition
8. ✅ Vérifier dans Miles Republic que la ville a été modifiée

## Fichiers à modifier

### Backend
- `apps/api/src/routes/proposals.ts` : Ajouter champs événement dans `changes` (~ligne 1661)

### Frontend
- `apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateGroupedDetail.tsx` : Ajouter bloc événement (~ligne 83)
- ✅ `apps/dashboard/src/pages/CreateProposalForEdition.tsx` : Redirection modifiée (ligne 108)

## Notes

- Le composant `CategorizedEventChangesTable` existe déjà et est utilisé dans `NewEventGroupedDetail.tsx`
- Le système de validation par blocs gère automatiquement le nouveau bloc "event"
- Les champs événement seront éditables comme les champs édition

## Priorité

🔴 **Haute** : Fonctionnalité demandée explicitement par l'utilisateur

## Implémentation

Je vais implémenter ces changements maintenant.
