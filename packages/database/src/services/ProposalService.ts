import { PrismaClient } from '@prisma/client'
import { IProposalService, ProposalFilters } from './interfaces'

export class ProposalService implements IProposalService {
  constructor(private prisma: PrismaClient) {}

  async getProposals(filters: ProposalFilters = {}) {
    const whereClause: any = {}
    
    if (filters.status) whereClause.status = filters.status as any
    if (filters.type) whereClause.type = filters.type as any
    if (filters.eventId) whereClause.eventId = filters.eventId
    if (filters.editionId) whereClause.editionId = filters.editionId
    if (filters.agentId) whereClause.agentId = filters.agentId

    return this.prisma.proposal.findMany({
      where: whereClause,
      include: {
        agent: {
          select: { name: true, type: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  async getProposal(id: string) {
    return this.prisma.proposal.findUnique({
      where: { id }
    })
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
    
    return this.prisma.proposal.create({
      data: {
        ...data,
        type: data.type as any,
        eventName,
        eventCity,
        editionYear,
        raceName
      }
    })
  }

  async updateProposal(id: string, data: {
    status?: string
    reviewedAt?: Date
    reviewedBy?: string
  }) {
    return this.prisma.proposal.update({
      where: { id },
      data: {
        ...data,
        status: data.status as any
      }
    })
  }

  async deleteProposal(id: string): Promise<void> {
    await this.prisma.proposal.delete({
      where: { id }
    })
  }
}