# Détails techniques d'implémentation

## Architecture générale

```
User clicks "Ajouter une course"
         ↓
    RacesChangesTable opens AddRaceDialog
         ↓
  User fills form & validates
         ↓
AddRaceDialog.onAdd(raceData) called
         ↓
EditionUpdateGroupedDetail.handleAddRace()
         ↓
Update state: racesChanges + userModifiedRaceChanges
         ↓
RacesChangesTable re-renders with new row
         ↓
Badge "Modifié" appears on new race
         ↓
User clicks "Valider" on Races block
         ↓
Changes sent to backend API
```

## Composants impliqués

### 1. AddRaceDialog (Nouveau composant)

**Localisation** : `apps/dashboard/src/components/proposals/edition-update/AddRaceDialog.tsx`

**Responsabilités** :
- Affichage du dialog MUI
- Gestion du formulaire interne
- Validation des données
- Nettoyage avant envoi

**État interne** :
```typescript
const [formData, setFormData] = useState<Partial<RaceData>>({
  name: '',
  categoryLevel1: '',
  categoryLevel2: '',
  runDistance: undefined,
  bikeDistance: undefined,
  walkDistance: undefined,
  swimDistance: undefined,
  runPositiveElevation: undefined,
  bikePositiveElevation: undefined,
  walkPositiveElevation: undefined,
  startDate: defaultStartDate || '',
  timeZone: defaultTimeZone
})

const [errors, setErrors] = useState<Record<string, string>>({})
```

**Fonctions clés** :

#### getActiveFields(categoryLevel1)
Détermine quels champs de distance/élévation sont actifs selon la catégorie.

```typescript
getActiveFields('RUNNING') → {
  distances: ['runDistance'],
  elevations: ['runPositiveElevation']
}

getActiveFields('TRIATHLON') → {
  distances: ['runDistance', 'bikeDistance', 'swimDistance'],
  elevations: ['runPositiveElevation', 'bikePositiveElevation']
}
```

#### validateForm()
Validation complète du formulaire :
- Nom requis et non vide
- Catégorie principale requise
- Au moins une distance pour la catégorie sélectionnée

Retourne `boolean` et remplit l'état `errors`.

#### handleCategoryLevel1Change(value)
Gestion du changement de catégorie principale :
1. Réinitialise les champs non pertinents
2. Vide la sous-catégorie
3. Appelle getActiveFields pour déterminer les nouveaux champs

#### handleSubmit()
1. Valide le formulaire
2. Nettoie les undefined/null/empty strings
3. Appelle onAdd avec les données nettoyées
4. Réinitialise le formulaire
5. Ferme le dialog

**Exports** :
```typescript
export const CATEGORY_LEVEL_1_OPTIONS = [...]
export const CATEGORY_LEVEL_2_OPTIONS = {...}
```

Ces exports sont utilisés par RacesChangesTable pour les selects éditables.

### 2. RacesChangesTable (Modifié)

**Localisation** : `apps/dashboard/src/components/proposals/edition-update/RacesChangesTable.tsx`

**Changements** :
- Nouvel état : `openAddDialog`
- Nouvel handler : `onAddRace?`
- Nouveau bouton : "Ajouter une course"
- Nouveau rendu : AddRaceDialog
- Correction ligne 392 : vérification optionnelle de race

**Intégration du dialog** :
```typescript
const [openAddDialog, setOpenAddDialog] = useState(false)

// Dans le rendu du header
<Button
  startIcon={<AddIcon />}
  onClick={() => setOpenAddDialog(true)}
  disabled={disabled || isBlockValidated}
  size="small"
  variant="outlined"
>
  Ajouter une course
</Button>

// Dans le footer
<AddRaceDialog
  open={openAddDialog}
  onClose={() => setOpenAddDialog(false)}
  onAdd={onAddRace}
  defaultStartDate={editionStartDate}
  defaultTimeZone={editionTimeZone}
  isBlockValidated={isBlockValidated}
/>
```

### 3. EditionUpdateGroupedDetail (Modifié)

**Localisation** : `apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateGroupedDetail.tsx`

