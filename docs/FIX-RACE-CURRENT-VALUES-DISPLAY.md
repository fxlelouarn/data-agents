# Fix: Affichage des valeurs actuelles des courses existantes

**Date**: 2025-11-18  
**Commit**: `2d3caa8`

## Problème

Les valeurs actuelles (`categoryLevel1`, `categoryLevel2`, `runDistance`, `walkDistance`, `bikeDistance`, `swimDistance`, `runPositiveElevation`) des courses existantes ne s'affichaient **pas** dans la colonne "Valeur actuelle" du tableau `RacesChangesTable`.

### Symptômes

Pour la proposition `cmi3u5f4q04xbjpjm9ujzs58i` (Event 3857, Edition 39659) :
- ✅ Colonne "Valeur proposée" : Affichait les nouvelles valeurs (ex: `startDate`)
- ❌ Colonne "Valeur actuelle" : Vide ou affichait uniquement `-`
- ❌ Impossibilité de comparer visuellement les changements

```
┌──────────┬─────────────────┬────────────────┬──────────────────┐
│ Statut   │ Champ           │ Valeur actuelle│ Valeur proposée  │
├──────────┼─────────────────┼────────────────┼──────────────────┤
│ Existante│ categoryLevel1  │ -              │ TRAIL            │  ❌
│ Existante│ categoryLevel2  │ -              │ DISCOVERY_TRAIL  │  ❌
│ Existante│ Distance course │ -              │ 20.8 km          │  ❌
│ Existante│ startDate       │ 01/11/2025...  │ 02/11/2025...    │  ✅
└──────────┴─────────────────┴────────────────┴──────────────────┘
```

## Cause racine

Le problème était un **triple défaut de synchronisation** entre l'agent, le backend et le frontend.

### 1. Agent FFA - Champs manquants dans currentData

L'agent FFA proposait des modifications dans `racesToUpdate[].updates` mais n'incluait **pas tous les champs** dans `racesToUpdate[].currentData`.

**Fichier**: `apps/agents/src/FFAScraperAgent.ts` (lignes 644-652)

```typescript
// ❌ AVANT (incomplet)
currentData: {
  name: matchingRace.name,
  startDate: matchingRace.startDate,
  runDistance: matchingRace.runDistance,
  runPositiveElevation: matchingRace.runPositiveElevation,
  categoryLevel1: matchingRace.categoryLevel1,
  categoryLevel2: matchingRace.categoryLevel2,
  timeZone: matchingRace.timeZone
  // ❌ Manque: walkDistance, swimDistance, bikeDistance
}
```

**Impact**: Les nouvelles propositions FFA n'avaient pas toutes les valeurs actuelles.

### 2. Backend - Absence d'enrichissement pour les vieilles propositions

Les propositions créées **avant ce fix** (ex: GoogleSearchDateAgent, vieux FFA) n'avaient **pas** de `currentData` du tout dans la base de données.

Le backend récupérait bien les courses existantes via `existingRaces` (ligne 549-569 de `proposals.ts`), mais ne **fusionnait pas** ces données dans `racesToUpdate[].currentData`.

**Fichier**: `apps/api/src/routes/proposals.ts` (lignes 571-601)

```typescript
// ❌ AVANT (pas d'enrichissement)
const racesToUpdate = proposal.changes?.racesToUpdate?.new || []
// Les vieilles propositions avaient racesToUpdate[].currentData === undefined

enriched.existingRaces = existingRaces.map((race: any) => {
  // ✅ existingRaces était bien rempli
  return { id, name, categoryLevel1, categoryLevel2, ... }
})
// ❌ Mais pas injecté dans racesToUpdate
```

**Impact**: Les propositions anciennes n'avaient aucune valeur actuelle disponible.

### 3. Frontend - Clés incompatibles entre les fonctions

Le hook `useProposalEditor` utilisait des **clés différentes** dans deux fonctions critiques :

**Fonction 1**: `extractRacesOriginalData()` (ligne 455)
```typescript
// ❌ AVANT - Utilisait le raceId brut
const raceId = raceUpdate.raceId ? raceUpdate.raceId.toString() : `update-${Math.random()}`
races[raceId] = { ... } // Ex: races["140638"] = { ... }
```

**Fonction 2**: `extractRaces()` (ligne 655)
```typescript
// ✅ Utilisait existing-{index}
const raceId = `existing-${index}`
races[raceId] = { ... } // Ex: races["existing-0"] = { ... }
```

**Fonction 3**: `consolidateRacesFromProposals()` (ligne 537)
```typescript
originalFields: originalRaces[raceId] || {}
// ❌ Tentait de lire originalRaces["existing-0"]
// ❌ Mais originalRaces contenait "140638", pas "existing-0"
// ❌ Résultat: originalFields = {} (toujours vide)
```

**Impact**: Même avec `currentData` disponible, le frontend ne pouvait pas le lire.

## Solution

### 1. Agent FFA - Ajout des champs manquants

**Fichier**: `apps/agents/src/FFAScraperAgent.ts`

