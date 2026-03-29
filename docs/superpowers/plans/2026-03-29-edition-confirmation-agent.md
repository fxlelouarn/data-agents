# Edition Confirmation Agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an agent that visits known event/organizer URLs to confirm or cancel TO_BE_CONFIRMED editions, and flags dead URLs.

**Architecture:** A new `EditionConfirmationAgent` extending `BaseAgent` that queries Miles Republic for TO_BE_CONFIRMED editions with known URLs, fetches each URL (node-fetch + cheerio for text extraction), sends the extracted text to an LLM for structured analysis, and creates EDITION_UPDATE or EVENT_UPDATE proposals. Sport-agnostic. Visits all available URLs (event, organizer, timer) and uses weighted confidence scoring (event URL > organizer > timer). Designed so high-confidence confirmations (≥0.9) are auto-validatable by AutoValidatorAgent.

**Tech Stack:** TypeScript, node-fetch, cheerio, Anthropic SDK (Claude Haiku), Prisma, existing agent-framework

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/agents/src/EditionConfirmationAgent.ts` | Main agent class — orchestrates the full pipeline |
| `apps/agents/src/edition-confirmation/types.ts` | All interfaces/types for this agent |
| `apps/agents/src/edition-confirmation/url-checker.ts` | URL liveness detection (HEAD/GET, dead URL detection) |
| `apps/agents/src/edition-confirmation/page-analyzer.ts` | LLM-based page content analysis |
| `apps/agents/src/edition-confirmation/confidence.ts` | Confidence scoring logic (source weighting) |
| `apps/agents/src/edition-confirmation/__tests__/url-checker.test.ts` | Tests for URL checker |
| `apps/agents/src/edition-confirmation/__tests__/page-analyzer.test.ts` | Tests for page analyzer |
| `apps/agents/src/edition-confirmation/__tests__/confidence.test.ts` | Tests for confidence scoring |
| `apps/agents/src/edition-confirmation/__tests__/EditionConfirmationAgent.test.ts` | Integration tests for the agent |
| `apps/agents/src/registry/edition-confirmation.ts` | Registry entry + DEFAULT_CONFIG |
| `packages/types/src/agent-config-schemas/edition-confirmation.ts` | Config schema for dashboard UI |

**Modified files:**

| File | Change |
|------|--------|
| `packages/types/src/agent-versions.ts` | Add `EDITION_CONFIRMATION_AGENT` version + type key + name |
| `packages/types/src/agent-config-schemas/index.ts` | Export new config schema |
| `apps/agents/src/index.ts` | Register `EDITION_CONFIRMATION` in registry + export |
| `apps/agents/src/AutoValidatorAgent.ts` | Add `EDITION_CONFIRMATION` to eligible agent types |

---

## Task 1: Types & Interfaces

**Files:**
- Create: `apps/agents/src/edition-confirmation/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// apps/agents/src/edition-confirmation/types.ts

/**
 * Configuration for the Edition Confirmation Agent
 */
export interface EditionConfirmationConfig {
  sourceDatabase: string       // Miles Republic database ID
  batchSize: number            // Editions to process per run (default: 30)
  cooldownDays: number         // Days before re-checking an edition (default: 14)
  lookAheadMonths: number      // How far ahead to look for editions (default: 3)
  requestDelayMs: number       // Delay between HTTP requests (default: 3000)
  requestTimeoutMs: number     // HTTP request timeout (default: 10000)
  anthropicApiKey?: string     // Anthropic API key (falls back to env)
  llmModel?: string            // LLM model for analysis (default: claude-haiku-4-5-20251001)
  dryRun?: boolean             // Log proposals without creating them
}

/**
 * An edition target with all its available URLs to check
 */
export interface EditionTarget {
  editionId: number
  eventId: number
  eventName: string
  eventCity: string | null
  editionYear: string
  startDate: Date | null
  urls: UrlSource[]
}

/**
 * A URL to check with its source type
 */
export interface UrlSource {
  url: string
  sourceType: 'event' | 'organizer' | 'timer'
  sourceName?: string  // e.g., organizer name
}

/**
 * Result of checking a single URL
 */
export interface UrlCheckResult {
  url: string
  sourceType: UrlSource['sourceType']
  isAlive: boolean
  httpStatus?: number
  isDead: boolean           // 404, domain expired, parking page
  errorReason?: string      // e.g., 'DNS_FAILURE', 'HTTP_404', 'PARKING_PAGE', 'TIMEOUT'
  htmlText?: string         // Extracted text content (if alive)
  contentLength?: number
}

/**
 * LLM analysis result for a page
 */
export interface PageAnalysisResult {
  confirmed: boolean
  canceled: boolean
  registrationOpen: boolean
  datesFound: string[]          // ISO date strings found on page
  yearMentioned: boolean        // Whether the target year appears on page
  confidence: number            // LLM's own confidence (0-1)
  reasoning: string             // Short explanation
}

/**
 * Final result for one edition after checking all its URLs
 */
export interface EditionCheckResult {
  editionId: number
  eventId: number
  eventName: string
  eventCity: string | null
  editionYear: string
  startDate: Date | null
  urlResults: UrlCheckResultWithAnalysis[]
  decision: 'CONFIRMED' | 'CANCELED' | 'INCONCLUSIVE'
  finalConfidence: number
  deadUrls: UrlCheckResult[]    // URLs that are dead
}

export interface UrlCheckResultWithAnalysis extends UrlCheckResult {
  analysis?: PageAnalysisResult
}

/**
 * Agent state persisted between runs
 */
export interface ConfirmationProgress {
  lastOffset: number
  lastRunAt: string
  stats: ConfirmationStats
}

export interface ConfirmationStats {
  totalChecked: number
  confirmed: number
  canceled: number
  inconclusive: number
  deadUrls: number
  errors: number
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/agents/src/edition-confirmation/types.ts
git commit -m "feat(edition-confirmation): add types and interfaces"
```

---

## Task 2: URL Checker

**Files:**
- Create: `apps/agents/src/edition-confirmation/__tests__/url-checker.test.ts`
- Create: `apps/agents/src/edition-confirmation/url-checker.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/agents/src/edition-confirmation/__tests__/url-checker.test.ts

import { checkUrl, isParkedDomain } from '../url-checker'

// Mock node-fetch
const mockFetch = jest.fn()
jest.mock('node-fetch', () => ({
  __esModule: true,
  default: mockFetch,
}))

describe('isParkedDomain', () => {
  it('detects GoDaddy parking pages', () => {
    expect(isParkedDomain('<html><body>This domain is parked free, courtesy of GoDaddy</body></html>')).toBe(true)
  })

  it('detects "domain for sale" pages', () => {
    expect(isParkedDomain('<html><body>This domain is for sale! Contact us.</body></html>')).toBe(true)
  })

  it('detects generic parking indicators', () => {
    expect(isParkedDomain('<html><body>Buy this domain. domaine à vendre.</body></html>')).toBe(true)
  })

  it('returns false for normal content', () => {
    expect(isParkedDomain('<html><body>Marathon de Paris 2026 - Inscriptions ouvertes</body></html>')).toBe(false)
  })
})

describe('checkUrl', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns isAlive=true and extracted text for a 200 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '<html><head><title>Marathon</title></head><body><main><h1>Marathon de Lyon 2026</h1><p>Inscriptions ouvertes</p></main></body></html>',
    })

    const result = await checkUrl({ url: 'https://marathon-lyon.fr', sourceType: 'event' })

    expect(result.isAlive).toBe(true)
    expect(result.isDead).toBe(false)
    expect(result.httpStatus).toBe(200)
    expect(result.htmlText).toContain('Marathon de Lyon 2026')
    expect(result.htmlText).toContain('Inscriptions ouvertes')
  })

  it('returns isDead=true for 404 responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    })

    const result = await checkUrl({ url: 'https://dead-site.fr', sourceType: 'event' })

    expect(result.isAlive).toBe(false)
    expect(result.isDead).toBe(true)
    expect(result.errorReason).toBe('HTTP_404')
  })

  it('returns isDead=true for DNS failures', async () => {
    mockFetch.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND dead-site.fr'))

    const result = await checkUrl({ url: 'https://dead-site.fr', sourceType: 'event' })

    expect(result.isAlive).toBe(false)
    expect(result.isDead).toBe(true)
    expect(result.errorReason).toBe('DNS_FAILURE')
  })

  it('returns isDead=true for parking pages', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '<html><body>This domain is parked free, courtesy of GoDaddy.com</body></html>',
    })

    const result = await checkUrl({ url: 'https://parked-domain.fr', sourceType: 'event' })

    expect(result.isAlive).toBe(false)
    expect(result.isDead).toBe(true)
    expect(result.errorReason).toBe('PARKING_PAGE')
  })

  it('returns isDead=false for timeout (not dead, just unreachable)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network timeout'))

    const result = await checkUrl({ url: 'https://slow-site.fr', sourceType: 'event' })

    expect(result.isAlive).toBe(false)
    expect(result.isDead).toBe(false)
    expect(result.errorReason).toBe('TIMEOUT')
  })

  it('strips nav, footer, script, style from extracted text', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => `<html><body>
        <nav>Menu item 1</nav>
        <script>var x = 1;</script>
        <style>.body { color: red; }</style>
        <main><p>Important content here</p></main>
        <footer>Copyright 2026</footer>
      </body></html>`,
    })

    const result = await checkUrl({ url: 'https://example.fr', sourceType: 'event' })

    expect(result.htmlText).toContain('Important content here')
    expect(result.htmlText).not.toContain('Menu item 1')
    expect(result.htmlText).not.toContain('var x = 1')
    expect(result.htmlText).not.toContain('color: red')
    expect(result.htmlText).not.toContain('Copyright 2026')
  })

  it('truncates extracted text to maxChars', async () => {
    const longText = 'A'.repeat(20000)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => `<html><body><p>${longText}</p></body></html>`,
    })

    const result = await checkUrl({ url: 'https://example.fr', sourceType: 'event' }, { maxChars: 5000 })

    expect(result.htmlText!.length).toBeLessThanOrEqual(5000)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/agents && npx jest --testPathPatterns="url-checker" --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// apps/agents/src/edition-confirmation/url-checker.ts

