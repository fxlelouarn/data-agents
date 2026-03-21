# Fix Slack Agent Matching Issues

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 bugs in the Slack Agent proposal flow: weak date penalty in matching, EDITION_UPDATE created without editionId, and wrong year inference from dateless posters.

**Architecture:** Three independent fixes touching extraction prompts, event matching scoring, and SlackProposalService proposal type decision. Each fix is self-contained and testable independently.

**Tech Stack:** TypeScript, Prisma, fuse.js, Claude API prompts

---

## Context

When a user shares an event poster via Slack (e.g. "Color Run - Samedi 25 Avril - Petite-Synthe"), three things go wrong:

1. **Wrong year**: Claude extracts "2023-04-25" (past Saturday) instead of "2026-04-25" (next Saturday)
2. **False positive matching**: "Color Run" at Petite-Synthe matches "Color Night Run" at Deulemont (score 0.82) because the date penalty is only 20% max
3. **Broken proposal**: Even when the event matches but no edition exists, `EDITION_UPDATE` is created with `editionId = NULL`, making the proposal unvalidatable

### Root Cause Analysis

**Bug 1 - Date extraction**: The prompt says `Date du jour: ${today}` but has no rule about inferring future dates when year is missing. Claude picks the nearest past date matching the day-of-week.

**Bug 2 - Date penalty**: `dateMultiplier = 0.8 + (dateProximity * 0.2)` means the worst case is a 20% penalty. When Meilisearch finds candidates by name (no date filter), an event with zero date proximity still scores 80% of its name-based score. This is far too weak.

