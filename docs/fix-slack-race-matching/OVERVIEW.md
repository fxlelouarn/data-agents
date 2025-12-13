# Fix: Matching des courses Slack Agent

## Contexte

Proposition problématique : https://data-agents-dashboard.onrender.com/proposals/group/1828-48862

L'événement "Trail de la Grande Champagne" présentait 5 problèmes de matching des courses.

## Problèmes identifiés et solutions

### Problème 1: Matching incomplet (2/5 au lieu de 5/5)

**Cause** : Tolérance de distance de 5% trop stricte pour les variations réelles.

| Course DB | Distance DB | Course Slack | Distance Slack | Écart | Match avant |
|-----------|-------------|--------------|----------------|-------|-------------|
| Trail la caburotte 53 km | 53 km | La Caburotte | 55 km | 3.8% | ✅ |
| Trail la bataille 25 km | 25 km | La Bataille | 27.5 km | 10% | ❌ |
| Trail l'orchis 14 km | 14 km | Les Orchis | 15 km | 7.1% | ❌ |
| Trail 9 km | 9 km | La Mignonette | 9 km | 0% | ✅ |
| Randonnée 11,5 km | 11.5 km | Rando 10km | 10 km | 13% | ❌ |

**Solution** : 
- Tolérance augmentée de 5% à 15%
- Ajout d'un fuzzy fallback sur le nom quand la distance ne matche pas

**Fichier** : `packages/agent-framework/src/services/event-matching/event-matcher.ts`

---

### Problème 2: Catégories RUNNING au lieu de TRAIL

**Cause** : L'inférence de catégorie ne regardait que le nom de la course, pas le contexte de l'événement.

**Exemple** : "La Bataille" → RUNNING (pas de mot-clé "trail" dans le nom)

**Solution** : Ajouter le paramètre `eventName` à `inferRaceCategories()` pour utiliser le contexte.

**Fichiers** :
- `packages/database/src/services/race-enrichment/category-inference.ts`
- `apps/api/src/services/slack/SlackProposalService.ts`

---

### Problème 3: Catégories existantes écrasées

**Cause** : Lors du matching, la catégorie inférée remplaçait systématiquement la catégorie existante en DB.

**Exemple** : Course DB avec `categoryLevel1: 'TRAIL'` → proposition de changement vers `RUNNING`

**Solution** : Ne proposer une mise à jour de catégorie que si la DB n'en a pas.

```typescript
// Avant
if (enrichedRace.categoryLevel1) {
  updates.categoryLevel1 = { old: db.categoryLevel1, new: enrichedRace.categoryLevel1 }
}

// Après
if (enrichedRace.categoryLevel1 && !db.categoryLevel1) {
  updates.categoryLevel1 = { old: null, new: enrichedRace.categoryLevel1 }
}
```

**Fichier** : `apps/api/src/services/slack/SlackProposalService.ts`

---

### Problème 4: Courses existantes non matchées invisibles

**Cause** : Les courses DB qui n'étaient pas matchées n'apparaissaient pas dans l'UI.

**Solution** : Ajouter `racesExisting` dans les changes pour afficher les courses DB non matchées.

```typescript
const unmatchedDbRaces = existingRaces.filter(r => !matchedDbRaceIds.has(r.id))
if (unmatchedDbRaces.length > 0) {
  changes.racesExisting = { old: null, new: unmatchedDbRaces.map(...) }
}
```

**Fichier** : `apps/api/src/services/slack/SlackProposalService.ts`

---

### Problème 5: Duplication course matchée/nouvelle

**Cause** : Une course matchée pouvait aussi apparaître dans `racesToAdd` si une autre proposition PENDING contenait déjà cette course.

**Solution** : Vérifier les propositions PENDING existantes et filtrer les doublons.

**Fichier** : `apps/api/src/services/slack/SlackProposalService.ts`

---

## Tests créés

| Fichier | Tests | Description |
|---------|-------|-------------|
| `packages/agent-framework/.../match-races.test.ts` | 13 | Tolérance, fuzzy, doublons |
| `packages/database/.../category-inference.test.ts` | 28 | Inférence catégories + eventName |
| `apps/api/.../SlackProposalService.test.ts` | 34 | Service complet |

**Total** : 75 tests

---

## Tech Debt

La tolérance de 15% est hardcodée. Elle devrait être configurable dans les Settings de la plateforme.

Voir : `docs/TECH_DEBT.md`
