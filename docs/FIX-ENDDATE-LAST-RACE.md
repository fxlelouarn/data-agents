# Fix: Calcul de `endDate` depuis la dernière course

**Date** : 2025-11-10  
**Auteur** : FX  
**Contexte** : Correction de la logique de calcul de `edition.endDate`

## Problème

Avant ce fix, `edition.endDate` était **toujours égale à `startDate`** (date de la première course), même pour les événements multi-jours ou avec plusieurs courses étalées dans la journée.

### Comportement incorrect

```typescript
// ❌ AVANT
edition: {
  startDate: calculateEditionStartDate(competition),  // 09:00 première course
  endDate: calculateEditionStartDate(competition),    // 09:00 première course (incorrect !)
}
```

**Exemple concret** :
- Événement avec 3 courses : 09:00, 14:00, 18:00
- `startDate` = `2025-11-24T08:00:00Z` (09:00 locale → UTC)
- `endDate` = `2025-11-24T08:00:00Z` (09:00 locale → UTC) ❌

**Impact** :
- ❌ Durée de l'événement incorrecte (0 heures au lieu de 9 heures)
- ❌ Événements multi-jours non représentés correctement
- ❌ Dernière course non prise en compte

---

## Solution

### Nouvelle règle

- **`edition.startDate`** = Date + heure de la **première course** (ou 00:00 si pas d'heure)
- **`edition.endDate`** = Date + heure de la **dernière course** (ou 00:00 si pas d'heure)
- Tout converti en UTC avec gestion DST via `date-fns-tz`

### Implémentation

#### 1. Nouvelle méthode `calculateEditionEndDate()`

```typescript
/**
 * Calcule la date de fin d'une édition en utilisant l'heure de la dernière course
 * Convertit l'heure locale (selon la ligue) en UTC avec date-fns-tz
 */
private calculateEditionEndDate(ffaData: FFACompetitionDetails): Date {
  // S'il n'y a pas de courses, retourner startDate
  if (ffaData.races.length === 0) {
    return this.calculateEditionStartDate(ffaData)
  }
  
  // Récupérer la dernière course (selon raceDate ou ordre dans le tableau)
  const lastRace = ffaData.races[ffaData.races.length - 1]
  
  // Calculer la date de la dernière course
  return this.calculateRaceStartDate(ffaData, lastRace)
}
```

**Logique** :
1. Si aucune course → `endDate = startDate`
2. Sinon → `endDate = date/heure de la dernière course` (via `calculateRaceStartDate()`)

#### 2. Utilisation dans NEW_EVENT

```typescript
edition: {
  new: {
    startDate: this.calculateEditionStartDate(competition),
    endDate: this.calculateEditionEndDate(competition), // ✅ Dernière course
    year: competition.competition.date.getFullYear().toString(),
    timeZone: this.getTimezoneIANA(competition.competition.ligue),
    calendarStatus: 'CONFIRMED',
    // ...
  }
}
```

#### 3. Utilisation dans EDITION_UPDATE

```typescript
if (dateDiff > 21600000) { // 6 heures en ms
  changes.startDate = {
    old: edition.startDate,
    new: ffaStartDate,
    confidence
  }
  // ✅ Proposer aussi endDate = date de la dernière course
  const ffaEndDate = this.calculateEditionEndDate(ffaData)
  changes.endDate = {
    old: edition.endDate,
    new: ffaEndDate,
    confidence
  }
  // ...
}
```

---

## Cas d'usage

### Cas 1 : Événement d'un jour avec plusieurs courses

**Compétition FFA** :
- Date : 24 novembre 2025
- Courses :
  - 09:00 - 10km
  - 11:00 - Semi-Marathon
  - 14:00 - Marathon

**Résultat** :
- `startDate` = `2025-11-24T08:00:00Z` (09:00 Paris → UTC)
- `endDate` = `2025-11-24T13:00:00Z` (14:00 Paris → UTC)
- **Durée** : 5 heures ✅

### Cas 2 : Événement multi-jours

**Compétition FFA** :
- Plage : 17 au 18 janvier 2026
- Courses :
  - 17/01 18:30 - 9km by night
  - 18/01 09:00 - Semi-Marathon
  - 18/01 14:00 - Marathon

**Résultat** :
- `startDate` = `2026-01-17T17:30:00Z` (18:30 Paris → UTC)
- `endDate` = `2026-01-18T13:00:00Z` (14:00 Paris → UTC)
- **Durée** : ~20 heures ✅

### Cas 3 : Événement sans heure

**Compétition FFA** :
- Date : 15 mars 2025
- Courses : Aucune heure indiquée

**Résultat** :
- `startDate` = `2025-03-14T23:00:00Z` (00:00 Paris → UTC)
- `endDate` = `2025-03-14T23:00:00Z` (00:00 Paris → UTC)
- **Durée** : 0 heures (compétition d'un jour sans détails) ✅

### Cas 4 : Événement DOM-TOM

**Compétition FFA** :
- Ligue : GUA (Guadeloupe, UTC-4)
- Date : 10 février 2025
- Courses :
  - 07:00 - 5km
  - 08:30 - 10km

**Résultat** :
- `startDate` = `2025-02-10T11:00:00Z` (07:00 Guadeloupe → UTC)
- `endDate` = `2025-02-10T12:30:00Z` (08:30 Guadeloupe → UTC)
- **Durée** : 1h30 ✅

---

## Gestion des événements multi-jours

La méthode `calculateRaceStartDate()` **gère déjà** les événements multi-jours grâce au champ `race.raceDate` (format `"DD/MM"`).

**Exemple** :
```typescript
// Course avec date spécifique
const lastRace = {
  raceDate: "18/01",  // 18 janvier
  startTime: "14:00",
  name: "Marathon"
}

// calculateRaceStartDate() va :
// 1. Parser "18/01" → jour 18, mois janvier
// 2. Utiliser l'année de ffaData.startDate
// 3. Gérer le changement d'année si nécessaire (décembre → janvier)
// 4. Créer la date UTC avec timezone correct
```

**Résultat** :
- ✅ Événements chevauchant 2 jours : supportés
- ✅ Événements chevauchant 2 mois : supportés (voir `FIX-MULTI-MONTH-EVENTS.md`)
- ✅ Événements chevauchant 2 années : supportés (décembre → janvier)

---

## Impact

### Avant

| Événement | startDate | endDate | Durée | État |
|-----------|-----------|---------|-------|------|
| 3 courses (09:00, 14:00, 18:00) | 09:00 | 09:00 | 0h | ❌ Incorrect |
| Multi-jours (17/01-18/01) | 17/01 18:30 | 17/01 18:30 | 0h | ❌ Incorrect |

### Après

| Événement | startDate | endDate | Durée | État |
|-----------|-----------|---------|-------|------|
| 3 courses (09:00, 14:00, 18:00) | 09:00 | 18:00 | 9h | ✅ Correct |
| Multi-jours (17/01-18/01) | 17/01 18:30 | 18/01 14:00 | ~20h | ✅ Correct |

---

## Fichiers modifiés

1. **`apps/agents/src/FFAScraperAgent.ts`**
   - Ligne 943-960 : Ajout de `calculateEditionEndDate()`
   - Ligne 1027 : Utilisation dans NEW_EVENT
   - Ligne 268-272 : Utilisation dans EDITION_UPDATE

---

## Tests recommandés

### Test 1 : Événement simple avec plusieurs courses
```bash
# Vérifier une compétition avec 3 courses étalées sur la journée
# Attendre : endDate = heure de la 3ème course
```

### Test 2 : Événement multi-jours
```bash
# Vérifier une compétition avec courses sur 2 jours
# Attendre : endDate = jour 2 + heure dernière course
```

### Test 3 : Événement sans heure
```bash
# Vérifier une compétition sans heures de courses
# Attendre : endDate = startDate = 00:00 locale → UTC
```

---

## Ressources

- `docs/FFA-MULTI-DAY-EVENTS.md` - Gestion des événements multi-jours
- `docs/FIX-TIMEZONE-DST.md` - Conversion timezone avec DST
- `docs/FIX-MULTI-MONTH-EVENTS.md` - Événements chevauchant 2 mois
- `apps/agents/src/ffa/parser.ts` - Parsing des dates FFA
- `apps/agents/src/FFAScraperAgent.ts` - Agent scraper FFA
