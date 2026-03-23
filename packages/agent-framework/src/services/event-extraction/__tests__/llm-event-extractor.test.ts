import { LLMEventExtractor } from '../llm-event-extractor'
import Anthropic from '@anthropic-ai/sdk'

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk')

const silentLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

function createMockResponse(toolInput: Record<string, any>) {
  return {
    content: [
      {
        type: 'tool_use',
        id: 'test',
        name: 'extract_event_data',
        input: toolInput,
      },
    ],
  }
}

describe('LLMEventExtractor', () => {
  let mockCreate: jest.Mock

  beforeEach(() => {
    mockCreate = jest.fn()
    ;(Anthropic as unknown as jest.Mock).mockImplementation(() => ({
      messages: { create: mockCreate },
    }))
  })

  it('extracts event data from HTML', async () => {
    mockCreate.mockResolvedValue(
      createMockResponse({
        eventName: '24h Les Echelles',
        eventCity: 'Les Echelles',
        editionYear: 2026,
        editionDate: '2026-04-04',
        races: [
          {
            name: '24h en équipe',
            distance: 0,
            price: 90,
            startTime: '11:00',
            description: 'Relais 24h en équipe de 2, boucle de 4.4km',
            categoryLevel1: 'RUNNING',
          },
        ],
        organizerName: 'SPORT NATURE MOUVEMENT',
        organizerEmail: '24hlesechelles@gmail.com',
        confidence: 0.9,
      })
    )

    const extractor = new LLMEventExtractor({
      apiKey: 'test-key',
      logger: silentLogger,
    })

    const result = await extractor.extract({ type: 'html', content: '<div>test</div>' })

    expect(result.success).toBe(true)
    expect(result.data?.eventName).toBe('24h Les Echelles')
    expect(result.data?.races?.[0].price).toBe(90)
    expect(result.data?.races?.[0].distance).toBe(0)
    expect(result.data?.races?.[0].description).toContain('4.4km')
  })

  it('returns error on API failure', async () => {
    mockCreate.mockRejectedValue(new Error('API timeout'))

    const extractor = new LLMEventExtractor({
      apiKey: 'test-key',
      logger: silentLogger,
    })

    const result = await extractor.extract({ type: 'html', content: '<div>test</div>' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('API timeout')
  })

  it('returns error when no tool_use block in response', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'hello' }] })

    const extractor = new LLMEventExtractor({
      apiKey: 'test-key',
      logger: silentLogger,
    })

    const result = await extractor.extract({ type: 'html', content: '<div>test</div>' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('tool_use')
  })

  it('preprocesses HTML with cssSelector option', async () => {
    mockCreate.mockResolvedValue(
      createMockResponse({ eventName: 'Test', confidence: 0.8 })
    )

    const extractor = new LLMEventExtractor({
      apiKey: 'test-key',
      logger: silentLogger,
    })

    const html = '<nav>menu</nav><section id="epreuves"><p>10km trail</p></section>'
    await extractor.extract(
      { type: 'html', content: html },
      { cssSelector: '#epreuves' }
    )

    // Verify the prompt sent to Anthropic doesn't contain the nav
    const callArgs = mockCreate.mock.calls[0][0]
    const userMessage = callArgs.messages[0].content
    expect(userMessage).not.toContain('menu')
    expect(userMessage).toContain('10km trail')
  })

  it('passes context to prompt', async () => {
    mockCreate.mockResolvedValue(
      createMockResponse({ eventName: 'Test', confidence: 0.8 })
    )

    const extractor = new LLMEventExtractor({
      apiKey: 'test-key',
      logger: silentLogger,
    })

    await extractor.extract(
      { type: 'html', content: '<div>test</div>' },
      { context: 'Page FFA compétition départementale' }
    )

    const callArgs = mockCreate.mock.calls[0][0]
    const userMessage = callArgs.messages[0].content
    expect(userMessage).toContain('Page FFA')
  })
})
