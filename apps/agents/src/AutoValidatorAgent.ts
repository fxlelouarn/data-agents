/**
 * Agent Auto-Validateur de Propositions
 *
 * Cet agent valide automatiquement les propositions EDITION_UPDATE de l'agent FFA
 * sous certaines conditions strictes:
 * - Event.isFeatured = false/null
 * - Edition.customerType = null
 * - Pas de création de nouvelles courses (tous les raceId doivent exister)
 *
 * @see docs/feature-auto-validator-agent/PLAN.md
 */

import { AGENT_VERSIONS } from '@data-agents/types'
import { BaseAgent, AgentContext, AgentRunResult, AgentType } from '@data-agents/agent-framework'
import { IAgentStateService, AgentStateService, prisma } from '@data-agents/database'
import { AutoValidatorAgentConfigSchema } from './AutoValidatorAgent.configSchema'
import {
  AutoValidatorConfig,
  AutoValidatorRunResult,
  AutoValidatorStats,
  ValidationResult,
  ExclusionReason
} from './auto-validator/types'
import { validateProposal } from './auto-validator/validator'

// Version exportée pour compatibilité
export const AUTO_VALIDATOR_AGENT_VERSION = AGENT_VERSIONS.AUTO_VALIDATOR_AGENT

export class AutoValidatorAgent extends BaseAgent {
  private sourceDb: any
  private stateService: IAgentStateService
  private prisma: typeof prisma

  constructor(config: any, db?: any, logger?: any) {
    const agentConfig = {
      id: config.id || 'auto-validator-agent',
      name: config.name || 'Auto Validator Agent',
      description: `Agent qui valide automatiquement les propositions FFA sous certaines conditions (v${AUTO_VALIDATOR_AGENT_VERSION})`,
      type: 'VALIDATOR' as AgentType,
      frequency: config.frequency || '0 * * * *', // Toutes les heures par défaut
      isActive: config.isActive ?? true,
      config: {
        version: AUTO_VALIDATOR_AGENT_VERSION,
        milesRepublicDatabase: config.milesRepublicDatabase || config.config?.milesRepublicDatabase,
        maxProposalsPerRun: config.maxProposalsPerRun || config.config?.maxProposalsPerRun || 100,
        minConfidence: config.minConfidence || config.config?.minConfidence || 0.7,
        enableEditionBlock: config.enableEditionBlock ?? config.config?.enableEditionBlock ?? true,
        enableOrganizerBlock: config.enableOrganizerBlock ?? config.config?.enableOrganizerBlock ?? true,
        enableRacesBlock: config.enableRacesBlock ?? config.config?.enableRacesBlock ?? true,
        dryRun: config.dryRun ?? config.config?.dryRun ?? false,
        configSchema: AutoValidatorAgentConfigSchema
      }
    }

    super(agentConfig, db, logger)
    this.prisma = prisma
    this.stateService = new AgentStateService(prisma)
  }

  /**
   * Initialise la connexion à Miles Republic
   */
  private async initializeSourceConnection(config: AutoValidatorConfig): Promise<void> {
    if (!this.sourceDb) {
      this.sourceDb = await this.connectToSource(config.milesRepublicDatabase)
    }
  }

  /**
   * Charge les statistiques globales de l'agent
   */
  private async loadStats(): Promise<AutoValidatorStats> {
    const stats = await this.stateService.getState<AutoValidatorStats>(
      this.config.id,
      'stats'
    )

    if (stats) {
      return stats
    }

    // Stats initiales
    return {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      totalProposalsAnalyzed: 0,
      totalProposalsValidated: 0,
      totalProposalsIgnored: 0,
      totalEligibleProposals: 0,
      exclusionBreakdown: {
        featuredEvent: 0,
        premiumCustomer: 0,
        newRaces: 0,
        lowConfidence: 0,
        otherAgent: 0
      },
      lastRunAt: new Date().toISOString()
    }
  }

