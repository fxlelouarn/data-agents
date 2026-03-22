# Google Date Verification - Design Spec

## Goal

Improve the Google Search Date Agent by verifying extracted dates against the actual source page content using Claude AI. Also re-verify the 1253 existing PENDING Google proposals, archiving those that can't be confirmed.

## Constraints

- Google Agent runs in `apps/agents`, not `apps/api`
- Don't move or refactor the Slack HtmlExtractor — reimplement the minimal fetch+clean logic needed
- Existing interfaces and proposal format don't change
- Conservative approach: if we can't verify, don't propose (new runs) or archive (repasse)

## Architecture

### New file: `apps/agents/src/google/date-verifier.ts`

Exports a single function:

```typescript
async function verifyDateFromSource(
  url: string,
  extractedDate: string,  // ISO date (YYYY-MM-DD)
  eventName: string,
  eventCity?: string
): Promise<{ confirmed: boolean; reason: string } | null>
```

**Steps:**
1. **Fetch HTML** — HTTP GET with browser User-Agent, 15s timeout. Returns `null` on failure (network error, 404, timeout).
2. **Clean HTML** — Use cheerio to strip scripts, styles, nav, footer, header, aside. Extract text content. Limit to 50KB.
3. **Ask Claude Haiku** — Binary confirmation prompt:
   - System: "Tu vérifies si une page web confirme la date d'un événement sportif."
   - User: "L'événement [eventName] à [eventCity] a-t-il lieu le [DD/MM/YYYY] selon cette page ? Réponds uniquement en JSON: { \"confirmed\": true/false, \"reason\": \"explication courte\" }"
   - Temperature: 0
   - Max tokens: 256
4. **Return** — Parse JSON response. Return `null` if Claude response is unparseable.

### Modified: `apps/agents/src/GoogleSearchDateAgent.ts`

In `createDateProposals()`, after date extraction and before proposal creation:

```
For each candidate date:
  url = best source URL for this date
  result = await verifyDateFromSource(url, date, eventName, eventCity)
  if result === null → skip (page inaccessible)
  if result.confirmed === false → skip (date not confirmed)
  if result.confirmed === true → create proposal as before
```

### New script: `apps/agents/src/scripts/verify-google-proposals.ts`

Re-verifies existing PENDING Google proposals:

1. Query: all proposals WHERE status=PENDING, type=EDITION_UPDATE, agentType=GOOGLE_SEARCH_DATE
2. For each proposal:
   - Extract URL from `justification[0].metadata.source`
   - Extract date from `changes.startDate.new`
   - Extract eventName from `proposal.eventName`
   - Call `verifyDateFromSource(url, date, eventName)`
   - If `confirmed: true` → keep (log only)
   - If `confirmed: false` → archive with reason
   - If `null` (page inaccessible) → archive with reason "source inaccessible"
3. CLI args: `--dry-run`, `--limit N`
4. Stats logged at end: confirmed, archived (not confirmed), archived (inaccessible), errors

## Cost Estimate

- 1253 proposals to re-verify
- ~1 Claude Haiku call per proposal
- Haiku input: ~2-5K tokens per page (cleaned HTML)
- Haiku output: ~50 tokens
- Estimated cost: ~$0.30-0.75 for the full repasse

## What Does NOT Change

- Proposal format (changes structure)
- Event matching logic
- Confidence calculation (already computed, verification is go/no-go)
- Auto-validator rules (Google proposals can be added to auto-validator later)
