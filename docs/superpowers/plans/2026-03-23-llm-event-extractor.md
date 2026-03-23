# LLM Event Extractor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the FFA cheerio detail parser with a shared LLM-based extractor (Haiku) that produces better race data (distances, prices, special formats) and is reusable across agents.

**Architecture:** New `event-extraction` service in `agent-framework` with an `LLMEventExtractor` class that sends preprocessed HTML to Haiku via tool use, returning structured `ExtractedEventData`. The FFA scraper calls this instead of `parseCompetitionDetails()`, with cheerio fallback on LLM failure. The `price` field is propagated through the full pipeline.

**Tech Stack:** Anthropic SDK (tool use), cheerio (HTML preprocessing only), TypeScript

**Spec:** `docs/superpowers/specs/2026-03-23-llm-event-extractor-design.md`

---

## File Map

| Path | Action | Responsibility |
|------|--------|----------------|
| `packages/agent-framework/src/services/event-extraction/types.ts` | Create | Shared `ExtractedEventData`, `ExtractedRace`, `ExtractionSource`, `ExtractionOptions`, `ExtractionResult` types |
| `packages/agent-framework/src/services/event-extraction/html-preprocessor.ts` | Create | Strip scripts/styles/nav from HTML, extract specific CSS selectors |
| `packages/agent-framework/src/services/event-extraction/extraction-prompts.ts` | Create | System prompt, tool schema `extract_event_data`, prompt builder |
| `packages/agent-framework/src/services/event-extraction/llm-event-extractor.ts` | Create | `LLMEventExtractor` class — main entry point |
| `packages/agent-framework/src/services/event-extraction/index.ts` | Create | Public exports |
| `packages/agent-framework/src/services/event-extraction/__tests__/html-preprocessor.test.ts` | Create | Tests for HTML cleanup |
| `packages/agent-framework/src/services/event-extraction/__tests__/llm-event-extractor.test.ts` | Create | Tests for extractor (mocked Anthropic) |
| `packages/agent-framework/src/index.ts` | Modify | Add export for event-extraction |
| `apps/agents/src/ffa/types.ts` | Modify | Add `price?: number` to `FFARace` |
| `apps/agents/src/ffa/scraper.ts` | Modify | Use `LLMEventExtractor` with cheerio fallback |
| `apps/agents/src/ffa/parser.ts` | Modify | Keep `parseCompetitionsList`, keep `parseCompetitionDetails` as fallback (no deletion) |
| `apps/agents/src/FFAScraperAgent.ts` | Modify | Pass `price` in race mapping to `ProposalInput`, instantiate extractor |
| `packages/agent-framework/src/services/proposal-builder/proposal-builder.ts` | Modify | Include `price` in race changes output |

---

### Task 1: Shared types

**Files:**
- Create: `packages/agent-framework/src/services/event-extraction/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
/**
 * Types for the shared LLM event extraction service.
 * Designed for reuse across FFA, Slack, and future agents.
 */

import { MatchingLogger } from '../event-matching/types'

/** Source of content to extract event data from */
export type ExtractionSource =
  | { type: 'html'; content: string }
  | { type: 'text'; content: string }
  | { type: 'image'; imageData: Buffer; mimeType: string }

/** Options for extraction */
export interface ExtractionOptions {
  /** Agent-specific context for the prompt (e.g. "Page FFA, compétition départementale") */
  context?: string
  /** CSS selector to extract a specific section from HTML (e.g. "#epreuves") */
  cssSelector?: string
  /** Timeout in ms (default: 15000) */
  timeout?: number
}

/** Result of extraction */
export interface ExtractionResult {
  success: boolean
  data?: ExtractedEventData
  error?: string
}

/** Extracted event data — shared format across all agents */
export interface ExtractedEventData {
  eventName: string
  eventCity?: string
  eventCountry?: string
  eventDepartment?: string
  editionYear?: number
  editionDate?: string        // ISO date YYYY-MM-DD
  editionEndDate?: string     // ISO date YYYY-MM-DD
  races?: ExtractedRace[]
  organizerName?: string
  organizerEmail?: string
  organizerPhone?: string
  organizerWebsite?: string
  registrationUrl?: string
  confidence: number          // 0-1
}

/** Extracted race data */
export interface ExtractedRace {
  name: string
  distance?: number           // meters (0 or omitted if not applicable)
  elevation?: number          // D+ meters
  startTime?: string          // HH:mm
  price?: number              // euros
  raceDate?: string           // DD/MM for multi-day events
  description?: string        // free text for special formats (e.g. "relais 24h, boucle 4.4km")
  categoryLevel1?: string     // RUNNING, TRAIL, WALK, OTHER
  categoryLevel2?: string     // MARATHON, ULTRA_TRAIL, etc.
}

/** Configuration for the LLM extractor */
export interface LLMExtractorConfig {
  apiKey: string
  model?: string              // default: 'claude-haiku-4-5-20251001'
  logger?: MatchingLogger
}
```

