# LLM-Assisted Event & Race Matching — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add LLM (Claude Haiku 4.5) to the matching pipeline — for race matching (Phase 1) and event matching gray zone (Phase 2) — with shadow mode and fallback to current behavior.

**Architecture:** New `LLMMatchingService` in `packages/agent-framework/src/services/event-matching/` wraps Anthropic SDK calls with tool use for structured output. Integrated into existing `matchRaces()` and `matchEvent()` via optional `LLMMatchingConfig` in `MatchingConfig`. Shadow mode logs comparisons to a `llm_matching_logs` DB table.

**Tech Stack:** Anthropic SDK (`@anthropic-ai/sdk`), Prisma (new model + migration), existing Jest test setup.

**Spec:** `docs/superpowers/specs/2026-03-21-llm-matching-design.md`

---

## File Structure

```
packages/agent-framework/src/services/event-matching/
├── types.ts                    # MODIFY — add LLMMatchingConfig, extend RaceMatchInput
├── llm-matching.service.ts     # CREATE — LLM API calls, response parsing, fallback
├── llm-prompts.ts              # CREATE — prompt templates for race + event matching
├── event-matcher.ts            # MODIFY — integrate LLM calls in matchRaces() and matchEvent()
├── index.ts                    # MODIFY — export new types + service
└── __tests__/
    ├── llm-matching.service.test.ts  # CREATE — unit tests for LLM service
    └── llm-prompts.test.ts           # CREATE — prompt construction tests

packages/agent-framework/package.json  # MODIFY — add @anthropic-ai/sdk

packages/database/prisma/schema.prisma              # MODIFY — add LLM settings fields + LlmMatchingLog model
apps/api/src/config/settings.ts                      # MODIFY — add LLM config getters
apps/agents/src/ffa/matcher.ts                       # MODIFY — pass LLM config
apps/api/src/services/slack/SlackProposalService.ts  # MODIFY — pass LLM config
```

---

## Task 1: Add types and configuration

**Files:**
- Modify: `packages/agent-framework/src/services/event-matching/types.ts:75-96,121-125`
- Modify: `packages/agent-framework/src/services/event-matching/index.ts:25-36`

- [ ] **Step 1: Add `LLMMatchingConfig` interface to types.ts**

Add after `MeilisearchMatchingConfig` (line 82):

```typescript
/**
 * Configuration for LLM-assisted matching
 */
export interface LLMMatchingConfig {
  /** Anthropic API key */
  apiKey: string
  /** Model to use (default: 'claude-haiku-4-5-20251001') */
  model?: string
  /** Enable LLM matching (default: true) */
  enabled?: boolean
  /** Max candidates to send to LLM for event judge (default: 5) */
  maxCandidates?: number
  /** Shadow mode: log LLM results but use current matching (default: false) */
  shadowMode?: boolean
}
```

- [ ] **Step 2: Extend `RaceMatchInput` with optional fields**

Modify the interface at lines 121-125:

```typescript
export interface RaceMatchInput {
  name: string
  distance?: number  // in km
  startTime?: string
  categoryLevel1?: string   // e.g. 'TRAIL', 'RUNNING'
  categoryLevel2?: string   // e.g. 'ULTRA_TRAIL', 'MARATHON'
  elevation?: number        // D+ in meters
}
```

- [ ] **Step 3: Add `llm` to `MatchingConfig`**

Modify `MatchingConfig` at lines 87-96:

```typescript
export interface MatchingConfig {
  similarityThreshold: number
  distanceTolerancePercent?: number
  confidenceBase?: number
  meilisearch?: MeilisearchMatchingConfig
  /** Optional LLM configuration for improved matching */
  llm?: LLMMatchingConfig
  /** Pre-created LLM service instance (reused across calls) */
  llmService?: any  // LLMMatchingService — use `any` to avoid circular import
  /** Callback for shadow mode logging */
  onShadowResult?: (log: ShadowLogEntry) => void
}

export interface ShadowLogEntry {
  matchType: 'race' | 'event'
  proposalId?: string
  inputSummary: string
  currentResult: any
  llmResult: any
  diverged: boolean
  responseTimeMs: number
}
```

- [ ] **Step 4: Export new type from index.ts**

Add `LLMMatchingConfig` to the types export block in `index.ts:25-36`.

- [ ] **Step 5: Verify build**

Run: `cd packages/agent-framework && npx tsc --noEmit`
Expected: No errors (only added optional fields)

- [ ] **Step 6: Commit**

```bash
git add packages/agent-framework/src/services/event-matching/types.ts packages/agent-framework/src/services/event-matching/index.ts
git commit -m "feat(matching): add LLMMatchingConfig type and extend RaceMatchInput"
```

---

## Task 2: Install Anthropic SDK in agent-framework

**Files:**
- Modify: `packages/agent-framework/package.json`

- [ ] **Step 1: Install the SDK**

Run: `cd packages/agent-framework && npm install @anthropic-ai/sdk`

- [ ] **Step 2: Verify no circular dependency**

Run: `npm run build` (from root)
Expected: Build passes — `@anthropic-ai/sdk` is an external package, no circular dep.

- [ ] **Step 3: Commit**

```bash
git add packages/agent-framework/package.json package-lock.json
git commit -m "chore(agent-framework): add @anthropic-ai/sdk dependency"
```

---

## Task 3: Create prompt templates

**Files:**
- Create: `packages/agent-framework/src/services/event-matching/llm-prompts.ts`
- Create: `packages/agent-framework/src/services/event-matching/__tests__/llm-prompts.test.ts`

- [ ] **Step 1: Write the test for race matching prompt construction**

