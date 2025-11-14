# Fix: Distance dans le bon champ selon le type de course

**Date** : 2025-11-14  
**Auteur** : Warp AI  
**Statut** : ✅ Implémenté  

## Problème

Lorsque le FFA Scraper proposait une **randonnée** (`WALK - HIKING`) ou une **course cycliste** (`CYCLING`), l'application de la proposition mettait toujours la distance dans `runDistance` au lieu de `walkDistance` ou `bikeDistance`.

### Symptômes

```json
// ❌ AVANT - Randonnée 10km
{
  "name": "Marche nordique 10km",
  "categoryLevel1": "WALK",
  "categoryLevel2": "NORDIC_WALK",
  "runDistance": 10.0,         // ❌ Devrait être dans walkDistance
  "walkDistance": null
}

// ❌ AVANT - Course cycliste 80km
{
  "name": "Gran Fondo 80km",
  "categoryLevel1": "CYCLING",
  "categoryLevel2": "GRAN_FONDO",
  "runDistance": 80.0,         // ❌ Devrait être dans bikeDistance
  "bikeDistance": null
}
```

### Cause

**Backend - FFA Scraper** :
- Ligne 1235 : `runDistance: race.distance ? race.distance / 1000 : undefined`
- Toujours `runDistance`, peu importe le `categoryLevel1`

**Backend - Application** :
- Ligne 430 : `runDistance: editedData.distance ? parseFloat(editedData.distance) : raceData.distance`
- Toujours `runDistance`, peu importe le `categoryLevel1`

## Solution

### 1. FFA Scraper - NEW_EVENT (lignes 1232-1253)

```typescript
// ✅ Définir le bon champ de distance selon la catégorie
const distanceKm = race.distance ? race.distance / 1000 : undefined
const distanceFields: any = {}

if (categoryLevel1 === 'WALK') {
  distanceFields.walkDistance = distanceKm
  distanceFields.walkPositiveElevation = race.positiveElevation
} else if (categoryLevel1 === 'CYCLING') {
  distanceFields.bikeDistance = distanceKm
  distanceFields.bikePositiveElevation = race.positiveElevation
} else {
  // RUNNING, TRAIL, TRIATHLON, FUN, OTHER par défaut
  distanceFields.runDistance = distanceKm
  distanceFields.runPositiveElevation = race.positiveElevation
}

return {
  name: normalizedName,
  startDate: raceStartDate,
  ...distanceFields,  // ✅ Spread des bons champs
  type: race.type === 'trail' ? 'TRAIL' : 'RUNNING',
  categoryLevel1,
  categoryLevel2,
  timeZone: this.getTimezoneIANA(competition.competition.ligue)
}
```

### 2. FFA Scraper - EDITION_UPDATE (lignes 475-503)

```typescript
// ✅ Définir le bon champ de distance selon la catégorie
const distanceKm = ffaRace.distance ? ffaRace.distance / 1000 : undefined
const elevationM = ffaRace.positiveElevation

const raceData: any = {
  name: normalizedName,
  distance: distanceKm,  // Pour l'affichage frontend
  elevation: elevationM,  // Pour l'affichage frontend
  startDate: raceStartDate,
  categoryLevel1,
  categoryLevel2,
  categories: ffaRace.categories,
  timeZone: this.getTimezoneIANA(ffaData.competition.ligue)
}

// Ajouter le bon champ de distance selon la catégorie (pour l'application)
if (categoryLevel1 === 'WALK') {
  raceData.walkDistance = distanceKm
  raceData.walkPositiveElevation = elevationM
} else if (categoryLevel1 === 'CYCLING') {
  raceData.bikeDistance = distanceKm
  raceData.bikePositiveElevation = elevationM
} else {
  raceData.runDistance = distanceKm
  raceData.runPositiveElevation = elevationM
}

racesToAdd.push(raceData)
```

### 3. Application de propositions (lignes 425-473)

**Avant** :
```typescript
const racePayload: any = {
  name: editedData.name || raceData.name,
  runDistance: editedData.distance ? parseFloat(editedData.distance) : raceData.distance,  // ❌
  runPositiveElevation: editedData.elevation ? parseFloat(editedData.elevation) : raceData.elevation,  // ❌
}
```

