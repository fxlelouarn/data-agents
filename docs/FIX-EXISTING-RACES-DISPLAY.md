# Fix: Affichage des courses existantes dans EDITION_UPDATE

**Date** : 2025-11-19  
**Problème** : Lors de la création manuelle d'une proposition EDITION_UPDATE (bouton "Événement existant"), toutes les courses apparaissaient comme "Nouvelle" au lieu d'afficher :
- **Valeur actuelle** : Valeur de la base de données
- **Valeur proposée** : Initialement égale à la valeur actuelle (éditable par l'utilisateur)

## Symptômes

### Interface
- ✅ Colonne "Valeur actuelle" existe
- ❌ Toutes les courses affichées avec badge "Nouvelle" (vert)
- ❌ Valeurs actuelles manquantes (affichées comme `-`)
- ❌ Valeurs proposées vides au lieu d'être initialisées aux valeurs actuelles

### Structure des données
```json
// Backend renvoyait pour racesExisting:
{
  "racesExisting": {
    "new": [
      {
        "raceId": 141826,
        "raceName": "10 km",
        "runDistance": 10,
        "startDate": "2025-11-15T08:00:00.000Z"
        // ❌ Pas de currentData
        // ❌ Pas de marqueur _isExistingUnchanged
      }
    ]
  }
}
```

## Cause racine

### Backend : Données incomplètes
L'endpoint `/api/proposals/:id/convert-to-edition-update` (ligne 1518-1537) générait `racesExisting` **sans** :
1. Objet `currentData` contenant les valeurs actuelles de la base
2. Marqueur `_isExistingUnchanged: true` pour identification par le frontend

### Frontend : Détection incorrecte
Le composant `RacesChangesTable` (ligne 351) cherchait le marqueur `_isExistingUnchanged`, mais celui-ci n'était jamais transmis par le backend.

## Solution

### 1. Endpoint `/convert-to-edition-update` : Enrichir racesExisting (`apps/api/src/routes/proposals.ts`)

#### Ajouter currentData (lignes 1518-1549)
```typescript
racesExisting.push({
  raceId: matchingRace.id,
  raceName: matchingRace.name,
  // ✅ Toutes les valeurs actuelles (pour colonne "Valeur actuelle")
  currentData: {
    name: matchingRace.name,
    runDistance: matchingRace.runDistance,
    walkDistance: matchingRace.walkDistance,
    bikeDistance: matchingRace.bikeDistance,
    swimDistance: matchingRace.swimDistance,
    runPositiveElevation: matchingRace.runPositiveElevation,
    categoryLevel1: matchingRace.categoryLevel1,
    categoryLevel2: matchingRace.categoryLevel2,
    startDate: startDateIso
  },
  // ✅ Dupliquer au niveau racine pour compatibilité hook
  runDistance: matchingRace.runDistance,
  // ... autres champs
})
```

#### Ajouter marqueur (lignes 1564-1570)
```typescript
if (racesExisting.length > 0) {
  // Format avec marqueur pour que le frontend les reconnaisse
  const racesExistingWithMarker = racesExisting.map(race => ({
    ...race,
    _isExistingUnchanged: true
  }))
  editionChanges.racesExisting = { new: racesExistingWithMarker, confidence }
}
```

### 2. Frontend : Extraire currentData (`apps/dashboard/src/hooks/useProposalEditor.ts`)

#### Fonction extractRacesOriginalData (lignes 487-508)
```typescript
// ✅ Chercher racesExisting (courses sans changement)
if (changes.racesExisting && typeof changes.racesExisting === 'object') {
  const racesExistingObj = extractNewValue(changes.racesExisting)
  if (Array.isArray(racesExistingObj)) {
    racesExistingObj.forEach((raceInfo: any) => {
      const raceId = raceInfo.raceId ? raceInfo.raceId.toString() : `existing-${Math.random()}`
      // ✅ Utiliser currentData si disponible (backend enrichi), sinon niveau racine
      const source = raceInfo.currentData || raceInfo
      races[raceId] = {
        id: raceId,
        name: source.name || raceInfo.raceName || 'Course',
        startDate: source.startDate,
        runDistance: source.runDistance,
        // ... autres champs depuis currentData
      }
    })
  }
}
```

#### Fonction normalizeRace (lignes 736-768)
```typescript
const normalizeRace = (race: any, raceId: string, extractOld: boolean = false): RaceData => {
  // ...
  
  // ✅ Préserver le marqueur _isExistingUnchanged AVANT extraction
  const isExistingUnchanged = race._isExistingUnchanged === true
  
  // ... normalisation
  
  return {
    id: raceId,
    name: normalized.name || normalized.raceName || 'Course sans nom',
    // ... autres champs
    ...normalized,
    // ✅ Remettre le marqueur après le spread
    ...(isExistingUnchanged && { _isExistingUnchanged: true })
  }
}
```

### 3. Interface : Détection et affichage (`apps/dashboard/src/components/proposals/edition-update/RacesChangesTable.tsx`)

#### Déjà en place (lignes 351, 377-386, 407-410)
```typescript
const isExistingUnchanged = (race.fields as any)._isExistingUnchanged === true

// Badge statut
<Chip
  label={
    isDeleted ? "À supprimer" 
    : isExistingUnchanged ? "Info" 
    : (isNewRace ? "Nouvelle" : "Existante")
  }
  color={
    isDeleted ? "error" 
    : isExistingUnchanged ? "info" 
    : (isNewRace ? "success" : "default")
  }
/>

// Valeur proposée
{isExistingUnchanged ? (
  <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
    Aucun changement
  </Typography>
) : (
  renderEditableCell(...)
)}
```
### 2. Endpoint `/edition-update-complete` : Transformer en racesToUpdate éditables

#### Créer racesToUpdate avec tous les champs au format { old, new } (lignes 1755-1813)
```typescript
const racesToUpdate = edition.races.map((race: any) => {
  const startDateIso = race.startDate?.toISOString() || null
  
  // ✅ Créer updates avec TOUS les champs au format { old, new }
  const updates: Record<string, any> = {}
  const fields = [
    { key: 'name', dbKey: 'name' },
    { key: 'startDate', value: startDateIso },
    { key: 'runDistance', dbKey: 'runDistance' },
    // ... autres champs
  ]
  
  fields.forEach(field => {
    const value = field.value !== undefined ? field.value : race[field.dbKey || field.key]
    updates[field.key] = {
      old: value,
      new: value, // Par défaut, new = old (éditable)
      confidence: 1.0
    }
  })
  
  return {
    raceId: race.id,
    raceName: race.name,
    currentData: { /* ... */ },
    updates
  }
})

changes.racesToUpdate = { new: racesToUpdate, confidence: 1.0 }
```

### Résultats

### Avant
| Statut | Valeur actuelle | Valeur proposée |
|--------|-----------------|------------------|
| **Nouvelle** 🟢 | `-` ❌ | 10 km |
| **Nouvelle** 🟢 | `-` ❌ | Semi-Marathon 21.1 km |

### Après (conversion NEW_EVENT → EDITION_UPDATE)
| Statut | Valeur actuelle | Valeur proposée |
|--------|-----------------|------------------|
| **Info** 🔵 | 10 km ✅ | *Aucun changement* |
| **Info** 🔵 | Semi-Marathon 21.1 km ✅ | *Aucun changement* |
| **Nouvelle** 🟢 | `-` | 5 km |

### Après (création manuelle Événement existant)
| Statut | Valeur actuelle | Valeur proposée (éditable) |
|--------|-----------------|------------------|
| **Existante** ⚪ | 10 km ✅ | 10 km ✏️ |
| **Existante** ⚪ | Semi-Marathon 21.1 km ✅ | 21.1 km ✏️ |
| **Nouvelle** ✅ | `-` | 5 km |

## Flux de données

```
Backend (/convert-to-edition-update)
  ↓
  Matching des courses (distance + nom)
  ↓
  racesExisting = courses matchées SANS changement
  ├── currentData: { name, runDistance, startDate, ... }
  └── _isExistingUnchanged: true
  ↓
Frontend (useProposalEditor)
  ↓
  extractRacesOriginalData() → originalFields depuis currentData
  extractRaces() → fields avec marqueur _isExistingUnchanged
  ↓
  consolidateRacesFromProposals()
  ↓
RacesChangesTable
  ├── isExistingUnchanged = true → Badge "Info" 🔵
  ├── currentValue depuis originalFields → Colonne remplie ✅
  └── Valeur proposée → "Aucun changement" (italique gris)
```

## Tests

### Scénario de test
1. Trouver une proposition NEW_EVENT avec rejectedMatches
2. Cliquer sur "Sélectionner" pour un événement existant
3. Vérifier que la nouvelle proposition EDITION_UPDATE affiche :
   - Badge "Info" pour les courses sans changement
   - Valeurs actuelles dans la colonne correspondante
   - "Aucun changement" dans la colonne valeur proposée

### Requête SQL de vérification
```sql
-- Voir la structure racesExisting d'une proposition
SELECT 
  id,
  type,
  changes->'racesExisting' as races_existing
FROM proposals
WHERE type = 'EDITION_UPDATE'
AND changes ? 'racesExisting'
LIMIT 1;
```

## Fichiers modifiés

1. **Backend** : `apps/api/src/routes/proposals.ts`
   - **Endpoint `/convert-to-edition-update`** (lignes 1518-1570) :
     - Ajout `currentData` dans `racesExisting`
     - Ajout marqueur `_isExistingUnchanged`
   - **Endpoint `/edition-update-complete`** (lignes 1755-1813) :
     - Transformation des courses en `racesToUpdate` avec structure `{ old, new }` pour tous les champs
     - Ajout `currentData` pour afficher valeurs actuelles

2. **Frontend - Hook** : `apps/dashboard/src/hooks/useProposalEditor.ts`
   - Lignes 487-508 : Extraction `currentData` dans `extractRacesOriginalData()`
   - Lignes 736-768 : Préservation marqueur dans `normalizeRace()`

3. **Frontend - Composant** : `apps/dashboard/src/components/proposals/edition-update/RacesChangesTable.tsx`
   - Lignes 351, 377-386, 407-410 : Détection et affichage (déjà en place)

## Cas particuliers

### Course avec currentData mais sans marqueur
Si le backend envoie `currentData` mais oublie le marqueur, la course sera affichée comme "Existante" au lieu de "Info", mais les valeurs actuelles seront quand même correctes.

### Course sans currentData mais avec marqueur
Si le marqueur est présent mais pas `currentData`, la colonne "Valeur actuelle" affichera `-`, mais le badge "Info" sera correct.

## Améliorations futures

1. **Validation Zod** : Ajouter un schéma pour valider la structure de `racesExisting`
2. **Tests unitaires** : Tester `extractRacesOriginalData()` avec `currentData`
3. **Tests E2E** : Automatiser le scénario de création manuelle EDITION_UPDATE

## Ressources

- Documentation matching : `docs/FIX-RACE-MATCHING-HYBRID.md`
- Documentation rejected matches : `docs/FEATURE-REJECTED-MATCHES.md`
- Architecture propositions : `docs/DASHBOARD-PROPOSALS.md`