```typescript
// ✅ APRÈS (complet)
currentData: {
  name: matchingRace.name,
  startDate: matchingRace.startDate,
  runDistance: matchingRace.runDistance,
  walkDistance: matchingRace.walkDistance,     // ✅ AJOUTÉ
  swimDistance: matchingRace.swimDistance,     // ✅ AJOUTÉ
  bikeDistance: matchingRace.bikeDistance,     // ✅ AJOUTÉ
  runPositiveElevation: matchingRace.runPositiveElevation,
  categoryLevel1: matchingRace.categoryLevel1,
  categoryLevel2: matchingRace.categoryLevel2,
  timeZone: matchingRace.timeZone
}
```

**Lignes modifiées**: 648-650, 724-726

### 2. Backend - Injection de currentData pour les vieilles propositions

**Fichier**: `apps/api/src/routes/proposals.ts`

```typescript
// ✅ APRÈS (enrichissement automatique)

// 1. Créer un map race.id -> currentData complet
const raceDataMap = new Map(
  existingRaces.map((race: any) => [
    race.id,
    {
      name: race.name,
      runDistance: race.runDistance,
      walkDistance: race.walkDistance,
      swimDistance: race.swimDistance,
      bikeDistance: race.bikeDistance,
      runPositiveElevation: race.runPositiveElevation,
      startDate: race.startDate,
      categoryLevel1: race.categoryLevel1,
      categoryLevel2: race.categoryLevel2
    }
  ])
)

// 2. Enrichir racesToUpdate avec currentData si absent
const enrichedRacesToUpdate = racesToUpdate.map((update: any) => {
  const raceId = typeof update.raceId === 'string' ? parseInt(update.raceId) : update.raceId
  const currentData = raceDataMap.get(raceId)
  
  return {
    ...update,
    currentData: update.currentData || currentData || null // ✅ Fallback
  }
})

// 3. Mettre à jour la proposition avec les données enrichies
if (enriched.changes?.racesToUpdate && enrichedRacesToUpdate.length > 0) {
  enriched.changes = {
    ...enriched.changes,
    racesToUpdate: {
      ...enriched.changes.racesToUpdate,
      new: enrichedRacesToUpdate
    }
  }
}
```

**Lignes ajoutées**: 582-622

**Avantages**:
- ✅ Les propositions anciennes sont enrichies automatiquement
- ✅ Les nouvelles propositions FFA gardent leur `currentData` (pas écrasé)
- ✅ Rétrocompatible - aucune migration de données nécessaire

### 3. Frontend - Harmonisation des clés

**Fichier**: `apps/dashboard/src/hooks/useProposalEditor.ts`

```typescript
// ✅ APRÈS (clés harmonisées)
const extractRacesOriginalData = (proposal: Proposal): Record<string, RaceData> => {
  const races: Record<string, RaceData> = {}
  
  if (changes.racesToUpdate && typeof changes.racesToUpdate === 'object') {
    const racesToUpdateObj = extractNewValue(changes.racesToUpdate)
    if (Array.isArray(racesToUpdateObj)) {
      racesToUpdateObj.forEach((raceUpdate: any, index: number) => {
        // ✅ FIX: Utiliser existing-{index} pour matcher avec extractRaces()
        const raceId = `existing-${index}`
        
        if (raceUpdate.currentData && typeof raceUpdate.currentData === 'object') {
          races[raceId] = { // ✅ Maintenant compatible avec extractRaces()
            id: raceId,
            name: raceUpdate.currentData.name || raceUpdate.raceName || 'Course',
            startDate: raceUpdate.currentData.startDate,
            runDistance: raceUpdate.currentData.runDistance,
            bikeDistance: raceUpdate.currentData.bikeDistance,
            walkDistance: raceUpdate.currentData.walkDistance,
            swimDistance: raceUpdate.currentData.swimDistance,
            runPositiveElevation: raceUpdate.currentData.runPositiveElevation,
            categoryLevel1: raceUpdate.currentData.categoryLevel1,
            categoryLevel2: raceUpdate.currentData.categoryLevel2,
            timeZone: raceUpdate.currentData.timeZone
          }
        }
      })
    }
  }
  
  return races
}
```

**Ligne modifiée**: 456 (ajout du paramètre `index`)

## Résultats

### Avant le fix

```
GET /api/proposals/cmi3u5f4q04xbjpjm9ujzs58i

{
  "changes": {
    "racesToUpdate": {
      "new": [
        {
          "raceId": "140638",
          "raceName": "Trail 20 km",
          "currentData": {  // ❌ Incomplet
            "name": "Trail 20 km",
            "startDate": "...",
            "runDistance": 20.8,
            "categoryLevel1": "TRAIL",
            "categoryLevel2": "DISCOVERY_TRAIL"
            // ❌ Manque: walkDistance, swimDistance, bikeDistance
          },
          "updates": {
            "startDate": { "old": "...", "new": "..." }
          }
        }
      ]
    }
  }
}
```

