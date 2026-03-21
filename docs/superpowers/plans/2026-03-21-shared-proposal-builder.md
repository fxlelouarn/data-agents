# Shared Proposal Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract proposal building logic from FFA Scraper and Slack Agent into a shared service in `agent-framework`, so all agents produce consistent proposals.

**Architecture:** Create a `ProposalInput` type in `packages/types`, utility functions in `race-utils.ts`, and builder functions in `proposal-builder.ts`. Then migrate both agents to use the shared builder, with the FFA agent passing pre-matched races and the Slack agent using the built-in matching.

**Tech Stack:** TypeScript, date-fns-tz, fuse.js (via existing matchRaces)

**Spec:** `docs/superpowers/specs/2026-03-21-shared-proposal-builder-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/types/src/proposal-input.ts` | Create | `ProposalInput` and `ProposalRaceInput` types |
| `packages/types/src/index.ts` | Modify | Export new types |
| `packages/agent-framework/src/services/proposal-builder/race-utils.ts` | Create | Distance assignment, date cascade, edition dates, category inference, name normalization |
| `packages/agent-framework/src/services/proposal-builder/proposal-builder.ts` | Create | `buildNewEventChanges()`, `buildEditionUpdateChanges()` |
| `packages/agent-framework/src/services/proposal-builder/index.ts` | Create | Public exports |
| `packages/agent-framework/src/services/proposal-builder/__tests__/race-utils.test.ts` | Create | Tests for race utilities |
| `packages/agent-framework/src/services/proposal-builder/__tests__/proposal-builder.test.ts` | Create | Tests for builder functions |
| `apps/api/src/services/slack/SlackProposalService.ts` | Modify | Replace local builders with shared builder |
| `apps/agents/src/FFAScraperAgent.ts` | Modify | Replace inline proposal construction with shared builder |

---

## Task 1: Create ProposalInput type

**Files:**
- Create: `packages/types/src/proposal-input.ts`
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Create the type file**

```typescript
// packages/types/src/proposal-input.ts

/**
 * Common input format for the shared proposal builder.
 * All agents convert their extracted data into this format before calling the builder.
 */
export interface ProposalInput {
  // Event
  eventName: string
  eventCity?: string
  eventCountry?: string
  eventDepartment?: string
  countrySubdivisionNameLevel1?: string
  countrySubdivisionDisplayCodeLevel1?: string
  countrySubdivisionNameLevel2?: string
  countrySubdivisionDisplayCodeLevel2?: string

  // Edition
  editionYear?: number
  editionDate?: string       // ISO date (YYYY-MM-DD)
  editionEndDate?: string    // ISO date (YYYY-MM-DD)
  timeZone?: string          // IANA timezone (e.g. "Europe/Paris")
  calendarStatus?: string    // e.g. "CONFIRMED"
  registrationClosingDate?: string
  dataSource?: string        // e.g. "FEDERATION"

  // Races
  races?: ProposalRaceInput[]

  // Organizer
  organizer?: {
    name?: string
    email?: string
    phone?: string
    websiteUrl?: string
    facebookUrl?: string
    instagramUrl?: string
  }

  // URLs
  registrationUrl?: string
  websiteUrl?: string

  // Meta
  confidence: number         // source confidence (0-1)
  source: string             // e.g. "ffa", "slack", "google"
}

/**
 * Race data in common format.
 * Distance is ALWAYS in meters. The builder converts to km when assigning to DB fields.
 */
export interface ProposalRaceInput {
  name: string
  distance?: number          // meters
  elevation?: number         // D+ meters
  startTime?: string         // HH:mm local
  raceDate?: string          // for multi-day events (DD/MM or ISO)
  price?: number
  categoryLevel1?: string
  categoryLevel2?: string
}
```

- [ ] **Step 2: Export from types index**

Add to `packages/types/src/index.ts`:

```typescript
export * from './proposal-input.js'
```

- [ ] **Step 3: Build types package**

