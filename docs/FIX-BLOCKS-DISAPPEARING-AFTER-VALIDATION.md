# Fix: Blocs disparaissant après validation

**Date**: 2025-11-14  
**Problème**: Les blocs (event, edition, organizer, races) disparaissaient après "Tout valider (blocs)" au lieu de rester visibles en mode désactivé.

## Symptômes

1. Utilisateur clique sur "Tout valider (blocs)" dans une proposition groupée EDITION_UPDATE
2. ✅ Les propositions passent au statut `APPROVED` et les blocs sont marqués dans `approvedBlocks`
3. ❌ **Tous les blocs disparaissent de l'interface** au lieu de rester visibles avec un état "validé"

## Comportement attendu

Les blocs validés doivent :
- ✅ Rester visibles avec style désactivé (gris, opacity 0.7)
- ✅ Afficher un bouton "Annuler la validation" pour chaque bloc
- ✅ Désactiver tous les champs en édition
- ✅ Permettre l'annulation bloc par bloc ou globale

## Cause

Les composants de détail utilisaient un **rendu conditionnel** basé uniquement sur la présence de changements actifs :

```tsx
// ❌ AVANT (bugué)
const hasRealEditionChanges = realStandardChanges.length > 0

{hasRealEditionChanges && (
  <CategorizedEditionChangesTable ... />
)}
```

**Problème** : Quand on valide un bloc, les changements sont appliqués et retirés de `consolidatedChanges`, donc `hasRealEditionChanges` devient `false` → le bloc disparaît.

## Solution

Ajouter une condition pour **toujours afficher les blocs validés** même s'ils n'ont plus de changements actifs :

```tsx
// ✅ APRÈS (corrigé)
const hasRealEditionChanges = realStandardChanges.length > 0
const shouldShowEditionBlock = hasRealEditionChanges || isBlockValidated('edition')

{shouldShowEditionBlock && (
  <CategorizedEditionChangesTable ... />
)}
```

### Cas particulier : OrganizerSection

`OrganizerSection` reçoit `change` qui peut être `undefined` si le bloc est validé mais n'a plus de changements. Ajout d'une gestion spéciale :

```tsx
// Si change est undefined ET que le bloc est validé, afficher juste le bouton d'annulation
if (!change && isBlockValidated) {
  return (
    <Paper sx={{ mb: 3 }}>
      <Box sx={{ bgcolor: 'action.hover', opacity: 0.7 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BusinessIcon color="action" />
          <Typography variant="h6">Organisateur</Typography>
          <Chip label="Validé" color="success" size="small" />
        </Box>
        <BlockValidationButton
          isValidated={isBlockValidated}
          onUnvalidate={onUnvalidateBlock}
          ...
        />
      </Box>
    </Paper>
  )
}
```

## Fichiers modifiés

### 1. EditionUpdateGroupedDetail.tsx

**Blocs modifiés** :
- ✅ `edition` : `shouldShowEditionBlock = hasRealEditionChanges || isBlockValidated('edition')`
- ✅ `organizer` : `(organizerChange || isBlockValidated('organizer')) && (...)`
- ✅ `races` : `shouldShowRacesBlock = hasRaceChanges || isBlockValidated('races')`

```diff
- {hasRealEditionChanges && (
+ const shouldShowEditionBlock = hasRealEditionChanges || isBlockValidated('edition')
+ {shouldShowEditionBlock && (

- {organizerChange && (
+ {(organizerChange || isBlockValidated('organizer')) && (

- {hasRaceChanges && (
+ const shouldShowRacesBlock = hasRaceChanges || isBlockValidated('races')
+ {shouldShowRacesBlock && (
```

### 2. NewEventGroupedDetail.tsx

**Blocs modifiés** :
- ✅ `organizer` : `(organizerChange || isBlockValidated('organizer')) && (...)`

**Note** : Les blocs `event`, `edition` et `races` sont **toujours affichés** pour NEW_EVENT (pas de rendu conditionnel).

