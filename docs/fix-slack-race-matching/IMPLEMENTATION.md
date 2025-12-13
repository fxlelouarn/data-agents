# Implémentation : Fix Matching des courses Slack Agent

## Fichiers modifiés

### 1. `packages/agent-framework/src/services/event-matching/event-matcher.ts`

**Modifications** :

1. **Tolérance par défaut** : 5% → 15%
   ```typescript
   tolerancePercent: number = 0.15 // TECH DEBT: Should be configurable
   ```

2. **Tracking des courses DB matchées** :
   ```typescript
   const matchedDbIds = new Set<number | string>()
   // ... après chaque match :
   matchedDbIds.add(candidate.id)
   ```

3. **Fuzzy fallback** quand pas de match par distance :
   ```typescript
   if (candidates.length === 0) {
     const availableDbRaces = dbRaces.filter(r => !matchedDbIds.has(r.id))
     if (availableDbRaces.length > 0) {
       const bestMatch = fuzzyMatchRaceName(inputRace, availableDbRaces, logger)
       if (bestMatch.score >= 0.65) {
         matched.push({ input: inputRace, db: bestMatch.race })
         matchedDbIds.add(bestMatch.race.id)
         continue
       }
     }
     unmatched.push(inputRace)
   }
   ```

---

### 2. `packages/database/src/services/race-enrichment/category-inference.ts`

**Modifications** :

1. **Nouveau paramètre `eventName`** :
   ```typescript
   export function inferRaceCategories(
     raceName: string,
     runDistance?: number,
     bikeDistance?: number,
     swimDistance?: number,
     walkDistance?: number,
     eventName?: string  // NOUVEAU
   ): [string, string | undefined]
   ```

2. **Utilisation du contexte événement** :
   ```typescript
   const eventNameLower = eventName ? normalizeRaceName(eventName) : ''
   
   // TRAIL - Check both race name AND event name
   const isTrailContext = lowerName.includes('trail') || eventNameLower.includes('trail')
   if (isTrailContext) {
     // ... logique TRAIL
   }
   ```

---

### 3. `apps/api/src/services/slack/SlackProposalService.ts`

**Modifications** :

1. **Import `normalizeRaceName`** pour la déduplication

2. **`enrichRaceWithCategories()`** : Accepte `eventName` en paramètre

3. **Préservation des catégories existantes** :
   ```typescript
   // Ne proposer que si la BD n'a pas de catégorie
   if (enrichedRace.categoryLevel1 && !(db as any).categoryLevel1) {
     updates.categoryLevel1 = { old: null, new: enrichedRace.categoryLevel1 }
   }
   ```

4. **`racesExisting`** pour les courses DB non matchées :
   ```typescript
   const matchedDbRaceIds = new Set(matched.map(m => m.db.id))
   const unmatchedDbRaces = existingRaces.filter(r => !matchedDbRaceIds.has(r.id))
   if (unmatchedDbRaces.length > 0) {
     changes.racesExisting = {
       old: null,
       new: unmatchedDbRaces.map(race => ({
         raceId: race.id,
         raceName: race.name,
         runDistance: race.runDistance,
         walkDistance: race.walkDistance,
         categoryLevel1: race.categoryLevel1,
         categoryLevel2: race.categoryLevel2,
         startDate: race.startDate
       }))
     }
   }
   ```

5. **Déduplication contre propositions PENDING** :
   ```typescript
   if (changes.racesToAdd?.new?.length > 0 && matchResult.event?.id && matchResult.edition?.id) {
     const pendingProposals = await prisma.proposal.findMany({
       where: {
         eventId: matchResult.event.id.toString(),
         editionId: matchResult.edition.id.toString(),
         status: 'PENDING'
       },
       select: { changes: true }
     })
     
     const pendingRaceNames = new Set<string>()
     for (const pending of pendingProposals) {
       const racesToAdd = (pending.changes as any)?.racesToAdd?.new || []
       racesToAdd.forEach((r: any) => {
         if (r.name) pendingRaceNames.add(normalizeRaceName(r.name))
       })
     }
     
     changes.racesToAdd.new = changes.racesToAdd.new.filter(
       (r: any) => !pendingRaceNames.has(normalizeRaceName(r.name))
     )
     
     if (changes.racesToAdd.new.length === 0) {
       delete changes.racesToAdd
     }
   }
   ```

---

## Fichiers de tests créés

### `packages/agent-framework/src/services/event-matching/__tests__/match-races.test.ts`

Tests pour `matchRaces()` :
- Tolérance de distance (10%, 7%, 20%, custom)
- Fuzzy fallback par nom
- Éviter les doublons de courses DB
- Cas réel "Trail de la Grande Champagne"
- Courses sans distance

### `packages/database/src/services/race-enrichment/__tests__/category-inference.test.ts`

Tests pour `inferRaceCategories()` :
- Inférence depuis le nom de la course
- Inférence depuis le contexte de l'événement (eventName)
- Classification TRAIL par distance
- Classification RUNNING par distance
- Priorité des détections
- Normalisation des noms

### `apps/api/src/services/slack/__tests__/SlackProposalService.test.ts`

Tests ajoutés/modifiés :
- Mock de `matchRaces` pour les tests EDITION_UPDATE
- Mock de `prisma.proposal.findMany` pour la déduplication
- Test "Preserve existing categories"
- Test "racesExisting for unmatched DB races"

---

## Vérification TypeScript

```bash
npm run tsc  # Doit passer sans erreur
```

## Exécution des tests

```bash
# Tous les nouveaux tests
npx jest --testPathPatterns="match-races.test.ts|category-inference.test.ts|SlackProposalService.test.ts"

# 75 tests, tous passent
```
