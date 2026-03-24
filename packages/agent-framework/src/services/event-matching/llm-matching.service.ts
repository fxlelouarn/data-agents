/**
 * LLMMatchingService
 *
 * Wraps Anthropic API calls for:
 * - matchRacesWithLLM: match proposed races against existing DB races
 * - judgeEventMatchWithLLM: judge whether a candidate event matches an input event
 *
 * Features:
 * - 10s timeout on all API calls
 * - Graceful error handling (returns null on failure)
 * - Deduplication of matched DB races (first match wins)
 * - Safe default: unmentioned input races are treated as unmatched
 */

import Anthropic from '@anthropic-ai/sdk'
import {
  LLMMatchingConfig,
  MatchingLogger,
  DbRace,
  RaceMatchInput,
  RaceMatchResult,
} from './types'
import {
  buildRaceMatchingPrompt,
  buildEventJudgePrompt,
  raceMatchingTool,
  eventJudgeTool,
  EventJudgeCandidate,
} from './llm-prompts'

/** Result of judging an event match with LLM */
export interface EventJudgeResult {
  eventId: number | null
  confidence: number
  reason: string
}

/** Timeout in milliseconds for LLM API calls */
const LLM_TIMEOUT_MS = 10_000

/** Maximum total number of races (db + input) before skipping LLM */
const MAX_RACES_TOTAL = 40

/** Default model if not specified */
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

export class LLMMatchingService {
  private client: Anthropic | null
  private config: LLMMatchingConfig
  private logger: MatchingLogger

  constructor(config: LLMMatchingConfig, logger: MatchingLogger) {
    this.config = config
    this.logger = logger

    if (config.enabled !== false && config.apiKey) {
      this.client = new Anthropic({ apiKey: config.apiKey })
    } else {
      this.client = null
    }
  }

