# Fix: Prise en compte des modifications utilisateur lors de l'approbation

**Date**: 2025-11-10  
**Problème**: Les modifications manuelles des courses (startDate, distance, etc.) n'étaient pas appliquées lors de l'approbation des propositions.

## Symptômes

Lorsqu'un utilisateur :
1. Éditait la `startDate` d'une édition
2. Acceptait de propager cette date aux courses
3. Approuvait la proposition

**Résultat attendu** : La nouvelle date devait être appliquée à l'édition ET aux courses  
**Résultat observé** : La date de l'édition était modifiée, mais PAS celle des courses ❌

## Cause racine

### Frontend (ProposalDetailBase.tsx)

Les modifications utilisateur étaient stockées dans **deux états séparés** :
- `userModifiedChanges` : Modifications des champs d'édition/événement
- `userModifiedRaceChanges` : Modifications des courses

**Problème** : Lors de l'approbation (`handleApproveAll`), seul `userModifiedChanges` était envoyé au backend, `userModifiedRaceChanges` était ignoré.

```typescript
// ❌ AVANT (ligne 403)
await updateProposalMutation.mutateAsync({
  id: proposalData!.data!.id,
  status: 'APPROVED',
  userModifiedChanges: Object.keys(userModifiedChanges).length > 0 
    ? userModifiedChanges 
    : undefined,  // ❌ Manque userModifiedRaceChanges !
})
```

### Backend (proposal-domain.service.ts)

Le backend lisait correctement `userModifiedChanges.raceEdits`, mais ne prenait **pas en compte le champ `startDate`** dans les modifications de courses :

```typescript
// ❌ AVANT (ligne 427) - Nouvelles courses
const racePayload: any = {
  startDate: raceData.startDate ? new Date(raceData.startDate) : null
  // ❌ Ignorait editedData.startDate !
}

// ❌ AVANT (lignes 462-465) - Courses existantes
if (edits.name) updateData.name = edits.name
if (edits.distance) updateData.runDistance = parseFloat(edits.distance)
if (edits.elevation) updateData.runPositiveElevation = parseFloat(edits.elevation)
if (edits.type) updateData.type = edits.type
// ❌ Manquait : if (edits.startDate) ...
```

## Solution

### 1. Frontend : Merger les modifications avant envoi

**Fichiers modifiés** :
- `apps/dashboard/src/pages/proposals/detail/base/ProposalDetailBase.tsx`
- `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`

```typescript
// ✅ APRÈS
const handleApproveAll = async () => {
  // Merger les modifications d'édition et de courses
  const allUserModifications = {
    ...userModifiedChanges
  }
  
  // Ajouter les modifications de courses si présentes
  if (Object.keys(userModifiedRaceChanges).length > 0) {
    allUserModifications.raceEdits = userModifiedRaceChanges
  }
  
  await updateProposalMutation.mutateAsync({
    id: proposalData!.data!.id,
    status: 'APPROVED',
    userModifiedChanges: Object.keys(allUserModifications).length > 0 
      ? allUserModifications 
      : undefined,  // ✅ Contient maintenant raceEdits !
  })
}
```

### 2. Backend : Appliquer les modifications de startDate

**Fichier modifié** :
- `packages/database/src/services/proposal-domain.service.ts`

#### Pour les nouvelles courses (ligne 428)

```typescript
// ✅ APRÈS
const racePayload: any = {
  startDate: editedData.startDate 
    ? new Date(editedData.startDate)  // ✅ Priorité à la modification utilisateur
    : (raceData.startDate ? new Date(raceData.startDate) : null)
}
```

#### Pour les courses existantes (ligne 467)

```typescript
// ✅ APRÈS
if (edits.startDate) updateData.startDate = new Date(edits.startDate)
```

## Structure des données

### Frontend → Backend

```json
{
  "status": "APPROVED",
  "userModifiedChanges": {
    "startDate": "2025-03-29T09:00:00.000Z",
    "raceEdits": {
      "new-0": {
        "startDate": "2025-03-29T09:00:00.000Z"
      },
      "new-1": {
        "startDate": "2025-03-29T09:00:00.000Z"
      },
      "existing-0": {
        "startDate": "2025-03-29T09:00:00.000Z"
      }
    }
  }
}
```

### Backend : Application

```typescript
// 1. Merger dans finalChanges (ligne 50-53)
const finalChanges = {
  ...(proposal.changes as Record<string, any>),
  ...(proposal.userModifiedChanges as Record<string, any>)
}

// 2. Extraire raceEdits (ligne 442)
const raceEdits = (proposal?.userModifiedChanges as any)?.raceEdits || {}

// 3. Appliquer aux nouvelles courses (ligne 419)
const editedData = raceEdits[`new-${i}`] || {}

// 4. Appliquer aux courses existantes (ligne 443-445)
const existingRaceEdits = Object.keys(raceEdits)
  .filter(key => key.startsWith('existing-'))
```

## Tests de validation

### Scénario 1 : NEW_EVENT avec propagation de date

1. ✅ Éditer `startDate` de l'édition
2. ✅ Accepter la propagation aux 3 courses
3. ✅ Approuver la proposition
4. ✅ Vérifier en base :
   - `Edition.startDate` = nouvelle date
   - `Race[0].startDate` = nouvelle date
   - `Race[1].startDate` = nouvelle date
   - `Race[2].startDate` = nouvelle date

### Scénario 2 : EDITION_UPDATE avec modification courses existantes

1. ✅ Modifier la distance d'une course (21.1 → 21.097)
2. ✅ Modifier la startDate d'une course
3. ✅ Approuver la proposition
4. ✅ Vérifier en base :
   - `Race.runDistance` = 21.097
   - `Race.startDate` = nouvelle date

## Impact

**Avant** :
- ❌ Propagation de dates non fonctionnelle
- ❌ Modifications de courses ignorées
- ❌ Incohérence entre UI et base de données

**Après** :
- ✅ Propagation de dates complète
- ✅ Toutes les modifications utilisateur appliquées
- ✅ Cohérence garantie

## Ressources

- `docs/BLOCK-SEPARATION-SUMMARY.md` - Contexte sur la séparation des blocs
- `apps/dashboard/src/components/proposals/modals/ConfirmDatePropagationModal.tsx` - Modale de propagation
- `packages/database/src/services/proposal-domain.service.ts` - Service d'application