- [ ] **Step 2: Create index.ts**

Create `packages/agent-framework/src/services/event-extraction/index.ts`:

```typescript
export {
  ExtractionSource,
  ExtractionOptions,
  ExtractionResult,
  ExtractedEventData,
  ExtractedRace,
  LLMExtractorConfig,
} from './types'
export { LLMEventExtractor } from './llm-event-extractor'
export { preprocessHtml } from './html-preprocessor'
```

- [ ] **Step 3: Add export to agent-framework index**

In `packages/agent-framework/src/index.ts`, add after the proposal-builder export:

```typescript
// Shared LLM event extraction (used by FFA, Slack, and future agents)
export * from './services/event-extraction'
```

- [ ] **Step 4: Commit**

```bash
git add packages/agent-framework/src/services/event-extraction/types.ts \
       packages/agent-framework/src/services/event-extraction/index.ts \
       packages/agent-framework/src/index.ts
git commit -m "feat(event-extraction): add shared types for LLM event extractor"
```

---

### Task 2: HTML preprocessor

**Files:**
- Create: `packages/agent-framework/src/services/event-extraction/__tests__/html-preprocessor.test.ts`
- Create: `packages/agent-framework/src/services/event-extraction/html-preprocessor.ts`

- [ ] **Step 1: Write the test**

```typescript
import { preprocessHtml } from '../html-preprocessor'

describe('preprocessHtml', () => {
  it('strips script tags', () => {
    const html = '<div>hello</div><script>alert("x")</script><p>world</p>'
    const result = preprocessHtml(html)
    expect(result).not.toContain('<script')
    expect(result).toContain('hello')
    expect(result).toContain('world')
  })

  it('strips style tags', () => {
    const html = '<style>.x{color:red}</style><div>content</div>'
    const result = preprocessHtml(html)
    expect(result).not.toContain('<style')
    expect(result).toContain('content')
  })

  it('strips nav, header, footer', () => {
    const html = '<nav>menu</nav><main>content</main><footer>foot</footer>'
    const result = preprocessHtml(html)
    expect(result).not.toContain('menu')
    expect(result).not.toContain('foot')
    expect(result).toContain('content')
  })

  it('extracts specific CSS selector when provided', () => {
    const html = '<div id="other">skip</div><section id="epreuves"><h2>Races</h2><p>10km trail</p></section><div>after</div>'
    const result = preprocessHtml(html, '#epreuves')
    expect(result).toContain('Races')
    expect(result).toContain('10km trail')
    expect(result).not.toContain('skip')
  })

  it('falls back to full cleaned HTML if selector not found', () => {
    const html = '<div>content</div><script>x</script>'
    const result = preprocessHtml(html, '#nonexistent')
    expect(result).toContain('content')
    expect(result).not.toContain('<script')
  })

  it('collapses whitespace', () => {
    const html = '<div>  hello   \n\n\n   world  </div>'
    const result = preprocessHtml(html)
    expect(result).not.toMatch(/\n{3,}/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-framework && npx jest --testPathPatterns="html-preprocessor" --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement html-preprocessor.ts**

```typescript
/**
 * HTML preprocessor for LLM extraction.
 * Strips unnecessary elements to minimize token usage.
 */

import * as cheerio from 'cheerio'

/**
 * Preprocess HTML for LLM extraction.
 * Strips scripts, styles, nav, header, footer.
 * Optionally extracts a specific CSS selector section.
 *
 * @param html - Raw HTML string
 * @param cssSelector - Optional CSS selector to extract (e.g. "#epreuves")
 * @returns Cleaned HTML string
 */
