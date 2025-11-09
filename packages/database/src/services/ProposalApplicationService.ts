import { PrismaClient } from '@prisma/client'
import { IProposalApplicationService, ProposalApplicationResult, ApplyOptions } from './interfaces'
import { ProposalRepository } from '../repositories/proposal.repository'
import { ProposalDomainService } from './proposal-domain.service'

// DatabaseManager type to avoid circular dependency
type DatabaseManager = any

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
  
  constructor(private prisma: PrismaClient, dbManager?: DatabaseManager) {
    const logger = {
      info: (msg: string, data?: any) => console.log(`[INFO] ${msg}`, data || ''),
      error: (msg: string, data?: any) => console.error(`[ERROR] ${msg}`, data || ''),
      warn: (msg: string, data?: any) => console.warn(`[WARN] ${msg}`, data || ''),
      debug: (msg: string, data?: any) => console.debug(`[DEBUG] ${msg}`, data || '')
    }
    
    // Use provided dbManager or throw error (will be provided by API)
    if (!dbManager) {
      throw new Error('DatabaseManager must be provided to ProposalApplicationService')
    }
    this.dbManager = dbManager
    
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
    // If capturedLogs is provided, override logger to capture logs
    if (options.capturedLogs) {
      const capturedLogger = {
        info: (msg: string, data?: any) => {
          let logMsg = msg
          if (data !== undefined && data !== null && data !== '') {
            // Si data est un objet, le stringify (mais pas pour l'affichage UI)
            if (typeof data === 'object') {
              // Ne pas ajouter le JSON dans l'UI, trop verbeux
              logMsg = msg
            } else {
              logMsg = `${msg} ${data}`
            }
          }
          options.capturedLogs!.push(logMsg)
          console.log(`[INFO] ${msg}`, data || '')
        },
        error: (msg: string, data?: any) => {
          let logMsg = msg
          if (data !== undefined && data !== null && data !== '') {
            if (typeof data === 'object') {
              logMsg = msg
            } else {
              logMsg = `${msg} ${data}`
            }
          }
          options.capturedLogs!.push(`❌ ${logMsg}`)
          console.error(`[ERROR] ${msg}`, data || '')
        },
        warn: (msg: string, data?: any) => {
          let logMsg = msg
          if (data !== undefined && data !== null && data !== '') {
            if (typeof data === 'object') {
              logMsg = msg
            } else {
              logMsg = `${msg} ${data}`
            }
          }
          options.capturedLogs!.push(`⚠️ ${logMsg}`)
          console.warn(`[WARN] ${msg}`, data || '')
        },
        debug: (msg: string, data?: any) => {
          console.debug(`[DEBUG] ${msg}`, data || '')
        }
      }
      
      // Create a temporary domain service with captured logger
      const proposalRepo = new ProposalRepository(this.prisma)
      const tempDomainService = new ProposalDomainService(proposalRepo, this.dbManager, capturedLogger)
      return tempDomainService.applyProposal(proposalId, selectedChanges, options)
    }
    
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
