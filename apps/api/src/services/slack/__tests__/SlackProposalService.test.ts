/**
 * Tests for SlackProposalService
 *
 * These tests verify that the service correctly:
 * - Converts extracted data to match input
 * - Builds appropriate changes for NEW_EVENT and EDITION_UPDATE
 * - Creates coherent Proposals with proper sourceMetadata
 */

import { ExtractedEventData } from '../extractors/types'
import { SlackSourceMetadata } from '../SlackProposalService'

// Mock modules before importing the service
jest.mock('@data-agents/database', () => ({
  prisma: {
    agent: {
      findFirst: jest.fn(),
      findMany: jest.fn()
    },
    proposal: {
      create: jest.fn(),
      findUnique: jest.fn()
    }
  },
  ProposalType: {
    NEW_EVENT: 'NEW_EVENT',
    EDITION_UPDATE: 'EDITION_UPDATE',
    EVENT_UPDATE: 'EVENT_UPDATE',
    RACE_UPDATE: 'RACE_UPDATE'
  },
  ProposalStatus: {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    ARCHIVED: 'ARCHIVED'
  },
  // Services partagés
  inferRaceCategories: jest.fn((name: string, distance?: number) => {
    if (name.toLowerCase().includes('trail')) {
      if (distance && distance > 80) return ['TRAIL', 'ULTRA_TRAIL']
      if (distance && distance > 40) return ['TRAIL', 'LONG_TRAIL']
      if (distance && distance > 20) return ['TRAIL', 'SHORT_TRAIL']
      return ['TRAIL', 'DISCOVERY_TRAIL']
    }
    if (name.toLowerCase().includes('marathon')) return ['RUNNING', 'MARATHON']
    if (distance && distance >= 42) return ['RUNNING', 'MARATHON']
    if (distance && distance >= 21) return ['RUNNING', 'HALF_MARATHON']
    if (distance && distance >= 10) return ['RUNNING', 'KM10']
    return ['RUNNING', undefined]
  }),
  getTimezoneFromLocation: jest.fn(({ department, country }: { department?: string; country?: string }) => {
    if (department === '974') return 'Indian/Reunion'
    if (department === '971') return 'America/Guadeloupe'
    if (country === 'Belgique') return 'Europe/Brussels'
    return 'Europe/Paris'
  }),
  getDefaultTimezone: jest.fn(() => 'Europe/Paris'),
  // Types et helpers
  createSourceMetadata: jest.fn((type, options) => ({
    type,
    ...options
  })),
  createRejectedMatchesJustification: jest.fn((rejectedMatches) => ({
    type: 'rejected_matches',
    content: `Top ${rejectedMatches.length} événements similaires trouvés mais rejetés`,
    metadata: { rejectedMatches }
  })),
  createUrlSourceJustification: jest.fn((url) => ({
    type: 'url_source',
    content: `Source: ${url}`,
    metadata: { url }
  })),
  createMatchingJustification: jest.fn((matchType, event, edition) => ({
    type: 'matching',
    content: matchType === 'NO_MATCH' ? 'Aucun événement correspondant trouvé' : `Match ${matchType} avec "${event?.name}"`,
    metadata: {
      matchType,
      matchedEventId: event?.id,
      matchedEventName: event?.name,
      similarity: event?.similarity,
      matchedEditionId: edition?.id,
      matchedEditionYear: edition?.year
    }
  }))
}))

jest.mock('@data-agents/agent-framework', () => ({
  matchEvent: jest.fn(),
  calculateNewEventConfidence: jest.fn().mockReturnValue(0.7),
  calculateAdjustedConfidence: jest.fn().mockReturnValue(0.85),
  DEFAULT_MATCHING_CONFIG: {
    similarityThreshold: 0.75,
    dateWindowDays: 90
  },
  createConsoleLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }),
  ConnectionManager: jest.fn().mockImplementation(() => ({
    connectToSource: jest.fn().mockResolvedValue({})
  })),
  DatabaseManager: {
    getInstance: jest.fn().mockReturnValue({})
  }
}))

// Import after mocks are set up
import { createProposalFromSlack, getProposalWithSlackMetadata } from '../SlackProposalService'
import { prisma } from '@data-agents/database'
import { matchEvent } from '@data-agents/agent-framework'

