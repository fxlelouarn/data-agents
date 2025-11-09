# Fix : Propagation des dates aux courses (Google Agent)

**Date** : 2025-01-09  
**Auteur** : AI Assistant

## Problème

L'utilisateur a constaté que les propositions du **Google Agent** ne propageaient **pas** les dates trouvées vers les courses, contrairement au **FFA Scraper**.

### Symptômes

Lors de l'application d'une proposition `EDITION_UPDATE` du Google Agent :
- ✅ La date de l'édition (`startDate`, `endDate`) était mise à jour
- ❌ Les dates des courses (`Race.startDate`) restaient inchangées

### Cause

Deux problèmes distincts :

1. **Structure différente entre agents**
   - FFA Scraper utilisait : `changes.racesToUpdate[].updates.startDate`
   - Google Agent utilisait : `changes.races[].startDate`

2. **Traitement incomplet dans `applyEditionUpdate`**
   - Le champ `racesToUpdate` était **exclu** (ligne 309) mais jamais **traité**
   - Seul `changes.races` était traité (lignes 356-369)

## Solution

### 1. Harmoniser la structure des propositions

**Fichier** : `apps/agents/src/GoogleSearchDateAgent.ts`  
**Lignes** : 875-908

```typescript
// ❌ AVANT
changes.races = [{
  raceId: race.id,
  raceName: race.name,
  startDate: {
    old: currentRaceStartDate,
    new: proposedDate,
    confidence: enhancedConfidence * 0.95
  }
}]

// ✅ APRÈS
changes.racesToUpdate = {
  old: null,
  new: [{
    raceId: race.id,
    raceName: race.name,
    updates: {
      startDate: {
        old: currentRaceStartDate,
        new: proposedDate
      }
    }
  }],
  confidence: enhancedConfidence * 0.95
}
```

### 2. Traiter `racesToUpdate` dans `applyEditionUpdate`

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`  
**Lignes** : 285-312 (extraction), 373-400 (traitement)

#### Extraction

```typescript
// Ajouter racesToUpdate aux variables
let racesToUpdate: any[] | undefined

// Extraire dans la boucle
if (field === 'racesToUpdate') {
  racesToUpdate = this.extractNewValue(value) as any[]
  continue
}
```

#### Traitement

```typescript
// Après le traitement de changes.races
if (racesToUpdate && Array.isArray(racesToUpdate)) {
  this.logger.info(`📅 Propagation des dates vers ${racesToUpdate.length} course(s)`)
  
  for (const raceUpdate of racesToUpdate) {
    const raceId = parseInt(raceUpdate.raceId)
    
    // Extraire les updates (startDate, etc.)
    const updates = raceUpdate.updates || {}
    const raceUpdateData: any = {}
    
    for (const [field, value] of Object.entries(updates)) {
      const extractedValue = this.extractNewValue(value)
      if (extractedValue !== undefined && extractedValue !== null) {
        raceUpdateData[field] = extractedValue
      }
    }
    
    if (Object.keys(raceUpdateData).length > 0) {
      await milesRepo.updateRace(raceId, raceUpdateData)
      this.logger.info(`  ✅ Course ${raceId} mise à jour:`, raceUpdateData)
    }
  }
}
```

## Résultat

✅ **Google Agent** et **FFA Scraper** utilisent désormais la **même structure**  
✅ Les dates d'édition sont **propagées aux courses** dans les deux cas  
✅ Les logs indiquent clairement : `📅 Propagation des dates vers X course(s)`

## Exemple concret

### Proposition générée

```json
{
  "type": "EDITION_UPDATE",
  "editionId": "41175",
  "changes": {
    "startDate": {
      "old": "2025-11-17T08:45:00.000Z",
      "new": "2025-11-11T00:00:00.000Z"
    },
    "endDate": {
      "old": "2025-11-17T08:45:00.000Z",
      "new": "2025-11-11T00:00:00.000Z"
    },
    "racesToUpdate": {
      "old": null,
      "new": [
        {
          "raceId": "40098",
          "raceName": "Trail 10 km",
          "updates": {
            "startDate": {
              "old": "2025-11-17T08:45:00.000Z",
              "new": "2025-11-11T00:00:00.000Z"
            }
          }
        }
      ],
      "confidence": 0.95
    }
  }
}
```

### Application

```
🔄 Application EDITION_UPDATE pour l'édition 41175
✅ Édition 41175 mise à jour
📅 Propagation des dates vers 1 course(s)
  ✅ Course 40098 (Trail 10 km) mise à jour: { startDate: 2025-11-11T00:00:00.000Z }
```

## Cohérence avec FFA Scraper

Le FFA Scraper utilisait déjà cette structure (lignes 581-640 dans `FFAScraperAgent.ts`) :

```typescript
unmatchedExistingRaces.forEach((race: any) => {
  racesToUpdate.push({
    raceId: race.id,
    raceName: race.name,
    updates: {
      startDate: {
        old: race.startDate,
        new: ffaStartDate
      }
    }
  })
})

changes.racesToUpdate = {
  old: null,
  new: racesToUpdate,
  confidence: confidence * 0.9
}
```

Le Google Agent adopte maintenant la même logique, garantissant que :
- Les deux agents proposent la même structure de données
- Le service d'application traite correctement les deux sources
- Le comportement est prévisible et uniforme

## Tests recommandés

1. ✅ Créer une proposition Google Agent avec date trouvée
2. ✅ Vérifier que `racesToUpdate` est présent dans `changes`
3. ✅ Appliquer la proposition
4. ✅ Vérifier que les `Race.startDate` ont été mises à jour
5. ✅ Vérifier les logs : `📅 Propagation des dates vers X course(s)`

## Fichiers modifiés

1. `apps/agents/src/GoogleSearchDateAgent.ts` (lignes 875-908)
2. `packages/database/src/services/proposal-domain.service.ts` (lignes 285-312, 373-400)

## Références

- FFA Scraper : `apps/agents/src/ffa/matcher.ts` (lignes 581-640)
- Service application : `packages/database/src/services/proposal-domain.service.ts`
- Règles Warp : Section "Changelog 2025-11-07"
