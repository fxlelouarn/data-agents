# Design: Include Event Attributes When Converting NEW_EVENT → EDITION_UPDATE

**Date**: 2026-03-23
**Status**: Approved

## Problem

When a NEW_EVENT proposal is converted to an EDITION_UPDATE (because the user identifies a matching existing event), the event-level attributes (name, city, department, country, website) from the original proposal are discarded. Only edition-level data (dates, races, organizer) is transferred.

This means the user loses the ability to update the existing event's attributes with the agent's proposed values, even when they differ from current data.

## Solution

Include the event attributes from the NEW_EVENT proposal in the converted EDITION_UPDATE proposal, using the standard old/new format. The existing "event" block validation mechanism (already working in grouped proposals) handles display and application.

## Scope

**Event fields to transfer**: `name`, `city`, `country`, `countrySubdivisionNameLevel1` (department), `websiteUrl`

Only fields where the proposed value differs from the existing event value are included — no noise from identical values.

## Changes

### 1. Backend — `apps/api/src/routes/proposals.ts` (endpoint `convert-to-edition-update`)

- Fetch the existing Event from Miles Republic (currently only the Edition is fetched)
- Extract the target event fields from `originalChanges` (top-level fields in NEW_EVENT format: `{ new: value, confidence }`)
- For each field, compare proposed vs existing value; if different, add to `editionChanges` with `{ old, new, confidence }` format
- These fields are then naturally routed by the existing block field mapping to the "event" block

### 2. Frontend — `apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateDetail.tsx`

- Add event/edition field separation (filter `consolidatedChanges` using EVENT_FIELDS, same as `EditionUpdateGroupedDetail.tsx` lines 229-243)
- Add `CategorizedEventChangesTable` rendering with block validation for the "event" block
- Show the event block only when event changes exist or the block is already validated

### 3. No changes needed

- `proposal-domain.service.ts` — Already routes event fields to `milesRepo.updateEvent()` when blockType='event'
- `blockFieldMapping.ts` — Already defines EVENT_FIELDS including all target fields
- `CategorizedEventChangesTable` — Already handles old/new display with block validation
- `EditionUpdateGroupedDetail.tsx` — Already works correctly (serves as pattern)

## Data Flow

```
NEW_EVENT proposal.changes:
  name: { new: "Trail des Montagnes", confidence: 0.9 }
  city: { new: "Grenoble", confidence: 0.9 }
  edition: { new: { startDate, races, ... } }

        ↓ convert-to-edition-update

EDITION_UPDATE proposal.changes:
  name: { old: "Trail Montagne", new: "Trail des Montagnes", confidence: 0.9 }   ← NEW
  city: { old: "Lyon", new: "Grenoble", confidence: 0.9 }                        ← NEW
  startDate: { old: "2026-06-01", new: "2026-06-15", confidence: 0.9 }
  racesToUpdate: { ... }

        ↓ EditionUpdateDetail.tsx

  [Event block]    → name, city (with validate button)
  [Edition block]  → startDate, endDate, etc.
  [Races block]    → racesToUpdate, racesToAdd, etc.
```

## Risk Assessment

Low risk:
- Backend change is additive (new fields in changes, no existing behavior modified)
- Frontend change reuses proven pattern from grouped proposals
- Application path already tested and working for event fields in EDITION_UPDATE
