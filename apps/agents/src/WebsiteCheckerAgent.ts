import { AGENT_VERSIONS, WebsiteCheckerAgentConfigSchema, getAgentName } from '@data-agents/types'
import { BaseAgent, AgentType } from '@data-agents/agent-framework'
import { IAgentStateService, AgentStateService, prisma } from '@data-agents/database'
import type { AgentContext, AgentRunResult } from '@data-agents/agent-framework'

import { checkUrl } from './website-checker/url-checker'
import { analyzePage } from './website-checker/page-analyzer'
import { computeFinalConfidence } from './website-checker/confidence'
import type {
  WebsiteCheckerConfig,
  EditionTarget,
  UrlCheckResult,
  UrlCheckResultWithAnalysis,
  EditionCheckResult,
  ConfirmationProgress,
  ConfirmationStats,
} from './website-checker/types'

export const WEBSITE_CHECKER_AGENT_VERSION = AGENT_VERSIONS.WEBSITE_CHECKER_AGENT

export class WebsiteCheckerAgent extends BaseAgent {
  private sourceDb: any
  private stateService: IAgentStateService
  private prisma: typeof prisma

  constructor(config: any, db?: any, logger?: any) {
    const agentConfig = {
      id: config.id || 'website-checker-agent',
      name: config.name || getAgentName('WEBSITE_CHECKER'),
      description: `Agent qui vérifie les URLs des éditions TO_BE_CONFIRMED et propose des mises à jour de statut (v${WEBSITE_CHECKER_AGENT_VERSION})`,
      type: 'EXTRACTOR' as AgentType,
      frequency: config.frequency || '0 */8 * * *',
      isActive: config.isActive ?? true,
      config: {
        version: WEBSITE_CHECKER_AGENT_VERSION,
        sourceDatabase: config.config?.sourceDatabase,
        batchSize: config.config?.batchSize || 30,
        cooldownDays: config.config?.cooldownDays || 14,
        lookAheadMonths: config.config?.lookAheadMonths || 3,
        requestDelayMs: config.config?.requestDelayMs || 3000,
        requestTimeoutMs: config.config?.requestTimeoutMs || 10000,
        anthropicApiKey: config.config?.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
        llmModel: config.config?.llmModel || 'claude-haiku-4-5-20251001',
        dryRun: config.config?.dryRun ?? false,
        ...config.config,
        configSchema: WebsiteCheckerAgentConfigSchema,
      },
    }

    super(agentConfig, db, logger)
    this.prisma = prisma
    this.stateService = new AgentStateService(prisma)
  }

