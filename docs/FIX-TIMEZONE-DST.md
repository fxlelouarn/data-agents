# Fix : Gestion correcte des timezones et DST

**Date** : 2025-11-10  
**Problème** : Décalage d'1h entre les heures FFA et l'affichage dans le dashboard

## Symptôme

- **Site FFA** : https://www.athle.fr/competitions/180846488843586852584855746852706855
  - Courses à 09:00, 09:30, 09:40
- **Dashboard** : Affichage à 10:00, 10:30, 10:40 ❌
- **Proposition ID** : `cmhsshjtq03nd4mr4qk87i68k`
- **Date événement** : 29 mars 2026 (= jour du changement d'heure DST)

## Cause racine

### 1. Approximation DST incorrecte

**Code bugué** (`FFAScraperAgent.ts` ligne 733) :

```typescript
const isDST = month > 2 && month < 10 // ❌ APPROXIMATION INCORRECTE
return isDST ? 2 : 1
```

**Problème** :
- Mars = mois 2 (0-indexed), donc `2 > 2` = **false** → UTC+1
- Mais le **29 mars 2026** est le **dernier dimanche de mars** = jour du changement d'heure
- À partir de 03:00, la France passe en **UTC+2** (heure d'été)
- Une course à 09:00 le 29 mars est donc déjà en heure d'été

**Résultat** :
```
FFA affiche : 09:00 heure locale
Code stocke : 09:00 - 1h = 08:00 UTC ❌ (devrait être 07:00 UTC)
Dashboard affiche : 08:00 UTC + 2h DST = 10:00 ❌
```

### 2. Vérification avec date-fns-tz

```javascript
const storedDate = new Date('2026-03-29T08:00:00.000Z')
console.log(storedDate.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }))
// Résultat : 29/03/2026 10:00:00 ❌

// Avec bonne conversion :
const correctDate = fromZonedTime('2026-03-29T09:00:00', 'Europe/Paris')
console.log(correctDate.toISOString())
// Résultat : 2026-03-29T07:00:00.000Z ✅
```

## Solution

### Backend : Utiliser `date-fns-tz`

**Installation** :
```bash
cd apps/agents
npm install date-fns-tz
```

**Imports** (`FFAScraperAgent.ts`) :
```typescript
import { fromZonedTime, getTimezoneOffset as getTzOffset } from 'date-fns-tz'
```

**Nouvelle fonction** (remplace `getTimezoneOffset`) :
```typescript
private getTimezoneOffsetForDate(ligue: string, date: Date): number {
  const timeZone = this.getTimezoneIANA(ligue)
  const offsetMs = getTzOffset(timeZone, date)
  return offsetMs / (1000 * 60 * 60)
}
```

**Conversion heures courses** (`calculateRaceStartDate`) :
```typescript
// ❌ AVANT (bugué)
const utcDate = new Date(Date.UTC(year, month, day, hours - offsetHours, minutes, 0, 0))

// ✅ APRÈS (correct)
const localDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
const utcDate = fromZonedTime(localDateStr, timeZone)
```

**Logs ajoutés** :
```typescript
this.logger.info(`🕐 Conversion timezone: ${localDateStr} ${timeZone} -> ${utcDate.toISOString()} (course: ${race.name})`)
```

### Frontend : Utiliser timezone de l'édition

**Fichier** : `RacesToAddSection.tsx`

**Changements** :
```typescript
// Import
import { formatDateInTimezone } from '@/utils/timezone'

// Récupérer timezone depuis proposition enrichie
const editionTimeZone = proposal?.editionTimeZone || 'Europe/Paris'

// Formatter avec bon timezone
const formatDateTime = (dateString: string): string => {
  return formatDateInTimezone(dateString, editionTimeZone, 'EEEE dd/MM/yyyy HH:mm')
}
```

**Log ajouté** :
```typescript
console.log('[RacesToAddSection] Timezone édition:', editionTimeZone, '| Proposal ID:', proposalId)
```

## Tests de validation

### Cas de test

| Date | Heure | Timezone | UTC attendu | DST |
|------|-------|----------|-------------|-----|
| 29 mars 2026 | 09:00 | Europe/Paris | `07:00 UTC` | Oui (UTC+2) |
| 28 mars 2026 | 09:00 | Europe/Paris | `08:00 UTC` | Non (UTC+1) |
| 24 nov 2026 | 09:00 | Europe/Paris | `08:00 UTC` | Non (UTC+1) |
| 15 juil 2026 | 09:00 | Europe/Paris | `07:00 UTC` | Oui (UTC+2) |
| 29 mars 2026 | 09:00 | America/Guadeloupe | `13:00 UTC` | N/A (UTC-4 fixe) |

### Script de test

```bash
node test-timezone-fix.js
```

**Résultat attendu** :
```
29 mars 2026 09:00 (jour DST)
  Input: 2026-03-29T09:00:00 Europe/Paris
  Offset: UTC+2
  UTC stocké: 2026-03-29T07:00:00.000Z ✅
  Affichage (Europe/Paris): 29/03/2026 09:00:00 ✅
  Heure seule: 09:00 ✅
```

## Fichiers modifiés

### Backend
- `apps/agents/src/FFAScraperAgent.ts`
  - Ligne 35 : Import `fromZonedTime`, `getTzOffset`
  - Lignes 711-726 : Nouvelle fonction `getTimezoneOffsetForDate()` (deprecated l'ancienne)
  - Lignes 849-902 : Refonte `calculateRaceStartDate()` avec `fromZonedTime`
  - Lignes 906-940 : Refonte `calculateEditionStartDate()` avec `fromZonedTime`

### Frontend
- `apps/dashboard/src/components/proposals/edition-update/RacesToAddSection.tsx`
  - Ligne 32 : Import `formatDateInTimezone`
  - Lignes 71-75 : Récupération `editionTimeZone` depuis proposition
  - Lignes 186-192 : Refonte `formatDateTime()` avec timezone correct

### Documentation
- `docs/FIX-TIMEZONE-DST.md` (ce fichier)
- `test-timezone-fix.js` - Script de test
- `test-dst-2026.js` - Vérification changement d'heure 2026

## Étapes de déploiement

1. ✅ Installer `date-fns-tz` dans `apps/agents` et `apps/dashboard`
2. ✅ Modifier le code backend (`FFAScraperAgent.ts`)
3. ✅ Modifier le code frontend (`RacesToAddSection.tsx`)
4. ✅ Build et tests
5. ⏳ **Relancer le FFA Scraper** pour recréer les propositions avec les bonnes dates
6. ⏳ Vérifier dans le dashboard que les heures sont correctes

## Commandes de relance

```bash
# Build
npm run build:agents

# Relancer le scraper (production)
# TODO: Via dashboard ou cron
```

## Proposition de test

La proposition `cmhsshjtq03nd4mr4qk87i68k` devrait maintenant afficher :
- Date stockée en DB : `2026-03-29T07:00:00.000Z` ✅ (au lieu de `08:00`)
- Affichage dashboard : `samedi 29/03/2026 09:00` ✅

## Impact

- ✅ Fix DST pour tous les événements métropole (29 mars et 25 octobre)
- ✅ Support correct des timezones DOM-TOM (Guadeloupe, Réunion, etc.)
- ✅ Affichage cohérent pour utilisateurs de différentes timezones
- ✅ Logs détaillés pour debugging

## Notes importantes

- Les **propositions existantes** ne seront PAS mises à jour automatiquement
- Il faut **relancer le scraper** pour qu'il génère de nouvelles propositions avec les bonnes dates
- Les **événements déjà appliqués** dans Miles Republic devront être corrigés manuellement si nécessaire
