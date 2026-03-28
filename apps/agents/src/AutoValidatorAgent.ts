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

import { AGENT_VERSIONS, AutoValidatorAgentConfigSchema, getAgentName } from '@data-agents/types'
import { BaseAgent, AgentContext, AgentRunResult, AgentType } from '@data-agents/agent-framework'
import { IAgentStateService, AgentStateService, prisma } from '@data-agents/database'
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
      name: config.name || getAgentName('AUTO_VALIDATOR'),
      description: `Agent qui valide automatiquement les propositions FFA sous certaines conditions (v${AUTO_VALIDATOR_AGENT_VERSION})`,
      type: 'VALIDATOR' as AgentType,
      frequency: config.frequency || '0 * * * *', // Toutes les heures par défaut
      isActive: config.isActive ?? true,
      config: {
        version: AUTO_VALIDATOR_AGENT_VERSION,
        milesRepublicDatabase: config.milesRepublicDatabase || config.config?.milesRepublicDatabase,
        maxProposalsPerRun: config.maxProposalsPerRun || config.config?.maxProposalsPerRun || 100,
        minConfidence: config.minConfidence || config.config?.minConfidence || 0.9,
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
   * Récupère les IDs des agents FFA (Scraper et Results) par agentType
   */
  private async getEligibleAgentIds(): Promise<string[]> {
    const agents = await this.prisma.agent.findMany({
      where: {
        OR: [
          { config: { path: ['agentType'], equals: 'FFA_SCRAPER' } },
          { config: { path: ['agentType'], equals: 'FFA_RESULTS' } },
          { config: { path: ['agentType'], equals: 'SLACK_EVENT' } }
        ]
      },
      select: { id: true }
    })
    return agents.map(a => a.id)
  }

  /**
   * Récupère les editionIds éligibles depuis Miles Republic
   * Critères: event.isFeatured = false/null (on exclut les featured)
   *
   * Note: On n'exclut plus customerType != null ici car les propositions
   * MR internes (justificationType: 'mr_internal') sont valides même pour
   * les éditions premium - c'est notre propre donnée.
   * Le filtrage sur customerType se fait dans validator.ts avec exception
   * pour les propositions MR internes.
   */
  private async getEligibleEditionIds(editionIds: number[]): Promise<Set<number>> {
    if (editionIds.length === 0) return new Set()

    // Limiter à 5000 IDs pour éviter des requêtes trop lourdes
    const limitedIds = editionIds.slice(0, 5000)

    // On filtre uniquement sur isFeatured, pas sur customerType
    // Les propositions MR internes pour éditions premium sont valides
    const eligibleEditions = await this.sourceDb.edition.findMany({
      where: {
        id: { in: limitedIds },
        event: {
          OR: [
            { isFeatured: false },
            { isFeatured: null }
          ]
        }
      },
      select: { id: true }
    })

    return new Set(eligibleEditions.map((e: { id: number }) => e.id))
  }

  /**
   * Récupère les propositions éligibles pour la validation automatique
   * Retourne les propositions (limitées) et le compte total
   *
   * IMPORTANT: On exclut les propositions avec racesToAdd car elles créent
   * de nouvelles courses, ce que l'auto-validateur ne peut pas faire.
   *
   * IMPORTANT: On pré-filtre les éditions via Miles Republic pour exclure
   * les éditions premium (customerType != null) et les événements featured,
   * évitant ainsi une boucle infinie sur des propositions non-éligibles.
   */
  private async getEligibleProposals(
    ffaAgentIds: string[],
    config: AutoValidatorConfig
  ): Promise<{ proposals: any[]; totalCount: number }> {
    if (ffaAgentIds.length === 0) {
      return { proposals: [], totalCount: 0 }
    }

    // Construire la clause IN pour les IDs d'agents
    const agentIdPlaceholders = ffaAgentIds.map((_, i) => `$${i + 1}`).join(', ')

    // ÉTAPE 1: Récupérer tous les editionIds PENDING distincts
    const pendingEditionIds = await this.prisma.$queryRawUnsafe<{ editionId: string }[]>(
      `SELECT DISTINCT p."editionId"
       FROM proposals p
       WHERE p.status = 'PENDING'
         AND p.type = 'EDITION_UPDATE'
         AND p."agentId" IN (${agentIdPlaceholders})
         AND p."editionId" IS NOT NULL`,
      ...ffaAgentIds
    )

    if (pendingEditionIds.length === 0) {
      return { proposals: [], totalCount: 0 }
    }

    // ÉTAPE 2: Filtrer via Miles Republic (exclure premium et featured)
    const editionIdsInt = pendingEditionIds.map(r => parseInt(r.editionId)).filter(id => !isNaN(id))
    const eligibleEditionIds = await this.getEligibleEditionIds(editionIdsInt)

    if (eligibleEditionIds.size === 0) {
      this.logger.info(`⚠️  Aucune édition éligible parmi ${editionIdsInt.length} propositions PENDING (toutes premium ou featured)`)
      return { proposals: [], totalCount: 0 }
    }

    this.logger.info(`📊 ${eligibleEditionIds.size}/${editionIdsInt.length} éditions éligibles (non-premium, non-featured)`)

    // ÉTAPE 3: Construire le filtre SQL avec les editionIds éligibles
    const eligibleIdsArray = Array.from(eligibleEditionIds)
    const editionIdPlaceholders = eligibleIdsArray.map((_, i) => `$${ffaAgentIds.length + i + 1}`).join(', ')

    // Requête SQL brute — accepte les propositions avec 0 à 3 racesToAdd
    // minConfidence filtré directement en SQL pour éviter de recharger les mêmes propositions à chaque run
    const minConfidenceParamIndex = ffaAgentIds.length + eligibleIdsArray.length + 1
    const whereClause = `
      p.status = 'PENDING'
      AND p.type = 'EDITION_UPDATE'
      AND p."agentId" IN (${agentIdPlaceholders})
      AND p."editionId"::int IN (${editionIdPlaceholders})
      AND p."eventId" IS NOT NULL
      AND p.confidence >= $${minConfidenceParamIndex}
      AND (
        p.changes->'racesToAdd' IS NULL
        OR p.changes->'racesToAdd' = 'null'::jsonb
        OR jsonb_array_length(COALESCE(p.changes->'racesToAdd'->'new', p.changes->'racesToAdd', '[]'::jsonb)) <= 3
      )
    `

    const baseParams = [...ffaAgentIds, ...eligibleIdsArray, config.minConfidence]

    // Compter le total de propositions éligibles (sans racesToAdd, sans premium, confidence >= min)
    const countResult = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) as count FROM proposals p WHERE ${whereClause}`,
      ...baseParams
    )
    const totalCount = Number(countResult[0]?.count || 0)

    // Récupérer les propositions avec limite
    const limitParamIndex = minConfidenceParamIndex + 1
    const proposals = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT p.*, a.name as "agentName"
       FROM proposals p
       LEFT JOIN agents a ON p."agentId" = a.id
       WHERE ${whereClause}
       ORDER BY p."createdAt" ASC
       LIMIT $${limitParamIndex}`,
      ...baseParams,
      config.maxProposalsPerRun
    )

    // ÉTAPE 4: Récupérer les NEW_EVENT éligibles (haute confiance + LLM review)
    const newEventProposals = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT p.*, a.name as "agentName"
       FROM proposals p
       LEFT JOIN agents a ON p."agentId" = a.id
       WHERE p.status = 'PENDING'
         AND p.type = 'NEW_EVENT'
         AND p."agentId" IN (${agentIdPlaceholders})
         AND p.confidence >= ${config.minConfidence}
       ORDER BY p."createdAt" ASC
       LIMIT $${limitParamIndex}`,
      ...ffaAgentIds,
      ...eligibleIdsArray,
      config.maxProposalsPerRun
    )

    const allProposals = [...proposals, ...newEventProposals]
    const newEventCount = newEventProposals.length

    if (newEventCount > 0) {
      this.logger.info(`📊 ${newEventCount} propositions NEW_EVENT éligibles (confidence >= ${config.minConfidence})`)
    }

    // Reformater pour correspondre à l'ancienne structure
    return {
      proposals: allProposals.map(p => ({
        ...p,
        agent: { name: p.agentName }
      })),
      totalCount: totalCount + newEventCount
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
    const isNewEvent = proposal.type === 'NEW_EVENT'

    if (isNewEvent) {
      // NEW_EVENT: validate all blocks at once (event + edition + organizer + races)
      blocksToValidate.push('event', 'edition')
      if (changes.edition?.new?.organizer) {
        blocksToValidate.push('organizer')
      }
      if (changes.edition?.new?.races?.length > 0) {
        blocksToValidate.push('races')
      }
    } else {
      // EDITION_UPDATE: validate blocks individually
      // Bloc edition
      if (config.enableEditionBlock) {
        const editionFields = ['startDate', 'endDate', 'calendarStatus', 'timeZone',
          'registrationClosingDate', 'registrationOpeningDate', 'registrantsNumber']
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
        const hasRaceChanges = changes.racesToUpdate || changes.racesToAdd || changes.races
        if (hasRaceChanges) {
          blocksToValidate.push('races')
        }
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
    const expectedBlocks = new Set<string>(blocksToValidate)

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
      'registrationClosingDate', 'registrationOpeningDate', 'year', 'registrantsNumber']
    const eventFields = ['name', 'city', 'country', 'websiteUrl', 'facebookUrl', 'instagramUrl',
      'dataSource', 'countrySubdivisionNameLevel1', 'countrySubdivisionDisplayCodeLevel1',
      'countrySubdivisionNameLevel2', 'countrySubdivisionDisplayCodeLevel2']
    const organizerFields = ['organizer']
    const racesFields = ['racesToAdd', 'racesToUpdate', 'racesToDelete', 'races']

    Object.entries(changes).forEach(([key, value]) => {
      if (block === 'event' && eventFields.includes(key)) {
        filtered[key] = value
      } else if (block === 'edition' && editionFields.includes(key)) {
        filtered[key] = value
      } else if (block === 'organizer' && organizerFields.includes(key)) {
        filtered[key] = value
      } else if (block === 'races' && racesFields.includes(key)) {
        filtered[key] = value
      }
    })

    // For NEW_EVENT, the 'edition' block contains the whole edition.new object
    if (block === 'edition' && changes.edition) {
      filtered.edition = changes.edition
    }

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

      // Récupérer les IDs des agents FFA (Scraper et Results)
      const ffaAgentIds = await this.getEligibleAgentIds()
      if (ffaAgentIds.length === 0) {
        context.logger.warn('⚠️  Aucun agent FFA (Scraper ou Results) trouvé en base')
        return {
          success: true,
          message: 'No FFA agents found - nothing to validate',
          metrics: runResult
        }
      }

      context.logger.info(`📌 Agents FFA trouvés: ${ffaAgentIds.join(', ')}`)

      // Récupérer les propositions éligibles
      const { proposals, totalCount } = await this.getEligibleProposals(ffaAgentIds, config)
      runResult.proposalsAnalyzed = proposals.length

      context.logger.info(`📊 ${proposals.length}/${totalCount} propositions en attente (EDITION_UPDATE + NEW_EVENT)`)

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
