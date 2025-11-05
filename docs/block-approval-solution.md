# Solution : Approbation partielle par bloc

## Problème identifié

Le système actuel incluait une même proposition dans plusieurs blocs si elle touchait plusieurs domaines (édition + courses par exemple). Quand on validait le bloc "Édition", toutes les propositions du bloc étaient approuvées globalement, même si ces propositions avaient aussi des changements dans d'autres blocs (courses).

## Solution implémentée

### 1. Modification du schéma de base de données

Ajout d'un champ `approvedBlocks` dans la table `Proposal` pour tracker quels blocs ont été approuvés :

```prisma
model Proposal {
  // ... autres champs
  approvedBlocks      Json?                 @default("{}")
  // ...
}
```

**Migration créée** : `20251105111007_add_approved_blocks`

### 2. Modification de l'API

#### Endpoint PUT /api/proposals/:id

Ajout d'un paramètre optionnel `block` dans le body :

```typescript
body('block').optional().isString()
```

**Logique d'approbation par bloc** :
- Si `status === 'APPROVED'` et `block` est fourni :
  - On récupère l'objet `approvedBlocks` de la proposition
  - On ajoute le bloc approuvé : `approvedBlocks[block] = true`
  - On met à jour la proposition avec ce nouvel état
  - On met le status général à `APPROVED`

```typescript
if (status === 'APPROVED' && block) {
  const approvedBlocks = (currentProposal.approvedBlocks as Record<string, boolean>) || {}
  approvedBlocks[block] = true
  updates.approvedBlocks = approvedBlocks
  updates.status = status
  // ...
}
```

#### Endpoint POST /api/proposals/bulk-approve

Ajout du support du paramètre `block` pour l'approbation en masse :

```typescript
if (block) {
  for (const proposal of pendingProposals) {
    const approvedBlocks = (proposal.approvedBlocks as Record<string, boolean>) || {}
    approvedBlocks[block] = true
    
    await tx.proposal.update({
      where: { id: proposal.id },
      data: {
        status: 'APPROVED',
        reviewedAt: new Date(),
        reviewedBy: reviewedBy || undefined,
        approvedBlocks
      }
    })
  }
}
```

### 3. Modification du service ProposalService

Ajout du champ `approvedBlocks` dans la méthode `updateProposal` :

```typescript
async updateProposal(id: string, data: {
  // ... autres champs
  approvedBlocks?: any
})
```

### 4. Modification du frontend

#### Services API (`services/api.ts`)

Ajout du paramètre `block` dans la signature de `proposalsApi.update` :

```typescript
update: (
  id: string, 
  data: { 
    // ... autres champs
    block?: string;
  }
): Promise<ApiResponse<Proposal>>
```

#### Hook useApi (`hooks/useApi.ts`)

Ajout du paramètre `block` dans `useUpdateProposal` :

```typescript
mutationFn: ({ 
  id, 
  status, 
  reviewedBy, 
  // ... autres paramètres
  block
}: { 
  id: string
  status?: string
  reviewedBy?: string
  // ... autres types
  block?: string
}) => proposalsApi.update(id, { status, reviewedBy, ..., block })
```

#### Hook useBlockValidation (`hooks/useBlockValidation.ts`)

Modification de `validateBlock` pour passer le paramètre `block` :

```typescript
const validateBlock = useCallback(async (blockKey: string, proposalIds: string[]) => {
  try {
    await Promise.all(
      proposalIds.map(id => 
        updateProposalMutation.mutateAsync({
          id,
          status: 'APPROVED',
          reviewedBy: 'Utilisateur',
          block: blockKey // Spécifier le bloc pour approbation partielle
        })
      )
    )
    // ...
  }
}, [updateProposalMutation])
```

## Fonctionnement

1. **Affichage** : Une proposition peut apparaître dans plusieurs blocs si elle touche plusieurs domaines
2. **Validation** : Quand on valide le bloc "Édition", chaque proposition est marquée comme approuvée POUR CE BLOC spécifiquement
3. **Traçabilité** : Le champ `approvedBlocks` permet de savoir exactement quels blocs ont été validés pour chaque proposition
4. **Application** : Au moment d'appliquer les changements, on peut filtrer les changements à appliquer en fonction des blocs approuvés

## Évolutions futures possibles

### Option 1 : Validation complète requise
On pourrait exiger que TOUS les blocs touchés par une proposition soient validés avant de l'appliquer :

```typescript
const canApply = (proposal) => {
  const touchedBlocks = getTouchedBlocks(proposal.changes)
  return touchedBlocks.every(block => proposal.approvedBlocks[block])
}
```

### Option 2 : Application partielle
Lors de l'application, ne prendre en compte que les champs des blocs approuvés :

```typescript
const getApplicableChanges = (proposal) => {
  const applicableChanges = {}
  for (const [field, value] of Object.entries(proposal.changes)) {
    const block = getBlockForField(field)
    if (proposal.approvedBlocks[block]) {
      applicableChanges[field] = value
    }
  }
  return applicableChanges
}
```

### Option 3 : Statut par bloc
Au lieu d'un statut global, avoir un statut par bloc :

```typescript
approvedBlocks: {
  edition: 'APPROVED',
  races: 'PENDING',
  organizer: 'REJECTED'
}
```

## Tests recommandés

1. Créer une proposition qui touche plusieurs blocs (édition + courses)
2. Valider uniquement le bloc "Édition"
3. Vérifier que `approvedBlocks.edition === true`
4. Vérifier que le statut global est `APPROVED`
5. Vérifier que le bloc "Courses" n'est pas marqué comme approuvé
6. Valider le bloc "Courses"
7. Vérifier que `approvedBlocks.races === true`

## Notes techniques

- Le champ `approvedBlocks` est un JSON qui contient un objet `{ blockKey: boolean }`
- La valeur par défaut est `{}` (objet vide)
- Le système est rétrocompatible : si aucun bloc n'est spécifié, l'approbation fonctionne comme avant