  /**
   * Match proposed input races against existing DB races using LLM.
   *
   * Returns null if:
   * - LLM is disabled / no client
   * - Total races exceeds MAX_RACES_TOTAL
   * - API call fails
   */
  async matchRacesWithLLM(
    eventName: string,
    editionYear: number,
    eventCity: string,
    dbRaces: DbRace[],
    inputRaces: RaceMatchInput[]
  ): Promise<RaceMatchResult | null> {
    if (!this.client) {
      return null
    }

    const total = dbRaces.length + inputRaces.length
    if (total > MAX_RACES_TOTAL) {
      this.logger.info(
        `LLM race matching skipped: total races (${total}) exceeds MAX_RACES_TOTAL (${MAX_RACES_TOTAL})`
      )
      return null
    }

    try {
      const prompt = buildRaceMatchingPrompt(eventName, editionYear, eventCity, dbRaces, inputRaces)
      const model = this.config.model ?? DEFAULT_MODEL

      const response = await Promise.race([
        this.client.messages.create({
          model,
          max_tokens: 1024,
          tools: [raceMatchingTool],
          tool_choice: { type: 'tool', name: 'race_matching_result' },
          messages: [{ role: 'user', content: prompt }],
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LLM timeout')), LLM_TIMEOUT_MS)
        ),
      ])

      // Extract the tool_use content block
      const toolBlock = (response as Anthropic.Message).content.find(
        (block) => block.type === 'tool_use'
      ) as Anthropic.ToolUseBlock | undefined

      if (!toolBlock) {
        this.logger.warn('LLM race matching: no tool_use block in response')
        return null
      }

      const llmResult = toolBlock.input as {
        matches: Array<{ proposedIndex: string; existingRaceId: number; confidence: number; reason: string }>
        newRaces: Array<{ proposedIndex: string; reason: string }>
      }

      return this.convertRaceResult(llmResult, inputRaces, dbRaces)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.warn(`LLM race matching failed: ${message}`)
      return null
    }
  }

  /**
   * Judge whether any candidate event matches the input event using LLM.
   *
   * Returns null if:
   * - LLM is disabled / no client
   * - API call fails
   * - LLM returns an eventId not in the candidates list (hallucination guard)
   */
  async judgeEventMatchWithLLM(
    inputName: string,
    inputCity: string,
    inputDepartment: string | undefined,
    inputDate: string | undefined,
    candidates: EventJudgeCandidate[],
    inputOrganizer?: string
  ): Promise<EventJudgeResult | null> {
    if (!this.client) {
      return null
    }

    try {
      const slicedCandidates = candidates.slice(0, this.config.maxCandidates ?? 5)
      const prompt = buildEventJudgePrompt(inputName, inputCity, inputDepartment, inputDate, slicedCandidates, inputOrganizer)
      const model = this.config.model ?? DEFAULT_MODEL

      const response = await Promise.race([
        this.client.messages.create({
          model,
          max_tokens: 512,
          tools: [eventJudgeTool],
          tool_choice: { type: 'tool', name: 'event_judge_result' },
          messages: [{ role: 'user', content: prompt }],
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LLM timeout')), LLM_TIMEOUT_MS)
        ),
      ])

      // Extract the tool_use content block
      const toolBlock = (response as Anthropic.Message).content.find(
        (block) => block.type === 'tool_use'
      ) as Anthropic.ToolUseBlock | undefined

      if (!toolBlock) {
        this.logger.warn('LLM event judge: no tool_use block in response')
        return null
      }

      const llmResult = toolBlock.input as {
        found: boolean
        eventId?: number
        confidence?: number
        reason: string
      }

      // No match case — preserve LLM confidence (how sure it is this is a NEW event)
      if (llmResult.found === false || llmResult.eventId == null) {
        return {
          eventId: null,
          confidence: llmResult.confidence ?? 0,
          reason: llmResult.reason,
        }
      }

      // Hallucination guard: verify eventId is in the candidates list
      const knownIds = slicedCandidates.map((c) => c.eventId)
      if (!knownIds.includes(llmResult.eventId)) {
        this.logger.warn(
          `LLM event judge returned unknown eventId ${llmResult.eventId} (not in candidates)`
        )
        return null
      }

      return {
        eventId: llmResult.eventId,
        confidence: llmResult.confidence ?? 0,
        reason: llmResult.reason,
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.warn(`LLM event judge failed: ${message}`)
      return null
    }
  }

  /**
   * Convert raw LLM race matching result into a RaceMatchResult.
   *
   * Rules:
   * - Convert letter index (A=0, B=1, …) to array index
   * - Look up dbRace by existingRaceId
   * - Deduplicate: if same DB race matched twice, second is treated as unmatched
   * - If raceId not found in dbRaces → treat as unmatched (log warn)
   * - newRaces from LLM → unmatched
   * - Any input race not mentioned by LLM → unmatched (safe default)
   */
  private convertRaceResult(
    llmResult: {
      matches: Array<{ proposedIndex: string; existingRaceId: number; confidence: number; reason: string }>
      newRaces: Array<{ proposedIndex: string; reason: string }>
    },
    inputRaces: RaceMatchInput[],
    dbRaces: DbRace[]
  ): RaceMatchResult {
    const matched: Array<{ input: RaceMatchInput; db: DbRace }> = []
    const unmatchedSet = new Set<RaceMatchInput>(inputRaces) // start with all unmatched
    const usedDbIds = new Set<number>()

    for (const match of llmResult.matches) {
      const inputIndex = match.proposedIndex.charCodeAt(0) - 65 // A→0, B→1, …
      const inputRace = inputRaces[inputIndex]

      if (!inputRace) {
        // Proposed index out of range — skip silently
        continue
      }

      const dbRaceId = Number(match.existingRaceId)
      const dbRace = dbRaces.find((r) => Number(r.id) === dbRaceId)

      if (!dbRace) {
        this.logger.warn(
          `LLM race matching: existingRaceId ${match.existingRaceId} not found in dbRaces`
        )
        // Treat as unmatched — inputRace stays in unmatchedSet
        continue
      }

      // Deduplication: if same DB race already matched, treat this input as unmatched
      if (usedDbIds.has(dbRaceId)) {
        // inputRace stays in unmatchedSet
        continue
      }

      usedDbIds.add(dbRaceId)
      unmatchedSet.delete(inputRace)
      matched.push({ input: inputRace, db: dbRace })
    }

    // newRaces from LLM are already unmatched (they stay in unmatchedSet)
    // Any input race not mentioned also stays unmatched

    return {
      matched,
      unmatched: Array.from(unmatchedSet),
    }
  }
}
