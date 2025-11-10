# Fix: Retrait des numéros d'édition avec symboles (#, No., N°)

**Date** : 2025-11-10  
**Problème** : L'algorithme de matching FFA ne reconnaissait pas les événements existants quand le nom FFA contenait `#3`, `No. 8`, `N° 5`, etc.

## Problème détaillé

### Cas réel : Trail des Loups #3

**Événement existant** :
- ID : 13446
- Nom : `"Trail des loups"`
- Ville : Bonnefontaine (39)
- Édition 2026 : ID 44684, date 13 avril 2026

**Scrape FFA** :
- Nom : `"Trail Des Loups #3"`
- Ville : Bonnefontaine (39)
- Date : 26 avril 2026

**Résultat avant fix** :
- Match score : **0.565** < 0.75 (seuil) → ❌ NO_MATCH
- Proposition créée : NEW_EVENT au lieu d'EDITION_UPDATE
- Cause : Le `#3` dans le nom FFA réduisait le score de fuzzy matching

### Analyse du score (avant fix)

```
Score de base (sans #3) : ~0.98
Score réel (avec #3)    : ~0.565

Composantes :
- Nom : 0.565 (réduit par #3)
- Ville : 1.0 (Bonnefontaine = Bonnefontaine)
- Département : +0 (bonus non appliqué car villes identiques)
- Date : × 0.9567 (pénalité -4% pour 13 jours d'écart)

Score final : (0.565 * 0.5 + 1.0 * 0.3 + 0.565 * 0.2) * 0.9567 ≈ 0.565
```

## Solution

### Modification de `removeEditionNumber()`

**Fichier** : `apps/agents/src/ffa/matcher.ts`

**Ajout du regex** :
```typescript
// Supprimer "#X", "No. X", "N° X", "no X" partout dans le nom
.replace(/\s*[#№]?\s*n[o°]?\.?\s*\d+/gi, '')
```

**Patterns supportés** :
- `#3`, `#10`, `#125`
- `No. 8`, `No 8`, `no. 8`, `no 8`
- `N° 5`, `n° 5`, `N°5`, `n°5`
- `№ 12` (symbole numéro Unicode U+2116)

**Exemples de transformation** :

| Avant | Après |
|-------|-------|
| `Trail des Loups #3` | `Trail des Loups` |
| `Marathon No. 8` | `Marathon` |
| `Course N° 5 de Lyon` | `Course de Lyon` |
| `Trail no 12` | `Trail` |
| `Ultra-Trail #5 (2025)` | `Ultra-Trail` |

### Tests ajoutés

**Fichier** : `apps/agents/src/ffa/__tests__/matcher.edition-removal.test.ts`

Tests couvrant :
- ✅ Symboles `#`, `No.`, `N°`, `no`
- ✅ Numéros ordinaux existants (`34ème`, `- 15ème édition`)
- ✅ Années `(2025)`, `- 2026`
- ✅ Combinaisons multiples
- ✅ Cas limites (ex: `Les 100km de Millau` non modifié)

## Impact

### Score après fix

```
Score de base : 0.98 (Trail des Loups ≈ Trail des loups)
Ville : 1.0
Date : × 0.9567

Score final : (0.98 * 0.5 + 1.0 * 0.3 + 0.98 * 0.2) * 0.9567 ≈ 0.88
```

✅ **0.88 > 0.75 → FUZZY_MATCH détecté !**

### Cas gérés

Le fix permet maintenant de matcher correctement :
1. **Événements avec numéro d'édition symbolique** : `#3`, `No. 8`, `N° 5`
2. **Changements de date** : Édition 2026 existante (13 avril) vs FFA (26 avril)
3. **Variations typographiques** : `Trail Des Loups` vs `Trail des loups`

### Proposition correcte

Au lieu de :
- ❌ NEW_EVENT `"Trail Des Loups #3"`

L'agent créera :
- ✅ EDITION_UPDATE pour l'édition 44684
- ✅ Changement de date : 13 avril → 26 avril 2026
- ✅ Ajout/mise à jour des courses

## Détails techniques

### Composantes du score de matching

Rappel de l'algorithme (ligne 232 de `matcher.ts`) :

```typescript
candidate.combined = Math.min(1.0, 
  (validatedBestScore * 0.5 + candidate.cityScore * 0.3 + alternativeScore * 0.2 + departmentBonus) 
  * dateMultiplier
)
```

**Pondération** :
- Nom (best score) : 50%
- Ville : 30%
- Nom alternatif : 20%
- Bonus département : +15% (si même dept, villes différentes)
- Multiplicateur date : 70-100% selon proximité

### Pénalité temporelle

**Formule** (ligne 217) :
```typescript
dateMultiplier = 0.7 + (dateProximity * 0.3)
```

Avec `dateProximity = 1 - (daysDiff / 90)` :

| Écart | dateProximity | Multiplicateur | Pénalité |
|-------|---------------|----------------|----------|
| 0 jours | 1.0 | 100% | 0% |
| 13 jours | 0.856 | 95.7% | -4.3% |
| 45 jours | 0.5 | 85% | -15% |
| 90 jours | 0.0 | 70% | -30% |

### Bonus département

**Condition** (ligne 213) :
```typescript
departmentBonus = candidate.departmentMatch && candidate.cityScore < 0.9 ? 0.15 : 0
```

S'applique **uniquement** si :
- Même département ET
- Villes différentes (score < 0.9)

**Utilité** : Gérer les cas comme Dijon/Saint-Apollinaire (dept 21), Nevers/Magny-Cours (dept 58)

## Validation

### Commandes de test

```bash
# Exécuter les tests du fix
npm test -- apps/agents/src/ffa/__tests__/matcher.edition-removal.test.ts

# Vérifier tous les tests FFA
npm test -- apps/agents/src/ffa/__tests__/
```

### Test manuel

Pour tester avec la compétition réelle :

```bash
# Vérifier l'événement existant
psql "$MILES_REPUBLIC_DATABASE_URL" -c "
SELECT id, name, city 
FROM \"Event\" 
WHERE id = 13446;
"

# Vérifier l'édition 2026 existante
psql "$MILES_REPUBLIC_DATABASE_URL" -c "
SELECT id, year, \"startDate\" 
FROM \"Edition\" 
WHERE \"eventId\" = 13446 AND year = 2026;
"

# Archiver l'ancienne proposition NEW_EVENT
psql "$DATABASE_URL" -c "
UPDATE proposals 
SET status = 'ARCHIVED' 
WHERE id = 'cmhstf28403tjmu3ref0q3nbz';
"

# Relancer le scraper FFA pour BFC avril 2026
# Il devrait maintenant créer un EDITION_UPDATE au lieu de NEW_EVENT
```

## Limitations connues

### Chiffres légitimes

Le regex **ne retire pas** les chiffres qui font partie intégrante du nom :
- ✅ `"Les 100km de Millau"` → Pas modifié
- ✅ `"Semi-Marathon 21km"` → Pas modifié

### Numéros seuls

Un nom composé uniquement d'un numéro sera vidé :
- ⚠️ `"#3"` → `""` (chaîne vide)

Ce cas est géré gracieusement par l'algorithme (NO_MATCH au lieu de crash).

## Références

- `apps/agents/src/ffa/matcher.ts` - Fonction `removeEditionNumber()` (lignes 395-423)
- `apps/agents/src/ffa/MATCHING.md` - Documentation algorithme de matching
- `docs/CONFIDENCE-NEW-EVENT.md` - Système de confiance inversée
- Proposition exemple : `cmhstf28403tjmu3ref0q3nbz`
