import { AGENT_VERSIONS, EditionDuplicatorAgentConfigSchema, getAgentName } from '@data-agents/types'
import { BaseAgent, AgentType } from '@data-agents/agent-framework'
import { IAgentStateService, AgentStateService, prisma } from '@data-agents/database'
import type { AgentContext, AgentRunResult } from '@data-agents/agent-framework'
import { randomUUID } from 'crypto'

export const EDITION_DUPLICATOR_AGENT_VERSION = AGENT_VERSIONS.EDITION_DUPLICATOR_AGENT

interface EditionDuplicatorConfig {
  sourceDatabase: string
  batchSize: number
  dryRun: boolean
}

interface ProcessedEditionsState {
  [editionId: string]: string
}

export class EditionDuplicatorAgent extends BaseAgent {
  private sourceDb: any
  private stateService: IAgentStateService
  private prisma: typeof prisma

  constructor(config: any, db?: any, logger?: any) {
    const agentConfig = {
      id: config.id || 'edition-duplicator-agent',
      name: config.name || getAgentName('EDITION_DUPLICATOR'),
      description: `Agent qui duplique les éditions terminées pour l'année suivante (v${EDITION_DUPLICATOR_AGENT_VERSION})`,
      type: 'EXTRACTOR' as AgentType,
      frequency: config.frequency || '0 3 * * *',
      isActive: config.isActive ?? true,
      config: {
        version: EDITION_DUPLICATOR_AGENT_VERSION,
        sourceDatabase: config.config?.sourceDatabase,
        batchSize: config.config?.batchSize || 50,
        dryRun: config.config?.dryRun ?? false,
        ...config.config,
        configSchema: EditionDuplicatorAgentConfigSchema,
      },
    }

    super(agentConfig, db, logger)
    this.prisma = prisma
    this.stateService = new AgentStateService(prisma)
  }

