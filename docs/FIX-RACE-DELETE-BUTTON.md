# Fix: Activation du bouton de suppression de courses

**Date** : 2025-11-12  
**Problème** : Le bouton de suppression (poubelle) était désactivé dans `RacesChangesTable`, empêchant la suppression de courses proposées.

## Symptôme

Dans l'interface de détail d'une proposition, le bouton de suppression était grisé et non cliquable :

```tsx
<IconButton
  size="small"
  disabled={true}  // ❌ Hardcodé à true
  sx={{ opacity: 0.3 }}
>
  <DeleteIcon fontSize="small" />
</IconButton>
```

## Cause

Le composant `RacesChangesTable` :
1. N'acceptait pas de prop `onDeleteRace`
2. Le bouton était hardcodé à `disabled={true}`
3. Le handler `deleteRace` du hook `useProposalEditor` n'était pas passé au composant

## Solution

### 1. Ajout de la prop `onDeleteRace` (optionnelle)

**Fichier** : `apps/dashboard/src/components/proposals/edition-update/RacesChangesTable.tsx`

```tsx
interface RacesChangesTableProps {
  // ... autres props
  onDeleteRace?: (raceId: string) => void // ✅ Nouvelle prop
}

const RacesChangesTable: React.FC<RacesChangesTableProps> = ({
  // ... autres props
  onDeleteRace,
}) => {
```

### 2. Activation du bouton avec conditions

```tsx
<IconButton
  size="small"
  disabled={disabled || isBlockValidated || !onDeleteRace}  // ✅ Désactivé si pas de handler
  onClick={() => onDeleteRace && onDeleteRace(race.raceId)} // ✅ Appel du handler
  color="error"
  sx={{ 
    opacity: (disabled || isBlockValidated || !onDeleteRace) ? 0.3 : 0.7,
    '&:hover': { opacity: 1 }
  }}
>
  <DeleteIcon fontSize="small" />
</IconButton>
```

**Conditions de désactivation** :
- `disabled` : Table en lecture seule
- `isBlockValidated` : Bloc déjà validé
- `!onDeleteRace` : Aucun handler fourni (rétrocompatibilité)

### 3. Passage du handler depuis `GroupedProposalDetailBase`

**Fichier** : `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`

```tsx
// Interface du contexte
export interface GroupedProposalContext extends Omit<ProposalContext, 'proposal'> {
  // ... autres props
  handleDeleteRace: (raceId: string) => void  // ✅ Ajout
}

// Extraction du handler depuis useProposalEditor
const {
  deleteRace: deleteRaceEditor,
  // ...
} = editorResult

// Passage au contexte
const context: GroupedProposalContext = {
  // ...
  handleDeleteRace: deleteRaceEditor,  // ✅ Direct depuis le hook
}
```

### 4. Passage aux composants enfants

**Fichiers** :
- `apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateGroupedDetail.tsx`
- `apps/dashboard/src/pages/proposals/detail/new-event/NewEventGroupedDetail.tsx`

```tsx
const { handleDeleteRace } = context  // ✅ Extraction du contexte

<RacesChangesTable
  // ... autres props
  onDeleteRace={handleDeleteRace}  // ✅ Passage au composant
/>
```

## Comportement

### Soft Delete (marquage)

Le système utilise un **soft delete** avec marqueur `_deleted` dans `userModifiedRaceChanges` :

```typescript
// Course marquée comme supprimée
userModifiedRaceChanges = {
  "141829": {
    name: "10km modifié",  // Modifications conservées
    _deleted: true          // Marqueur de suppression
  }
}
```

### Cas d'usage typique

1. **Supprimer une course** :
   - Clic sur poubelle rouge → `_deleted: true` ajouté
   - Affichage : grisé, barré, chip "À supprimer"
   - Icône change : Undo (flèche circulaire)
   - Autosave déclenché → Persisté en backend

2. **Annuler la suppression** :
   - Clic sur Undo → `_deleted` retiré
   - Affichage : normal, chip "Existante" ou "Nouvelle"
   - Icône change : Delete (poubelle)
   - Autosave déclenché → Persisté en backend

3. **Application de la proposition** :
   - Courses avec `_deleted: true` sont ignorées (pas créées/modifiées)
   - Pour les suppressions en base, le backend supporte `racesToDelete` (IDs) et `racesToAddFiltered` (indices) selon l'agent

### États du bouton

| Condition | État | Tooltip |
|-----------|------|---------|
| `disabled=false` et bloc non validé | ✅ Actif | "Supprimer la course" |
| `disabled=true` | ❌ Désactivé | "Suppression désactivée" |
| Bloc validé | ❌ Désactivé | "Suppression désactivée" |
| `onDeleteRace` non fourni | ❌ Désactivé | "Suppression désactivée" |

## Intégration avec useProposalEditor

Le hook `useProposalEditor` expose déjà la fonction `deleteRace(raceId: string)` qui :
1. Retire la course de `workingGroup.consolidatedRaces`
2. Supprime les modifications utilisateur associées (`userModifiedRaceChanges[raceId]`)
3. Marque l'état comme dirty (`isDirty = true`)
4. Déclenche l'autosave (si activé)

**Aucun changement nécessaire dans le hook** — le handler était déjà prêt ! ✅

## Impact

### Fonctionnalité restaurée

- ✅ Suppression de nouvelles courses proposées
- ✅ Retrait de courses existantes de la proposition
- ✅ Sauvegarde automatique de la suppression

### Rétrocompatibilité

- ✅ `onDeleteRace` optionnelle (ancien code compile toujours)
- ✅ Désactivation automatique si pas de handler fourni
- ✅ Tooltip informatif selon le contexte

### Cohérence UI

- ✅ Bouton rouge (`color="error"`) pour action destructive
- ✅ Opacité réduite quand désactivé
- ✅ Hover effect quand actif

## Tests recommandés

1. **Suppression nouvelle course** (NEW_EVENT) :
   - Créer proposition avec 3 courses
   - Supprimer la 2ème course
   - Vérifier que seules les courses 1 et 3 restent

2. **Suppression course existante** (EDITION_UPDATE) :
   - Ouvrir proposition avec modifications de courses
   - Supprimer une course proposée
   - Vérifier que la course n'apparaît plus dans racesToUpdate

3. **Désactivation après validation** :
   - Valider le bloc "Courses"
   - Vérifier que le bouton est grisé
   - Annuler la validation
   - Vérifier que le bouton redevient actif

## Fichiers modifiés

1. `apps/dashboard/src/components/proposals/edition-update/RacesChangesTable.tsx` (+3 lignes)
2. `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx` (+2 lignes)
3. `apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateGroupedDetail.tsx` (+2 lignes)
4. `apps/dashboard/src/pages/proposals/detail/new-event/NewEventGroupedDetail.tsx` (+2 lignes)

**Total** : +9 lignes, 4 fichiers modifiés

## Ressources

- Hook `useProposalEditor` : `apps/dashboard/src/hooks/useProposalEditor.ts`
- Documentation des propositions : `WARP.md` (section Dashboard)