**Bug 3 - Missing editionId**: In `SlackProposalService.ts` line 695-707, if `matchResult.type !== 'NO_MATCH'` → `EDITION_UPDATE`, regardless of whether `matchResult.edition` exists. Line 801: `editionId: matchResult.edition?.id?.toString()` → `undefined` → `NULL` in DB.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/api/src/services/slack/extractors/types.ts` | Modify | Add future-date inference rule to extraction prompt |
| `packages/agent-framework/src/services/event-matching/event-matcher.ts` | Modify | Strengthen date penalty in scoring formula |
| `apps/api/src/services/slack/SlackProposalService.ts` | Modify | Handle missing edition gracefully |
| `packages/agent-framework/src/services/event-matching/__tests__/date-penalty.test.ts` | Create | Tests for date penalty scoring |
| `apps/api/src/services/slack/__tests__/proposal-type-decision.test.ts` | Create | Tests for NEW_EVENT vs EDITION_UPDATE decision |

---

## Task 1: Fix date extraction prompt (future date inference)

**Files:**
- Modify: `apps/api/src/services/slack/extractors/types.ts:71-93`

### Problem

The poster says "Samedi 25 Avril" with no year. Claude sees `Date du jour: 2026-03-21` but has no instruction to pick the future occurrence. It picked 2023-04-25 (past Saturday) instead of 2026-04-25 (next Saturday).

### Fix

Add a rule about inferring dates when year is missing.

- [ ] **Step 1: Read the current prompt**

File: `apps/api/src/services/slack/extractors/types.ts` lines 71-93

- [ ] **Step 2: Add future-date inference rule to EXTRACTION_PROMPT_SYSTEM**

In the `RÈGLES CRITIQUES` section, after the existing date rules, add:

```typescript
// Add after line 85 ("Si tu ne trouves pas de date précise, omets editionDate ET editionYear...")
- Si une date est mentionnée SANS année (ex: "Samedi 25 Avril", "le 15 mars", "dimanche 8 juin"), c'est une date EXPLICITE. Utilise la date du jour fournie pour déduire l'année: choisis la PROCHAINE occurrence future de cette date (pas une date passée). Exemple: si on est le 2026-03-21 et l'affiche dit "Samedi 25 Avril", la date est 2026-04-25.
```

The updated EXTRACTION_PROMPT_SYSTEM should look like:

```typescript
export const EXTRACTION_PROMPT_SYSTEM = `Tu es un assistant spécialisé dans l'extraction d'informations sur les événements sportifs (courses à pied, trails, marathons, etc.) en France.

Tu dois extraire les informations suivantes si elles sont EXPLICITEMENT présentes dans le texte:
- Nom de l'événement
- Ville et département
- Date(s) de l'événement
- Liste des courses avec: nom, distance, dénivelé, heure de départ, prix
- Informations sur l'organisateur
- Lien d'inscription

RÈGLES CRITIQUES:
- N'INVENTE JAMAIS de données. Si une information n'est pas explicitement dans le texte, NE L'INCLUS PAS.
- Pour les dates: tu dois trouver une date EXPLICITE (ex: "5 mars 2025", "05/03/2025"). N'invente JAMAIS de date.
- Si une date est mentionnée SANS année (ex: "Samedi 25 Avril", "le 15 mars", "dimanche 8 juin"), c'est une date EXPLICITE. Utilise la date du jour fournie pour déduire l'année: choisis la PROCHAINE occurrence future de cette date (pas une date passée). Exemple: si on est le 2026-03-21 et l'affiche dit "Samedi 25 Avril", la date est 2026-04-25.
- Si le contenu est principalement du code JavaScript/CSS ou du charabia technique, retourne {"error": "page_spa_no_content", "eventName": null}
- Si tu ne trouves pas de date précise, omets editionDate ET editionYear - ne les invente pas.
- Le score de confiance doit être < 0.3 si tu n'as pas trouvé de date.

FORMAT:
- Réponds UNIQUEMENT en JSON valide, sans commentaires ni texte avant/après
- Si une information n'est pas trouvée, omets le champ (ne mets pas null)
- Pour les distances, convertis en mètres (10km = 10000)
- Pour les dates, utilise le format ISO (YYYY-MM-DD)
- Pour les heures, utilise le format HH:mm`
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/slack/extractors/types.ts
git commit -m "fix(extraction): infer future year when date has no explicit year"
```

---

## Task 2: Strengthen date penalty in event matching

**Files:**
- Modify: `packages/agent-framework/src/services/event-matching/event-matcher.ts:256`
- Create: `packages/agent-framework/src/services/event-matching/__tests__/date-penalty.test.ts`

### Problem

Current formula: `dateMultiplier = 0.8 + (dateProximity * 0.2)`
- Minimum penalty: 20% (dateProximity = 0, multiplier = 0.8)
- A good name match with zero date proximity still scores high enough to pass the 0.75 threshold

### Fix

Change the formula to make the penalty significantly stronger when there's zero date proximity (no edition within ±90 days). The new formula should penalize up to 50% instead of 20%:

```typescript
const dateMultiplier = 0.5 + (candidate.dateProximity * 0.5)
```

This gives:
- **dateProximity = 0** (no edition within ±90 days): multiplier = **0.5** (50% penalty)
- **dateProximity = 0.5** (45 days away): multiplier = **0.75**
- **dateProximity = 1.0** (same day): multiplier = **1.0** (no penalty)

Impact on Color Run example: score drops from 0.82 to ~0.51, well below the 0.75 threshold → NO_MATCH.

- [ ] **Step 1: Write failing test**

Create file `packages/agent-framework/src/services/event-matching/__tests__/date-penalty.test.ts`:

```typescript
/**
 * Tests for the dateMultiplier calculation in event matching scoring.
 *
 * The dateMultiplier penalizes matches when no edition exists near the searched date.
 * Formula: dateMultiplier = 0.5 + (dateProximity * 0.5)
 *
 * dateProximity = max(0, 1 - daysDiff/90)
 *   - 0 = no edition within ±90 days
 *   - 0.5 = closest edition is 45 days away
 *   - 1.0 = edition on same day
 */
