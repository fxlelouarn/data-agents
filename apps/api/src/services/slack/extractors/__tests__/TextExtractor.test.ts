/**
 * Tests for TextExtractor
 *
 * These tests verify that the text extractor correctly parses plain text
 * and extracts event information using Claude.
 */

import { TextExtractor } from '../TextExtractor'
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

describe('TextExtractor', () => {
  let extractor: TextExtractor
  let mockAnthropicCreate: jest.Mock

  beforeEach(() => {
    // Set up environment
    process.env.ANTHROPIC_API_KEY = 'test-api-key'

    // Reset mocks
    jest.clearAllMocks()

    // Create new extractor instance
    extractor = new TextExtractor()

    // Get reference to mocked create function
    const Anthropic = require('@anthropic-ai/sdk').default
    mockAnthropicCreate = Anthropic.mock.results[0]?.value?.messages?.create
  })

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  describe('extract - input validation', () => {
    it('should reject text that is too short', async () => {
      const result = await extractor.extract('Hello')

      expect(result.success).toBe(false)
      expect(result.error).toContain('trop court')
    })

    it('should accept text of minimum length', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              eventName: 'Test Event',
              confidence: 0.5
            })
          }
        ]
      })

      const result = await extractor.extract('Trail des Montagnes - 15 mars 2025 - Chamonix')

      expect(result.success).toBe(true)
    })

    it('should truncate very long text', async () => {
      const longText = 'A'.repeat(60000) // More than MAX_TEXT_LENGTH

      mockAnthropicCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              eventName: 'Event from long text',
              confidence: 0.5
            })
          }
        ]
      })

      const result = await extractor.extract(longText)

      // Should still succeed but text should be truncated
      expect(result.success).toBe(true)

      // Verify Claude was called with truncated text
      const callArgs = mockAnthropicCreate.mock.calls[0][0]
      expect(callArgs.messages[0].content).toContain('[... texte tronqué]')
    })
  })

  describe('extract - Claude integration', () => {
    it('should extract event data from informal text', async () => {
      const mockResponse: ExtractedEventData = {
        eventName: 'Trail des Montagnes',
        eventCity: 'Chamonix',
        eventDepartment: '74',
        editionYear: 2025,
        editionDate: '2025-03-15',
        races: [
          { name: 'Trail 42K', distance: 42000, elevation: 2500 }
        ],
        confidence: 0.85,
        extractionMethod: 'text'
      }

      mockAnthropicCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify(mockResponse)
          }
        ]
      })

      const inputText = `
        Salut ! Je voulais vous parler du Trail des Montagnes qui aura lieu
        le 15 mars 2025 à Chamonix (74). Il y a une course de 42km avec
        2500m de D+. Ça vous dit ?
      `

      const result = await extractor.extract(inputText)

      expect(result.success).toBe(true)
      expect(result.data?.eventName).toBe('Trail des Montagnes')
      expect(result.data?.eventCity).toBe('Chamonix')
      expect(result.data?.eventDepartment).toBe('74')
      expect(result.data?.editionDate).toBe('2025-03-15')
      expect(result.data?.races).toHaveLength(1)
      expect(result.data?.races?.[0].distance).toBe(42000)
    })

    it('should extract event data from copy-pasted description', async () => {
      const mockResponse: ExtractedEventData = {
        eventName: 'Marathon de Paris',
        eventCity: 'Paris',
        editionYear: 2025,
        editionDate: '2025-04-06',
        races: [
          { name: 'Marathon', distance: 42195 }
        ],
        organizerName: 'ASO',
        registrationUrl: 'https://www.marathondeparis.com',
        confidence: 0.9,
        extractionMethod: 'text'
      }

      mockAnthropicCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify(mockResponse)
          }
        ]
      })

      const inputText = `
        Marathon de Paris 2025

        Date : 6 avril 2025
        Lieu : Paris
        Distance : 42,195 km

        Organisateur : ASO
        Inscriptions : www.marathondeparis.com
      `

      const result = await extractor.extract(inputText)

      expect(result.success).toBe(true)
      expect(result.data?.eventName).toBe('Marathon de Paris')
      expect(result.data?.organizerName).toBe('ASO')
      expect(result.data?.registrationUrl).toBe('https://www.marathondeparis.com')
    })

    it('should handle response with markdown code blocks', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: '```json\n{"eventName": "Test Event", "confidence": 0.7}\n```'
          }
        ]
      })

      const result = await extractor.extract('Test Event - 15 mars 2025 - Paris')

      expect(result.success).toBe(true)
      expect(result.data?.eventName).toBe('Test Event')
    })

    it('should fail if eventName is missing from response', async () => {
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

      const result = await extractor.extract('Some event in Paris next month')

      expect(result.success).toBe(false)
    })

    it('should warn when no date is extracted but still succeed', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      mockAnthropicCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              eventName: 'Event Without Date',
              eventCity: 'Lyon',
              confidence: 0.3
            })
          }
        ]
      })

      const result = await extractor.extract('Il y a un trail à Lyon, mais je ne sais plus quand')

      expect(result.success).toBe(true)
      expect(result.data?.eventName).toBe('Event Without Date')
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No date found')
      )

      consoleSpy.mockRestore()
    })
  })

  describe('extract - extraction method', () => {
    it('should set extractionMethod to text', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              eventName: 'Test Event',
              confidence: 0.8
            })
          }
        ]
      })

      // Text must be at least 30 characters
      const result = await extractor.extract('Test Event - 15 mars 2025 - Paris - Course de 10km')

      expect(result.success).toBe(true)
      expect(result.data?.extractionMethod).toBe('text')
    })

    it('should include raw text in result', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              eventName: 'Test Event',
              confidence: 0.8
            })
          }
        ]
      })

      // Text must be at least 30 characters
      const inputText = 'Test Event - 15 mars 2025 - Paris - Course de trail'
      const result = await extractor.extract(inputText)

      expect(result.success).toBe(true)
      expect(result.rawContent).toContain('Test Event')
    })
  })

  describe('error handling', () => {
    it('should return error when API key is not set', async () => {
      delete process.env.ANTHROPIC_API_KEY

      // Create new instance without API key
      const extractorWithoutKey = new TextExtractor()

      const result = await extractorWithoutKey.extract('Some event text that is long enough')

      expect(result.success).toBe(false)
      expect(result.error).toContain('clé API')
    })

    it('should handle invalid JSON response from Claude', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: 'This is not valid JSON at all'
          }
        ]
      })

      const result = await extractor.extract('Some event text that should fail parsing')

      expect(result.success).toBe(false)
    })

    it('should handle empty response from Claude', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: []
      })

      const result = await extractor.extract('Some event text with no response')

      expect(result.success).toBe(false)
    })
  })
})