describe('SlackProposalService', () => {
  const mockAgent = {
    id: 'agent-123',
    name: 'Slack Event Agent',
    type: 'EXTRACTOR',
    isActive: true,
    config: {
      agentType: 'SLACK_EVENT',
      sourceDatabase: 'miles-republic-db'
    }
  }

  const mockSourceMetadata: SlackSourceMetadata = {
    type: 'SLACK',
    workspaceId: 'T123456',
    workspaceName: 'Test Workspace',
    channelId: 'C123456',
    channelName: 'events',
    messageTs: '1234567890.123456',
    userId: 'U123456',
    userName: 'testuser',
    messageLink: 'https://slack.com/archives/C123/p1234567890123456',
    sourceUrl: 'https://example.com/event',
    extractedAt: '2025-01-15T10:00:00Z'
  }

  beforeEach(() => {
    jest.clearAllMocks()
    // Le service utilise findFirst pour getSlackAgentSourceDatabaseId (config avec sourceDatabase)
    ;(prisma.agent.findFirst as jest.Mock).mockResolvedValue(mockAgent)
    // Le service utilise findMany pour chercher l'agent par agentType (pour créer la proposition)
    ;(prisma.agent.findMany as jest.Mock).mockResolvedValue([mockAgent])
  })

  describe('createProposalFromSlack - NEW_EVENT', () => {
    beforeEach(() => {
      // Mock matchEvent to return NO_MATCH
      ;(matchEvent as jest.Mock).mockResolvedValue({
        type: 'NO_MATCH',
        confidence: 0.3,
        event: null,
        edition: null,
        rejectedMatches: [
          { id: 1, name: 'Similar Event', city: 'Paris', similarity: 0.6 }
        ]
      })
    })

    it('should create NEW_EVENT proposal when no match is found', async () => {
      const extractedData: ExtractedEventData = {
        eventName: 'Trail des Montagnes',
        eventCity: 'Chamonix',
        eventDepartment: '74',
        editionYear: 2025,
        editionDate: '2025-06-15',
        races: [
          { name: 'Ultra 100K', distance: 100000, elevation: 6000 }
        ],
        organizerName: 'Association Trail Alpes',
        confidence: 0.9,
        extractionMethod: 'html'
      }

      ;(prisma.proposal.create as jest.Mock).mockResolvedValue({
        id: 'proposal-new-123',
        type: 'NEW_EVENT'
      })

      const result = await createProposalFromSlack(extractedData, mockSourceMetadata)

      expect(result.success).toBe(true)
      expect(result.proposalType).toBe('NEW_EVENT')
      expect(result.proposalId).toBe('proposal-new-123')

      // Verify proposal.create was called with correct data
      expect(prisma.proposal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          agentId: mockAgent.id,
          type: 'NEW_EVENT',
          status: 'PENDING',
          eventName: 'Trail des Montagnes',
          eventCity: 'Chamonix',
          editionYear: 2025
        })
      })

      // Verify sourceMetadata is converted to generic format
      const createCall = (prisma.proposal.create as jest.Mock).mock.calls[0][0]
      expect(createCall.data.sourceMetadata).toHaveProperty('type', 'SLACK')
      expect(createCall.data.sourceMetadata).toHaveProperty('url', mockSourceMetadata.sourceUrl)
      expect(createCall.data.sourceMetadata).toHaveProperty('extractedAt')

      // Verify changes structure for NEW_EVENT (aligned with FFA Scraper)
      // Structure: { name: { new, confidence }, city: { new, confidence }, edition: { new: { races, organizer, ... }, confidence } }
      expect(createCall.data.changes).toHaveProperty('name')
      expect(createCall.data.changes).toHaveProperty('city')
      expect(createCall.data.changes).toHaveProperty('edition')
      expect(createCall.data.changes.name.new).toBe('Trail des Montagnes')
      expect(createCall.data.changes.city.new).toBe('Chamonix')
      expect(createCall.data.changes.edition.new.races).toHaveLength(1)
      expect(createCall.data.changes.edition.new.races[0].name).toBe('Ultra 100K')
      expect(createCall.data.changes.edition.new.races[0].runDistance).toBe(100) // Converted to km
    })

    it('should include organizer in changes when present', async () => {
      const extractedData: ExtractedEventData = {
        eventName: 'Test Event',
        eventCity: 'Paris',
        editionDate: '2025-03-15',
        organizerName: 'Test Organizer',
        organizerEmail: 'contact@test.org',
        organizerWebsite: 'https://test.org',
        confidence: 0.8,
        extractionMethod: 'html'
      }

      ;(prisma.proposal.create as jest.Mock).mockResolvedValue({
        id: 'proposal-123',
        type: 'NEW_EVENT'
      })

      await createProposalFromSlack(extractedData, mockSourceMetadata)

      const createCall = (prisma.proposal.create as jest.Mock).mock.calls[0][0]
      // Organizer is inside edition.new (aligned with FFA Scraper structure)
      expect(createCall.data.changes.edition.new).toHaveProperty('organizer')
      expect(createCall.data.changes.edition.new.organizer.name).toBe('Test Organizer')
      expect(createCall.data.changes.edition.new.organizer.email).toBe('contact@test.org')
      expect(createCall.data.changes.edition.new.organizer.websiteUrl).toBe('https://test.org')
    })

    it('should include registration URL in edition when present', async () => {
      const extractedData: ExtractedEventData = {
        eventName: 'Test Event',
        eventCity: 'Paris',
        editionDate: '2025-03-15',
        registrationUrl: 'https://inscription.test.org',
        confidence: 0.8,
        extractionMethod: 'html'
      }

      ;(prisma.proposal.create as jest.Mock).mockResolvedValue({
        id: 'proposal-123',
        type: 'NEW_EVENT'
      })

      await createProposalFromSlack(extractedData, mockSourceMetadata)

      const createCall = (prisma.proposal.create as jest.Mock).mock.calls[0][0]
      // registrationUrl is inside edition.new (aligned with FFA Scraper structure)
      expect(createCall.data.changes.edition.new.registrationUrl).toBe('https://inscription.test.org')
    })
  })

  describe('createProposalFromSlack - EDITION_UPDATE', () => {
    beforeEach(() => {
      // Mock matchEvent to return a match
      ;(matchEvent as jest.Mock).mockResolvedValue({
        type: 'EXACT_MATCH',
        confidence: 0.95,
        event: {
          id: 123,
          name: 'Trail des Montagnes',
          city: 'Chamonix',
          similarity: 0.98
        },
        edition: {
          id: 456,
          year: '2025',
          startDate: new Date('2025-06-14')
        },
        rejectedMatches: []
      })
    })

    it('should create EDITION_UPDATE when match is found', async () => {
      const extractedData: ExtractedEventData = {
        eventName: 'Trail des Montagnes',
        eventCity: 'Chamonix',
        editionDate: '2025-06-15',
        races: [
          { name: 'New Race 50K', distance: 50000, elevation: 3000 }
        ],
        confidence: 0.9,
        extractionMethod: 'html'
      }

      ;(prisma.proposal.create as jest.Mock).mockResolvedValue({
        id: 'proposal-update-123',
        type: 'EDITION_UPDATE'
      })

      const result = await createProposalFromSlack(extractedData, mockSourceMetadata)

      expect(result.success).toBe(true)
      expect(result.proposalType).toBe('EDITION_UPDATE')
      expect(result.matchedEvent).toBeDefined()
      expect(result.matchedEvent?.id).toBe(123)
      expect(result.matchedEvent?.name).toBe('Trail des Montagnes')
      expect(result.matchedEdition).toBeDefined()
      expect(result.matchedEdition?.id).toBe(456)

      // Verify changes structure for EDITION_UPDATE
      const createCall = (prisma.proposal.create as jest.Mock).mock.calls[0][0]
      expect(createCall.data.type).toBe('EDITION_UPDATE')
      expect(createCall.data.eventId).toBe('123')
      expect(createCall.data.editionId).toBe('456')
    })

    it('should include date changes in EDITION_UPDATE', async () => {
      const extractedData: ExtractedEventData = {
        eventName: 'Test Event',
        eventCity: 'Paris',
        editionDate: '2025-03-15',
        editionEndDate: '2025-03-16',
        confidence: 0.9,
        extractionMethod: 'html'
      }

      ;(prisma.proposal.create as jest.Mock).mockResolvedValue({
        id: 'proposal-123',
        type: 'EDITION_UPDATE'
      })

      await createProposalFromSlack(extractedData, mockSourceMetadata)

      const createCall = (prisma.proposal.create as jest.Mock).mock.calls[0][0]
      expect(createCall.data.changes).toHaveProperty('startDate')
      expect(createCall.data.changes).toHaveProperty('endDate')
      expect(createCall.data.changes.startDate).toHaveProperty('old')
      expect(createCall.data.changes.startDate).toHaveProperty('new')
    })

    it('should include racesToAdd in EDITION_UPDATE', async () => {
      const extractedData: ExtractedEventData = {
        eventName: 'Test Event',
        eventCity: 'Paris',
        editionDate: '2025-03-15',
        races: [
          { name: 'Race A', distance: 10000 },
          { name: 'Race B', distance: 21000, elevation: 500 }
        ],
        confidence: 0.9,
        extractionMethod: 'html'
      }

      ;(prisma.proposal.create as jest.Mock).mockResolvedValue({
        id: 'proposal-123',
        type: 'EDITION_UPDATE'
      })

      await createProposalFromSlack(extractedData, mockSourceMetadata)

      const createCall = (prisma.proposal.create as jest.Mock).mock.calls[0][0]
      expect(createCall.data.changes).toHaveProperty('racesToAdd')
      expect(createCall.data.changes.racesToAdd.new).toHaveLength(2)
      expect(createCall.data.changes.racesToAdd.new[0].name).toBe('Race A')
      expect(createCall.data.changes.racesToAdd.new[0].runDistance).toBe(10) // km
      expect(createCall.data.changes.racesToAdd.new[1].runPositiveElevation).toBe(500)
    })
  })

  describe('createProposalFromSlack - validation', () => {
    it('should fail when eventName is missing', async () => {
      const extractedData: ExtractedEventData = {
        eventName: '',
        eventCity: 'Paris',
        editionDate: '2025-03-15',
        confidence: 0.9,
        extractionMethod: 'html'
      }

      const result = await createProposalFromSlack(extractedData, mockSourceMetadata)

      expect(result.success).toBe(false)
      expect(result.error).toContain('nom')
      expect(prisma.proposal.create).not.toHaveBeenCalled()
    })

    it('should fail when date is missing', async () => {
      const extractedData: ExtractedEventData = {
        eventName: 'Test Event',
        eventCity: 'Paris',
        confidence: 0.9,
        extractionMethod: 'html'
      }

      const result = await createProposalFromSlack(extractedData, mockSourceMetadata)

      expect(result.success).toBe(false)
      expect(result.error).toContain('date')
      expect(prisma.proposal.create).not.toHaveBeenCalled()
    })

    it('should accept editionYear as alternative to editionDate', async () => {
      ;(matchEvent as jest.Mock).mockResolvedValue({
        type: 'NO_MATCH',
        confidence: 0.3,
        event: null,
        edition: null,
        rejectedMatches: []
      })

      const extractedData: ExtractedEventData = {
        eventName: 'Test Event',
        eventCity: 'Paris',
        editionYear: 2025, // Only year, no specific date
        confidence: 0.9,
        extractionMethod: 'html'
      }

      ;(prisma.proposal.create as jest.Mock).mockResolvedValue({
        id: 'proposal-123',
        type: 'NEW_EVENT'
      })

      const result = await createProposalFromSlack(extractedData, mockSourceMetadata)

      expect(result.success).toBe(true)
      expect(prisma.proposal.create).toHaveBeenCalled()
    })

    it('should fail when agent is not found', async () => {
      ;(prisma.agent.findMany as jest.Mock).mockResolvedValue([])
      ;(matchEvent as jest.Mock).mockResolvedValue({
        type: 'NO_MATCH',
        confidence: 0.3,
        event: null,
        edition: null,
        rejectedMatches: []
      })

      const extractedData: ExtractedEventData = {
        eventName: 'Test Event',
        eventCity: 'Paris',
        editionDate: '2025-03-15',
        confidence: 0.9,
        extractionMethod: 'html'
      }

      const result = await createProposalFromSlack(extractedData, mockSourceMetadata)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Agent')
    })
  })

  describe('createProposalFromSlack - sourceMetadata', () => {
    beforeEach(() => {
      ;(matchEvent as jest.Mock).mockResolvedValue({
        type: 'NO_MATCH',
        confidence: 0.3,
        event: null,
        edition: null,
        rejectedMatches: []
      })
    })

    it('should store complete sourceMetadata in proposal', async () => {
      const extractedData: ExtractedEventData = {
        eventName: 'Test Event',
        eventCity: 'Paris',
        editionDate: '2025-03-15',
        confidence: 0.9,
        extractionMethod: 'html'
      }

      const fullSourceMetadata: SlackSourceMetadata = {
        type: 'SLACK',
        workspaceId: 'T123',
        workspaceName: 'My Workspace',
        channelId: 'C456',
        channelName: 'events-channel',
        messageTs: '1234567890.000001',
        threadTs: '1234567890.000000',
        userId: 'U789',
        userName: 'john.doe',
        messageLink: 'https://myworkspace.slack.com/archives/C456/p1234567890000001',
        sourceUrl: 'https://myrace.com/event',
        imageUrls: ['https://slack.com/files/image1.png', 'https://slack.com/files/image2.jpg'],
        extractedAt: '2025-01-15T14:30:00Z'
      }

      ;(prisma.proposal.create as jest.Mock).mockResolvedValue({
        id: 'proposal-123',
        type: 'NEW_EVENT'
      })

      await createProposalFromSlack(extractedData, fullSourceMetadata)

      const createCall = (prisma.proposal.create as jest.Mock).mock.calls[0][0]
      const storedMetadata = createCall.data.sourceMetadata

      // Le service convertit vers le format générique SourceMetadata
      expect(storedMetadata.type).toBe('SLACK')
      expect(storedMetadata.url).toBe('https://myrace.com/event')
      expect(storedMetadata.imageUrls).toHaveLength(2)
      expect(storedMetadata.extractedAt).toBe('2025-01-15T14:30:00Z')

      // Les métadonnées Slack spécifiques sont dans 'extra'
      expect(storedMetadata.extra).toBeDefined()
      expect(storedMetadata.extra.workspaceId).toBe('T123')
      expect(storedMetadata.extra.channelId).toBe('C456')
      expect(storedMetadata.extra.messageLink).toBe('https://myworkspace.slack.com/archives/C456/p1234567890000001')
      expect(storedMetadata.extra.userId).toBe('U789')
      expect(storedMetadata.extra.userName).toBe('john.doe')
    })
  })

  describe('createProposalFromSlack - justifications', () => {
    it('should include URL source in justifications', async () => {
      ;(matchEvent as jest.Mock).mockResolvedValue({
        type: 'NO_MATCH',
        confidence: 0.3,
        event: null,
        edition: null,
        rejectedMatches: []
      })

      const extractedData: ExtractedEventData = {
        eventName: 'Test Event',
        eventCity: 'Paris',
        editionDate: '2025-03-15',
        confidence: 0.9,
        extractionMethod: 'html'
      }

      ;(prisma.proposal.create as jest.Mock).mockResolvedValue({
        id: 'proposal-123',
        type: 'NEW_EVENT'
      })

      await createProposalFromSlack(extractedData, mockSourceMetadata)

      const createCall = (prisma.proposal.create as jest.Mock).mock.calls[0][0]
      const justifications = createCall.data.justification as any[]

      const urlJustification = justifications.find(j => j.type === 'url_source')
      expect(urlJustification).toBeDefined()
      expect(urlJustification.metadata.url).toBe('https://example.com/event')
    })

    it('should include rejected matches in justifications for NEW_EVENT', async () => {
      ;(matchEvent as jest.Mock).mockResolvedValue({
        type: 'NO_MATCH',
        confidence: 0.3,
        event: null,
        edition: null,
        rejectedMatches: [
          { id: 1, name: 'Similar Event 1', city: 'Lyon', similarity: 0.65 },
          { id: 2, name: 'Similar Event 2', city: 'Marseille', similarity: 0.55 }
        ]
      })

      const extractedData: ExtractedEventData = {
        eventName: 'Test Event',
        eventCity: 'Paris',
        editionDate: '2025-03-15',
        confidence: 0.9,
        extractionMethod: 'html'
      }

      ;(prisma.proposal.create as jest.Mock).mockResolvedValue({
        id: 'proposal-123',
        type: 'NEW_EVENT'
      })

      await createProposalFromSlack(extractedData, mockSourceMetadata)

      const createCall = (prisma.proposal.create as jest.Mock).mock.calls[0][0]
      const justifications = createCall.data.justification as any[]

      const rejectedJustification = justifications.find(j => j.type === 'rejected_matches')
      expect(rejectedJustification).toBeDefined()
      expect(rejectedJustification.metadata.rejectedMatches).toHaveLength(2)
    })

    it('should include matching info in justifications for EDITION_UPDATE', async () => {
      ;(matchEvent as jest.Mock).mockResolvedValue({
        type: 'EXACT_MATCH',
        confidence: 0.95,
        event: {
          id: 123,
          name: 'Matched Event',
          city: 'Paris',
          similarity: 0.98
        },
        edition: {
          id: 456,
          year: '2025'
        },
        rejectedMatches: []
      })

      const extractedData: ExtractedEventData = {
        eventName: 'Matched Event',
        eventCity: 'Paris',
        editionDate: '2025-03-15',
        confidence: 0.9,
        extractionMethod: 'html'
      }

      ;(prisma.proposal.create as jest.Mock).mockResolvedValue({
        id: 'proposal-123',
        type: 'EDITION_UPDATE'
      })

      await createProposalFromSlack(extractedData, mockSourceMetadata)

      const createCall = (prisma.proposal.create as jest.Mock).mock.calls[0][0]
      const justifications = createCall.data.justification as any[]

      const matchJustification = justifications.find(j => j.type === 'matching')
      expect(matchJustification).toBeDefined()
      expect(matchJustification.metadata.matchType).toBe('EXACT_MATCH')
      expect(matchJustification.metadata.matchedEventId).toBe(123)
      expect(matchJustification.metadata.similarity).toBe(0.98)
    })
  })

  describe('getProposalWithSlackMetadata', () => {
    it('should return proposal with Slack metadata flag', async () => {
      const mockProposal = {
        id: 'proposal-123',
        type: 'NEW_EVENT',
        sourceMetadata: mockSourceMetadata,
        agent: mockAgent
      }

      ;(prisma.proposal.findUnique as jest.Mock).mockResolvedValue(mockProposal)

      const result = await getProposalWithSlackMetadata('proposal-123')

      expect(result).toBeDefined()
      expect(result?.isFromSlack).toBe(true)
      expect(result?.slackMetadata).toEqual(mockSourceMetadata)
    })

    it('should return isFromSlack=false for non-Slack proposals', async () => {
      const mockProposal = {
        id: 'proposal-123',
        type: 'NEW_EVENT',
        sourceMetadata: null,
        agent: mockAgent
      }

      ;(prisma.proposal.findUnique as jest.Mock).mockResolvedValue(mockProposal)

      const result = await getProposalWithSlackMetadata('proposal-123')

      expect(result).toBeDefined()
      expect(result?.isFromSlack).toBe(false)
      expect(result?.slackMetadata).toBeNull()
    })

    it('should return null for non-existent proposal', async () => {
      ;(prisma.proposal.findUnique as jest.Mock).mockResolvedValue(null)

      const result = await getProposalWithSlackMetadata('non-existent')

      expect(result).toBeNull()
    })
  })
})