```typescript
// __tests__/llm-prompts.test.ts
import { buildRaceMatchingPrompt, buildEventJudgePrompt, sanitizeName } from '../llm-prompts'
import { RaceMatchInput, DbRace } from '../types'

describe('sanitizeName', () => {
  it('strips newlines and control characters', () => {
    expect(sanitizeName('Trail\ndu Lac')).toBe('Trail du Lac')
    expect(sanitizeName('Trail\tdu Lac')).toBe('Trail du Lac')
  })

  it('truncates to 200 chars', () => {
    const longName = 'A'.repeat(250)
    expect(sanitizeName(longName).length).toBe(200)
  })

  it('handles normal names unchanged', () => {
    expect(sanitizeName('Marathon de Paris')).toBe('Marathon de Paris')
  })
})

describe('buildRaceMatchingPrompt', () => {
  const dbRaces: DbRace[] = [
    { id: 100, name: 'Trail 8 km', runDistance: 8, startDate: '2026-05-16T12:00:00Z', runPositiveElevation: null },
    { id: 101, name: 'Trail 25 km', runDistance: 25, startDate: '2026-05-16T07:00:00Z', runPositiveElevation: 800 },
  ]

  const inputRaces: RaceMatchInput[] = [
    { name: 'Trail du Lac 27 km', distance: 27, startTime: '07:00', categoryLevel1: 'TRAIL', categoryLevel2: 'LONG_TRAIL', elevation: 850 },
    { name: 'Trail découverte 8 km', distance: 8, startTime: '12:00', categoryLevel1: 'TRAIL' },
  ]

  it('builds a prompt with all races listed', () => {
    const prompt = buildRaceMatchingPrompt('Trail du Lac', 2026, 'Annecy', dbRaces, inputRaces)
    expect(prompt).toContain('[id:100]')
    expect(prompt).toContain('[id:101]')
    expect(prompt).toContain('Trail du Lac 27 km')
    expect(prompt).toContain('Trail découverte 8 km')
    expect(prompt).toContain('2026')
    expect(prompt).toContain('Annecy')
  })

  it('includes elevation when available', () => {
    const prompt = buildRaceMatchingPrompt('Test', 2026, 'City', dbRaces, inputRaces)
    expect(prompt).toContain('D+800m')
    expect(prompt).toContain('D+850m')
  })
})

describe('buildEventJudgePrompt', () => {
  it('builds a prompt with candidates', () => {
    const candidates = [
      { eventId: 1, eventName: 'Marathon de Paris', eventCity: 'Paris', department: '75', editionYear: 2025, editionDate: '2025-04-06', score: 0.68 },
    ]
    const prompt = buildEventJudgePrompt('Marathon Paris 2026', 'Paris', '75', '2026-04-05', candidates)
    expect(prompt).toContain('Marathon Paris 2026')
    expect(prompt).toContain('[id:1]')
    expect(prompt).toContain('0.68')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/agent-framework && npx jest --testPathPatterns="llm-prompts" --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement prompt templates**

```typescript
// llm-prompts.ts
import { RaceMatchInput, DbRace } from './types'

/**
 * Sanitize a name for safe prompt inclusion.
 * Strips newlines, control chars, truncates to 200 chars.
 */