  async run(context: AgentContext): Promise<AgentRunResult> {
    const config = this.config.config as EditionDuplicatorConfig

    try {
      context.logger.info(`Démarrage Edition Duplicator Agent v${EDITION_DUPLICATOR_AGENT_VERSION}`, {
        batchSize: config.batchSize,
        sourceDatabase: config.sourceDatabase,
        dryRun: config.dryRun,
      })

      this.sourceDb = await this.connectToSource(config.sourceDatabase)
      context.logger.info('Connexion source initialisée')

      const processed = await this.loadProcessedEditions()
      context.logger.info(`${Object.keys(processed).length} éditions déjà traitées`)

      const editions = await this.findEditionsToDuplicate(config.batchSize)
      context.logger.info(`${editions.length} éditions candidates trouvées`)

      const toProcess = editions.filter((ed: any) => !processed[ed.id.toString()])
      context.logger.info(`${toProcess.length} éditions à traiter (après déduplication)`)

      if (toProcess.length === 0) {
        return {
          success: true,
          message: 'Aucune édition à dupliquer',
          metrics: { found: editions.length, alreadyProcessed: editions.length - toProcess.length, created: 0 },
        }
      }

      let created = 0
      let skipped = 0

      for (const edition of toProcess) {
        const yearNum = parseInt(edition.year)
        if (isNaN(yearNum)) {
          context.logger.warn(`Édition ${edition.id}: année non numérique "${edition.year}", ignorée`)
          skipped++
          continue
        }

        const proposalData = this.buildProposalForEdition(edition)

        if (config.dryRun) {
          context.logger.info(`[DRY RUN] Proposition pour édition ${edition.id} (${edition.event.name} ${edition.year} → ${yearNum + 1})`)
          created++
          continue
        }

        const proposal = await this.createProposal(proposalData)
        context.logger.info(`✅ Proposition créée: ${proposal.id} — ${edition.event.name} ${edition.year} → ${yearNum + 1}`)

        processed[edition.id.toString()] = proposal.id
        await this.saveProcessedEditions(processed)
        created++
      }

      return {
        success: true,
        message: `${created} proposition(s) créée(s), ${skipped} ignorée(s)`,
        metrics: {
          found: editions.length,
          alreadyProcessed: editions.length - toProcess.length,
          created,
          skipped,
          dryRun: config.dryRun,
        },
      }
    } catch (error) {
      context.logger.error('Erreur Edition Duplicator:', error)
      return {
        success: false,
        message: `Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
      }
    } finally {
      await this.closeSourceConnections()
    }
  }

  private async findEditionsToDuplicate(batchSize: number): Promise<any[]> {
    const now = new Date()
    const currentYear = now.getFullYear()
    const nextYear = currentYear + 1

    const editions = await this.sourceDb.edition.findMany({
      where: {
        year: currentYear.toString(),
        status: { not: 'DRAFT' },
        currentEditionEventId: { not: null },
        endDate: {
          not: null,
          lt: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        },
      },
      include: {
        event: {
          select: { id: true, name: true, city: true },
        },
        races: {
          where: { isArchived: false },
        },
        editionPartners: {
          include: {
            localizedContents: true,
          },
        },
      },
      take: batchSize * 2,
      orderBy: { endDate: 'asc' },
    })

    const filtered = editions.filter((ed: any) => {
      if (!ed.endDate) return false
      const endYear = new Date(ed.endDate).getFullYear()
      return endYear === currentYear
    })

    const result: any[] = []
    for (const edition of filtered) {
      const nextYearEdition = await this.sourceDb.edition.findFirst({
        where: {
          eventId: edition.eventId,
          year: nextYear.toString(),
        },
        select: { id: true },
      })

      if (!nextYearEdition) {
        result.push(edition)
      }
    }

    return result.slice(0, batchSize)
  }

  private buildProposalForEdition(edition: any): any {
    const currentYear = parseInt(edition.year)
    const nextYear = currentYear + 1

    return {
      type: 'EDITION_UPDATE',
      eventId: edition.eventId.toString(),
      editionId: edition.id.toString(),
      confidence: 1.0,
      changes: {
        editionToCreate: {
          eventId: edition.eventId,
          year: nextYear.toString(),
          startDate: this.shiftDateByOneYear(edition.startDate),
          endDate: this.shiftDateByOneYear(edition.endDate),
          status: edition.status,
          calendarStatus: 'TO_BE_CONFIRMED',
          clientStatus: 'NEW_SALES_FUNNEL',
          currentEditionEventId: edition.eventId,
          isAttendeeListPublic: edition.isAttendeeListPublic,
          organizerStripeConnectedAccountId: edition.organizerStripeConnectedAccountId,
          currency: edition.currency,
          medusaVersion: edition.medusaVersion,
          timeZone: edition.timeZone,
          slug: randomUUID(),
        },
        oldEditionUpdate: {
          currentEditionEventId: null,
        },
        racesToCreate: edition.races.map((race: any) => ({
          name: race.name,
          startDate: this.shiftDateByOneYear(race.startDate),
          runDistance: race.runDistance,
          runDistance2: race.runDistance2,
          bikeDistance: race.bikeDistance,
          swimDistance: race.swimDistance,
          walkDistance: race.walkDistance,
          bikeRunDistance: race.bikeRunDistance,
          swimRunDistance: race.swimRunDistance,
          runPositiveElevation: race.runPositiveElevation,
          runNegativeElevation: race.runNegativeElevation,
          bikePositiveElevation: race.bikePositiveElevation,
          bikeNegativeElevation: race.bikeNegativeElevation,
          walkPositiveElevation: race.walkPositiveElevation,
          walkNegativeElevation: race.walkNegativeElevation,
          price: race.price,
          priceType: race.priceType,
          paymentCollectionType: race.paymentCollectionType,
          categoryLevel1: race.categoryLevel1,
          categoryLevel2: race.categoryLevel2,
          distanceCategory: race.distanceCategory,
          licenseNumberType: race.licenseNumberType,
          adultJustificativeOptions: race.adultJustificativeOptions,
          minorJustificativeOptions: race.minorJustificativeOptions,
          askAttendeeBirthDate: race.askAttendeeBirthDate,
          askAttendeeGender: race.askAttendeeGender,
          askAttendeeNationality: race.askAttendeeNationality,
          askAttendeePhoneNumber: race.askAttendeePhoneNumber,
          askAttendeePostalAddress: race.askAttendeePostalAddress,
          showClubOrAssoInput: race.showClubOrAssoInput,
          showPublicationConsentCheckbox: race.showPublicationConsentCheckbox,
          minTeamSize: race.minTeamSize,
          maxTeamSize: race.maxTeamSize,
          displayOrder: race.displayOrder,
          isArchived: race.isArchived,
          slug: randomUUID(),
          timeZone: race.timeZone,
          isMainRace: race.mainRaceEditionId === edition.id,
        })),
        partnersToCreate: edition.editionPartners.map((partner: any) => ({
          role: partner.role,
          name: partner.name,
          websiteUrl: partner.websiteUrl,
          instagramUrl: partner.instagramUrl,
          facebookUrl: partner.facebookUrl,
          logoUrl: partner.logoUrl,
          sortOrder: partner.sortOrder,
          localizedContents: (partner.localizedContents || []).map((lc: any) => ({
            locale: lc.locale,
            description: lc.description,
          })),
        })),
      },
      justification: [
        {
          type: 'edition_duplication',
          message: `Édition ${edition.year} terminée le ${edition.endDate?.toISOString().split('T')[0] || 'N/A'}, duplication pour ${nextYear}`,
          metadata: {
            sourceEditionId: edition.id,
            sourceYear: edition.year,
            targetYear: nextYear.toString(),
            racesCount: edition.races.length,
            partnersCount: edition.editionPartners.length,
          },
        },
      ],
      eventName: edition.event.name,
      eventCity: edition.event.city,
      editionYear: nextYear,
    }
  }

  private shiftDateByOneYear(date: Date | null): string | null {
    if (!date) return null
    const d = new Date(date)
    d.setFullYear(d.getFullYear() + 1)
    return d.toISOString()
  }

  private async loadProcessedEditions(): Promise<ProcessedEditionsState> {
    const state = await this.stateService.getState(this.config.id, 'processedEditions')
    return (state as ProcessedEditionsState) || {}
  }

  private async saveProcessedEditions(processed: ProcessedEditionsState): Promise<void> {
    await this.stateService.setState(this.config.id, 'processedEditions', processed)
  }
}
