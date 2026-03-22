# Google Date Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add page-level date verification to the Google Search Date Agent using Claude AI, and re-verify all 1253 existing PENDING Google proposals.

**Architecture:** Create a `date-verifier.ts` module with fetch+clean+Claude logic, integrate it into the Google Agent's proposal flow, and create a repasse script.

**Tech Stack:** TypeScript, cheerio, @anthropic-ai/sdk (Claude Haiku), node-fetch

**Spec:** `docs/superpowers/specs/2026-03-22-google-date-verification-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/agents/src/google/date-verifier.ts` | Create | `verifyDateFromSource()` — fetch, clean HTML, ask Claude |
| `apps/agents/src/google/__tests__/date-verifier.test.ts` | Create | Tests for date verifier |
| `apps/agents/src/GoogleSearchDateAgent.ts` | Modify | Call verifier before creating proposals |
| `apps/agents/src/scripts/verify-google-proposals.ts` | Create | Repasse script for existing PENDING proposals |

---

## Task 1: Create date-verifier.ts

**Files:**
- Create: `apps/agents/src/google/date-verifier.ts`
- Create: `apps/agents/src/google/__tests__/date-verifier.test.ts`

- [ ] **Step 1: Create the date-verifier module**

Create `apps/agents/src/google/date-verifier.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import * as cheerio from 'cheerio'

const MAX_CONTENT_LENGTH = 50000 // 50KB max for Claude
const FETCH_TIMEOUT_MS = 15000
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export interface VerificationResult {
  confirmed: boolean
  reason: string
}

/**
 * Fetches a web page, cleans it, and asks Claude Haiku to confirm
 * whether the page confirms a specific date for a sporting event.
 *
 * Returns null if the page is inaccessible or Claude's response is unparseable.
 */
export async function verifyDateFromSource(
  url: string,
  extractedDate: string, // ISO date YYYY-MM-DD
  eventName: string,
  eventCity?: string,
  apiKey?: string
): Promise<VerificationResult | null> {
  // 1. Fetch HTML
  const html = await fetchPage(url)
  if (!html) return null

  // 2. Clean HTML → text
  const text = cleanHtml(html)
  if (!text || text.length < 50) return null // Too short to be useful

  // 3. Ask Claude
  return askClaude(text, extractedDate, eventName, eventCity, apiKey)
}

/**
 * Fetch a web page with browser-like headers.
 * Returns null on any failure.
 */
export async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5',
      },
      signal: controller.signal,
      redirect: 'follow',
    })

    clearTimeout(timeout)

    if (!response.ok) return null
    return await response.text()
  } catch {
    return null
  }
}

/**
 * Strip HTML to plain text using cheerio.
 * Removes scripts, styles, nav, footer, and other non-content elements.
 */
export function cleanHtml(html: string): string {
  const $ = cheerio.load(html)

  // Remove non-content elements
  $('script, style, noscript, iframe, svg, img, video, audio').remove()
  $('nav, footer, header, aside').remove()
  $('[class*="cookie"], [class*="popup"], [class*="modal"], [class*="banner"]').remove()
  $('[id*="cookie"], [id*="popup"], [id*="modal"], [id*="banner"]').remove()

  // Try to get main content first
  const mainSelectors = ['main', 'article', '[role="main"]', '.content', '.main-content', '#content']
  for (const selector of mainSelectors) {
    const el = $(selector)
    if (el.length > 0 && el.text().trim().length > 100) {
      return el.text().replace(/\s+/g, ' ').trim().substring(0, MAX_CONTENT_LENGTH)
    }
  }

  // Fallback: entire body
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim()
  return bodyText.substring(0, MAX_CONTENT_LENGTH)
}

/**
 * Ask Claude Haiku to confirm the date.
 */
async function askClaude(
  pageText: string,
  extractedDate: string,
  eventName: string,
  eventCity?: string,
  apiKey?: string
): Promise<VerificationResult | null> {
  const key = apiKey || process.env.ANTHROPIC_API_KEY
  if (!key) return null

  const client = new Anthropic({ apiKey: key })

  // Format date for the prompt (DD/MM/YYYY)
  const [year, month, day] = extractedDate.split('-')
  const formattedDate = `${day}/${month}/${year}`
  const locationStr = eventCity ? ` à ${eventCity}` : ''

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      temperature: 0,
      system: 'Tu vérifies si une page web confirme la date d\'un événement sportif. Réponds uniquement en JSON valide.',
      messages: [{
        role: 'user',
        content: `Voici le contenu d'une page web:\n\n${pageText.substring(0, 30000)}\n\n---\n\nL'événement "${eventName}"${locationStr} a-t-il lieu le ${formattedDate} selon cette page ?\n\nRéponds uniquement en JSON: {"confirmed": true/false, "reason": "explication courte"}`
      }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    // Parse JSON — handle markdown code blocks
    const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    const result = JSON.parse(jsonStr)

    return {
      confirmed: result.confirmed === true,
      reason: result.reason || ''
    }
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Create tests**

Create `apps/agents/src/google/__tests__/date-verifier.test.ts`:

```typescript
import { cleanHtml } from '../date-verifier'