export function sanitizeName(name: string): string {
  return name
    .replace(/[\n\r\t\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

function formatDbRaceDistance(race: DbRace): string {
  const parts: string[] = []
  if (race.runDistance) parts.push(`${race.runDistance}km`)
  if (race.bikeDistance) parts.push(`vélo ${race.bikeDistance}km`)
  if (race.swimDistance) parts.push(`nat ${race.swimDistance}m`)
  if (race.walkDistance) parts.push(`marche ${race.walkDistance}km`)
  return parts.join(' + ') || 'distance inconnue'
}

function formatTime(date: Date | string | null | undefined): string {
  if (!date) return '?'
  const d = typeof date === 'string' ? new Date(date) : date
  return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`
}

export function buildRaceMatchingPrompt(
  eventName: string,
  editionYear: number,
  eventCity: string,
  dbRaces: DbRace[],
  inputRaces: RaceMatchInput[]
): string {
  const existingLines = dbRaces.map((r, i) => {
    const dist = formatDbRaceDistance(r)
    const elev = r.runPositiveElevation ? ` - D+${r.runPositiveElevation}m` : ''
    const time = formatTime(r.startDate)
    const cat = [r.categoryLevel1, r.categoryLevel2].filter(Boolean).join('/')
    return `${i + 1}. [id:${r.id}] ${sanitizeName(r.name)} - ${dist}${elev} - départ ${time}${cat ? ` - ${cat}` : ''}`
  }).join('\n')

  const proposedLines = inputRaces.map((r, i) => {
    const letter = String.fromCharCode(65 + i) // A, B, C...
    const dist = r.distance ? `${r.distance}km` : 'distance inconnue'
    const elev = r.elevation ? ` - D+${r.elevation}m` : ''
    const time = r.startTime || '?'
    const cat = [r.categoryLevel1, r.categoryLevel2].filter(Boolean).join('/')
    return `${letter}. ${sanitizeName(r.name)} - ${dist}${elev} - départ ${time}${cat ? ` - ${cat}` : ''}`
  }).join('\n')

  return `Tu es un expert en événements sportifs. Pour l'édition ${editionYear} de "${sanitizeName(eventName)}" (${sanitizeName(eventCity)}), voici les courses existantes en base et les courses proposées par une source externe.

Identifie les correspondances : une course proposée peut être la même qu'une course existante même si le nom ou la distance a légèrement changé d'une année sur l'autre.

COURSES EXISTANTES (base de données) :
${existingLines}

COURSES PROPOSÉES (source externe) :
${proposedLines}

Identifie les paires (course proposée = course existante reformatée) et les vraies nouvelles courses.`
}

/**
 * Tool schema for race matching structured output
 */
export const raceMatchingTool = {
  name: 'race_matching_result',
  description: 'Résultat du matching des courses proposées avec les courses existantes',
  input_schema: {
    type: 'object' as const,
    properties: {
      matches: {
        type: 'array',
        description: 'Paires identifiées : course proposée = course existante',
        items: {
          type: 'object',
          properties: {
            proposedIndex: { type: 'string', description: 'Lettre de la course proposée (A, B, C...)' },
            existingRaceId: { type: 'number', description: 'ID de la course existante matchée' },
            confidence: { type: 'number', description: 'Confiance du match (0-1)' },
            reason: { type: 'string', description: 'Explication courte du match' }
          },
          required: ['proposedIndex', 'existingRaceId', 'confidence', 'reason']
        }
      },
      newRaces: {
        type: 'array',
        description: 'Courses proposées qui sont véritablement nouvelles',
        items: {
          type: 'object',
          properties: {
            proposedIndex: { type: 'string', description: 'Lettre de la course proposée' },
            reason: { type: 'string', description: 'Pourquoi cette course est nouvelle' }
          },
          required: ['proposedIndex', 'reason']
        }
      }
    },
    required: ['matches', 'newRaces']
  }
}

export interface EventJudgeCandidate {
  eventId: number
  eventName: string
  eventCity: string
  department?: string
  editionYear?: number
  editionDate?: string
  score: number
}

export function buildEventJudgePrompt(
  inputName: string,
  inputCity: string,
  inputDepartment: string | undefined,
  inputDate: string,
  candidates: EventJudgeCandidate[]
): string {
  const deptLabel = inputDepartment ? ` (${inputDepartment})` : ''

  const candidateLines = candidates.map((c, i) => {
    const dept = c.department ? ` (${c.department})` : ''
    const edition = c.editionYear ? ` - Édition ${c.editionYear}` : ''
    const date = c.editionDate ? ` le ${c.editionDate}` : ''
    return `${i + 1}. [id:${c.eventId}] "${sanitizeName(c.eventName)}" - ${sanitizeName(c.eventCity)}${dept}${edition}${date} - score: ${c.score.toFixed(2)}`
  }).join('\n')

  return `Tu es un expert en événements sportifs français. Un agent a trouvé un événement et cherche s'il existe déjà dans notre base de données.

ÉVÉNEMENT CHERCHÉ :
- Nom : "${sanitizeName(inputName)}"
- Ville : ${sanitizeName(inputCity)}${deptLabel}
- Date : ${inputDate}

CANDIDATS TROUVÉS (triés par score de similarité textuelle) :
${candidateLines}

Est-ce que l'événement cherché correspond à l'un des candidats ? Les noms peuvent différer à cause de sponsors (ex: "Brooks Marathon" = "Marathon"), de reformulations, ou de détails ajoutés/retirés. La date peut varier de quelques jours d'une année sur l'autre.`
}

/**
 * Tool schema for event judge structured output
 */
export const eventJudgeTool = {
  name: 'event_judge_result',
  description: "Résultat du jugement : l'événement cherché correspond-il à un candidat ?",
  input_schema: {
    type: 'object' as const,
    properties: {
      found: { type: 'boolean', description: "true si un candidat correspond, false sinon" },
      eventId: { type: 'number', description: "ID de l'événement correspondant (si found=true)" },
      confidence: { type: 'number', description: 'Confiance du match 0-1 (si found=true)' },
      reason: { type: 'string', description: 'Explication du résultat' }
    },
    required: ['found', 'reason']
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/agent-framework && npx jest --testPathPatterns="llm-prompts" --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent-framework/src/services/event-matching/llm-prompts.ts packages/agent-framework/src/services/event-matching/__tests__/llm-prompts.test.ts
git commit -m "feat(matching): add LLM prompt templates with tool schemas for structured output"
```

---

## Task 4: Create LLMMatchingService

**Files:**
- Create: `packages/agent-framework/src/services/event-matching/llm-matching.service.ts`
- Create: `packages/agent-framework/src/services/event-matching/__tests__/llm-matching.service.test.ts`

- [ ] **Step 1: Write tests for LLMMatchingService**

```typescript
// __tests__/llm-matching.service.test.ts
import { LLMMatchingService } from '../llm-matching.service'
import { RaceMatchInput, DbRace, LLMMatchingConfig, MatchingLogger } from '../types'

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn()
    }
  }))
})

const mockLogger: MatchingLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

const config: LLMMatchingConfig = {
  apiKey: 'test-key',
  model: 'claude-haiku-4-5-20251001',
  enabled: true,
}

describe('LLMMatchingService', () => {
  let service: LLMMatchingService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new LLMMatchingService(config, mockLogger)
  })

  describe('matchRacesWithLLM', () => {
    const dbRaces: DbRace[] = [
      { id: 100, name: 'Trail 8 km', runDistance: 8, startDate: '2026-05-16T12:00:00Z' },
      { id: 101, name: 'Trail 25 km', runDistance: 25, startDate: '2026-05-16T07:00:00Z', runPositiveElevation: 800 },
    ]
    const inputRaces: RaceMatchInput[] = [
      { name: 'Trail du Lac 27 km', distance: 27, startTime: '07:00' },
      { name: 'Trail découverte 8 km', distance: 8, startTime: '12:00' },
      { name: 'Défi 4x14', distance: 56, startTime: '22:00' },
    ]

    it('returns matched and unmatched races from LLM response', async () => {
      // Mock tool use response
      const Anthropic = require('@anthropic-ai/sdk')
      const mockCreate = Anthropic.mock.instances[0].messages.create
      mockCreate.mockResolvedValue({
        content: [{
          type: 'tool_use',
          name: 'race_matching_result',
          input: {
            matches: [
              { proposedIndex: 'A', existingRaceId: 101, confidence: 0.9, reason: 'same distance range, same time' },
              { proposedIndex: 'B', existingRaceId: 100, confidence: 0.95, reason: 'same distance, same time' },
            ],
            newRaces: [
              { proposedIndex: 'C', reason: 'relay format, no match' },
            ]
          }
        }]
      })

      const result = await service.matchRacesWithLLM('Trail du Lac', 2026, 'Annecy', dbRaces, inputRaces)

      expect(result).not.toBeNull()
      expect(result!.matched).toHaveLength(2)
      expect(result!.matched[0].input.name).toBe('Trail du Lac 27 km')
      expect(result!.matched[0].db.id).toBe(101)
      expect(result!.matched[1].input.name).toBe('Trail découverte 8 km')
      expect(result!.matched[1].db.id).toBe(100)
      expect(result!.unmatched).toHaveLength(1)
      expect(result!.unmatched[0].name).toBe('Défi 4x14')
    })

    it('returns null on API error (fallback signal)', async () => {
      const Anthropic = require('@anthropic-ai/sdk')
      const mockCreate = Anthropic.mock.instances[0].messages.create
      mockCreate.mockRejectedValue(new Error('API timeout'))

      const result = await service.matchRacesWithLLM('Test', 2026, 'City', dbRaces, inputRaces)

      expect(result).toBeNull()
      expect(mockLogger.warn).toHaveBeenCalled()
    })

    it('returns null if LLM response references invalid race ID', async () => {
      const Anthropic = require('@anthropic-ai/sdk')
      const mockCreate = Anthropic.mock.instances[0].messages.create
      mockCreate.mockResolvedValue({
        content: [{
          type: 'tool_use',
          name: 'race_matching_result',
          input: {
            matches: [
              { proposedIndex: 'A', existingRaceId: 9999, confidence: 0.9, reason: 'test' },
            ],
            newRaces: []
          }
        }]
      })

      const result = await service.matchRacesWithLLM('Test', 2026, 'City', dbRaces, inputRaces)

      // Invalid race ID → treated as unmatched, does not crash
      expect(result).not.toBeNull()
      expect(result!.matched).toHaveLength(0)
      expect(result!.unmatched.length).toBeGreaterThanOrEqual(1)
    })

    it('does not call API when disabled', async () => {
      const disabledService = new LLMMatchingService({ ...config, enabled: false }, mockLogger)
      const result = await disabledService.matchRacesWithLLM('Test', 2026, 'City', dbRaces, inputRaces)
      expect(result).toBeNull()
    })

    it('returns null when total races exceed MAX_RACES_TOTAL (40)', async () => {
      const manyDbRaces = Array.from({ length: 25 }, (_, i) => ({ id: i, name: `Race ${i}`, runDistance: i + 1 }))
      const manyInputRaces = Array.from({ length: 20 }, (_, i) => ({ name: `Input ${i}`, distance: i + 1 }))
      const result = await service.matchRacesWithLLM('Test', 2026, 'City', manyDbRaces, manyInputRaces)
      expect(result).toBeNull()
    })

    it('handles duplicate match targets by deduplicating', async () => {
      const Anthropic = require('@anthropic-ai/sdk')
      const mockCreate = Anthropic.mock.instances[0].messages.create
      mockCreate.mockResolvedValue({
        content: [{
          type: 'tool_use',
          name: 'race_matching_result',
          input: {
            matches: [
              { proposedIndex: 'A', existingRaceId: 100, confidence: 0.9, reason: 'match' },
              { proposedIndex: 'B', existingRaceId: 100, confidence: 0.8, reason: 'also match to same' },
            ],
            newRaces: []
          }
        }]
      })

      const result = await service.matchRacesWithLLM('Test', 2026, 'City', dbRaces, inputRaces)
      expect(result).not.toBeNull()
      // First match wins, second treated as unmatched
      expect(result!.matched).toHaveLength(1)
      expect(result!.unmatched.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('judgeEventMatchWithLLM', () => {
    it('returns match result from LLM', async () => {
      const Anthropic = require('@anthropic-ai/sdk')
      const mockCreate = Anthropic.mock.instances[0].messages.create
      mockCreate.mockResolvedValue({
        content: [{
          type: 'tool_use',
          name: 'event_judge_result',
          input: {
            found: true, eventId: 2642, confidence: 0.92, reason: 'same marathon, Brooks is sponsor'
          }
        }]
      })

      const candidates = [
        { eventId: 2642, eventName: 'Marathon du lac', eventCity: 'Annecy', score: 0.68 },
      ]
      const result = await service.judgeEventMatchWithLLM('Brooks Marathon Annecy', 'Annecy', '74', '2026-04-19', candidates)

      expect(result).not.toBeNull()
      expect(result!.eventId).toBe(2642)
      expect(result!.confidence).toBe(0.92)
    })

    it('returns null match when LLM says no match', async () => {
      const Anthropic = require('@anthropic-ai/sdk')
      const mockCreate = Anthropic.mock.instances[0].messages.create
      mockCreate.mockResolvedValue({
        content: [{
          type: 'tool_use',
          name: 'event_judge_result',
          input: {
            found: false, reason: 'no candidate matches'
          }
        }]
      })

      const result = await service.judgeEventMatchWithLLM('New Event', 'City', '75', '2026-01-01', [])
      expect(result).toEqual({ eventId: null, confidence: 0, reason: 'no candidate matches' })
    })

    it('returns null on API error', async () => {
      const Anthropic = require('@anthropic-ai/sdk')
      const mockCreate = Anthropic.mock.instances[0].messages.create
      mockCreate.mockRejectedValue(new Error('rate limit'))

      const result = await service.judgeEventMatchWithLLM('Test', 'City', '75', '2026-01-01', [])
      expect(result).toBeNull()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/agent-framework && npx jest --testPathPatterns="llm-matching.service" --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement LLMMatchingService**

```typescript
// llm-matching.service.ts
import Anthropic from '@anthropic-ai/sdk'
import { LLMMatchingConfig, RaceMatchInput, RaceMatchResult, DbRace, MatchingLogger } from './types'
import {
  buildRaceMatchingPrompt, raceMatchingTool,
  buildEventJudgePrompt, eventJudgeTool,
  EventJudgeCandidate
} from './llm-prompts'

const LLM_TIMEOUT_MS = 10_000
const MAX_RACES_TOTAL = 40

export interface EventJudgeResult {
  eventId: number | null
  confidence: number
  reason: string
}

export class LLMMatchingService {
  private client: Anthropic | null = null
  private config: LLMMatchingConfig
  private logger: MatchingLogger

  constructor(config: LLMMatchingConfig, logger: MatchingLogger) {
    this.config = config
    this.logger = logger
    if (config.enabled !== false && config.apiKey) {
      this.client = new Anthropic({ apiKey: config.apiKey })
    }
  }

  /**
   * Match races using LLM. Returns null if LLM is unavailable or fails (caller should fallback).
   */
  async matchRacesWithLLM(
    eventName: string,
    editionYear: number,
    eventCity: string,
    dbRaces: DbRace[],
    inputRaces: RaceMatchInput[]
  ): Promise<RaceMatchResult | null> {
    if (!this.client || this.config.enabled === false) return null
    if (dbRaces.length + inputRaces.length > MAX_RACES_TOTAL) {
      this.logger.info(`LLM race matching skipped: too many races (${dbRaces.length} + ${inputRaces.length} > ${MAX_RACES_TOTAL})`)
      return null
    }

    const startTime = Date.now()
    try {
      const prompt = buildRaceMatchingPrompt(eventName, editionYear, eventCity, dbRaces, inputRaces)

      const response = await Promise.race([
        this.client.messages.create({
          model: this.config.model ?? 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
          tools: [raceMatchingTool as any],
          tool_choice: { type: 'tool' as const, name: 'race_matching_result' },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LLM timeout')), LLM_TIMEOUT_MS)
        )
      ])

      const elapsed = Date.now() - startTime
      this.logger.info(`LLM race matching completed in ${elapsed}ms`)

      // Extract tool use result
      const toolUse = response.content.find((block: any) => block.type === 'tool_use')
      if (!toolUse || toolUse.type !== 'tool_use') {
        this.logger.warn('LLM race matching: no tool_use block in response')
        return null
      }

      const llmResult = toolUse.input as {
        matches: Array<{ proposedIndex: string, existingRaceId: number, confidence: number, reason: string }>
        newRaces: Array<{ proposedIndex: string, reason: string }>
      }

      // Convert LLM result to RaceMatchResult
      return this.convertRaceResult(llmResult, inputRaces, dbRaces)
    } catch (error: any) {
      const elapsed = Date.now() - startTime
      this.logger.warn(`LLM race matching failed after ${elapsed}ms: ${error.message}`)
      return null
    }
  }

  /**
   * Judge event match using LLM. Returns null if LLM is unavailable or fails.
   */
  async judgeEventMatchWithLLM(
    inputName: string,
    inputCity: string,
    inputDepartment: string | undefined,
    inputDate: string,
    candidates: EventJudgeCandidate[]
  ): Promise<EventJudgeResult | null> {
    if (!this.client || this.config.enabled === false) return null

    const maxCandidates = this.config.maxCandidates ?? 5
    const topCandidates = candidates.slice(0, maxCandidates)

    const startTime = Date.now()
    try {
      const prompt = buildEventJudgePrompt(inputName, inputCity, inputDepartment, inputDate, topCandidates)

      const response = await Promise.race([
        this.client.messages.create({
          model: this.config.model ?? 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
          tools: [eventJudgeTool as any],
          tool_choice: { type: 'tool' as const, name: 'event_judge_result' },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LLM timeout')), LLM_TIMEOUT_MS)
        )
      ])

      const elapsed = Date.now() - startTime
      this.logger.info(`LLM event judge completed in ${elapsed}ms`)

      const toolUse = response.content.find((block: any) => block.type === 'tool_use')
      if (!toolUse || toolUse.type !== 'tool_use') {
        this.logger.warn('LLM event judge: no tool_use block in response')
        return null
      }

      const llmResult = toolUse.input as {
        found: boolean
        eventId?: number
        confidence?: number
        reason: string
      }

      if (!llmResult.found || !llmResult.eventId) {
        return { eventId: null, confidence: 0, reason: llmResult.reason || 'no match' }
      }

      // Verify eventId is in candidates
      const validCandidate = topCandidates.find(c => c.eventId === llmResult.eventId)
      if (!validCandidate) {
        this.logger.warn(`LLM event judge returned unknown eventId ${llmResult.eventId}`)
        return null
      }

      return {
        eventId: llmResult.eventId,
        confidence: llmResult.confidence ?? 0.8,
        reason: llmResult.reason,
      }
    } catch (error: any) {
      const elapsed = Date.now() - startTime
      this.logger.warn(`LLM event judge failed after ${elapsed}ms: ${error.message}`)
      return null
    }
  }

  private convertRaceResult(
    llmResult: {
      matches: Array<{ proposedIndex: string, existingRaceId: number, confidence: number, reason: string }>
      newRaces: Array<{ proposedIndex: string, reason: string }>
    },
    inputRaces: RaceMatchInput[],
    dbRaces: DbRace[]
  ): RaceMatchResult {
    const matched: Array<{ input: RaceMatchInput, db: DbRace }> = []
    const unmatched: RaceMatchInput[] = []
    const processedIndices = new Set<string>()
    const matchedDbIds = new Set<number | string>()  // Dedup: prevent same DB race matched twice

    // Process matches
    for (const m of llmResult.matches) {
      const inputIndex = m.proposedIndex.charCodeAt(0) - 65 // A=0, B=1, ...
      if (inputIndex < 0 || inputIndex >= inputRaces.length) continue

      const dbRace = dbRaces.find(r => Number(r.id) === m.existingRaceId)
      if (!dbRace) {
        this.logger.warn(`LLM matched to unknown race ID ${m.existingRaceId}, treating as unmatched`)
        unmatched.push(inputRaces[inputIndex])
        processedIndices.add(m.proposedIndex)
        continue
      }

      // Dedup: if this DB race was already matched, treat as unmatched
      if (matchedDbIds.has(dbRace.id)) {
        this.logger.warn(`LLM matched duplicate DB race ${dbRace.id}, treating "${inputRaces[inputIndex].name}" as unmatched`)
        unmatched.push(inputRaces[inputIndex])
        processedIndices.add(m.proposedIndex)
        continue
      }

      matched.push({ input: inputRaces[inputIndex], db: dbRace })
      matchedDbIds.add(dbRace.id)
      processedIndices.add(m.proposedIndex)
      this.logger.debug(`LLM match: "${inputRaces[inputIndex].name}" → "${dbRace.name}" (${m.confidence}, ${m.reason})`)
    }

    // Process explicit new races
    for (const nr of llmResult.newRaces) {
      const inputIndex = nr.proposedIndex.charCodeAt(0) - 65
      if (inputIndex < 0 || inputIndex >= inputRaces.length) continue
      if (processedIndices.has(nr.proposedIndex)) continue

      unmatched.push(inputRaces[inputIndex])
      processedIndices.add(nr.proposedIndex)
    }

    // Any unmentioned race → unmatched (safe default)
    for (let i = 0; i < inputRaces.length; i++) {
      const letter = String.fromCharCode(65 + i)
      if (!processedIndices.has(letter)) {
        unmatched.push(inputRaces[i])
      }
    }

    return { matched, unmatched }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/agent-framework && npx jest --testPathPatterns="llm-matching.service" --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent-framework/src/services/event-matching/llm-matching.service.ts packages/agent-framework/src/services/event-matching/__tests__/llm-matching.service.test.ts
git commit -m "feat(matching): implement LLMMatchingService with race matching and event judge"
```

---

## Task 5: Integrate LLM into matchRaces() (sync→async conversion)

**Files:**
- Modify: `packages/agent-framework/src/services/event-matching/event-matcher.ts:355-524`
- Modify: `packages/agent-framework/src/services/event-matching/__tests__/match-races.test.ts`
- Modify: `apps/agents/src/ffa/matcher.ts:143-175` (legacy wrapper)
- Modify: `apps/agents/src/ffa/__tests__/matcher.race-hybrid.test.ts` (8 test cases)
- Modify: `apps/api/src/services/slack/SlackProposalService.ts:434`
- Modify: `apps/api/src/services/slack/__tests__/SlackProposalService.test.ts`
- Modify: `apps/api/src/routes/proposals.ts:2292-2296`

**⚠️ IMPORTANT: sync→async cascade**

`matchRaces()` becomes `async`. This cascades to ALL callers:

| Caller | File | Line | Action |
|--------|------|------|--------|
| `matchRacesByDistanceAndName()` | `event-matcher.ts:485-524` | 510 | Make async, `await matchRaces(...)` |
| `matchRacesByDistanceAndName()` (FFA wrapper) | `apps/agents/src/ffa/matcher.ts:143` | 161 | Make async, `await matchRacesGeneric(...)` |
| SlackProposalService | `apps/api/src/services/slack/SlackProposalService.ts` | 434 | Add `await` |
| proposals.ts (race re-matching) | `apps/api/src/routes/proposals.ts` | 2296 | Add `await` |
| 8 test cases | `apps/agents/src/ffa/__tests__/matcher.race-hybrid.test.ts` | multiple | Add `async/await` |
| 3 test mocks | `apps/api/src/services/slack/__tests__/SlackProposalService.test.ts` | 90,1264,1328 | Change `mockReturnValue` → `mockResolvedValue` |
| match-races tests | `packages/agent-framework/.../match-races.test.ts` | multiple | Add `async/await` |

- [ ] **Step 1: Write integration test for LLM race matching**

Add to `__tests__/match-races.test.ts`:

```typescript
import { LLMMatchingService } from '../llm-matching.service'

jest.mock('../llm-matching.service')

describe('matchRaces with LLM', () => {
  const mockLLMService = {
    matchRacesWithLLM: jest.fn(),
  } as unknown as LLMMatchingService

  it('uses LLM result when available', async () => {
    const dbRaces = [{ id: 100, name: 'Trail 25 km', runDistance: 25 }]
    const inputRaces = [{ name: 'Trail du Lac 27 km', distance: 27 }]

    mockLLMService.matchRacesWithLLM = jest.fn().mockResolvedValue({
      matched: [{ input: inputRaces[0], db: dbRaces[0] }],
      unmatched: [],
    })

    const result = await matchRaces(inputRaces, dbRaces, defaultLogger, 0.15, {
      llmService: mockLLMService,
      eventName: 'Trail du Lac',
      editionYear: 2026,
      eventCity: 'Annecy',
    })

    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].db.id).toBe(100)
  })

  it('falls back to distance matching when LLM returns null', async () => {
    mockLLMService.matchRacesWithLLM = jest.fn().mockResolvedValue(null)

    const result = await matchRaces(
      [{ name: 'Trail 10 km', distance: 10 }],
      [{ id: 100, name: 'Trail 10 km', runDistance: 10 }],
      defaultLogger, 0.15,
      { llmService: mockLLMService, eventName: 'Test', editionYear: 2026, eventCity: 'City' }
    )

    expect(result.matched).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-framework && npx jest --testPathPatterns="match-races" --no-coverage`
Expected: FAIL — `matchRaces` does not accept LLM options

- [ ] **Step 3: Make matchRaces() async with LLM support**

In `event-matcher.ts`:

```typescript
export interface RaceMatchLLMContext {
  llmService?: LLMMatchingService
  eventName?: string
  editionYear?: number
  eventCity?: string
  shadowMode?: boolean
  onShadowResult?: (log: ShadowLogEntry) => void
}

export async function matchRaces(
  inputRaces: RaceMatchInput[],
  dbRaces: DbRace[],
  logger: MatchingLogger = defaultLogger,
  tolerancePercent: number = 0.15,
  llmContext?: RaceMatchLLMContext
): Promise<RaceMatchResult> {
  // Try LLM matching first if available
  if (llmContext?.llmService && llmContext.eventName) {
    const llmResult = await llmContext.llmService.matchRacesWithLLM(
      llmContext.eventName,
      llmContext.editionYear ?? new Date().getFullYear(),
      llmContext.eventCity ?? '',
      dbRaces,
      inputRaces
    )
    if (llmResult) {
      logger.info(`🤖 LLM race matching: ${llmResult.matched.length} matched, ${llmResult.unmatched.length} unmatched`)
      return llmResult
    }
    logger.info('🤖 LLM race matching unavailable, falling back to distance-based matching')
  }

  // Existing distance-based matching below (unchanged)...
```

- [ ] **Step 4: Make matchRacesByDistanceAndName() async in event-matcher.ts (line 485)**

```typescript
export async function matchRacesByDistanceAndName(
  // ... same params
): Promise<{ matched: ..., unmatched: ... }> {
  // ...
  const result = await matchRaces(raceInputs, dbRaces, adaptedLogger, tolerancePercent)
  // ... rest unchanged
```

- [ ] **Step 5: Update FFA matcher wrapper (apps/agents/src/ffa/matcher.ts:143)**

Make the `matchRacesByDistanceAndName` wrapper async and add `await`:

```typescript
export async function matchRacesByDistanceAndName(...) {
  const result = await matchRacesGeneric(raceInputs, dbRaces, adaptedLogger, tolerancePercent)
```

- [ ] **Step 6: Update SlackProposalService.ts:434**

Add `await` to the `matchRaces()` call.

- [ ] **Step 7: Update proposals.ts:2296**

Add `await` to the `matchRacesByDistanceAndName()` call.

- [ ] **Step 8: Update ALL existing test files for async**

- `__tests__/match-races.test.ts`: Add `async/await` to all `matchRaces()` calls
- `apps/agents/src/ffa/__tests__/matcher.race-hybrid.test.ts`: Add `async/await` to all 8 test cases
- `apps/api/src/services/slack/__tests__/SlackProposalService.test.ts`: Change `mockReturnValue` → `mockResolvedValue` for `matchRaces` mocks (lines 90, 1264, 1328)

- [ ] **Step 9: Run ALL matching-related tests**

Run: `npm run test:run` (full suite to catch any missed caller)
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(matching): integrate LLM into matchRaces() with async conversion and all caller updates"
```

---

## Task 6: Integrate LLM into matchEvent() gray zone

**Files:**
- Modify: `packages/agent-framework/src/services/event-matching/event-matcher.ts:~284-338`
- Modify: `packages/agent-framework/src/services/event-matching/__tests__/event-matcher.test.ts`

**⚠️ IMPORTANT: LLMMatchingService must be passed via config, NOT instantiated per-call**

The `LLMMatchingService` holds an Anthropic SDK client that manages connection pooling. Creating one per `matchEvent()` call (8000+/month) is wasteful. Instead, pass an optional `llmService` instance via `MatchingConfig`:

```typescript
// In types.ts, add to MatchingConfig:
export interface MatchingConfig {
  // ... existing fields
  llm?: LLMMatchingConfig
  llmService?: LLMMatchingService  // Pre-created instance, reused across calls
}
```

Callers create the service once and pass it. `matchEvent()` uses it if available.

- [ ] **Step 1: Add `llmService` to MatchingConfig in types.ts**

Add optional `llmService?: any` to `MatchingConfig` (use `any` to avoid circular import — the actual type is `LLMMatchingService` but agent-framework shouldn't import from itself).

- [ ] **Step 2: Write test for LLM event judge integration**

Add to `__tests__/event-matcher.test.ts`. Follow existing mock patterns for `sourceDb`:

```typescript
describe('matchEvent with LLM event judge', () => {
  it('calls LLM when score is in gray zone (0.30-0.95)', async () => {
    // Mock LLM service
    const mockLLMService = {
      judgeEventMatchWithLLM: jest.fn().mockResolvedValue({
        eventId: 123, confidence: 0.92, reason: 'same event'
      })
    }
    // Pass via config.llmService
    // Verify: FUZZY_MATCH with LLM confidence
  })

  it('does not call LLM for exact matches (>=0.95)', async () => { /* ... */ })
  it('does not call LLM for clear non-matches (<0.30)', async () => { /* ... */ })

  it('falls back to fuse.js when LLM fails', async () => {
    const mockLLMService = {
      judgeEventMatchWithLLM: jest.fn().mockResolvedValue(null)
    }
    // Verify: uses original fuse.js decision
  })

  it('supports shadow mode for event judge', async () => {
    const mockLLMService = {
      judgeEventMatchWithLLM: jest.fn().mockResolvedValue({
        eventId: 123, confidence: 0.92, reason: 'test'
      })
    }
    const onShadowResult = jest.fn()
    // Pass config.llm.shadowMode = true + config.onShadowResult
    // Verify: fuse.js result returned (not LLM), onShadowResult called
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/agent-framework && npx jest --testPathPatterns="event-matcher.test" --no-coverage`
Expected: FAIL

- [ ] **Step 4: Modify matchEvent() to use LLM in gray zone**

In `event-matcher.ts`, after the `< 0.3` check (line ~288) and before match type decision (line ~295):

```typescript
    // 9.5 NEW: LLM Event Judge for gray zone (0.30-0.95)
    if (best.combined < 0.95 && config.llmService) {
      const llmCandidates = scoredCandidates.slice(0, config.llm?.maxCandidates ?? 5).map(c => {
        const candidateEdition = c.event.editions?.find((e: any) => e.year === searchYear)
        return {
          eventId: c.event.id,
          eventName: c.event.name,
          eventCity: c.event.city,
          department: c.event.department,
          editionYear: candidateEdition?.year,
          editionDate: candidateEdition?.startDate?.toISOString?.() ?? candidateEdition?.startDate,
          score: c.combined,
        }
      })

      const llmResult = await config.llmService.judgeEventMatchWithLLM(
        input.eventName, input.eventCity, input.eventDepartment,
        input.editionDate.toISOString(), llmCandidates
      )

      if (config.llm?.shadowMode) {
        // Shadow mode: log comparison, use fuse.js result
        if (llmResult) {
          const fuse_decision = best.combined >= config.similarityThreshold ? 'FUZZY_MATCH' : 'NO_MATCH'
          const llm_decision = llmResult.eventId ? 'FUZZY_MATCH' : 'NO_MATCH'
          logger.info(`  🤖 Shadow mode event judge: fuse=${fuse_decision}, llm=${llm_decision}`)
          config.onShadowResult?.({
            matchType: 'event', inputSummary: `${input.eventName} (${input.eventCity})`,
            currentResult: { type: fuse_decision, bestScore: best.combined, bestEventId: best.event.id },
            llmResult, diverged: fuse_decision !== llm_decision, responseTimeMs: 0,
          })
        }
        // Fall through to existing logic
      } else if (llmResult) {
        if (llmResult.eventId) {
          const matchedCandidate = scoredCandidates.find(c => c.event.id === llmResult.eventId)
          if (matchedCandidate) {
            const edition = matchedCandidate.event.editions?.find((e: any) => e.year === searchYear)
            logger.info(`  🤖 LLM confirmed match: "${matchedCandidate.event.name}" (confidence: ${llmResult.confidence})`)
            return {
              type: 'FUZZY_MATCH',
              event: { id: matchedCandidate.event.id, name: matchedCandidate.event.name, city: matchedCandidate.event.city, slug: matchedCandidate.event.slug, similarity: llmResult.confidence },
              edition: edition ? { id: edition.id, year: edition.year, startDate: edition.startDate } : undefined,
              confidence: llmResult.confidence,
              rejectedMatches: scoredCandidates.slice(0, 3).map(c => {
                const ce = c.event.editions?.find((e: any) => e.year === searchYear)
                return { eventId: c.event.id, eventName: c.event.name, eventSlug: c.event.slug, eventCity: c.event.city, eventDepartment: c.event.department, editionId: ce?.id, editionYear: searchYear, matchScore: c.combined, nameScore: c.nameScore, cityScore: c.cityScore, departmentMatch: c.departmentMatch, dateProximity: c.dateProximity }
              })
            }
          }
        } else {
          logger.info(`  🤖 LLM says NO_MATCH: ${llmResult.reason}`)
          return { type: 'NO_MATCH', confidence: 0 }
        }
      }
      // LLM failed → fall through to existing logic
    }

    // 10. Find matching edition (existing code, unchanged)
```

- [ ] **Step 5: Run all event-matcher tests**

Run: `cd packages/agent-framework && npx jest --testPathPatterns="event-matcher" --no-coverage`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/agent-framework/src/services/event-matching/event-matcher.ts packages/agent-framework/src/services/event-matching/__tests__/event-matcher.test.ts packages/agent-framework/src/services/event-matching/types.ts
git commit -m "feat(matching): integrate LLM event judge for gray zone with shadow mode support"
```

---

## Task 7: Add LLM settings to database and API

**Files:**
- Modify: `packages/database/prisma/schema.prisma:153-169`
- Modify: `apps/api/src/config/settings.ts`

- [ ] **Step 1: Add LLM fields to Settings model in Prisma schema**

Add after `enableAutoApplyUpdates` (line 166):

```prisma
  llmMatchingApiKey        String?
  llmMatchingModel         String?   @default("claude-haiku-4-5-20251001")
  enableLlmMatching        Boolean   @default(false)
  llmMatchingShadowMode    Boolean   @default(true)
```

- [ ] **Step 2: Create and apply migration**

Run:
```bash
cd packages/database && npx prisma migrate dev --name add-llm-matching-settings
```
Expected: Migration created and applied.

- [ ] **Step 3: Regenerate Prisma client**

Run: `npm run db:generate`

- [ ] **Step 4: Update settings.ts — add LLM fields to SystemSettings interface**

Add to `SystemSettings` interface:

```typescript
  /** Clé API pour le matching LLM */
  llmMatchingApiKey: string | null
  /** Modèle LLM à utiliser */
  llmMatchingModel: string | null
  /** Activer le matching LLM */
  enableLlmMatching: boolean
  /** Mode shadow : log seulement, pas de décision */
  llmMatchingShadowMode: boolean
```

- [ ] **Step 5: Update defaultSettings**

Add:
```typescript
  llmMatchingApiKey: null,
  llmMatchingModel: null,
  enableLlmMatching: false,
  llmMatchingShadowMode: true,
```

- [ ] **Step 6: Update all getSettings() mappings to include new fields**

In `initSettings()`, `getSettings()`, and the `create` fallback, add the 4 new field mappings.

- [ ] **Step 7: Add convenience getters**

```typescript
  async getLLMMatchingConfig(): Promise<LLMMatchingConfig | undefined> {
    const settings = await this.getSettings()
    if (!settings.llmMatchingApiKey || !settings.enableLlmMatching) return undefined
    return {
      apiKey: settings.llmMatchingApiKey,
      model: settings.llmMatchingModel ?? 'claude-haiku-4-5-20251001',
      enabled: settings.enableLlmMatching,
      shadowMode: settings.llmMatchingShadowMode,
    }
  }
```

Import `LLMMatchingConfig` from `@data-agents/agent-framework` (or define inline to avoid circular import — check if agent-framework is a dependency of the API).

- [ ] **Step 8: Add validation in updateSetting()**

```typescript
      case 'llmMatchingApiKey':
        if (value !== null && typeof value !== 'string') {
          throw new Error('llmMatchingApiKey must be a string or null')
        }
        break
      case 'llmMatchingModel':
        if (value !== null && typeof value !== 'string') {
          throw new Error('llmMatchingModel must be a string or null')
        }
        break
      case 'enableLlmMatching':
      case 'llmMatchingShadowMode':
        if (typeof value !== 'boolean') {
          throw new Error(`${key} must be a boolean`)
        }
        break
```

- [ ] **Step 9: Verify build**

Run: `npm run build`
Expected: Build passes.

- [ ] **Step 10: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/ apps/api/src/config/settings.ts
git commit -m "feat(settings): add LLM matching configuration (apiKey, model, enabled, shadowMode)"
```

---

## Task 8: Wire LLM config through callers

**Files:**
- Modify: `apps/agents/src/ffa/matcher.ts`
- Modify: `apps/api/src/services/slack/SlackProposalService.ts`
- Modify: `apps/api/src/routes/proposals.ts` (check-existing-event endpoint)

**⚠️ NOTE on FFA race matching:** `matchCompetition()` in `apps/agents/src/ffa/matcher.ts` only calls `matchEvent()` — it does NOT call `matchRaces()`. Race matching for FFA happens via `matchRacesByDistanceAndName()` which is called from wherever FFA proposals are built (in `FFAScraperAgent.ts` or proposal construction logic). Since `matchRacesByDistanceAndName()` was already made async in Task 5 and delegates to `matchRaces()`, it will automatically benefit from LLM when an `llmContext` is passed.

- [ ] **Step 1: Update FFA matcher to pass LLM config to matchEvent()**

In `apps/agents/src/ffa/matcher.ts`, in `matchCompetition()`, create the LLM service once and pass it:

```typescript
import { LLMMatchingService } from '@data-agents/agent-framework'

// At the top of matchCompetition():
const llmConfig = process.env.LLM_MATCHING_API_KEY ? {
  apiKey: process.env.LLM_MATCHING_API_KEY,
  model: process.env.LLM_MATCHING_MODEL,
  enabled: process.env.LLM_MATCHING_ENABLED !== 'false',
  shadowMode: process.env.LLM_MATCHING_SHADOW_MODE === 'true',
} : undefined

const llmService = llmConfig ? new LLMMatchingService(llmConfig, logger) : undefined

// Pass to matchEvent():
const result = await matchEvent(input, sourceDb, {
  ...config,
  llm: llmConfig,
  llmService,
}, logger)
```

Also update `matchRacesByDistanceAndName()` calls in the FFA codebase to pass `llmContext` when available.

- [ ] **Step 2: Update Slack agent to pass LLM config**

In `SlackProposalService.ts`, before calling `matchEvent()`:

```typescript
const llmConfig = await settingsService.getLLMMatchingConfig()
```

Pass `llm: llmConfig` in the config to `matchEvent()`.

For `matchRaces()` calls, create service and pass `llmContext`.

- [ ] **Step 3: Update check-existing-event endpoint**

In `apps/api/src/routes/proposals.ts`, the `check-existing-event` endpoint calls `matchEvent()`. Add:

```typescript
const llmConfig = await settingsService.getLLMMatchingConfig()
// Pass llm: llmConfig in config
```

- [ ] **Step 4: Export LLMMatchingService from agent-framework index**

Update `packages/agent-framework/src/services/event-matching/index.ts` to export:

```typescript
export { LLMMatchingService, EventJudgeResult } from './llm-matching.service'
export { EventJudgeCandidate } from './llm-prompts'
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build passes.

- [ ] **Step 6: Run all tests**

Run: `npm run test:run`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/agents/src/ffa/matcher.ts apps/api/src/services/slack/SlackProposalService.ts apps/api/src/routes/proposals.ts packages/agent-framework/src/services/event-matching/index.ts
git commit -m "feat(matching): wire LLM config through FFA, Slack, and check-existing-event"
```

---

## Task 9: Add shadow mode logging table

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create migration

- [ ] **Step 1: Add LlmMatchingLog model to Prisma schema**

```prisma
model LlmMatchingLog {
  id              String   @id @default(cuid())
  matchType       String   // 'race' or 'event'
  proposalId      String?  // nullable — proposal may not exist yet at matching time
  inputSummary    String   // event name + city for context
  currentResult   Json     // result from fuse.js/distance matching
  llmResult       Json     // result from LLM
  diverged        Boolean  // whether the two results differ
  responseTimeMs  Int      // LLM response time
  createdAt       DateTime @default(now())

  @@map("llm_matching_logs")
  @@index([matchType, createdAt])
  @@index([diverged, createdAt])
  @@index([proposalId])
}
```

- [ ] **Step 2: Create and apply migration**

Run: `cd packages/database && npx prisma migrate dev --name add-llm-matching-logs`

- [ ] **Step 3: Regenerate Prisma client**

Run: `npm run db:generate`

- [ ] **Step 4: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat(database): add llm_matching_logs table for shadow mode analysis"
```

---

## Task 10: Implement shadow mode in matchRaces()

**Files:**
- Modify: `packages/agent-framework/src/services/event-matching/event-matcher.ts`

- [ ] **Step 1: Add shadow mode logic in matchRaces()**

When `llmContext?.llmService` is available and shadow mode is on, run both matchings and log comparison:

```typescript
  // In matchRaces(), at the top:
  if (llmContext?.llmService && llmContext.eventName) {
    const llmResult = await llmContext.llmService.matchRacesWithLLM(...)

    if (llmContext.shadowMode) {
      // Run distance-based matching as well
      const distanceResult = distanceBasedMatchRaces(inputRaces, dbRaces, logger, tolerancePercent)
      // Log comparison (fire-and-forget)
      if (llmResult) {
        llmContext.onShadowResult?.({
          matchType: 'race',
          inputSummary: `${llmContext.eventName} (${llmContext.eventCity})`,
          currentResult: distanceResult,
          llmResult,
          diverged: hasDivergence(distanceResult, llmResult),
          responseTimeMs: elapsed,
        })
      }
      return distanceResult  // Shadow mode: use current result
    }

    if (llmResult) return llmResult
  }
```

This requires extracting the current distance-based matching logic into a helper function `distanceBasedMatchRaces()` to call it separately during shadow mode. The existing code body moves into this helper, and `matchRaces()` becomes the orchestrator.

- [ ] **Step 2: Add `shadowMode` and `onShadowResult` to RaceMatchLLMContext**

```typescript
export interface RaceMatchLLMContext {
  llmService?: LLMMatchingService
  eventName?: string
  editionYear?: number
  eventCity?: string
  shadowMode?: boolean
  onShadowResult?: (log: ShadowLogEntry) => void
}

export interface ShadowLogEntry {
  matchType: 'race' | 'event'
  inputSummary: string
  currentResult: any
  llmResult: any
  diverged: boolean
  responseTimeMs: number
}
```

- [ ] **Step 3: Wire shadow logging callback in callers**

In the FFA matcher and Slack agent, when shadow mode is on, pass a callback that writes to the `llm_matching_logs` table:

```typescript
onShadowResult: async (log) => {
  try {
    await db.prisma.llmMatchingLog.create({ data: log })
  } catch (e) {
    logger.warn(`Failed to log shadow result: ${e}`)
  }
}
```

- [ ] **Step 4: Run all tests**

Run: `npm run test:run`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-framework/src/services/event-matching/event-matcher.ts apps/agents/src/ffa/matcher.ts apps/api/src/services/slack/SlackProposalService.ts
git commit -m "feat(matching): implement shadow mode for race matching with DB logging"
```

---

## Task 11: Final verification and type check

**Files:** All modified files.

- [ ] **Step 1: Run TypeScript type check**

Run: `npm run tsc`
Expected: No errors.

- [ ] **Step 2: Run full test suite**

Run: `npm run test:run`
Expected: All tests pass.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build passes.

- [ ] **Step 4: Final commit if any loose changes**

```bash
git status
# If any uncommitted changes, add and commit
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Types + config interfaces | types.ts, index.ts |
| 2 | Install Anthropic SDK | package.json |
| 3 | Prompt templates + tool schemas | llm-prompts.ts + tests |
| 4 | LLMMatchingService | llm-matching.service.ts + tests |
| 5 | Integrate LLM into matchRaces() | event-matcher.ts + tests |
| 6 | Integrate LLM into matchEvent() gray zone | event-matcher.ts + tests |
| 7 | DB settings + API config | schema.prisma, settings.ts |
| 8 | Wire config through callers | matcher.ts, SlackProposalService.ts |
| 9 | Shadow mode logging table | schema.prisma + migration |
| 10 | Shadow mode implementation | event-matcher.ts + callers |
| 11 | Final verification | All |