import fetch from 'node-fetch'
import * as cheerio from 'cheerio'
import type { UrlSource, UrlCheckResult } from './types'

const DEFAULT_TIMEOUT = 10_000
const DEFAULT_MAX_CHARS = 8_000
const USER_AGENT = 'Mozilla/5.0 (compatible; DataAgentsBot/1.0; +https://milesrepublic.com)'

const PARKING_INDICATORS = [
  'domain is parked',
  'domain is for sale',
  'domaine à vendre',
  'buy this domain',
  'this domain has expired',
  'godaddy',
  'sedoparking',
  'hugedomains',
  'dan.com',
  'afternic',
]

/**
 * Detects if HTML content is a parked/for-sale domain page.
 */
export function isParkedDomain(html: string): boolean {
  const lower = html.toLowerCase()
  return PARKING_INDICATORS.some(indicator => lower.includes(indicator))
}

/**
 * Extracts readable text from HTML, stripping nav, footer, scripts, styles.
 * Truncates to maxChars.
 */
function extractText(html: string, maxChars: number): string {
  const $ = cheerio.load(html)

  // Remove non-content elements
  $('nav, footer, script, style, noscript, iframe, svg, header').remove()

  // Get text, collapse whitespace
  const text = $('body').text()
    .replace(/\s+/g, ' ')
    .trim()

  return text.slice(0, maxChars)
}

interface CheckUrlOptions {
  timeoutMs?: number
  maxChars?: number
}

/**
 * Checks a single URL for liveness and extracts text content.
 *
 * Returns:
 * - isAlive: true if the site responded with 2xx and has real content
 * - isDead: true if the URL is permanently dead (404, DNS failure, parking)
 *   Note: timeout = NOT dead (site might be temporarily slow)
 */