describe('dateMultiplier scoring', () => {
  // Helper that replicates the scoring formula
  function calculateDateMultiplier(dateProximity: number): number {
    return 0.5 + (dateProximity * 0.5)
  }

  function calculateDateProximity(daysDiff: number): number {
    return Math.max(0, 1 - (daysDiff / 90))
  }

  it('should penalize 50% when no edition within 90 days', () => {
    const multiplier = calculateDateMultiplier(0)
    expect(multiplier).toBe(0.5)
  })

  it('should apply no penalty when edition is on same day', () => {
    const multiplier = calculateDateMultiplier(1.0)
    expect(multiplier).toBe(1.0)
  })

  it('should apply 25% penalty when edition is 45 days away', () => {
    const proximity = calculateDateProximity(45)
    const multiplier = calculateDateMultiplier(proximity)
    expect(multiplier).toBe(0.75)
  })

  it('should drop a good name match below threshold when no edition exists', () => {
    // Simulate "Color Run" matching "Color Night Run" with dept bonus
    const nameScore = 0.53
    const cityScore = 0
    const alternativeScore = 0.53
    const departmentBonus = 0.15

    // Score formula for nameScore < 0.9:
    // combined = (nameScore*0.5 + cityScore*0.3 + altScore*0.2 + deptBonus) * dateMultiplier
    const baseScore = nameScore * 0.5 + cityScore * 0.3 + alternativeScore * 0.2 + departmentBonus

    // With zero date proximity (multiplier = 0.5)
    const combined = baseScore * calculateDateMultiplier(0)
    expect(combined).toBeLessThan(0.75) // Must be below matching threshold
  })

  it('should keep a good match above threshold when edition is close', () => {
    // Same name match but with a matching edition 10 days away
    const nameScore = 0.53
    const cityScore = 0.5
    const alternativeScore = 0.53
    const departmentBonus = 0.15

    const baseScore = nameScore * 0.5 + cityScore * 0.3 + alternativeScore * 0.2 + departmentBonus
    const proximity = calculateDateProximity(10)
    const combined = baseScore * calculateDateMultiplier(proximity)
    expect(combined).toBeGreaterThan(0.75) // Should still pass threshold
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-framework && npx jest --testPathPatterns="date-penalty" -v`
Expected: PASS (this tests the new formula we're about to implement — the test validates our expected behavior)

- [ ] **Step 3: Update the scoring formula**

In `packages/agent-framework/src/services/event-matching/event-matcher.ts` line 256, change:

```typescript
// BEFORE
const dateMultiplier = 0.8 + (candidate.dateProximity * 0.2)

// AFTER
const dateMultiplier = 0.5 + (candidate.dateProximity * 0.5)
```

- [ ] **Step 4: Run tests to verify no regressions**

Run: `cd packages/agent-framework && npx jest --testPathPatterns="event-match" -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent-framework/src/services/event-matching/event-matcher.ts
git add packages/agent-framework/src/services/event-matching/__tests__/date-penalty.test.ts
git commit -m "fix(matching): strengthen date penalty from 20% to 50% max

When no edition exists within ±90 days of the searched date, the score
multiplier drops to 0.5 instead of 0.8. This prevents false positive
matches like 'Color Run' (April) matching 'Color Night Run' (August)."
```

---

## Task 3: Handle missing edition in SlackProposalService

**Files:**
- Modify: `apps/api/src/services/slack/SlackProposalService.ts:695-710`
- Create: `apps/api/src/services/slack/__tests__/proposal-type-decision.test.ts`

### Problem

When `matchResult.type === 'FUZZY_MATCH'` but `matchResult.edition` is `undefined` (event found, no edition for that year), the code creates `EDITION_UPDATE` with `editionId = NULL`. This makes the proposal unvalidatable.

### Fix

Add a check: if the event matched but no edition exists, treat as `NEW_EVENT`. The matched event info is still useful — it's preserved in the justification/rejectedMatches for the user to link manually if needed.

- [ ] **Step 1: Write failing test**

Create file `apps/api/src/services/slack/__tests__/proposal-type-decision.test.ts`:

```typescript
/**
 * Tests for the proposal type decision logic in SlackProposalService.
 *
 * When event matching finds an event but NO edition for the searched year,
 * the proposal should be NEW_EVENT (not EDITION_UPDATE with null editionId).
 */
describe('Proposal type decision', () => {
  it('should be EDITION_UPDATE when event AND edition are found', () => {
    const matchResult = {
      type: 'FUZZY_MATCH' as const,
      event: { id: 15126, name: 'Color Night Run', city: 'Deulemont' },
      edition: { id: 50514, year: 2025 },
      confidence: 0.85
    }
    const shouldBeNewEvent = matchResult.type === 'NO_MATCH' ||
      matchResult.confidence < 0.75 ||
      !matchResult.edition
    expect(shouldBeNewEvent).toBe(false)
  })

  it('should be NEW_EVENT when event found but NO edition', () => {
    const matchResult = {
      type: 'FUZZY_MATCH' as const,
      event: { id: 15126, name: 'Color Night Run', city: 'Deulemont' },
      edition: undefined,
      confidence: 0.85
    }
    const shouldBeNewEvent = matchResult.type === 'NO_MATCH' ||
      matchResult.confidence < 0.75 ||
      !matchResult.edition
    expect(shouldBeNewEvent).toBe(true)
  })

  it('should be NEW_EVENT when match confidence is below threshold', () => {
    const matchResult = {
      type: 'FUZZY_MATCH' as const,
      event: { id: 15126, name: 'Color Night Run', city: 'Deulemont' },
      edition: { id: 50514, year: 2025 },
      confidence: 0.5
    }
    const shouldBeNewEvent = matchResult.type === 'NO_MATCH' ||
      matchResult.confidence < 0.75 ||
      !matchResult.edition
    expect(shouldBeNewEvent).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify behavior**

Run: `cd apps/api && npx jest --testPathPatterns="proposal-type-decision" -v`
Expected: All PASS (these encode the correct behavior)

- [ ] **Step 3: Update SlackProposalService**

In `apps/api/src/services/slack/SlackProposalService.ts`, modify the decision block at line 695:

```typescript
// BEFORE (line 695-707)
if (matchResult.type === 'NO_MATCH' || matchResult.confidence < DEFAULT_MATCHING_CONFIG.similarityThreshold) {
  // Pas de match ou match trop faible → NEW_EVENT
  proposalType = ProposalType.NEW_EVENT
  // ...
} else {
  // Match trouvé → EDITION_UPDATE
  proposalType = ProposalType.EDITION_UPDATE
  // ...
}

// AFTER
if (matchResult.type === 'NO_MATCH' || matchResult.confidence < DEFAULT_MATCHING_CONFIG.similarityThreshold || !matchResult.edition) {
  // Pas de match, match trop faible, ou événement trouvé sans édition → NEW_EVENT
  proposalType = ProposalType.NEW_EVENT
  changes = buildNewEventChanges(extractedData)
  confidence = calculateNewEventConfidence(
    extractedData.confidence,
    matchResult,
    hasOrganizerInfo,
    raceCount
  )

  if (matchResult.event && !matchResult.edition) {
    logger.info(`Event "${matchResult.event.name}" found but no edition for searched year → creating NEW_EVENT`)
  }
} else {
  // Match trouvé avec édition → EDITION_UPDATE
  proposalType = ProposalType.EDITION_UPDATE
  // ... (rest unchanged)
}
```

- [ ] **Step 4: Run the full test suite**

Run: `cd apps/api && npx jest --testPathPatterns="proposal-type-decision|slack" -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/slack/SlackProposalService.ts
git add apps/api/src/services/slack/__tests__/proposal-type-decision.test.ts
git commit -m "fix(slack-agent): create NEW_EVENT when event found but no edition

When the matching finds an event but no edition for the searched year,
the Slack Agent now creates a NEW_EVENT proposal instead of an
EDITION_UPDATE with null editionId. This prevents unvalidatable
proposals in the dashboard."
```

---

## Task 4: Verify and clean up

- [ ] **Step 1: Run full type check**

Run: `npm run tsc`
Expected: No type errors

- [ ] **Step 2: Run full test suite**

Run: `npm run test:run`
Expected: All tests pass

- [ ] **Step 3: Final commit if any adjustments needed**

---

## Impact Assessment

| Fix | Before | After |
|-----|--------|-------|
| **Date extraction** | "Samedi 25 Avril" → 2023-04-25 | → 2026-04-25 |
| **Date penalty** | 20% max → score 0.82 for wrong event | 50% max → score ~0.51, below threshold |
| **Missing edition** | EDITION_UPDATE with null editionId (unvalidatable) | NEW_EVENT (proper proposal flow) |

These 3 fixes work together: Fix 1 gives the right date → Fix 2 uses that date to penalize bad matches → Fix 3 is a safety net for any remaining edge cases where event matches but edition doesn't exist.
