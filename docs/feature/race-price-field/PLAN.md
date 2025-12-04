# Feature: Race Price Field

## Objectif
Ajouter la possibilité d'afficher et d'éditer le prix d'une course dans la RacesChangesTable.

## Analyse

### État actuel
- Le champ `price` existe déjà dans l'interface `RaceData` (`types/index.ts`)
- Le champ n'est pas inclus dans `RACE_FIELDS` de `RacesChangesTable.tsx`
- Le système de modification utilisateur (userModifiedRaceChanges) supporte déjà les champs arbitraires

### Fichiers à modifier

1. **`apps/dashboard/src/components/proposals/edition-update/RacesChangesTable.tsx`**
   - Ajouter `price` dans le tableau `RACE_FIELDS`
   - Format d'affichage: `X €` ou `-` si vide

## Implémentation

### Modification de RACE_FIELDS

```typescript
const RACE_FIELDS = [
  { key: 'name', label: 'Nom', format: (v: any) => v || '-' },
  { key: 'startDate', label: 'Date/Heure', format: (v: any) => ... },
  { key: 'categoryLevel1', label: 'Catégorie', format: (v: any) => ... },
  { key: 'categoryLevel2', label: 'Sous-catégorie', format: (v: any) => ... },
  { key: 'runDistance', label: 'Distance course', format: (v: any) => ... },
  { key: 'bikeDistance', label: 'Distance vélo', format: (v: any) => ... },
  { key: 'walkDistance', label: 'Distance marche', format: (v: any) => ... },
  { key: 'runPositiveElevation', label: 'D+ course', format: (v: any) => ... },
  // NOUVEAU
  { key: 'price', label: 'Prix', format: (v: any) => v != null ? `${v} €` : '-' }
]
```

### Comportement d'édition
Le champ `price` sera édité via un `TextField` standard (type numérique), comme les autres champs numériques (distances, dénivelé).

## Tests
- Vérifier l'affichage du prix dans la table
- Vérifier l'édition du prix
- Vérifier la sauvegarde via userModifiedRaceChanges
- Build du projet sans erreurs
