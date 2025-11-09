# Validation par Blocs v2 - Annulation Globale

**Date** : 2025-01-08  
**Statut** : ✅ Implémenté

## 🎯 Objectif

Améliorer le système de validation par blocs pour permettre :
1. ✅ Validation bloc par bloc indépendante
2. ✅ Validation globale (tous les blocs)
3. ✅ Annulation bloc par bloc
4. ✅ **Annulation globale (tous les blocs)** ← NOUVEAU
5. ✅ Retrait des boutons legacy

## 📦 Modifications

### 1. Hook `useBlockValidation.ts`

**Ajouts** :
```typescript
// Annuler la validation de tous les blocs validés
const unvalidateAllBlocks = useCallback(async () => {
  const validatedBlocks = Object.keys(syncedBlockStatus).filter(
    blockKey => syncedBlockStatus[blockKey].isValidated
  )
  
  for (const blockKey of validatedBlocks) {
    await unvalidateBlock(blockKey)
  }
}, [syncedBlockStatus, unvalidateBlock])

// Vérifier si au moins un bloc est validé
const hasValidatedBlocks = useCallback(() => {
  return Object.values(syncedBlockStatus).some(block => block.isValidated)
}, [syncedBlockStatus])
```

**Retour** :
```typescript
return {
  blockStatus: syncedBlockStatus,
  validateBlock,
  unvalidateBlock,
  validateAllBlocks,
  unvalidateAllBlocks,        // ← NOUVEAU
  isBlockValidated,
  hasValidatedBlocks,          // ← NOUVEAU
  isPending
}
```

### 2. Composant `ProposalNavigation.tsx`

**Retraits** :
- ❌ `showApproveAllButton` (legacy)
- ❌ `onApproveAll` (legacy)
- ❌ `showUnapproveButton` (legacy)
- ❌ `onUnapprove` (legacy)

**Ajouts** :
```typescript
interface ProposalNavigationProps {
  // ...
  showUnvalidateAllBlocksButton?: boolean  // ← NOUVEAU
  onUnvalidateAllBlocks?: () => Promise<void>  // ← NOUVEAU
}
```

**Bouton ajouté** :
```tsx
{showUnvalidateAllBlocksButton && onUnvalidateAllBlocks && (
  <Button
    variant="outlined"
    color="warning"
    size="small"
    startIcon={<CancelIcon />}
    onClick={onUnvalidateAllBlocks}
    disabled={disabled || isValidateAllBlocksPending}
  >
    Annuler validation (tous les blocs)
  </Button>
)}
```

### 3. Base `GroupedProposalDetailBase.tsx`

**Retraits** :
```typescript
// ❌ Supprimé
const handleUnapproveAll = async () => {
  const approvedProposals = groupProposals.filter(p => p.status === 'APPROVED')
  for (const proposal of approvedProposals) {
    await unapproveProposalMutation.mutateAsync(proposal.id)
  }
}
```

**Ajouts dans le hook** :
```typescript
const {
  validateBlock,
  unvalidateBlock,
  validateAllBlocks,
  unvalidateAllBlocks,    // ← NOUVEAU
  isBlockValidated,
  hasValidatedBlocks,     // ← NOUVEAU
  isPending
} = useBlockValidation({ proposals, blockProposals })
```

**Navigation mise à jour** :
```tsx
<ProposalNavigation
  showValidateAllBlocksButton={allPending && !isEventDead && Object.keys(blockProposals).length > 0}
  onValidateAllBlocks={() => validateAllBlocksBase(blockProposals)}
  showUnvalidateAllBlocksButton={hasValidatedBlocks()}  // ← NOUVEAU
  onUnvalidateAllBlocks={unvalidateAllBlocks}           // ← NOUVEAU
  // ❌ showApproveAllButton - RETIRÉ
  // ❌ onApproveAll - RETIRÉ
  // ❌ showUnapproveButton - RETIRÉ
  // ❌ onUnapprove - RETIRÉ
/>
```

### 4. Base `ProposalDetailBase.tsx`

