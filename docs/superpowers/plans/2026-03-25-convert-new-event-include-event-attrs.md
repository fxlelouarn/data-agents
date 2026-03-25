# Include Event Attributes in NEW_EVENT → EDITION_UPDATE Conversion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When converting a NEW_EVENT proposal to EDITION_UPDATE, include event-level attributes (name, city, country, etc.) so the user can review and apply them via the existing "event" block.

**Architecture:** The backend conversion endpoint extracts event fields from the original NEW_EVENT, compares them against the existing Miles Republic Event, and includes diffs in the EDITION_UPDATE changes. The frontend simple view (`EditionUpdateDetail.tsx`) adds the event block display, reusing the existing `CategorizedEventChangesTable` component.

**Tech Stack:** TypeScript, Express.js, React, Material-UI

**Spec:** `docs/superpowers/specs/2026-03-23-convert-new-event-include-event-attrs-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/api/src/routes/proposals.ts` | Modify (lines ~2214-2232) | Fetch existing Event + extract event fields into changes |
| `apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateDetail.tsx` | Modify | Add event block display with `CategorizedEventChangesTable` |
| `apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateGroupedDetail.tsx` | Modify (lines 230-232) | Replace hardcoded field list with shared `EVENT_FIELDS` constant |

---

## Task 1: Backend — Fetch existing Event and extract event fields

**Files:**
- Modify: `apps/api/src/routes/proposals.ts:2214-2232`

- [ ] **Step 1: Fetch the existing Event after the edition fetch**

After `existingEdition` is fetched (line 2224), add the Event fetch. Insert this code between the `existingEdition` null check (line 2228) and the "3. Transformer les changes" comment (line 2230):

```typescript
  // 2b. Récupérer l'événement existant pour comparer les attributs
  const existingEvent = await sourceDb.event.findUnique({
    where: { id: eventId }
  })

  if (!existingEvent) {
    throw createError(404, 'Event not found in Miles Republic', 'EVENT_NOT_FOUND')
  }
```

- [ ] **Step 2: Add event field extraction after `editionChanges` is created**

After `const editionChanges: Record<string, any> = {}` (line 2232), before the `if (originalChanges.edition?.new)` block (line 2235), add:

```typescript
  // Extraire les champs d'événement depuis le NEW_EVENT original
  // Source of truth: apps/dashboard/src/utils/blockFieldMapping.ts (EVENT_FIELDS)
  const EVENT_FIELDS = [
    'name', 'city', 'country',
    'countrySubdivisionNameLevel1', 'countrySubdivisionNameLevel2',
    'countrySubdivisionDisplayCodeLevel1', 'countrySubdivisionDisplayCodeLevel2',
    'websiteUrl', 'facebookUrl', 'instagramUrl',
    'latitude', 'longitude', 'fullAddress', 'dataSource'
  ]

  for (const field of EVENT_FIELDS) {
    const proposedValue = originalChanges[field]?.new
    const existingValue = existingEvent[field as keyof typeof existingEvent]

    // Skip if proposed value is empty (not provided by agent)
    // Use explicit check to preserve valid falsy values like 0 (latitude/longitude)
    const isEmpty = (v: any) => v === null || v === undefined || v === ''
    if (isEmpty(proposedValue)) continue

    // Skip if values are identical (treat null/undefined/empty as equivalent)
    const normalizedExisting = isEmpty(existingValue) ? null : existingValue
    const normalizedProposed = isEmpty(proposedValue) ? null : proposedValue
    if (normalizedExisting === normalizedProposed) continue

    editionChanges[field] = {
      old: normalizedExisting,
      new: normalizedProposed,
      confidence: originalChanges[field]?.confidence || 0.9
    }
  }

  logger.info(`  📝 Event fields with differences: ${Object.keys(editionChanges).length}`)
```

- [ ] **Step 3: Verify the server reloads without errors**

The dev server should hot-reload. Check the terminal for any TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/proposals.ts
git commit -m "feat(api): include event attributes when converting NEW_EVENT to EDITION_UPDATE"
```

---

## Task 2: Frontend — Add event block to EditionUpdateDetail (simple view)

**Files:**
- Modify: `apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateDetail.tsx`

- [ ] **Step 1: Add imports**

Add after the existing imports (line 9):

```typescript
import CategorizedEventChangesTable from '@/components/proposals/CategorizedEventChangesTable'
import { EVENT_FIELDS } from '@/utils/blockFieldMapping'
```

- [ ] **Step 2: Replace the field separation logic**

Replace lines 53-61 (from the `standardChanges` filter through `hasRaceChanges`):

```typescript
        // Séparer les champs événement des champs édition et spéciaux
        const eventChanges = consolidatedChanges.filter(c =>
          (EVENT_FIELDS as readonly string[]).includes(c.field)
        )
        const standardChanges = consolidatedChanges.filter(c =>
          !(EVENT_FIELDS as readonly string[]).includes(c.field) &&
          !['organizer', 'racesToAdd'].includes(c.field)
        )
        const organizerChange = consolidatedChanges.find(c => c.field === 'organizer')
        const racesToAddChange = consolidatedChanges.find(c => c.field === 'racesToAdd')

        const hasEventChanges = eventChanges.length > 0
        const shouldShowEventBlock = hasEventChanges || isBlockValidated('event')
        const hasRealEditionChanges = standardChanges.length > 0
        const hasRaceChanges = consolidatedRaceChanges.length > 0
