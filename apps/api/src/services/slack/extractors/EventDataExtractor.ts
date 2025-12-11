/**
 * Event Data Extractor
 *
 * Orchestrates extraction from different sources:
 * - URLs (via HtmlExtractor)
 * - Images (via ImageExtractor - Phase 3)
 * - Text (direct parsing)
 */

import { htmlExtractor } from './HtmlExtractor'
import { ExtractionResult, ExtractedEventData } from './types'
import { SlackMessage, SlackFile, slackService } from '../SlackService'

export interface ExtractionContext {
  message: SlackMessage
  urls: string[]
  hasImages: boolean
}

export class EventDataExtractor {
  /**
   * Extract event data from a Slack message
   */
  async extractFromMessage(context: ExtractionContext): Promise<ExtractionResult> {
    const { urls, hasImages, message } = context

    console.log(`🔍 Starting extraction - URLs: ${urls.length}, Images: ${hasImages}`)

    // Priority 1: Try URL extraction first
    if (urls.length > 0) {
      const urlResult = await this.extractFromUrl(urls[0])
      if (urlResult.success && urlResult.data) {
        console.log(`✅ URL extraction successful: ${urlResult.data.eventName}`)
        return urlResult
      }
      console.warn(`⚠️ URL extraction failed: ${urlResult.error}`)
    }

    // Priority 2: Try image extraction (Phase 3 - not implemented yet)
    if (hasImages && message.files) {
      const imageFiles = message.files.filter(f => f.mimetype.startsWith('image/'))
      if (imageFiles.length > 0) {
        const imageResult = await this.extractFromImage(imageFiles[0])
        if (imageResult.success && imageResult.data) {
          console.log(`✅ Image extraction successful: ${imageResult.data.eventName}`)
          return imageResult
        }
        console.warn(`⚠️ Image extraction failed: ${imageResult.error}`)
      }
    }

    // Priority 3: Try text extraction from message (Phase 3)
    if (message.text && message.text.length > 50) {
      // Remove bot mention from text
      const cleanText = message.text.replace(/<@[A-Z0-9]+>/g, '').trim()
      if (cleanText.length > 50) {
        const textResult = await this.extractFromText(cleanText)
        if (textResult.success && textResult.data) {
          console.log(`✅ Text extraction successful: ${textResult.data.eventName}`)
          return textResult
        }
      }
    }

    return {
      success: false,
      error: 'Impossible d\'extraire les informations de l\'événement depuis les sources fournies'
    }
  }

  /**
   * Extract event data from a URL
   */
  async extractFromUrl(url: string): Promise<ExtractionResult> {
    return htmlExtractor.extract({ url })
  }

  /**
   * Extract event data from an image (Phase 3 placeholder)
   */
  async extractFromImage(file: SlackFile): Promise<ExtractionResult> {
    // TODO: Phase 3 - Implement image extraction with Claude Vision
    console.log(`🖼️ Image extraction not yet implemented for: ${file.name}`)

    return {
      success: false,
      error: 'L\'extraction depuis les images n\'est pas encore implémentée'
    }
  }

  /**
   * Extract event data from plain text (Phase 3 placeholder)
   */
  async extractFromText(text: string): Promise<ExtractionResult> {
    // TODO: Phase 3 - Implement text extraction with Claude
    console.log(`📝 Text extraction not yet implemented`)

    return {
      success: false,
      error: 'L\'extraction depuis le texte n\'est pas encore implémentée'
    }
  }

  /**
   * Validate extracted data has minimum required fields
   */
  validateExtractedData(data: ExtractedEventData): { valid: boolean; missing: string[] } {
    const missing: string[] = []

    if (!data.eventName) missing.push('eventName')
    if (!data.eventCity) missing.push('eventCity')
    if (!data.editionDate && !data.editionYear) missing.push('editionDate ou editionYear')

    return {
      valid: missing.length === 0,
      missing
    }
  }

  /**
   * Format extracted data for display in Slack
   */
  formatForSlack(data: ExtractedEventData): string {
    let text = `📋 *${data.eventName}*\n\n`

    if (data.eventCity) {
      text += `📍 ${data.eventCity}`
      if (data.eventDepartment) text += ` (${data.eventDepartment})`
      text += '\n'
    }

    if (data.editionDate) {
      const date = new Date(data.editionDate)
      text += `📅 ${date.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
      if (data.editionEndDate && data.editionEndDate !== data.editionDate) {
        const endDate = new Date(data.editionEndDate)
        text += ` - ${endDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
      }
      text += '\n'
    }

    if (data.races && data.races.length > 0) {
      text += '\n*Courses:*\n'
      for (const race of data.races.slice(0, 5)) { // Limit to 5 races
        text += `• ${race.name}`
        if (race.distance) {
          const km = race.distance >= 1000 ? `${(race.distance / 1000).toFixed(1)}km` : `${race.distance}m`
          text += ` - ${km}`
        }
        if (race.elevation) {
          text += ` (D+${race.elevation}m)`
        }
        if (race.startTime) {
          text += ` - ${race.startTime}`
        }
        text += '\n'
      }
      if (data.races.length > 5) {
        text += `  _...et ${data.races.length - 5} autre(s)_\n`
      }
    }

    if (data.organizerName) {
      text += `\n👤 Organisateur: ${data.organizerName}\n`
    }

    if (data.registrationUrl) {
      text += `\n🔗 <${data.registrationUrl}|Inscriptions>\n`
    }

    const confidenceEmoji = data.confidence >= 0.8 ? '🟢' : data.confidence >= 0.5 ? '🟡' : '🔴'
    text += `\n${confidenceEmoji} Confiance: ${Math.round(data.confidence * 100)}%`

    return text
  }
}

// Singleton instance
export const eventDataExtractor = new EventDataExtractor()
