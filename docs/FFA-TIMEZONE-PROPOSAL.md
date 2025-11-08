# Ajout de timeZone dans les propositions FFA Scraper

**Date** : 2025-11-07  
**Objectif** : Le FFA Scraper fournit automatiquement le `timeZone` correct selon la ligue (DOM-TOM vs Métropole).

## Problème

Le FFA Scraper ne proposait pas de `timeZone` dans les propositions NEW_EVENT et EDITION_UPDATE.

**Conséquence** :
- L'interface ajoutait un fallback `timeZone = 'Europe/Paris'` pour toutes les compétitions
- **Incorrect pour les DOM-TOM** : Guadeloupe, Martinique, Guyane, Réunion, Mayotte, etc.
- Les heures d'événements DOM-TOM étaient mal affichées

## Solution

Ajouter `timeZone` **directement dans la proposition** en fonction de la ligue FFA.

### Méthode `getTimezoneIANA()`

**Fichier** : `apps/agents/src/FFAScraperAgent.ts`  
**Lignes** : 555-578

```typescript
private getTimezoneIANA(ligue: string): string {
  const ligueTimezones: Record<string, string> = {
    // DOM-TOM
    'GUA': 'America/Guadeloupe',
    'GUY': 'America/Cayenne',
    'MAR': 'America/Martinique',
    'MAY': 'Indian/Mayotte',
    'N-C': 'Pacific/Noumea',
    'P-F': 'Pacific/Tahiti',
    'REU': 'Indian/Reunion',
    'W-F': 'Pacific/Wallis'
  }
  
  if (ligue in ligueTimezones) {
    return ligueTimezones[ligue]
  }
  
  return 'Europe/Paris'  // Métropole par défaut
}
```

### 1. Propositions NEW_EVENT

**Fichier** : `apps/agents/src/FFAScraperAgent.ts`  
**Ligne** : 709

```typescript
edition: {
  new: {
    year: competition.competition.date.getFullYear().toString(),
    startDate: this.calculateEditionStartDate(competition),
    endDate: this.calculateEditionStartDate(competition),
    timeZone: this.getTimezoneIANA(competition.competition.ligue), // ✅ Ajouté
    calendarStatus: 'CONFIRMED',
    races: [ ... ]
  }
}
```

### 2. Propositions EDITION_UPDATE

**Fichier** : `apps/agents/src/FFAScraperAgent.ts`  
**Lignes** : 301-319

```typescript
// 2bis. TimeZone selon la ligue (DOM-TOM vs Métropole)
const ffaTimeZone = this.getTimezoneIANA(ffaData.competition.ligue)
if (edition.timeZone !== ffaTimeZone) {
  changes.timeZone = {
    old: edition.timeZone,
    new: ffaTimeZone,
    confidence
  }
  justifications.push({
    type: 'text',
    content: `TimeZone FFA: ${ffaTimeZone} (ligue ${ffaData.competition.ligue})`,
    metadata: { 
      oldTimeZone: edition.timeZone,
      newTimeZone: ffaTimeZone,
      ligue: ffaData.competition.ligue,
      source: ffaData.competition.detailUrl 
    }
  })
}
```

## Mapping des ligues vers timezones

| Ligue | Timezone IANA | UTC Offset |
|-------|---------------|------------|
| **Métropole** (toutes ligues métro) | `Europe/Paris` | +1 (hiver) / +2 (été) |
| **GUA** (Guadeloupe) | `America/Guadeloupe` | -4 |
| **GUY** (Guyane) | `America/Cayenne` | -3 |
| **MAR** (Martinique) | `America/Martinique` | -4 |
| **MAY** (Mayotte) | `Indian/Mayotte` | +3 |
| **N-C** (Nouvelle-Calédonie) | `Pacific/Noumea` | +11 |
| **P-F** (Polynésie Française) | `Pacific/Tahiti` | -10 |
| **REU** (Réunion) | `Indian/Reunion` | +4 |
| **W-F** (Wallis-et-Futuna) | `Pacific/Wallis` | +12 |

## Exemple concret

### Compétition en Guadeloupe

**Avant** :
```json
{
  "edition": {
    "new": {
      "startDate": "2025-03-29T09:00:00.000Z",
      // ❌ Pas de timeZone → Frontend ajoute "Europe/Paris" (incorrect !)
    }
  }
}
```

**Résultat dans l'interface** :  
❌ Affichage : "29/03/2025 à 10:00" (heure de Paris = UTC+1)  
✅ Réalité : "29/03/2025 à 05:00" (heure Guadeloupe = UTC-4)

---

**Après** :
```json
{
  "edition": {
    "new": {
      "startDate": "2025-03-29T09:00:00.000Z",
      "timeZone": "America/Guadeloupe"  // ✅ Correct !
    }
  }
}
```

**Résultat dans l'interface** :  
✅ Affichage : "29/03/2025 à 05:00" (heure locale Guadeloupe)

## Impact

✅ **Améliorations** :
- Affichage correct des heures pour toutes les compétitions DOM-TOM
- Plus de confusion entre les fuseaux horaires
- Cohérence entre NEW_EVENT et EDITION_UPDATE
- Correction automatique des timezones incorrectes dans la base

✅ **Pas de régression** :
- Métropole : continue d'utiliser `Europe/Paris` (comportement attendu)
- DOM-TOM : utilise maintenant le bon timezone
- Le calcul des dates UTC reste correct (méthode `getTimezoneOffset()` inchangée)

🧹 **Nettoyage** :
- Suppression du fallback `timeZone` frontend (ligne 270-271 de `GroupedProposalDetailBase.tsx`)
- Suppression du fallback `calendarStatus` frontend (déjà fourni par FFA)
- Le backend fournit désormais toujours ces champs

## Cas d'usage

### 1. Compétition métropole (Paris)
- Ligue : IDF
- TimeZone : `Europe/Paris`
- Affichage : heure de Paris ✅

### 2. Compétition Réunion
- Ligue : REU
- TimeZone : `Indian/Reunion`
- Affichage : heure de La Réunion (+3h par rapport à Paris) ✅

### 3. Compétition Nouvelle-Calédonie
- Ligue : N-C
- TimeZone : `Pacific/Noumea`
- Affichage : heure de Nouméa (+10h par rapport à Paris) ✅

## Références

- Issue : TimeZone incorrect pour les compétitions DOM-TOM
- Commit : Add automatic timezone detection for FFA proposals
- Fichiers modifiés :
  - `apps/agents/src/FFAScraperAgent.ts` (méthode `getTimezoneIANA()`)
  - `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx` (suppression fallbacks)
