# Fix: Matching Diab'olo Run échoué

**Date**: 2025-11-06  
**Agent**: FFA Scraper Agent  
**Proposition**: cmhnm4lja04glx26gjkaf6zbq  
**Event ID**: 10172

## Problème

L'événement "Diab'olo run" (ID 10172) à Dijon (département 21) n'était pas matché par l'algorithme, créant une proposition NEW_EVENT au lieu d'EDITION_UPDATE.

### Symptômes

```
[MATCHER] "Diab'olo Run" in Saint Apollinaire (dept: 021)
Normalized: name="diab olo run", city="saint apollinaire"
🔍 [SQL] Mots-clés nom: [diab, olo, run], ville: [saint, apollinaire], dept: 021
🔍 [PASSE 1] Recherche même département + nom
🔍 [PASSE 1] Trouvé 0 événements  ← ❌ PROBLÈME
```

### Cause racine

**Problème 1 : Apostrophes**

La fonction `normalizeString()` remplaçait **toutes** les apostrophes (y compris typographiques) par des **espaces**, transformant :
- `"Diab'olo"` → `"diab olo"` (2 mots séparés)
- Mots-clés : `["diab", "olo", "run"]`
- Filtre `>= 3 caractères` : éliminait `"olo"` (2 caractères)
- Résultat : Recherche SQL avec `["diab", "run"]` ne matchait pas `"Diab'olo run"` dans la base

De plus, différents types d'apostrophes existaient :
- **FFA** : Apostrophe ASCII `'` (U+0027)
- **Base de données** : Apostrophe courbe `'` (U+2019)

Ces deux caractères sont différents en Unicode, empêchant le matching.

**Problème 2 : Code département**

La FFA envoie les codes département avec un zéro devant ("021" pour la Côte-d'Or), mais Miles Republic stocke sans zéro ("21"). La requête SQL PASSE 1 cherchait avec `department = "021"` et ne trouvait aucun événement.

## Solution

### Fix 1 : Apostrophes

**Modification** : `apps/agents/src/ffa/matcher.ts`, fonction `normalizeString()`

#### Avant

```typescript
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Retirer accents
    .replace(/[^\w\s]/g, ' ')        // Retirer ponctuation ❌
    .replace(/\s+/g, ' ')
    .trim()
}
```

#### Après

```typescript
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')       // Retirer accents
    .replace(/[''‛]/g, "'")           // ✅ Unifier apostrophes → ASCII
    .replace(/[^\w\s']/g, ' ')             // ✅ Retirer ponctuation SAUF apostrophes
    .replace(/\s+/g, ' ')
    .trim()
}
```

### Fix 2 : Code département

**Modifications** :
1. `apps/agents/src/ffa/departments.ts` : Correction de `normalizeDepartmentCode()`
2. `apps/agents/src/ffa/matcher.ts` : Normalisation du département avant recherche

#### departments.ts - Avant

```typescript
export function normalizeDepartmentCode(code: string | null | undefined): string {
  if (!code) return ''
  const trimmed = code.trim()
  
  if (/^\d{3}$/.test(trimmed)) {
    return trimmed.substring(1) // "063" -> "63", "974" -> "74" ❌ BUG DOM-TOM
  }
  
  return trimmed
}
```

#### departments.ts - Après

```typescript
export function normalizeDepartmentCode(code: string | null | undefined): string {
  if (!code) return ''
  const trimmed = code.trim()
  
  // Cas spécial : DOM-TOM (codes 971-976) -> garder 3 chiffres
  if (/^97[1-6]$/.test(trimmed)) {
    return trimmed  // ✅ "974" reste "974"
  }
  
  // Codes métropole avec zéro devant : "0XX" -> "XX"
  if (/^0\d{2}$/.test(trimmed)) {
    return trimmed.substring(1)  // ✅ "021" -> "21"
  }
  
  return trimmed
}
```

#### matcher.ts - Modification

```typescript
import { normalizeDepartmentCode } from './departments'  // ✅ Import ajouté

export async function matchCompetition(...) {
  // Normaliser le code département pour retirer le zéro devant ("021" -> "21")
  const searchDepartment = normalizeDepartmentCode(competition.competition.department)  // ✅
  
  const candidates = await findCandidateEvents(
    searchName,
    searchCity,
    searchDepartment,  // Maintenant "21" au lieu de "021"
    searchDate,
    sourceDb
  )
}
```

### Résultat

```javascript
// Avant
"Diab'olo Run" → "diab olo run"  // 3 mots
Mots-clés: ["diab", "run"]       // "olo" éliminé (< 3 car)

// Après
"Diab'olo Run" → "diab'olo run"  // 2 mots
Mots-clés: ["diab'olo", "run"]   // Intact !
```

### Test de validation

```javascript
const ffaName = "Diab'olo Run"           // Apostrophe ASCII (FFA)
const dbName = "Diab'olo run"            // Apostrophe courbe (DB)

normalizeString(ffaName) === normalizeString(dbName)
// ✅ true : "diab'olo run" === "diab'olo run"
```

## Impact

Cette modification améliore le matching pour :
- ✅ **Noms avec apostrophes** : Diab'olo, L'Échappée, Trail d'Arbois, etc.
- ✅ **Unification Unicode** : Tous types d'apostrophes (`'`, `'`, `‛`) vers ASCII `'`
- ✅ **Recherche SQL** : `contains: "diab'olo"` trouve `"Diab'olo run"`
- ✅ **Fuzzy matching** : fuse.js compare des chaînes cohérentes

## Autres événements concernés

Recherche dans la base :

```sql
SELECT id, name, city FROM "Event" WHERE name LIKE '%''%' OR name LIKE '%'%';
```

Exemples d'événements qui bénéficieront du fix :
- L'Échappée Belle
- Trail d'Azur
- Course de l'Ain
- Foulée de l'Adour
- etc.

## Vérification

Pour vérifier que le fix fonctionne :

1. Déclencher un nouveau run du FFA Scraper Agent
2. Chercher "Diab'olo Run" dans les logs
3. Vérifier que la PASSE 1 trouve au moins 1 événement
4. Vérifier que la proposition est de type `EDITION_UPDATE` (pas `NEW_EVENT`)

## Déploiement

Le changement est automatiquement pris en compte par le hot reload en mode développement. Pour la production, un redéploiement de l'app `agents` est nécessaire.
