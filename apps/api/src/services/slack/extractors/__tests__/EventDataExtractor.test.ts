/**
 * Tests for EventDataExtractor (Orchestrator)
 *
 * These tests verify that the orchestrator correctly prioritizes
 * extraction sources and handles various scenarios.
 */

import { EventDataExtractor, ExtractionContext } from '../EventDataExtractor'
import { ExtractedEventData, ExtractionResult } from '../types'
import { SlackMessage } from '../../SlackService'

// Mock the individual extractors
jest.mock('../HtmlExtractor', () => ({
  htmlExtractor: {
    extract: jest.fn()
  }
}))

jest.mock('../ImageExtractor', () => ({
  imageExtractor: {
    extract: jest.fn()
  }
}))

jest.mock('../TextExtractor', () => ({
  textExtractor: {
    extract: jest.fn()
  }
}))

// Mock SlackService
jest.mock('../../SlackService', () => ({
  slackService: {
    downloadFile: jest.fn()
  }
}))

import { htmlExtractor } from '../HtmlExtractor'
import { imageExtractor } from '../ImageExtractor'
import { textExtractor } from '../TextExtractor'
import { slackService } from '../../SlackService'

describe('EventDataExtractor', () => {
  let orchestrator: EventDataExtractor

  beforeEach(() => {
    jest.clearAllMocks()
    orchestrator = new EventDataExtractor()
  })

  describe('extractFromMessage - priority order', () => {
    const createMessage = (text: string = '', files: any[] = []): SlackMessage => ({
      type: 'message',
      user: 'U123456',
      text,
      ts: '1234567890.123456',
      channel: 'C123456',
      files
    })

    it('should prioritize URL extraction over image and text', async () => {
      const mockUrlResult: ExtractionResult = {
        success: true,
        data: {
          eventName: 'Event from URL',
          confidence: 0.9,
          extractionMethod: 'html'
        }
      }
      ;(htmlExtractor.extract as jest.Mock).mockResolvedValue(mockUrlResult)

      const context: ExtractionContext = {
        message: createMessage('Check out https://example.com/event', [
          { name: 'flyer.jpg', mimetype: 'image/jpeg', url_private: 'https://slack.com/files/flyer.jpg' }
        ]),
        urls: ['https://example.com/event'],
        hasImages: true
      }

      const result = await orchestrator.extractFromMessage(context)

      expect(result.success).toBe(true)
      expect(result.data?.eventName).toBe('Event from URL')
      expect(result.data?.extractionMethod).toBe('html')

      // Image and text extractors should NOT be called
      expect(imageExtractor.extract).not.toHaveBeenCalled()
      expect(textExtractor.extract).not.toHaveBeenCalled()
    })

    it('should fall back to image if URL extraction fails', async () => {
      const mockUrlResult: ExtractionResult = {
        success: false,
        error: 'Failed to fetch URL'
      }
      ;(htmlExtractor.extract as jest.Mock).mockResolvedValue(mockUrlResult)

      const mockImageResult: ExtractionResult = {
        success: true,
        data: {
          eventName: 'Event from Image',
          confidence: 0.8,
          extractionMethod: 'image'
        }
      }
      ;(imageExtractor.extract as jest.Mock).mockResolvedValue(mockImageResult)
      ;(slackService.downloadFile as jest.Mock).mockResolvedValue(Buffer.from('image'))

      const context: ExtractionContext = {
        message: createMessage('Check this event', [
          { name: 'flyer.jpg', mimetype: 'image/jpeg', url_private: 'https://slack.com/files/flyer.jpg' }
        ]),
        urls: ['https://broken-url.com'],
        hasImages: true
      }

      const result = await orchestrator.extractFromMessage(context)

      expect(result.success).toBe(true)
      expect(result.data?.eventName).toBe('Event from Image')
      expect(result.data?.extractionMethod).toBe('image')
    })

    it('should fall back to text if URL and image extraction fail', async () => {
      const mockUrlResult: ExtractionResult = {
        success: false,
        error: 'Failed to fetch URL'
      }
      ;(htmlExtractor.extract as jest.Mock).mockResolvedValue(mockUrlResult)

      const mockImageResult: ExtractionResult = {
        success: false,
        error: 'Failed to extract from image'
      }
      ;(imageExtractor.extract as jest.Mock).mockResolvedValue(mockImageResult)
      ;(slackService.downloadFile as jest.Mock).mockResolvedValue(Buffer.from('image'))

      const mockTextResult: ExtractionResult = {
        success: true,
        data: {
          eventName: 'Event from Text',
          confidence: 0.7,
          extractionMethod: 'text'
        }
      }
      ;(textExtractor.extract as jest.Mock).mockResolvedValue(mockTextResult)

      const context: ExtractionContext = {
        message: createMessage(
          'Trail des Montagnes - 15 mars 2025 à Chamonix - 42km avec 2500m D+',
          [{ name: 'bad.jpg', mimetype: 'image/jpeg', url_private: 'https://slack.com/files/bad.jpg' }]
        ),
        urls: ['https://broken-url.com'],
        hasImages: true
      }

      const result = await orchestrator.extractFromMessage(context)

      expect(result.success).toBe(true)
      expect(result.data?.eventName).toBe('Event from Text')
      expect(result.data?.extractionMethod).toBe('text')
    })

    it('should try image extraction if no URL provided', async () => {
      const mockImageResult: ExtractionResult = {
        success: true,
        data: {
          eventName: 'Event from Image Only',
          confidence: 0.85,
          extractionMethod: 'image'
        }
      }
      ;(imageExtractor.extract as jest.Mock).mockResolvedValue(mockImageResult)
      ;(slackService.downloadFile as jest.Mock).mockResolvedValue(Buffer.from('image'))

      const context: ExtractionContext = {
        message: createMessage('Check this flyer', [
          { name: 'event.png', mimetype: 'image/png', url_private: 'https://slack.com/files/event.png' }
        ]),
        urls: [],
        hasImages: true
      }

      const result = await orchestrator.extractFromMessage(context)

      expect(result.success).toBe(true)
      expect(result.data?.eventName).toBe('Event from Image Only')

      // URL extractor should NOT be called
      expect(htmlExtractor.extract).not.toHaveBeenCalled()
    })

    it('should try text extraction if no URL or image', async () => {
      const mockTextResult: ExtractionResult = {
        success: true,
        data: {
          eventName: 'Event from Text Only',
          confidence: 0.6,
          extractionMethod: 'text'
        }
      }
      ;(textExtractor.extract as jest.Mock).mockResolvedValue(mockTextResult)

      const context: ExtractionContext = {
        message: createMessage(
          'Marathon de Paris le 6 avril 2025 - Inscriptions ouvertes !'
        ),
        urls: [],
        hasImages: false
      }

      const result = await orchestrator.extractFromMessage(context)

      expect(result.success).toBe(true)
      expect(result.data?.eventName).toBe('Event from Text Only')

      expect(htmlExtractor.extract).not.toHaveBeenCalled()
      expect(imageExtractor.extract).not.toHaveBeenCalled()
    })
  })

  describe('extractFromMessage - text cleaning', () => {
    it('should remove bot mentions from text before extraction', async () => {
      const mockTextResult: ExtractionResult = {
        success: true,
        data: {
          eventName: 'Test Event',
          confidence: 0.7,
          extractionMethod: 'text'
        }
      }
      ;(textExtractor.extract as jest.Mock).mockResolvedValue(mockTextResult)

      const context: ExtractionContext = {
        message: {
          type: 'message',
          user: 'U123',
          text: '<@U987654> Marathon de Paris le 6 avril 2025 - Inscriptions ouvertes !',
          ts: '123.456',
          channel: 'C123'
        },
        urls: [],
        hasImages: false
      }

      await orchestrator.extractFromMessage(context)

      // Verify text extractor received cleaned text (without mention)
      expect(textExtractor.extract).toHaveBeenCalledWith(
        expect.not.stringContaining('<@U987654>')
      )
    })

    it('should remove Slack-formatted URLs from text', async () => {
      const mockTextResult: ExtractionResult = {
        success: true,
        data: {
          eventName: 'Test Event',
          confidence: 0.7,
          extractionMethod: 'text'
        }
      }
      ;(textExtractor.extract as jest.Mock).mockResolvedValue(mockTextResult)

      const context: ExtractionContext = {
        message: {
          type: 'message',
          user: 'U123',
          // Text must be long enough after cleaning (>30 chars)
          text: 'Check this <https://example.com|example.com> Marathon de Paris le 6 avril 2025',
          ts: '123.456',
          channel: 'C123'
        },
        urls: [],
        hasImages: false
      }

      await orchestrator.extractFromMessage(context)

      // Verify text extractor was called
      expect(textExtractor.extract).toHaveBeenCalled()

      // Verify text extractor received text without Slack URL formatting
      const calledWith = (textExtractor.extract as jest.Mock).mock.calls[0][0]
      expect(calledWith).not.toContain('<https://')
      expect(calledWith).not.toContain('|example.com>')
    })

    it('should not attempt text extraction if cleaned text is too short', async () => {
      // URL extraction fails
      ;(htmlExtractor.extract as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Failed'
      })

      const context: ExtractionContext = {
        message: {
          type: 'message',
          user: 'U123',
          text: '<@U987654> hi', // After cleaning: "hi" - too short
          ts: '123.456',
          channel: 'C123'
        },
        urls: ['https://broken.com'],
        hasImages: false
      }

      const result = await orchestrator.extractFromMessage(context)

      // Should return URL error, not attempt text extraction
      expect(result.success).toBe(false)
      expect(textExtractor.extract).not.toHaveBeenCalled()
    })
  })

  describe('extractFromMessage - failure scenarios', () => {
    it('should return error if all extraction methods fail', async () => {
      ;(htmlExtractor.extract as jest.Mock).mockResolvedValue({
        success: false,
        error: 'URL failed'
      })
      ;(imageExtractor.extract as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Image failed'
      })
      ;(textExtractor.extract as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Text failed'
      })
      ;(slackService.downloadFile as jest.Mock).mockResolvedValue(Buffer.from('image'))

      const context: ExtractionContext = {
        message: {
          type: 'message',
          user: 'U123',
          text: 'Some event info that is long enough to try extraction',
          ts: '123.456',
          channel: 'C123',
          files: [{ name: 'file.jpg', mimetype: 'image/jpeg', url_private: 'https://slack.com/file.jpg' }]
        },
        urls: ['https://example.com'],
        hasImages: true
      }

      const result = await orchestrator.extractFromMessage(context)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Impossible d\'extraire')
    })

    it('should handle image download failure gracefully', async () => {
      ;(slackService.downloadFile as jest.Mock).mockResolvedValue(null)

      const mockTextResult: ExtractionResult = {
        success: true,
        data: {
          eventName: 'Fallback to Text',
          confidence: 0.6,
          extractionMethod: 'text'
        }
      }
      ;(textExtractor.extract as jest.Mock).mockResolvedValue(mockTextResult)

      const context: ExtractionContext = {
        message: {
          type: 'message',
          user: 'U123',
          text: 'Marathon de Paris - 6 avril 2025 - Grande course annuelle',
          ts: '123.456',
          channel: 'C123',
          files: [{ name: 'file.jpg', mimetype: 'image/jpeg', url_private: 'https://slack.com/file.jpg' }]
        },
        urls: [],
        hasImages: true
      }

      const result = await orchestrator.extractFromMessage(context)

      // Should fall back to text extraction
      expect(result.success).toBe(true)
      expect(result.data?.eventName).toBe('Fallback to Text')
    })
  })

  describe('validateExtractedData', () => {
    it('should validate complete data as valid', () => {
      const data: ExtractedEventData = {
        eventName: 'Test Event',
        eventCity: 'Paris',
        editionDate: '2025-03-15',
        confidence: 0.9,
        extractionMethod: 'html'
      }

      const validation = orchestrator.validateExtractedData(data)

      expect(validation.valid).toBe(true)
      expect(validation.missing).toHaveLength(0)
    })

    it('should detect missing eventName', () => {
      const data: ExtractedEventData = {
        eventName: '',
        eventCity: 'Paris',
        editionDate: '2025-03-15',
        confidence: 0.9,
        extractionMethod: 'html'
      }

      const validation = orchestrator.validateExtractedData(data)

      expect(validation.valid).toBe(false)
      expect(validation.missing).toContain('eventName')
    })

    it('should detect missing city', () => {
      const data: ExtractedEventData = {
        eventName: 'Test Event',
        editionDate: '2025-03-15',
        confidence: 0.9,
        extractionMethod: 'html'
      }

      const validation = orchestrator.validateExtractedData(data)

      expect(validation.valid).toBe(false)
      expect(validation.missing).toContain('eventCity')
    })

    it('should accept editionYear as alternative to editionDate', () => {
      const data: ExtractedEventData = {
        eventName: 'Test Event',
        eventCity: 'Paris',
        editionYear: 2025,
        confidence: 0.9,
        extractionMethod: 'html'
      }

      const validation = orchestrator.validateExtractedData(data)

      expect(validation.valid).toBe(true)
    })

    it('should detect missing date info', () => {
      const data: ExtractedEventData = {
        eventName: 'Test Event',
        eventCity: 'Paris',
        confidence: 0.9,
        extractionMethod: 'html'
      }

      const validation = orchestrator.validateExtractedData(data)

      expect(validation.valid).toBe(false)
      expect(validation.missing).toContain('editionDate ou editionYear')
    })
  })

  describe('formatForSlack', () => {
    it('should format complete event data', () => {
      const data: ExtractedEventData = {
        eventName: 'Trail des Alpes',
        eventCity: 'Grenoble',
        eventDepartment: '38',
        editionDate: '2025-06-15',
        races: [
          { name: 'Ultra 100K', distance: 100000, elevation: 6000 },
          { name: 'Trail 50K', distance: 50000, elevation: 3000 }
        ],
        organizerName: 'Association Trail Alpes',
        registrationUrl: 'https://traildesalpes.fr/inscription',
        confidence: 0.9,
        extractionMethod: 'html'
      }

      const formatted = orchestrator.formatForSlack(data)

      expect(formatted).toContain('Trail des Alpes')
      expect(formatted).toContain('Grenoble')
      expect(formatted).toContain('38')
      expect(formatted).toContain('Ultra 100K')
      expect(formatted).toContain('100.0km') // Format includes decimal
      expect(formatted).toContain('6000m')
      expect(formatted).toContain('Trail 50K')
      expect(formatted).toContain('Association Trail Alpes')
      expect(formatted).toContain('Inscriptions')
      expect(formatted).toContain('90%')
    })

    it('should handle minimal event data', () => {
      const data: ExtractedEventData = {
        eventName: 'Simple Event',
        confidence: 0.5,
        extractionMethod: 'text'
      }

      const formatted = orchestrator.formatForSlack(data)

      expect(formatted).toContain('Simple Event')
      expect(formatted).toContain('50%')
    })

    it('should format multi-day events', () => {
      const data: ExtractedEventData = {
        eventName: 'Festival Trail',
        eventCity: 'Chamonix',
        editionDate: '2025-08-28',
        editionEndDate: '2025-08-30',
        confidence: 0.85,
        extractionMethod: 'html'
      }

      const formatted = orchestrator.formatForSlack(data)

      expect(formatted).toContain('Chamonix')
      // Should show date range
      expect(formatted).toMatch(/28.*30/)
    })

    it('should limit displayed races to 5', () => {
      const data: ExtractedEventData = {
        eventName: 'Big Event',
        eventCity: 'Paris',
        races: [
          { name: 'Race 1', distance: 5000 },
          { name: 'Race 2', distance: 10000 },
          { name: 'Race 3', distance: 15000 },
          { name: 'Race 4', distance: 20000 },
          { name: 'Race 5', distance: 25000 },
          { name: 'Race 6', distance: 30000 },
          { name: 'Race 7', distance: 35000 }
        ],
        confidence: 0.8,
        extractionMethod: 'html'
      }

      const formatted = orchestrator.formatForSlack(data)

      expect(formatted).toContain('Race 1')
      expect(formatted).toContain('Race 5')
      expect(formatted).not.toContain('Race 6')
      expect(formatted).toContain('2 autre')
    })

    it('should show correct confidence emoji', () => {
      const highConfidence: ExtractedEventData = {
        eventName: 'High',
        confidence: 0.9,
        extractionMethod: 'html'
      }
      const mediumConfidence: ExtractedEventData = {
        eventName: 'Medium',
        confidence: 0.6,
        extractionMethod: 'html'
      }
      const lowConfidence: ExtractedEventData = {
        eventName: 'Low',
        confidence: 0.3,
        extractionMethod: 'html'
      }

      expect(orchestrator.formatForSlack(highConfidence)).toContain('🟢')
      expect(orchestrator.formatForSlack(mediumConfidence)).toContain('🟡')
      expect(orchestrator.formatForSlack(lowConfidence)).toContain('🔴')
    })
  })

  describe('getExtractionMethodLabel', () => {
    it('should return correct labels', () => {
      expect(orchestrator.getExtractionMethodLabel('html')).toBe('Page web')
      expect(orchestrator.getExtractionMethodLabel('image')).toBe('Image (OCR)')
      expect(orchestrator.getExtractionMethodLabel('text')).toBe('Texte')
      expect(orchestrator.getExtractionMethodLabel('unknown')).toBe('unknown')
    })
  })
})
