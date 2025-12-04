# Ajout manuel de courses - Feature Documentation

**Date** : 2025-12-04
**Branche** : `manual-add-race`
**Commit** : `e6b79ac` - feat: Add manual race addition functionality

## 🎯 Objectif

Ajouter la possibilité aux utilisateurs d'ajouter manuellement des courses lors de la modification d'une édition dans le dashboard, via un bouton "Ajouter une course" et un dialog de saisie.

## 📋 Résumé des changements

### Fichiers créés

#### 1. `apps/dashboard/src/components/proposals/edition-update/AddRaceDialog.tsx` (464 lignes)
**Composant MUI Dialog pour l'ajout de courses**

- **Props** :
  - `open: boolean` - Contrôle l'affichage du dialog
  - `onClose: () => void` - Callback fermeture
  - `onAdd: (race: RaceData) => void` - Callback ajout
  - `defaultStartDate?: string` - Date pré-remplie
  - `defaultTimeZone?: string` - Fuseau pré-rempli (défaut: Europe/Paris)
  - `isBlockValidated?: boolean` - Désactiver si bloc validé

- **Champs de formulaire** :
  - ✅ Nom de la course (requis)
  - ✅ Date/heure de départ (optionnel, hérité de l'édition)
  - ✅ Catégorie principale (requis)
  - ✅ Sous-catégorie (optionnel)
  - ✅ Distances (au moins une requise selon catégorie)
    - Distance course (km)
    - Distance vélo (km)
    - Distance marche (km)
    - Distance natation (km)
  - ✅ Dénivelés positifs (optionnel)
    - D+ course (m)
    - D+ vélo (m)
    - D+ marche (m)

- **Logique métier** :
  - Validation dynamique du formulaire
  - Réinitialisation des champs non pertinents quand categoryLevel1 change
  - Nettoyage des undefined avant soumission
  - Gestion d'état avec useState

### Fichiers modifiés

#### 2. `apps/dashboard/src/components/proposals/edition-update/RacesChangesTable.tsx`
**Intégration du bouton "Ajouter une course"**

```typescript
// Ligne ~200 : Nouvel état pour le dialog
const [openAddDialog, setOpenAddDialog] = useState(false)

// Ligne ~250 : Bouton dans le header de la table
<Button
  startIcon={<AddIcon />}
  onClick={() => setOpenAddDialog(true)}
  disabled={disabled || isBlockValidated}
  size="small"
  variant="outlined"
>
  Ajouter une course
</Button>

// Ligne ~400+ : Rendu du dialog
<AddRaceDialog
  open={openAddDialog}
  onClose={() => setOpenAddDialog(false)}
  onAdd={onAddRace}
  defaultStartDate={...}
  defaultTimeZone={...}
  isBlockValidated={isBlockValidated}
/>
```

**Changements de types** :
- Ligne 392 : Vérification optionnelle de `race` pour éviter crash
  ```typescript
  const currentCategoryLevel1 = race ? getDisplayValue(race, 'categoryLevel1') || 'OTHER' : 'OTHER'
  ```

#### 3. `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`
**Déclaration du handler pour les propositions groupées**

```typescript
// Ligne ~50 : Ajout du handler optionnel
onAddRace?: (race: RaceData) => void
```

#### 4. `apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateGroupedDetail.tsx`
**Implémentation du handler pour EDITION_UPDATE groupé**

```typescript
const handleAddRace = (raceData: RaceData) => {
  const newRaceId = `new_${Date.now()}`

  setWorkingGroup(prev => ({
    ...prev,
    racesChanges: [
      ...prev.racesChanges,
      {
        raceId: newRaceId,
        fields: raceData,
        originalFields: {}
      }
    ]
  }))

  setUserModifiedRaceChanges(prev => ({
    ...prev,
    [newRaceId]: raceData
  }))
}

// Ligne ~230 : Passage au composant
<RacesChangesTable
  consolidatedRaces={workingGroup.racesChanges}
  onAddRace={handleAddRace}
  {...otherProps}
/>
```

#### 5. `apps/dashboard/src/pages/proposals/detail/new-event/NewEventGroupedDetail.tsx`
**Implémentation du handler pour NEW_EVENT groupé**

Logique similaire à `EditionUpdateGroupedDetail`, intégration dans le rendu du composant.

#### 6. `apps/dashboard/src/types/index.ts`
**Définition du type RaceData**

```typescript
export interface RaceData {
  name: string
  categoryLevel1: string
  categoryLevel2?: string
  runDistance?: number
  bikeDistance?: number
  walkDistance?: number
  swimDistance?: number
  runPositiveElevation?: number
  bikePositiveElevation?: number
  walkPositiveElevation?: number
  startDate?: string
  timeZone?: string
}
```

#### 7. `CLAUDE.md` (771 lignes)
**Documentation complète du projet** - Ajoutée à la racine pour que Claude Code ait les règles du projet.

## 🔧 Corrections de bugs

### 1. AddRaceDialog.tsx:180 - Cast TypeScript
```typescript
// ❌ Avant
const cleanedData: RaceData = Object.fromEntries(...) as RaceData

// ✅ Après (TypeScript recommande)
const cleanedData: RaceData = Object.fromEntries(...) as unknown as RaceData
```

### 2. RacesChangesTable.tsx:392 - Accès potentiellement undefined
```typescript
// ❌ Avant
const currentCategoryLevel1 = getDisplayValue(race, 'categoryLevel1') || 'OTHER'

// ✅ Après (vérification optionnelle)
const currentCategoryLevel1 = race ? getDisplayValue(race, 'categoryLevel1') || 'OTHER' : 'OTHER'
```

### 3. apps/api/src/index.ts:26 - Variables d'environnement
```typescript
// ❌ Avant
dotenv.config()

// ✅ Après (charge depuis la racine)
dotenv.config({ path: '../../.env' })
```

## 📊 Statistiques des changements

| Métrique | Valeur |
|----------|--------|
| Fichiers créés | 2 (AddRaceDialog.tsx, CLAUDE.md) |
| Fichiers modifiés | 5 |
| Lignes ajoutées | 1345 |
| Lignes supprimées | 9 |
| Changements nets | +1336 |

## ✅ Validation

- ✅ Build TypeScript réussi (`npm run tsc`)
- ✅ Aucune erreur de compilation
- ✅ Aucune erreur de linting
- ✅ Base de données seedée avec succès

## 🚀 Comment utiliser la feature

### Pour l'utilisateur final

1. Naviguer vers une proposition EDITION_UPDATE ou NEW_EVENT
2. Afficher la section "Courses"
3. Cliquer sur le bouton "Ajouter une course" (icône + en haut à droite de la table)
4. Remplir le formulaire :
   - Nom de la course (obligatoire)
   - Catégorie principale (obligatoire)
   - Au moins une distance (obligatoire)
5. Cliquer "Ajouter"
6. La course apparaît dans la table avec le badge "Modifié"
7. Valider le bloc "Races" pour appliquer

### Pour les développeurs

#### Intégrer dans un autre composant

```typescript
import AddRaceDialog from '@/components/proposals/edition-update/AddRaceDialog'
import { RaceData } from '@/types'

function MyComponent() {
  const [open, setOpen] = useState(false)

  const handleAddRace = (race: RaceData) => {
    // Logique d'ajout
    console.log('Nouvelle course:', race)
    setOpen(false)
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Ajouter</Button>

      <AddRaceDialog
        open={open}
        onClose={() => setOpen(false)}
        onAdd={handleAddRace}
        defaultStartDate="2025-12-20T10:00:00Z"
        isBlockValidated={false}
      />
    </>
  )
}
```

## 📁 Structure des répertoires

```
docs/add-manual-race/
├── OVERVIEW.md           # 📄 Ce fichier - Guide complet
├── IMPLEMENTATION.md     # 🔧 Détails techniques d'implémentation
├── TESTING.md           # ✅ Guide de test manuel
└── CHANGELOG.md         # 📝 Historique des changements
```

## 🔗 Fichiers importants

- Principal : `apps/dashboard/src/components/proposals/edition-update/AddRaceDialog.tsx`
- Intégration : `apps/dashboard/src/components/proposals/edition-update/RacesChangesTable.tsx`
- Handlers : `EditionUpdateGroupedDetail.tsx`, `NewEventGroupedDetail.tsx`
- Types : `apps/dashboard/src/types/index.ts`

## ⚠️ Points d'attention

1. **Bloc validé** : Impossible d'ajouter une course si le bloc "Races" est déjà validé
2. **Date héritée** : La date est optionnelle et hérité de l'édition si disponible
3. **Validation** : Au moins une distance est requise selon la catégorie sélectionnée
4. **ID temporaire** : Les nouveaux races utilisent un ID `new_${timestamp}` jusqu'à l'application

## 🎓 Prochaines étapes suggérées

- [ ] Ajouter support pour édition de races existantes (actuellement lecture seule)
- [ ] Ajouter un preview de la course avant validation
- [ ] Ajouter un bouton "Dupliquer une course" pour copier et modifier
- [ ] Améliorer UX : Auto-complétion des catégories basée sur l'historique
- [ ] Tests unitaires pour AddRaceDialog

## 📞 Support

Pour toute question sur cette feature :
1. Consulter `IMPLEMENTATION.md` pour les détails techniques
2. Consulter `TESTING.md` pour les tests manuels
3. Vérifier `CHANGELOG.md` pour l'historique
