# Shared Proposal Builder - Design Spec

## Goal

Extract the proposal building logic into a shared service in `agent-framework` so that all agents (FFA Scraper, Slack Agent, future agents) produce consistent, high-quality proposals without duplicating code.

## Constraints

- Interfaces with existing services (`matchEvent`, `matchRaces`, etc.) MUST NOT change
- A new matcher is being built that will work alongside the existing one — the builder must not be coupled to a specific matcher implementation
- Each agent keeps its own extraction logic (FFA scraping, Claude AI extraction, etc.)
- Each agent keeps its own deduplication logic (batch cache for FFA, PENDING check for Slack)

## Architecture

```
Agent (FFA/Slack/Google/...)
  │
  ├── 1. Extract data from source
  │      └── Output: source-specific format (FFACompetitionDetails, ExtractedEventData, ...)
  │
  ├── 2. Convert to ProposalInput
  │      └── toProposalInput(): source-specific → common format
  │
  ├── 3. Match event (unchanged)
  │      └── matchEvent() from agent-framework
  │
  ├── 4. Build proposal (NEW: shared builder)
  │      ├── buildNewEventChanges(input)
  │      └── buildEditionUpdateChanges(input, matchResult, existingRaces)
  │
  ├── 5. Deduplicate (agent-specific)
  │
  └── 6. Save proposal (unchanged)
```

## New Type: `ProposalInput`

Location: `packages/types/src/proposal-input.ts`

Common input format that all agents convert their extracted data into before calling the builder.

```typescript
interface ProposalInput {
  // Event
  eventName: string
  eventCity?: string
  eventCountry?: string
  eventDepartment?: string                        // dept code (e.g. "59")
  countrySubdivisionNameLevel1?: string            // region name (e.g. "Hauts-de-France")
  countrySubdivisionDisplayCodeLevel1?: string     // region display code (e.g. "HDF")
  countrySubdivisionNameLevel2?: string            // department name (e.g. "Nord")
  countrySubdivisionDisplayCodeLevel2?: string     // normalized dept code

  // Edition
  editionYear?: number
  editionDate?: string                             // ISO date
  editionEndDate?: string
  timeZone?: string                                // IANA (e.g. "Europe/Paris")
  calendarStatus?: string                          // e.g. "CONFIRMED"
  registrationClosingDate?: string
  dataSource?: string                              // e.g. "FEDERATION"

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
  confidence: number                               // source confidence (0-1)
  source: string                                   // e.g. "ffa", "slack", "google"
}

interface ProposalRaceInput {
  name: string
  distance?: number                                // ALWAYS in meters, builder converts to km
  elevation?: number                               // D+ in meters
  startTime?: string                               // HH:mm local
  raceDate?: string                                // for multi-day (DD/MM or ISO)
  price?: number
  categoryLevel1?: string
  categoryLevel2?: string
}
```

**Distance convention:** `ProposalRaceInput.distance` is always in **meters** (matching source data from FFA and Claude extraction). The builder converts to km when assigning to `runDistance`/`walkDistance`/`bikeDistance` fields.

**Output structure convention:**
- `buildNewEventChanges` returns `{ field: { new: value, confidence } }` format
- `buildEditionUpdateChanges` returns `{ field: { old: value, new: value } }` format

## New Service: Proposal Builder

Location: `packages/agent-framework/src/services/proposal-builder/`

### File Structure

```
packages/agent-framework/src/services/proposal-builder/
├── index.ts                  # Public exports
├── proposal-builder.ts       # buildNewEventChanges(), buildEditionUpdateChanges()
├── race-utils.ts             # Race utilities (distance, categories, date cascade)
└── __tests__/
    ├── proposal-builder.test.ts
    └── race-utils.test.ts
```

### API

#### `buildNewEventChanges(input: ProposalInput): Record<string, any>`

Builds the `changes` object for a NEW_EVENT proposal.

Responsibilities:
- Creates the `{ name: { new, confidence }, city: { new, confidence }, edition: { new: { ... } } }` structure
- Infers race categories if not already set
- Assigns distance to the correct field by category (runDistance / walkDistance / bikeDistance)
- Converts local race times to UTC using the input timezone
- Calculates edition startDate/endDate from race times
- Includes regional subdivision data if provided
- Includes organizer data with classified URLs

#### `buildEditionUpdateChanges(input: ProposalInput, matchResult: EventMatchResult, existingRaces: DbRace[], matchedRaces?: MatchedRacesResult): Record<string, any>`

Builds the `changes` object for an EDITION_UPDATE proposal.

