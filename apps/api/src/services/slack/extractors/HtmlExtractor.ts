/**
 * HTML Extractor
 *
 * Fetches HTML from URLs and extracts event information using:
 * 1. Cheerio for HTML parsing
 * 2. Claude Haiku for intelligent extraction
 */

import Anthropic from '@anthropic-ai/sdk'
import * as cheerio from 'cheerio'
import {
  ExtractionResult,
  ExtractedEventData,
  HtmlExtractionOptions,
  EXTRACTION_PROMPT_SYSTEM,
  EXTRACTION_PROMPT_USER
} from './types'

const DEFAULT_TIMEOUT = 30000 // 30 seconds
const MAX_CONTENT_LENGTH = 100000 // ~100KB of text to send to Claude

export class HtmlExtractor {
  private anthropic: Anthropic | null = null

  constructor() {
    this.initializeAnthropicClient()
  }

  private initializeAnthropicClient() {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.warn('⚠️ ANTHROPIC_API_KEY not set - HtmlExtractor will not work')
      return
    }
    this.anthropic = new Anthropic({ apiKey })
  }

  /**
   * Extract event data from a URL
   */
  async extract(options: HtmlExtractionOptions): Promise<ExtractionResult> {
    const { url, timeout = DEFAULT_TIMEOUT } = options

    console.log(`🌐 Fetching HTML from: ${url}`)

    try {
      // Step 1: Fetch HTML
      const html = await this.fetchHtml(url, timeout)
      if (!html) {
        return {
          success: false,
          error: 'Failed to fetch HTML content'
        }
      }

      // Step 2: Parse and extract text content
      const textContent = this.extractTextFromHtml(html, url)
      if (!textContent || textContent.length < 100) {
        return {
          success: false,
          error: 'Page content too short or empty',
          rawContent: textContent
        }
      }

      console.log(`📄 Extracted ${textContent.length} characters of text`)

      // Step 3: Send to Claude for extraction
      const extractedData = await this.extractWithClaude(textContent, url)
      if (!extractedData) {
        return {
          success: false,
          error: 'Failed to extract event data with Claude',
          rawContent: textContent.substring(0, 5000)
        }
      }

      return {
        success: true,
        data: {
          ...extractedData,
          sourceUrl: url,
          extractionMethod: 'html'
        },
        rawContent: textContent.substring(0, 2000)
      }

    } catch (error: any) {
      console.error('HtmlExtractor error:', error)
      return {
        success: false,
        error: error.message || 'Unknown extraction error'
      }
    }
  }

  /**
   * Fetch HTML from URL with timeout
   */
  private async fetchHtml(url: string, timeout: number): Promise<string | null> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DataAgentsBot/1.0; +https://milesrepublic.com)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
        }
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        console.error(`HTTP ${response.status} for ${url}`)
        return null
      }

      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        console.warn(`Non-HTML content type: ${contentType}`)
        // Still try to parse it
      }

      return await response.text()

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error(`Timeout fetching ${url}`)
      } else {
        console.error(`Fetch error for ${url}:`, error.message)
      }
      return null
    }
  }

  /**
   * Parse HTML and extract meaningful text content
   */
  private extractTextFromHtml(html: string, url: string): string {
    const $ = cheerio.load(html)

    // Remove unwanted elements
    $('script, style, nav, footer, header, aside, iframe, noscript').remove()
    $('[class*="cookie"], [class*="popup"], [class*="modal"], [class*="banner"]').remove()
    $('[id*="cookie"], [id*="popup"], [id*="modal"], [id*="banner"]').remove()

    // Try to find main content
    let mainContent = ''

    // Priority selectors for event pages
    const contentSelectors = [
      'main',
      'article',
      '[role="main"]',
      '.content',
      '.main-content',
      '#content',
      '#main',
      '.event-details',
      '.race-info',
      '.course-info'
    ]

    for (const selector of contentSelectors) {
      const element = $(selector)
      if (element.length > 0) {
        const text = element.text()
        if (text.length > mainContent.length) {
          mainContent = text
        }
      }
    }

    // If no main content found, use body
    if (mainContent.length < 200) {
      mainContent = $('body').text()
    }

    // Extract structured data if available (JSON-LD, microdata)
    const structuredData = this.extractStructuredData($)

    // Clean up text
    let cleanText = mainContent
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim()

    // Add page title and URL context
    const pageTitle = $('title').text().trim()
    const metaDescription = $('meta[name="description"]').attr('content') || ''

    let result = `URL: ${url}\n`
    if (pageTitle) result += `Titre: ${pageTitle}\n`
    if (metaDescription) result += `Description: ${metaDescription}\n`
    if (structuredData) result += `Données structurées: ${structuredData}\n`
    result += `\nContenu:\n${cleanText}`

    // Limit content length
    if (result.length > MAX_CONTENT_LENGTH) {
      result = result.substring(0, MAX_CONTENT_LENGTH) + '\n[... contenu tronqué]'
    }

    return result
  }

  /**
   * Try to extract JSON-LD structured data
   */
  private extractStructuredData($: cheerio.CheerioAPI): string | null {
    try {
      const jsonLdScripts = $('script[type="application/ld+json"]')
      const structuredData: any[] = []

      jsonLdScripts.each((_, el) => {
        try {
          const json = JSON.parse($(el).html() || '')
          // Look for Event type
          if (json['@type'] === 'Event' || json['@type'] === 'SportsEvent') {
            structuredData.push(json)
          }
        } catch {
          // Invalid JSON, ignore
        }
      })

      if (structuredData.length > 0) {
        return JSON.stringify(structuredData, null, 2)
      }
    } catch {
      // Ignore errors
    }
    return null
  }

  /**
   * Use Claude to extract event data from text content
   */
  private async extractWithClaude(content: string, url: string): Promise<ExtractedEventData | null> {
    if (!this.anthropic) {
      console.error('Anthropic client not initialized')
      return null
    }

    try {
      console.log('🤖 Sending to Claude Haiku for extraction...')

      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: EXTRACTION_PROMPT_USER(content)
          }
        ],
        system: EXTRACTION_PROMPT_SYSTEM
      })

      // Extract text from response
      const textBlock = response.content.find(block => block.type === 'text')
      if (!textBlock || textBlock.type !== 'text') {
        console.error('No text response from Claude')
        return null
      }

      const responseText = textBlock.text.trim()

      // Try to parse JSON from response
      let jsonStr = responseText

      // Handle potential markdown code blocks
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim()
      }

      try {
        const parsed = JSON.parse(jsonStr)

        // Validate required fields
        if (!parsed.eventName) {
          console.warn('Extracted data missing eventName')
          return null
        }

        console.log(`✅ Successfully extracted: ${parsed.eventName}`)

        return {
          eventName: parsed.eventName,
          eventCity: parsed.eventCity,
          eventDepartment: parsed.eventDepartment,
          eventCountry: 'France', // Default
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
          extractionMethod: 'html',
          rawExtractedText: content.substring(0, 1000)
        }

      } catch (parseError) {
        console.error('Failed to parse Claude response as JSON:', parseError)
        console.log('Raw response:', responseText.substring(0, 500))
        return null
      }

    } catch (error: any) {
      console.error('Claude API error:', error.message)

      // If Haiku fails, try Sonnet as fallback
      if (error.status !== 429) { // Don't retry on rate limit
        return this.extractWithClaudeSonnet(content, url)
      }

      return null
    }
  }

  /**
   * Fallback to Claude Sonnet for more complex pages
   */
  private async extractWithClaudeSonnet(content: string, url: string): Promise<ExtractedEventData | null> {
    if (!this.anthropic) return null

    try {
      console.log('🤖 Fallback to Claude Sonnet...')

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: EXTRACTION_PROMPT_USER(content)
          }
        ],
        system: EXTRACTION_PROMPT_SYSTEM
      })

      const textBlock = response.content.find(block => block.type === 'text')
      if (!textBlock || textBlock.type !== 'text') return null

      const jsonMatch = textBlock.text.match(/```(?:json)?\s*([\s\S]*?)```/)
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : textBlock.text.trim()

      const parsed = JSON.parse(jsonStr)
      if (!parsed.eventName) return null

      return {
        ...parsed,
        extractionMethod: 'html',
        confidence: parsed.confidence || 0.6
      }

    } catch (error) {
      console.error('Sonnet fallback also failed:', error)
      return null
    }
  }
}

// Singleton instance
export const htmlExtractor = new HtmlExtractor()