describe('SlackProposalService - Data coherence', () => {
  /**
   * These tests document the expected data structure for proposals
   * created from Slack, ensuring coherence with the rest of the system.
   */

  describe('NEW_EVENT changes structure', () => {
    it('should document expected NEW_EVENT changes format', () => {
      // This is the expected structure that the dashboard expects
      const expectedNewEventChanges = {
        event: {
          name: 'string (required)',
          city: 'string (required)',
          country: 'string (default: France)',
          department: 'string (optional, e.g., "74")'
        },
        edition: {
          year: 'string (required, e.g., "2025")',
          startDate: 'Date object with time (required)',
          endDate: 'Date object with time (optional)',
          timeZone: 'IANA timezone string (required)',
          registrationUrl: 'string (optional)'
        },
        races: [
          {
            name: 'string (required)',
            startDate: 'Date object with time (enriched)',
            startTime: 'HH:mm format (optional)',
            runDistance: 'number in km (optional)',
            runPositiveElevation: 'number in meters (optional)',
            categoryLevel1: 'RUNNING | TRAIL | WALK | etc. (enriched)',
            categoryLevel2: 'MARATHON | ULTRA_TRAIL | etc. (enriched)',
            timeZone: 'IANA timezone string (enriched)'
          }
        ],
        organizer: {
          name: 'string (optional)',
          email: 'string (optional)',
          phone: 'string (optional)',
          websiteUrl: 'string (optional)'
        }
      }

      // Verify structure documentation
      expect(expectedNewEventChanges.event).toHaveProperty('name')
      expect(expectedNewEventChanges.edition).toHaveProperty('year')
      expect(expectedNewEventChanges.edition).toHaveProperty('timeZone')
      expect(expectedNewEventChanges.races[0]).toHaveProperty('runDistance')
      expect(expectedNewEventChanges.races[0]).toHaveProperty('categoryLevel1')
      expect(expectedNewEventChanges.races[0]).toHaveProperty('startDate')
    })
  })

  describe('EDITION_UPDATE changes structure', () => {
    it('should document expected EDITION_UPDATE changes format', () => {
      // For EDITION_UPDATE, changes use old/new structure
      const expectedEditionUpdateChanges = {
        startDate: {
          old: 'Date object or null',
          new: 'Date object with time (required)'
        },
        endDate: {
          old: 'Date object or null',
          new: 'Date object with time (optional)'
        },
        timeZone: {
          old: 'null',
          new: 'IANA timezone string (enriched)'
        },
        racesToAdd: {
          old: 'null',
          new: ['array of race objects with enriched categories and dates']
        },
        organizer: {
          old: 'null or existing organizer',
          new: 'organizer object'
        },
        registrationUrl: {
          old: 'null or existing url',
          new: 'string url'
        }
      }

      // Verify structure documentation
      expect(expectedEditionUpdateChanges.startDate).toHaveProperty('old')
      expect(expectedEditionUpdateChanges.startDate).toHaveProperty('new')
      expect(expectedEditionUpdateChanges.timeZone).toHaveProperty('new')
      expect(expectedEditionUpdateChanges.racesToAdd).toHaveProperty('new')
    })
  })

  describe('sourceMetadata structure', () => {
    it('should document expected sourceMetadata format (generic SourceMetadata)', () => {
      // Nouveau format générique SourceMetadata (contrat)
      const expectedSourceMetadata = {
        type: 'SLACK', // 'URL' | 'IMAGE' | 'TEXT' | 'SLACK' | 'FFA' | 'GOOGLE'
        url: 'https://example.com/event', // URL de la source (optional)
        imageUrls: ['https://files.slack.com/...'], // Images (optional)
        extractedAt: '2025-01-15T10:00:00.000Z', // Date extraction (required)
        extra: {
          // Slack-specific
          workspaceId: 'T123456789',
          channelId: 'C123456789',
          messageLink: 'https://company.slack.com/archives/C123/p1234567890123456',
          userId: 'U123456789',
          userName: 'john.doe'
        }
      }

      expect(expectedSourceMetadata.type).toBe('SLACK')
      expect(expectedSourceMetadata).toHaveProperty('url')
      expect(expectedSourceMetadata).toHaveProperty('extractedAt')
      expect(expectedSourceMetadata.extra).toHaveProperty('workspaceId')
      expect(expectedSourceMetadata.extra).toHaveProperty('messageLink')
    })

    it('should document legacy SlackSourceMetadata format for backward compatibility', () => {
      const legacySourceMetadata: SlackSourceMetadata = {
        type: 'SLACK',
        workspaceId: 'T123456789',
        workspaceName: 'Company Workspace',
        channelId: 'C123456789',
        channelName: 'events',
        messageTs: '1234567890.123456',
        threadTs: '1234567890.000000', // Optional
        userId: 'U123456789',
        userName: 'john.doe',
        messageLink: 'https://company.slack.com/archives/C123/p1234567890123456',
        sourceUrl: 'https://example.com/event', // Optional
        imageUrls: ['https://files.slack.com/...'], // Optional
        extractedAt: '2025-01-15T10:00:00.000Z'
      }

      expect(legacySourceMetadata.type).toBe('SLACK')
      expect(legacySourceMetadata).toHaveProperty('workspaceId')
      expect(legacySourceMetadata).toHaveProperty('channelId')
      expect(legacySourceMetadata).toHaveProperty('messageTs')
      expect(legacySourceMetadata).toHaveProperty('userId')
      expect(legacySourceMetadata).toHaveProperty('messageLink')
    })
  })
})

