/**
 * Image Extractor
 *
 * Extracts event information from images using Claude Vision.
 * Supports:
 * - Flyers/posters of events
 * - Screenshots of event pages
 * - Photos of printed materials
 */

import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import {
  ExtractionResult,
  ExtractedEventData,
  ImageExtractionOptions,
  EXTRACTION_PROMPT_SYSTEM,
  buildExtractionPrompt
} from './types'
import { ApiCreditError, ApiRateLimitError } from './HtmlExtractor'

const MAX_IMAGE_SIZE = 20 * 1024 * 1024 // 20MB max for Claude Vision
const RESIZE_THRESHOLD = 5 * 1024 * 1024 // Start resizing above 5MB for efficiency
const MAX_DIMENSION = 2048 // Max width/height after resize
const JPEG_QUALITY = 85 // Good balance between size and readability

export class ImageExtractor {
  private anthropic: Anthropic | null = null

  constructor() {
    this.initializeAnthropicClient()
  }

  private initializeAnthropicClient() {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.warn('⚠️ ANTHROPIC_API_KEY not set - ImageExtractor will not work')
      return
    }
    this.anthropic = new Anthropic({ apiKey })
  }

  /**
   * Extract event data from an image
   */
  async extract(options: ImageExtractionOptions): Promise<ExtractionResult> {
    const { imageUrl, imageBuffer, mimeType } = options

    console.log(`🖼️ Extracting event data from image${imageUrl ? `: ${imageUrl}` : ''}`)

    if (!this.anthropic) {
      return {
        success: false,
        error: 'Service d\'extraction non configuré (clé API manquante)',
        errorType: 'extraction_failed'
      }
    }

    try {
      let imageData: { type: 'base64'; media_type: string; data: string } | { type: 'url'; url: string }

      if (imageBuffer) {
        // Use provided buffer, resize if needed
        let processedBuffer = imageBuffer

        if (imageBuffer.length > RESIZE_THRESHOLD) {
          processedBuffer = await this.resizeImage(imageBuffer)
        }

        const base64 = processedBuffer.toString('base64')
        const detectedMimeType = this.detectMimeType(processedBuffer)

        imageData = {
          type: 'base64',
          media_type: detectedMimeType,
          data: base64
        }
      } else if (imageUrl) {
        // Download image from URL
        const downloadResult = await this.downloadImage(imageUrl)
        if (!downloadResult.success) {
          return {
            success: false,
            error: downloadResult.error || 'Impossible de télécharger l\'image',
            errorType: 'fetch_failed'
          }
        }

        imageData = {
          type: 'base64',
          media_type: downloadResult.mimeType!,
          data: downloadResult.base64!
        }
      } else {
        return {
          success: false,
          error: 'Aucune image fournie (URL ou buffer requis)',
          errorType: 'extraction_failed'
        }
      }

      // Send to Claude Vision
      const extractedData = await this.extractWithClaudeVision(imageData)

      if (!extractedData) {
        return {
          success: false,
          error: 'Impossible d\'extraire les informations de l\'image',
          errorType: 'extraction_failed'
        }
      }

      return {
        success: true,
        data: {
          ...extractedData,
          sourceUrl: imageUrl,
          extractionMethod: 'image'
        }
      }

    } catch (error: any) {
      console.error('ImageExtractor error:', error)

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
   * Download image from URL (handles Slack authenticated URLs)
   */
  private async downloadImage(
    imageUrl: string,
    authToken?: string
  ): Promise<{ success: true; base64: string; mimeType: string } | { success: false; error: string }> {
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (compatible; DataAgentsBot/1.0)'
      }

      // Add Slack auth if it's a Slack URL
      if (imageUrl.includes('slack.com') || imageUrl.includes('slack-files.com')) {
        const slackToken = authToken || process.env.SLACK_BOT_TOKEN
        if (slackToken) {
          headers['Authorization'] = `Bearer ${slackToken}`
        }
      }

      const response = await fetch(imageUrl, {
        headers,
        signal: AbortSignal.timeout(30000) // 30s timeout
      })

      if (!response.ok) {
        console.error(`Failed to download image: HTTP ${response.status}`)
        return { success: false, error: `Erreur HTTP ${response.status} lors du téléchargement` }
      }

      let buffer: Buffer = Buffer.from(await response.arrayBuffer())
      const originalSize = buffer.length

      // Resize if image is too large
      if (buffer.length > RESIZE_THRESHOLD) {
        buffer = await this.resizeImage(buffer) as Buffer
        console.log(`📐 Image redimensionnée: ${(originalSize / 1024 / 1024).toFixed(1)} MB → ${(buffer.length / 1024 / 1024).toFixed(1)} MB`)
      }

      return {
        success: true,
        base64: buffer.toString('base64'),
        mimeType: this.detectMimeType(buffer)
      }

    } catch (error: any) {
      console.error('Error downloading image:', error.message)
      return { success: false, error: `Erreur lors du téléchargement: ${error.message}` }
    }
  }

  /**
   * Resize image to reduce file size while maintaining readability
   */
  private async resizeImage(buffer: Buffer): Promise<Buffer> {
    try {
      const image = sharp(buffer)
      const metadata = await image.metadata()

      console.log(`📐 Redimensionnement image: ${metadata.width}x${metadata.height}, ${(buffer.length / 1024 / 1024).toFixed(1)} MB`)

      // Resize and convert to JPEG for consistent compression
      const resized = await image
        .resize(MAX_DIMENSION, MAX_DIMENSION, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer()

      console.log(`✅ Image réduite à ${(resized.length / 1024 / 1024).toFixed(1)} MB`)

      // If still too large after resize, reduce quality further
      if (resized.length > MAX_IMAGE_SIZE) {
        console.log('⚠️ Image encore trop volumineuse, réduction qualité supplémentaire...')
        return await sharp(buffer)
          .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 70 })
          .toBuffer()
      }

      return resized

    } catch (error: any) {
      console.error('Error resizing image:', error.message)
      // Return original buffer if resize fails
      return buffer
    }
  }

  /**
   * Detect MIME type from buffer magic bytes
   */
  private detectMimeType(buffer: Buffer): string {
    // Check magic bytes
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return 'image/jpeg'
    }
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return 'image/png'
    }
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      return 'image/gif'
    }
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
      return 'image/webp'
    }

    // Default to JPEG
    return 'image/jpeg'
  }

  /**
   * Extract event data using Claude Vision
   */
  private async extractWithClaudeVision(
    imageData: { type: 'base64'; media_type: string; data: string } | { type: 'url'; url: string }
  ): Promise<ExtractedEventData | null> {
    if (!this.anthropic) {
      return null
    }

    try {
      console.log('🤖 Sending image to Claude Vision (Haiku)...')

      // Build the image content block
      const imageContent: Anthropic.ImageBlockParam = imageData.type === 'base64'
        ? {
            type: 'image',
            source: {
              type: 'base64',
              media_type: imageData.media_type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: imageData.data
            }
          }
        : {
            type: 'image',
            source: {
              type: 'url',
              url: imageData.url
            }
          }

      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 2048,
        temperature: 0, // Déterministe pour des résultats cohérents
        messages: [
          {
            role: 'user',
            content: [
              imageContent,
              {
                type: 'text',
                text: buildExtractionPrompt('', 'image')
              }
            ]
          }
        ],
        system: EXTRACTION_PROMPT_SYSTEM
      })

      // Extract text from response
      const textBlock = response.content.find(block => block.type === 'text')
      if (!textBlock || textBlock.type !== 'text') {
        console.error('No text response from Claude Vision')
        return null
      }

      const responseText = textBlock.text.trim()
      return this.parseExtractionResponse(responseText)

    } catch (error: any) {
      console.error('Claude Vision API error:', error.message)

      // Check for credit/billing errors
      if (this.isApiCreditError(error)) {
        throw new ApiCreditError('Crédits API Anthropic insuffisants')
      }

      // Check for rate limit
      if (error.status === 429) {
        throw new ApiRateLimitError('Limite de requêtes API atteinte')
      }

      // Try Sonnet as fallback for complex images
      console.log('🤖 Fallback to Claude Sonnet for image extraction...')
      return this.extractWithClaudeSonnetVision(imageData)
    }
  }

  /**
   * Fallback to Claude Sonnet for complex images
   */
  private async extractWithClaudeSonnetVision(
    imageData: { type: 'base64'; media_type: string; data: string } | { type: 'url'; url: string }
  ): Promise<ExtractedEventData | null> {
    if (!this.anthropic) return null

    try {
      const imageContent: Anthropic.ImageBlockParam = imageData.type === 'base64'
        ? {
            type: 'image',
            source: {
              type: 'base64',
              media_type: imageData.media_type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: imageData.data
            }
          }
        : {
            type: 'image',
            source: {
              type: 'url',
              url: imageData.url
            }
          }

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        temperature: 0, // Déterministe pour des résultats cohérents
        messages: [
          {
            role: 'user',
            content: [
              imageContent,
              {
                type: 'text',
                text: buildExtractionPrompt('', 'image')
              }
            ]
          }
        ],
        system: EXTRACTION_PROMPT_SYSTEM
      })

      const textBlock = response.content.find(block => block.type === 'text')
      if (!textBlock || textBlock.type !== 'text') return null

      return this.parseExtractionResponse(textBlock.text.trim())

    } catch (error: any) {
      console.error('Sonnet Vision fallback failed:', error.message)

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
        console.warn('⚠️ No date found in image - confidence should be low')
      }

      console.log(`✅ Successfully extracted from image: ${parsed.eventName}`)

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
        extractionMethod: 'image',
        rawExtractedText: undefined // No raw text for images
      }

    } catch (parseError) {
      console.error('Failed to parse Claude Vision response:', parseError)
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
export const imageExtractor = new ImageExtractor()