**Implémentation du handler** :
```typescript
const handleAddRace = (raceData: RaceData) => {
  // Générer un ID unique pour la nouvelle course
  const newRaceId = `new_${Date.now()}`

  // Ajouter aux racesChanges
  setWorkingGroup(prev => {
    const newRacesChanges = [...prev.racesChanges]
    newRacesChanges.push({
      raceId: newRaceId,
      fields: raceData,
      originalFields: {}
    })

    return {
      ...prev,
      racesChanges: newRacesChanges
    }
  })

  // Marquer comme modifié dans userModifiedRaceChanges
  setUserModifiedRaceChanges(prev => ({
    ...prev,
    [newRaceId]: raceData
  }))
}
```

**Pourquoi cette structure** :
- `raceId: new_${timestamp}` : ID temporaire unique, pas en base
- `fields: raceData` : Contient tous les champs saisis
- `originalFields: {}` : Vide car c'est une nouvelle course
- Ajout dans `userModifiedRaceChanges` : Marque comme modifié pour affichage visuel

**Passage au composant** :
```typescript
<RacesChangesTable
  consolidatedRaces={workingGroup.racesChanges}
  userModifiedRaceChanges={userModifiedRaceChanges}
  onRaceFieldModify={handleRaceFieldModify}
  onDeleteRace={handleDeleteRace}
  onAddRace={handleAddRace}  // ← Nouveau
  editionStartDate={workingGroup.edition?.startDate}
  editionTimeZone={workingGroup.edition?.timeZone}
  {...}
/>
```

### 4. NewEventGroupedDetail (Modifié)

**Localisation** : `apps/dashboard/src/pages/proposals/detail/new-event/NewEventGroupedDetail.tsx`

**Implémentation** : Identique à EditionUpdateGroupedDetail mais dans le contexte NEW_EVENT.

## Flux de données

### Ajout d'une nouvelle course

```
User input in AddRaceDialog
         ↓
[name, categoryLevel1, categoryLevel2, distances, etc.]
         ↓
handleSubmit() in AddRaceDialog
         ↓
cleanedData: RaceData = {
  name: "Trail du Mont Blanc",
  categoryLevel1: "TRAIL",
  categoryLevel2: "ULTRA_TRAIL",
  runDistance: 170,
  runPositiveElevation: 8000
}
         ↓
onAdd(cleanedData) callback
         ↓
handleAddRace() in EditionUpdateGroupedDetail
         ↓
Create newRaceId = "new_1733350400000"
         ↓
Update workingGroup.racesChanges:
  [...existing, {
    raceId: "new_1733350400000",
    fields: cleanedData,
    originalFields: {}
  }]
         ↓
Update userModifiedRaceChanges:
  {...previous, "new_1733350400000": cleanedData}
         ↓
RacesChangesTable re-renders
         ↓
New row appears with badge "Modifié"
```

### État dans le context

Après ajout, la structure ressemble à :

```typescript
workingGroup = {
  // ... autres props
  racesChanges: [
    // Courses existantes
    {
      raceId: "40098",
      fields: { name: "Trail existant", ... },
      originalFields: { name: "Trail existant", ... }
    },
    // ← Nouvelle course ajoutée
    {
      raceId: "new_1733350400000",  // ID temporaire
      fields: {
        name: "Trail du Mont Blanc",
        categoryLevel1: "TRAIL",
        categoryLevel2: "ULTRA_TRAIL",
        runDistance: 170,
        runPositiveElevation: 8000,
        startDate: "2025-06-20T06:00:00Z"
      },
      originalFields: {}  // Pas de valeur originale
    }
  ]
}

userModifiedRaceChanges = {
  // ... modifications d'autres courses
  "new_1733350400000": {
    name: "Trail du Mont Blanc",
    categoryLevel1: "TRAIL",
    categoryLevel2: "ULTRA_TRAIL",
    runDistance: 170,
    runPositiveElevation: 8000,
    startDate: "2025-06-20T06:00:00Z"
  }
}
```

## Validation des données

### AddRaceDialog.validateForm()

Effectue les vérifications suivantes :

