/**
 * Tests pour LLMMatchingService
 *
 * Cas testés :
 * matchRacesWithLLM :
 *   1. Returns matched/unmatched from valid LLM response (2 matches + 1 new race)
 *   2. Returns null on API error
 *   3. Returns null for invalid race ID (but does not crash — treats as unmatched)
 *   4. Does not call API when enabled: false
 *   5. Returns null when total races > 40
 *   6. Handles duplicate match targets (dedup — first wins, second is unmatched)
 *
 * judgeEventMatchWithLLM :
 *   1. Returns match result from valid LLM response (found: true)
 *   2. Returns { eventId: null, confidence: 0 } when LLM says no match (found: false)
 *   3. Returns null on API error
 *   4. Returns null for unknown eventId not in candidates
 */

import { LLMMatchingService, EventJudgeResult } from '../llm-matching.service'
import { LLMMatchingConfig, MatchingLogger, DbRace, RaceMatchInput } from '../types'
import { EventJudgeCandidate } from '../llm-prompts'

// Mock the Anthropic SDK
const mockCreate = jest.fn()
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate }
  }))
})

// Helper logger that does nothing
const silentLogger: MatchingLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

// Helper to build a fake Anthropic tool_use response
function makeLLMResponse(toolName: string, toolInput: unknown) {
  return {
    content: [
      {
        type: 'tool_use',
        name: toolName,
        input: toolInput,
      }
    ]
  }
}

const baseConfig: LLMMatchingConfig = {
  apiKey: 'test-api-key',
  model: 'claude-haiku-test',
  enabled: true,
  maxCandidates: 5,
}

// Sample DB races
const dbRaces: DbRace[] = [
  { id: 101, name: 'Trail 50km', runDistance: 50, runPositiveElevation: 2000 },
  { id: 102, name: 'Trail 25km', runDistance: 25 },
  { id: 103, name: 'Randonnée 12km', walkDistance: 12 },
]

// Sample input races
const inputRaces: RaceMatchInput[] = [
  { name: 'Le Grand Trail', distance: 50, categoryLevel1: 'TRAIL', categoryLevel2: 'LONG_TRAIL' },
  { name: 'Le Petit Trail', distance: 25 },
  { name: 'Nouvelle Course', distance: 10 },
]

// Sample event judge candidates
const candidates: EventJudgeCandidate[] = [
  {
    eventId: 2642,
    eventName: "Marathon du lac d'Annecy",
    eventCity: 'Annecy',
    department: '74',
    editionYear: 2026,
    score: 0.85,
  },
  {
    eventId: 5517,
    eventName: 'Trail des Crêtes',
    eventCity: 'Lyon',
    department: '69',
    score: 0.62,
  },
]

beforeEach(() => {
  jest.clearAllMocks()
})

// ─────────────────────────────────────────────
// matchRacesWithLLM tests
// ─────────────────────────────────────────────

