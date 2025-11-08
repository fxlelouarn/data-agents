# Gestion des événements multi-jours FFA

**Date** : 2025-11-07  
**Contexte** : Découverte d'un nouveau format de page FFA pour les événements se déroulant sur plusieurs jours

## Problème résolu

Le scraper FFA gérait uniquement les événements **d'un seul jour**. Pour ces événements, la page FFA affiche :
- Une seule date : `30 Novembre 2025`
- Des courses avec uniquement l'heure : `14:00 - 1/2 Marathon`

Mais il existe également des événements **multi-jours** (exemple : [Bol d'air de Saint-Avertin](https://www.athle.fr/competitions/595846640846284843787840217846269843)) qui utilisent un format différent :
- Plage de dates : `17 au 18 Janvier 2026`
- Courses avec date ET heure : `17/01 18:30 - Bol d'air de saint-av 9 km by night`

## Solution implémentée

### 1. Extraction de la plage de dates

**Localisation** : `apps/agents/src/ffa/parser.ts` ligne 105-130

Le parser détecte le format `"17 au 18 Janvier 2026"` et extrait :
- `startDate` : Date de début de l'événement (17/01/2026)
- `endDate` : Date de fin de l'événement (18/01/2026)

```typescript
const dateRangeText = $('.body-small.text-dark-grey').first().text().trim()
const dateRangeMatch = dateRangeText.match(/(\d{1,2})\s+au\s+(\d{1,2})\s+(\w+)(?:\s+(\d{4}))?/)

if (dateRangeMatch) {
  details.startDate = new Date(Date.UTC(year, month, startDay, 0, 0, 0, 0))
  details.endDate = new Date(Date.UTC(year, month, endDay, 0, 0, 0, 0))
}
```

**Gestion de l'année** :
- Si présente : `17 au 18 Janvier 2026` → année 2026
- Si absente : `17 au 18 janvier` → année déduite de `competition.date.getFullYear()`

### 2. Extraction des courses avec date

**Localisation** : `apps/agents/src/ffa/parser.ts` ligne 240-254

Le parser détecte le format `"17/01 18:30"` et extrait :
- `raceDate` : Jour du mois (ex: `"17/01"`)
- `startTime` : Heure de départ (ex: `"18:30"`)

```typescript
const dateMatch = raceTitle.match(/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2})/)

if (dateMatch) {
  // Format multi-jours: "17/01 18:30"
  raceDate = `${dateMatch[1]}/${dateMatch[2]}`
  startTime = `${dateMatch[3]}:${dateMatch[4]}`
} else {
  // Format 1 jour: "14:00"
  const timeMatch = raceTitle.match(/(\d{1,2}):(\d{2})/)
  startTime = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : undefined
}
```

### 3. Nouveaux champs dans les types

**Fichier** : `apps/agents/src/ffa/types.ts`

#### FFACompetitionDetails

```typescript
export interface FFACompetitionDetails {
  // ... autres champs
  
  /** Date de début (égale à endDate pour événements 1 jour) */
  startDate: Date
  
  /** Date de fin (égale à startDate pour événements 1 jour) */
  endDate: Date
}
```

**Important** : Ces champs sont **toujours définis** :
- Événement 1 jour : `startDate = endDate = competition.date`
- Événement multi-jours : `startDate ≠ endDate`

#### FFARace

```typescript
export interface FFARace {
  // ... autres champs
  
  /** Date de la course (pour événements multi-jours, format: "17/01") */
  raceDate?: string
  
  /** Heure de départ (ex: "10:00") */
  startTime?: string
}
```

## Exemples concrets

### Événement 1 jour (format existant)

**Page** : Semi-Marathon du Grand Nancy

**HTML** :
```html
<p class="body-small text-dark-grey">29 Mars 2025</p>
<h3>09:00 - 1/2 Marathon</h3>
```

**Résultat** :
```typescript
{
  startDate: new Date('2025-03-29T00:00:00.000Z'),  // = competition.date
  endDate: new Date('2025-03-29T00:00:00.000Z'),    // = competition.date
  races: [{
    raceDate: undefined,  // Pas de date spécifique par course
    startTime: "09:00",
    name: "1/2 Marathon"
  }]
}
```

### Événement multi-jours (nouveau format)

**Page** : [Bol d'air de Saint-Avertin](https://www.athle.fr/competitions/595846640846284843787840217846269843)

**HTML** :
```html
<p class="body-small text-dark-grey">17 au 18 Janvier 2026</p>

<h3>17/01 18:30 - Bol d'air de saint-av 9 km by night</h3>
<h3>18/01 09:30 - Course HS non officielle</h3>
<h3>18/01 10:30 - Bol d'air de saint-av 13 km</h3>
```

**Résultat** :
```typescript
{
  startDate: new Date('2026-01-17T00:00:00.000Z'),
  endDate: new Date('2026-01-18T00:00:00.000Z'),
  races: [
    {
      raceDate: "17/01",
      startTime: "18:30",
      name: "Bol d'air de saint-av 9 km by night"
    },
    {
      raceDate: "18/01",
      startTime: "09:30",
      name: "Course HS non officielle"
    },
    {
      raceDate: "18/01",
      startTime: "10:30",
      name: "Bol d'air de saint-av 13 km"
    }
  ]
}
```

## Rétrocompatibilité

✅ **Le format existant reste supporté** : Les événements d'un seul jour continuent de fonctionner.

**Changement de comportement** :
- **Avant** : `startDate` et `endDate` étaient `undefined` pour événements 1 jour
- **Maintenant** : `startDate = endDate = competition.date` pour événements 1 jour

**Avantage** : Le code consommateur n'a plus besoin de gérer le cas `undefined`, les dates sont toujours présentes.

**Migration** :
```typescript
// ❌ Avant (il fallait gérer undefined)
const start = details.startDate ?? competition.date
const end = details.endDate ?? competition.date

// ✅ Maintenant (toujours défini)
const start = details.startDate
const end = details.endDate
```

## Tests

**Fichier** : `apps/agents/src/ffa/__tests__/parser.multi-day.test.ts`

Tests couvrant :
- ✅ Extraction de `startDate` et `endDate`
- ✅ Déduction de l'année depuis `competition.date`
- ✅ Extraction de `raceDate` et `startTime`
- ✅ Gestion de plusieurs courses sur différents jours
- ✅ Rétrocompatibilité avec format 1 jour

## Impact sur le reste du code

### FFAScraperAgent

**TODO** : Adapter la création de propositions pour :
1. Utiliser `startDate`/`endDate` si présentes au lieu de `competition.date`
2. Associer chaque `FFARace` à sa date réelle via `raceDate`

### Matching

**Pas d'impact** : L'algorithme de matching se base déjà sur `edition.startDate` qui sera correctement renseignée.

### Application de propositions

**TODO** : Vérifier que les propositions `NEW_EVENT` et `EDITION_UPDATE` gèrent correctement `endDate` différent de `startDate`.

## Ressources

- **Page FFA exemple** : https://www.athle.fr/competitions/595846640846284843787840217846269843
- **Tests** : `apps/agents/src/ffa/__tests__/parser.multi-day.test.ts`
- **Types** : `apps/agents/src/ffa/types.ts`
- **Parser** : `apps/agents/src/ffa/parser.ts`
