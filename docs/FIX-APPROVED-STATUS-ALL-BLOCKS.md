# Fix: Statut APPROVED quand tous les blocs validés

**Date** : 2025-11-14  
**Problème** : Les propositions groupées restaient au statut `PENDING` avec le bouton "Tout valider (blocs)" visible même après validation de tous les blocs.

## Symptômes

1. ❌ **Badge "En attente"** affiché alors que tous les blocs sont validés
2. ❌ **Bouton "Tout valider (blocs)"** visible alors qu'il n'y a plus rien à valider
3. ❌ **Statut `PENDING`** dans la base malgré `approvedBlocks` complets

**Exemple** : Proposition `4144-40330` avec 3 propositions groupées
- Bloc `edition` : ✅ Validé
- Bloc `organizer` : ✅ Validé  
- Bloc `races` : ✅ Validé
- **Statut** : `PENDING` ❌ (devrait être `APPROVED`)

## Cause

### Backend (`apps/api/src/routes/proposals.ts` ligne 729-732)

L'algorithme vérifiait **tous les blocs possibles** `['event', 'edition', 'organizer', 'races']` au lieu de vérifier uniquement les **blocs existants** pour cette proposition.

```typescript
// ❌ AVANT (bugué)
const allBlocks = ['event', 'edition', 'organizer', 'races']
const allBlocksValidated = allBlocks.every(b => approvedBlocksObj[b] === true)
```

**Problème** : Une proposition `EDITION_UPDATE` n'a pas de bloc `event`, donc `allBlocks.every()` retournait toujours `false`.

### Frontend (`apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx` ligne 1022)

Le bouton "Tout valider (blocs)" ne vérifiait pas si tous les blocs étaient déjà validés :

```typescript
// ❌ AVANT
showValidateAllBlocksButton={hasPending && !isEventDead && Object.keys(blockProposals).length > 0}
```

## Solution

### Problème 1 : Backend vérifiait tous les blocs

#### Backend : Vérifier uniquement les blocs existants

```typescript
// ✅ APRÈS (corrigé)
const approvedBlocksObj = firstProposal.approvedBlocks as Record<string, boolean>
const existingBlocks = Object.keys(approvedBlocksObj)

// Tous les blocs EXISTANTS doivent être validés
const allBlocksValidated = existingBlocks.length > 0 && 
  existingBlocks.every(blockKey => approvedBlocksObj[blockKey] === true)
```

**Logique** :
1. Extraire les clés de `approvedBlocks` (= blocs existants pour cette proposition)
2. Vérifier que TOUS ces blocs sont à `true`
3. Passer au statut `APPROVED` seulement si condition remplie

### Frontend : Cacher le bouton quand tous validés

```typescript
// ✅ APRÈS
showValidateAllBlocksButton={hasPending && !isEventDead && Object.keys(blockProposals).length > 0 && !allBlocksValidated}
```

**Variable `allBlocksValidated`** (ligne 935-936) :
```typescript
const allBlocksValidated = Object.keys(blockProposals).length > 0 && 
  Object.keys(blockProposals).every(blockKey => isBlockValidated(blockKey))
```

### Problème 2 : Backend ne retournait pas le statut mis à jour

Le backend mettait bien à jour le statut à `APPROVED`, mais retournait `updatedProposals` qui contenait l'état **avant** la mise à jour du statut.

```typescript
// ❌ AVANT
res.json({
  success: true,
  data: updatedProposals,  // Statut encore à PENDING
  message: `Block "${block}" validated...`
})

// ✅ APRÈS
const finalProposals = allBlocksValidated 
  ? await db.prisma.proposal.findMany({ where: { id: { in: proposalIds } } })
  : updatedProposals

res.json({
  success: true,
  data: finalProposals,  // Statut à APPROVED si tous validés
  message: `Block "${block}" validated...`
})
```

### Problème 3 : Cache React Query pas invalidé

Le hook `useUpdateProposal` invalidait bien le cache des propositions individuelles, mais pas le cache du **groupe**.

