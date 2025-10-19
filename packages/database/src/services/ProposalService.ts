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
    return this.prisma.proposal.create({
      data: {
        ...data,
        type: data.type as any
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