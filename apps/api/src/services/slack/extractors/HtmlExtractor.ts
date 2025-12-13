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

// Custom error classes for specific API errors
export class ApiCreditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApiCreditError'
  }
}

export class ApiRateLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApiRateLimitError'
  }
}

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

      // Check for SPA indicators before sending to Claude
      const spaIndicators = this.detectSpaPage(textContent)
      if (spaIndicators.isSpa) {
        console.warn(`⚠️ Detected SPA page: ${spaIndicators.reason}`)
        return {
          success: false,
          error: `Cette page utilise JavaScript pour afficher son contenu (${spaIndicators.reason}). L'extraction automatique n'est pas possible. Essaie avec une image/capture d'écran.`,
          errorType: 'fetch_failed',
          rawContent: textContent.substring(0, 1000)
        }
      }

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
          // Use a realistic browser User-Agent to avoid being blocked by sites that filter bots
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"macOS"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1'
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
   * Detect if page is a SPA with no useful content
   */
  private detectSpaPage(textContent: string): { isSpa: boolean; reason: string } {
    // Check for common SPA frameworks indicators in the text
    const lowerContent = textContent.toLowerCase()

    // If content is mostly short (less than 500 chars of actual text after URL/title)
    const contentLines = textContent.split('\n').filter(line =>
      !line.startsWith('URL:') &&
      !line.startsWith('Titre:') &&
      !line.startsWith('Description:') &&
      line.trim().length > 0
    )
    const actualContent = contentLines.join(' ').trim()

    // Check if content contains dates (indicates real content)
    const hasDatePattern = /\d{1,2}[\s\/\-](janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|jan|fév|mar|avr|mai|jun|jul|aoû|sep|oct|nov|déc)[\s\/\-]\d{2,4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/i.test(actualContent)

    // If we have a date, it's probably real content
    if (hasDatePattern) {
      return { isSpa: false, reason: '' }
    }

    // Check for SPA indicators
    if (actualContent.length < 300) {
      return { isSpa: true, reason: 'contenu trop court' }
    }

    // Check for high ratio of technical/JS content
    const jsPatterns = [
      /function\s*\(/g,
      /\bvar\s+\w+\s*=/g,
      /\bconst\s+\w+\s*=/g,
      /\blet\s+\w+\s*=/g,
      /webpack/gi,
      /chunk/gi,
      /__NEXT_DATA__/g,
      /__NUXT__/g,
      /ReactDOM/g,
      /vue\.js/gi,
      /angular/gi
    ]

    let jsMatches = 0
    for (const pattern of jsPatterns) {
      const matches = actualContent.match(pattern)
      if (matches) jsMatches += matches.length
    }

    if (jsMatches > 5) {
      return { isSpa: true, reason: 'page JavaScript/SPA détectée' }
    }

    // Check if content looks like gibberish (high ratio of special chars)
    const alphaNumeric = actualContent.replace(/[^a-zA-Z0-9àâäéèêëïîôùûüç\s]/g, '')
    const ratio = alphaNumeric.length / actualContent.length

    if (ratio < 0.5) {
      return { isSpa: true, reason: 'contenu non lisible' }
    }

    return { isSpa: false, reason: '' }
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
        temperature: 0, // Déterministe pour des résultats cohérents
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

        // Check for SPA/no-content error from Claude
        if (parsed.error === 'page_spa_no_content') {
          console.warn('⚠️ Page detected as SPA with no extractable content')
          return null
        }

        // Validate required fields
        if (!parsed.eventName) {
          console.warn('Extracted data missing eventName')
          return null
        }

        // Warn if no date found (low confidence expected)
        if (!parsed.editionDate && !parsed.editionYear) {
          console.warn('⚠️ No date found in extracted data - confidence should be low')
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

      // Check for credit/billing errors - don't retry, propagate immediately
      if (this.isApiCreditError(error)) {
        throw new ApiCreditError('Crédits API Anthropic insuffisants')
      }

      // Check for rate limit
      if (error.status === 429) {
        throw new ApiRateLimitError('Limite de requêtes API atteinte')
      }

      // For other errors, try Sonnet as fallback
      return this.extractWithClaudeSonnet(content, url)
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
        temperature: 0, // Déterministe pour des résultats cohérents
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

    } catch (error: any) {
      console.error('Sonnet fallback also failed:', error)

      // Check for credit/billing errors
      if (this.isApiCreditError(error)) {
        throw new ApiCreditError('Crédits API Anthropic insuffisants')
      }

      // Check for rate limit
      if (error.status === 429) {
        throw new ApiRateLimitError('Limite de requêtes API atteinte')
      }

      return null
    }
  }
}

// Singleton instance
export const htmlExtractor = new HtmlExtractor()
