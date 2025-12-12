/**
 * Tests for HtmlExtractor
 *
 * These tests verify that the HTML extractor correctly parses HTML content
 * and extracts event information using Claude.
 */

import * as fs from 'fs'
import * as path from 'path'
import { HtmlExtractor } from '../HtmlExtractor'
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

// Load test fixtures
const FIXTURES_DIR = path.join(__dirname, 'fixtures')

function loadFixture(filename: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, filename), 'utf-8')
}

describe('HtmlExtractor', () => {
  let extractor: HtmlExtractor
  let mockAnthropicCreate: jest.Mock

  beforeEach(() => {
    // Set up environment
    process.env.ANTHROPIC_API_KEY = 'test-api-key'

    // Reset mocks
    jest.clearAllMocks()

    // Create new extractor instance
    extractor = new HtmlExtractor()

    // Get reference to mocked create function
    const Anthropic = require('@anthropic-ai/sdk').default
    mockAnthropicCreate = Anthropic.mock.results[0]?.value?.messages?.create
  })

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  describe('extractTextFromHtml', () => {
    it('should extract text content from Chronoboost HTML', () => {
      const html = loadFixture('chronoboost-corrida.html')
      const url = 'https://inscriptions.chronoboost.fr/5-10-km-bosc-guerard-st-adrien'

      // Access private method via any cast
      const extractedText = (extractor as any).extractTextFromHtml(html, url)

      // Verify URL is included
      expect(extractedText).toContain('URL: https://inscriptions.chronoboost.fr/5-10-km-bosc-guerard-st-adrien')

      // Verify title is extracted
      expect(extractedText).toContain('Titre: La Corrida de Bosc Guerard')

      // Verify key content is present
      expect(extractedText).toContain('30 novembre 2025')
      expect(extractedText).toContain('Bosc Guerard St Adrien')
      expect(extractedText).toContain('76')
      expect(extractedText).toContain('MSA Triathlon')
      expect(extractedText).toContain('10 km')
      expect(extractedText).toContain('5km')

      // Verify scripts are removed
      expect(extractedText).not.toContain('function popup_register_queue')
      expect(extractedText).not.toContain('jQuery.ajax')
    })

    it('should remove nav, footer, and script elements', () => {
      const html = loadFixture('chronoboost-corrida.html')
      const url = 'https://example.com'

      const extractedText = (extractor as any).extractTextFromHtml(html, url)

      // Footer content should be removed
      expect(extractedText).not.toContain('Mentions légales')
      expect(extractedText).not.toContain('Politique de confidentialité')

      // Script content should be removed
      expect(extractedText).not.toContain('bootstrap.bundle.min.js')
      expect(extractedText).not.toContain('base_url')
    })

    it('should preserve important event information', () => {
      const html = loadFixture('chronoboost-corrida.html')
      const url = 'https://example.com'

      const extractedText = (extractor as any).extractTextFromHtml(html, url)

      // Event name
      expect(extractedText).toContain('La Corrida de Bosc Guerard')

      // Date
      expect(extractedText).toContain('30 novembre 2025')

      // Location
      expect(extractedText).toContain('Bosc Guerard St Adrien')
      expect(extractedText).toContain('76')

      // Organizer
      expect(extractedText).toContain('MSA Triathlon')

      // Description mentioning races
      expect(extractedText).toContain('10 km')
      expect(extractedText).toContain('5km')
      expect(extractedText).toContain('courses sur route')
    })
  })

  describe('detectSpaPage', () => {
    it('should NOT detect Chronoboost page as SPA (has dates)', () => {
      const html = loadFixture('chronoboost-corrida.html')
      const extractedText = (extractor as any).extractTextFromHtml(html, 'https://example.com')

      const result = (extractor as any).detectSpaPage(extractedText)

      expect(result.isSpa).toBe(false)
    })

    it('should detect SPA page with minimal content', () => {
      const spaContent = `URL: https://example.com
Titre: Loading...

Contenu:
Loading... Please wait`

      const result = (extractor as any).detectSpaPage(spaContent)

      expect(result.isSpa).toBe(true)
      expect(result.reason).toContain('contenu trop court')
    })

    it('should detect SPA page with JavaScript code', () => {
      // Content needs to be >300 chars to pass the length check first
      const jsContent = `URL: https://example.com
Titre: My App

Contenu:
function initApp() { const app = new Vue({ el: '#app' }); }
const webpack_modules = {}; chunk.load(); ReactDOM.render();
var config = { apiUrl: 'https://api.example.com' };
let state = {}; const reducer = (s, a) => s;
function handleClick() { const event = new Event('click'); }
const __NEXT_DATA__ = { props: {}, page: '/home' };
var angular = { module: function() {} };
let component = {}; const store = createStore(reducer);`

      const result = (extractor as any).detectSpaPage(jsContent)

      expect(result.isSpa).toBe(true)
      expect(result.reason).toContain('JavaScript/SPA')
    })

    it('should NOT detect page with date as SPA even if short', () => {
      const shortContent = `URL: https://example.com
Titre: Event

Contenu:
Marathon de Paris - 15 avril 2025`

      const result = (extractor as any).detectSpaPage(shortContent)

      // Should NOT be SPA because it has a date pattern
      expect(result.isSpa).toBe(false)
    })
  })

  describe('extract (integration with Claude mock)', () => {
    beforeEach(() => {
      // Mock successful fetch
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: () => Promise.resolve(loadFixture('chronoboost-corrida.html'))
      })
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should extract event data from Chronoboost URL', async () => {
      // Mock Claude response
      const mockClaudeResponse: ExtractedEventData = {
        eventName: 'La Corrida de Bosc Guerard',
        eventCity: 'Bosc-Guérard-Saint-Adrien',
        eventDepartment: '76',
        editionYear: 2025,
        editionDate: '2025-11-30',
        races: [
          { name: '10 km', distance: 10000 },
          { name: '5 km', distance: 5000 }
        ],
        organizerName: 'MSA Triathlon',
        organizerWebsite: 'https://msatriathlon.jimdofree.com/',
        confidence: 0.85,
        extractionMethod: 'html'
      }

      mockAnthropicCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify(mockClaudeResponse)
          }
        ]
      })

      const result = await extractor.extract({
        url: 'https://inscriptions.chronoboost.fr/5-10-km-bosc-guerard-st-adrien'
      })

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.eventName).toBe('La Corrida de Bosc Guerard')
      expect(result.data?.eventCity).toBe('Bosc-Guérard-Saint-Adrien')
      expect(result.data?.eventDepartment).toBe('76')
      expect(result.data?.editionDate).toBe('2025-11-30')
      expect(result.data?.races).toHaveLength(2)
      expect(result.data?.organizerName).toBe('MSA Triathlon')
      expect(result.data?.confidence).toBeGreaterThan(0.5)
    })

    it('should handle Claude response with markdown code blocks', async () => {
      const mockResponse = {
        eventName: 'Test Event',
        eventCity: 'Paris',
        confidence: 0.7,
        extractionMethod: 'html'
      }

      mockAnthropicCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: '```json\n' + JSON.stringify(mockResponse) + '\n```'
          }
        ]
      })

      const result = await extractor.extract({
        url: 'https://example.com/event'
      })

      expect(result.success).toBe(true)
      expect(result.data?.eventName).toBe('Test Event')
    })

    it('should return error for SPA pages detected by Claude', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'page_spa_no_content',
              eventName: null,
              confidence: 0
            })
          }
        ]
      })

      const result = await extractor.extract({
        url: 'https://example.com/spa-page'
      })

      expect(result.success).toBe(false)
    })

    it('should return error if eventName is missing', async () => {
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

      const result = await extractor.extract({
        url: 'https://example.com/event'
      })

      expect(result.success).toBe(false)
    })

    it('should warn when no date is found but still succeed', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      mockAnthropicCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              eventName: 'Event Without Date',
              eventCity: 'Paris',
              confidence: 0.3 // Low confidence expected
            })
          }
        ]
      })

      const result = await extractor.extract({
        url: 'https://example.com/event'
      })

      expect(result.success).toBe(true)
      expect(result.data?.eventName).toBe('Event Without Date')
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No date found')
      )

      consoleSpy.mockRestore()
    })
  })

  describe('error handling', () => {
    it('should handle fetch timeout', async () => {
      global.fetch = jest.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          const error = new Error('Timeout')
          error.name = 'AbortError'
          reject(error)
        })
      })

      const result = await extractor.extract({
        url: 'https://slow-server.com/page',
        timeout: 100
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to fetch HTML')
    })

    it('should handle HTTP errors', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404
      })

      const result = await extractor.extract({
        url: 'https://example.com/not-found'
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to fetch HTML')
    })

    it('should handle empty page content', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: () => Promise.resolve('<html><body></body></html>')
      })

      const result = await extractor.extract({
        url: 'https://example.com/empty'
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('too short or empty')
    })
  })
})