describe('date-verifier', () => {
  describe('cleanHtml', () => {
    it('should remove scripts and styles', () => {
      const html = '<html><body><script>alert("x")</script><style>.x{}</style><p>Event info</p></body></html>'
      const text = cleanHtml(html)
      expect(text).not.toContain('alert')
      expect(text).not.toContain('.x{}')
      expect(text).toContain('Event info')
    })

    it('should remove nav, footer, header', () => {
      const html = '<html><body><nav>Menu</nav><main><p>Marathon le 15 juin 2026</p></main><footer>Copyright</footer></body></html>'
      const text = cleanHtml(html)
      expect(text).toContain('Marathon le 15 juin 2026')
      expect(text).not.toContain('Menu')
      expect(text).not.toContain('Copyright')
    })

    it('should prefer main content element', () => {
      const html = '<html><body><div>Noise</div><main><p>Trail des Vignes le 20 septembre</p></main><div>More noise</div></body></html>'
      const text = cleanHtml(html)
      expect(text).toContain('Trail des Vignes')
    })

    it('should limit output to 50KB', () => {
      const longContent = 'x'.repeat(100000)
      const html = `<html><body><p>${longContent}</p></body></html>`
      const text = cleanHtml(html)
      expect(text.length).toBeLessThanOrEqual(50000)
    })

    it('should collapse whitespace', () => {
      const html = '<html><body><p>Event   \n\n   info   here</p></body></html>'
      const text = cleanHtml(html)
      expect(text).toBe('Event info here')
    })

    it('should remove cookie/popup elements', () => {
      const html = '<html><body><div class="cookie-banner">Accept cookies</div><p>Real content</p></body></html>'
      const text = cleanHtml(html)
      expect(text).not.toContain('cookies')
      expect(text).toContain('Real content')
    })
  })
})
```

- [ ] **Step 3: Run tests**

Run: `npx jest --testPathPatterns="date-verifier" --verbose`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add apps/agents/src/google/
git commit -m "feat(google-agent): add date-verifier module

Fetches source page, cleans HTML with cheerio, and asks Claude Haiku
to confirm if the page confirms a specific date for an event.
Returns null if page is inaccessible."
```

---

## Task 2: Integrate verifier into Google Agent

**Files:**
- Modify: `apps/agents/src/GoogleSearchDateAgent.ts`

The integration point is in the `run()` method, between date extraction (line 195) and proposal creation (line 203). Read the file to understand the exact flow.

- [ ] **Step 1: Add import**

At the top of `GoogleSearchDateAgent.ts`, add:

```typescript
import { verifyDateFromSource } from './google/date-verifier'
```

- [ ] **Step 2: Add verification step in the run loop**

In the `run()` method, after line 200 (`if (extractedDates.length === 0) { ... continue }`) and before line 203 (`const eventProposals = await this.createDateProposals(...)`), add a verification step:

