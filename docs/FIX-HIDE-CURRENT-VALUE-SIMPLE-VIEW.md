# Fix: Masquer la colonne "Valeur actuelle" dans les vues simples

**Date** : 2025-11-12  
**Context** : Phase 3 - Vue simple en lecture seule

## Problème

Dans les vues simples des propositions (`ProposalDetailBase`), la colonne "Valeur actuelle" était affichée mais toujours vide, car :
- La vue simple n'effectue plus de connexion à Miles Republic (Phase 3)
- Les valeurs actuelles ne sont chargées que dans la vue groupée via `useProposalEditor`
- Afficher une colonne vide était trompeur pour l'utilisateur

## Solution

Ajout d'une prop `showCurrentValue?: boolean` (défaut: `true`) à tous les composants de tableaux pour masquer cette colonne dans les vues simples.

### Composants modifiés

#### 1. Composants de base

- **`GenericChangesTable`** (ligne 65)
  - Ajout prop `showCurrentValue?: boolean`
  - Masquage conditionnel de la colonne header (ligne 379)
  - Masquage conditionnel des cellules (ligne 294)
  - Ajustement automatique de la largeur des colonnes restantes

- **`OrganizerSection`** (ligne 41)
  - Ajout prop `showCurrentValue?: boolean`
  - Masquage de la colonne "Valeur actuelle" (ligne 183, 205)
  - Largeur "Valeur proposée" ajustée : 35% → 60%

- **`RacesChangesTable`** (ligne 44)
  - Ajout prop `showCurrentValue?: boolean`
  - Masquage de la colonne "Valeur actuelle" (ligne 236, 283)
  - Largeur "Valeur proposée" ajustée : 30% → 60%

#### 2. Wrappers

- **`CategorizedChangesTable`** (ligne 30)
  - Prop passthrough vers `GenericChangesTable`

- **`CategorizedEventChangesTable`** (ligne 12, 24, 43)
  - Interface + prop passthrough

- **`CategorizedEditionChangesTable`** (ligne 18, 34, 98)
  - Interface + prop passthrough

#### 3. Vues simples

**`EditionUpdateDetail.tsx`** :
- `CategorizedEditionChangesTable` : `showCurrentValue={false}` (ligne 84)
- `OrganizerSection` : `showCurrentValue={false}` (ligne 99)
- `RacesChangesTable` : `showCurrentValue={false}` (ligne 114)

**`NewEventDetail.tsx`** :
- `CategorizedEventChangesTable` : `showCurrentValue={false}` (ligne 97)
- `CategorizedEditionChangesTable` : `showCurrentValue={false}` (ligne 118)
- `OrganizerSection` : `showCurrentValue={false}` (ligne 132)
- `RacesChangesTable` : `showCurrentValue={false}` (ligne 146)

### Vues groupées (pas de changement)

Les vues groupées (`GroupedProposalDetailBase`, `*GroupedDetail.tsx`) conservent `showCurrentValue={true}` par défaut, donc continuent d'afficher la colonne "Valeur actuelle".

## Résultat

### Avant

| Champ | Valeur actuelle | Valeur proposée | Confiance |
|-------|----------------|-----------------|-----------|
| startDate | - | dimanche 01/03/2026 00:00 | 79% |
| endDate | - | dimanche 01/03/2026 00:00 | 79% |
| timeZone | - | Europe/Paris | 79% |

❌ Colonne vide qui ne sert à rien

### Après

| Champ | Valeur proposée | Confiance |
|-------|-----------------|-----------|
| startDate | dimanche 01/03/2026 00:00 | 79% |
| endDate | dimanche 01/03/2026 00:00 | 79% |
| timeZone | Europe/Paris | 79% |

✅ Plus de colonne vide, interface épurée

## Impact

- ✅ **Vue simple** : Plus de colonne "Valeur actuelle" vide
- ✅ **Vue groupée** : Conserve la colonne (chargement Miles Republic actif)
- ✅ **Cohérence** : Affichage adapté selon le mode (lecture seule vs édition)
- ✅ **Largeur** : Colonnes restantes plus larges pour meilleure lisibilité
- ✅ **Rétrocompatibilité** : Défaut `showCurrentValue=true` préserve comportement existant

## Fichiers modifiés

```
apps/dashboard/src/
├── components/proposals/
│   ├── GenericChangesTable.tsx
│   ├── CategorizedChangesTable.tsx
│   ├── CategorizedEventChangesTable.tsx
│   ├── CategorizedEditionChangesTable.tsx
│   └── edition-update/
│       ├── OrganizerSection.tsx
│       └── RacesChangesTable.tsx
└── pages/proposals/detail/
    ├── edition-update/
    │   └── EditionUpdateDetail.tsx
    └── new-event/
        └── NewEventDetail.tsx
```

## Tests

```bash
# Vérification TypeScript
cd apps/dashboard && npx tsc --noEmit
# ✅ Aucune erreur

# Vérification visuelle
# 1. Ouvrir une proposition simple : http://localhost:4000/proposals/{id}
# 2. Vérifier que la colonne "Valeur actuelle" n'apparaît pas
# 3. Cliquer "Éditer cette proposition" → Vue groupée
# 4. Vérifier que la colonne "Valeur actuelle" apparaît
```

## Références

- Phase 3 : `docs/proposal-state-refactor/PHASE3-COMPLETE-2025-11-12.md`
- Règles projet : `WARP.md` (section Dashboard - Interfaces de propositions)
