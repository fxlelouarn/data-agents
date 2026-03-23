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
