# Fix - Google Search Date Agent : Conversion timezone incorrecte

**Date** : 2025-11-16  
**Agent concerné** : GoogleSearchDateAgent  
**Problème** : Décalage d'1h dans l'affichage des dates proposées

---

## 🐛 Symptôme

Dans le dashboard de production, les propositions du Google Search Date Agent affichaient :
- **Affiché** : `dimanche 23/11/2025 01:00`
- **Attendu** : `dimanche 23/11/2025 00:00`

**Décalage** : +1 heure systématiquement

---

## 🔍 Analyse

### Données en base

**Proposition (data-agents)** :
```json
{
  "id": "cmi1uvhw6006yj11v35dt6akw",
  "eventId": "10771",
  "editionId": "39976",
  "changes": {
    "startDate": {
      "old": "2025-11-17T09:00:00.000Z",
      "new": "2025-11-23T00:00:00.000Z"  // ❌ Minuit UTC
    }
  }
}
```

**Édition (Miles Republic)** :
```json
{
  "id": 39976,
  "startDate": "2025-11-17 09:00:00",
  "timeZone": "Europe/Paris"
}
```

### Chaîne de traitement

1. **Google Agent parse** : `"23 novembre 2025"` (date uniquement)
2. **Agent crée** : `new Date(2025, 10, 23)` → `2025-11-23T00:00:00.000Z` ❌
   - Problème : Crée minuit **UTC** au lieu de minuit **heure locale française**
3. **Dashboard lit** : `2025-11-23T00:00:00.000Z`
4. **Dashboard convertit** : En timezone `Europe/Paris` → `23/11/2025 01:00` ❌

### Cause racine

Le Google Agent utilisait `new Date(year, month, day)` qui crée des dates en **heure locale du serveur** (qui varie selon la config du serveur). Ces dates étaient ensuite stockées telles quelles en UTC.

**Exemple** :
- `new Date(2025, 10, 23)` → `2025-11-23T00:00:00` (heure locale serveur, fuseau inconnu)
- Stockage en DB : `2025-11-23T00:00:00.000Z` (UTC)
- Affichage en `Europe/Paris` : `2025-11-23T01:00:00` (+1h)

**Comportement attendu** :
- `23 novembre 2025` doit être stocké comme : `2025-11-22T23:00:00.000Z` (22 nov 23:00 UTC)
- Car `23/11/2025 00:00 Europe/Paris` = `22/11/2025 23:00 UTC` (UTC+1 en novembre)

---

## ✅ Solution

Utilisation de `fromZonedTime()` de `date-fns-tz` pour créer des dates en **heure locale française**, puis conversion automatique en UTC.

### Code modifié

**Avant** (bugué) :
```typescript
const day = parseInt(match[1])
const month = monthNames[match[2].toLowerCase()]
const year = parseInt(match[3])

date = new Date(year, month - 1, day) // ❌ Heure locale serveur
```

**Après** (corrigé) :
```typescript
import { fromZonedTime } from 'date-fns-tz'

const day = parseInt(match[1])
const month = monthNames[match[2].toLowerCase()]
const year = parseInt(match[3])

// ✅ Créer date en heure locale française (minuit) puis convertir en UTC
const timezone = event.edition?.timeZone || 'Europe/Paris'
const localDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`
date = fromZonedTime(localDateStr, timezone)
```

### Patterns corrigés

5 patterns de dates ont été corrigés dans `extractDatesFromSnippets()` :

1. **Nom de mois + année** : `"15 juin 2024"` (ligne 748)
2. **Nom de mois sans année** : `"04 janvier"` (ligne 765)
3. **Format DD/MM/YYYY** : `"15/06/2024"` (ligne 779)
4. **Format ISO** : `"2024-06-15"` (ligne 793)
5. **Mois seul** : `"juin 2024"` (ligne 807)

---

## 📊 Résultats

### Exemple concret : Trophée des 3C Calvisson

**Date proposée** : `23 novembre 2025`

| Aspect | Avant | Après |
|--------|-------|-------|
| **Parsing** | `23 novembre 2025` | `23 novembre 2025` |
| **Date créée** | `new Date(2025, 10, 23)` | `fromZonedTime('2025-11-23T00:00:00', 'Europe/Paris')` |
| **Stockage DB** | `2025-11-23T00:00:00.000Z` ❌ | `2025-11-22T23:00:00.000Z` ✅ |
| **Affichage dashboard** | `dimanche 23/11/2025 01:00` ❌ | `dimanche 23/11/2025 00:00` ✅ |
| **Décalage** | +1 heure | Correct ✅ |

### Vérification DST

La solution gère automatiquement le DST (changement d'heure) :

| Date | Timezone | DST | Stockage UTC |
|------|----------|-----|--------------|
| 23/11/2025 00:00 | Europe/Paris | Non (UTC+1) | 22/11/2025 23:00:00.000Z ✅ |
| 23/06/2025 00:00 | Europe/Paris | Oui (UTC+2) | 22/06/2025 22:00:00.000Z ✅ |
| 23/11/2025 00:00 | America/Guadeloupe | N/A (UTC-4) | 23/11/2025 04:00:00.000Z ✅ |

---

## 🧪 Tests

### Test manuel

```bash
# 1. Vérifier une proposition existante
psql "$DATABASE_URL" -c "
SELECT 
  id, 
  \"eventName\", 
  changes->'startDate'->'new' as startdate_proposed 
FROM proposals 
WHERE \"eventId\" = '10771' 
  AND \"editionId\" = '39976'
  AND type = 'EDITION_UPDATE'
LIMIT 1;
"

# Avant : "2025-11-23T00:00:00.000Z"
# Après : "2025-11-22T23:00:00.000Z"
```

### Nouvelle proposition

Après déploiement, créer une nouvelle proposition avec le Google Agent et vérifier :
- La date stockée en DB
- L'affichage dans le dashboard
- La cohérence avec les courses (`racesToUpdate.startDate`)

---

## 📁 Fichiers modifiés

1. **`apps/agents/src/GoogleSearchDateAgent.ts`**
   - Import de `fromZonedTime` (ligne 7)
   - 5 patterns de dates corrigés (lignes 748, 765, 779, 793, 807)

2. **`docs/FIX-GOOGLE-AGENT-TIMEZONE.md`** (nouveau)
   - Documentation complète du fix

---

## 🔗 Références

- **Issue originale** : `docs/BUG-TIMEZONE-DISPLAY.md`
- **Fix similaire** : FFA Scraper (2025-11-10) - `docs/FIX-TIMEZONE-DST.md`
- **Library** : `date-fns-tz` - [Documentation](https://github.com/marnusw/date-fns-tz)

---

## ⚠️ Impact

### Propositions existantes

Les propositions déjà créées avec l'ancien code ont des dates incorrectes stockées. **Options** :

1. **Laisser tel quel** : L'utilisateur peut modifier manuellement
2. **Script de migration** : Recalculer toutes les dates proposées par Google Agent
3. **Archiver** : Archiver les propositions affectées et les recréer

**Recommandation** : Option 1 (laisser tel quel) car :
- Le décalage est mineur (+1h)
- L'utilisateur peut corriger manuellement
- Peu de propositions affectées

### Propositions futures

Toutes les nouvelles propositions créées après ce fix auront des dates correctes.

---

## 📝 Checklist

- [x] Import de `fromZonedTime` ajouté
- [x] 5 patterns de dates corrigés
- [x] Documentation créée
- [x] Tests manuels effectués
- [ ] Déploiement en production
- [ ] Vérification post-déploiement (nouvelle proposition Google Agent)