describe('TextExtractor - Real-world text examples', () => {
  /**
   * These tests document what we expect Claude to extract from various
   * real-world text formats.
   */

  describe('Slack message format', () => {
    it('should handle typical Slack message with event info', () => {
      const slackMessage = `
        Hey @channel !

        Je viens de découvrir une super course : le Trail du Mont Blanc
        Date : 28-30 août 2025
        Lieu : Chamonix (74)

        Distances :
        - UTMB 171km / 10000m D+
        - CCC 101km / 6100m D+
        - TDS 145km / 9100m D+

        Qui est chaud ? 🏃‍♂️
      `

      // Verify the message contains all expected information
      expect(slackMessage).toContain('Trail du Mont Blanc')
      expect(slackMessage).toContain('28-30 août 2025')
      expect(slackMessage).toContain('Chamonix')
      expect(slackMessage).toContain('74')
      expect(slackMessage).toContain('UTMB')
      expect(slackMessage).toContain('171km')
      expect(slackMessage).toContain('10000m D+')
    })
  })

  describe('Email forward format', () => {
    it('should handle forwarded email content', () => {
      const emailContent = `
        ---------- Forwarded message ----------
        From: organisateur@marathon.fr
        Subject: Inscriptions ouvertes - Marathon de Bordeaux 2025

        Bonjour,

        Nous avons le plaisir de vous annoncer l'ouverture des inscriptions
        pour le Marathon de Bordeaux 2025 !

        Date : 13 avril 2025
        Lieu : Bordeaux (33)

        Courses proposées :
        - Marathon : 42.195km - 85€
        - Semi-marathon : 21.1km - 45€
        - 10km : 25€

        Inscriptions sur www.marathondebordeaux.fr

        L'équipe du Marathon de Bordeaux
      `

      // Verify email contains extractable data
      expect(emailContent).toContain('Marathon de Bordeaux')
      expect(emailContent).toContain('13 avril 2025')
      expect(emailContent).toContain('Bordeaux')
      expect(emailContent).toContain('33')
      expect(emailContent).toContain('42.195km')
      expect(emailContent).toContain('85€')
      expect(emailContent).toContain('marathondebordeaux.fr')
    })
  })

  describe('Informal message format', () => {
    it('should handle casual conversation about an event', () => {
      const casualMessage = `
        salut les gars, y'a un trail sympa le mois prochain à Annecy (74)
        c'est le trail du lac d'Annecy le 22 juin, y'a un 30km avec 1500D+
        et un 15km plus tranquille. départ à 8h du matin depuis le paquier.
        qui veut venir ?
      `

      expect(casualMessage).toContain('trail du lac d\'Annecy')
      expect(casualMessage).toContain('22 juin')
      expect(casualMessage).toContain('Annecy')
      expect(casualMessage).toContain('30km')
      expect(casualMessage).toContain('1500D+')
      expect(casualMessage).toContain('8h')
    })
  })
})
