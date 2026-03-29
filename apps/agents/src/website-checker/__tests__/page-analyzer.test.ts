import { analyzePage, buildAnalysisPrompt } from '../page-analyzer'
import type { EditionTarget } from '../types'

// Mock Anthropic
const mockCreate = jest.fn()
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}))

const sampleTarget: EditionTarget = {
  editionId: 40001,
  eventId: 13001,
  eventName: 'Marathon de Lyon',
  eventCity: 'Lyon',
  editionYear: '2026',
  startDate: new Date('2026-04-15'),
  urls: [],
}

describe('buildAnalysisPrompt', () => {
  it('includes event name, city, year, and expected date', () => {
    const prompt = buildAnalysisPrompt(sampleTarget, 'Page content about marathon')

    expect(prompt).toContain('Marathon de Lyon')
    expect(prompt).toContain('Lyon')
    expect(prompt).toContain('2026')
    expect(prompt).toContain('15')  // day from startDate
    expect(prompt).toContain('Page content about marathon')
  })

  it('handles missing startDate gracefully', () => {
    const targetNoDate = { ...sampleTarget, startDate: null }
    const prompt = buildAnalysisPrompt(targetNoDate, 'Content')

    expect(prompt).toContain('Marathon de Lyon')
    expect(prompt).toContain('2026')
    expect(prompt).not.toContain('undefined')
  })
})

describe('analyzePage', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it('returns structured analysis from LLM tool_use response', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'tool_use',
        name: 'analyze_edition_status',
        input: {
          confirmed: true,
          canceled: false,
          registrationOpen: true,
          startDate: '2026-04-15',
          endDate: null,
          datesFound: ['2026-04-15'],
          yearMentioned: true,
          confidence: 0.95,
          reasoning: 'Registration page for 2026 edition is live with open inscriptions',
        },
      }],
    })

    const result = await analyzePage(
      'Inscriptions Marathon de Lyon 2026 ouvertes',
      sampleTarget,
      { apiKey: 'test-key' }
    )

    expect(result).not.toBeNull()
    expect(result!.confirmed).toBe(true)
    expect(result!.registrationOpen).toBe(true)
    expect(result!.startDate).toBe('2026-04-15')
    expect(result!.endDate).toBeNull()
    expect(result!.confidence).toBe(0.95)
  })

  it('returns null when LLM returns no tool_use block', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'I cannot analyze this.' }],
    })

    const result = await analyzePage(
      'Some content',
      sampleTarget,
      { apiKey: 'test-key' }
    )

    expect(result).toBeNull()
  })

  it('returns null on LLM error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API rate limit'))

    const result = await analyzePage(
      'Some content',
      sampleTarget,
      { apiKey: 'test-key' }
    )

    expect(result).toBeNull()
  })
})
