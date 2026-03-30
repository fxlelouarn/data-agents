// Mock @data-agents/types to avoid ESM `.js` extension resolution issues
jest.mock('@data-agents/types', () => ({
  AGENT_VERSIONS: { EDITION_DUPLICATOR_AGENT: '1.0.0' },
  getAgentName: jest.fn().mockReturnValue('Edition Duplicator Agent'),
  EditionDuplicatorAgentConfigSchema: {},
}))

jest.mock('@data-agents/agent-framework', () => ({
  BaseAgent: class MockBaseAgent {
    config: any
    constructor(config: any) { this.config = config }
    async connectToSource() { return {} }
    async closeSourceConnections() {}
    async createProposal(data: any) { return { id: 'test-proposal-id', ...data } }
  },
  AgentType: {},
}))

jest.mock('@data-agents/database', () => ({
  prisma: {},
  AgentStateService: class MockStateService {
    async getState() { return null }
    async setState() {}
  },
  IAgentStateService: {},
}))

import { EditionDuplicatorAgent, EDITION_DUPLICATOR_AGENT_VERSION } from '../EditionDuplicatorAgent'

describe('EditionDuplicatorAgent', () => {
  describe('version', () => {
    it('should export a version string', () => {
      expect(EDITION_DUPLICATOR_AGENT_VERSION).toBe('1.0.0')
    })
  })

  describe('constructor', () => {
    it('should create agent with default config', () => {
      const agent = new EditionDuplicatorAgent({
        id: 'test-agent',
        config: { sourceDatabase: 'test-db' },
      })
      expect(agent.config.name).toBe('Edition Duplicator Agent')
      expect(agent.config.config.batchSize).toBe(50)
      expect(agent.config.config.dryRun).toBe(false)
    })

    it('should allow config overrides', () => {
      const agent = new EditionDuplicatorAgent({
        id: 'test-agent',
        config: { sourceDatabase: 'test-db', batchSize: 10, dryRun: true },
      })
      expect(agent.config.config.batchSize).toBe(10)
      expect(agent.config.config.dryRun).toBe(true)
    })
  })

  describe('buildProposalForEdition', () => {
    it('should build correct proposal with shifted dates', () => {
      const agent = new EditionDuplicatorAgent({
        id: 'test-agent',
        config: { sourceDatabase: 'test-db' },
      })

      const edition = {
        id: 100, eventId: 1, year: '2026',
        startDate: new Date('2026-03-28T08:00:00Z'),
        endDate: new Date('2026-03-29T18:00:00Z'),
        status: 'LIVE', calendarStatus: 'CONFIRMED', currentEditionEventId: 1,
        isAttendeeListPublic: true, organizerStripeConnectedAccountId: 'acct_123',
        currency: 'EUR', medusaVersion: 'V2', timeZone: 'Europe/Paris',
        event: { id: 1, name: 'Trail des Monts', city: 'Lyon' },
        races: [{
          id: 200, name: '42km', startDate: new Date('2026-03-28T08:00:00Z'),
          runDistance: 42, runDistance2: 0, bikeDistance: 0, swimDistance: 0,
          walkDistance: 0, bikeRunDistance: 0, swimRunDistance: 0,
          runPositiveElevation: 1500, runNegativeElevation: 1500,
          bikePositiveElevation: null, bikeNegativeElevation: null,
          walkPositiveElevation: null, walkNegativeElevation: null,
          price: 60, priceType: 'PER_PERSON', paymentCollectionType: 'SINGLE',
          categoryLevel1: 'TRAIL', categoryLevel2: 'LONG_TRAIL', distanceCategory: 'L',
          licenseNumberType: 'FFA', adultJustificativeOptions: null, minorJustificativeOptions: null,
          askAttendeeBirthDate: true, askAttendeeGender: true, askAttendeeNationality: true,
          askAttendeePhoneNumber: true, askAttendeePostalAddress: true,
          showClubOrAssoInput: true, showPublicationConsentCheckbox: true,
          minTeamSize: null, maxTeamSize: null, displayOrder: 1,
          isArchived: false, slug: 'old-slug', timeZone: 'Europe/Paris',
          mainRaceEditionId: 100,
        }],
        editionPartners: [{
          id: 'p1', role: 'ORGANIZER', name: 'ASO', websiteUrl: 'https://aso.fr',
          instagramUrl: null, facebookUrl: 'https://fb.com/aso', logoUrl: 'https://aso.fr/logo.png',
          sortOrder: 0, localizedContents: [{ locale: 'fr', description: 'Organisateur officiel' }],
        }],
      }

      const proposal = (agent as any).buildProposalForEdition(edition)

      expect(proposal.changes.editionToCreate.year).toBe('2027')
      const newStart = new Date(proposal.changes.editionToCreate.startDate)
      expect(newStart.getFullYear()).toBe(2027)
      expect(newStart.getMonth()).toBe(2)
      expect(proposal.changes.oldEditionUpdate.currentEditionEventId).toBeNull()
      expect(proposal.changes.racesToCreate).toHaveLength(1)
      const newRaceStart = new Date(proposal.changes.racesToCreate[0].startDate)
      expect(newRaceStart.getFullYear()).toBe(2027)
      expect(proposal.changes.racesToCreate[0].isMainRace).toBe(true)
      expect(proposal.changes.racesToCreate[0].slug).not.toBe('old-slug')
      expect(proposal.changes.partnersToCreate).toHaveLength(1)
      expect(proposal.changes.partnersToCreate[0].role).toBe('ORGANIZER')
      expect(proposal.changes.partnersToCreate[0].localizedContents).toHaveLength(1)
      expect(proposal.eventId).toBe('1')
      expect(proposal.editionId).toBe('100')
      expect(proposal.confidence).toBe(1.0)
      expect(proposal.type).toBe('EDITION_UPDATE')
    })

    it('should handle null dates gracefully', () => {
      const agent = new EditionDuplicatorAgent({
        id: 'test-agent',
        config: { sourceDatabase: 'test-db' },
      })

      const edition = {
        id: 101, eventId: 2, year: '2026', startDate: null, endDate: null,
        status: 'LIVE', calendarStatus: 'CONFIRMED', currentEditionEventId: 2,
        isAttendeeListPublic: true, organizerStripeConnectedAccountId: null,
        currency: 'EUR', medusaVersion: 'V1', timeZone: 'Europe/Paris',
        event: { id: 2, name: 'Event 2', city: 'Marseille' },
        races: [{
          id: 300, name: '10km', startDate: null,
          runDistance: 10, runDistance2: 0, bikeDistance: 0, swimDistance: 0,
          walkDistance: 0, bikeRunDistance: 0, swimRunDistance: 0,
          runPositiveElevation: null, runNegativeElevation: null,
          bikePositiveElevation: null, bikeNegativeElevation: null,
          walkPositiveElevation: null, walkNegativeElevation: null,
          price: null, priceType: 'PER_PERSON', paymentCollectionType: 'SINGLE',
          categoryLevel1: 'RUNNING', categoryLevel2: 'KM10', distanceCategory: null,
          licenseNumberType: null, adultJustificativeOptions: null, minorJustificativeOptions: null,
          askAttendeeBirthDate: true, askAttendeeGender: true, askAttendeeNationality: true,
          askAttendeePhoneNumber: true, askAttendeePostalAddress: true,
          showClubOrAssoInput: true, showPublicationConsentCheckbox: true,
          minTeamSize: null, maxTeamSize: null, displayOrder: null,
          isArchived: false, slug: 'slug-300', timeZone: null, mainRaceEditionId: null,
        }],
        editionPartners: [],
      }

      const proposal = (agent as any).buildProposalForEdition(edition)
      expect(proposal.changes.editionToCreate.startDate).toBeNull()
      expect(proposal.changes.editionToCreate.endDate).toBeNull()
      expect(proposal.changes.racesToCreate[0].startDate).toBeNull()
      expect(proposal.changes.racesToCreate[0].isMainRace).toBe(false)
      expect(proposal.changes.partnersToCreate).toHaveLength(0)
    })
  })
})