### 3. OrganizerSection.tsx

**Ajout d'une gestion du cas `change === undefined`** :
- Affichage d'un bloc simplifié avec juste le titre + chip "Validé" + bouton d'annulation
- Évite le crash `change.options[0]` quand `change` est `undefined`

```tsx
// Ligne 70-104
if (!change && isBlockValidated) {
  return (/* bloc simplifié */)
}

if (!change) return null
```

## Tests manuels

### Scénario 1 : Validation complète

1. ✅ Ouvrir une proposition EDITION_UPDATE groupée
2. ✅ Cliquer "Tout valider (blocs)"
3. ✅ Vérifier que tous les blocs restent visibles (gris, désactivés)
4. ✅ Vérifier que chaque bloc a un bouton "Annuler la validation"
5. ✅ Vérifier qu'il y a un bouton "Annuler tout (blocs)" en haut

### Scénario 2 : Validation individuelle

1. ✅ Ouvrir une proposition EDITION_UPDATE groupée
2. ✅ Cliquer "Valider" sur le bloc "Édition"
3. ✅ Vérifier que le bloc "Édition" reste visible (gris, désactivé)
4. ✅ Vérifier que les autres blocs restent actifs (blancs, éditables)

### Scénario 3 : Annulation globale

1. ✅ Valider tous les blocs ("Tout valider (blocs)")
2. ✅ Cliquer "Annuler tout (blocs)"
3. ✅ Vérifier que tous les blocs redeviennent éditables (blancs)

### Scénario 4 : Annulation individuelle

1. ✅ Valider tous les blocs
2. ✅ Cliquer "Annuler la validation" sur le bloc "Organisateur"
3. ✅ Vérifier que le bloc "Organisateur" redevient éditable
4. ✅ Vérifier que les autres blocs restent validés (gris)

### Scénario 5 : Organisateur sans changement

1. ✅ Créer une proposition où `organizer` est validé mais n'a plus de changements
2. ✅ Vérifier que le bloc "Organisateur" s'affiche avec le chip "Validé"
3. ✅ Vérifier que le bouton "Annuler la validation" fonctionne

## Impact

| Aspect | Avant | Après |
|--------|-------|-------|
| **UX** | ❌ Blocs disparaissent → confusion | ✅ Blocs restent visibles → clarté |
| **Annulation** | ❌ Impossible de voir ce qui est validé | ✅ Boutons d'annulation visibles |
| **Workflow** | ❌ Perte de contexte | ✅ Contexte préservé |
| **Code** | ❌ Logique incohérente | ✅ Logique cohérente |

## Ressources

- Hook : `apps/dashboard/src/hooks/useBlockValidation.ts`
- Composant organisateur : `apps/dashboard/src/components/proposals/edition-update/OrganizerSection.tsx`
- Page EDITION_UPDATE : `apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateGroupedDetail.tsx`
- Page NEW_EVENT : `apps/dashboard/src/pages/proposals/detail/new-event/NewEventGroupedDetail.tsx`
- Bouton validation : `apps/dashboard/src/components/proposals/BlockValidationButton.tsx`

## Règles à respecter

⚠️ **JAMAIS** faire un rendu conditionnel qui cache un bloc validé :

```tsx
// ❌ INTERDIT
{hasChanges && (
  <SomeBlock isBlockValidated={isBlockValidated('blockKey')} />
)}

// ✅ CORRECT
const shouldShowBlock = hasChanges || isBlockValidated('blockKey')
{shouldShowBlock && (
  <SomeBlock isBlockValidated={isBlockValidated('blockKey')} />
)}
```

⚠️ **TOUJOURS** gérer le cas où `change` est `undefined` pour les sections spéciales (organizer) :

```tsx
// ✅ CORRECT
if (!change && isBlockValidated) {
  return (/* bloc simplifié avec bouton d'annulation */)
}

if (!change) return null
```
