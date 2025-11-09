# Fix - Annulation indépendante des blocs

**Date** : 2025-11-09  
**Problème résolu** : Annuler un bloc annulait tous les blocs de la proposition

## Problème

Quand l'utilisateur annulait la validation d'un bloc (ex: "Event"), **tous les autres blocs** (Edition, Organizer, Races) étaient également annulés, alors que les blocs devaient être indépendants.

### Comportement attendu

```
Proposition avec 3 blocs validés :
✅ Event
✅ Edition  
✅ Organizer

Utilisateur annule "Event" → Résultat attendu :
❌ Event
✅ Edition  ← Devrait rester validé
✅ Organizer ← Devrait rester validé
```

### Comportement buggé

```
Utilisateur annule "Event" → Résultat réel :
❌ Event
❌ Edition  ← BUG : Annulé aussi !
❌ Organizer ← BUG : Annulé aussi !
```

## Cause racine

### Backend

L'endpoint `/api/proposals/:id/unapprove` **réinitialisait complètement** le champ `approvedBlocks` :

```typescript
// ❌ AVANT (ligne 832)
await tx.proposal.update({
  where: { id },
  data: {
    status: 'PENDING',
    approvedBlocks: {} // ❌ Réinitialise TOUS les blocs !
  }
})
```

### Frontend

Le hook `useBlockValidation` appelait cet endpoint pour chaque proposition du bloc, ce qui annulait **toute** la proposition :

```typescript
// ❌ AVANT (ligne 101)
await unapproveProposalMutation.mutateAsync(id) // Annule TOUT
```

## Solution

### 1. Nouvel endpoint backend : `/api/proposals/:id/unapprove-block`

Cet endpoint annule **uniquement un bloc spécifique** :

```typescript
// ✅ Nouveau endpoint (ligne 858)
router.post('/:id/unapprove-block', [
  body('block').isString().notEmpty()
], asyncHandler(async (req, res) => {
  const { id } = req.params
  const { block } = req.body
  
  const approvedBlocks = proposal.approvedBlocks || {}
  
  // Retirer uniquement ce bloc
  delete approvedBlocks[block]
  
  // Si plus aucun bloc approuvé, remettre à PENDING
  const hasRemainingApprovedBlocks = Object.values(approvedBlocks).some(v => v === true)
  const newStatus = hasRemainingApprovedBlocks ? 'APPROVED' : 'PENDING'
  
  await tx.proposal.update({
    where: { id },
    data: {
      status: newStatus,
      approvedBlocks, // ✅ Conserve les autres blocs !
      reviewedAt: newStatus === 'PENDING' ? null : proposal.reviewedAt
    }
  })
}))
```

**Comportement** :
- Retire le bloc spécifié de `approvedBlocks`
- **Conserve tous les autres blocs approuvés**
- Si plus aucun bloc approuvé → statut PENDING
- Si au moins un bloc reste approuvé → statut APPROVED

### 2. Nouvelle méthode frontend : `proposalsApi.unapproveBlock()`

```typescript
// ✅ api.ts (ligne 174)
unapproveBlock: (id: string, block: string) => 
  api.post(`/proposals/${id}/unapprove-block`, { block }).then(res => res.data)
```

### 3. Nouveau hook : `useUnapproveBlock()`

```typescript
// ✅ useApi.ts (ligne 379)
export const useUnapproveBlock = () => {
  return useMutation({
    mutationFn: ({ id, block }: { id: string; block: string }) => 
      proposalsApi.unapproveBlock(id, block),
    onSuccess: (response, { id, block }) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] })
      enqueueSnackbar(`Bloc "${block}" annulé`, { variant: 'success' })
    }
  })
}
```

### 4. Mise à jour de `useBlockValidation`

```typescript
// ✅ useBlockValidation.ts (ligne 101)
const unapproveBlockMutation = useUnapproveBlock()

const unvalidateBlock = async (blockKey: string) => {
  // ...
  for (const id of approvedProposalIds) {
    await unapproveBlockMutation.mutateAsync({ id, block: blockKey })
    // ✅ N'annule que le bloc spécifique !
  }
}
```

## Résultat

✅ Annuler un bloc n'affecte **que ce bloc**  
✅ Les autres blocs restent validés  
✅ La proposition reste APPROVED tant qu'au moins 1 bloc est validé  
✅ La proposition repasse à PENDING seulement si tous les blocs sont annulés  

### Exemple concret

```
État initial :
✅ Event (approved)
✅ Edition (approved)
✅ Organizer (approved)

Utilisateur annule "Event" :
❌ Event
✅ Edition ← Reste validé !
✅ Organizer ← Reste validé !
Status: APPROVED (car 2 blocs restent validés)

Utilisateur annule "Edition" :
❌ Event
❌ Edition
✅ Organizer ← Reste validé !
Status: APPROVED (car 1 bloc reste validé)

Utilisateur annule "Organizer" :
❌ Event
❌ Edition
❌ Organizer
Status: PENDING (aucun bloc validé)
```

## Rétrocompatibilité

L'ancien endpoint `/api/proposals/:id/unapprove` est **conservé** pour :
- Le bouton "Annuler l'approbation" global dans la navigation
- Annuler complètement une proposition d'un coup

Le nouveau endpoint `/api/proposals/:id/unapprove-block` est utilisé **uniquement** pour l'annulation bloc par bloc via les boutons "Dévalider" de chaque section.

## Tests recommandés

### Proposition simple
1. Valider les blocs Event, Edition, Organizer
2. Annuler le bloc Event → Vérifier que Edition et Organizer restent validés
3. Annuler le bloc Edition → Vérifier que Organizer reste validé
4. Annuler le bloc Organizer → Vérifier que la proposition repasse à PENDING

### Proposition groupée
1. Valider tous les blocs d'une proposition NEW_EVENT groupée
2. Annuler le bloc Event → Vérifier que Edition, Organizer, Races restent validés
3. Vérifier que le statut reste APPROVED

### Cas limites
1. Annuler un bloc déjà non-validé → Doit retourner succès silencieux
2. Annuler le dernier bloc validé → Doit repasser la proposition à PENDING
3. Annuler un bloc d'une proposition déjà appliquée → Doit retourner erreur

## Fichiers modifiés

### Backend
- ✅ `apps/api/src/routes/proposals.ts` (ligne 858) - Nouvel endpoint `unapprove-block`

### Frontend
- ✅ `apps/dashboard/src/services/api.ts` (ligne 174) - Nouvelle méthode API
- ✅ `apps/dashboard/src/hooks/useApi.ts` (ligne 379) - Nouveau hook
- ✅ `apps/dashboard/src/hooks/useBlockValidation.ts` (lignes 2, 22, 101) - Utilisation du nouveau hook

## Logs et debugging

### Backend
```
info: Proposal 123 - Block "event" approval cancelled
data: {
  proposalId: '123',
  block: 'event',
  newStatus: 'APPROVED',
  remainingApprovedBlocks: ['edition', 'organizer']
}
```

### Frontend
```
[useBlockValidation] Bloc "event" annulé pour la proposition 123
```

## Documentation

- `WARP.md` - Section "Dashboard - Interfaces de propositions"
- `docs/BLOCK-SEPARATION-EVENT-EDITION.md` - Séparation des blocs
- `docs/BLOCK-UNAPPROVE-INDEPENDENT.md` - Ce document
