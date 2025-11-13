# Fix : Comparaison timezone-aware des dates de courses FFA

**Date** : 2025-11-13  
**Fichier** : `apps/agents/src/FFAScraperAgent.ts`

## Problème

L'agent FFA Scraper ne gérait pas correctement tous les cas de comparaison de dates/heures de courses :

1. ❌ **FFA sans heure + date identique** : Pas de gestion (code skip)
2. 🟡 **FFA avec/sans heure + date différente** : Partiellement géré (uniquement si `startTime` existe)
3. ❌ **FFA avec heure + DB à minuit** : Pas détecté (comparaison brute en millisecondes)
4. ❌ **FFA sans heure + DB avec heure** : Pas géré

## Spécification

### Cas d'usage

| # | FFA | DB | Action |
|---|-----|-----|--------|
| **1a** | Date **avec** heure | Date à **minuit local** | ✅ **Proposition** (ajouter heure précise) |
| **1b** | Date **avec** heure | Date **avec heure** | ✅ Proposition si différence |
| **1c** | Date **avec** heure | **null** | ✅ **Proposition** (ajouter date+heure) |
| **2a** | Date **sans** heure | Date à **minuit local** + **même date** | ❌ **Pas de proposition** |
| **2b** | Date **sans** heure | Date à **minuit local** + **date différente** | ✅ **Proposition** (changer date) |
| **2c** | Date **sans** heure | Date **avec heure précise** | ❌ **Pas de proposition** (Option A : conserver heure existante) |
| **2d** | Date **sans** heure | **null** | ✅ **Proposition** (ajouter date à minuit) |

### Option A retenue

**Principe** : Conserver la précision existante (heure) si la FFA n'en donne pas.

**Raison** : Éviter de perdre l'information d'heure déjà renseignée manuellement ou par un autre agent.

## Solution implémentée

### Nouvelles méthodes utilitaires

```typescript
/**
 * Vérifie si une date UTC correspond à minuit (00:00:00) dans une timezone donnée
 */
private isMidnightInTimezone(date: Date, timezone: string): boolean {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  
  const timeStr = formatter.format(date)
  return timeStr === '00:00:00'
}

/**
 * Compare deux dates dans une timezone donnée (ignore l'heure)
 */
private isSameDateInTimezone(date1: Date, date2: Date, timezone: string): boolean {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  
  return formatter.format(date1) === formatter.format(date2)
}
```

### Logique de comparaison (lignes 500-611)

#### CAS 1 : FFA donne une heure

```typescript
if (ffaRace.startTime) {
  const raceStartDate = this.calculateRaceStartDate(ffaData, ffaRace)
  
  if (matchingRace.startDate) {
    const isDbMidnight = this.isMidnightInTimezone(matchingRace.startDate, dbTimeZone)
    
    if (isDbMidnight) {
      // CAS 1a : DB à minuit -> Toujours proposer
      raceUpdates.startDate = { old: ..., new: ... }
    } else {
      // CAS 1b : DB avec heure -> Proposer si différence
      const timeDiff = Math.abs(...)
      if (timeDiff > 0) {
        raceUpdates.startDate = { old: ..., new: ... }
      }
    }
  } else {
    // CAS 1c : Pas de startDate -> Ajouter
    raceUpdates.startDate = { old: null, new: ... }
  }
}
```

#### CAS 2 : FFA ne donne PAS d'heure

```typescript
else {
  if (matchingRace.startDate) {
    const isDbMidnight = this.isMidnightInTimezone(matchingRace.startDate, dbTimeZone)
    
    if (isDbMidnight) {
      // CAS 2a : DB à minuit -> Comparer dates uniquement
      const isSameDate = this.isSameDateInTimezone(...)
      
      if (!isSameDate) {
        // Date différente -> Proposition
        raceUpdates.startDate = { old: ..., new: ... }
      } else {
        // Date identique -> Pas de proposition
        this.logger.debug('⏭️  Date identique sans heure FFA')
      }
    } else {
      // CAS 2b : DB avec heure précise -> Ne pas écraser (Option A)
      this.logger.debug('🔒 Conservation heure existante')
    }
  } else {
    // CAS 2c : Pas de startDate -> Ajouter date à minuit
    raceUpdates.startDate = { old: null, new: ... }
  }
}
```

