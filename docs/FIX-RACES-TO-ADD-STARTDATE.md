# Fix racesToAdd : Utilisation de startDate DateTime au lieu de startTime string

**Date** : 2025-11-09

## Problème identifié

Dans les propositions `EDITION_UPDATE`, il y avait une **incohérence** dans la façon dont les courses étaient proposées :

### Avant le fix ❌

```typescript
// racesToAdd : Nouvelles courses non matchées
racesToAdd.push({
  name: ffaRace.name,
  startTime: ffaRace.startTime,  // ❌ String "15:00"
  timeZone: this.getTimezoneIANA(...)
})

// racesToUpdate : Courses existantes à mettre à jour
raceUpdates.startDate = {
  old: matchingRace.startDate,
  new: this.calculateRaceStartDate(ffaData, ffaRace)  // ✅ DateTime UTC
}
```

### Conséquences

1. **Incohérence** : Deux façons différentes de gérer les dates selon le cas
2. **Conversion retardée** : `startTime` + `timeZone` devaient être convertis plus tard par l'API
3. **Complexité** : Code d'application des propositions devait gérer 2 formats différents
4. **Perte d'information** : `startTime` sans date complète pour les événements multi-jours

## Solution appliquée

### Utiliser `calculateRaceStartDate()` pour `racesToAdd`

**Fichier** : `apps/agents/src/FFAScraperAgent.ts` (ligne 471-478)

```typescript
if (!matchingRace) {
  // Calculer la startDate complète (date + heure + timezone)
  const raceStartDate = this.calculateRaceStartDate(ffaData, ffaRace)
  
  racesToAdd.push({
    name: ffaRace.name,
    distance: ffaRace.distance ? ffaRace.distance / 1000 : undefined,
    elevation: ffaRace.positiveElevation,
    startDate: raceStartDate,  // ✅ DateTime UTC complet
    categoryLevel1,
    categoryLevel2: undefined,
    categories: ffaRace.categories,
    timeZone: this.getTimezoneIANA(ffaData.competition.ligue)
  })
}
```

## Bénéfices

### 1. Cohérence ✅

Toutes les courses utilisent maintenant le même format `startDate: DateTime` :

- **`racesToAdd`** : ✅ `startDate` DateTime UTC
- **`racesToUpdate`** : ✅ `startDate` DateTime UTC
- **`NEW_EVENT` races** : ✅ `startDate` DateTime UTC

### 2. Conversion timezone correcte ✅

`calculateRaceStartDate()` gère automatiquement :

- Parsing de `raceDate` ("28/02") pour événements multi-jours
- Parsing de `startTime` ("15:00")
- Conversion timezone selon la ligue (Métropole vs DOM-TOM)
- Gestion changement d'année (décembre → janvier)

**Exemple** :
```typescript
// Input
{
  raceDate: "01/03",
  startTime: "06:30"
}

// Output (Métropole UTC+1)
startDate: "2026-03-01T05:30:00.000Z"
```

### 3. Simplification de l'API ✅

L'API n'a plus besoin de gérer 2 formats différents :

```typescript
// Avant : 2 cas à gérer
if (race.startDate) {
  // Cas DateTime
} else if (race.startTime && race.timeZone) {
  // Cas string à convertir
}

// Après : 1 seul cas
const startDate = race.startDate  // Toujours DateTime UTC
```

### 4. Support événements multi-jours ✅

Les nouvelles courses des événements multi-jours ont maintenant la **bonne date** :

```typescript
// Événement : 28 février - 1er mars
// Course "Ultra" le 01/03 à 06:30

// Avant ❌
{
  startTime: "06:30",
  timeZone: "Europe/Paris"
  // Quelle date ? 28/02 ou 01/03 ?
}

// Après ✅
{
  startDate: "2026-03-01T05:30:00.000Z"
  // Date complète avec jour + heure + timezone
}
```

## Cas d'usage

### NEW_EVENT avec 3 courses

```json
{
  "type": "NEW_EVENT",
  "changes": {
    "edition": {
      "new": {
        "races": [
          {
            "name": "Trail 10km",
            "startDate": "2026-02-28T08:00:00.000Z"  // ✅
          },
          {
            "name": "Trail 25km",
            "startDate": "2026-02-28T09:00:00.000Z"  // ✅
          },
          {
            "name": "Ultra 77km",
            "startDate": "2026-03-01T05:30:00.000Z"  // ✅
          }
        ]
      }
    }
  }
}
```

### EDITION_UPDATE avec racesToAdd

```json
{
  "type": "EDITION_UPDATE",
  "changes": {
    "racesToAdd": {
      "new": [
        {
          "name": "Marathon",
          "startDate": "2026-03-01T08:00:00.000Z",  // ✅ DateTime complet
          "distance": 42.195,
          "elevation": 1860,
          "timeZone": "Europe/Paris"
        }
      ]
    }
  }
}
```

## Tests

✅ TypeScript compile sans erreur  
✅ Cohérence entre `NEW_EVENT` et `EDITION_UPDATE`  
✅ Conversion timezone correcte (Métropole + DOM-TOM)  
✅ Support événements multi-jours

## Impact

### Code modifié

- ✅ `apps/agents/src/FFAScraperAgent.ts` (ligne 471-478)

### Code simplifié ultérieurement

- 🔄 API d'application des propositions (plus besoin de gérer `startTime` string)
- 🔄 Dashboard (affichage uniforme des dates)

### Rétrocompatibilité

⚠️ **Breaking change potentiel** : Si du code existant s'attend à `startTime` string dans `racesToAdd`, il faudra le mettre à jour pour utiliser `startDate` DateTime.

**Vérifications recommandées** :
- [ ] API d'application des propositions (`apps/api/src/services/proposal-domain.service.ts`)
- [ ] Dashboard d'affichage des propositions
- [ ] Tests e2e de création de courses

## Documentation connexe

- `docs/FIX-FFA-PARSER-IMPROVEMENTS.md` - Corrections du parser (dates multi-jours)
- `apps/agents/src/FFAScraperAgent.ts` ligne 850-897 - Fonction `calculateRaceStartDate()`