The `matchedRaces` parameter is **optional**. If not provided, the builder calls `matchRaces()` from agent-framework internally. If provided (e.g. by the FFA agent which has richer matching with category-awareness and multi-day logic), the builder uses the pre-matched result directly. This allows agents with specialized matching needs to keep their logic without duplicating the proposal construction.

Responsibilities:
- Compares edition dates with 6-hour tolerance threshold
- Compares and merges organizer data (with URL classification: website vs facebook vs instagram)
- Uses provided `matchedRaces` or calls `matchRaces()` internally as fallback
- For matched races: proposes updates (startDate, elevation, timezone) only if meaningfully different
- For unmatched extracted races: adds to `racesToAdd` with proper distance field and categories
- For unmatched DB races: cascades edition date change while preserving precise race times (only when edition date actually changes)
- Returns `{ startDate, endDate, timeZone, calendarStatus, organizer, racesToUpdate, racesToAdd, racesExisting, registrationClosingDate }`

### Utilities in `race-utils.ts`

#### `assignDistanceByCategory(distanceMeters: number, categoryLevel1: string): Record<string, number>`

Converts meters to km and returns the correct distance field based on category:
- WALK → `{ walkDistance: distanceMeters / 1000 }`
- CYCLING → `{ bikeDistance: distanceMeters / 1000 }`
- Others → `{ runDistance: distanceMeters / 1000 }`

#### `cascadeDateToRace(newEditionDate: Date, existingRaceDate: Date, timezone: string): Date`

Changes the date portion of a race while preserving its time:
- If race is at midnight (no precise time known) → replace entirely with new date
- If race has a precise time → keep the time, change only the date
- Handles DST transitions correctly via date-fns-tz

#### `calculateEditionDates(races: ProposalRaceInput[], timezone: string): { startDate: Date, endDate: Date }`

Derives edition start/end dates from race data:
- startDate = first non-midnight race time of the earliest day
- endDate = last race time
- Falls back to midnight in edition timezone if no race times

#### `inferRaceCategories(name: string, distanceMeters?: number, walkDistanceMeters?: number, bikeDistanceMeters?: number, swimDistanceMeters?: number, eventName?: string): { categoryLevel1: string, categoryLevel2: string }`

Infers race categories from name, distances, and event context if not already set. Reuses and consolidates existing logic from `@data-agents/database` `inferRaceCategories()` and FFA Scraper.

#### `normalizeRaceName(name: string, categoryLevel1?: string): string`

Standardizes race names by removing redundant category/distance info already captured in structured fields. For example: "Trail 10km - La Course des Fous" → "La Course des Fous" when categoryLevel1 is already TRAIL and distance is set.

## Agent Migration

### FFA Scraper (`FFAScraperAgent.ts`)

**Add:** `toProposalInput(competition: FFACompetitionDetails, ligue: string): ProposalInput`
- Converts FFACompetitionDetails → ProposalInput
- Maps ligue to timezone via `getTimezoneIANA()`
- Maps ligue to region/department subdivision data
- Maps FFARace[] to ProposalRaceInput[]

**Replace:** ~550 lines of inline proposal construction with calls to:
- `buildNewEventChanges(input)`
- `buildEditionUpdateChanges(input, matchResult, existingRaces)`

**Keep unchanged:**
- Scraping logic (fetching, parsing)
- Deduplication (hash + intra-run cache)
- Progress tracking
- `matchEvent()` calls
- Custom race matching logic (category-aware, multi-day, distance tolerance) — FFA passes its pre-matched result to `buildEditionUpdateChanges()` via the optional `matchedRaces` parameter

### Slack Agent (`SlackProposalService.ts`)

**Add:** `toProposalInput(data: ExtractedEventData): ProposalInput`
- Converts ExtractedEventData → ProposalInput
- Maps department to timezone via `getTimezoneFromLocation()`
- Passes through organizer data

**Replace:** Local `buildNewEventChanges()` and `buildEditionUpdateChanges()` with calls to shared builder.

**Keep unchanged:**
- Claude AI extraction pipeline
- `matchEvent()` calls
- racesToAdd deduplication against PENDING proposals
- Slack notification flow

### Gains for Slack Agent

After migration, the Slack Agent automatically gains:
- Correct distance field by category (walkDistance for walks, bikeDistance for cycling)
- Intelligent date cascade on unmatched existing races
- Regional subdivision data (if Claude extracts department)
- Organizer URL classification (website vs facebook vs instagram)
- Race name normalization
- 6-hour tolerance for date comparisons
- Consistent confidence calculation

## What Does NOT Change

- `matchEvent()` interface and implementation
- `matchRaces()` interface and implementation
- `EventMatchResult` type
- Database schema
- Dashboard UI (it consumes the same `changes` format)
- Agent scheduling/progress/deduplication logic
