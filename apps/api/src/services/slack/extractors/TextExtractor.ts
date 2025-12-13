/**
 * Text Extractor
 *
 * Extracts event information from plain text messages.
 * Handles:
 * - Copy-pasted event descriptions
 * - Informal text with event details
 * - Structured text (lists, etc.)
 */

import Anthropic from '@anthropic-ai/sdk'
import {
  ExtractionResult,
  ExtractedEventData,
  EXTRACTION_PROMPT_SYSTEM,
  buildExtractionPrompt
} from './types'
import { ApiCreditError, ApiRateLimitError } from './HtmlExtractor'

const MIN_TEXT_LENGTH = 30 // Minimum text length to attempt extraction
const MAX_TEXT_LENGTH = 50000 // Max text to send to Claude

export class TextExtractor {
  private anthropic: Anthropic | null = null

  constructor() {
    this.initializeAnthropicClient()
  }

  private initializeAnthropicClient() {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.warn('⚠️ ANTHROPIC_API_KEY not set - TextExtractor will not work')
      return
    }
    this.anthropic = new Anthropic({ apiKey })
  }

  /**
   * Extract event data from plain text
   */
  async extract(text: string): Promise<ExtractionResult> {
    console.log(`📝 Extracting event data from text (${text.length} chars)`)

    if (!this.anthropic) {
      return {
        success: false,
        error: 'Service d\'extraction non configuré (clé API manquante)',
        errorType: 'extraction_failed'
      }
    }

    // Validate text length
    if (text.length < MIN_TEXT_LENGTH) {
      return {
        success: false,
        error: `Texte trop court (minimum ${MIN_TEXT_LENGTH} caractères)`,
        errorType: 'extraction_failed'
      }
    }

    // Truncate if too long
    const truncatedText = text.length > MAX_TEXT_LENGTH
      ? text.substring(0, MAX_TEXT_LENGTH) + '\n[... texte tronqué]'
      : text

    try {
      const extractedData = await this.extractWithClaude(truncatedText)

      if (!extractedData) {
        return {
          success: false,
          error: 'Impossible d\'extraire les informations du texte',
          errorType: 'extraction_failed',
          rawContent: truncatedText.substring(0, 1000)
        }
      }

      return {
        success: true,
        data: {
          ...extractedData,
          extractionMethod: 'text',
          rawExtractedText: truncatedText.substring(0, 1000)
        },
        rawContent: truncatedText.substring(0, 1000)
      }

    } catch (error: any) {
      console.error('TextExtractor error:', error)

      if (error instanceof ApiCreditError || error instanceof ApiRateLimitError) {
        throw error
      }

      return {
        success: false,
        error: error.message || 'Erreur lors de l\'extraction',
        errorType: 'extraction_failed'
      }
    }
  }

  /**
   * Use Claude to extract event data from text
   */
  private async extractWithClaude(text: string): Promise<ExtractedEventData | null> {
    if (!this.anthropic) {
      return null
    }

    try {
      console.log('🤖 Sending text to Claude Haiku for extraction...')

      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 2048,
        temperature: 0, // Déterministe pour des résultats cohérents
        messages: [
          {
            role: 'user',
            content: buildExtractionPrompt(text, 'text')
          }
        ],
        system: EXTRACTION_PROMPT_SYSTEM
      })

      const textBlock = response.content.find(block => block.type === 'text')
      if (!textBlock || textBlock.type !== 'text') {
        console.error('No text response from Claude')
        return null
      }

      return this.parseExtractionResponse(textBlock.text.trim())

    } catch (error: any) {
      console.error('Claude API error:', error.message)

      if (this.isApiCreditError(error)) {
        throw new ApiCreditError('Crédits API Anthropic insuffisants')
      }

      if (error.status === 429) {
        throw new ApiRateLimitError('Limite de requêtes API atteinte')
      }

      // Try Sonnet as fallback
      return this.extractWithClaudeSonnet(text)
    }
  }

  /**
   * Fallback to Claude Sonnet for complex text
   */
  private async extractWithClaudeSonnet(text: string): Promise<ExtractedEventData | null> {
    if (!this.anthropic) return null

    try {
      console.log('🤖 Fallback to Claude Sonnet...')

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        temperature: 0, // Déterministe pour des résultats cohérents
        messages: [
          {
            role: 'user',
            content: buildExtractionPrompt(text, 'text')
          }
        ],
        system: EXTRACTION_PROMPT_SYSTEM
      })

      const textBlock = response.content.find(block => block.type === 'text')
      if (!textBlock || textBlock.type !== 'text') return null

      return this.parseExtractionResponse(textBlock.text.trim())

    } catch (error: any) {
      console.error('Sonnet fallback failed:', error.message)

      if (this.isApiCreditError(error)) {
        throw new ApiCreditError('Crédits API Anthropic insuffisants')
      }
      if (error.status === 429) {
        throw new ApiRateLimitError('Limite de requêtes API atteinte')
      }

      return null
    }
  }

  /**
   * Parse extraction response from Claude
   */
  private parseExtractionResponse(responseText: string): ExtractedEventData | null {
    try {
      // Handle potential markdown code blocks
      let jsonStr = responseText
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim()
      }

      const parsed = JSON.parse(jsonStr)

      // Validate required fields
      if (!parsed.eventName) {
        console.warn('Extracted data missing eventName')
        return null
      }

      // Warn if no date found
      if (!parsed.editionDate && !parsed.editionYear) {
        console.warn('⚠️ No date found in text - confidence should be low')
      }

      console.log(`✅ Successfully extracted from text: ${parsed.eventName}`)

      return {
        eventName: parsed.eventName,
        eventCity: parsed.eventCity,
        eventDepartment: parsed.eventDepartment,
        eventCountry: 'France',
        editionYear: parsed.editionYear,
        editionDate: parsed.editionDate,
        editionEndDate: parsed.editionEndDate,
        races: parsed.races,
        organizerName: parsed.organizerName,
        organizerEmail: parsed.organizerEmail,
        organizerPhone: parsed.organizerPhone,
        organizerWebsite: parsed.organizerWebsite,
        registrationUrl: parsed.registrationUrl,
        confidence: parsed.confidence || 0.5,
        extractionMethod: 'text',
        rawExtractedText: undefined
      }

    } catch (parseError) {
      console.error('Failed to parse Claude response:', parseError)
      console.log('Raw response:', responseText.substring(0, 500))
      return null
    }
  }

  /**
   * Check if error is related to API credits/billing
   */
  private isApiCreditError(error: any): boolean {
    if (error.status === 400) {
      const message = error.message || ''
      return message.includes('credit balance') ||
             message.includes('billing') ||
             message.includes('purchase credits')
    }
    return false
  }
}

// Singleton instance
export const textExtractor = new TextExtractor()
