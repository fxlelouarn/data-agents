# Fix: Affichage Date + Heure + Jour de la semaine pour les courses

**Date:** 2025-11-08  
**Problème:** Les courses affichaient uniquement la date, pas l'heure ni le jour de la semaine  
**Solution:** Uniformisation du formatage des dates dans toutes les sections de courses

---

## Problème

Dans l'interface du dashboard, les dates des courses (`Race.startDate`) n'affichaient que la date (ex: "24/11/2025") alors que :
- Le champ `startDate` est bien un `DateTime` dans la base
- Le FFA Scraper calcule et propose correctement la date + heure
- Les éditions affichent déjà le format complet avec jour de la semaine

**Exemple attendu:**
```
lundi 24/11/2025 14:00
```

**Comportement avant fix:**
```
24/11/2025  ❌
```

---

## Fichiers modifiés

### 1. `RacesToAddSection.tsx` (NEW_EVENT)

**Problème:** Ligne 182 utilisait `toLocaleDateString()` qui n'affiche pas l'heure

```typescript
// ❌ AVANT
{ label: 'Date', currentValue: null, proposedValue: race.startDate ? new Date(race.startDate).toLocaleDateString('fr-FR') : null, alwaysShow: false }
```

**Solution:** Import de `date-fns` et fonction `formatDateTime()` locale

```typescript
// ✅ APRÈS
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

// Fonction pour formater une date/heure avec jour de la semaine
const formatDateTime = (dateString: string): string => {
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return dateString
    return format(date, 'EEEE dd/MM/yyyy HH:mm', { locale: fr })
  } catch {
    return dateString
  }
}

{ label: 'Date + Heure', currentValue: null, proposedValue: race.startDate ? formatDateTime(race.startDate) : null, alwaysShow: false }
```

### 2. `RacesChangesTable.tsx` (EDITION_UPDATE)

**Problème:** Ligne 76 utilisait aussi `toLocaleDateString()`

```typescript
// ❌ AVANT
{ key: 'startDate', label: 'Date', format: (v) => v ? new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-' }
```

**Solution:** Import de `date-fns` et fonction inline dans le formatter

```typescript
// ✅ APRÈS
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

{ 
  key: 'startDate', 
  label: 'Date + Heure', 
  format: (v) => {
    if (!v) return '-'
    try {
      const date = new Date(v)
      if (isNaN(date.getTime())) return v
      return format(date, 'EEEE dd/MM/yyyy HH:mm', { locale: fr })
    } catch {
      return v
    }
  }
}
```

---

## Formatage utilisé

Le format `'EEEE dd/MM/yyyy HH:mm'` avec `date-fns` affiche :
- `EEEE` : Jour de la semaine complet en français (lundi, mardi, etc.)
- `dd/MM/yyyy` : Date au format jour/mois/année
- `HH:mm` : Heure au format 24h (14:00, 09:30, etc.)

**Exemple de rendu:**
```
lundi 24/11/2025 14:00
samedi 15/03/2025 09:30
dimanche 01/06/2025 08:00
```

---

## Cohérence avec l'existant

Ce format est **identique** à celui utilisé pour les éditions dans `useProposalLogic.ts` (ligne 113) :

```typescript
const formatDateTime = (dateString: string, timezone?: string) => {
  try {
    if (timezone) {
      return formatDateInTimezone(dateString, timezone, 'EEEE dd/MM/yyyy HH:mm')
    }
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return dateString
    return format(date, 'EEEE dd/MM/yyyy HH:mm', { locale: fr })
  } catch (error) {
    return dateString
  }
}
```

---

## Sections affectées

✅ **NEW_EVENT** - Section "Courses à ajouter" (`RacesToAddSection.tsx`)  
✅ **EDITION_UPDATE** - Table consolidée des courses (`RacesChangesTable.tsx`)  
✅ **EDITION_UPDATE** - Section "Modifications des courses" (`RaceChangesSection.tsx`) - Déjà OK via `formatValue()`

Note: `RaceChangesSection.tsx` utilisait déjà `formatValue()` du hook `useProposalLogic`, qui détecte automatiquement les dates ISO et appelle `formatDateTime()`.

---

## Tests manuels suggérés

1. **NEW_EVENT** : Créer une proposition FFA avec courses
   - Vérifier l'affichage dans la table des courses proposées
   - Format attendu : `lundi 24/11/2025 14:00`

2. **EDITION_UPDATE** : Modifier l'heure d'une course existante
   - Vérifier l'affichage dans "Valeur actuelle" et "Valeur proposée"
   - Format attendu avec jour de la semaine

3. **DOM-TOM** : Vérifier une compétition en Guadeloupe ou Réunion
   - Les timezones correctes devraient être appliquées
   - L'heure affichée doit correspondre à l'heure locale

---

## Références

- **Format date-fns**: https://date-fns.org/docs/format
- **FFA Scraper**: `apps/agents/src/FFAScraperAgent.ts` (lignes 850-906)
- **Hook de formatage**: `apps/dashboard/src/hooks/useProposalLogic.ts` (lignes 109-124)
- **Schéma Prisma**: `apps/agents/prisma/miles-republic.prisma` (ligne 385: `startDate DateTime?`)