```typescript
const validateForm = (): boolean => {
  const newErrors: Record<string, string> = {}

  // 1. Nom requis
  if (!formData.name?.trim()) {
    newErrors.name = 'Le nom est requis'
  }

  // 2. Catégorie principale requise
  if (!formData.categoryLevel1) {
    newErrors.categoryLevel1 = 'La catégorie principale est requise'
  }

  // 3. Au moins une distance pour la catégorie
  const activeFields = getActiveFields(formData.categoryLevel1 || null)
  const hasDistance = activeFields.distances.some(field => {
    const value = formData[field as keyof RaceData]
    return value !== undefined && value !== null && value !== ''
  })

  if (!hasDistance) {
    newErrors.distance = 'Au moins une distance doit être renseignée'
  }

  setErrors(newErrors)
  return Object.keys(newErrors).length === 0
}
```

### Nettoyage avant envoi

```typescript
const cleanedData: RaceData = Object.fromEntries(
  Object.entries(formData).filter(([_, value]) =>
    value !== undefined && value !== '' && value !== null
  )
) as unknown as RaceData
```

Cela supprime :
- Les champs `undefined`
- Les strings vides
- Les `null`

## Types TypeScript

### RaceData interface

Définie dans `apps/dashboard/src/types/index.ts` :

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

### ConsolidatedRaceChange interface

Structure utilisée dans RacesChangesTable :

```typescript
interface ConsolidatedRaceChange {
  raceId: string
  fields: Record<string, any>  // Contient RaceData ou propositions
  originalFields: Record<string, any>  // Valeurs originales
}
```

## Intégration avec le backend

### Envoi au backend

Lors de la validation du bloc "Races", le backend reçoit :

```typescript
{
  proposalId: "...",
  blockKey: "races",
  userModifications: {
    "new_1733350400000": {
      name: "Trail du Mont Blanc",
      categoryLevel1: "TRAIL",
      runDistance: 170
    }
  }
}
```

### Traitement backend

Le backend doit :
1. Identifier les courses avec `raceId` commençant par `new_`
2. Créer les courses dans Miles Republic
3. Valider les distances selon categoryLevel1
4. Stocker dans la base de données

## Gestion des erreurs

### Dans AddRaceDialog

```typescript
if (isEditing) {
  // Affiche les champs éditables avec icônes de sauvegarde/annulation
} else if (errors.fieldName) {
  // Affiche le message d'erreur en rouge
  return <TextField error={true} helperText={errors.fieldName} />
}
```

### Lors de l'ajout

Le formulaire n'appelle `onAdd` que si `validateForm()` retourne `true`.

## Performance considérée

### Re-rendus

- Clic "Ajouter" → Ouvre le dialog (léger)
- Saisie dans le dialog → Re-rendu AddRaceDialog seulement (contenu)
- Clic "Ajouter" → Ferme dialog, met à jour parent (lourd mais nécessaire)

### Optimisations possibles

1. Utiliser `useMemo` pour `activeFields` → Déjà fait
2. Utiliser `useCallback` pour les handlers → À considérer
3. Lazy load les options categories → Pas nécessaire pour maintenant

## Edge cases gérés

### 1. Bloc déjà validé
```typescript
disabled={disabled || isBlockValidated}
// Le bouton et le dialog sont désactivés
```

### 2. Date héritée non disponible
```typescript
defaultStartDate={editionStartDate || ''}
helperText={defaultStartDate ? "Héritée..." : "Aucune date disponible"}
```

### 3. Réinitialisation des champs non pertinents
```typescript
allDistanceFields.forEach(field => {
  if (!newActiveFields.distances.includes(field)) {
    newFormData[field] = undefined  // Réinitialise
  }
})
```

### 4. ID temporaire unique
```typescript
const newRaceId = `new_${Date.now()}`
// Garantit unicité (même pour 2 clics rapides)
```

## Tests à effectuer

Voir `TESTING.md` pour :
- Test de validation du formulaire
- Test des champs dynamiques
- Test d'intégration avec RacesChangesTable
- Test de nettoyage des données