Run: `npm run build:types`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/proposal-input.ts packages/types/src/index.ts
git commit -m "feat(types): add ProposalInput and ProposalRaceInput types"
```

---

## Task 2: Create race-utils.ts

**Files:**
- Create: `packages/agent-framework/src/services/proposal-builder/race-utils.ts`
- Create: `packages/agent-framework/src/services/proposal-builder/__tests__/race-utils.test.ts`

These utilities are extracted from FFA Scraper's existing logic. Reference files:
- `apps/agents/src/FFAScraperAgent.ts` lines 996-1007 (`isMidnightInTimezone`), 1012-1021 (`isSameDateInTimezone`), 1076-1213 (`inferRaceCategories`), 1232-1290 (`calculateRaceStartDate`)
- `apps/agents/src/ffa/parser.ts` lines 509-552 (`normalizeFFARaceName`), 662-683 (`classifyOrganizerUrl`)

- [ ] **Step 1: Write tests for race-utils**

Create `packages/agent-framework/src/services/proposal-builder/__tests__/race-utils.test.ts`:

```typescript
describe('race-utils', () => {
  describe('assignDistanceByCategory', () => {
    // Import will come from ../race-utils
    const { assignDistanceByCategory } = require('../race-utils')

    it('should assign runDistance for RUNNING', () => {
      expect(assignDistanceByCategory(10000, 'RUNNING')).toEqual({ runDistance: 10 })
    })

    it('should assign walkDistance for WALK', () => {
      expect(assignDistanceByCategory(5000, 'WALK')).toEqual({ walkDistance: 5 })
    })

    it('should assign bikeDistance for CYCLING', () => {
      expect(assignDistanceByCategory(42000, 'CYCLING')).toEqual({ bikeDistance: 42 })
    })

    it('should assign runDistance for TRAIL', () => {
      expect(assignDistanceByCategory(21000, 'TRAIL')).toEqual({ runDistance: 21 })
    })

    it('should assign runDistance when category is undefined', () => {
      expect(assignDistanceByCategory(10000, undefined)).toEqual({ runDistance: 10 })
    })
  })

  describe('isMidnightInTimezone', () => {
    const { isMidnightInTimezone } = require('../race-utils')

    it('should detect midnight UTC as midnight in UTC', () => {
      expect(isMidnightInTimezone(new Date('2026-04-25T00:00:00Z'), 'UTC')).toBe(true)
    })

    it('should detect 22:00 UTC as midnight in Europe/Paris (CET+1 = summer)', () => {
      // 2026-04-25 is summer time (CEST = UTC+2), so 22:00 UTC = 00:00 CEST next day
      expect(isMidnightInTimezone(new Date('2026-04-24T22:00:00Z'), 'Europe/Paris')).toBe(true)
    })

    it('should not detect 09:00 UTC as midnight', () => {
      expect(isMidnightInTimezone(new Date('2026-04-25T09:00:00Z'), 'Europe/Paris')).toBe(false)
    })
  })

  describe('cascadeDateToRace', () => {
    const { cascadeDateToRace, isMidnightInTimezone } = require('../race-utils')

    it('should replace entirely when race is at midnight', () => {
      const newEditionDate = new Date('2026-04-26T07:00:00Z')
      const existingRace = new Date('2026-04-24T22:00:00Z') // midnight in Europe/Paris
      const result = cascadeDateToRace(newEditionDate, existingRace, 'Europe/Paris')
      // Should be midnight on the new edition date in Europe/Paris
      expect(isMidnightInTimezone(result, 'Europe/Paris')).toBe(true)
    })

    it('should preserve time when race has precise time', () => {
      const newEditionDate = new Date('2026-04-26T07:00:00Z') // April 26 at 09:00 Paris
      const existingRace = new Date('2026-04-25T07:00:00Z')   // April 25 at 09:00 Paris
      const result = cascadeDateToRace(newEditionDate, existingRace, 'Europe/Paris')
      // Should be April 26 at 09:00 Paris = 07:00 UTC
      expect(result.toISOString()).toBe('2026-04-26T07:00:00.000Z')
    })
  })

  describe('calculateEditionDates', () => {
    const { calculateEditionDates } = require('../race-utils')

    it('should use earliest race time as startDate', () => {
      const races = [
        { name: 'Trail 42k', startTime: '08:00', distance: 42000 },
        { name: 'Trail 10k', startTime: '10:00', distance: 10000 }
      ]
      const result = calculateEditionDates(races, '2026-04-25', 'Europe/Paris')
      // 08:00 Paris = 06:00 UTC (summer time)
      expect(result.startDate.toISOString()).toBe('2026-04-25T06:00:00.000Z')
    })

    it('should use latest race time as endDate', () => {
      const races = [
        { name: 'Trail 42k', startTime: '08:00', distance: 42000 },
        { name: 'Trail 10k', startTime: '10:00', distance: 10000 }
      ]
      const result = calculateEditionDates(races, '2026-04-25', 'Europe/Paris')
      expect(result.endDate.toISOString()).toBe('2026-04-25T08:00:00.000Z')
    })

    it('should fallback to midnight when no race times', () => {
      const races = [
        { name: 'Trail 42k', distance: 42000 }
      ]
      const result = calculateEditionDates(races, '2026-04-25', 'Europe/Paris')
      // Midnight Paris summer = 22:00 UTC previous day
      expect(result.startDate.toISOString()).toBe('2026-04-24T22:00:00.000Z')
    })
  })

  describe('classifyOrganizerUrl', () => {
    const { classifyOrganizerUrl } = require('../race-utils')

    it('should classify facebook URLs', () => {
      expect(classifyOrganizerUrl('https://www.facebook.com/myevent')).toEqual({
        facebookUrl: 'https://www.facebook.com/myevent'
      })
    })

    it('should classify instagram URLs', () => {
      expect(classifyOrganizerUrl('https://instagram.com/myevent')).toEqual({
        instagramUrl: 'https://instagram.com/myevent'
      })
    })

    it('should default to websiteUrl', () => {
      expect(classifyOrganizerUrl('https://myevent.fr')).toEqual({
        websiteUrl: 'https://myevent.fr'
      })
    })

    it('should return empty object for undefined', () => {
      expect(classifyOrganizerUrl(undefined)).toEqual({})
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --testPathPatterns="proposal-builder.*race-utils" --verbose`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement race-utils.ts**

Create `packages/agent-framework/src/services/proposal-builder/race-utils.ts`.

Port the following functions from existing code:
- `assignDistanceByCategory(distanceMeters, categoryLevel1)` — new function, converts meters→km and assigns correct field
- `isMidnightInTimezone(date, timezone)` — from `FFAScraperAgent.ts:996-1007`
- `isSameDateInTimezone(date1, date2, timezone)` — from `FFAScraperAgent.ts:1012-1021`
- `cascadeDateToRace(newEditionDate, existingRaceDate, timezone)` — extracted from `FFAScraperAgent.ts:814-950` cascade logic, simplified to one function
- `calculateRaceStartDate(editionDate, startTime, timezone, raceDate?)` — merged from both agents' versions, handles multi-day via optional `raceDate`
- `calculateEditionDates(races, editionDate, timezone)` — extracted from `FFAScraperAgent.ts:1302-1402`
- `classifyOrganizerUrl(url)` — from `ffa/parser.ts:662-683`
- `inferRaceCategories(name, distanceMeters?, ...)` — delegate to existing `@data-agents/database` `inferRaceCategories()` with meter→km conversion
- `normalizeRaceName(name, categoryLevel1?)` — from `ffa/parser.ts:509-552`, simplified

Key implementation notes:
- Use `fromZonedTime` from `date-fns-tz` (same import as FFA agent uses) for timezone conversion
- Use `Intl.DateTimeFormat` for timezone-aware time extraction (same as FFA agent)
- `assignDistanceByCategory` does `distanceMeters / 1000` internally
- `cascadeDateToRace`: if `isMidnightInTimezone(existingRaceDate, tz)` → return midnight of new date in tz; else extract local time from existing, apply to new date

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --testPathPatterns="proposal-builder.*race-utils" --verbose`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent-framework/src/services/proposal-builder/race-utils.ts
git add packages/agent-framework/src/services/proposal-builder/__tests__/race-utils.test.ts
git commit -m "feat(proposal-builder): add race utility functions

Extracted from FFA Scraper: distance assignment by category, date
cascade, edition date calculation, URL classification, timezone helpers."
```

---

## Task 3: Create proposal-builder.ts

**Files:**
- Create: `packages/agent-framework/src/services/proposal-builder/proposal-builder.ts`
- Create: `packages/agent-framework/src/services/proposal-builder/index.ts`
- Create: `packages/agent-framework/src/services/proposal-builder/__tests__/proposal-builder.test.ts`

Reference files:
- `apps/api/src/services/slack/SlackProposalService.ts` lines 276-557 (existing builders)
- `apps/agents/src/FFAScraperAgent.ts` lines 1407-1556 (NEW_EVENT), 276-950 (EDITION_UPDATE)

- [ ] **Step 1: Write tests for proposal-builder**

Create `packages/agent-framework/src/services/proposal-builder/__tests__/proposal-builder.test.ts`:

```typescript
describe('proposal-builder', () => {
  describe('buildNewEventChanges', () => {
    const { buildNewEventChanges } = require('../proposal-builder')

    it('should build a NEW_EVENT changes object with correct structure', () => {
      const input = {
        eventName: 'Color Run Petite-Synthe',
        eventCity: 'Dunkerque',
        eventCountry: 'France',
        eventDepartment: '59',
        editionYear: 2026,
        editionDate: '2026-04-25',
        timeZone: 'Europe/Paris',
        races: [
          { name: '5 kms marche', distance: 5000, startTime: '14:00', categoryLevel1: 'WALK' },
          { name: '5 kms course', distance: 5000, startTime: '14:00', categoryLevel1: 'RUNNING', categoryLevel2: 'KM5' },
          { name: '10 kms course', distance: 10000, startTime: '14:00', categoryLevel1: 'RUNNING', categoryLevel2: 'KM10' }
        ],
        organizer: { name: 'les jeunes de Petite-Synthe' },
        confidence: 0.85,
        source: 'slack'
      }

      const changes = buildNewEventChanges(input)

      // Root level fields
      expect(changes.name).toEqual({ new: 'Color Run Petite-Synthe', confidence: 0.85 })
      expect(changes.city).toEqual({ new: 'Dunkerque', confidence: 0.85 })
      expect(changes.country).toEqual({ new: 'France', confidence: 0.85 })

      // Edition
      expect(changes.edition.new.year).toBe('2026')
      expect(changes.edition.new.timeZone).toBe('Europe/Paris')
      expect(changes.edition.new.races).toHaveLength(3)

      // Walk race should use walkDistance
      const walkRace = changes.edition.new.races.find(r => r.name === '5 kms marche')
      expect(walkRace.walkDistance).toBe(5)
      expect(walkRace.runDistance).toBeUndefined()

      // Running race should use runDistance
      const runRace = changes.edition.new.races.find(r => r.name === '10 kms course')
      expect(runRace.runDistance).toBe(10)
      expect(runRace.walkDistance).toBeUndefined()

      // Organizer
      expect(changes.edition.new.organizer.name).toBe('les jeunes de Petite-Synthe')
    })

    it('should include subdivision data when provided', () => {
      const input = {
        eventName: 'Trail Test',
        eventCity: 'Dijon',
        countrySubdivisionNameLevel1: 'Bourgogne-Franche-Comté',
        countrySubdivisionDisplayCodeLevel1: 'BFC',
        editionDate: '2026-06-15',
        timeZone: 'Europe/Paris',
        confidence: 0.9,
        source: 'ffa'
      }

      const changes = buildNewEventChanges(input)
      expect(changes.countrySubdivisionNameLevel1.new).toBe('Bourgogne-Franche-Comté')
      expect(changes.countrySubdivisionDisplayCodeLevel1.new).toBe('BFC')
    })
  })

  describe('buildEditionUpdateChanges', () => {
    const { buildEditionUpdateChanges } = require('../proposal-builder')

    it('should detect date changes with 6-hour tolerance', () => {
      const input = {
        eventName: 'Trail Test',
        editionDate: '2026-06-15',
        timeZone: 'Europe/Paris',
        races: [],
        confidence: 0.9,
        source: 'ffa'
      }

      const matchResult = {
        type: 'FUZZY_MATCH',
        event: { id: 123, name: 'Trail Test', city: 'Dijon' },
        edition: { id: 456, year: 2026, startDate: new Date('2026-06-14T22:00:00Z') }, // June 15 midnight Paris
        confidence: 0.9
      }

      // Same date (June 15 midnight Paris) — should NOT propose startDate change
      const changes = buildEditionUpdateChanges(input, matchResult, [])
      expect(changes.startDate).toBeUndefined()
    })

    it('should put unmatched extracted races in racesToAdd', () => {
      const input = {
        eventName: 'Trail Test',
        editionDate: '2026-06-15',
        timeZone: 'Europe/Paris',
        races: [
          { name: 'Trail 20km', distance: 20000, startTime: '09:00', categoryLevel1: 'TRAIL' }
        ],
        confidence: 0.9,
        source: 'slack'
      }

      const matchResult = {
        type: 'FUZZY_MATCH',
        event: { id: 123, name: 'Trail Test', city: 'Dijon' },
        edition: { id: 456, year: 2026, startDate: new Date('2026-06-14T22:00:00Z') },
        confidence: 0.9
      }

      const changes = buildEditionUpdateChanges(input, matchResult, [])
      expect(changes.racesToAdd).toBeDefined()
      expect(changes.racesToAdd.new).toHaveLength(1)
      expect(changes.racesToAdd.new[0].runDistance).toBe(20)
    })

    it('should accept pre-matched races via optional parameter', () => {
      const input = {
        eventName: 'Trail Test',
        editionDate: '2026-06-15',
        timeZone: 'Europe/Paris',
        races: [
          { name: 'Trail 20km', distance: 20000, startTime: '09:00', categoryLevel1: 'TRAIL' }
        ],
        confidence: 0.9,
        source: 'ffa'
      }

      const matchResult = {
        type: 'FUZZY_MATCH',
        event: { id: 123, name: 'Trail Test', city: 'Dijon' },
        edition: { id: 456, year: 2026, startDate: new Date('2026-06-14T22:00:00Z') },
        confidence: 0.9
      }

      const existingRaces = [
        { id: 789, name: 'Trail 20 km', runDistance: 20, startDate: new Date('2026-06-15T07:00:00Z') }
      ]

      // Pre-matched: the FFA agent already matched input race to DB race
      const preMatched = {
        matched: [{ input: { name: 'Trail 20km', distance: 20 }, db: existingRaces[0] }],
        unmatched: []
      }

      const changes = buildEditionUpdateChanges(input, matchResult, existingRaces, preMatched)
      // Should have racesToUpdate (not racesToAdd) since race was pre-matched
      expect(changes.racesToAdd).toBeUndefined()
      expect(changes.racesToUpdate).toBeDefined()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --testPathPatterns="proposal-builder/__tests__/proposal-builder" --verbose`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement proposal-builder.ts**

Create `packages/agent-framework/src/services/proposal-builder/proposal-builder.ts`.

**`buildNewEventChanges(input: ProposalInput)`** implementation:
- Port structure from `SlackProposalService.ts:276-369` but enhanced with FFA capabilities:
  - Use `assignDistanceByCategory()` instead of always `runDistance`
  - Use `inferRaceCategories()` when categories missing
  - Use `calculateEditionDates()` for start/end
  - Use `calculateRaceStartDate()` with multi-day support (`raceDate`)
  - Include `countrySubdivision*` fields when present
  - Include `calendarStatus` and `dataSource` when present
  - Use `classifyOrganizerUrl()` for organizer URLs
- Output format: `{ field: { new: value, confidence } }` at root level, `edition: { new: { ... }, confidence }` with races/organizer nested

**`buildEditionUpdateChanges(input, matchResult, existingRaces, matchedRaces?)`** implementation:
- Port from both `SlackProposalService.ts:376-557` and `FFAScraperAgent.ts:276-950`
- Date comparison: calculate new startDate/endDate, compare with edition dates using 6-hour tolerance (from FFA: `Math.abs(diff) > 6 * 3600 * 1000`)
- Organizer: compare with existing, use `classifyOrganizerUrl()` for URLs
- Race handling:
  - If `matchedRaces` provided → use directly (FFA path)
  - Else → call `matchRaces()` from `../event-matching` (Slack path)
  - For matched: build `racesToUpdate` with `{ old, new }` diffs for startDate, elevation, timezone, categories (only if DB empty)
  - For unmatched input: build `racesToAdd` with `assignDistanceByCategory()`, `calculateRaceStartDate()`
  - For unmatched DB: build `racesExisting` and apply `cascadeDateToRace()` if edition date changed
- Output format: `{ field: { old: value, new: value } }`

- [ ] **Step 4: Create index.ts**

Create `packages/agent-framework/src/services/proposal-builder/index.ts`:

```typescript
export { buildNewEventChanges, buildEditionUpdateChanges } from './proposal-builder.js'
export {
  assignDistanceByCategory,
  cascadeDateToRace,
  calculateRaceStartDate,
  calculateEditionDates,
  classifyOrganizerUrl,
  isMidnightInTimezone,
  isSameDateInTimezone,
  inferRaceCategories,
  normalizeRaceName
} from './race-utils.js'
```

- [ ] **Step 5: Export from agent-framework**

Add to `packages/agent-framework/src/services/event-matching/index.ts` (or a new top-level export):

Verify how `agent-framework` exports services, and add the proposal-builder exports. The builder should be importable as:
```typescript
import { buildNewEventChanges, buildEditionUpdateChanges } from '@data-agents/agent-framework'
```

- [ ] **Step 6: Run tests**

Run: `npx jest --testPathPatterns="proposal-builder" --verbose`
Expected: All PASS

- [ ] **Step 7: Build to verify types**

Run: `npm run build:framework`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add packages/agent-framework/src/services/proposal-builder/
git commit -m "feat(proposal-builder): add shared buildNewEventChanges and buildEditionUpdateChanges

Shared service that produces consistent proposal changes objects.
Supports pre-matched races (for FFA) or automatic matching (for Slack).
Includes date cascade, distance by category, URL classification."
```

---

## Task 4: Migrate Slack Agent

**Files:**
- Modify: `apps/api/src/services/slack/SlackProposalService.ts`

The Slack Agent is simpler to migrate first — it currently uses `matchRaces()` already and has less custom logic.

- [ ] **Step 1: Add toProposalInput conversion function**

Add at the top of `SlackProposalService.ts` (after imports):

```typescript
import { buildNewEventChanges, buildEditionUpdateChanges } from '@data-agents/agent-framework'
import type { ProposalInput, ProposalRaceInput } from '@data-agents/types'

function toProposalInput(data: ExtractedEventData): ProposalInput {
  return {
    eventName: data.eventName,
    eventCity: data.eventCity,
    eventCountry: data.eventCountry || 'France',
    eventDepartment: data.eventDepartment,
    editionYear: data.editionYear,
    editionDate: data.editionDate,
    editionEndDate: data.editionEndDate,
    timeZone: getTimezoneFromLocation({
      department: data.eventDepartment,
      country: data.eventCountry,
    }),
    races: data.races?.map(r => ({
      name: r.name,
      distance: r.distance,       // already in meters
      elevation: r.elevation,
      startTime: r.startTime,
      price: r.price,
      categoryLevel1: r.categoryLevel1,
      categoryLevel2: r.categoryLevel2,
    })),
    organizer: (data.organizerName || data.organizerEmail || data.organizerWebsite) ? {
      name: data.organizerName,
      email: data.organizerEmail,
      phone: data.organizerPhone,
      websiteUrl: data.organizerWebsite,
    } : undefined,
    registrationUrl: data.registrationUrl,
    confidence: data.confidence || 0.5,
    source: 'slack',
  }
}
```

- [ ] **Step 2: Replace local buildNewEventChanges**

In `createProposalFromSlack()` (around line 698), replace:
```typescript
changes = buildNewEventChanges(extractedData)
```
with:
```typescript
const proposalInput = toProposalInput(extractedData)
changes = buildNewEventChanges(proposalInput)
```

- [ ] **Step 3: Replace local buildEditionUpdateChanges**

In `createProposalFromSlack()` (around line 735), replace:
```typescript
changes = buildEditionUpdateChanges(extractedData, matchResult, existingRaces)
```
with:
```typescript
const proposalInput = toProposalInput(extractedData)
changes = buildEditionUpdateChanges(proposalInput, matchResult, existingRaces)
```

- [ ] **Step 4: Remove old local functions**

Delete the following local functions from `SlackProposalService.ts`:
- `buildNewEventChanges()` (lines 276-369)
- `buildEditionUpdateChanges()` (lines 376-557)
- `enrichRaceWithCategories()` (lines 100-122)
- `calculateRaceStartDate()` (lines 132-151)

Keep `toProposalInput()`, `calculateNewEventConfidence()`, `calculateAdjustedConfidence()`, and the deduplication logic (racesToAdd against PENDING proposals).

- [ ] **Step 5: Run type check**

Run: `npm run tsc`
Expected: No type errors

- [ ] **Step 6: Run tests**

Run: `npx jest --testPathPatterns="proposal-type-decision|SlackProposalService" --verbose`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/slack/SlackProposalService.ts
git commit -m "refactor(slack-agent): use shared proposal builder

Replace local buildNewEventChanges/buildEditionUpdateChanges with
shared builder from agent-framework. Gains: distance by category,
date cascade, URL classification, race name normalization."
```

---

## Task 5: Migrate FFA Scraper

**Files:**
- Modify: `apps/agents/src/FFAScraperAgent.ts`

The FFA agent is more complex — it keeps its custom race matching and passes pre-matched results to the builder.

- [ ] **Step 1: Add toProposalInput conversion function**

Add a method to `FFAScraperAgent` class:

```typescript
import { buildNewEventChanges, buildEditionUpdateChanges } from '@data-agents/agent-framework'
import type { ProposalInput, ProposalRaceInput } from '@data-agents/types'

private toProposalInput(
  competition: FFACompetitionDetails,
  ligue: string
): ProposalInput {
  const timezone = this.getTimezoneIANA(ligue)
  const regionInfo = this.getRegionInfo(ligue) // extract existing ligue→region mapping

  return {
    eventName: competition.competition.name,
    eventCity: competition.competition.city,
    eventCountry: 'France',
    eventDepartment: competition.competition.department,
    countrySubdivisionNameLevel1: regionInfo?.regionName,
    countrySubdivisionDisplayCodeLevel1: regionInfo?.regionCode,
    countrySubdivisionNameLevel2: regionInfo?.departmentName,
    countrySubdivisionDisplayCodeLevel2: competition.competition.department,
    editionYear: competition.startDate.getFullYear(),
    editionDate: competition.startDate.toISOString().split('T')[0],
    editionEndDate: competition.endDate?.toISOString().split('T')[0],
    timeZone: timezone,
    calendarStatus: 'CONFIRMED',
    registrationClosingDate: competition.registrationClosingDate?.toISOString(),
    dataSource: 'FEDERATION',
    races: competition.races.map(r => ({
      name: r.name,
      distance: r.distance,           // already in meters from FFA
      elevation: r.positiveElevation,
      startTime: r.startTime,
      raceDate: r.raceDate,           // DD/MM for multi-day
      categoryLevel1: undefined,       // let builder infer
      categoryLevel2: undefined,
    })),
    organizer: {
      name: competition.organizerName,
      email: competition.organizerEmail,
      phone: competition.organizerPhone,
      websiteUrl: competition.organizerWebsite,
    },
    registrationUrl: competition.registrationUrl,
    confidence: 0.9,
    source: 'ffa',
  }
}
```

- [ ] **Step 2: Replace NEW_EVENT proposal construction**

In `createProposalsForCompetition()`, replace the ~120 lines of NEW_EVENT `changes` construction with:

```typescript
const proposalInput = this.toProposalInput(competition, ligue)
const changes = buildNewEventChanges(proposalInput)
```

Keep: confidence calculation, justification building, deduplication logic.

- [ ] **Step 3: Replace EDITION_UPDATE proposal construction**

In `compareFFAWithEdition()`, the FFA agent keeps its custom race matching (category-aware, multi-day, distance tolerance). Replace only the proposal `changes` construction:

```typescript
// FFA keeps its own race matching (lines 460-580)
const matchedRaces = this.matchFFARacesWithDB(competition.races, existingRaces, ...)

// Convert to RaceMatchResult format for the builder
const preMatchedResult = {
  matched: matchedRaces.matched.map(m => ({
    input: { name: m.ffaRace.name, distance: m.ffaRace.distance / 1000 },
    db: m.dbRace
  })),
  unmatched: matchedRaces.unmatched.map(r => ({
    name: r.name,
    distance: r.distance / 1000
  }))
}

const proposalInput = this.toProposalInput(competition, ligue)
const changes = buildEditionUpdateChanges(proposalInput, matchResult, existingRaces, preMatchedResult)
```

Keep: the custom race matching logic, deduplication, justification building.

- [ ] **Step 4: Remove old inline construction code**

Delete the following from `FFAScraperAgent.ts`:
- Inline NEW_EVENT `changes` construction (~lines 1423-1548)
- Inline EDITION_UPDATE `changes` construction in `compareFFAWithEdition` (~lines 276-450 for date/org/status comparisons and lines 580-950 for race proposal building)
- Private methods now in `race-utils.ts`: `isMidnightInTimezone`, `isSameDateInTimezone`, `calculateEditionStartDate`, `calculateEditionEndDate`

Keep: `compareFFAWithEdition` race matching logic, `getTimezoneIANA`, ligue-to-region mapping, confidence calculations, deduplication.

- [ ] **Step 5: Move classifyOrganizerUrl and normalizeFFARaceName references**

In `apps/agents/src/ffa/parser.ts`, keep `classifyOrganizerUrl` and `normalizeFFARaceName` as they are (the builder has its own versions in `race-utils.ts`). The FFA agent may still use them for `toProposalInput` conversion. No changes needed in parser.ts.

- [ ] **Step 6: Run type check**

Run: `npm run tsc`
Expected: No type errors

- [ ] **Step 7: Run full test suite**

Run: `npx jest --testPathPatterns="proposal-builder|date-penalty" --verbose`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add apps/agents/src/FFAScraperAgent.ts
git commit -m "refactor(ffa-scraper): use shared proposal builder

Replace ~550 lines of inline proposal construction with shared builder.
FFA keeps its custom race matching and passes pre-matched results.
Builder handles distance assignment, date cascade, organizer URLs."
```

---

## Task 6: Final verification

- [ ] **Step 1: Full type check**

Run: `npm run tsc`
Expected: No errors across all packages

- [ ] **Step 2: Full build**

Run: `npm run build`
Expected: All packages build successfully

- [ ] **Step 3: Run all tests**

Run: `npx jest --testPathPatterns="proposal-builder|proposal-type-decision|date-penalty" --verbose`
Expected: All PASS

- [ ] **Step 4: Verify no regressions in existing tests**

Run: `npx jest --verbose`
Expected: All existing tests still pass

- [ ] **Step 5: Final commit if adjustments needed**

---

## Migration Verification Checklist

After implementation, verify these behaviors are preserved:

| Behavior | FFA Scraper | Slack Agent |
|---|---|---|
| Walk races use `walkDistance` | Was ✅, still ✅ | Was ❌ `runDistance`, now ✅ `walkDistance` |
| Cycling races use `bikeDistance` | Was ✅, still ✅ | Was ❌ `runDistance`, now ✅ `bikeDistance` |
| Date cascade preserves race time | Was ✅, still ✅ | Was ❌ none, now ✅ |
| 6h date comparison tolerance | Was ✅, still ✅ | Was ❌ none, now ✅ |
| Organizer URL classification | Was ✅, still ✅ | Was ❌ single field, now ✅ |
| Subdivision data | Was ✅, still ✅ | Gains it if Claude extracts dept |
| Custom race matching | Keeps own matching | Uses shared `matchRaces()` |
| Deduplication | Keeps hash + intra-run | Keeps PENDING dedup |