  /**
   * Sauvegarde les statistiques globales
   */
  private async saveStats(stats: AutoValidatorStats): Promise<void> {
    await this.stateService.setState(this.config.id, 'stats', stats)
  }

  /**
   * Récupère l'ID de l'agent FFA Scraper
   */
  private async getFFAScraperAgentId(): Promise<string | null> {
    const ffaAgent = await this.prisma.agent.findFirst({
      where: {
        OR: [
          { name: 'FFA Scraper Agent' },
          { name: 'FFA Scraper' },
          { id: 'ffa-scraper-agent' }
        ]
      },
      select: { id: true }
    })
    return ffaAgent?.id || null
  }

  /**
   * Récupère les propositions éligibles pour la validation automatique
   * Retourne les propositions (limitées) et le compte total
   *
   * IMPORTANT: On exclut les propositions avec racesToAdd car elles créent
   * de nouvelles courses, ce que l'auto-validateur ne peut pas faire.
   */
  private async getEligibleProposals(
    ffaAgentId: string,
    config: AutoValidatorConfig
  ): Promise<{ proposals: any[]; totalCount: number }> {
    // Requête SQL brute pour exclure les propositions avec racesToAdd
    // car Prisma ne supporte pas bien les requêtes JSONB complexes
    const whereClause = `
      p.status = 'PENDING'
      AND p.type = 'EDITION_UPDATE'
      AND p."agentId" = $1
      AND (
        p.changes->'racesToAdd' IS NULL
        OR p.changes->'racesToAdd' = 'null'::jsonb
        OR jsonb_array_length(COALESCE(p.changes->'racesToAdd'->'new', p.changes->'racesToAdd', '[]'::jsonb)) = 0
      )
    `

    // Compter le total de propositions éligibles (sans racesToAdd)
    const countResult = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) as count FROM proposals p WHERE ${whereClause}`,
      ffaAgentId
    )
    const totalCount = Number(countResult[0]?.count || 0)

    // Récupérer les propositions avec limite
    const proposals = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT p.*, a.name as "agentName"
       FROM proposals p
       LEFT JOIN agents a ON p."agentId" = a.id
       WHERE ${whereClause}
       ORDER BY p."createdAt" ASC
       LIMIT $2`,
      ffaAgentId,
      config.maxProposalsPerRun
    )

    // Reformater pour correspondre à l'ancienne structure
    return {
      proposals: proposals.map(p => ({
        ...p,
        agent: { name: p.agentName }
      })),
      totalCount
    }
  }

  /**
   * Valide les blocs d'une proposition et crée les ProposalApplication
   */
  private async validateAndApproveProposal(
    proposal: any,
    config: AutoValidatorConfig,
    context: AgentContext
  ): Promise<{ blocksValidated: string[], applicationIds: string[] }> {
    const blocksToValidate: string[] = []
    const applicationIds: string[] = []

    // Déterminer les blocs à valider selon la configuration
    const changes = proposal.changes as Record<string, any>

    // Bloc edition
    if (config.enableEditionBlock) {
      const editionFields = ['startDate', 'endDate', 'calendarStatus', 'timeZone',
        'registrationClosingDate', 'registrationOpeningDate']
      const hasEditionChanges = editionFields.some(field => changes[field] !== undefined)
      if (hasEditionChanges) {
        blocksToValidate.push('edition')
      }
    }

    // Bloc organizer
    if (config.enableOrganizerBlock && changes.organizer) {
      blocksToValidate.push('organizer')
    }

    // Bloc races (seulement si pas de nouvelles courses)
    if (config.enableRacesBlock) {
      const hasRaceChanges = changes.racesToUpdate || changes.races
      if (hasRaceChanges) {
        blocksToValidate.push('races')
      }
    }

    if (blocksToValidate.length === 0) {
      context.logger.info(`⏭️  Aucun bloc à valider pour la proposition ${proposal.id}`)
      return { blocksValidated: [], applicationIds: [] }
    }

    // Mode dry run: ne pas appliquer les modifications
    if (config.dryRun) {
      context.logger.info(`🧪 [DRY RUN] Proposition ${proposal.id} aurait été validée`, {
        blocks: blocksToValidate,
        eventName: proposal.eventName
      })
      return { blocksValidated: blocksToValidate, applicationIds: [] }
    }

    // Mettre à jour les blocs approuvés
    const existingApprovedBlocks = (proposal.approvedBlocks as Record<string, boolean>) || {}
    const newApprovedBlocks = { ...existingApprovedBlocks }
    blocksToValidate.forEach(block => {
      newApprovedBlocks[block] = true
    })

    // Créer une ProposalApplication pour chaque bloc validé
    for (const block of blocksToValidate) {
      // Vérifier si une application existe déjà pour ce bloc
      const existingApp = await this.prisma.proposalApplication.findFirst({
        where: {
          proposalId: proposal.id,
          blockType: block,
          status: { in: ['PENDING', 'APPLIED'] }
        }
      })

      if (existingApp) {
        context.logger.info(`ℹ️  Application déjà existante pour bloc "${block}" de ${proposal.id}`)
        continue
      }

      // Filtrer les changements par bloc
      const filteredChanges = this.filterChangesByBlock(changes, block)

      // Créer la nouvelle application
      const application = await this.prisma.proposalApplication.create({
        data: {
          proposalId: proposal.id,
          proposalIds: [proposal.id],
          blockType: block,
          status: 'PENDING',
          appliedChanges: filteredChanges,
          logs: [`Auto-validated by Auto Validator Agent v${AUTO_VALIDATOR_AGENT_VERSION}`]
        }
      })

      applicationIds.push(application.id)
      context.logger.info(`✅ ProposalApplication créée pour bloc "${block}"`, {
        applicationId: application.id,
        proposalId: proposal.id
      })
    }

    // Déterminer si tous les blocs attendus sont validés
    const expectedBlocks = new Set<string>()
    const editionFields = ['startDate', 'endDate', 'calendarStatus', 'timeZone',
      'registrationClosingDate', 'registrationOpeningDate']

    if (editionFields.some(field => changes[field] !== undefined)) {
      expectedBlocks.add('edition')
    }
    if (changes.organizer) {
      expectedBlocks.add('organizer')
    }
    if (changes.racesToUpdate || changes.races) {
      expectedBlocks.add('races')
    }

    const allBlocksValidated = expectedBlocks.size > 0 &&
      Array.from(expectedBlocks).every(block => newApprovedBlocks[block] === true)

    // Mettre à jour la proposition
    const newStatus = allBlocksValidated ? 'APPROVED' : 'PARTIALLY_APPROVED'

    await this.prisma.proposal.update({
      where: { id: proposal.id },
      data: {
        approvedBlocks: newApprovedBlocks,
        status: newStatus,
        reviewedAt: new Date(),
        reviewedBy: 'auto-validator-agent'
      }
    })

    context.logger.info(`📝 Proposition ${proposal.id} mise à jour`, {
      status: newStatus,
      approvedBlocks: Object.keys(newApprovedBlocks).filter(k => newApprovedBlocks[k])
    })

    // ✅ AUTO-ARCHIVAGE : Archiver les autres propositions PENDING du même groupe
    // Quand une proposition est validée, les autres du même groupe deviennent obsolètes
    if (proposal.eventId && proposal.editionId) {
      const otherPendingProposals = await this.prisma.proposal.findMany({
        where: {
          eventId: proposal.eventId,
          editionId: proposal.editionId,
          id: { not: proposal.id },
          status: 'PENDING'
        }
      })

      if (otherPendingProposals.length > 0) {
        await this.prisma.proposal.updateMany({
          where: {
            id: { in: otherPendingProposals.map(p => p.id) }
          },
          data: {
            status: 'ARCHIVED',
            reviewedAt: new Date(),
            reviewedBy: 'auto-validator-agent',
            modificationReason: `Auto-archived: superseded by validated proposal ${proposal.id}`
          }
        })

        context.logger.info(`🗄️ Auto-archivage: ${otherPendingProposals.length} proposition(s) PENDING archivée(s)`, {
          archivedIds: otherPendingProposals.map(p => p.id),
          reason: 'superseded by auto-validated proposal'
        })
      }
    }

    return { blocksValidated: blocksToValidate, applicationIds }
  }

  /**
   * Filtre les changements par type de bloc
   */
  private filterChangesByBlock(changes: Record<string, any>, block: string): Record<string, any> {
    const filtered: Record<string, any> = {}

    const editionFields = ['startDate', 'endDate', 'calendarStatus', 'timeZone',
      'registrationClosingDate', 'registrationOpeningDate', 'year']
    const organizerFields = ['organizer']
    const racesFields = ['racesToAdd', 'racesToUpdate', 'racesToDelete', 'races']

    Object.entries(changes).forEach(([key, value]) => {
      if (block === 'edition' && editionFields.includes(key)) {
        filtered[key] = value
      } else if (block === 'organizer' && organizerFields.includes(key)) {
        filtered[key] = value
      } else if (block === 'races' && racesFields.includes(key)) {
        filtered[key] = value
      }
    })

    return filtered
  }

  /**
   * Méthode principale d'exécution
   */
  async run(context: AgentContext): Promise<AgentRunResult> {
    const config = this.config.config as AutoValidatorConfig
    const runResult: AutoValidatorRunResult = {
      proposalsAnalyzed: 0,
      proposalsValidated: 0,
      proposalsIgnored: 0,
      exclusionReasons: {
        featuredEvent: 0,
        premiumCustomer: 0,
        newRaces: 0,
        lowConfidence: 0,
        otherAgent: 0
      },
      processedProposals: []
    }

    try {
      context.logger.info(`🚀 Démarrage Auto Validator Agent v${AUTO_VALIDATOR_AGENT_VERSION}`, {
        version: AUTO_VALIDATOR_AGENT_VERSION,
        maxProposalsPerRun: config.maxProposalsPerRun,
        minConfidence: config.minConfidence,
        dryRun: config.dryRun,
        timestamp: new Date().toISOString()
      })

      // Initialiser la connexion Miles Republic
      await this.initializeSourceConnection(config)

      if (!this.sourceDb) {
        throw new Error(`Échec de la connexion à Miles Republic: ${config.milesRepublicDatabase}`)
      }

      context.logger.info('✅ Connexion à Miles Republic établie')

      // Récupérer l'ID de l'agent FFA
      const ffaAgentId = await this.getFFAScraperAgentId()
      if (!ffaAgentId) {
        context.logger.warn('⚠️  Agent FFA Scraper non trouvé en base')
        return {
          success: true,
          message: 'FFA Scraper agent not found - nothing to validate',
          metrics: runResult
        }
      }

      context.logger.info(`📌 Agent FFA trouvé: ${ffaAgentId}`)

      // Récupérer les propositions éligibles
      const { proposals, totalCount } = await this.getEligibleProposals(ffaAgentId, config)
      runResult.proposalsAnalyzed = proposals.length

      context.logger.info(`📊 ${proposals.length}/${totalCount} propositions EDITION_UPDATE en attente`)

      if (proposals.length === 0) {
        // Mettre à jour totalEligibleProposals même si aucune proposition
        const stats = await this.loadStats()
        stats.totalEligibleProposals = totalCount
        await this.saveStats(stats)

        return {
          success: true,
          message: 'No eligible proposals to validate',
          metrics: runResult
        }
      }

      // Traiter chaque proposition
      for (const proposal of proposals) {
        context.logger.info(`🔍 Analyse proposition ${proposal.id}`, {
          eventName: proposal.eventName,
          eventId: proposal.eventId,
          editionId: proposal.editionId,
          confidence: proposal.confidence
        })

        // Valider la proposition avec toutes les vérifications
        const validationResult = await validateProposal(
          proposal,
          this.sourceDb,
          config,
          this.logger
        )

        if (!validationResult.isValid) {
          // Proposition non éligible
          runResult.proposalsIgnored++
          runResult.processedProposals.push({
            id: proposal.id,
            eventName: proposal.eventName || 'Unknown',
            action: 'ignored',
            reason: validationResult.reason
          })

          // Incrémenter le compteur de la raison d'exclusion
          if (validationResult.exclusionReason) {
            runResult.exclusionReasons[validationResult.exclusionReason]++
          }

          context.logger.info(`⏭️  Proposition ignorée: ${validationResult.reason}`, {
            proposalId: proposal.id,
            exclusionReason: validationResult.exclusionReason
          })
          continue
        }

        // Valider et approuver la proposition
        const { blocksValidated, applicationIds } = await this.validateAndApproveProposal(
          proposal,
          config,
          context
        )

        if (blocksValidated.length > 0) {
          runResult.proposalsValidated++
          runResult.processedProposals.push({
            id: proposal.id,
            eventName: proposal.eventName || 'Unknown',
            action: 'validated',
            blocksValidated,
            applicationIds
          })

          context.logger.info(`✅ Proposition validée: ${proposal.eventName}`, {
            proposalId: proposal.id,
            blocksValidated,
            applicationIds
          })
        } else {
          runResult.proposalsIgnored++
          runResult.processedProposals.push({
            id: proposal.id,
            eventName: proposal.eventName || 'Unknown',
            action: 'ignored',
            reason: 'No blocks to validate'
          })
        }
      }

      // Mettre à jour les statistiques globales
      const stats = await this.loadStats()
      stats.totalRuns++
      stats.successfulRuns++
      stats.totalProposalsAnalyzed += runResult.proposalsAnalyzed
      stats.totalProposalsValidated += runResult.proposalsValidated
      stats.totalProposalsIgnored += runResult.proposalsIgnored
      stats.totalEligibleProposals = totalCount  // Nombre actuel de propositions éligibles
      stats.exclusionBreakdown.featuredEvent += runResult.exclusionReasons.featuredEvent
      stats.exclusionBreakdown.premiumCustomer += runResult.exclusionReasons.premiumCustomer
      stats.exclusionBreakdown.newRaces += runResult.exclusionReasons.newRaces
      stats.exclusionBreakdown.lowConfidence += runResult.exclusionReasons.lowConfidence
      stats.exclusionBreakdown.otherAgent += runResult.exclusionReasons.otherAgent
      stats.lastRunAt = new Date().toISOString()
      await this.saveStats(stats)

      context.logger.info(`✅ Validation terminée`, {
        analyzed: runResult.proposalsAnalyzed,
        validated: runResult.proposalsValidated,
        ignored: runResult.proposalsIgnored,
        dryRun: config.dryRun
      })

      return {
        success: true,
        message: `Validated ${runResult.proposalsValidated}/${runResult.proposalsAnalyzed} proposals${config.dryRun ? ' (DRY RUN)' : ''}`,
        metrics: runResult
      }
    } catch (error) {
      context.logger.error('❌ Erreur lors de la validation automatique', { error: String(error) })

      // Mettre à jour les stats en cas d'échec
      const stats = await this.loadStats()
      stats.totalRuns++
      stats.failedRuns++
      stats.lastRunAt = new Date().toISOString()
      await this.saveStats(stats)

      throw error
    }
  }

  /**
   * Validation de la configuration
   */
  async validate(): Promise<boolean> {
    const config = this.config.config as AutoValidatorConfig

    if (!config.milesRepublicDatabase) {
      this.logger.error('milesRepublicDatabase est requis dans la configuration')
      return false
    }

    if (config.minConfidence < 0.5 || config.minConfidence > 1.0) {
      this.logger.error('minConfidence doit être entre 0.5 et 1.0')
      return false
    }

    if (config.maxProposalsPerRun < 10 || config.maxProposalsPerRun > 500) {
      this.logger.error('maxProposalsPerRun doit être entre 10 et 500')
      return false
    }

    return true
  }
}

export default AutoValidatorAgent
