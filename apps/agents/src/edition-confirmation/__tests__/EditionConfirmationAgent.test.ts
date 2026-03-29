/**
 * Integration tests for EditionConfirmationAgent
 *
 * Mocks all external dependencies (fetch, Anthropic, database) and verifies
 * the agent's behavior end-to-end through its run() method.
 */

// --- Mocks (must be before imports) ---

// Mock @data-agents/types to avoid ESM `.js` extension resolution issues
jest.mock('@data-agents/types', () => ({
  AGENT_VERSIONS: { EDITION_CONFIRMATION_AGENT: '1.0.0' },
  getAgentName: jest.fn().mockReturnValue('Edition Confirmation Agent'),
  EditionConfirmationAgentConfigSchema: {},
}))

const mockAxiosGet = jest.fn()
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: mockAxiosGet },
  AxiosError: class AxiosError extends Error {
    code?: string
    constructor(message: string, code?: string) {
      super(message)
      this.code = code
      this.name = 'AxiosError'
    }
  },
}))

const mockCreate = jest.fn()
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}))

const mockPrisma = {
  proposal: { findFirst: jest.fn().mockResolvedValue(null) },
}
const mockStateService = {
  getState: jest.fn().mockResolvedValue(null),
  setState: jest.fn().mockResolvedValue(undefined),
}
jest.mock('@data-agents/database', () => ({
  prisma: mockPrisma,
  AgentStateService: jest.fn().mockImplementation(() => mockStateService),
  IAgentStateService: {},
}))

// Mock @data-agents/agent-framework to avoid deep import chain with .js extensions
const mockBaseAgent = class {
  config: any
  constructor(config: any) { this.config = config }
  async connectToSource() { return {} }
  async closeSourceConnections() {}
  async createProposal(...args: any[]) { return { id: 'mock-proposal' } }
  protected async getDb() { return {} }
}
jest.mock('@data-agents/agent-framework', () => ({
  BaseAgent: mockBaseAgent,
  AgentType: { EXTRACTOR: 'EXTRACTOR' },
}))

// --- Imports (after mocks) ---

import { EditionConfirmationAgent } from '../../EditionConfirmationAgent'

// --- Helpers ---

function makeLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }
}

function makeContext() {
  return { logger: makeLogger() }
}

function makeAgent(overrides: Record<string, any> = {}) {
  return new EditionConfirmationAgent({
    id: 'test-edition-agent',
    name: 'Test Edition Confirmation Agent',
    config: {
      sourceDatabase: 'test-source-db',
      batchSize: 10,
      cooldownDays: 14,
      lookAheadMonths: 3,
      requestDelayMs: 0, // No delay in tests
      requestTimeoutMs: 5000,
      anthropicApiKey: 'test-anthropic-key',
      llmModel: 'claude-haiku-test',
      dryRun: false,
      ...overrides,
    },
  })
}

/** A future start date (always in the future relative to now) */
function futureDate(daysFromNow = 30): Date {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return d
}

/** Mock sourceDb that returns one edition with an event website URL */
function makeSourceDb(editions: any[] = []) {
  return {
    edition: {
      findMany: jest.fn().mockResolvedValue(editions),
    },
  }
}

/** Build a minimal edition row as returned by sourceDb.edition.findMany */
function makeEdition(overrides: Partial<any> = {}) {
  return {
    id: 40001,
    year: 2026,
    calendarStatus: 'TO_BE_CONFIRMED',
    startDate: futureDate(30),
    event: {
      id: 13001,
      name: 'Marathon de Lyon',
      city: 'Lyon',
      websiteUrl: 'https://marathon-lyon.fr',
    },
    editionPartners: [],
    ...overrides,
  }
}

/** Mount agent with mocked sourceDb and skip real DB connection */
function mountAgent(agent: EditionConfirmationAgent, sourceDb: any) {
  ;(agent as any).sourceDb = sourceDb
  ;(agent as any).initializeSourceConnection = jest.fn().mockResolvedValue(undefined)
  ;(agent as any).connectToSource = jest.fn().mockResolvedValue(sourceDb)
  ;(agent as any).closeSourceConnections = jest.fn().mockResolvedValue(undefined)
}

// --- Tests ---