export async function checkUrl(
  source: UrlSource,
  options?: CheckUrlOptions
): Promise<UrlCheckResult> {
  const { url, sourceType } = source
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT
  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS

  const base: Pick<UrlCheckResult, 'url' | 'sourceType'> = { url, sourceType }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal as any,
      redirect: 'follow',
    })

    clearTimeout(timer)

    if (!response.ok) {
      const isDead = response.status === 404 || response.status === 410 || response.status === 403
      return {
        ...base,
        isAlive: false,
        isDead,
        httpStatus: response.status,
        errorReason: `HTTP_${response.status}`,
      }
    }

    const html = await response.text()

    // Check for parked domains
    if (isParkedDomain(html)) {
      return {
        ...base,
        isAlive: false,
        isDead: true,
        httpStatus: response.status,
        errorReason: 'PARKING_PAGE',
      }
    }

    const htmlText = extractText(html, maxChars)

    return {
      ...base,
      isAlive: true,
      isDead: false,
      httpStatus: response.status,
      htmlText,
      contentLength: htmlText.length,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)

    // DNS failure = dead URL
    if (message.includes('ENOTFOUND') || message.includes('EAI_AGAIN')) {
      return {
        ...base,
        isAlive: false,
        isDead: true,
        errorReason: 'DNS_FAILURE',
      }
    }

    // Connection refused = dead
    if (message.includes('ECONNREFUSED')) {
      return {
        ...base,
        isAlive: false,
        isDead: true,
        errorReason: 'CONNECTION_REFUSED',
      }
    }

    // Timeout or abort = NOT dead, just unreachable
    if (message.includes('abort') || message.includes('timeout') || message.includes('ETIMEDOUT')) {
      return {
        ...base,
        isAlive: false,
        isDead: false,
        errorReason: 'TIMEOUT',
      }
    }

    // Other errors = not dead (unknown issue)
    return {
      ...base,
      isAlive: false,
      isDead: false,
      errorReason: `UNKNOWN: ${message}`,
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/agents && npx jest --testPathPatterns="url-checker" --no-coverage`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/agents/src/edition-confirmation/url-checker.ts apps/agents/src/edition-confirmation/__tests__/url-checker.test.ts
git commit -m "feat(edition-confirmation): add URL checker with dead URL detection"
```

---

## Task 3: Confidence Scoring

**Files:**
- Create: `apps/agents/src/edition-confirmation/__tests__/confidence.test.ts`
- Create: `apps/agents/src/edition-confirmation/confidence.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/agents/src/edition-confirmation/__tests__/confidence.test.ts

import { computeFinalConfidence, SOURCE_WEIGHTS } from '../confidence'
import type { UrlCheckResultWithAnalysis } from '../types'

describe('SOURCE_WEIGHTS', () => {
  it('event has highest weight', () => {
    expect(SOURCE_WEIGHTS.event).toBeGreaterThan(SOURCE_WEIGHTS.organizer)
    expect(SOURCE_WEIGHTS.organizer).toBeGreaterThan(SOURCE_WEIGHTS.timer)
  })
})

describe('computeFinalConfidence', () => {
  it('returns high confidence when event URL confirms with registration open', () => {
    const results: UrlCheckResultWithAnalysis[] = [{
      url: 'https://marathon.fr',
      sourceType: 'event',
      isAlive: true,
      isDead: false,
      httpStatus: 200,
      htmlText: 'content',
      analysis: {
        confirmed: true,
        canceled: false,
        registrationOpen: true,
        datesFound: ['2026-04-15'],
        yearMentioned: true,
        confidence: 0.95,
        reasoning: 'Registration open for 2026',
      },
    }]

    const result = computeFinalConfidence(results)
    expect(result.decision).toBe('CONFIRMED')
    expect(result.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('returns CONFIRMED even from organizer URL (any confirmation wins)', () => {
    const results: UrlCheckResultWithAnalysis[] = [{
      url: 'https://organizer.fr',
      sourceType: 'organizer',
      isAlive: true,
      isDead: false,
      httpStatus: 200,
      htmlText: 'content',
      analysis: {
        confirmed: true,
        canceled: false,
        registrationOpen: true,
        datesFound: ['2026-04-15'],
        yearMentioned: true,
        confidence: 0.90,
        reasoning: 'Confirmed on organizer site',
      },
    }]

    const result = computeFinalConfidence(results)
    expect(result.decision).toBe('CONFIRMED')
    // Organizer URL → slightly lower confidence than event URL
    expect(result.confidence).toBeLessThan(0.95)
    expect(result.confidence).toBeGreaterThanOrEqual(0.85)
  })

  it('returns CANCELED when a URL explicitly says canceled', () => {
    const results: UrlCheckResultWithAnalysis[] = [{
      url: 'https://marathon.fr',
      sourceType: 'event',
      isAlive: true,
      isDead: false,
      httpStatus: 200,
      htmlText: 'content',
      analysis: {
        confirmed: false,
        canceled: true,
        registrationOpen: false,
        datesFound: [],
        yearMentioned: true,
        confidence: 0.90,
        reasoning: 'Event explicitly canceled',
      },
    }]

    const result = computeFinalConfidence(results)
    expect(result.decision).toBe('CANCELED')
    expect(result.confidence).toBeGreaterThanOrEqual(0.85)
  })

  it('returns INCONCLUSIVE when site is alive but no confirmation signal', () => {
    const results: UrlCheckResultWithAnalysis[] = [{
      url: 'https://marathon.fr',
      sourceType: 'event',
      isAlive: true,
      isDead: false,
      httpStatus: 200,
      htmlText: 'content',
      analysis: {
        confirmed: false,
        canceled: false,
        registrationOpen: false,
        datesFound: [],
        yearMentioned: false,
        confidence: 0.3,
        reasoning: 'No info about upcoming edition',
      },
    }]

    const result = computeFinalConfidence(results)
    expect(result.decision).toBe('INCONCLUSIVE')
  })

  it('confirmed wins over inconclusive from different URLs', () => {
    const results: UrlCheckResultWithAnalysis[] = [
      {
        url: 'https://marathon.fr',
        sourceType: 'event',
        isAlive: true,
        isDead: false,
        httpStatus: 200,
        htmlText: 'content',
        analysis: {
          confirmed: false, canceled: false, registrationOpen: false,
          datesFound: [], yearMentioned: false, confidence: 0.3,
          reasoning: 'No info',
        },
      },
      {
        url: 'https://organizer.fr',
        sourceType: 'organizer',
        isAlive: true,
        isDead: false,
        httpStatus: 200,
        htmlText: 'content',
        analysis: {
          confirmed: true, canceled: false, registrationOpen: true,
          datesFound: ['2026-04-15'], yearMentioned: true, confidence: 0.92,
          reasoning: 'Confirmed on organizer site',
        },
      },
    ]

    const result = computeFinalConfidence(results)
    expect(result.decision).toBe('CONFIRMED')
  })

  it('returns INCONCLUSIVE when all URLs are dead (dead URLs handled separately)', () => {
    const results: UrlCheckResultWithAnalysis[] = [{
      url: 'https://dead.fr',
      sourceType: 'event',
      isAlive: false,
      isDead: true,
      errorReason: 'HTTP_404',
    }]

    const result = computeFinalConfidence(results)
    expect(result.decision).toBe('INCONCLUSIVE')
    expect(result.confidence).toBe(0)
  })

  it('boosts confidence when year is mentioned and dates match', () => {
    const withYear: UrlCheckResultWithAnalysis[] = [{
      url: 'https://marathon.fr',
      sourceType: 'event',
      isAlive: true, isDead: false, httpStatus: 200, htmlText: 'content',
      analysis: {
        confirmed: true, canceled: false, registrationOpen: false,
        datesFound: ['2026-04-15'], yearMentioned: true, confidence: 0.85,
        reasoning: 'Year mentioned, dates found',
      },
    }]

    const withoutYear: UrlCheckResultWithAnalysis[] = [{
      url: 'https://marathon.fr',
      sourceType: 'event',
      isAlive: true, isDead: false, httpStatus: 200, htmlText: 'content',
      analysis: {
        confirmed: true, canceled: false, registrationOpen: false,
        datesFound: [], yearMentioned: false, confidence: 0.7,
        reasoning: 'No year, no dates',
      },
    }]

    const resultWithYear = computeFinalConfidence(withYear)
    const resultWithoutYear = computeFinalConfidence(withoutYear)

    expect(resultWithYear.confidence).toBeGreaterThan(resultWithoutYear.confidence)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/agents && npx jest --testPathPatterns="confidence" --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// apps/agents/src/edition-confirmation/confidence.ts

import type { UrlCheckResultWithAnalysis } from './types'

/**
 * Source weight factors for confidence calculation.
 * Event's own website is most reliable, then organizer, then timer.
 */
export const SOURCE_WEIGHTS: Record<string, number> = {
  event: 1.0,
  organizer: 0.85,
  timer: 0.75,
}

interface ConfidenceResult {
  decision: 'CONFIRMED' | 'CANCELED' | 'INCONCLUSIVE'
  confidence: number
  bestSource?: string
}

/**
 * Computes the final decision and confidence from all URL check results.
 *
 * Rules:
 * - Any confirmation wins (decision = CONFIRMED)
 * - Any explicit cancellation wins (unless contradicted by a confirmation)
 * - Confidence is weighted by source type (event > organizer > timer)
 * - Bonuses for: registration open, year mentioned, dates found
 * - Dead URLs are excluded from analysis (handled separately as EVENT_UPDATE proposals)
 */
export function computeFinalConfidence(results: UrlCheckResultWithAnalysis[]): ConfidenceResult {
  // Filter to alive results with analysis
  const analyzed = results.filter(r => r.isAlive && r.analysis)

  if (analyzed.length === 0) {
    return { decision: 'INCONCLUSIVE', confidence: 0 }
  }

  // Check for any confirmation
  const confirmations = analyzed.filter(r => r.analysis!.confirmed)
  const cancellations = analyzed.filter(r => r.analysis!.canceled)

  // Confirmation wins over cancellation (different sources may disagree)
  if (confirmations.length > 0) {
    // Pick the best confirmation (highest weighted confidence)
    const best = confirmations.reduce((best, r) => {
      const score = weightedScore(r)
      return score > weightedScore(best) ? r : best
    })

    return {
      decision: 'CONFIRMED',
      confidence: weightedScore(best),
      bestSource: best.sourceType,
    }
  }

  if (cancellations.length > 0) {
    const best = cancellations.reduce((best, r) => {
      const score = weightedScore(r)
      return score > weightedScore(best) ? r : best
    })

    return {
      decision: 'CANCELED',
      confidence: weightedScore(best),
      bestSource: best.sourceType,
    }
  }

  return { decision: 'INCONCLUSIVE', confidence: 0 }
}

/**
 * Computes a weighted confidence score for a single URL result.
 * Combines: LLM confidence × source weight × bonuses
 */
function weightedScore(result: UrlCheckResultWithAnalysis): number {
  const analysis = result.analysis!
  const sourceWeight = SOURCE_WEIGHTS[result.sourceType] ?? 0.5

  let score = analysis.confidence * sourceWeight

  // Bonus: registration is open (+5%)
  if (analysis.registrationOpen) {
    score = Math.min(1.0, score + 0.05)
  }

  // Bonus: target year mentioned (+3%)
  if (analysis.yearMentioned) {
    score = Math.min(1.0, score + 0.03)
  }

  // Bonus: dates found on page (+2%)
  if (analysis.datesFound.length > 0) {
    score = Math.min(1.0, score + 0.02)
  }

  return Math.round(score * 100) / 100
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/agents && npx jest --testPathPatterns="confidence" --no-coverage`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/agents/src/edition-confirmation/confidence.ts apps/agents/src/edition-confirmation/__tests__/confidence.test.ts
git commit -m "feat(edition-confirmation): add confidence scoring with source weighting"
```

---

## Task 4: LLM Page Analyzer

**Files:**
- Create: `apps/agents/src/edition-confirmation/__tests__/page-analyzer.test.ts`
- Create: `apps/agents/src/edition-confirmation/page-analyzer.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/agents/src/edition-confirmation/__tests__/page-analyzer.test.ts

import { analyzePage, buildAnalysisPrompt } from '../page-analyzer'
import type { EditionTarget } from '../types'

// Mock Anthropic
const mockCreate = jest.fn()
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}))

const sampleTarget: EditionTarget = {
  editionId: 40001,
  eventId: 13001,
  eventName: 'Marathon de Lyon',
  eventCity: 'Lyon',
  editionYear: '2026',
  startDate: new Date('2026-04-15'),
  urls: [],
}

describe('buildAnalysisPrompt', () => {
  it('includes event name, city, year, and expected date', () => {
    const prompt = buildAnalysisPrompt(sampleTarget, 'Page content about marathon')

    expect(prompt).toContain('Marathon de Lyon')
    expect(prompt).toContain('Lyon')
    expect(prompt).toContain('2026')
    expect(prompt).toContain('15')  // day from startDate
    expect(prompt).toContain('Page content about marathon')
  })

  it('handles missing startDate gracefully', () => {
    const targetNoDate = { ...sampleTarget, startDate: null }
    const prompt = buildAnalysisPrompt(targetNoDate, 'Content')

    expect(prompt).toContain('Marathon de Lyon')
    expect(prompt).toContain('2026')
    expect(prompt).not.toContain('undefined')
  })
})