```typescript
// 5b. Verify dates against source pages
const verifiedDates: typeof extractedDates = []
for (const date of extractedDates) {
  const dateStr = date.date.toISOString().split('T')[0]
  const result = await verifyDateFromSource(
    date.source,
    dateStr,
    event.name,
    event.city,
    config.anthropicApiKey || process.env.ANTHROPIC_API_KEY
  )

  if (result === null) {
    context.logger.info(`⚠️ Page inaccessible pour vérification: ${date.source} — date ignorée`)
    continue
  }

  if (result.confirmed) {
    context.logger.info(`✅ Date confirmée par la page source: ${dateStr} (${result.reason})`)
    verifiedDates.push(date)
  } else {
    context.logger.info(`❌ Date NON confirmée par la page source: ${dateStr} (${result.reason})`)
  }
}

if (verifiedDates.length === 0) {
  context.logger.info(`Aucune date vérifiée pour l'événement: ${event.name}`)
  continue
}
```

Then change the `createDateProposals` call to use `verifiedDates` instead of `extractedDates`:

```typescript
// OLD: const eventProposals = await this.createDateProposals(event, extractedDates, searchResults)
const eventProposals = await this.createDateProposals(event, verifiedDates, searchResults)
```

- [ ] **Step 3: Add `anthropicApiKey` to config**

Check if `GoogleSearchDateConfig` type (in `apps/agents/src/GoogleSearchDateAgent.ts` or types file) already has an `anthropicApiKey` field. If not, the verifier will use `process.env.ANTHROPIC_API_KEY` as fallback which is fine.

Read the config type to verify. If `anthropicApiKey` is not there, no change needed — the env var fallback handles it.

- [ ] **Step 4: Verify types compile**

Run: `npm run tsc 2>&1 | grep -E "GoogleSearch|date-verifier|error"` (ignore pre-existing LLM matching errors)
Expected: No new type errors

- [ ] **Step 5: Commit**

```bash
git add apps/agents/src/GoogleSearchDateAgent.ts
git commit -m "feat(google-agent): verify dates against source pages before proposing

After extracting dates from Google snippets, the agent now fetches
each source page and asks Claude Haiku to confirm the date. Only
confirmed dates produce proposals. Inaccessible pages are skipped."
```

---

## Task 3: Create repasse script

**Files:**
- Create: `apps/agents/src/scripts/verify-google-proposals.ts`

Reference the existing `rematch-pending-proposals.ts` script for patterns (DB connection, CLI args, logging, dry-run support).

- [ ] **Step 1: Create the script**

Create `apps/agents/src/scripts/verify-google-proposals.ts`:

```typescript
/**
 * Re-verify existing PENDING Google proposals by checking their source pages.
 *
 * Usage:
 *   npx tsx apps/agents/src/scripts/verify-google-proposals.ts [--dry-run] [--limit N]
 */

import { PrismaClient } from '@prisma/client'
import { verifyDateFromSource } from '../google/date-verifier'
import { createConsoleLogger } from '@data-agents/agent-framework'

// CLI args
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const LIMIT = parseInt(args.find((_, i) => args[i - 1] === '--limit') || '0') || Infinity

const prisma = new PrismaClient()
const logger = createConsoleLogger('GoogleVerify')

const stats = {
  processed: 0,
  confirmed: 0,
  archivedNotConfirmed: 0,
  archivedInaccessible: 0,
  errors: 0,
}