**Navigation simplifiée** :
```tsx
<ProposalNavigation
  navigation={{ /* ... */ }}
  showArchiveButton={false}
  disabled={updateProposalMutation.isPending}
  showBackButton={true}
  // ❌ showUnapproveButton - RETIRÉ
  // ❌ onUnapprove - RETIRÉ
/>
```

## 🎬 Flux Utilisateur

### Scénario 1 : Validation Progressive

```
1. Utilisateur ouvre proposition groupée
2. Clique "Valider" sur bloc Edition
   → Bloc Edition grisé et verrouillé
   → Bouton "Annuler validation (tous les blocs)" apparaît
3. Clique "Valider" sur bloc Organisateur
   → Bloc Organisateur grisé
4. Clique "Valider" sur bloc Courses
   → Bloc Courses grisé
```

### Scénario 2 : Validation Globale

```
1. Utilisateur ouvre proposition groupée
2. Clique "Tout valider (blocs)"
   → Tous les blocs validés en parallèle
   → Bouton "Annuler validation (tous les blocs)" apparaît
```

### Scénario 3 : Annulation Bloc par Bloc

```
1. 3 blocs validés (Edition, Organisateur, Courses)
2. Clique "Annuler" sur bloc Organisateur
   → Bloc Organisateur redevient éditable
   → Les 2 autres blocs restent validés
   → Bouton "Annuler validation (tous les blocs)" toujours visible
```

### Scénario 4 : Annulation Globale (NOUVEAU)

```
1. 3 blocs validés (Edition, Organisateur, Courses)
2. Clique "Annuler validation (tous les blocs)"
   → Tous les blocs redeviennent éditables
   → Bouton "Annuler validation (tous les blocs)" disparaît
   → Bouton "Tout valider (blocs)" réapparaît
```

## ✅ Validation

### Tests Manuels

**Test 1 : Validation globale puis annulation globale**
1. Ouvrir proposition groupée avec 3 blocs
2. Cliquer "Tout valider (blocs)" → Vérifier que les 3 blocs sont grisés
3. Cliquer "Annuler validation (tous les blocs)" → Vérifier que les 3 blocs redeviennent éditables

**Test 2 : Validation partielle puis annulation globale**
1. Valider uniquement 2 blocs sur 3
2. Cliquer "Annuler validation (tous les blocs)" → Vérifier que seuls les 2 blocs validés sont annulés

**Test 3 : Annulation bloc par bloc vs globale**
1. Valider 3 blocs
2. Annuler 1 bloc individuellement
3. Vérifier que "Annuler validation (tous les blocs)" annule seulement les 2 blocs restants

**Test 4 : Visibilité conditionnelle du bouton**
1. Ouvrir proposition → Bouton "Annuler validation" invisible
2. Valider 1 bloc → Bouton "Annuler validation" apparaît
3. Annuler ce bloc → Bouton "Annuler validation" disparaît

## 📊 Résumé

| Fonctionnalité | Avant | Après |
|----------------|-------|-------|
| Validation bloc par bloc | ✅ | ✅ |
| Validation globale | ✅ | ✅ |
| Annulation bloc par bloc | ✅ | ✅ |
| Annulation globale | ❌ | ✅ |
| Bouton "Tout valider" legacy | ✅ | ❌ |
| Bouton "Annuler l'approbation" legacy | ✅ | ❌ |

## 🔄 Compatibilité

- ✅ Toutes les vues groupées (EditionUpdate, EventUpdate, NewEvent, RaceUpdate)
- ✅ Propositions individuelles (pas de boutons legacy retirés)
- ✅ Backward compatible (pas de migration DB requise)
- ✅ Hot reload fonctionne en mode dev

## 🚀 Déploiement

```bash
# Pas de migration DB nécessaire
npm run build
# Redémarrer les services
```

## 📝 Notes

- Le système legacy d'approbation globale (`handleApproveAll`, `handleUnapproveAll`) a été complètement retiré des vues groupées
- Les propositions individuelles conservent la navigation simple sans ces boutons
- La logique d'annulation globale parcourt tous les blocs validés et appelle `unvalidateBlock()` pour chacun
- L'état de validation reste synchronisé avec le backend via `approvedBlocks`