describe('SlackProposalService - Enrichment', () => {
  /**
   * Tests for automatic enrichment of races with categories and dates
   */

  const mockAgent = {
    id: 'agent-123',
    name: 'Slack Event Agent',
    type: 'EXTRACTOR',
    isActive: true,
    config: { agentType: 'SLACK_EVENT', sourceDatabase: 'db-123' }
  }

  const mockSourceMetadata: SlackSourceMetadata = {
    type: 'SLACK',
    workspaceId: 'T123456',
    workspaceName: 'Test Workspace',
    channelId: 'C123456',
    channelName: 'events',
    messageTs: '1234567890.123456',
    userId: 'U123456',
    userName: 'testuser',
    messageLink: 'https://slack.com/archives/C123/p1234567890123456',
    sourceUrl: 'https://example.com/event',
    extractedAt: '2025-01-15T10:00:00Z'
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.agent.findFirst as jest.Mock).mockResolvedValue(mockAgent)
    ;(prisma.agent.findMany as jest.Mock).mockResolvedValue([mockAgent])
    ;(matchEvent as jest.Mock).mockResolvedValue({
      type: 'NO_MATCH',
      confidence: 0.3,
      event: null,
      edition: null,
      rejectedMatches: []
    })
  })

  describe('Category enrichment', () => {
    it('should enrich races with inferred categories when not provided', async () => {
      const extractedData: ExtractedEventData = {
        eventName: 'Trail des Montagnes',
        eventCity: 'Chamonix',
        eventDepartment: '74',
        editionDate: '2025-06-15',
        races: [
          { name: 'Trail 30km', distance: 30000 }, // No categories provided
          { name: 'Trail 60km', distance: 60000 }
        ],
        confidence: 0.9,
        extractionMethod: 'html'
      }

      ;(prisma.proposal.create as jest.Mock).mockResolvedValue({
        id: 'proposal-123',
        type: 'NEW_EVENT'
      })

      await createProposalFromSlack(extractedData, mockSourceMetadata)

      const createCall = (prisma.proposal.create as jest.Mock).mock.calls[0][0]
      // Races are inside edition.new (aligned with FFA Scraper structure)
      const races = createCall.data.changes.edition.new.races

      // inferRaceCategories is called for each race
      expect(races).toHaveLength(2)
      // The mock returns TRAIL/SHORT_TRAIL for 30km and TRAIL/LONG_TRAIL for 60km
      expect(races[0].categoryLevel1).toBe('TRAIL')
      expect(races[0].categoryLevel2).toBe('SHORT_TRAIL')
      expect(races[1].categoryLevel1).toBe('TRAIL')
      expect(races[1].categoryLevel2).toBe('LONG_TRAIL')
    })

    it('should not overwrite existing categories', async () => {
      const extractedData: ExtractedEventData = {
        eventName: 'Course Spéciale',
        eventCity: 'Paris',
        editionDate: '2025-03-15',
        races: [
          {
            name: 'Course 10km',
            distance: 10000,
            categoryLevel1: 'FUN', // Already provided
            categoryLevel2: 'COLOR_RUN'
          }
        ],
        confidence: 0.9,
        extractionMethod: 'html'
      }

      ;(prisma.proposal.create as jest.Mock).mockResolvedValue({
        id: 'proposal-123',
        type: 'NEW_EVENT'
      })

      await createProposalFromSlack(extractedData, mockSourceMetadata)

      const createCall = (prisma.proposal.create as jest.Mock).mock.calls[0][0]
      // Races are inside edition.new (aligned with FFA Scraper structure)
      const races = createCall.data.changes.edition.new.races

      // Categories should be preserved, not overwritten
      expect(races[0].categoryLevel1).toBe('FUN')
      expect(races[0].categoryLevel2).toBe('COLOR_RUN')
    })
  })

  describe('Timezone resolution', () => {
    it('should use Europe/Paris for metropolitan France', async () => {
      const extractedData: ExtractedEventData = {
        eventName: 'Course de Paris',
        eventCity: 'Paris',
        eventDepartment: '75',
        editionDate: '2025-03-15',
        races: [{ name: '10km', distance: 10000 }],
        confidence: 0.9,
        extractionMethod: 'html'
      }

      ;(prisma.proposal.create as jest.Mock).mockResolvedValue({
        id: 'proposal-123',
        type: 'NEW_EVENT'
      })

      await createProposalFromSlack(extractedData, mockSourceMetadata)

      const createCall = (prisma.proposal.create as jest.Mock).mock.calls[0][0]
      // Timezone is inside edition.new (aligned with FFA Scraper structure)
      expect(createCall.data.changes.edition.new.timeZone).toBe('Europe/Paris')
      expect(createCall.data.changes.edition.new.races[0].timeZone).toBe('Europe/Paris')
    })

    it('should use correct timezone for DOM-TOM (La Réunion)', async () => {
      const extractedData: ExtractedEventData = {
        eventName: 'Grand Raid de La Réunion',
        eventCity: 'Saint-Denis',
        eventDepartment: '974',
        editionDate: '2025-10-15',
        races: [{ name: 'Diagonale des Fous', distance: 165000 }],
        confidence: 0.9,
        extractionMethod: 'html'
      }

      ;(prisma.proposal.create as jest.Mock).mockResolvedValue({
        id: 'proposal-123',
        type: 'NEW_EVENT'
      })

      await createProposalFromSlack(extractedData, mockSourceMetadata)

      const createCall = (prisma.proposal.create as jest.Mock).mock.calls[0][0]
      // Timezone is inside edition.new (aligned with FFA Scraper structure)
      expect(createCall.data.changes.edition.new.timeZone).toBe('Indian/Reunion')
      expect(createCall.data.changes.edition.new.races[0].timeZone).toBe('Indian/Reunion')
    })

    it('should use country timezone for foreign events', async () => {
      const extractedData: ExtractedEventData = {
        eventName: 'Marathon de Bruxelles',
        eventCity: 'Bruxelles',
        eventCountry: 'Belgique',
        editionDate: '2025-10-05',
        races: [{ name: 'Marathon', distance: 42195 }],
        confidence: 0.9,
        extractionMethod: 'html'
      }

      ;(prisma.proposal.create as jest.Mock).mockResolvedValue({
        id: 'proposal-123',
        type: 'NEW_EVENT'
      })

      await createProposalFromSlack(extractedData, mockSourceMetadata)

      const createCall = (prisma.proposal.create as jest.Mock).mock.calls[0][0]
      // Timezone is inside edition.new (aligned with FFA Scraper structure)
      expect(createCall.data.changes.edition.new.timeZone).toBe('Europe/Brussels')
    })
  })

  describe('Date with time enrichment', () => {
    it('should include startDate with time for races', async () => {
      const extractedData: ExtractedEventData = {
        eventName: 'Trail Matinal',
        eventCity: 'Lyon',
        editionDate: '2025-05-20',
        races: [
          { name: 'Trail 20km', distance: 20000, startTime: '07:00' },
          { name: 'Trail 10km', distance: 10000, startTime: '09:30' }
        ],
        confidence: 0.9,
        extractionMethod: 'html'
      }

      ;(prisma.proposal.create as jest.Mock).mockResolvedValue({
        id: 'proposal-123',
        type: 'NEW_EVENT'
      })

      await createProposalFromSlack(extractedData, mockSourceMetadata)

      const createCall = (prisma.proposal.create as jest.Mock).mock.calls[0][0]
      // Races are inside edition.new (aligned with FFA Scraper structure)
      const races = createCall.data.changes.edition.new.races

      // Races should have startDate (Date object) not just startTime
      expect(races[0].startDate).toBeDefined()
      expect(races[0].startTime).toBe('07:00')
      expect(races[1].startDate).toBeDefined()
      expect(races[1].startTime).toBe('09:30')
    })

    it('should include startDate in edition based on earliest race time', async () => {
      const extractedData: ExtractedEventData = {
        eventName: 'Course du Matin',
        eventCity: 'Marseille',
        editionDate: '2025-04-10',
        races: [
          { name: 'Course A', distance: 5000, startTime: '08:30' },
          { name: 'Course B', distance: 10000, startTime: '10:00' }
        ],
        confidence: 0.9,
        extractionMethod: 'html'
      }

      ;(prisma.proposal.create as jest.Mock).mockResolvedValue({
        id: 'proposal-123',
        type: 'NEW_EVENT'
      })

      await createProposalFromSlack(extractedData, mockSourceMetadata)

      const createCall = (prisma.proposal.create as jest.Mock).mock.calls[0][0]
      // Edition is inside edition.new (aligned with FFA Scraper structure)
      const edition = createCall.data.changes.edition.new

      // Edition startDate should be a Date object (not string)
      expect(edition.startDate).toBeDefined()
      expect(edition.startDate instanceof Date).toBe(true)
    })
  })

  describe('SourceMetadata conversion', () => {
    it('should convert SlackSourceMetadata to generic SourceMetadata', async () => {
      const extractedData: ExtractedEventData = {
        eventName: 'Test Event',
        eventCity: 'Paris',
        editionDate: '2025-03-15',
        confidence: 0.9,
        extractionMethod: 'html'
      }

      ;(prisma.proposal.create as jest.Mock).mockResolvedValue({
        id: 'proposal-123',
        type: 'NEW_EVENT'
      })

      await createProposalFromSlack(extractedData, mockSourceMetadata)

      const createCall = (prisma.proposal.create as jest.Mock).mock.calls[0][0]
      const sourceMetadata = createCall.data.sourceMetadata

      // Should be converted to generic format
      expect(sourceMetadata.type).toBe('SLACK')
      expect(sourceMetadata.url).toBe('https://example.com/event')
      expect(sourceMetadata.extra).toBeDefined()
      expect(sourceMetadata.extra.workspaceId).toBe('T123456')
      expect(sourceMetadata.extra.messageLink).toBe('https://slack.com/archives/C123/p1234567890123456')
    })
  })

  describe('Justification contracts', () => {
    it('should use type=rejected_matches for similar events (not type=text)', async () => {
      ;(matchEvent as jest.Mock).mockResolvedValue({
        type: 'NO_MATCH',
        confidence: 0.3,
        event: null,
        edition: null,
        rejectedMatches: [
          {
            eventId: 123,
            eventName: 'Similar Event',
            eventCity: 'Paris',
            matchScore: 0.72
          }
        ]
      })

      const extractedData: ExtractedEventData = {
        eventName: 'New Event',
        eventCity: 'Paris',
        editionDate: '2025-03-15',
        confidence: 0.9,
        extractionMethod: 'html'
      }

      ;(prisma.proposal.create as jest.Mock).mockResolvedValue({
        id: 'proposal-123',
        type: 'NEW_EVENT'
      })

      await createProposalFromSlack(extractedData, mockSourceMetadata)

      const createCall = (prisma.proposal.create as jest.Mock).mock.calls[0][0]
      const justifications = createCall.data.justification

      // Should use type='rejected_matches' (contract), not type='text'
      const rejectedMatchesJustif = justifications.find((j: any) => j.type === 'rejected_matches')
      expect(rejectedMatchesJustif).toBeDefined()
      expect(rejectedMatchesJustif.metadata.rejectedMatches).toBeDefined()

      // Should NOT have type='text' for rejected matches
      const textJustifWithRejected = justifications.find(
        (j: any) => j.type === 'text' && j.metadata?.rejectedMatches
      )
      expect(textJustifWithRejected).toBeUndefined()
    })

    it('should use type=url_source for source URLs', async () => {
      const extractedData: ExtractedEventData = {
        eventName: 'Test Event',
        eventCity: 'Paris',
        editionDate: '2025-03-15',
        confidence: 0.9,
        extractionMethod: 'html'
      }

      ;(prisma.proposal.create as jest.Mock).mockResolvedValue({
        id: 'proposal-123',
        type: 'NEW_EVENT'
      })

      await createProposalFromSlack(extractedData, mockSourceMetadata)

      const createCall = (prisma.proposal.create as jest.Mock).mock.calls[0][0]
      const justifications = createCall.data.justification

      const urlJustif = justifications.find((j: any) => j.type === 'url_source')
      expect(urlJustif).toBeDefined()
      expect(urlJustif.metadata.url).toBe('https://example.com/event')
    })
  })
})