export function preprocessHtml(html: string, cssSelector?: string): string {
  const $ = cheerio.load(html)

  // Remove noise elements
  $('script, style, nav, header, footer, link, meta, noscript, svg, iframe').remove()

  // If a specific selector is requested, try to extract just that section
  if (cssSelector) {
    const $section = $(cssSelector)
    if ($section.length > 0) {
      // Also grab contact/organizer info sections that may be outside the selector
      const sectionHtml = $section.html() || ''
      return collapseWhitespace(sectionHtml)
    }
    // Selector not found — fall through to full document
  }

  const cleaned = $('body').html() || $.html()
  return collapseWhitespace(cleaned)
}

function collapseWhitespace(text: string): string {
  return text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/agent-framework && npx jest --testPathPatterns="html-preprocessor" --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent-framework/src/services/event-extraction/html-preprocessor.ts \
       packages/agent-framework/src/services/event-extraction/__tests__/html-preprocessor.test.ts
git commit -m "feat(event-extraction): add HTML preprocessor for token-efficient LLM extraction"
```

---

### Task 3: Extraction prompts and tool schema

**Files:**
- Create: `packages/agent-framework/src/services/event-extraction/extraction-prompts.ts`

- [ ] **Step 1: Create prompts file**

The system prompt is adapted from the existing Slack `EXTRACTION_PROMPT_SYSTEM` in `apps/api/src/services/slack/extractors/types.ts`. The tool schema replaces the free-form JSON approach with structured Anthropic tool use.

```typescript
/**
 * Prompts and Anthropic tool schema for LLM event extraction.
 *
 * Adapted from Slack extractors (apps/api/src/services/slack/extractors/types.ts)
 * but uses tool_use for structured output instead of free-form JSON.
 */

/** System prompt for event extraction */
export const EXTRACTION_SYSTEM_PROMPT = `Tu es un assistant spécialisé dans l'extraction d'informations sur les événements sportifs (courses à pied, trails, marathons, relais, marches, etc.) en France.

RÈGLES CRITIQUES:
- N'INVENTE JAMAIS de données. Si une information n'est pas explicitement dans le contenu, NE L'INCLUS PAS.
- Pour les dates: utilise uniquement des dates EXPLICITEMENT présentes. Sans année, déduis-la depuis la date du jour fournie (prochaine occurrence future).
- Pour les distances: convertis TOUJOURS en mètres (10km = 10000, 42.195km = 42195). Si la course est un format chronométré (ex: 24h, 12h, 6h) sans distance fixe, mets distance à 0 et décris le format dans le champ description.
- Pour les prix: extrais le montant en euros. Si plusieurs tarifs existent (early bird, sur place), prends le tarif standard.
- Inclus TOUTES les épreuves: trails, courses, randonnées, marches, relais, formats spéciaux.
- Le score de confiance doit être < 0.3 si tu n'as pas trouvé de date.`

/**
 * Build the user prompt for extraction.
 * @param content - The preprocessed content (HTML, text)
 * @param context - Optional agent-specific context
 */
export function buildExtractionUserPrompt(content: string, context?: string): string {
  const today = new Date().toISOString().split('T')[0]
  const contextLine = context ? `\nContexte: ${context}` : ''

  return `Date du jour: ${today}${contextLine}

Extrais les informations de l'événement sportif à partir du contenu suivant. Utilise l'outil extract_event_data pour structurer ta réponse.

---
${content}
---`
}

/** Anthropic tool schema for structured extraction output */
export const extractionTool = {
  name: 'extract_event_data',
  description: 'Extraire les données structurées d\'un événement sportif',
  input_schema: {
    type: 'object' as const,
    properties: {
      eventName: { type: 'string', description: 'Nom de l\'événement' },
      eventCity: { type: 'string', description: 'Ville' },
      eventDepartment: { type: 'string', description: 'Code département (ex: "42", "69", "2A")' },
      editionYear: { type: 'number', description: 'Année de l\'édition' },
      editionDate: { type: 'string', description: 'Date de début ISO (YYYY-MM-DD)' },
      editionEndDate: { type: 'string', description: 'Date de fin ISO si multi-jours' },
      races: {
        type: 'array',
        description: 'Liste des courses/épreuves',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nom de la course' },
            distance: { type: 'number', description: 'Distance en mètres (0 si format chronométré sans distance fixe)' },
            elevation: { type: 'number', description: 'Dénivelé positif en mètres' },
            startTime: { type: 'string', description: 'Heure de départ (HH:mm)' },
            price: { type: 'number', description: 'Prix d\'inscription en euros' },
            raceDate: { type: 'string', description: 'Date de la course DD/MM (pour événements multi-jours)' },
            description: { type: 'string', description: 'Description du format si spécial (ex: relais 24h, boucle 4.4km)' },
            categoryLevel1: {
              type: 'string',
              enum: ['RUNNING', 'TRAIL', 'WALK', 'CYCLING', 'TRIATHLON', 'FUN', 'OTHER'],
              description: 'Catégorie principale'
            },
          },
          required: ['name'],
        },
      },
      organizerName: { type: 'string', description: 'Nom de l\'organisateur' },
      organizerEmail: { type: 'string', description: 'Email de l\'organisateur' },
      organizerPhone: { type: 'string', description: 'Téléphone' },
      organizerWebsite: { type: 'string', description: 'Site web' },
      registrationUrl: { type: 'string', description: 'URL d\'inscription' },
      confidence: { type: 'number', description: 'Score de confiance 0-1 (< 0.3 si pas de date)' },
    },
    required: ['eventName', 'confidence'],
  },
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/agent-framework/src/services/event-extraction/extraction-prompts.ts
git commit -m "feat(event-extraction): add extraction prompts and Anthropic tool schema"
```

---

### Task 4: LLMEventExtractor class

**Files:**
- Create: `packages/agent-framework/src/services/event-extraction/__tests__/llm-event-extractor.test.ts`
- Create: `packages/agent-framework/src/services/event-extraction/llm-event-extractor.ts`

- [ ] **Step 1: Write the tests**

```typescript
import { LLMEventExtractor } from '../llm-event-extractor'
import Anthropic from '@anthropic-ai/sdk'

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk')

const silentLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

function createMockResponse(toolInput: Record<string, any>) {
  return {
    content: [
      {
        type: 'tool_use',
        id: 'test',
        name: 'extract_event_data',
        input: toolInput,
      },
    ],
  }
}

describe('LLMEventExtractor', () => {
  let mockCreate: jest.Mock

  beforeEach(() => {
    mockCreate = jest.fn()
    ;(Anthropic as unknown as jest.Mock).mockImplementation(() => ({
      messages: { create: mockCreate },
    }))
  })

  it('extracts event data from HTML', async () => {
    mockCreate.mockResolvedValue(
      createMockResponse({
        eventName: '24h Les Echelles',
        eventCity: 'Les Echelles',
        editionYear: 2026,
        editionDate: '2026-04-04',
        races: [
          {
            name: '24h en équipe',
            distance: 0,
            price: 90,
            startTime: '11:00',
            description: 'Relais 24h en équipe de 2, boucle de 4.4km',
            categoryLevel1: 'RUNNING',
          },
        ],
        organizerName: 'SPORT NATURE MOUVEMENT',
        organizerEmail: '24hlesechelles@gmail.com',
        confidence: 0.9,
      })
    )

    const extractor = new LLMEventExtractor({
      apiKey: 'test-key',
      logger: silentLogger,
    })

    const result = await extractor.extract({ type: 'html', content: '<div>test</div>' })

    expect(result.success).toBe(true)
    expect(result.data?.eventName).toBe('24h Les Echelles')
    expect(result.data?.races?.[0].price).toBe(90)
    expect(result.data?.races?.[0].distance).toBe(0)
    expect(result.data?.races?.[0].description).toContain('4.4km')
  })

  it('returns error on API failure', async () => {
    mockCreate.mockRejectedValue(new Error('API timeout'))

    const extractor = new LLMEventExtractor({
      apiKey: 'test-key',
      logger: silentLogger,
    })

    const result = await extractor.extract({ type: 'html', content: '<div>test</div>' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('API timeout')
  })

  it('returns error when no tool_use block in response', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'hello' }] })

    const extractor = new LLMEventExtractor({
      apiKey: 'test-key',
      logger: silentLogger,
    })

    const result = await extractor.extract({ type: 'html', content: '<div>test</div>' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('tool_use')
  })

  it('preprocesses HTML with cssSelector option', async () => {
    mockCreate.mockResolvedValue(
      createMockResponse({ eventName: 'Test', confidence: 0.8 })
    )

    const extractor = new LLMEventExtractor({
      apiKey: 'test-key',
      logger: silentLogger,
    })

    const html = '<nav>menu</nav><section id="epreuves"><p>10km trail</p></section>'
    await extractor.extract(
      { type: 'html', content: html },
      { cssSelector: '#epreuves' }
    )

    // Verify the prompt sent to Anthropic doesn't contain the nav
    const callArgs = mockCreate.mock.calls[0][0]
    const userMessage = callArgs.messages[0].content
    expect(userMessage).not.toContain('menu')
    expect(userMessage).toContain('10km trail')
  })

  it('passes context to prompt', async () => {
    mockCreate.mockResolvedValue(
      createMockResponse({ eventName: 'Test', confidence: 0.8 })
    )

    const extractor = new LLMEventExtractor({
      apiKey: 'test-key',
      logger: silentLogger,
    })

    await extractor.extract(
      { type: 'html', content: '<div>test</div>' },
      { context: 'Page FFA compétition départementale' }
    )

    const callArgs = mockCreate.mock.calls[0][0]
    const userMessage = callArgs.messages[0].content
    expect(userMessage).toContain('Page FFA')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-framework && npx jest --testPathPatterns="llm-event-extractor" --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement llm-event-extractor.ts**

```typescript
/**
 * LLMEventExtractor — shared LLM-based event data extraction.
 *
 * Uses Anthropic tool use for structured output.
 * Supports HTML, text, and image inputs (image support for future Slack migration).
 */

import Anthropic from '@anthropic-ai/sdk'
import { preprocessHtml } from './html-preprocessor'
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionUserPrompt, extractionTool } from './extraction-prompts'
import type { ExtractionSource, ExtractionOptions, ExtractionResult, ExtractedEventData, LLMExtractorConfig } from './types'
import type { MatchingLogger } from '../event-matching/types'

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'
const DEFAULT_TIMEOUT = 15_000

const defaultLogger: MatchingLogger = {
  info: (msg) => console.log(`[EXTRACTOR] ${msg}`),
  debug: (msg) => console.log(`[EXTRACTOR] ${msg}`),
  warn: (msg) => console.warn(`[EXTRACTOR] ${msg}`),
  error: (msg) => console.error(`[EXTRACTOR] ${msg}`),
}

export class LLMEventExtractor {
  private client: Anthropic
  private model: string
  private logger: MatchingLogger

  constructor(config: LLMExtractorConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey })
    this.model = config.model ?? DEFAULT_MODEL
    this.logger = config.logger ?? defaultLogger
  }

  async extract(
    source: ExtractionSource,
    options?: ExtractionOptions
  ): Promise<ExtractionResult> {
    try {
      const content = this.prepareContent(source, options)
      const timeout = options?.timeout ?? DEFAULT_TIMEOUT
      const userPrompt = buildExtractionUserPrompt(content, options?.context)

      this.logger.info(`Extracting event data (${source.type}, ${content.length} chars)`)

      const response = await Promise.race([
        this.client.messages.create({
          model: this.model,
          max_tokens: 2048,
          system: EXTRACTION_SYSTEM_PROMPT,
          tools: [extractionTool],
          tool_choice: { type: 'tool' as const, name: 'extract_event_data' },
          messages: [{ role: 'user', content: userPrompt }],
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LLM extraction timeout')), timeout)
        ),
      ])

      const toolBlock = (response as Anthropic.Message).content.find(
        (block) => block.type === 'tool_use'
      ) as Anthropic.ToolUseBlock | undefined

      if (!toolBlock) {
        this.logger.warn('No tool_use block in extraction response')
        return { success: false, error: 'No tool_use block in LLM response' }
      }

      const data = toolBlock.input as ExtractedEventData
      this.logger.info(`Extracted: "${data.eventName}" (${data.races?.length ?? 0} races, confidence: ${data.confidence})`)

      return { success: true, data }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`Extraction failed: ${message}`)
      return { success: false, error: message }
    }
  }

  private prepareContent(source: ExtractionSource, options?: ExtractionOptions): string {
    switch (source.type) {
      case 'html':
        return preprocessHtml(source.content, options?.cssSelector)
      case 'text':
        return source.content
      case 'image':
        // Image support will be implemented during Slack migration
        throw new Error('Image extraction not yet implemented in shared extractor')
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/agent-framework && npx jest --testPathPatterns="llm-event-extractor" --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent-framework/src/services/event-extraction/llm-event-extractor.ts \
       packages/agent-framework/src/services/event-extraction/__tests__/llm-event-extractor.test.ts
git commit -m "feat(event-extraction): add LLMEventExtractor class with tool use"
```

---

### Task 5: Price field propagation

**Files:**
- Modify: `apps/agents/src/ffa/types.ts:136-157` — add `price` to `FFARace`
- Modify: `packages/agent-framework/src/services/proposal-builder/proposal-builder.ts:68-86` — include `price` in race output

- [ ] **Step 1: Add `price` to `FFARace`**

In `apps/agents/src/ffa/types.ts`, add after `positiveElevation` (line ~150):

```typescript
  /** Prix d'inscription en euros */
  price?: number
```

- [ ] **Step 2: Add `price` to proposal builder race output**

In `packages/agent-framework/src/services/proposal-builder/proposal-builder.ts`, inside the `races` map function (around line 68), add `price` to the race object:

```typescript
    const raceObj: Record<string, any> = {
      name: race.name,
      startDate,
      startTime: race.startTime,
      ...distanceFields,
      ...elevationFields,
      categoryLevel1: race.categoryLevel1,
      categoryLevel2: race.categoryLevel2,
      timeZone,
    }

    // Add price if present
    if (race.price !== undefined) {
      raceObj.price = race.price
    }
```

Note: `ProposalRaceInput` in `packages/types/src/proposal-input.ts` already has `price?: number` (line 57). And `proposal-domain.service.ts` already handles `price` when creating races (line 1953). So only the builder needs the change.

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: All packages build successfully

- [ ] **Step 4: Commit**

```bash
git add apps/agents/src/ffa/types.ts \
       packages/agent-framework/src/services/proposal-builder/proposal-builder.ts
git commit -m "feat: propagate price field through FFARace and proposal builder"
```

---

### Task 6: FFA scraper integration

**Files:**
- Modify: `apps/agents/src/ffa/scraper.ts:190-220` — use LLMEventExtractor with cheerio fallback
- Modify: `apps/agents/src/FFAScraperAgent.ts:~900-910` — pass `price` in race mapping

- [ ] **Step 1: Update scraper to use LLMEventExtractor**

In `apps/agents/src/ffa/scraper.ts`, the function `fetchCompetitionDetails` (around line 180) fetches HTML and calls `parseCompetitionDetails()`. Replace the parsing section with:

```typescript
import { LLMEventExtractor, LLMExtractorConfig } from '@data-agents/agent-framework'
import { parseCompetitionDetails } from './parser' // Keep as fallback
```

Update the `fetchCompetitionDetails` function signature to accept an optional extractor:

```typescript
export async function fetchCompetitionDetails(
  competition: FFACompetition,
  extractor?: LLMEventExtractor
): Promise<FFACompetitionDetails | null> {
```

After fetching HTML (line ~201), replace the direct `parseCompetitionDetails` call with:

```typescript
    const html = response.data

    // Try LLM extraction first
    if (extractor) {
      const result = await extractor.extract(
        { type: 'html', content: html },
        {
          context: `Page détail FFA, compétition ${competition.level}, ${competition.city} (${competition.department})`,
          cssSelector: '#epreuves',
        }
      )

      if (result.success && result.data) {
        return mapExtractedToFFADetails(result.data, competition, html)
      }
      console.warn(`[SCRAPER] LLM extraction failed for ${competition.name}, falling back to cheerio`)
    }

    // Fallback to cheerio parser
    const details = parseCompetitionDetails(html, competition)
    return details
```

Add the mapping function in the same file:

```typescript
/**
 * Map LLM ExtractedEventData to FFACompetitionDetails format.
 * Falls back to cheerio for multi-day date parsing (which needs the original HTML).
 */
function mapExtractedToFFADetails(
  data: ExtractedEventData,
  competition: FFACompetition,
  html: string
): FFACompetitionDetails {
  // Use cheerio to extract multi-day dates (robust regex-based logic)
  // This reuses the existing parseCompetitionDetails date logic
  const cheerioDetails = parseCompetitionDetails(html, competition)

  return {
    competition,
    startDate: data.editionDate ? new Date(data.editionDate) : cheerioDetails.startDate,
    endDate: data.editionEndDate ? new Date(data.editionEndDate) : cheerioDetails.endDate,
    organizerName: data.organizerName,
    organizerEmail: data.organizerEmail,
    organizerPhone: data.organizerPhone,
    organizerWebsite: data.organizerWebsite,
    races: (data.races || []).map(race => ({
      name: race.name,
      distance: race.distance,
      positiveElevation: race.elevation,
      startTime: race.startTime,
      raceDate: race.raceDate,
      price: race.price,
      type: mapCategoryToType(race.categoryLevel1),
    })),
  }
}

function mapCategoryToType(categoryLevel1?: string): 'running' | 'trail' | 'walk' | 'other' {
  switch (categoryLevel1) {
    case 'RUNNING': return 'running'
    case 'TRAIL': return 'trail'
    case 'WALK': return 'walk'
    default: return 'other'
  }
}
```

Also import `ExtractedEventData` type at the top of scraper.ts:

```typescript
import type { ExtractedEventData } from '@data-agents/agent-framework'
```

- [ ] **Step 2: Update FFAScraperAgent to instantiate extractor and pass price**

In `apps/agents/src/FFAScraperAgent.ts`, add import:

```typescript
import { LLMEventExtractor } from '@data-agents/agent-framework'
```

In the class, add a property and initialize it in the run method (where `LLM_MATCHING_API_KEY` is read):

```typescript
private extractor?: LLMEventExtractor
```

Initialize when API key is available (in the `run()` method, near where `meilisearchConfig` is set up):

```typescript
if (process.env.LLM_MATCHING_API_KEY) {
  this.extractor = new LLMEventExtractor({
    apiKey: process.env.LLM_MATCHING_API_KEY,
    model: process.env.LLM_MATCHING_MODEL,
    logger: this.logger,
  })
}
```

Pass the extractor to `fetchCompetitionDetails` calls. Find where `fetchCompetitionDetails` is called and add `this.extractor`:

```typescript
const details = await fetchCompetitionDetails(competition, this.extractor)
```

In the `buildProposalInput` method (~line 900), add `price` to the race mapping:

```typescript
    const races: ProposalRaceInput[] = competition.races.map(race => {
      // ... existing category logic ...
      return {
        name: normalizeFFARaceName(race.name, categoryLevel1, categoryLevel2),
        distance: race.distance,
        elevation: race.positiveElevation,
        startTime: race.startTime,
        raceDate: race.raceDate,
        price: race.price,  // NEW: propagate price
        categoryLevel1,
        categoryLevel2: categoryLevel2 ?? undefined,
      }
    })
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: All packages build successfully

- [ ] **Step 4: Commit**

```bash
git add apps/agents/src/ffa/scraper.ts \
       apps/agents/src/FFAScraperAgent.ts
git commit -m "feat(ffa): use LLMEventExtractor for competition details with cheerio fallback"
```

---

### Task 7: End-to-end verification

- [ ] **Step 1: Run all tests**

```bash
npm run test:run
```

Expected: All tests pass

- [ ] **Step 2: Run full build**

```bash
npm run build
```

Expected: All packages build successfully

- [ ] **Step 3: Manual test with a real FFA page (optional, requires API key)**

If `LLM_MATCHING_API_KEY` is set, test with the problematic page:

```bash
cd apps/agents && npx ts-node -e "
const { LLMEventExtractor } = require('@data-agents/agent-framework');
const axios = require('axios');

async function test() {
  const resp = await axios.get('https://www.athle.fr/competitions/511846964843470843608834458846932843');
  const extractor = new LLMEventExtractor({ apiKey: process.env.LLM_MATCHING_API_KEY });
  const result = await extractor.extract(
    { type: 'html', content: resp.data },
    { cssSelector: '#epreuves', context: 'Page FFA compétition départementale' }
  );
  console.log(JSON.stringify(result, null, 2));
}
test();
"
```

Expected: Extraction returns "24h en équipe" with distance 0, price 90, description mentioning "boucle 4.4km"

- [ ] **Step 4: Final commit if any adjustments needed**