describe('analyzePage', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it('returns structured analysis from LLM tool_use response', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'tool_use',
        name: 'analyze_edition_status',
        input: {
          confirmed: true,
          canceled: false,
          registrationOpen: true,
          datesFound: ['2026-04-15'],
          yearMentioned: true,
          confidence: 0.95,
          reasoning: 'Registration page for 2026 edition is live with open inscriptions',
        },
      }],
    })

    const result = await analyzePage(
      'Inscriptions Marathon de Lyon 2026 ouvertes',
      sampleTarget,
      { apiKey: 'test-key' }
    )

    expect(result).not.toBeNull()
    expect(result!.confirmed).toBe(true)
    expect(result!.registrationOpen).toBe(true)
    expect(result!.confidence).toBe(0.95)
  })

  it('returns null when LLM returns no tool_use block', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'I cannot analyze this.' }],
    })

    const result = await analyzePage(
      'Some content',
      sampleTarget,
      { apiKey: 'test-key' }
    )

    expect(result).toBeNull()
  })

  it('returns null on LLM error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API rate limit'))

    const result = await analyzePage(
      'Some content',
      sampleTarget,
      { apiKey: 'test-key' }
    )

    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/agents && npx jest --testPathPatterns="page-analyzer" --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// apps/agents/src/edition-confirmation/page-analyzer.ts

import Anthropic from '@anthropic-ai/sdk'
import type { EditionTarget, PageAnalysisResult } from './types'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'
const DEFAULT_TIMEOUT = 15_000

interface AnalyzerConfig {
  apiKey: string
  model?: string
  timeout?: number
}

/**
 * Anthropic tool definition for structured edition status analysis
 */
const analysisTool: Anthropic.Tool = {
  name: 'analyze_edition_status',
  description: "Analyze a webpage's content to determine if a sporting event edition is confirmed, canceled, or unknown.",
  input_schema: {
    type: 'object' as const,
    properties: {
      confirmed: {
        type: 'boolean',
        description: 'True if the page confirms the edition will take place (registration open, dates announced, event details for the target year)',
      },
      canceled: {
        type: 'boolean',
        description: 'True only if the page EXPLICITLY states the event is canceled/annulé for the target year',
      },
      registrationOpen: {
        type: 'boolean',
        description: 'True if registrations/inscriptions are currently open for the target edition',
      },
      datesFound: {
        type: 'array',
        items: { type: 'string' },
        description: 'Any dates found on the page in ISO format (YYYY-MM-DD) that seem related to the target edition',
      },
      yearMentioned: {
        type: 'boolean',
        description: 'True if the target year (e.g., 2026) appears on the page in the context of the event',
      },
      confidence: {
        type: 'number',
        description: 'Your confidence in this analysis (0.0 to 1.0). High (>0.9) when registration is open or dates match. Low (<0.5) when page is ambiguous.',
      },
      reasoning: {
        type: 'string',
        description: 'Short (1-2 sentence) explanation of your conclusion',
      },
    },
    required: ['confirmed', 'canceled', 'registrationOpen', 'datesFound', 'yearMentioned', 'confidence', 'reasoning'],
  },
}

/**
 * Builds the LLM prompt for analyzing a page in the context of a specific edition.
 */
export function buildAnalysisPrompt(target: EditionTarget, pageText: string): string {
  const dateStr = target.startDate
    ? format(target.startDate, 'dd MMMM yyyy', { locale: fr })
    : 'date inconnue'

  return `Analyse le contenu de cette page web pour déterminer si l'événement sportif suivant est confirmé pour l'année cible.

## Événement recherché
- **Nom** : ${target.eventName}
- **Ville** : ${target.eventCity || 'inconnue'}
- **Année cible** : ${target.editionYear}
- **Date attendue** : ${dateStr}

## Règles d'analyse
- "confirmed = true" si la page contient des signes clairs que l'édition ${target.editionYear} aura lieu : inscriptions ouvertes, dates annoncées, programme publié, etc.
- "canceled = true" UNIQUEMENT si la page dit explicitement que l'événement est annulé/supprimé pour ${target.editionYear}.
- Si la page parle d'une édition passée ou d'une autre année, ce n'est PAS une confirmation.
- Si la page est un site générique sans mention de ${target.editionYear}, ce n'est PAS une confirmation.
- Confidence élevée (≥ 0.9) : inscriptions ouvertes OU dates ${target.editionYear} explicites.
- Confidence moyenne (0.7-0.9) : année mentionnée mais pas de détails précis.
- Confidence basse (< 0.7) : page ambiguë ou contenu ancien.

## Contenu de la page
${pageText}`
}

/**
 * Analyzes a page's text content using LLM to determine edition status.
 * Returns null if analysis fails.
 */
