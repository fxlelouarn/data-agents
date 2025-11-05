import { PrismaClient, Proposal } from '@prisma/client'
import { NotFoundError } from '../errors'
import { ProposalFilters } from '../services/interfaces'

/**
 * Repository Pattern - Pure data access for Proposals
 * 
 * Responsibilities:
 * - CRUD operations on proposals
 * - Query building and filtering
 * - NO business logic
 * - NO external service calls
 */
export class ProposalRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Find all proposals with optional filters
   */
  async findMany(filters: ProposalFilters = {}) {
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

  /**
   * Find proposal by ID
   */
  async findById(id: string) {
    return this.prisma.proposal.findUnique({
      where: { id },
      include: { agent: true }
    })
  }

  /**
   * Find proposal by ID or throw NotFoundError
   */
  async findByIdOrFail(id: string) {
    const proposal = await this.findById(id)
    if (!proposal) {
      throw new NotFoundError('Proposal', id)
    }
    return proposal
  }

  /**
   * Create a new proposal
   */
  async create(data: {
    agentId: string
    type: string
    eventId?: string
    editionId?: string
    raceId?: string
    changes: any
    justification: any
    confidence?: number
    eventName?: string
    eventCity?: string
    editionYear?: number
    raceName?: string
  }) {
    return this.prisma.proposal.create({
      data: {
        ...data,
        type: data.type as any
      }
    })
  }

  /**
   * Update proposal
   */
  async update(id: string, data: {
    status?: string
    reviewedAt?: Date
    reviewedBy?: string
    userModifiedChanges?: any
    modificationReason?: string
    modifiedBy?: string
    modifiedAt?: Date
  }) {
    return this.prisma.proposal.update({
      where: { id },
      data: {
        ...data,
        status: data.status as any
      }
    })
  }

  /**
   * Delete proposal
   */
  async delete(id: string): Promise<void> {
    await this.prisma.proposal.delete({
      where: { id }
    })
  }

  /**
   * Find proposals by event ID
   */
  async findByEventId(eventId: string) {
    return this.prisma.proposal.findMany({
      where: { eventId },
      include: { agent: true },
      orderBy: { createdAt: 'desc' }
    })
  }

  /**
   * Find proposals by edition ID
   */
  async findByEditionId(editionId: string) {
    return this.prisma.proposal.findMany({
      where: { editionId },
      include: { agent: true },
      orderBy: { createdAt: 'desc' }
    })
  }

  /**
   * Find proposals by race ID
   */
  async findByRaceId(raceId: string) {
    return this.prisma.proposal.findMany({
      where: { raceId },
      include: { agent: true },
      orderBy: { createdAt: 'desc' }
    })
  }

  /**
   * Count proposals by status
   */
  async countByStatus() {
    const proposals = await this.prisma.proposal.groupBy({
      by: ['status'],
      _count: {
        status: true
      }
    })
    
    return proposals.reduce((acc, p) => {
      acc[p.status] = p._count.status
      return acc
    }, {} as Record<string, number>)
  }
}
