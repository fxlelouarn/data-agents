# Fix: Gestion des événements multi-jours chevauchant 2 mois

**Date** : 2025-11-09  
**Problème** : [Proposition cmhrwpitb00hniu9eu4jg3tks](http://localhost:4000/proposals/cmhrwpitb00hniu9eu4jg3tks)  
**Événement FFA** : [Trail de Vulcain 2026](https://www.athle.fr/competitions/802846250846463840409834305840586837)

## Problème identifié

Le parser FFA ne gérait pas correctement les événements multi-jours **chevauchant deux mois différents**.

### Symptômes

Pour l'événement **Trail de Vulcain** qui se déroule du **28 février au 1er mars 2026**, la page FFA affiche :

```html
<p class="body-small text-dark-grey">28 au 1 Mars 2026</p>
```

Le parser extrayait incorrectement :
- `startDate = 28 mars 2026` ❌ (devrait être 28 février)
- `endDate = 1 mars 2026` ✅

### Cause

Le regex existant :
```typescript
/(\\d{1,2})\\s+au\\s+(\\d{1,2})\\s+(\\w+)(?:\\s+(\\d{4}))?/
```

Extrayait :
- `startDay = 28`
- `endDay = 1`
- `monthName = "Mars"`

Et créait **les deux dates dans le même mois** (mars), alors que le mois affiché est celui de la **date de fin uniquement**.

## Solution implémentée

### Logique de détection

**Indicateur clé** : `startDay > endDay` signifie que l'événement chevauche 2 mois.

```typescript
if (startDay > endDay) {
  // Exemple: "28 au 1 Mars" → 28 février au 1er mars
  const startMonth = endMonth === 0 ? 11 : endMonth - 1
  const startYear = endMonth === 0 ? year - 1 : year
}
```

### Cas gérés

| Texte FFA | startDate | endDate |
|-----------|-----------|---------|
| `"17 au 18 Janvier 2026"` | 17 janv. 2026 | 18 janv. 2026 |
| `"28 au 1 Mars 2026"` | **28 févr. 2026** | 1er mars 2026 |
| `"30 au 2 Janvier 2026"` | **30 déc. 2025** | 2 janv. 2026 |

### Cas particulier : Décembre-Janvier

Quand le mois de fin est **janvier** (`endMonth = 0`), le mois de début est **décembre de l'année précédente** :

```typescript
const startMonth = endMonth === 0 ? 11 : endMonth - 1
const startYear = endMonth === 0 ? year - 1 : year
```

**Exemple** : `"30 au 2 Janvier 2026"` 
→ 30 décembre **2025** au 2 janvier 2026

## Fichiers modifiés

### 1. Parser (`apps/agents/src/ffa/parser.ts`)

**Ligne 112-145** : Logique de détection et extraction des dates

```typescript
const endMonth = monthsMap[monthName]
if (endMonth !== undefined) {
  // Cas spécial: si startDay > endDay, l'événement chevauche 2 mois
  if (startDay > endDay) {
    const startMonth = endMonth === 0 ? 11 : endMonth - 1
    const startYear = endMonth === 0 ? year - 1 : year
    
    details.startDate = new Date(Date.UTC(startYear, startMonth, startDay, 0, 0, 0, 0))
    details.endDate = new Date(Date.UTC(year, endMonth, endDay, 0, 0, 0, 0))
  } else {
    // Cas normal: même mois
    details.startDate = new Date(Date.UTC(year, endMonth, startDay, 0, 0, 0, 0))
    details.endDate = new Date(Date.UTC(year, endMonth, endDay, 0, 0, 0, 0))
  }
}
```

### 2. Tests (`apps/agents/src/ffa/__tests__/parser.multi-day.test.ts`)

**Lignes 69-99** : Ajout de 2 tests

```typescript
it('devrait gérer un événement chevauchant 2 mois ("28 au 1 Mars 2026")', () => {
  // Test février-mars
})

it('devrait gérer un événement chevauchant 2 mois en décembre-janvier', () => {
  // Test décembre-janvier (changement d'année)
})
```

### 3. Calcul des dates de courses (`apps/agents/src/FFAScraperAgent.ts`)

**Lignes 850-896** : Fonction `calculateRaceStartDate()` modifiée

La fonction utilise désormais :
1. `race.raceDate` (format `"28/02"`) si présent pour déterminer le jour exact
2. `ffaData.startDate` comme date de base pour l'année
3. Gestion automatique du changement d'année (décembre → janvier)

```typescript
if (race.raceDate) {
  const [dayStr, monthStr] = race.raceDate.split('/')
  const raceDay = parseInt(dayStr, 10)
  const raceMonth = parseInt(monthStr, 10) - 1
  
  const year = ffaData.startDate.getUTCFullYear()
  const startMonth = ffaData.startDate.getUTCMonth()
  const adjustedYear = (raceMonth === 0 && startMonth === 11) ? year + 1 : year
  
  baseDate = new Date(Date.UTC(adjustedYear, raceMonth, raceDay, 0, 0, 0, 0))
} else {
  baseDate = ffaData.startDate
}
```

**Impact** :
- ✅ Course du 28/02 → `2026-02-28T13:00:00.000Z` (14h locale)
- ✅ Course du 01/03 → `2026-03-01T07:00:00.000Z` (08h locale)
- ✅ Changement d'année géré (30/12/2025 → 01/01/2026)

## Validation

### Tests automatisés

```bash
npx tsx scripts/test-parser-fix.ts
```

**Résultat** : ✅ Tous les tests passent

### Tests manuels

1. **Trail de Vulcain** (28 févr. → 1er mars 2026)
2. **Événement fictif** (30 déc. 2025 → 2 janv. 2026)
3. **Bol d'air** (17 → 18 janv. 2026) - Rétrocompatibilité

## Impact

### ✅ Bénéfices

- Propositions d'édition avec `startDate` et `endDate` corrects
- Matching temporel précis pour les événements chevauchant 2 mois
- Support complet des événements en fin d'année (déc-janv)

### ⚠️ Limitations

**Hypothèse** : Le mois affiché dans le texte FFA est toujours celui de la **date de fin**.

**Cas non supportés** (probablement inexistants) :
- Événements sur 3+ mois (ex: "15 Décembre au 5 Mars")
- Format inversé (ex: "Mars 28 au 1 Avril")

## Ressources

- **Issue** : Proposition cmhrwpitb00hniu9eu4jg3tks
- **Événement FFA** : https://www.athle.fr/competitions/802846250846463840409834305840586837
- **Tests** : `apps/agents/src/ffa/__tests__/parser.multi-day.test.ts`
- **Scripts de test** :
  - `scripts/test-parser-fix.ts` - Test parsing dates événement
  - `scripts/test-race-dates.ts` - Test calcul dates courses
- **Documentation précédente** : `docs/FFA-MULTI-DAY-EVENTS.md` (événements même mois)