export async function analyzePage(
  pageText: string,
  target: EditionTarget,
  config: AnalyzerConfig
): Promise<PageAnalysisResult | null> {
  try {
    const client = new Anthropic({ apiKey: config.apiKey })
    const model = config.model ?? DEFAULT_MODEL
    const timeout = config.timeout ?? DEFAULT_TIMEOUT

    const userPrompt = buildAnalysisPrompt(target, pageText)

    const response = await Promise.race([
      client.messages.create({
        model,
        max_tokens: 1024,
        tools: [analysisTool],
        tool_choice: { type: 'tool' as const, name: 'analyze_edition_status' },
        messages: [{ role: 'user', content: userPrompt }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LLM analysis timeout')), timeout)
      ),
    ])

    const toolBlock = (response as Anthropic.Message).content.find(
      (block) => block.type === 'tool_use'
    ) as Anthropic.ToolUseBlock | undefined

    if (!toolBlock) {
      return null
    }

    const input = toolBlock.input as PageAnalysisResult
    return {
      confirmed: Boolean(input.confirmed),
      canceled: Boolean(input.canceled),
      registrationOpen: Boolean(input.registrationOpen),
      datesFound: Array.isArray(input.datesFound) ? input.datesFound : [],
      yearMentioned: Boolean(input.yearMentioned),
      confidence: typeof input.confidence === 'number' ? input.confidence : 0.5,
      reasoning: String(input.reasoning || ''),
    }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/agents && npx jest --testPathPatterns="page-analyzer" --no-coverage`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/agents/src/edition-confirmation/page-analyzer.ts apps/agents/src/edition-confirmation/__tests__/page-analyzer.test.ts
git commit -m "feat(edition-confirmation): add LLM-based page analyzer with structured output"
```

---

## Task 5: Register the Agent in Types Package

**Files:**
- Modify: `packages/types/src/agent-versions.ts`
- Create: `packages/types/src/agent-config-schemas/edition-confirmation.ts`
- Modify: `packages/types/src/agent-config-schemas/index.ts`

- [ ] **Step 1: Add version, type key, and name to agent-versions.ts**

Add to `AGENT_VERSIONS`:
```typescript
EDITION_CONFIRMATION_AGENT: '1.0.0'
```

Add to `AgentTypeKey` union:
```typescript
export type AgentTypeKey = 'FFA_SCRAPER' | 'FFA_RESULTS' | 'GOOGLE_SEARCH_DATE' | 'AUTO_VALIDATOR' | 'SLACK_EVENT' | 'DUPLICATE_DETECTION' | 'EDITION_CONFIRMATION'
```

Add to `AGENT_NAMES`:
```typescript
EDITION_CONFIRMATION: 'Edition Confirmation Agent'
```

- [ ] **Step 2: Create the config schema**

```typescript
// packages/types/src/agent-config-schemas/edition-confirmation.ts

import { ConfigSchema } from '../config.js'

export const EditionConfirmationAgentConfigSchema: ConfigSchema = {
  title: "Configuration Edition Confirmation Agent",
  description: "Agent qui visite les sites web des événements pour confirmer les éditions TO_BE_CONFIRMED",
  categories: [
    {
      id: "database",
      label: "Base de données",
      description: "Configuration de la source de données"
    },
    {
      id: "processing",
      label: "Traitement",
      description: "Paramètres de traitement"
    },
    {
      id: "network",
      label: "Réseau",
      description: "Paramètres HTTP et rate limiting"
    },
    {
      id: "llm",
      label: "LLM",
      description: "Configuration de l'analyse par LLM"
    }
  ],
  fields: [
    {
      name: "sourceDatabase",
      label: "Base de données source",
      type: "select",
      category: "database",
      required: true,
      defaultValue: "",
      description: "Base de données Miles Republic contenant les éditions",
      helpText: "Sélectionnez la base de données configurée dans les Settings",
      options: [],
      validation: { required: true }
    },
    {
      name: "batchSize",
      label: "Taille des lots",
      type: "number",
      category: "processing",
      required: true,
      defaultValue: 30,
      description: "Nombre d'éditions à traiter par exécution",
      helpText: "Chaque édition peut avoir 1-3 URLs à vérifier",
      validation: { required: true, min: 5, max: 100 }
    },
    {
      name: "cooldownDays",
      label: "Cooldown (jours)",
      type: "number",
      category: "processing",
      required: true,
      defaultValue: 14,
      description: "Jours d'attente avant de re-vérifier une édition",
      validation: { required: true, min: 1, max: 90 }
    },
    {
      name: "lookAheadMonths",
      label: "Mois à l'avance",
      type: "number",
      category: "processing",
      required: true,
      defaultValue: 3,
      description: "Combien de mois à l'avance chercher les éditions TO_BE_CONFIRMED",
      validation: { required: true, min: 1, max: 12 }
    },
    {
      name: "requestDelayMs",
      label: "Délai entre requêtes (ms)",
      type: "number",
      category: "network",
      required: true,
      defaultValue: 3000,
      description: "Délai de politesse entre les requêtes HTTP",
      helpText: "Respecte les petits sites associatifs. 3000ms = 3 secondes",
      validation: { required: true, min: 1000, max: 10000 }
    },
    {
      name: "requestTimeoutMs",
      label: "Timeout requête (ms)",
      type: "number",
      category: "network",
      required: false,
      defaultValue: 10000,
      description: "Timeout pour chaque requête HTTP",
      validation: { min: 3000, max: 30000 }
    },
    {
      name: "anthropicApiKey",
      label: "Clé API Anthropic",
      type: "password",
      category: "llm",
      required: false,
      description: "Clé API Anthropic pour l'analyse LLM",
      helpText: "Si non fournie, utilise la variable d'environnement ANTHROPIC_API_KEY"
    },
    {
      name: "llmModel",
      label: "Modèle LLM",
      type: "text",
      category: "llm",
      required: false,
      defaultValue: "claude-haiku-4-5-20251001",
      description: "Modèle Anthropic à utiliser pour l'analyse",
      helpText: "Haiku recommandé pour le rapport coût/performance"
    },
    {
      name: "dryRun",
      label: "Mode simulation",
      type: "switch",
      category: "processing",
      required: false,
      defaultValue: false,
      description: "Analyser sans créer de propositions",
      helpText: "Utile pour tester l'agent avant de l'activer en production"
    }
  ]
}
```

- [ ] **Step 3: Update the config schemas index**

Add to `packages/types/src/agent-config-schemas/index.ts`:

Import:
```typescript
export { EditionConfirmationAgentConfigSchema } from './edition-confirmation.js'
```

Add import for re-export map:
```typescript
import { EditionConfirmationAgentConfigSchema } from './edition-confirmation.js'
```

Add to `AGENT_CONFIG_SCHEMAS`:
```typescript
EDITION_CONFIRMATION: EditionConfirmationAgentConfigSchema,
```

- [ ] **Step 4: Build types package to verify**

Run: `npm run build:types`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/agent-versions.ts packages/types/src/agent-config-schemas/edition-confirmation.ts packages/types/src/agent-config-schemas/index.ts
git commit -m "feat(types): add Edition Confirmation Agent version, name, and config schema"
```

---

## Task 6: Main Agent Class

**Files:**
- Create: `apps/agents/src/EditionConfirmationAgent.ts`

This is the largest task. The agent orchestrates: query targets → check URLs → analyze pages → score confidence → create proposals.

- [ ] **Step 1: Write the agent**

```typescript
// apps/agents/src/EditionConfirmationAgent.ts

import { AGENT_VERSIONS, EditionConfirmationAgentConfigSchema, getAgentName } from '@data-agents/types'
import { BaseAgent, AgentType } from '@data-agents/agent-framework'
import { IAgentStateService, AgentStateService, prisma } from '@data-agents/database'
import type { AgentContext, AgentRunResult } from '@data-agents/agent-framework'
import type {
  EditionConfirmationConfig,
  EditionTarget,
  UrlSource,
  UrlCheckResult,
  UrlCheckResultWithAnalysis,
  EditionCheckResult,
  ConfirmationProgress,
  ConfirmationStats,
} from './edition-confirmation/types'
import { checkUrl } from './edition-confirmation/url-checker'
import { analyzePage } from './edition-confirmation/page-analyzer'
import { computeFinalConfidence } from './edition-confirmation/confidence'

export const EDITION_CONFIRMATION_AGENT_VERSION = AGENT_VERSIONS.EDITION_CONFIRMATION_AGENT

export class EditionConfirmationAgent extends BaseAgent {
  private sourceDb: any
  private stateService: IAgentStateService
  private prisma: typeof prisma

  constructor(config: any, db?: any, logger?: any) {
    const agentConfig = {
      id: config.id || 'edition-confirmation-agent',
      name: config.name || getAgentName('EDITION_CONFIRMATION'),
      description: `Agent qui visite les sites web des événements pour confirmer les éditions TO_BE_CONFIRMED (v${EDITION_CONFIRMATION_AGENT_VERSION})`,
      type: 'EXTRACTOR' as AgentType,
      frequency: config.frequency || '0 */8 * * *',
      isActive: config.isActive ?? true,
      config: {
        version: EDITION_CONFIRMATION_AGENT_VERSION,
        sourceDatabase: config.config?.sourceDatabase,
        batchSize: config.config?.batchSize || 30,
        cooldownDays: config.config?.cooldownDays || 14,
        lookAheadMonths: config.config?.lookAheadMonths || 3,
        requestDelayMs: config.config?.requestDelayMs || 3000,
        requestTimeoutMs: config.config?.requestTimeoutMs || 10000,
        anthropicApiKey: config.config?.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
        llmModel: config.config?.llmModel || 'claude-haiku-4-5-20251001',
        dryRun: config.config?.dryRun ?? false,
        ...config.config,
        configSchema: EditionConfirmationAgentConfigSchema,
      },
    }

    super(agentConfig, db, logger)
    this.prisma = prisma
    this.stateService = new AgentStateService(prisma)
  }

  private async initializeSourceConnection(config: EditionConfirmationConfig): Promise<void> {
    if (!this.sourceDb) {
      this.sourceDb = await this.connectToSource(config.sourceDatabase)
    }
  }

  async run(context: AgentContext): Promise<AgentRunResult> {
    const config = this.config.config as EditionConfirmationConfig

    try {
      context.logger.info(`🚀 Démarrage Edition Confirmation Agent v${EDITION_CONFIRMATION_AGENT_VERSION}`, {
        batchSize: config.batchSize,
        lookAheadMonths: config.lookAheadMonths,
        dryRun: config.dryRun,
      })

      await this.initializeSourceConnection(config)

      // Load progress
      const progress = await this.loadProgress()

      // 1. Get TO_BE_CONFIRMED editions with URLs
      const targets = await this.getEditionTargets(config, progress.lastOffset)

      if (targets.length === 0) {
        // Reset offset
        await this.saveProgress({ ...progress, lastOffset: 0, lastRunAt: new Date().toISOString() })
        context.logger.info('🔄 Aucune édition à vérifier, remise à zéro de l\'offset')
        return { success: true, message: 'No editions to check, reset offset' }
      }

      context.logger.info(`📋 ${targets.length} éditions à vérifier`)

      let proposalsCreated = 0
      const stats: ConfirmationStats = { ...progress.stats }

      // 2. Process each edition
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i]

        // Check cooldown
        const inCooldown = await this.isInCooldown(target.editionId, config.cooldownDays)
        if (inCooldown) {
          context.logger.info(`⏸️ [${i + 1}/${targets.length}] ${target.eventName} — cooldown`)
          continue
        }

        context.logger.info(`🔍 [${i + 1}/${targets.length}] ${target.eventName} (${target.eventCity}) — ${target.urls.length} URL(s)`)

        try {
          const result = await this.checkEdition(target, config, context)

          stats.totalChecked++

          // Handle dead URLs → create EVENT_UPDATE proposals to clear websiteUrl
          for (const deadUrl of result.deadUrls) {
            if (deadUrl.sourceType === 'event') {
              proposalsCreated += await this.createDeadUrlProposal(target, deadUrl, config, context)
            }
            stats.deadUrls++
          }

          // Handle confirmation/cancellation
          if (result.decision === 'CONFIRMED' && result.finalConfidence > 0) {
            proposalsCreated += await this.createConfirmationProposal(target, result, config, context)
            stats.confirmed++
          } else if (result.decision === 'CANCELED') {
            proposalsCreated += await this.createCancellationProposal(target, result, config, context)
            stats.canceled++
          } else {
            stats.inconclusive++
          }

          // Save cooldown
          await this.saveCooldown(target.editionId)

        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          context.logger.error(`❌ Erreur pour ${target.eventName}: ${message}`)
          stats.errors++
        }

        // Politeness delay between editions
        if (i < targets.length - 1) {
          await this.delay(config.requestDelayMs)
        }
      }

      // Save progress
      const newOffset = progress.lastOffset + targets.length
      await this.saveProgress({
        lastOffset: newOffset,
        lastRunAt: new Date().toISOString(),
        stats,
      })

      const summary = `Checked: ${stats.totalChecked}, Confirmed: ${stats.confirmed}, Canceled: ${stats.canceled}, Dead URLs: ${stats.deadUrls}, Inconclusive: ${stats.inconclusive}, Errors: ${stats.errors}, Proposals: ${proposalsCreated}`
      context.logger.info(`✅ Run terminé — ${summary}`)

      return {
        success: true,
        message: summary,
        data: stats,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      context.logger.error(`💥 Erreur fatale: ${message}`)
      return { success: false, message, error: message }
    } finally {
      await this.closeSourceConnections()
    }
  }

  /**
   * Queries Miles Republic for TO_BE_CONFIRMED editions with available URLs.
   */
  private async getEditionTargets(
    config: EditionConfirmationConfig,
    offset: number
  ): Promise<EditionTarget[]> {
    const now = new Date()
    const lookAheadDate = new Date(now)
    lookAheadDate.setMonth(lookAheadDate.getMonth() + config.lookAheadMonths)

    const editions = await this.sourceDb.edition.findMany({
      where: {
        calendarStatus: 'TO_BE_CONFIRMED',
        startDate: {
          gte: now,
          lte: lookAheadDate,
        },
        event: {
          status: 'LIVE',
        },
      },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            city: true,
            websiteUrl: true,
          },
        },
        editionPartners: {
          where: {
            role: { in: ['ORGANIZER', 'TIMER'] },
            websiteUrl: { not: null },
          },
          select: {
            role: true,
            name: true,
            websiteUrl: true,
          },
        },
      },
      orderBy: { startDate: 'asc' },
      skip: offset,
      take: config.batchSize,
    })

    // Convert to EditionTarget, filtering out editions with no URLs at all
    return editions
      .map((edition: any) => {
        const urls: UrlSource[] = []

        // Event website URL
        if (edition.event.websiteUrl) {
          urls.push({
            url: edition.event.websiteUrl,
            sourceType: 'event' as const,
          })
        }

        // Partner URLs
        for (const partner of edition.editionPartners) {
          if (partner.websiteUrl) {
            urls.push({
              url: partner.websiteUrl,
              sourceType: partner.role === 'ORGANIZER' ? 'organizer' as const : 'timer' as const,
              sourceName: partner.name,
            })
          }
        }

        return {
          editionId: edition.id,
          eventId: edition.event.id,
          eventName: edition.event.name,
          eventCity: edition.event.city,
          editionYear: edition.year,
          startDate: edition.startDate,
          urls,
        } as EditionTarget
      })
      .filter((t: EditionTarget) => t.urls.length > 0)
  }

  /**
   * Checks all URLs for a single edition and computes the final result.
   */
  private async checkEdition(
    target: EditionTarget,
    config: EditionConfirmationConfig,
    context: AgentContext
  ): Promise<EditionCheckResult> {
    const urlResults: UrlCheckResultWithAnalysis[] = []
    const deadUrls: UrlCheckResult[] = []

    for (let i = 0; i < target.urls.length; i++) {
      const urlSource = target.urls[i]

      // Check URL liveness
      const checkResult = await checkUrl(urlSource, {
        timeoutMs: config.requestTimeoutMs,
      })

      if (checkResult.isDead) {
        context.logger.info(`  💀 ${urlSource.sourceType}: ${urlSource.url} — ${checkResult.errorReason}`)
        deadUrls.push(checkResult)
        urlResults.push(checkResult)
        continue
      }

      if (!checkResult.isAlive || !checkResult.htmlText) {
        context.logger.info(`  ⚠️ ${urlSource.sourceType}: ${urlSource.url} — pas accessible (${checkResult.errorReason})`)
        urlResults.push(checkResult)
        continue
      }

      // Analyze page content with LLM
      context.logger.info(`  🤖 Analyse LLM: ${urlSource.url} (${checkResult.contentLength} chars)`)

      const analysis = await analyzePage(
        checkResult.htmlText,
        target,
        {
          apiKey: config.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '',
          model: config.llmModel,
        }
      )

      const resultWithAnalysis: UrlCheckResultWithAnalysis = {
        ...checkResult,
        analysis: analysis ?? undefined,
      }

      urlResults.push(resultWithAnalysis)

      if (analysis) {
        context.logger.info(`  📊 Résultat: confirmed=${analysis.confirmed}, canceled=${analysis.canceled}, confidence=${analysis.confidence}, reason="${analysis.reasoning}"`)
      }

      // Delay between URL checks for the same edition
      if (i < target.urls.length - 1) {
        await this.delay(1000)
      }
    }

    // Compute final decision
    const { decision, confidence: finalConfidence } = computeFinalConfidence(urlResults)

    return {
      editionId: target.editionId,
      eventId: target.eventId,
      eventName: target.eventName,
      eventCity: target.eventCity,
      editionYear: target.editionYear,
      startDate: target.startDate,
      urlResults,
      decision,
      finalConfidence,
      deadUrls,
    }
  }

  /**
   * Creates an EDITION_UPDATE proposal to set calendarStatus = CONFIRMED.
   */
  private async createConfirmationProposal(
    target: EditionTarget,
    result: EditionCheckResult,
    config: EditionConfirmationConfig,
    context: AgentContext
  ): Promise<number> {
    if (config.dryRun) {
      context.logger.info(`  🧪 [DRY RUN] Proposition CONFIRMED pour ${target.eventName} (confidence: ${result.finalConfidence})`)
      return 0
    }

    // Check for existing pending proposal
    const existing = await this.prisma.proposal.findFirst({
      where: {
        editionId: target.editionId.toString(),
        agentId: this.config.id,
        status: 'PENDING',
        type: 'EDITION_UPDATE',
      },
    })

    if (existing) {
      context.logger.info(`  ⏭️ Proposition PENDING existante pour édition ${target.editionId}`)
      return 0
    }

    const bestAnalysis = result.urlResults
      .filter(r => r.analysis?.confirmed)
      .sort((a, b) => (b.analysis?.confidence ?? 0) - (a.analysis?.confidence ?? 0))[0]

    const changes = {
      'edition.calendarStatus': {
        old: 'TO_BE_CONFIRMED',
        new: 'CONFIRMED',
        confidence: result.finalConfidence,
      },
    }

    // Include dates if found and different from current
    if (bestAnalysis?.analysis?.datesFound?.length) {
      // Add dates as informational (not as changes to apply — would need separate logic)
    }

    const justification = [
      {
        type: 'url',
        content: bestAnalysis?.url || target.urls[0]?.url || '',
        metadata: {
          eventName: target.eventName,
          eventCity: target.eventCity,
          editionYear: parseInt(target.editionYear),
          source: 'edition_confirmation_agent',
          analysisResults: result.urlResults
            .filter(r => r.analysis)
            .map(r => ({
              url: r.url,
              sourceType: r.sourceType,
              confirmed: r.analysis!.confirmed,
              confidence: r.analysis!.confidence,
              reasoning: r.analysis!.reasoning,
              registrationOpen: r.analysis!.registrationOpen,
              datesFound: r.analysis!.datesFound,
            })),
        },
      },
    ]

    await this.createProposal(
      'EDITION_UPDATE',
      changes,
      justification,
      target.eventId.toString(),
      target.editionId.toString(),
      undefined,
      result.finalConfidence
    )

    context.logger.info(`  ✅ Proposition CONFIRMED créée pour ${target.eventName} (confidence: ${result.finalConfidence})`)
    return 1
  }

  /**
   * Creates an EDITION_UPDATE proposal to set calendarStatus = CANCELED.
   */
  private async createCancellationProposal(
    target: EditionTarget,
    result: EditionCheckResult,
    config: EditionConfirmationConfig,
    context: AgentContext
  ): Promise<number> {
    if (config.dryRun) {
      context.logger.info(`  🧪 [DRY RUN] Proposition CANCELED pour ${target.eventName}`)
      return 0
    }

    const existing = await this.prisma.proposal.findFirst({
      where: {
        editionId: target.editionId.toString(),
        agentId: this.config.id,
        status: 'PENDING',
        type: 'EDITION_UPDATE',
      },
    })

    if (existing) {
      context.logger.info(`  ⏭️ Proposition PENDING existante pour édition ${target.editionId}`)
      return 0
    }

    const cancelAnalysis = result.urlResults
      .filter(r => r.analysis?.canceled)
      .sort((a, b) => (b.analysis?.confidence ?? 0) - (a.analysis?.confidence ?? 0))[0]

    const changes = {
      'edition.calendarStatus': {
        old: 'TO_BE_CONFIRMED',
        new: 'CANCELED',
        confidence: result.finalConfidence,
      },
    }

    const justification = [
      {
        type: 'url',
        content: cancelAnalysis?.url || target.urls[0]?.url || '',
        metadata: {
          eventName: target.eventName,
          eventCity: target.eventCity,
          editionYear: parseInt(target.editionYear),
          source: 'edition_confirmation_agent',
          analysisResults: result.urlResults
            .filter(r => r.analysis)
            .map(r => ({
              url: r.url,
              sourceType: r.sourceType,
              canceled: r.analysis!.canceled,
              confidence: r.analysis!.confidence,
              reasoning: r.analysis!.reasoning,
            })),
        },
      },
    ]

    await this.createProposal(
      'EDITION_UPDATE',
      changes,
      justification,
      target.eventId.toString(),
      target.editionId.toString(),
      undefined,
      result.finalConfidence
    )

    context.logger.info(`  🚫 Proposition CANCELED créée pour ${target.eventName} (confidence: ${result.finalConfidence})`)
    return 1
  }

  /**
   * Creates an EVENT_UPDATE proposal to clear a dead websiteUrl.
   * Confidence = 1.0 (dead URL is a fact, not an inference).
   */
  private async createDeadUrlProposal(
    target: EditionTarget,
    deadUrl: UrlCheckResult,
    config: EditionConfirmationConfig,
    context: AgentContext
  ): Promise<number> {
    if (config.dryRun) {
      context.logger.info(`  🧪 [DRY RUN] Proposition URL morte: ${deadUrl.url} (${deadUrl.errorReason})`)
      return 0
    }

    // Only clear event-level websiteUrl (not partner URLs — different update type)
    if (deadUrl.sourceType !== 'event') {
      return 0
    }

    const existing = await this.prisma.proposal.findFirst({
      where: {
        eventId: target.eventId.toString(),
        agentId: this.config.id,
        status: 'PENDING',
        type: 'EVENT_UPDATE',
      },
    })

    if (existing) {
      return 0
    }

    const changes = {
      'event.websiteUrl': {
        old: deadUrl.url,
        new: null,
        confidence: 1.0,
      },
    }

    const justification = [
      {
        type: 'url',
        content: deadUrl.url,
        metadata: {
          eventName: target.eventName,
          eventCity: target.eventCity,
          editionYear: parseInt(target.editionYear),
          source: 'edition_confirmation_agent',
          deadUrlReason: deadUrl.errorReason,
          httpStatus: deadUrl.httpStatus,
        },
      },
    ]

    await this.createProposal(
      'EVENT_UPDATE',
      changes,
      justification,
      target.eventId.toString(),
      undefined,
      undefined,
      1.0
    )

    context.logger.info(`  💀 Proposition URL morte créée: ${deadUrl.url} (${deadUrl.errorReason})`)
    return 1
  }

  // --- State management ---

  private async loadProgress(): Promise<ConfirmationProgress> {
    const progress = await this.stateService.getState<ConfirmationProgress>(
      this.config.id,
      'progress'
    )
    return progress || {
      lastOffset: 0,
      lastRunAt: new Date().toISOString(),
      stats: {
        totalChecked: 0,
        confirmed: 0,
        canceled: 0,
        inconclusive: 0,
        deadUrls: 0,
        errors: 0,
      },
    }
  }

  private async saveProgress(progress: ConfirmationProgress): Promise<void> {
    await this.stateService.setState(this.config.id, 'progress', progress)
  }

  private async isInCooldown(editionId: number, cooldownDays: number): Promise<boolean> {
    const lastCheck = await this.stateService.getState<string>(
      this.config.id,
      `cooldown:${editionId}`
    )
    if (!lastCheck) return false

    const lastDate = new Date(lastCheck)
    const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000
    return Date.now() - lastDate.getTime() < cooldownMs
  }

  private async saveCooldown(editionId: number): Promise<void> {
    await this.stateService.setState(
      this.config.id,
      `cooldown:${editionId}`,
      new Date().toISOString()
    )
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/agents/src/EditionConfirmationAgent.ts
git commit -m "feat(edition-confirmation): add main agent class with full pipeline"
```

---

## Task 7: Registry Entry & Wire Everything

**Files:**
- Create: `apps/agents/src/registry/edition-confirmation.ts`
- Modify: `apps/agents/src/index.ts`

- [ ] **Step 1: Create the registry file**

```typescript
// apps/agents/src/registry/edition-confirmation.ts

import { EditionConfirmationAgent } from '../EditionConfirmationAgent'
import { EditionConfirmationAgentConfigSchema, getAgentName } from '@data-agents/types'
import { agentRegistry } from '@data-agents/agent-framework'

const DEFAULT_CONFIG = {
  name: getAgentName('EDITION_CONFIRMATION'),
  description: 'Visite les sites web des événements pour confirmer les éditions TO_BE_CONFIRMED',
  type: 'EXTRACTOR' as const,
  frequency: '0 */8 * * *', // Toutes les 8 heures
  isActive: true,
  config: {
    agentType: 'EDITION_CONFIRMATION',
    sourceDatabase: null,
    batchSize: 30,
    cooldownDays: 14,
    lookAheadMonths: 3,
    requestDelayMs: 3000,
    requestTimeoutMs: 10000,
    dryRun: false,
    configSchema: EditionConfirmationAgentConfigSchema,
  },
}

agentRegistry.register('EDITION_CONFIRMATION', EditionConfirmationAgent)

console.log('✅ Edition Confirmation Agent enregistré dans le registry pour EDITION_CONFIRMATION')

export { EditionConfirmationAgent, DEFAULT_CONFIG }
export default EditionConfirmationAgent
```

- [ ] **Step 2: Update apps/agents/src/index.ts**

Add import:
```typescript
import { EditionConfirmationAgent, EDITION_CONFIRMATION_AGENT_VERSION } from './EditionConfirmationAgent'
```

Add registration:
```typescript
agentRegistry.register('EDITION_CONFIRMATION', EditionConfirmationAgent)
```

Add export:
```typescript
export { EditionConfirmationAgent, EDITION_CONFIRMATION_AGENT_VERSION }
```

Add to `AGENT_VERSIONS` object:
```typescript
editionConfirmation: EDITION_CONFIRMATION_AGENT_VERSION,
```

- [ ] **Step 3: Commit**

```bash
git add apps/agents/src/registry/edition-confirmation.ts apps/agents/src/index.ts
git commit -m "feat(edition-confirmation): register agent in registry and index"
```

---

## Task 8: Add to AutoValidatorAgent Eligible List

**Files:**
- Modify: `apps/agents/src/AutoValidatorAgent.ts:111-123`

- [ ] **Step 1: Add EDITION_CONFIRMATION to eligible agent types**

In `getEligibleAgentIds()`, add a new entry to the `OR` array:

```typescript
{ config: { path: ['agentType'], equals: 'EDITION_CONFIRMATION' } }
```

The full method becomes:
```typescript
private async getEligibleAgentIds(): Promise<string[]> {
  const agents = await this.prisma.agent.findMany({
    where: {
      OR: [
        { config: { path: ['agentType'], equals: 'FFA_SCRAPER' } },
        { config: { path: ['agentType'], equals: 'FFA_RESULTS' } },
        { config: { path: ['agentType'], equals: 'SLACK_EVENT' } },
        { config: { path: ['agentType'], equals: 'EDITION_CONFIRMATION' } }
      ]
    },
    select: { id: true }
  })
  return agents.map(a => a.id)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/agents/src/AutoValidatorAgent.ts
git commit -m "feat(auto-validator): add EDITION_CONFIRMATION to eligible agent types"
```

---

## Task 9: Integration Test

**Files:**
- Create: `apps/agents/src/edition-confirmation/__tests__/EditionConfirmationAgent.test.ts`

- [ ] **Step 1: Write the integration test**

```typescript
// apps/agents/src/edition-confirmation/__tests__/EditionConfirmationAgent.test.ts

import { EditionConfirmationAgent } from '../../EditionConfirmationAgent'
import type { AgentContext } from '@data-agents/agent-framework'

// Mock external dependencies
const mockFetch = jest.fn()
jest.mock('node-fetch', () => ({
  __esModule: true,
  default: mockFetch,
}))

const mockCreate = jest.fn()
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}))