describe('matchRacesWithLLM', () => {
  it('returns matched/unmatched from valid LLM response (2 matches + 1 new race)', async () => {
    const llmResult = {
      matches: [
        { proposedIndex: 'A', existingRaceId: 101, confidence: 0.95, reason: 'Same distance and name' },
        { proposedIndex: 'B', existingRaceId: 102, confidence: 0.88, reason: 'Similar name and distance' },
      ],
      newRaces: [
        { proposedIndex: 'C', reason: 'No matching existing race found' },
      ],
    }
    mockCreate.mockResolvedValueOnce(makeLLMResponse('race_matching_result', llmResult))

    const service = new LLMMatchingService(baseConfig, silentLogger)
    const result = await service.matchRacesWithLLM(
      'Trail Event',
      2026,
      'Lyon',
      dbRaces,
      inputRaces
    )

    expect(result).not.toBeNull()
    expect(result!.matched).toHaveLength(2)
    expect(result!.unmatched).toHaveLength(1)

    // Check that matched pairs reference the correct objects
    expect(result!.matched[0].input).toBe(inputRaces[0]) // A → index 0
    expect(result!.matched[0].db.id).toBe(101)
    expect(result!.matched[1].input).toBe(inputRaces[1]) // B → index 1
    expect(result!.matched[1].db.id).toBe(102)

    // Unmatched should be the 'C' race (index 2)
    expect(result!.unmatched[0]).toBe(inputRaces[2])
  })

  it('returns null on API error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API unavailable'))

    const service = new LLMMatchingService(baseConfig, silentLogger)
    const result = await service.matchRacesWithLLM(
      'Trail Event',
      2026,
      'Lyon',
      dbRaces,
      inputRaces
    )

    expect(result).toBeNull()
    expect(silentLogger.warn).toHaveBeenCalled()
  })

  it('returns null for invalid race ID — treats as unmatched, does not crash', async () => {
    const llmResult = {
      matches: [
        { proposedIndex: 'A', existingRaceId: 9999, confidence: 0.9, reason: 'Match' }, // 9999 does not exist
      ],
      newRaces: [],
    }
    mockCreate.mockResolvedValueOnce(makeLLMResponse('race_matching_result', llmResult))

    const service = new LLMMatchingService(baseConfig, silentLogger)
    const result = await service.matchRacesWithLLM(
      'Trail Event',
      2026,
      'Lyon',
      dbRaces,
      inputRaces
    )

    // Should not crash; race A treated as unmatched
    expect(result).not.toBeNull()
    expect(result!.matched).toHaveLength(0)
    // All 3 input races are unmatched (A because invalid ID, B and C not mentioned)
    expect(result!.unmatched).toHaveLength(3)
    expect(silentLogger.warn).toHaveBeenCalled()
  })

  it('does not call API when enabled: false', async () => {
    const disabledConfig: LLMMatchingConfig = { ...baseConfig, enabled: false }
    const service = new LLMMatchingService(disabledConfig, silentLogger)

    const result = await service.matchRacesWithLLM(
      'Trail Event',
      2026,
      'Lyon',
      dbRaces,
      inputRaces
    )

    expect(result).toBeNull()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('returns null when total races > 40', async () => {
    // Create 25 DB races and 20 input races → total 45 > 40
    const manyDbRaces: DbRace[] = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      name: `Race DB ${i + 1}`,
      runDistance: 10 + i,
    }))
    const manyInputRaces: RaceMatchInput[] = Array.from({ length: 20 }, (_, i) => ({
      name: `Input Race ${i + 1}`,
      distance: 10 + i,
    }))

    const service = new LLMMatchingService(baseConfig, silentLogger)
    const result = await service.matchRacesWithLLM(
      'Big Event',
      2026,
      'Paris',
      manyDbRaces,
      manyInputRaces
    )

    expect(result).toBeNull()
    expect(mockCreate).not.toHaveBeenCalled()
    expect(silentLogger.info).toHaveBeenCalled()
  })

  it('handles duplicate match targets — first wins, second is unmatched', async () => {
    // Both A and B claim to match race id 101 (same DB race)
    const llmResult = {
      matches: [
        { proposedIndex: 'A', existingRaceId: 101, confidence: 0.95, reason: 'Match A' },
        { proposedIndex: 'B', existingRaceId: 101, confidence: 0.80, reason: 'Match B (dup)' },
      ],
      newRaces: [],
    }
    mockCreate.mockResolvedValueOnce(makeLLMResponse('race_matching_result', llmResult))

    const service = new LLMMatchingService(baseConfig, silentLogger)
    const result = await service.matchRacesWithLLM(
      'Trail Event',
      2026,
      'Lyon',
      dbRaces,
      inputRaces
    )

    expect(result).not.toBeNull()
    // Only one match (A wins), B and C are unmatched
    expect(result!.matched).toHaveLength(1)
    expect(result!.matched[0].input).toBe(inputRaces[0])
    expect(result!.matched[0].db.id).toBe(101)

    // B (index 1) and C (index 2, not mentioned) are unmatched
    expect(result!.unmatched).toHaveLength(2)
    expect(result!.unmatched).toContain(inputRaces[1])
    expect(result!.unmatched).toContain(inputRaces[2])
  })
})

// ─────────────────────────────────────────────
// judgeEventMatchWithLLM tests
// ─────────────────────────────────────────────

describe('judgeEventMatchWithLLM', () => {
  it('returns match result from valid LLM response (found: true)', async () => {
    const llmResult = {
      found: true,
      eventId: 2642,
      confidence: 0.92,
      reason: 'Same event name and location',
    }
    mockCreate.mockResolvedValueOnce(makeLLMResponse('event_judge_result', llmResult))

    const service = new LLMMatchingService(baseConfig, silentLogger)
    const result = await service.judgeEventMatchWithLLM(
      'Brooks Marathon Annecy',
      'Annecy',
      '74',
      '2026-05-10',
      candidates
    )

    expect(result).not.toBeNull()
    expect(result!.eventId).toBe(2642)
    expect(result!.confidence).toBe(0.92)
    expect(result!.reason).toBe('Same event name and location')
  })

  it('returns { eventId: null, confidence: 0 } when LLM says no match (found: false)', async () => {
    const llmResult = {
      found: false,
      reason: 'No matching event found in candidates',
    }
    mockCreate.mockResolvedValueOnce(makeLLMResponse('event_judge_result', llmResult))

    const service = new LLMMatchingService(baseConfig, silentLogger)
    const result = await service.judgeEventMatchWithLLM(
      'Unknown Event',
      'Somewhere',
      undefined,
      undefined,
      candidates
    )

    expect(result).not.toBeNull()
    expect(result!.eventId).toBeNull()
    expect(result!.confidence).toBe(0)
    expect(result!.reason).toBe('No matching event found in candidates')
  })

  it('returns null on API error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Timeout'))

    const service = new LLMMatchingService(baseConfig, silentLogger)
    const result = await service.judgeEventMatchWithLLM(
      'Trail Event',
      'Lyon',
      '69',
      '2026-07-10',
      candidates
    )

    expect(result).toBeNull()
    expect(silentLogger.warn).toHaveBeenCalled()
  })

  it('returns null for unknown eventId not in candidates', async () => {
    const llmResult = {
      found: true,
      eventId: 9999, // not in candidates
      confidence: 0.85,
      reason: 'Hallucinated match',
    }
    mockCreate.mockResolvedValueOnce(makeLLMResponse('event_judge_result', llmResult))

    const service = new LLMMatchingService(baseConfig, silentLogger)
    const result = await service.judgeEventMatchWithLLM(
      'Trail Event',
      'Lyon',
      '69',
      '2026-07-10',
      candidates
    )

    expect(result).toBeNull()
    expect(silentLogger.warn).toHaveBeenCalled()
  })
})
