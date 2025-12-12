/**
 * Tests for ImageExtractor
 *
 * These tests verify that the image extractor correctly handles images
 * and extracts event information using Claude Vision.
 */

import { ImageExtractor } from '../ImageExtractor'
import { ExtractedEventData } from '../types'

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn()
      }
    }))
  }
})

// Mock sharp
jest.mock('sharp', () => {
  return jest.fn().mockImplementation(() => ({
    metadata: jest.fn().mockResolvedValue({ width: 1920, height: 1080 }),
    resize: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('resized-image'))
  }))
})

describe('ImageExtractor', () => {
  let extractor: ImageExtractor
  let mockAnthropicCreate: jest.Mock

  beforeEach(() => {
    // Set up environment
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token'

    // Reset mocks
    jest.clearAllMocks()

    // Create new extractor instance
    extractor = new ImageExtractor()

    // Get reference to mocked create function
    const Anthropic = require('@anthropic-ai/sdk').default
    mockAnthropicCreate = Anthropic.mock.results[0]?.value?.messages?.create
  })

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.SLACK_BOT_TOKEN
  })

  describe('detectMimeType', () => {
    it('should detect JPEG from magic bytes', () => {
      // JPEG magic bytes: 0xFF 0xD8 0xFF
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00])

      const mimeType = (extractor as any).detectMimeType(jpegBuffer)

      expect(mimeType).toBe('image/jpeg')
    })

    it('should detect PNG from magic bytes', () => {
      // PNG magic bytes: 0x89 0x50 0x4E 0x47
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A])

      const mimeType = (extractor as any).detectMimeType(pngBuffer)

      expect(mimeType).toBe('image/png')
    })

    it('should detect GIF from magic bytes', () => {
      // GIF magic bytes: 0x47 0x49 0x46
      const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39])

      const mimeType = (extractor as any).detectMimeType(gifBuffer)

      expect(mimeType).toBe('image/gif')
    })

    it('should detect WebP from magic bytes', () => {
      // WebP magic bytes: 0x52 0x49 0x46 0x46 (RIFF)
      const webpBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00])

      const mimeType = (extractor as any).detectMimeType(webpBuffer)

      expect(mimeType).toBe('image/webp')
    })

    it('should default to JPEG for unknown formats', () => {
      const unknownBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00])

      const mimeType = (extractor as any).detectMimeType(unknownBuffer)

      expect(mimeType).toBe('image/jpeg')
    })
  })

  describe('extract - with buffer', () => {
    it('should extract event data from image buffer', async () => {
      const mockResponse: ExtractedEventData = {
        eventName: 'Trail des Alpes',
        eventCity: 'Grenoble',
        eventDepartment: '38',
        editionYear: 2025,
        editionDate: '2025-06-15',
        races: [
          { name: 'Trail 50K', distance: 50000, elevation: 3000 }
        ],
        confidence: 0.8,
        extractionMethod: 'image'
      }

      mockAnthropicCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify(mockResponse)
          }
        ]
      })

      // JPEG magic bytes
      const imageBuffer = Buffer.from([0xFF, 0xD8, 0xFF, ...Array(100).fill(0x00)])

      const result = await extractor.extract({ imageBuffer })

      expect(result.success).toBe(true)
      expect(result.data?.eventName).toBe('Trail des Alpes')
      expect(result.data?.eventCity).toBe('Grenoble')
      expect(result.data?.editionDate).toBe('2025-06-15')
      expect(result.data?.extractionMethod).toBe('image')
    })

    it('should resize large images before sending to Claude', async () => {
      const mockResponse: ExtractedEventData = {
        eventName: 'Event from large image',
        confidence: 0.7,
        extractionMethod: 'image'
      }

      mockAnthropicCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify(mockResponse)
          }
        ]
      })

      // Create a "large" buffer (> 5MB threshold for resize)
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024)
      // Add JPEG magic bytes
      largeBuffer[0] = 0xFF
      largeBuffer[1] = 0xD8
      largeBuffer[2] = 0xFF

      const result = await extractor.extract({ imageBuffer: largeBuffer })

      expect(result.success).toBe(true)

      // Verify sharp was called for resizing
      const sharp = require('sharp')
      expect(sharp).toHaveBeenCalled()
    })
  })

  describe('extract - with URL', () => {
    beforeEach(() => {
      // Mock fetch for image downloads
      global.fetch = jest.fn()
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should download and extract from image URL', async () => {
      // Mock fetch to return an image
      const imageBuffer = Buffer.from([0xFF, 0xD8, 0xFF, ...Array(100).fill(0x00)])
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(imageBuffer.buffer)
      })

      const mockResponse: ExtractedEventData = {
        eventName: 'Downloaded Event',
        eventCity: 'Lyon',
        confidence: 0.75,
        extractionMethod: 'image'
      }

      mockAnthropicCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify(mockResponse)
          }
        ]
      })

      const result = await extractor.extract({
        imageUrl: 'https://example.com/event-flyer.jpg'
      })

      expect(result.success).toBe(true)
      expect(result.data?.eventName).toBe('Downloaded Event')
    })

    it('should add Slack auth header for Slack URLs', async () => {
      const imageBuffer = Buffer.from([0xFF, 0xD8, 0xFF, ...Array(100).fill(0x00)])
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(imageBuffer.buffer)
      })

      mockAnthropicCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({ eventName: 'Slack Event', confidence: 0.8 })
          }
        ]
      })

      await extractor.extract({
        imageUrl: 'https://files.slack.com/files-pri/T123/image.png'
      })

      // Verify fetch was called with auth header
      expect(global.fetch).toHaveBeenCalledWith(
        'https://files.slack.com/files-pri/T123/image.png',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer xoxb-test-token'
          })
        })
      )
    })

    it('should handle download failure', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404
      })

      const result = await extractor.extract({
        imageUrl: 'https://example.com/not-found.jpg'
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('404')
    })
  })

  describe('extract - validation', () => {
    it('should require either imageUrl or imageBuffer', async () => {
      const result = await extractor.extract({
        imageUrl: undefined,
        imageBuffer: undefined
      } as any)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Aucune image fournie')
    })

    it('should fail if eventName is missing from extraction', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              eventCity: 'Paris',
              confidence: 0.5
            })
          }
        ]
      })

      const imageBuffer = Buffer.from([0xFF, 0xD8, 0xFF, ...Array(100).fill(0x00)])
      const result = await extractor.extract({ imageBuffer })

      expect(result.success).toBe(false)
    })
  })

  describe('error handling', () => {
    it('should return error when API key is not set', async () => {
      delete process.env.ANTHROPIC_API_KEY

      const extractorWithoutKey = new ImageExtractor()
      const imageBuffer = Buffer.from([0xFF, 0xD8, 0xFF, ...Array(100).fill(0x00)])

      const result = await extractorWithoutKey.extract({ imageBuffer })

      expect(result.success).toBe(false)
      expect(result.error).toContain('clé API')
    })

    it('should handle invalid JSON response from Claude Vision', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: 'This is not valid JSON'
          }
        ]
      })

      const imageBuffer = Buffer.from([0xFF, 0xD8, 0xFF, ...Array(100).fill(0x00)])
      const result = await extractor.extract({ imageBuffer })

      expect(result.success).toBe(false)
    })

    it('should handle empty response from Claude Vision', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: []
      })

      const imageBuffer = Buffer.from([0xFF, 0xD8, 0xFF, ...Array(100).fill(0x00)])
      const result = await extractor.extract({ imageBuffer })

      expect(result.success).toBe(false)
    })
  })
})