  async run(context: AgentContext): Promise<AgentRunResult> {
    const config = this.config.config as WebsiteCheckerConfig

    try {
      context.logger.info(`Démarrage Website Checker Agent v${WEBSITE_CHECKER_AGENT_VERSION}`, {
        version: WEBSITE_CHECKER_AGENT_VERSION,
        batchSize: config.batchSize,
        cooldownDays: config.cooldownDays,
        lookAheadMonths: config.lookAheadMonths,
        sourceDatabase: config.sourceDatabase,
        dryRun: config.dryRun,
        timestamp: new Date().toISOString(),
      })

      // 1. Initialize source connection
      context.logger.info('Initialisation de la connexion source...', { sourceDatabase: config.sourceDatabase })
      this.sourceDb = await this.connectToSource(config.sourceDatabase)
      context.logger.info('Connexion source initialisée avec succès')

      // 2. Load progress from state
      const progress = await this.loadProgress()
      const offset = progress.lastOffset
      const stats: ConfirmationStats = { ...progress.stats }

      context.logger.info(`Reprise depuis offset ${offset}`)

      // 3. Get TO_BE_CONFIRMED editions with URLs
      context.logger.info(`Récupération des éditions TO_BE_CONFIRMED (batch: ${config.batchSize}, offset: ${offset})`)
      const targets = await this.getEditionTargets(config, offset)

      context.logger.info(`${targets.length} édition(s) récupérée(s)`)

      if (targets.length === 0) {
        // Reset offset to start over on the next run
        await this.saveProgress({
          lastOffset: 0,
          lastRunAt: new Date().toISOString(),
          stats,
        })
        context.logger.info('Fin du parcours des éditions, remise à zéro de l\'offset')
        return {
          success: true,
          message: 'Parcours complet terminé, recommence du début au prochain run',
        }
      }

      let proposalsCreated = 0

      // 4. Process each target
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i]
        context.logger.info(
          `[Édition ${i + 1}/${targets.length}] Traitement: ${target.eventName} (${target.eventCity}) - édition ${target.editionYear}`,
          { editionId: target.editionId, eventId: target.eventId }
        )

        try {
          // a. Check cooldown
          const inCooldown = await this.isInCooldown(target.editionId, config.cooldownDays)
          if (inCooldown) {
            context.logger.info(`Édition en cooldown (${config.cooldownDays} jours) - ignorée: ${target.eventName} ${target.editionYear}`)
            stats.totalChecked++
            stats.inconclusive++
            continue
          }

          // b-c-d. Check URLs, analyze, compute confidence
          const result = await this.checkEdition(target, config, context)

          stats.totalChecked++
          stats.deadUrls += result.deadUrls.length

          // e. Create proposals
          // Dead event URLs → EVENT_UPDATE to clear websiteUrl
          for (const deadUrl of result.deadUrls) {
            if (deadUrl.sourceType === 'event') {
              const created = await this.createDeadUrlProposal(target, deadUrl, config, context)
              proposalsCreated += created
            }
          }

          if (result.decision === 'CONFIRMED') {
            // No date found → cannot confirm (useless without a date)
            const bestAnalysis = result.urlResults.find(r => r.isAlive && r.analysis?.confirmed)?.analysis
            if (!bestAnalysis?.startDate) {
              context.logger.info(`Confirmation détectée mais AUCUNE date trouvée pour ${target.eventName} ${target.editionYear} — ignorée`)
              stats.inconclusive++
            } else {
              const created = await this.createConfirmationProposal(target, result, config, context)
              proposalsCreated += created
              stats.confirmed++
            }
          } else if (result.decision === 'CANCELED') {
            const created = await this.createCancellationProposal(target, result, config, context)
            proposalsCreated += created
            stats.canceled++
          } else {
            stats.inconclusive++
          }

          // f. Save cooldown
          await this.saveCooldown(target.editionId)

        } catch (error) {
          context.logger.error(`Erreur lors du traitement de l'édition ${target.eventName} ${target.editionYear}:`, {
            error: String(error),
            editionId: target.editionId,
          })
          stats.errors++
        }

        // Politeness delay between editions
        if (i < targets.length - 1) {
          await this.delay(config.requestDelayMs)
        }
      }

      // 5. Save progress and return summary
      const newOffset = offset + targets.length
      await this.saveProgress({
        lastOffset: newOffset,
        lastRunAt: new Date().toISOString(),
        stats,
      })

      const message = `${targets.length} éditions traitées, ${stats.confirmed} confirmées, ${stats.canceled} annulées, ${stats.inconclusive} inconclusives, ${stats.deadUrls} URLs mortes, ${proposalsCreated} propositions créées`
      context.logger.info(message, { stats, proposalsCreated, nextOffset: newOffset })