async function main() {
  console.log(`\n🔍 Google Proposals Date Verification${DRY_RUN ? ' [DRY RUN]' : ''}`)
  console.log(`Limit: ${LIMIT === Infinity ? 'none' : LIMIT}\n`)

  // Find Google agent ID
  const googleAgent = await prisma.agent.findFirst({
    where: { config: { path: ['agentType'], equals: 'GOOGLE_SEARCH_DATE' } },
    select: { id: true, name: true }
  })

  if (!googleAgent) {
    console.error('Google Search Date Agent not found')
    process.exit(1)
  }

  console.log(`Agent: ${googleAgent.name} (${googleAgent.id})`)

  // Get PENDING Google proposals
  const proposals = await prisma.proposal.findMany({
    where: {
      agentId: googleAgent.id,
      status: 'PENDING',
      type: 'EDITION_UPDATE',
    },
    orderBy: { createdAt: 'asc' },
    take: LIMIT === Infinity ? undefined : LIMIT,
  })

  console.log(`Found ${proposals.length} PENDING Google proposals\n`)

  for (const proposal of proposals) {
    stats.processed++
    const changes = proposal.changes as Record<string, any>
    const justifications = (proposal.justification as any[]) || []

    // Extract source URL from justification
    const sourceUrl = justifications[0]?.metadata?.source
    if (!sourceUrl) {
      logger.warn(`[${stats.processed}/${proposals.length}] No source URL for ${proposal.id} — archiving`)
      if (!DRY_RUN) await archiveProposal(proposal.id, 'No source URL in justification')
      stats.archivedInaccessible++
      continue
    }

    // Extract proposed date
    const newStartDate = changes.startDate?.new
    if (!newStartDate) {
      logger.warn(`[${stats.processed}/${proposals.length}] No startDate in changes for ${proposal.id} — skipping`)
      stats.errors++
      continue
    }

    const dateStr = new Date(newStartDate).toISOString().split('T')[0]
    const eventName = proposal.eventName || 'Unknown'

    logger.info(`[${stats.processed}/${proposals.length}] Verifying "${eventName}" — date ${dateStr} from ${sourceUrl}`)

    try {
      const result = await verifyDateFromSource(sourceUrl, dateStr, eventName)

      if (result === null) {
        logger.info(`  ⚠️ Page inaccessible — archiving`)
        if (!DRY_RUN) await archiveProposal(proposal.id, `Source page inaccessible: ${sourceUrl}`)
        stats.archivedInaccessible++
      } else if (result.confirmed) {
        logger.info(`  ✅ Confirmed: ${result.reason}`)
        stats.confirmed++
      } else {
        logger.info(`  ❌ Not confirmed: ${result.reason} — archiving`)
        if (!DRY_RUN) await archiveProposal(proposal.id, `Date not confirmed by source page: ${result.reason}`)
        stats.archivedNotConfirmed++
      }
    } catch (error: any) {
      logger.error(`  ❌ Error: ${error.message}`)
      stats.errors++
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  // Print stats
  console.log('\n--- Results ---')
  console.log(`Processed:               ${stats.processed}`)
  console.log(`Confirmed (kept):        ${stats.confirmed}`)
  console.log(`Archived (not confirmed): ${stats.archivedNotConfirmed}`)
  console.log(`Archived (inaccessible): ${stats.archivedInaccessible}`)
  console.log(`Errors:                  ${stats.errors}`)
  if (DRY_RUN) console.log('\n🧪 DRY RUN — no changes applied')

  await prisma.$disconnect()
}

async function archiveProposal(proposalId: string, reason: string) {
  await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      status: 'ARCHIVED',
      reviewedAt: new Date(),
      reviewedBy: 'google-date-verification-script',
      modificationReason: reason,
    }
  })
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Test the script in dry-run mode**

Run: `npx tsx apps/agents/src/scripts/verify-google-proposals.ts --dry-run --limit 5`
Expected: Processes 5 proposals, shows confirmed/not confirmed/inaccessible status, no DB changes

- [ ] **Step 3: Commit**

```bash
git add apps/agents/src/scripts/verify-google-proposals.ts
git commit -m "feat(scripts): add verify-google-proposals repasse script

Re-verifies all PENDING Google proposals by fetching their source
pages and asking Claude Haiku to confirm the date. Archives proposals
where the date is not confirmed or the source is inaccessible.
Supports --dry-run and --limit N."
```

---

## Task 4: Run the repasse

- [ ] **Step 1: Dry run on 20 proposals to validate**

Run: `npx tsx apps/agents/src/scripts/verify-google-proposals.ts --dry-run --limit 20`
Expected: Mix of confirmed/not confirmed/inaccessible. Verify the results make sense.

- [ ] **Step 2: Run for real on all proposals**

Run: `npx tsx apps/agents/src/scripts/verify-google-proposals.ts`
Expected: Processes all ~1253 proposals. Takes ~15-20 minutes (500ms delay between each + Claude latency).

- [ ] **Step 3: Report results**

Check how many were confirmed vs archived:
```sql
SELECT status, COUNT(*) FROM proposals p
WHERE (SELECT a.config->>'agentType' FROM agents a WHERE a.id = p."agentId") = 'GOOGLE_SEARCH_DATE'
GROUP BY status;
```