describe('EditionConfirmationAgent', () => {
  let createProposalSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    // Reset state service to no saved progress (fresh start)
    mockStateService.getState.mockResolvedValue(null)
    mockStateService.setState.mockResolvedValue(undefined)
    // Reset deduplication: no existing proposals
    mockPrisma.proposal.findFirst.mockResolvedValue(null)
  })

  // ---------------------------------------------------------------------------
  // 1. Early return when no editions to check
  // ---------------------------------------------------------------------------

  describe('when no editions to check', () => {
    it('returns success and resets offset', async () => {
      const agent = makeAgent()
      const sourceDb = makeSourceDb([]) // empty result
      mountAgent(agent, sourceDb)

      const context = makeContext()
      const result = await agent.run(context as any)

      expect(result.success).toBe(true)
      expect(result.message).toContain('recommence du début')

      // Offset must be reset to 0
      const savedProgress = mockStateService.setState.mock.calls.find(
        ([, key]: [any, string]) => key === 'progress'
      )
      expect(savedProgress).toBeDefined()
      expect(savedProgress![2].lastOffset).toBe(0)
    })

    it('does not call createProposal', async () => {
      const agent = makeAgent()
      const createProposalMock = jest.fn()
      ;(agent as any).createProposal = createProposalMock
      mountAgent(agent, makeSourceDb([]))

      await agent.run(makeContext() as any)

      expect(createProposalMock).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // 2. Creates EDITION_UPDATE/CONFIRMED proposal when URL confirms edition
  // ---------------------------------------------------------------------------

  describe('when URL confirms the edition', () => {
    beforeEach(() => {
      // axios returns 200 with HTML confirming the edition
      mockAxiosGet.mockResolvedValue({
        status: 200,
        data: `<html><body>
            <h1>Marathon de Lyon 2026</h1>
            <p>Inscriptions ouvertes ! L'édition 2026 aura lieu le 15 avril 2026.</p>
            <a href="/inscription">S'inscrire maintenant</a>
          </body></html>`,
      })

      // LLM returns confirmed=true
      mockCreate.mockResolvedValue({
        content: [
          {
            type: 'tool_use',
            name: 'analyze_edition_status',
            input: {
              confirmed: true,
              canceled: false,
              registrationOpen: true,
              datesFound: ['2026-04-15'],
              yearMentioned: true,
              confidence: 0.95,
              reasoning: "Registration page for 2026 edition is live with open inscriptions",
            },
          },
        ],
      })
    })

    it('creates an EDITION_UPDATE proposal with CONFIRMED status', async () => {
      const agent = makeAgent()
      const createProposalMock = jest.fn().mockResolvedValue({ id: 'prop-1' })
      ;(agent as any).createProposal = createProposalMock
      mountAgent(agent, makeSourceDb([makeEdition()]))

      const result = await agent.run(makeContext() as any)

      expect(result.success).toBe(true)
      expect(createProposalMock).toHaveBeenCalledTimes(1)

      const [type, changes, , eventId, editionId] = createProposalMock.mock.calls[0]
      expect(type).toBe('EDITION_UPDATE')
      expect(changes.calendarStatus.old).toBe('TO_BE_CONFIRMED')
      expect(changes.calendarStatus.new).toBe('CONFIRMED')

      // IDs must be strings
      expect(typeof eventId).toBe('string')
      expect(typeof editionId).toBe('string')
      expect(eventId).toBe('13001')
      expect(editionId).toBe('40001')
    })

    it('includes confirmation metadata in justification', async () => {
      const agent = makeAgent()
      const createProposalMock = jest.fn().mockResolvedValue({ id: 'prop-1' })
      ;(agent as any).createProposal = createProposalMock
      mountAgent(agent, makeSourceDb([makeEdition()]))

      await agent.run(makeContext() as any)

      const [, , justification] = createProposalMock.mock.calls[0]
      expect(justification).toHaveLength(1)
      expect(justification[0].type).toBe('url_analysis')
      expect(justification[0].metadata.eventName).toBe('Marathon de Lyon')
    })

    it('saves cooldown after processing', async () => {
      const agent = makeAgent()
      ;(agent as any).createProposal = jest.fn().mockResolvedValue({ id: 'prop-1' })
      mountAgent(agent, makeSourceDb([makeEdition()]))

      await agent.run(makeContext() as any)

      const cooldownCall = mockStateService.setState.mock.calls.find(
        ([, key]: [any, string]) => key === 'cooldown:40001'
      )
      expect(cooldownCall).toBeDefined()
    })
  })

  // ---------------------------------------------------------------------------
  // 3. Creates EVENT_UPDATE proposal for dead event URL (DNS failure)
  // ---------------------------------------------------------------------------

  describe('when event URL is dead (DNS failure)', () => {
    beforeEach(() => {
      // axios throws DNS failure
      const dnsErr = new Error('getaddrinfo ENOTFOUND marathon-lyon.fr') as any
      dnsErr.code = 'ENOTFOUND'
      mockAxiosGet.mockRejectedValue(dnsErr)
    })

    it('creates an EVENT_UPDATE proposal with null websiteUrl', async () => {
      const agent = makeAgent()
      const createProposalMock = jest.fn().mockResolvedValue({ id: 'prop-dead' })
      ;(agent as any).createProposal = createProposalMock
      mountAgent(agent, makeSourceDb([makeEdition()]))

      const result = await agent.run(makeContext() as any)

      expect(result.success).toBe(true)
      expect(createProposalMock).toHaveBeenCalledTimes(1)

      const [type, changes, justification, eventId, editionId, , confidence] =
        createProposalMock.mock.calls[0]

      expect(type).toBe('EVENT_UPDATE')
      expect(changes.websiteUrl.old).toBe('https://marathon-lyon.fr')
      expect(changes.websiteUrl.new).toBeNull()
      expect(confidence).toBe(1.0)

      // eventId as string, editionId undefined for EVENT_UPDATE
      expect(typeof eventId).toBe('string')
      expect(eventId).toBe('13001')
      expect(editionId).toBeUndefined()

      // Justification
      expect(justification[0].type).toBe('dead_url')
      expect(justification[0].metadata.errorReason).toBe('DNS_FAILURE')
    })

    it('does not create EDITION_UPDATE when URL is dead and no analysis', async () => {
      const agent = makeAgent()
      const createProposalMock = jest.fn().mockResolvedValue({ id: 'prop-dead' })
      ;(agent as any).createProposal = createProposalMock
      mountAgent(agent, makeSourceDb([makeEdition()]))

      await agent.run(makeContext() as any)

      // Only EVENT_UPDATE, no EDITION_UPDATE
      const editionUpdateCalls = createProposalMock.mock.calls.filter(
        ([type]: [string]) => type === 'EDITION_UPDATE'
      )
      expect(editionUpdateCalls).toHaveLength(0)
    })
  })

  // ---------------------------------------------------------------------------
  // 4. Skips editions in cooldown
  // ---------------------------------------------------------------------------

  describe('when edition is in cooldown', () => {
    it('does not create any proposals', async () => {
      // Return a recent cooldown date (yesterday = within cooldown)
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)

      mockStateService.getState.mockImplementation(
        (_agentId: string, key: string) => {
          if (key === 'cooldown:40001') {
            return Promise.resolve(yesterday.toISOString())
          }
          return Promise.resolve(null)
        }
      )

      const agent = makeAgent({ cooldownDays: 14 })
      const createProposalMock = jest.fn()
      ;(agent as any).createProposal = createProposalMock
      mountAgent(agent, makeSourceDb([makeEdition()]))

      const result = await agent.run(makeContext() as any)

      expect(result.success).toBe(true)
      expect(createProposalMock).not.toHaveBeenCalled()
    })

    it('processes editions whose cooldown has expired', async () => {
      // 30 days ago = outside cooldown window of 14 days
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      mockStateService.getState.mockImplementation(
        (_agentId: string, key: string) => {
          if (key === 'cooldown:40001') {
            return Promise.resolve(thirtyDaysAgo.toISOString())
          }
          return Promise.resolve(null)
        }
      )

      // URL returns 200 and LLM confirms
      mockAxiosGet.mockResolvedValue({
        status: 200,
        data: '<html><body>Edition 2026 confirmed</body></html>',
      })
      mockCreate.mockResolvedValue({
        content: [
          {
            type: 'tool_use',
            name: 'analyze_edition_status',
            input: {
              confirmed: true,
              canceled: false,
              registrationOpen: false,
              datesFound: [],
              yearMentioned: true,
              confidence: 0.85,
              reasoning: 'Edition is confirmed',
            },
          },
        ],
      })

      const agent = makeAgent({ cooldownDays: 14 })
      const createProposalMock = jest.fn().mockResolvedValue({ id: 'prop-1' })
      ;(agent as any).createProposal = createProposalMock
      mountAgent(agent, makeSourceDb([makeEdition()]))

      await agent.run(makeContext() as any)

      expect(createProposalMock).toHaveBeenCalledTimes(1)
    })
  })

  // ---------------------------------------------------------------------------
  // 5. Respects dryRun mode
  // ---------------------------------------------------------------------------

  describe('when dryRun is true', () => {
    it('does not create any proposals even with confirmed URL', async () => {
      // URL confirms the edition
      mockAxiosGet.mockResolvedValue({
        status: 200,
        data: '<html><body>Marathon de Lyon 2026 - Inscriptions ouvertes</body></html>',
      })
      mockCreate.mockResolvedValue({
        content: [
          {
            type: 'tool_use',
            name: 'analyze_edition_status',
            input: {
              confirmed: true,
              canceled: false,
              registrationOpen: true,
              datesFound: ['2026-04-15'],
              yearMentioned: true,
              confidence: 0.95,
              reasoning: 'Registration open for 2026',
            },
          },
        ],
      })

      const agent = makeAgent({ dryRun: true })
      const createProposalMock = jest.fn()
      ;(agent as any).createProposal = createProposalMock
      mountAgent(agent, makeSourceDb([makeEdition()]))

      const result = await agent.run(makeContext() as any)

      expect(result.success).toBe(true)
      expect(createProposalMock).not.toHaveBeenCalled()
    })

    it('does not create dead URL proposals in dryRun mode', async () => {
      const dnsErr = new Error('getaddrinfo ENOTFOUND marathon-lyon.fr') as any
      dnsErr.code = 'ENOTFOUND'
      mockAxiosGet.mockRejectedValue(dnsErr)

      const agent = makeAgent({ dryRun: true })
      const createProposalMock = jest.fn()
      ;(agent as any).createProposal = createProposalMock
      mountAgent(agent, makeSourceDb([makeEdition()]))

      await agent.run(makeContext() as any)

      expect(createProposalMock).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // 6. Deduplication: skips if PENDING proposal already exists
  // ---------------------------------------------------------------------------

  describe('deduplication', () => {
    it('does not create a second EDITION_UPDATE if one is already PENDING', async () => {
      // URL confirms the edition
      mockAxiosGet.mockResolvedValue({
        status: 200,
        data: '<html><body>2026 confirmed</body></html>',
      })
      mockCreate.mockResolvedValue({
        content: [
          {
            type: 'tool_use',
            name: 'analyze_edition_status',
            input: {
              confirmed: true,
              canceled: false,
              registrationOpen: false,
              datesFound: [],
              yearMentioned: true,
              confidence: 0.9,
              reasoning: 'Confirmed',
            },
          },
        ],
      })

      // Existing PENDING proposal
      mockPrisma.proposal.findFirst.mockResolvedValue({ id: 'existing-prop' })

      const agent = makeAgent()
      const createProposalMock = jest.fn()
      ;(agent as any).createProposal = createProposalMock
      mountAgent(agent, makeSourceDb([makeEdition()]))

      await agent.run(makeContext() as any)

      expect(createProposalMock).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // 7. Progress tracking
  // ---------------------------------------------------------------------------

  describe('progress tracking', () => {
    it('increments offset after processing a batch', async () => {
      const dnsErr = new Error('getaddrinfo ENOTFOUND example.fr') as any
      dnsErr.code = 'ENOTFOUND'
      mockAxiosGet.mockRejectedValue(dnsErr)

      const editions = [makeEdition({ id: 40001 }), makeEdition({ id: 40002 })]
      const agent = makeAgent({ dryRun: true })
      mountAgent(agent, makeSourceDb(editions))

      await agent.run(makeContext() as any)

      const savedProgress = mockStateService.setState.mock.calls.find(
        ([, key]: [any, string]) => key === 'progress'
      )
      expect(savedProgress).toBeDefined()
      // Started at offset 0, processed 2 editions → next offset = 2
      expect(savedProgress![2].lastOffset).toBe(2)
    })

    it('resumes from saved offset', async () => {
      // Simulate saved progress with offset=10
      mockStateService.getState.mockImplementation(
        (_agentId: string, key: string) => {
          if (key === 'progress') {
            return Promise.resolve({
              lastOffset: 10,
              lastRunAt: new Date().toISOString(),
              stats: {
                totalChecked: 5,
                confirmed: 2,
                canceled: 0,
                inconclusive: 3,
                deadUrls: 0,
                errors: 0,
              },
            })
          }
          return Promise.resolve(null)
        }
      )

      const sourceDb = makeSourceDb([]) // empty → will reset
      const agent = makeAgent()
      mountAgent(agent, sourceDb)

      await agent.run(makeContext() as any)

      // findMany should have been called with skip: 10
      expect(sourceDb.edition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10 })
      )
    })
  })
})