      return {
        success: true,
        message,
        metrics: {
          editionsRetrieved: targets.length,
          confirmed: stats.confirmed,
          canceled: stats.canceled,
          inconclusive: stats.inconclusive,
          deadUrls: stats.deadUrls,
          errors: stats.errors,
          proposalsCreated,
          nextOffset: newOffset,
        },
      }

    } catch (error) {
      context.logger.error('Erreur lors de l\'exécution de l\'agent:', { error: String(error) })
      return {
        success: false,
        message: `Erreur: ${String(error)}`,
      }
    } finally {
      await this.closeSourceConnections()
    }
  }

  private async getEditionTargets(config: WebsiteCheckerConfig, offset: number): Promise<EditionTarget[]> {
    if (!this.sourceDb) {
      throw new Error('Pas de connexion source - impossible de continuer')
    }

    const now = new Date()
    const lookAheadDate = new Date(now)
    lookAheadDate.setMonth(lookAheadDate.getMonth() + config.lookAheadMonths)

    const editions = await this.sourceDb.edition.findMany({
      where: {
        calendarStatus: 'TO_BE_CONFIRMED',
        startDate: {
          gte: now,
          lte: lookAheadDate,
        },
        event: {
          status: 'LIVE',
        },
      },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            city: true,
            websiteUrl: true,
          },
        },
        editionPartners: {
          where: {
            role: { in: ['ORGANIZER', 'TIMER'] },
            websiteUrl: { not: null },
          },
          select: {
            role: true,
            name: true,
            websiteUrl: true,
          },
        },
      },
      skip: offset,
      take: config.batchSize,
      orderBy: { startDate: 'asc' },
    })

    const targets: EditionTarget[] = []

    for (const edition of editions) {
      const urls = []

      // Event website URL (sourceType: 'event')
      if (edition.event?.websiteUrl) {
        urls.push({
          url: edition.event.websiteUrl,
          sourceType: 'event' as const,
        })
      }

      // Partner URLs (organizer / timer)
      for (const partner of edition.editionPartners || []) {
        if (partner.websiteUrl) {
          urls.push({
            url: partner.websiteUrl,
            sourceType: partner.role.toLowerCase() as 'organizer' | 'timer',
            sourceName: partner.name || undefined,
          })
        }
      }

      // Skip editions with no URLs
      if (urls.length === 0) {
        continue
      }

      targets.push({
        editionId: edition.id,
        eventId: edition.event.id,
        eventName: edition.event.name,
        eventCity: edition.event.city || null,
        editionYear: edition.year?.toString() || String(new Date(edition.startDate).getFullYear()),
        startDate: edition.startDate || null,
        urls,
      })
    }

    return targets
  }

  private async checkEdition(
    target: EditionTarget,
    config: WebsiteCheckerConfig,
    context: AgentContext
  ): Promise<EditionCheckResult> {
    const urlResults: UrlCheckResultWithAnalysis[] = []
    const deadUrls: UrlCheckResult[] = []

    const apiKey = config.anthropicApiKey
    const hasLlm = !!apiKey

    for (let i = 0; i < target.urls.length; i++) {
      const urlSource = target.urls[i]
      context.logger.info(`  Vérification URL [${i + 1}/${target.urls.length}]: ${urlSource.url}`)

      // 1. Check URL liveness
      const checkResult = await checkUrl(urlSource, {
        timeoutMs: config.requestTimeoutMs,
      })

      // 2. Track dead URLs
      if (checkResult.isDead) {
        deadUrls.push(checkResult)
        urlResults.push({ ...checkResult })
        context.logger.info(`  URL morte (${checkResult.errorReason}): ${urlSource.url}`)
      } else if (checkResult.isAlive && checkResult.htmlText) {
        // 3. Analyze with LLM if alive and has content
        let analysis = undefined

        if (hasLlm) {
          try {
            analysis = await analyzePage(checkResult.htmlText, target, {
              apiKey: apiKey!,
              model: config.llmModel,
            })
            if (analysis) {
              context.logger.info(
                `  Analyse LLM: confirmed=${analysis.confirmed} canceled=${analysis.canceled} confidence=${analysis.confidence}`,
                { reasoning: analysis.reasoning }
              )
            }
          } catch (err) {
            context.logger.warn(`  Erreur analyse LLM pour ${urlSource.url}: ${String(err)}`)
          }
        }

        urlResults.push({ ...checkResult, analysis: analysis ?? undefined })
      } else {
        // Not alive, not dead (timeout etc.)
        urlResults.push({ ...checkResult })
        context.logger.info(`  URL inaccessible (${checkResult.errorReason}): ${urlSource.url}`)
      }

      // 1s delay between URLs for the same edition
      if (i < target.urls.length - 1) {
        await this.delay(1000)
      }
    }

    // 5. Compute final confidence
    const { decision, confidence: finalConfidence } = computeFinalConfidence(urlResults)

    return {
      editionId: target.editionId,
      eventId: target.eventId,
      eventName: target.eventName,
      eventCity: target.eventCity,
      editionYear: target.editionYear,
      startDate: target.startDate,
      urlResults,
      decision,
      finalConfidence,
      deadUrls,
    }
  }

  private async createConfirmationProposal(
    target: EditionTarget,
    result: EditionCheckResult,
    config: WebsiteCheckerConfig,
    context: AgentContext
  ): Promise<number> {
    if (config.dryRun) {
      context.logger.info(`[DryRun] Proposition CONFIRMED ignorée pour édition ${target.editionId}`)
      return 0
    }

    // Deduplication: check for existing PENDING proposal
    const existing = await this.prisma.proposal.findFirst({
      where: {
        editionId: target.editionId.toString(),
        agentId: this.config.id,
        status: 'PENDING',
        type: 'EDITION_UPDATE',
      },
    })

    if (existing) {
      context.logger.info(`Proposition EDITION_UPDATE PENDING déjà existante pour édition ${target.editionId} - ignorée`)
      return 0
    }

    const bestResult = result.urlResults.find(r => r.isAlive && r.analysis?.confirmed)
    const analysis = bestResult?.analysis

    const changes: Record<string, any> = {
      calendarStatus: {
        old: 'TO_BE_CONFIRMED',
        new: 'CONFIRMED',
      },
    }

    // Include dates extracted by the LLM
    if (analysis?.startDate) {
      changes.startDate = {
        old: target.startDate ? target.startDate.toISOString().split('T')[0] : null,
        new: analysis.startDate,
      }
      // endDate = endDate if multi-day, startDate if mono-day
      const effectiveEndDate = analysis.endDate || analysis.startDate
      changes.endDate = {
        old: null,
        new: effectiveEndDate,
      }
    }

    const justification = [
      {
        type: 'url_analysis',
        value: `Edition confirmée via ${bestResult?.url || 'analyse URL'}`,
        confidence: result.finalConfidence,
        metadata: {
          eventName: target.eventName,
          eventCity: target.eventCity,
          editionYear: parseInt(target.editionYear, 10),
          source: bestResult?.url,
          sourceType: bestResult?.sourceType,
          decision: result.decision,
          urlResults: result.urlResults.map(r => ({
            url: r.url,
            sourceType: r.sourceType,
            isAlive: r.isAlive,
            isDead: r.isDead,
            analysis: r.analysis,
          })),
        },
      },
    ]

    await this.createProposal(
      'EDITION_UPDATE',
      changes,
      justification,
      target.eventId.toString(),
      target.editionId.toString(),
      undefined,
      result.finalConfidence
    )

    context.logger.info(`Proposition CONFIRMED créée pour édition ${target.editionId} (${target.eventName} ${target.editionYear})`)
    return 1
  }

  private async createCancellationProposal(
    target: EditionTarget,
    result: EditionCheckResult,
    config: WebsiteCheckerConfig,
    context: AgentContext
  ): Promise<number> {
    if (config.dryRun) {
      context.logger.info(`[DryRun] Proposition CANCELED ignorée pour édition ${target.editionId}`)
      return 0
    }

    // Deduplication: check for existing PENDING proposal
    const existing = await this.prisma.proposal.findFirst({
      where: {
        editionId: target.editionId.toString(),
        agentId: this.config.id,
        status: 'PENDING',
        type: 'EDITION_UPDATE',
      },
    })

    if (existing) {
      context.logger.info(`Proposition EDITION_UPDATE PENDING déjà existante pour édition ${target.editionId} - ignorée`)
      return 0
    }

    const bestResult = result.urlResults.find(r => r.isAlive && r.analysis?.canceled)

    const changes = {
      calendarStatus: {
        old: 'TO_BE_CONFIRMED',
        new: 'CANCELED',
      },
    }

    const justification = [
      {
        type: 'url_analysis',
        value: `Edition annulée via ${bestResult?.url || 'analyse URL'}`,
        confidence: result.finalConfidence,
        metadata: {
          eventName: target.eventName,
          eventCity: target.eventCity,
          editionYear: parseInt(target.editionYear, 10),
          source: bestResult?.url,
          sourceType: bestResult?.sourceType,
          decision: result.decision,
          urlResults: result.urlResults.map(r => ({
            url: r.url,
            sourceType: r.sourceType,
            isAlive: r.isAlive,
            isDead: r.isDead,
            analysis: r.analysis,
          })),
        },
      },
    ]

    await this.createProposal(
      'EDITION_UPDATE',
      changes,
      justification,
      target.eventId.toString(),
      target.editionId.toString(),
      undefined,
      result.finalConfidence
    )

    context.logger.info(`Proposition CANCELED créée pour édition ${target.editionId} (${target.eventName} ${target.editionYear})`)
    return 1
  }

  private async createDeadUrlProposal(
    target: EditionTarget,
    deadUrl: UrlCheckResult,
    config: WebsiteCheckerConfig,
    context: AgentContext
  ): Promise<number> {
    // Only handle event website URLs
    if (deadUrl.sourceType !== 'event') {
      return 0
    }

    if (config.dryRun) {
      context.logger.info(`[DryRun] Proposition dead URL EVENT_UPDATE ignorée pour event ${target.eventId}`)
      return 0
    }

    // Deduplication: check for existing PENDING EVENT_UPDATE proposal for this event
    const existing = await this.prisma.proposal.findFirst({
      where: {
        eventId: target.eventId.toString(),
        agentId: this.config.id,
        status: 'PENDING',
        type: 'EVENT_UPDATE',
      },
    })

    if (existing) {
      context.logger.info(`Proposition EVENT_UPDATE PENDING déjà existante pour event ${target.eventId} - ignorée`)
      return 0
    }

    const changes = {
      websiteUrl: {
        old: deadUrl.url,
        new: null,
      },
    }

    const justification = [
      {
        type: 'dead_url',
        value: `URL morte détectée: ${deadUrl.url} (${deadUrl.errorReason})`,
        confidence: 1.0,
        metadata: {
          eventName: target.eventName,
          eventCity: target.eventCity,
          editionYear: parseInt(target.editionYear, 10),
          url: deadUrl.url,
          errorReason: deadUrl.errorReason,
          httpStatus: deadUrl.httpStatus,
        },
      },
    ]

    await this.createProposal(
      'EVENT_UPDATE',
      changes,
      justification,
      target.eventId.toString(),
      undefined,
      undefined,
      1.0
    )

    context.logger.info(`Proposition dead URL créée pour event ${target.eventId} (${deadUrl.url} → ${deadUrl.errorReason})`)
    return 1
  }

  // --- State management helpers ---

  private async loadProgress(): Promise<ConfirmationProgress> {
    const saved = await this.stateService.getState<ConfirmationProgress>(this.config.id, 'progress')
    if (saved) {
      return saved
    }
    return {
      lastOffset: 0,
      lastRunAt: new Date().toISOString(),
      stats: {
        totalChecked: 0,
        confirmed: 0,
        canceled: 0,
        inconclusive: 0,
        deadUrls: 0,
        errors: 0,
      },
    }
  }

  private async saveProgress(progress: ConfirmationProgress): Promise<void> {
    await this.stateService.setState(this.config.id, 'progress', progress)
  }

  private async isInCooldown(editionId: number, cooldownDays: number): Promise<boolean> {
    const key = `cooldown:${editionId}`
    const lastCheckedAt = await this.stateService.getState<string>(this.config.id, key)
    if (!lastCheckedAt) return false

    const lastDate = new Date(lastCheckedAt).getTime()
    const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000
    return Date.now() - lastDate < cooldownMs
  }

  private async saveCooldown(editionId: number): Promise<void> {
    const key = `cooldown:${editionId}`
    await this.stateService.setState(this.config.id, key, new Date().toISOString())
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