## Exemples concrets

### Exemple 1 : FFA avec heure + DB à minuit

**Base Miles Republic** :
- Course : "10km de Paris"
- `startDate` : `2025-03-29T23:00:00.000Z` (minuit Europe/Paris)

**FFA** :
- Course : "10 km"
- Date : 29 mars 2025
- Heure : **09:00**

**Résultat** :
- `isMidnightInTimezone()` → `true`
- **Proposition créée** : `2025-03-29T08:00:00.000Z` (09:00 Europe/Paris)
- Log : `🕓 Course à minuit détectée, ajout heure précise: 10km de Paris`

### Exemple 2 : FFA sans heure + DB avec heure

**Base Miles Republic** :
- Course : "Semi-Marathon"
- `startDate` : `2025-06-15T08:00:00.000Z` (10:00 Europe/Paris)

**FFA** :
- Course : "1/2 Marathon"
- Date : 15 juin 2025
- Heure : **non fournie**

**Résultat** :
- `isMidnightInTimezone()` → `false`
- **Pas de proposition** (Option A : conservation heure existante)
- Log : `🔒 Conservation heure existante: Semi-Marathon`

### Exemple 3 : FFA sans heure + DB à minuit + date différente

**Base Miles Republic** :
- Course : "Trail des Loups"
- `startDate` : `2025-04-12T22:00:00.000Z` (minuit Europe/Paris = 13 avril)

**FFA** :
- Course : "Trail des Loups"
- Date : **26 avril 2025**
- Heure : non fournie

**Résultat** :
- `isMidnightInTimezone()` → `true`
- `isSameDateInTimezone()` → `false` (13 avril ≠ 26 avril)
- **Proposition créée** : `2025-04-25T22:00:00.000Z` (minuit 26 avril)
- Log : `📅 Date changée (sans heure): Trail des Loups`

### Exemple 4 : FFA sans heure + DB à minuit + date identique

**Base Miles Republic** :
- Course : "Corrida de Noël"
- `startDate` : `2025-12-24T23:00:00.000Z` (minuit Europe/Paris = 25 décembre)

**FFA** :
- Course : "Corrida de Noël"
- Date : **25 décembre 2025**
- Heure : non fournie

**Résultat** :
- `isMidnightInTimezone()` → `true`
- `isSameDateInTimezone()` → `true` (25 décembre = 25 décembre)
- **Pas de proposition**
- Log : `⏭️  Date identique sans heure FFA: Corrida de Noël`

## Bénéfices

✅ **Gestion complète** : Tous les cas de figure couverts  
✅ **Timezone-aware** : Fonctionne correctement pour DOM-TOM  
✅ **Conservation de précision** : Heures existantes non écrasées si FFA n'en donne pas  
✅ **Logs détaillés** : Traçabilité complète des décisions  
✅ **Détection minuit** : Enrichissement des dates placeholder  

## Tests recommandés

1. ✅ Compétition métropole avec heures FFA + DB à minuit → Proposition
2. ✅ Compétition Guadeloupe sans heures FFA + DB à minuit + date identique → Pas de proposition
3. ✅ Compétition avec heures FFA + DB avec heures différentes → Proposition (toute différence)
4. ✅ Compétition sans heures FFA + DB avec heures précises → Pas de proposition

## Fichiers modifiés

- `apps/agents/src/FFAScraperAgent.ts` (lignes 706-734, 500-611)
  - Ajout `isMidnightInTimezone()`
  - Ajout `isSameDateInTimezone()`
  - Refonte complète de la logique de comparaison des dates de courses

## Commit

```bash
git add apps/agents/src/FFAScraperAgent.ts docs/FIX-FFA-RACE-DATE-COMPARISON.md
git commit -m "fix(ffa-agent): Timezone-aware race date comparison

- Add isMidnightInTimezone() to detect placeholder dates
- Add isSameDateInTimezone() for date-only comparison
- Handle all cases: FFA with/without time, DB at midnight/with time
- Option A: Preserve existing time precision if FFA doesn't provide time
- Fixes incorrect proposals for identical dates
- Fixes missed proposals for DB dates at midnight
- Full DOM-TOM timezone support"
```