**Frontend** :
- `extractRacesOriginalData()` → `originalRaces["140638"]` ✅
- `extractRaces()` → `races["existing-0"]` ✅
- `consolidateRacesFromProposals()` → `originalRaces["existing-0"]` ❌ **INTROUVABLE**
- **Résultat** : `originalFields = {}` (vide)

### Après le fix

```
GET /api/proposals/cmi3u5f4q04xbjpjm9ujzs58i

{
  "changes": {
    "racesToUpdate": {
      "new": [
        {
          "raceId": "140638",
          "raceName": "Trail 20 km",
          "currentData": {  // ✅ Complet (enrichi par le backend)
            "name": "Trail 20 km",
            "startDate": "2025-11-01T23:00:00.000Z",
            "runDistance": 20.8,
            "walkDistance": 0,           // ✅ AJOUTÉ
            "swimDistance": 0,           // ✅ AJOUTÉ
            "bikeDistance": 0,           // ✅ AJOUTÉ
            "runPositiveElevation": 440,
            "categoryLevel1": "TRAIL",
            "categoryLevel2": "DISCOVERY_TRAIL"
          },
          "updates": {
            "startDate": { "old": "...", "new": "..." }
          }
        }
      ]
    }
  }
}
```

**Frontend** :
- `extractRacesOriginalData()` → `originalRaces["existing-0"]` ✅
- `extractRaces()` → `races["existing-0"]` ✅
- `consolidateRacesFromProposals()` → `originalRaces["existing-0"]` ✅ **TROUVÉ**
- **Résultat** : `originalFields = { categoryLevel1: "TRAIL", ... }` ✅

### Affichage final

```
┌──────────┬─────────────────┬────────────────┬──────────────────┐
│ Statut   │ Champ           │ Valeur actuelle│ Valeur proposée  │
├──────────┼─────────────────┼────────────────┼──────────────────┤
│ Existante│ categoryLevel1  │ TRAIL          │ TRAIL            │  ✅
│ Existante│ categoryLevel2  │ DISCOVERY_TRAIL│ DISCOVERY_TRAIL  │  ✅
│ Existante│ Distance course │ 20.8 km        │ 20.8 km          │  ✅
│ Existante│ Distance marche │ 0 km           │ 0 km             │  ✅
│ Existante│ startDate       │ 01/11/2025...  │ 02/11/2025...    │  ✅
└──────────┴─────────────────┴────────────────┴──────────────────┘
```

## Impact

### Propositions concernées

- ✅ **Toutes les propositions EDITION_UPDATE** avec `racesToUpdate`
- ✅ **Propositions anciennes** (enrichies automatiquement par le backend)
- ✅ **Nouvelles propositions FFA** (incluent tous les champs nécessaires)

### Rétrocompatibilité

- ✅ Aucune migration de base de données nécessaire
- ✅ Les propositions existantes sont enrichies dynamiquement via l'API
- ✅ Les nouvelles propositions FFA incluent `currentData` complet dès la création

### Performance

- ⚠️ **Impact négligeable** : L'enrichissement backend existait déjà (ligne 549-569)
- ✅ **Pas de requête SQL supplémentaire** : Utilisation des données `existingRaces` déjà récupérées
- ✅ **Cache existant** : Le cache `enrichmentCache` fonctionne toujours

## Tests manuels

### 1. Proposition ancienne sans currentData

```bash
# Vérifier qu'une vieille proposition (GoogleSearchDateAgent) affiche les valeurs actuelles
curl -s "http://localhost:4001/api/proposals/cmi3ptxgd0079jp4nxzmrgmee" \
  | jq '.data.changes.racesToUpdate.new[0].currentData'

# Résultat attendu: Objet complet avec tous les champs
```

### 2. Nouvelle proposition FFA

```bash
# Scraper FFA pour créer une nouvelle proposition
npm run agents:run ffa-scraper -- --ligue ARA --month 2025-12

# Vérifier que currentData est complet dès la création
psql "$DATABASE_URL" -c "
SELECT changes->'racesToUpdate'->'new'->0->'currentData' 
FROM proposals 
WHERE \"agentId\" = 'ffa-scraper' 
ORDER BY \"createdAt\" DESC 
LIMIT 1;"
```

### 3. Interface dashboard

1. Ouvrir une proposition EDITION_UPDATE avec courses existantes
2. Vérifier que la colonne "Valeur actuelle" affiche toutes les valeurs
3. Comparer visuellement avec la colonne "Valeur proposée"

## Fichiers modifiés

| Fichier | Lignes | Description |
|---------|--------|-------------|
| `apps/agents/src/FFAScraperAgent.ts` | 648-650, 724-726 | Ajout walkDistance, swimDistance, bikeDistance |
| `apps/api/src/routes/proposals.ts` | 582-622 | Injection currentData depuis existingRaces |
| `apps/dashboard/src/hooks/useProposalEditor.ts` | 456 | Utilisation de existing-{index} |

## Références

- Documentation système existing-X : `docs/FIX-DATE-PROPAGATION-RACES.md`
- Gestion des courses : `docs/RACES-MANAGEMENT.md`
- Architecture enrichissement : `docs/PERF-ENRICHMENT-CACHE.md`