```

- [ ] **Step 3: Add the event block rendering**

Insert before the existing `{hasRealEditionChanges && (` block (line 65), inside the `<>` fragment:

```tsx
            {/* Bloc Événement */}
            {shouldShowEventBlock && (
              <CategorizedEventChangesTable
                title="Événement"
                changes={eventChanges}
                isNewEvent={false}
                selectedChanges={selectedChanges}
                onFieldSelect={handleFieldSelect}
                onFieldModify={handleFieldModify}
                userModifiedChanges={userModifiedChanges}
                formatValue={formatValue}
                formatAgentsList={formatAgentsList}
                disabled={isReadOnly || isBlockValidated('event') || isEventDead}
                isBlockValidated={isBlockValidated('event')}
                onValidateBlock={isReadOnly ? undefined : () => validateBlock('event')}
                onUnvalidateBlock={isReadOnly ? undefined : () => unvalidateBlock('event')}
                isBlockPending={isBlockPending}
                validationDisabled={isReadOnly || isEventDead}
                showCurrentValue={false}
                showConfidence={false}
                showActions={false}
              />
            )}

```

- [ ] **Step 4: Verify the dashboard compiles without errors**

Check the Vite dev server terminal for compilation errors.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateDetail.tsx
git commit -m "feat(dashboard): add event block display in simple EDITION_UPDATE view"
```

---

## Task 3: Frontend cleanup — Use shared EVENT_FIELDS in EditionUpdateGroupedDetail

**Files:**
- Modify: `apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateGroupedDetail.tsx:5,230-232`

- [ ] **Step 1: Add the import**

Add to existing imports (around line 5, after `CategorizedEventChangesTable` import):

```typescript
import { EVENT_FIELDS } from '@/utils/blockFieldMapping'
```

- [ ] **Step 2: Replace the hardcoded eventFields array**

Replace lines 229-234. Note: this drops `twitterUrl` (was in the hardcoded list but not in `EVENT_FIELDS`) and adds `countrySubdivisionDisplayCodeLevel1/2` and `dataSource`. `twitterUrl` is not produced by any agent, so this is safe.

```typescript
  // Séparer les champs événement, édition et champs spéciaux
  const eventFields = ['name', 'city', 'country', 'countrySubdivisionNameLevel1',
    'countrySubdivisionNameLevel2', 'fullAddress', 'latitude', 'longitude',
    'websiteUrl', 'facebookUrl', 'instagramUrl', 'twitterUrl']

  const eventChanges = consolidatedChanges.filter((c: any) => eventFields.includes(c.field))
```

with:

```typescript
  // Séparer les champs événement, édition et champs spéciaux (source: blockFieldMapping.ts)
  const eventChanges = consolidatedChanges.filter((c: any) =>
    (EVENT_FIELDS as readonly string[]).includes(c.field)
  )
```

- [ ] **Step 3: Verify the dashboard compiles without errors**

Check the Vite dev server terminal for compilation errors.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateGroupedDetail.tsx
git commit -m "refactor(dashboard): use shared EVENT_FIELDS constant in grouped detail view"
```

---

## Task 4: Manual verification

- [ ] **Step 1: Find a NEW_EVENT proposal to test**

```bash
source .env.local && psql "$DATABASE_URL" -c "SELECT id, \"eventName\", status FROM proposals WHERE type = 'NEW_EVENT' AND status = 'PENDING' ORDER BY \"createdAt\" DESC LIMIT 5;"
```

- [ ] **Step 2: Test the conversion flow**

1. Open a NEW_EVENT proposal in the dashboard
2. If an existing event match is detected, click "Convertir en mise à jour"
3. Verify the new EDITION_UPDATE proposal shows the **Événement** block with event field diffs (name, city, etc.)
4. Verify the **Édition** block still shows edition fields as before
5. Verify block validation works on the event block

- [ ] **Step 3: Verify edge case — no event field differences**

If the NEW_EVENT has the same name/city as the existing event, the event block should NOT appear (no changes to show).