// Mock database
const mockPrisma = {
  proposal: {
    findFirst: jest.fn().mockResolvedValue(null),
  },
  agent: {
    findMany: jest.fn().mockResolvedValue([]),
  },
}

const mockStateService = {
  getState: jest.fn().mockResolvedValue(null),
  setState: jest.fn().mockResolvedValue(undefined),
}

jest.mock('@data-agents/database', () => ({
  prisma: mockPrisma,
  AgentStateService: jest.fn().mockImplementation(() => mockStateService),
  IAgentStateService: {},
}))

// Mock connectToSource
const mockSourceDb = {
  edition: {
    findMany: jest.fn().mockResolvedValue([]),
  },
}

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}

const mockContext: AgentContext = {
  logger: mockLogger,
  startTime: new Date(),
  config: {} as any,
}

describe('EditionConfirmationAgent', () => {
  let agent: EditionConfirmationAgent

  beforeEach(() => {
    jest.clearAllMocks()

    agent = new EditionConfirmationAgent({
      id: 'test-agent',
      name: 'Test Edition Confirmation',
      config: {
        sourceDatabase: 'test-db',
        batchSize: 5,
        cooldownDays: 14,
        lookAheadMonths: 3,
        requestDelayMs: 0, // No delay in tests
        requestTimeoutMs: 5000,
        anthropicApiKey: 'test-key',
        dryRun: false,
      },
    })

    // Mock connectToSource
    ;(agent as any).sourceDb = mockSourceDb
    ;(agent as any).initializeSourceConnection = jest.fn().mockResolvedValue(undefined)
    ;(agent as any).closeSourceConnections = jest.fn().mockResolvedValue(undefined)
  })

  it('returns early when no editions to check', async () => {
    mockSourceDb.edition.findMany.mockResolvedValueOnce([])

    const result = await agent.run(mockContext)

    expect(result.success).toBe(true)
    expect(result.message).toContain('reset offset')
  })

  it('creates CONFIRMED proposal when URL confirms edition', async () => {
    // Mock one edition with an event URL
    mockSourceDb.edition.findMany.mockResolvedValueOnce([
      {
        id: 40001,
        year: '2026',
        startDate: new Date('2026-04-15'),
        event: { id: 13001, name: 'Marathon de Lyon', city: 'Lyon', websiteUrl: 'https://marathon-lyon.fr' },
        editionPartners: [],
      },
    ])

    // Mock URL fetch — alive
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '<html><body><h1>Marathon de Lyon 2026</h1><p>Inscriptions ouvertes du 1er janvier au 31 mars 2026</p></body></html>',
    })

    // Mock LLM — confirmed
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'tool_use',
        name: 'analyze_edition_status',
        input: {
          confirmed: true,
          canceled: false,
          registrationOpen: true,
          datesFound: ['2026-04-15'],
          yearMentioned: true,
          confidence: 0.95,
          reasoning: 'Registration open for 2026 edition',
        },
      }],
    })

    // Mock createProposal
    const mockCreateProposal = jest.fn().mockResolvedValue({ id: 'proposal-1' })
    ;(agent as any).createProposal = mockCreateProposal

    const result = await agent.run(mockContext)

    expect(result.success).toBe(true)
    expect(mockCreateProposal).toHaveBeenCalledWith(
      'EDITION_UPDATE',
      expect.objectContaining({
        'edition.calendarStatus': expect.objectContaining({
          old: 'TO_BE_CONFIRMED',
          new: 'CONFIRMED',
        }),
      }),
      expect.any(Array),
      '13001',  // eventId as string
      '40001',  // editionId as string
      undefined,
      expect.any(Number)
    )
  })

  it('creates EVENT_UPDATE proposal for dead event URL', async () => {
    mockSourceDb.edition.findMany.mockResolvedValueOnce([
      {
        id: 40002,
        year: '2026',
        startDate: new Date('2026-05-01'),
        event: { id: 13002, name: 'Trail des Alpes', city: 'Grenoble', websiteUrl: 'https://dead-trail.fr' },
        editionPartners: [],
      },
    ])

    // Mock URL fetch — DNS failure
    mockFetch.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND dead-trail.fr'))

    const mockCreateProposal = jest.fn().mockResolvedValue({ id: 'proposal-2' })
    ;(agent as any).createProposal = mockCreateProposal

    const result = await agent.run(mockContext)

    expect(result.success).toBe(true)
    expect(mockCreateProposal).toHaveBeenCalledWith(
      'EVENT_UPDATE',
      expect.objectContaining({
        'event.websiteUrl': expect.objectContaining({
          old: 'https://dead-trail.fr',
          new: null,
          confidence: 1.0,
        }),
      }),
      expect.any(Array),
      '13002',
      undefined,
      undefined,
      1.0
    )
  })

  it('skips editions in cooldown', async () => {
    // Edition in cooldown
    mockStateService.getState.mockImplementation(async (agentId: string, key: string) => {
      if (key === 'cooldown:40003') return new Date().toISOString()
      if (key === 'progress') return null
      return null
    })

    mockSourceDb.edition.findMany.mockResolvedValueOnce([
      {
        id: 40003,
        year: '2026',
        startDate: new Date('2026-06-01'),
        event: { id: 13003, name: 'Trail Cooldown', city: 'Paris', websiteUrl: 'https://example.fr' },
        editionPartners: [],
      },
    ])

    const mockCreateProposal = jest.fn()
    ;(agent as any).createProposal = mockCreateProposal

    const result = await agent.run(mockContext)

    expect(result.success).toBe(true)
    expect(mockCreateProposal).not.toHaveBeenCalled()
  })

  it('respects dryRun mode — no proposals created', async () => {
    agent = new EditionConfirmationAgent({
      id: 'test-agent-dry',
      config: {
        sourceDatabase: 'test-db',
        batchSize: 5,
        requestDelayMs: 0,
        anthropicApiKey: 'test-key',
        dryRun: true,
      },
    })
    ;(agent as any).sourceDb = mockSourceDb
    ;(agent as any).initializeSourceConnection = jest.fn().mockResolvedValue(undefined)
    ;(agent as any).closeSourceConnections = jest.fn().mockResolvedValue(undefined)

    mockSourceDb.edition.findMany.mockResolvedValueOnce([
      {
        id: 40004,
        year: '2026',
        startDate: new Date('2026-07-01'),
        event: { id: 13004, name: 'Test Event', city: 'Nice', websiteUrl: 'https://test.fr' },
        editionPartners: [],
      },
    ])

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '<html><body>Inscriptions 2026 ouvertes</body></html>',
    })

    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'tool_use',
        name: 'analyze_edition_status',
        input: {
          confirmed: true, canceled: false, registrationOpen: true,
          datesFound: [], yearMentioned: true, confidence: 0.9,
          reasoning: 'Confirmed',
        },
      }],
    })

    const mockCreateProposal = jest.fn()
    ;(agent as any).createProposal = mockCreateProposal

    const result = await agent.run(mockContext)

    expect(result.success).toBe(true)
    expect(mockCreateProposal).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run all tests**

