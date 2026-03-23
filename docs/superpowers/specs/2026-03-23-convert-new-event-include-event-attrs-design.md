# Design: Include Event Attributes When Converting NEW_EVENT → EDITION_UPDATE

**Date**: 2026-03-23
**Status**: Approved

## Problem

When a NEW_EVENT proposal is converted to an EDITION_UPDATE (because the user identifies a matching existing event), the event-level attributes (name, city, department, country, website) from the original proposal are discarded. Only edition-level data (dates, races, organizer) is transferred.

This means the user loses the ability to update the existing event's attributes with the agent's proposed values, even when they differ from current data.

## Solution

Include the event attributes from the NEW_EVENT proposal in the converted EDITION_UPDATE proposal, using the standard old/new format. The existing "event" block validation mechanism (already working in grouped proposals) handles display and application.

## Scope

**Event fields to transfer**: All top-level fields from the NEW_EVENT proposal that belong to `EVENT_FIELDS` (defined in `blockFieldMapping.ts`): `name`, `city`, `country`, `countrySubdivisionNameLevel1/2`, `countrySubdivisionDisplayCodeLevel1/2`, `websiteUrl`, `facebookUrl`, `instagramUrl`, `latitude`, `longitude`, `fullAddress`, `dataSource`.

The backend iterates over `originalChanges` keys and checks membership in `EVENT_FIELDS` rather than hardcoding a list — this stays in sync automatically.

Only fields where the proposed value differs from the existing event value are included — no noise from identical values. Falsy values (`null`, `undefined`, empty string) are treated as equivalent "no value".

## Changes

### 1. Backend — `apps/api/src/routes/proposals.ts` (endpoint `convert-to-edition-update`)

- Fetch the existing Event via `sourceDb.event.findUnique({ where: { id: eventId } })` — the `eventId` is already available from `req.body`. Add a defensive 404 check (though the event should always exist since the edition references it).
- Iterate over `originalChanges` keys. For each key that belongs to `EVENT_FIELDS`, extract the proposed value (`originalChanges[field]?.new`) and compare to the existing event value (`existingEvent[field]`). Skip if both are falsy or identical.
- If different, add to `editionChanges` with `{ old, new, confidence }` format
- These fields are then naturally routed by the existing block field mapping to the "event" block

### 2. Frontend — `apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateDetail.tsx`

- Import `CategorizedEventChangesTable` and the `EVENT_FIELDS` list from `blockFieldMapping.ts`
- Add event/edition field separation (filter `consolidatedChanges` using EVENT_FIELDS, same pattern as `EditionUpdateGroupedDetail.tsx` lines 229-243)
- Add `CategorizedEventChangesTable` rendering with block validation for the "event" block
- Show the event block only when event changes exist or the block is already validated

**Important**: `EditionUpdateDetail.tsx` uses `ProposalDetailBase` (simple view), which has a different context than `GroupedProposalDetailBase`. The simple view does NOT expose `handleApproveField` or `validateBlockWithDependencies`. The event block must follow the same prop pattern already used for the edition block in this file: `showActions={false}`, `showConfidence={false}`, `showCurrentValue={false}`.

### 3. Frontend improvement (nice-to-have) — `EditionUpdateGroupedDetail.tsx`

Replace the hardcoded `eventFields` array (lines 230-232) with the shared `EVENT_FIELDS` constant from `blockFieldMapping.ts` to avoid divergence.

### 4. No changes needed

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