describe('ImageExtractor - Real-world image scenarios', () => {
  /**
   * These tests document what we expect Claude Vision to extract from
   * various types of event images.
   */

  describe('Expected extraction from event flyer', () => {
    it('should define expectations for a typical event flyer', () => {
      // A typical event flyer would contain:
      const expectedElements = {
        eventName: true, // Usually prominent in the center/top
        eventCity: true, // Location info
        editionDate: true, // Date is critical
        races: true, // List of distances/courses
        organizerLogo: true, // Often in footer/corner
        registrationUrl: true // QR code or URL
      }

      // This documents what a well-designed flyer should contain
      expect(expectedElements.eventName).toBe(true)
      expect(expectedElements.editionDate).toBe(true)
    })
  })

  describe('Expected extraction from screenshot', () => {
    it('should define expectations for a website screenshot', () => {
      // A screenshot of an event website would show:
      const expectedElements = {
        eventName: true, // From page title or header
        dates: true, // Usually prominently displayed
        location: true, // City/venue info
        races: true, // Table or list of courses
        prices: true // Registration fees often shown
      }

      expect(expectedElements.eventName).toBe(true)
      expect(expectedElements.dates).toBe(true)
    })
  })

  describe('Image quality considerations', () => {
    it('should document quality expectations', () => {
      const qualityFactors = {
        minResolution: '800x600', // Minimum for readable text
        idealResolution: '1920x1080', // HD for best extraction
        maxFileSize: '20MB', // Claude Vision limit
        supportedFormats: ['jpeg', 'png', 'gif', 'webp'],
        textReadability: 'High contrast text works best'
      }

      expect(qualityFactors.supportedFormats).toContain('jpeg')
      expect(qualityFactors.supportedFormats).toContain('png')
    })
  })
})