Run: `cd apps/agents && npx jest --testPathPatterns="edition-confirmation" --no-coverage`
Expected: All tests PASS (url-checker + confidence + page-analyzer + integration)

- [ ] **Step 3: Commit**

```bash
git add apps/agents/src/edition-confirmation/__tests__/EditionConfirmationAgent.test.ts
git commit -m "test(edition-confirmation): add integration tests for full agent pipeline"
```

---

## Task 10: Build & Type Check

- [ ] **Step 1: Build types package**

Run: `npm run build:types`
Expected: Success

- [ ] **Step 2: Build agent-framework**

Run: `npm run build:framework`
Expected: Success

- [ ] **Step 3: Build agents package**

Run: `npm run build:agents`
Expected: Success

- [ ] **Step 4: Run full type check**

Run: `npm run tsc`
Expected: No type errors

- [ ] **Step 5: Run all agent tests**

Run: `cd apps/agents && npx jest --no-coverage`
Expected: All tests pass (existing + new)

- [ ] **Step 6: Commit any type fixes if needed**

```bash
git add -A
git commit -m "fix(edition-confirmation): resolve build/type issues"
```

(Skip this step if build passes cleanly.)

---

## Summary of deliverables

| What | Type | Count |
|------|------|-------|
| New agent class | `EditionConfirmationAgent.ts` | 1 |
| Supporting modules | `types.ts`, `url-checker.ts`, `page-analyzer.ts`, `confidence.ts` | 4 |
| Registry + config | `registry/edition-confirmation.ts`, config schema | 2 |
| Types updates | `agent-versions.ts`, schemas index | 2 |
| AutoValidator update | Eligible agents list | 1 |
| Test files | Unit + integration | 4 |
| **Total new/modified** | | **14 files** |