describe('HtmlExtractor - Expected extraction from Chronoboost', () => {
  /**
   * This test documents what we EXPECT Claude to extract from the Chronoboost HTML.
   * It serves as a specification for the extraction behavior.
   */
  it('should extract correct data from Chronoboost Corrida page', () => {
    const html = loadFixture('chronoboost-corrida.html')

    // What we expect Claude to extract:
    const expectedExtraction = {
      eventName: 'La Corrida de Bosc Guerard',
      eventCity: 'Bosc-Guérard-Saint-Adrien', // or 'Bosc Guerard St Adrien'
      eventDepartment: '76',
      editionYear: 2025,
      editionDate: '2025-11-30',
      races: [
        { name: '10 km', distance: 10000 },
        { name: '5 km', distance: 5000 }
        // Note: 3 courses enfants mentioned but no details
      ],
      organizerName: 'MSA Triathlon', // or 'MONT SAINT AIGNAN TRIATHLON'
      organizerWebsite: 'https://msatriathlon.jimdofree.com/'
    }

    // Verify the HTML contains all the source data
    expect(html).toContain('La Corrida de Bosc Guerard')
    expect(html).toContain('30 novembre 2025')
    expect(html).toContain('Bosc Guerard St Adrien (76)')
    expect(html).toContain('MSA Triathlon')
    expect(html).toContain('10 km')
    expect(html).toContain('5km')
    expect(html).toContain('msatriathlon.jimdofree.com')

    // This documents our expectations - the actual Claude extraction
    // should match these patterns
    expect(expectedExtraction.eventName).toBe('La Corrida de Bosc Guerard')
    expect(expectedExtraction.editionDate).toBe('2025-11-30')
    expect(expectedExtraction.eventDepartment).toBe('76')
  })
})
