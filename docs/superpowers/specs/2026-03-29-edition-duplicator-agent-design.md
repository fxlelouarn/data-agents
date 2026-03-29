# Edition Duplicator Agent — Design Spec

**Date:** 2026-03-29
**Status:** Draft
**Replaces:** n8n workflow "CRON - Edition Duplicate"

## Purpose

Create an agent that automatically duplicates editions that have just ended, creating next-year editions with shifted dates. This replaces the existing n8n workflow with a native agent that integrates into the proposal pipeline.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Write mode | Proposals + auto-application via AutoValidator | Consistent with platform pipeline |
| Proposal granularity | One per edition | Independent tracking, standard pattern |
| Proposal type | `EDITION_UPDATE` | Reuses existing type, avoids pipeline changes |
| Data to duplicate | Edition + Races + EditionPartner + EditionPartnerLocalizedContent | Partners are new vs n8n; other relations not needed |
| DB access | Prisma-native | Type-safe, consistent with all other agents |
| Scheduler | FlexibleScheduler | Standard for this project |

## Edition Discovery

The agent queries Miles Republic for editions matching ALL of these criteria:

1. `year` equals current year (validated as 4-digit number in code)
2. `endDate + 1 day <= today` (edition has ended — duplication the day after)
3. `endDate` year equals current year (guard against stale data)
4. No edition exists for the same event with `year = currentYear + 1`
5. `status != 'DRAFT'`
6. `currentEditionEventId IS NOT NULL` (marks it as the "current" edition)

For each matched edition, also fetch:
- All non-archived **races** (`isArchived = false`)
- All **EditionPartner** with their **EditionPartnerLocalizedContent**
- The **Event** (for name/city metadata)

Processing in configurable batches (default 50), with state tracking via `AgentStateService` to avoid creating duplicate proposals for already-processed editions.

## Proposal Structure

**Per edition**, one proposal:

```typescript
{
  type: 'EDITION_UPDATE',
  eventId: event.id.toString(),
  editionId: oldEdition.id.toString(),
  confidence: 1.0,
  changes: {
    editionToCreate: {
      startDate: oldStartDate + 1 year,
      endDate: oldEndDate + 1 year,
      year: (parseInt(oldYear) + 1).toString(),
      status: oldEdition.status,         // preserve
      calendarStatus: 'TO_BE_CONFIRMED',
      clientStatus: 'NEW_SALES_FUNNEL',
      currentEditionEventId: eventId,
      isAttendeeListPublic: oldEdition.isAttendeeListPublic,
      organizerStripeConnectedAccountId: oldEdition.organizerStripeConnectedAccountId,
      currency: oldEdition.currency,
      medusaVersion: oldEdition.medusaVersion,
      timeZone: oldEdition.timeZone,
      slug: crypto.randomUUID(),
      createdBy: 'Edition Duplicator Agent',
      updatedBy: 'Edition Duplicator Agent',
    },
    oldEditionUpdate: {
      currentEditionEventId: null,
    },
    racesToCreate: [
      {
        name, startDate (+ 1 year), swimDistance, walkDistance, bikeDistance,
        runDistance, runDistance2, swimRunDistance, bikeRunDistance,
        runPositiveElevation, runNegativeElevation,
        bikePositiveElevation, bikeNegativeElevation,
        walkPositiveElevation, walkNegativeElevation,
        price, priceType, paymentCollectionType,
        isArchived, displayOrder, slug (new UUID),
        categoryLevel1, categoryLevel2, distanceCategory,
        licenseNumberType, adultJustificativeOptions, minorJustificativeOptions,
        askAttendeeBirthDate, askAttendeeGender, askAttendeeNationality,
        askAttendeePhoneNumber, askAttendeePostalAddress,
        showClubOrAssoInput, showPublicationConsentCheckbox,
        minTeamSize, maxTeamSize, timeZone,
        isMainRace (boolean flag if mainRaceEditionId was set),
        createdBy: 'Edition Duplicator Agent',
        updatedBy: 'Edition Duplicator Agent',
      },
      // ...
    ],
    partnersToCreate: [
      {
        role, name, websiteUrl, instagramUrl, facebookUrl, logoUrl, sortOrder,
        localizedContents: [
          { locale, description },
          // ...
        ],
      },
      // ...
    ],
  },
  justification: [
    {
      type: 'edition_duplication',
      message: 'Édition {year} terminée le {endDate}, duplication pour {year+1}',
      metadata: {
        sourceEditionId: oldEdition.id,
        sourceYear: oldYear,
        targetYear: newYear,
        racesCount: N,
        partnersCount: M,
      },
    },
  ],
}
```

## Application Logic

Added to `proposal-domain.service.ts`. Detected by the presence of `changes.editionToCreate`.

Executes in a **single transaction**:

1. **Clear old edition** — `UPDATE Edition SET currentEditionEventId = NULL WHERE id = oldEditionId`
2. **Create new edition** — `INSERT` with all fields from `editionToCreate`
3. **Create races** — `INSERT` each race with `editionId = newEdition.id`, `eventId = event.id`. If `isMainRace`, set `mainRaceEditionId = newEdition.id`.
4. **Create partners** — `INSERT` each EditionPartner with `editionId = newEdition.id`, then `INSERT` their LocalizedContent records.

The `appliedChanges` stored on the ProposalApplication will include the new edition ID, new race IDs, and new partner IDs for traceability.

## Agent Configuration

**Agent type:** `EDITION_DUPLICATOR`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `sourceDatabase` | select | required | Miles Republic DB connection |
| `batchSize` | number | 50 | Max editions to process per run |
| `dryRun` | boolean | false | Log only, don't create proposals |

**Schedule:** `0 3 * * *` (daily at 3:00 AM via FlexibleScheduler)

**State tracking:** `AgentStateService` with key `processedEditions` — stores a map of `editionId → proposalId` for editions already processed. Cleared at year boundary or when proposals are rejected.

## AutoValidatorAgent Update

Add `EDITION_DUPLICATOR` to the eligible agent types in `AutoValidatorAgent.ts`, same pattern as `EDITION_CONFIRMATION`.

## File Structure

**New files:**
- `apps/agents/src/EditionDuplicatorAgent.ts` — main agent class
- `apps/agents/src/registry/edition-duplicator.ts` — registry entry
- `apps/agents/src/__tests__/EditionDuplicatorAgent.test.ts` — unit tests
- `packages/types/src/agent-config-schemas/edition-duplicator.ts` — config schema

**Modified files:**
- `apps/agents/src/index.ts` — register agent
- `packages/types/src/agent-config-schemas/index.ts` — export config schema
- `packages/types/src/agent-versions.ts` — add version constant
- `apps/agents/src/AutoValidatorAgent.ts` — add to eligible types
- `packages/database/src/services/proposal-domain.service.ts` — add duplication apply logic

## Edge Cases

- **Edition with null startDate/endDate:** Skip — can't shift dates. Log a warning.
- **Edition with non-numeric year:** Skip — can't compute next year. Log a warning.
- **Race with null startDate:** Create race without startDate (don't shift null).
- **Already processed edition:** State tracking prevents duplicate proposals. If a proposal was rejected, the edition stays in the processedEditions map and won't be retried (until manual state reset).
- **Transaction failure:** Entire duplication rolls back. ProposalApplication marked as FAILED with error message.