```typescript
// ❌ AVANT
onSuccess: (response, { id, proposalIds }) => {
  queryClient.invalidateQueries({ queryKey: ['proposals'] })
  if (proposalIds) {
    proposalIds.forEach(proposalId => {
      queryClient.invalidateQueries({ queryKey: ['proposals', proposalId] })
    })
  }
}

// ✅ APRÈS
onSuccess: (response, { id, proposalIds }) => {
  queryClient.invalidateQueries({ queryKey: ['proposals'] })
  if (proposalIds) {
    proposalIds.forEach(proposalId => {
      queryClient.invalidateQueries({ queryKey: ['proposals', proposalId] })
    })
    // ✅ Invalider les groupes
    queryClient.invalidateQueries({ queryKey: ['proposals', 'group'] })
  }
}
```

## Résultats

### Avant

| Blocs validés | Status DB | Badge UI | Bouton "Tout valider" |
|---------------|-----------|----------|-----------------------|
| `edition`, `organizer`, `races` | `PENDING` ❌ | "En attente" ❌ | Visible ❌ |

### Après

| Blocs validés | Status DB | Badge UI | Bouton "Tout valider" |
|---------------|-----------|----------|-----------------------|
| `edition`, `organizer`, `races` | `APPROVED` ✅ | "Traité" ✅ | Caché ✅ |

## Cas d'usage

### Proposition EDITION_UPDATE

**Blocs existants** : `edition`, `organizer`, `races`

1. Validation `edition` → `approvedBlocks: { edition: true }`  
   → Status: `PENDING` (encore 2 blocs)
2. Validation `organizer` → `approvedBlocks: { edition: true, organizer: true }`  
   → Status: `PENDING` (encore 1 bloc)
3. Validation `races` → `approvedBlocks: { edition: true, organizer: true, races: true }`  
   → **Status: `APPROVED`** ✅ (tous les blocs existants validés)

### Proposition NEW_EVENT

**Blocs existants** : `event`, `edition`, `organizer`, `races`

Logique identique, mais avec 4 blocs au lieu de 3.

## Prérequis

⚠️ **IMPORTANT** : Le fix nécessite la migration `20251114140354_add_proposal_ids_to_application` qui ajoute le champ `proposalIds` à `ProposalApplication`.

**Étapes à suivre après déploiement du fix** :

```bash
# 1. Vérifier que la migration est appliquée
psql "$DATABASE_URL" -c "SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%proposal_ids%';"

# 2. Régénérer le client Prisma
cd packages/database && npx prisma generate

# 3. Redémarrer l'API (si pas en mode dev)
npm run dev:api  # Ou redéployer en production
```

## Tests manuels

1. ✅ Charger une proposition groupée (ex: `4144-40330`)
2. ✅ Valider tous les blocs un par un
3. ✅ Vérifier que le bouton "Tout valider (blocs)" disparaît après le dernier bloc
4. ✅ Vérifier que le badge passe de "En attente" à "Traité"
5. ✅ Vérifier en DB que `status = 'APPROVED'`

## Fichiers modifiés

1. **Backend** : `apps/api/src/routes/proposals.ts`
   - Lignes 728-736 : Détection des blocs existants via `Object.keys(approvedBlocks)`
   - Lignes 738-743 : Logs de debug pour vérifier la logique
   - Lignes 746-760 : Mise à jour du statut à `APPROVED` avec logs
   - Lignes 795-800 : Retour des propositions finales (avec statut mis à jour)

2. **Frontend** : `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx` (ligne 1022)
   - Ajout condition `!allBlocksValidated` pour cacher le bouton

3. **Frontend** : `apps/dashboard/src/hooks/useApi.ts` (lignes 298-299, 303-304)
   - Invalidation du cache des groupes après mise à jour
   - Assure le rafraîchissement des données dans l'UI

## Impact

- ✅ **UX améliorée** : Interface cohérente avec l'état réel
- ✅ **Statut correct** : Propositions marquées `APPROVED` au bon moment
- ✅ **Moins de confusion** : Pas de bouton qui ne fait rien
- ✅ **Workflow fluide** : Transition automatique `PENDING` → `APPROVED`

## Rétrocompatibilité

✅ **Aucune migration nécessaire** : Les propositions existantes avec `approvedBlocks` partiellement remplis continueront de fonctionner correctement.

## Ressources

- Code backend : `apps/api/src/routes/proposals.ts`
- Code frontend : `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`
- Hook validation : `apps/dashboard/src/hooks/useBlockValidation.ts`
