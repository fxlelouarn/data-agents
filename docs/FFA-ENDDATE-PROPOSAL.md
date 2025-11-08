# Ajout de endDate dans les propositions FFA Scraper

**Date** : 2025-11-07  
**Objectif** : Proposer automatiquement `endDate = startDate` pour les compétitions FFA afin que les deux champs apparaissent dans l'interface utilisateur.

## Problème

Le FFA Scraper ne proposait que `startDate` dans les propositions, mais pas `endDate`. 

**Conséquence** :
- L'interface ne montrait pas de champ `endDate` éditable
- L'utilisateur ne pouvait pas modifier la date de fin si la compétition durait plusieurs jours
- Dans l'interface, un fallback ajoutait `endDate = startDate` mais uniquement côté frontend (lignes 305-324 de `GroupedProposalDetailBase.tsx`)

## Solution

Ajouter `endDate = startDate` **directement dans la proposition** lors de sa création par le FFA Scraper.

### 1. Propositions NEW_EVENT

**Fichier** : `apps/agents/src/FFAScraperAgent.ts`  
**Ligne** : 677

```typescript
edition: {
  new: {
    year: competition.competition.date.getFullYear().toString(),
    startDate: this.calculateEditionStartDate(competition),
    endDate: this.calculateEditionStartDate(competition), // ✅ Ajouté
    calendarStatus: 'CONFIRMED',
    races: competition.races.map(race => { ... })
  }
}
```

### 2. Propositions EDITION_UPDATE

**Fichier** : `apps/agents/src/FFAScraperAgent.ts`  
**Lignes** : 266-271

```typescript
if (dateDiff > 21600000) { // 6 heures en ms
  changes.startDate = {
    old: edition.startDate,
    new: ffaStartDate,
    confidence
  }
  // ✅ Proposer aussi endDate = startDate
  changes.endDate = {
    old: edition.endDate,
    new: ffaStartDate,
    confidence
  }
  // ...
}
```

## Résultat

### Avant

**Proposition NEW_EVENT** :
```json
{
  "edition": {
    "new": {
      "startDate": "2025-03-29T09:00:00.000Z"
      // ❌ Pas de endDate
    }
  }
}
```

**Interface utilisateur** :
- Champ `startDate` visible ✅
- Champ `endDate` ajouté par le frontend avec même valeur que `startDate` (fallback)
- Mais la modification de `endDate` n'était pas sauvegardée dans la proposition

### Après

**Proposition NEW_EVENT** :
```json
{
  "edition": {
    "new": {
      "startDate": "2025-03-29T09:00:00.000Z",
      "endDate": "2025-03-29T09:00:00.000Z"  // ✅ Présent
    }
  }
}
```

**Interface utilisateur** :
- Champ `startDate` visible ✅
- Champ `endDate` visible ✅
- Les modifications de `endDate` sont sauvegardées dans `userModifiedChanges` ✅
- Application correcte de `endDate` lors de la création de l'événement ✅

## Cas d'usage

### Compétition d'un jour (99% des cas)

La FFA propose `endDate = startDate`. L'utilisateur n'a rien à modifier.

**Résultat** : Edition avec `startDate = endDate = 2025-03-29` ✅

### Compétition de plusieurs jours (rare)

La FFA propose `endDate = startDate` par défaut, mais l'utilisateur peut modifier `endDate` dans l'interface.

**Exemple** :
1. FFA propose : `startDate = 2025-06-14`, `endDate = 2025-06-14`
2. Utilisateur modifie : `endDate = 2025-06-16` (3 jours)
3. Application : Edition avec `startDate = 2025-06-14`, `endDate = 2025-06-16` ✅

## Ajustement automatique par l'interface

L'interface ajuste automatiquement `startDate` et `endDate` en fonction des dates des courses (lignes 376-426 de `GroupedProposalDetailBase.tsx`) :

```typescript
// Si les courses ont des dates différentes
const minRaceDate = new Date(Math.min(...raceStartDates))
const maxRaceDate = new Date(Math.max(...raceStartDates))

// Ajuster automatiquement
updates.startDate = minRaceDate.toISOString()
updates.endDate = maxRaceDate.toISOString()
```

**Exemple** :
- Course 1 : 2025-06-14 à 09:00
- Course 2 : 2025-06-14 à 14:00
- Course 3 : 2025-06-15 à 09:00

**Résultat automatique** :
- `startDate` = 2025-06-14
- `endDate` = 2025-06-15

## Impact

✅ **Améliorations** :
- Les deux champs `startDate` et `endDate` sont toujours visibles dans l'interface
- L'utilisateur peut modifier `endDate` si nécessaire
- Les modifications sont correctement sauvegardées et appliquées
- Cohérence entre propositions NEW_EVENT et EDITION_UPDATE

✅ **Pas de régression** :
- Pour les compétitions d'un jour : `endDate = startDate` (comportement attendu)
- Pour les compétitions multi-jours : l'utilisateur peut éditer
- L'ajustement automatique par l'interface fonctionne toujours

🧹 **Nettoyage** :
- Suppression du fallback frontend (lignes 305-324 de `GroupedProposalDetailBase.tsx`)
- Le backend fournit désormais toujours `endDate`, pas besoin de l'ajouter côté frontend

## Références

- Issue : endDate manquante dans les propositions FFA
- Commit : Add endDate to FFA proposals (NEW_EVENT and EDITION_UPDATE)
- Fichiers modifiés : `apps/agents/src/FFAScraperAgent.ts`
