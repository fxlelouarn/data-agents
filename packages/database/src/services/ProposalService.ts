import { PrismaClient } from '@prisma/client'
import { IProposalService, ProposalFilters } from './interfaces'
import { ProposalRepository } from '../repositories/proposal.repository'

/**
 * Proposal Service - Business logic layer
 *
 * Uses ProposalRepository for data access (Repository Pattern)
 */
export class ProposalService implements IProposalService {
  private repository: ProposalRepository

  constructor(private prisma: PrismaClient) {
    this.repository = new ProposalRepository(prisma)
  }

  async getProposals(filters: ProposalFilters = {}) {
    return this.repository.findMany(filters)
  }

  async getProposal(id: string) {
    return this.repository.findById(id)
  }

  async createProposal(data: {
    agentId: string
    type: string
    eventId?: string
    editionId?: string
    raceId?: string
    changes: any
    justification: any
    confidence?: number
  }) {
    // Extraire les informations de contexte depuis la justification
    let eventName: string | undefined
    let eventCity: string | undefined
    let editionYear: number | undefined
    let raceName: string | undefined
    let proposedStartDate: Date | undefined

    // La justification peut être un tableau ou un objet
    if (Array.isArray(data.justification) && data.justification.length > 0) {
      const firstJustification = data.justification[0]
      if (firstJustification.metadata) {
        eventName = firstJustification.metadata.eventName
        eventCity = firstJustification.metadata.eventCity
        // Convertir l'année en nombre si c'est une chaîne
        const yearValue = firstJustification.metadata.editionYear
        editionYear = yearValue ? (typeof yearValue === 'string' ? parseInt(yearValue) : yearValue) : undefined
        raceName = firstJustification.metadata.raceName
      }
    } else if (data.justification && typeof data.justification === 'object') {
      // Gestion du cas où justification est un objet direct
      eventName = data.justification.eventName
      eventCity = data.justification.eventCity
      const yearValue = data.justification.editionYear
      editionYear = yearValue ? (typeof yearValue === 'string' ? parseInt(yearValue) : yearValue) : undefined
      raceName = data.justification.raceName
    }

    // Extraire proposedStartDate depuis changes
    proposedStartDate = this.extractStartDate(data.changes)

    return this.repository.create({
      ...data,
      eventName,
      eventCity,
      editionYear,
      raceName,
      proposedStartDate
    })
  }

  /**
   * Extrait la startDate depuis l'objet changes d'une proposition
   */
  private extractStartDate(changes: Record<string, any>): Date | undefined {
    if (!changes) return undefined

    // Cas 1: changes.startDate directement (format { old, new } ou valeur directe)
    if (changes.startDate) {
      const startDate = typeof changes.startDate === 'object' && changes.startDate.new
        ? changes.startDate.new
        : changes.startDate

      if (startDate && typeof startDate === 'string') {
        const parsed = new Date(startDate)
        if (!isNaN(parsed.getTime())) {
          return parsed
        }
      }
    }

    // Cas 2: changes.edition.new.startDate (structure NEW_EVENT)
    if (changes.edition?.new?.startDate) {
      const startDate = changes.edition.new.startDate
      if (typeof startDate === 'string') {
        const parsed = new Date(startDate)
        if (!isNaN(parsed.getTime())) {
          return parsed
        }
      }
    }

    // Cas 3: changes.edition.startDate (autre variante)
    if (changes.edition?.startDate) {
      const startDate = typeof changes.edition.startDate === 'object' && changes.edition.startDate.new
        ? changes.edition.startDate.new
        : changes.edition.startDate

      if (startDate && typeof startDate === 'string') {
        const parsed = new Date(startDate)
        if (!isNaN(parsed.getTime())) {
          return parsed
        }
      }
    }

    return undefined
  }

  async updateProposal(id: string, data: {
    status?: string
    reviewedAt?: Date
    reviewedBy?: string
    appliedBy?: string
    userModifiedChanges?: any
    modificationReason?: string
    modifiedBy?: string
    modifiedAt?: Date
    approvedBlocks?: any
  }) {
    return this.repository.update(id, data)
  }

  async deleteProposal(id: string): Promise<void> {
    await this.repository.delete(id)
  }
}