**Après** :
```typescript
const racePayload: any = {
  name: editedData.name || raceData.name,
  startDate: editedData.startDate ? new Date(editedData.startDate) : (raceData.startDate ? new Date(raceData.startDate) : null),
  categoryLevel1: editedData.categoryLevel1 || raceData.categoryLevel1,
  categoryLevel2: editedData.categoryLevel2 || raceData.categoryLevel2,
  timeZone: editedData.timeZone || raceData.timeZone
}

// ✅ FIX: Appliquer le bon champ de distance selon le type de course
// Distance
if (editedData.distance) {
  const distance = parseFloat(editedData.distance)
  const categoryLevel1 = racePayload.categoryLevel1
  if (categoryLevel1 === 'WALK') {
    racePayload.walkDistance = distance
  } else if (categoryLevel1 === 'CYCLING') {
    racePayload.bikeDistance = distance
  } else {
    racePayload.runDistance = distance
  }
} else {
  // Utiliser les valeurs proposées par l'agent
  if (raceData.runDistance !== undefined) racePayload.runDistance = raceData.runDistance
  if (raceData.bikeDistance !== undefined) racePayload.bikeDistance = raceData.bikeDistance
  if (raceData.walkDistance !== undefined) racePayload.walkDistance = raceData.walkDistance
}

// Élévation
if (editedData.elevation) {
  const elevation = parseFloat(editedData.elevation)
  const categoryLevel1 = racePayload.categoryLevel1
  if (categoryLevel1 === 'WALK') {
    racePayload.walkPositiveElevation = elevation
  } else if (categoryLevel1 === 'CYCLING') {
    racePayload.bikePositiveElevation = elevation
  } else {
    racePayload.runPositiveElevation = elevation
  }
} else {
  // Utiliser les valeurs proposées par l'agent
  if (raceData.runPositiveElevation !== undefined) racePayload.runPositiveElevation = raceData.runPositiveElevation
  if (raceData.bikePositiveElevation !== undefined) racePayload.bikePositiveElevation = raceData.bikePositiveElevation
  if (raceData.walkPositiveElevation !== undefined) racePayload.walkPositiveElevation = raceData.walkPositiveElevation
}
```

## Résultats

### Randonnée

```json
// ✅ APRÈS - Randonnée 10km
{
  "name": "Marche nordique 10km",
  "categoryLevel1": "WALK",
  "categoryLevel2": "NORDIC_WALK",
  "walkDistance": 10.0,         // ✅ Bon champ
  "walkPositiveElevation": 150   // ✅ Bon champ
}
```

### Course cycliste

```json
// ✅ APRÈS - Course cycliste 80km
{
  "name": "Gran Fondo 80km",
  "categoryLevel1": "CYCLING",
  "categoryLevel2": "GRAN_FONDO",
  "bikeDistance": 80.0,          // ✅ Bon champ
  "bikePositiveElevation": 1200  // ✅ Bon champ
}
```

### Course à pied (comportement inchangé)

```json
// ✅ Course à pied 21.1km
{
  "name": "Semi-Marathon",
  "categoryLevel1": "RUNNING",
  "categoryLevel2": "HALF_MARATHON",
  "runDistance": 21.1,           // ✅ Bon champ
  "runPositiveElevation": 50     // ✅ Bon champ
}
```

## Impact

| Type de course | Avant | Après |
|----------------|-------|-------|
| **WALK** | ❌ `runDistance` | ✅ `walkDistance` |
| **CYCLING** | ❌ `runDistance` | ✅ `bikeDistance` |
| **RUNNING** | ✅ `runDistance` | ✅ `runDistance` (inchangé) |
| **TRAIL** | ✅ `runDistance` | ✅ `runDistance` (inchangé) |
| **TRIATHLON** | ✅ `runDistance` | ✅ `runDistance` (inchangé) |

## Cas d'usage

### Scénario 1 : Nouvelle randonnée

**FFA** : "Marche nordique de Noël - 8km"

1. **Scraper** : Détecte `categoryLevel1 = WALK`, `categoryLevel2 = NORDIC_WALK`
2. **Proposition** : `walkDistance: 8.0`, `walkPositiveElevation: 120`
3. **Application** : Race créée avec les bons champs ✅

### Scénario 2 : Nouvelle course cycliste

**FFA** : "Gran Fondo du Jura - 120km"

1. **Scraper** : Détecte `categoryLevel1 = CYCLING`, `categoryLevel2 = GRAN_FONDO`
2. **Proposition** : `bikeDistance: 120.0`, `bikePositiveElevation: 2400`
3. **Application** : Race créée avec les bons champs ✅

### Scénario 3 : Modification utilisateur

**Utilisateur édite la distance** : 120km → 115km

1. **Frontend** : `editedData.distance = 115`
2. **Application** : Détecte `categoryLevel1 = CYCLING`, remplit `bikeDistance: 115.0` ✅

## Fichiers modifiés

1. **`apps/agents/src/FFAScraperAgent.ts`**
   - Lignes 1232-1253 : NEW_EVENT
   - Lignes 475-503 : EDITION_UPDATE (racesToAdd)

2. **`packages/database/src/services/proposal-domain.service.ts`**
   - Lignes 425-473 : Application de propositions (racesToAdd)

## Tests recommandés

1. ✅ Créer une proposition NEW_EVENT pour une randonnée
2. ✅ Créer une proposition NEW_EVENT pour une course cycliste
3. ✅ Approuver et vérifier que les champs sont corrects en base
4. ✅ Vérifier l'affichage dans l'interface Miles Republic
5. ✅ Modifier manuellement la distance d'une randonnée et vérifier l'application

## Rétrocompatibilité

✅ **Aucune régression** : Les courses existantes (RUNNING, TRAIL, etc.) continuent à fonctionner normalement avec `runDistance`.

## Ressources

- `apps/agents/prisma/miles-republic.prisma` - Schéma avec tous les champs de distance
- `docs/RACE-CATEGORY-INFERENCE.md` - Algorithme d'inférence des catégories
- `docs/FIX-CATEGORY-LEVELS.md` - Historique des catégories
