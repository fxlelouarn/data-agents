import { PrismaClient } from '@prisma/client'
import { IProposalApplicationService, ProposalApplicationResult, ApplyOptions } from './interfaces'
import { DatabaseManager } from '@data-agents/agent-framework'
import { ProposalRepository } from '../repositories/proposal.repository'
import { ProposalDomainService } from './proposal-domain.service'

/**
 * Proposal Application Service - Facade Pattern
 * 
 * ✅ REFACTORED (Phase 4 - Repository Pattern)
 * 
 * Before: 617 lines with duplicated business logic
 * After: 70 lines - Pure delegation to ProposalDomainService
 * 
 * Responsibilities:
 * - Provide backward-compatible API
 * - Delegate all logic to ProposalDomainService
 * - Initialize dependencies (repositories, domain service)
 * 
 * Architecture:
 * ProposalApplicationService (Facade)
 *   → ProposalDomainService (Business Logic)
 *     → ProposalRepository (Data Access - Data Agents DB)
 *     → MilesRepublicRepository (Data Access - Miles Republic DB)
 */
export class ProposalApplicationService implements IProposalApplicationService {
  private dbManager: DatabaseManager
  private domainService: ProposalDomainService
  
  constructor(private prisma: PrismaClient) {
    const logger = {
      info: (msg: string, data?: any) => console.log(`[INFO] ${msg}`, data || ''),
      error: (msg: string, data?: any) => console.error(`[ERROR] ${msg}`, data || ''),
      warn: (msg: string, data?: any) => console.warn(`[WARN] ${msg}`, data || ''),
      debug: (msg: string, data?: any) => console.debug(`[DEBUG] ${msg}`, data || '')
    }
    this.dbManager = DatabaseManager.getInstance(logger)
    
    const proposalRepo = new ProposalRepository(prisma)
    this.domainService = new ProposalDomainService(proposalRepo, this.dbManager, logger)
  }

  /**
   * Apply a proposal's changes to Miles Republic
   * Main entry point - delegates to domain service
   */
  async applyProposal(
    proposalId: string, 
    selectedChanges: Record<string, any>, 
    options: ApplyOptions = {}
  ): Promise<ProposalApplicationResult> {
    return this.domainService.applyProposal(proposalId, selectedChanges, options)
  }

  /**
   * Apply NEW_EVENT proposal
   * @deprecated Direct usage discouraged - use applyProposal() instead
   */
  async applyNewEvent(
    changes: any, 
    selectedChanges: Record<string, any>, 
    options: ApplyOptions = {}
  ): Promise<ProposalApplicationResult> {
    return this.domainService.applyNewEvent(changes, selectedChanges, options)
  }

  /**
   * Apply EVENT_UPDATE proposal
   * @deprecated Direct usage discouraged - use applyProposal() instead
   */
  async applyEventUpdate(
    eventId: string, 
    changes: any, 
    selectedChanges: Record<string, any>, 
    options: ApplyOptions = {}
  ): Promise<ProposalApplicationResult> {
    return this.domainService.applyEventUpdate(eventId, changes, selectedChanges, options)
  }

  /**
   * Apply EDITION_UPDATE proposal
   * @deprecated Direct usage discouraged - use applyProposal() instead
   */
  async applyEditionUpdate(
    editionId: string, 
    changes: any, 
    selectedChanges: Record<string, any>, 
    options: ApplyOptions = {}
  ): Promise<ProposalApplicationResult> {
    return this.domainService.applyEditionUpdate(editionId, changes, selectedChanges, options)
  }

  /**
   * Apply RACE_UPDATE proposal
   * @deprecated Direct usage discouraged - use applyProposal() instead
   */
  async applyRaceUpdate(
    raceId: string, 
    changes: any, 
    selectedChanges: Record<string, any>, 
    options: ApplyOptions = {}
  ): Promise<ProposalApplicationResult> {
    return this.domainService.applyRaceUpdate(raceId, changes, selectedChanges, options)
  }

  /**
   * Rollback a proposal (NOT IMPLEMENTED)
   * @deprecated Rollback feature not yet implemented
   */
  async rollbackProposal(proposalId: string, rollbackData: any): Promise<ProposalApplicationResult> {
    return {
      success: false,
      appliedChanges: {},
      errors: [{
        field: 'rollback',
        message: 'Le rollback n\'est pas encore implémenté pour le mode direct',
        severity: 'error'
      }]
    }
  }
}
