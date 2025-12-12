/**
 * Agent Slack @databot
 *
 * Agent événementiel qui traite les messages Slack mentionnant @databot.
 * Contrairement aux autres agents (FFA, Google) qui sont déclenchés par un scheduler,
 * cet agent est déclenché par un webhook Slack.
 *
 * Fonctionnalités :
 * - Extraction de données depuis URLs, images ou texte
 * - Matching avec événements existants dans Miles Republic
 * - Création de Proposals pour validation
 * - Notifications dans le thread Slack
 */

import { AGENT_VERSIONS, SlackEventAgentConfigSchema } from '@data-agents/types'
import { BaseAgent, AgentContext, AgentRunResult, ProposalData, ProposalType, AgentType } from '@data-agents/agent-framework'
import { IAgentStateService, AgentStateService, prisma } from '@data-agents/database'

// Version exportée depuis le package types (source unique de vérité)
export const SLACK_EVENT_AGENT_VERSION = AGENT_VERSIONS.SLACK_EVENT_AGENT

/**
 * Configuration de l'agent Slack
 */
export interface SlackEventAgentConfig {
  // Credentials Slack (priorité sur env vars)
  slackBotToken?: string
  slackSigningSecret?: string

  // Credentials Anthropic (priorité sur env vars)
  anthropicApiKey?: string

  // Channels configurés
  channels: Array<{
    id: string
    name: string
    autoCreateProposal: boolean
    notifyOnValidation: boolean
  }>

  // Configuration extraction
  extraction: {
    preferredModel: 'haiku' | 'sonnet'
    fallbackToSonnet: boolean
    maxImageSizeMB: number
  }

  // Configuration relances
  reminders: {
    enabled: boolean
    delayHours: number
    maxReminders: number
  }

  // Base de données source pour le matching
  sourceDatabase: string
}

/**
 * Données d'un message Slack à traiter
 */
export interface SlackMessageData {
  messageTs: string
  threadTs?: string
  channelId: string
  userId: string
  text: string
  files?: Array<{
    id: string
    name: string
    mimetype: string
    urlPrivate: string
  }>
}

/**
 * Résultat de l'extraction depuis un message Slack
 */
export interface SlackExtractionResult {
  success: boolean
  data?: {
    eventName: string
    eventCity?: string
    eventDepartment?: string
    editionYear?: number
    editionDate?: string
    editionEndDate?: string
    races?: Array<{
      name: string
      distance?: number
      elevation?: number
      startTime?: string
      price?: number
    }>
    organizerName?: string
    organizerEmail?: string
    organizerPhone?: string
    organizerWebsite?: string
    registrationUrl?: string
    confidence: number
    extractionMethod: 'html' | 'image' | 'text'
    sourceUrl?: string
  }
  error?: string
}

export class SlackEventAgent extends BaseAgent {
  private sourceDb: any
  private stateService: IAgentStateService
  private prismaClient: typeof prisma

  constructor(config: any, db?: any, logger?: any) {
    const agentConfig = {
      id: config.id || 'slack-event-agent',
      name: config.name || 'Slack Event Agent',
      description: `Agent qui traite les messages Slack @databot pour extraire des événements (v${SLACK_EVENT_AGENT_VERSION})`,
      type: 'EXTRACTOR' as AgentType,
      // Pas de fréquence cron - déclenché par webhook
      frequency: config.frequency || '0 0 31 2 *', // 31 février = jamais (webhook-driven)
      isActive: config.isActive ?? true,
      config: {
        version: SLACK_EVENT_AGENT_VERSION,
        // Credentials avec fallback sur env vars
        slackBotToken: config.config?.slackBotToken || process.env.SLACK_BOT_TOKEN,
        slackSigningSecret: config.config?.slackSigningSecret || process.env.SLACK_SIGNING_SECRET,
        anthropicApiKey: config.config?.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
        // Channels
        channels: config.config?.channels || [{
          id: process.env.SLACK_CHANNEL_ID || '',
          name: 'data-events',
          autoCreateProposal: true,
          notifyOnValidation: true
        }],
        // Extraction
        extraction: config.config?.extraction || {
          preferredModel: 'haiku',
          fallbackToSonnet: true,
          maxImageSizeMB: 20
        },
        // Relances
        reminders: config.config?.reminders || {
          enabled: true,
          delayHours: 24,
          maxReminders: 2
        },
        // Source database pour matching
        sourceDatabase: config.config?.sourceDatabase,
        // Schéma de configuration pour le dashboard
        configSchema: SlackEventAgentConfigSchema
      }
    }

    super(agentConfig, db, logger)
    this.prismaClient = prisma
    this.stateService = new AgentStateService(prisma)
  }

  /**
   * Récupère la configuration typée
   */
  private getTypedConfig(): SlackEventAgentConfig {
    return this.config.config as SlackEventAgentConfig
  }

  /**
   * Récupère le token Slack (config ou env)
   */
  getSlackBotToken(): string | undefined {
    return this.getTypedConfig().slackBotToken || process.env.SLACK_BOT_TOKEN
  }

  /**
   * Récupère le signing secret Slack (config ou env)
   */
  getSlackSigningSecret(): string | undefined {
    return this.getTypedConfig().slackSigningSecret || process.env.SLACK_SIGNING_SECRET
  }

  /**
   * Récupère la clé API Anthropic (config ou env)
   */
  getAnthropicApiKey(): string | undefined {
    return this.getTypedConfig().anthropicApiKey || process.env.ANTHROPIC_API_KEY
  }

  /**
   * Vérifie si un channel est configuré
   */
  isChannelConfigured(channelId: string): boolean {
    const config = this.getTypedConfig()
    return config.channels.some(ch => ch.id === channelId)
  }

  /**
   * Récupère la configuration d'un channel
   */
  getChannelConfig(channelId: string) {
    const config = this.getTypedConfig()
    return config.channels.find(ch => ch.id === channelId)
  }

  /**
   * Initialise la connexion à la base source (Miles Republic)
   */
  private async initializeSourceConnection(): Promise<void> {
    const config = this.getTypedConfig()
    if (!this.sourceDb && config.sourceDatabase) {
      this.sourceDb = await this.connectToSource(config.sourceDatabase)
    }
  }

  /**
   * Méthode run() - Non utilisée car l'agent est webhook-driven
   * Mais requise par l'interface BaseAgent
   */
  async run(context: AgentContext): Promise<AgentRunResult> {
    context.logger.info(`🤖 SlackEventAgent v${SLACK_EVENT_AGENT_VERSION} - Mode webhook (pas de run automatique)`)

    // Cet agent ne fait rien en mode scheduler
    // Il est déclenché par les webhooks Slack via processMessage()
    return {
      success: true,
      message: 'Agent en mode webhook - déclenché par les événements Slack',
      metrics: {
        mode: 'webhook',
        version: SLACK_EVENT_AGENT_VERSION
      }
    }
  }

  /**
   * Traite un message Slack
   * Appelé par le webhook API
   */
  async processMessage(message: SlackMessageData): Promise<{
    success: boolean
    extractionResult?: SlackExtractionResult
    proposalId?: string
    error?: string
  }> {
    this.logger.info(`📨 Processing Slack message`, {
      channelId: message.channelId,
      messageTs: message.messageTs,
      hasFiles: !!message.files?.length,
      textLength: message.text.length
    })

    try {
      // 1. Vérifier que le channel est configuré
      if (!this.isChannelConfigured(message.channelId)) {
        this.logger.warn(`Channel ${message.channelId} not configured for this agent`)
        return {
          success: false,
          error: `Channel non configuré pour cet agent`
        }
      }

      // 2. Initialiser la connexion source pour le matching
      await this.initializeSourceConnection()

      // 3. Extraire les données du message
      const extractionResult = await this.extractEventData(message)

      if (!extractionResult.success || !extractionResult.data) {
        this.logger.warn(`Extraction failed: ${extractionResult.error}`)
        return {
          success: false,
          extractionResult,
          error: extractionResult.error
        }
      }

      this.logger.info(`✅ Extraction successful: ${extractionResult.data.eventName}`, {
        confidence: extractionResult.data.confidence,
        method: extractionResult.data.extractionMethod
      })

      // 4. TODO Phase 3: Matching + création de Proposal
      // Pour l'instant, on retourne juste le résultat d'extraction

      return {
        success: true,
        extractionResult
        // proposalId sera ajouté en Phase 3
      }

    } catch (error: any) {
      this.logger.error(`Error processing message: ${error.message}`, { error })
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Extrait les données d'événement depuis un message Slack
   * Délègue aux extracteurs existants (HtmlExtractor, ImageExtractor, TextExtractor)
   */
  private async extractEventData(message: SlackMessageData): Promise<SlackExtractionResult> {
    // Import dynamique des extracteurs depuis l'API
    // Note: En Phase 2.5, on réutilise les extracteurs existants
    // En Phase 3, on pourra les déplacer dans un package partagé

    try {
      // Priorité: URL > Image > Texte
      const urls = this.extractUrls(message.text)

      if (urls.length > 0) {
        this.logger.info(`🌐 Found ${urls.length} URL(s), trying HTML extraction`)
        // TODO: Appeler HtmlExtractor
        // Pour l'instant, placeholder
      }

      if (message.files && message.files.length > 0) {
        const imageFiles = message.files.filter(f => f.mimetype.startsWith('image/'))
        if (imageFiles.length > 0) {
          this.logger.info(`🖼️ Found ${imageFiles.length} image(s), trying image extraction`)
          // TODO: Appeler ImageExtractor
        }
      }

      if (message.text.length > 50) {
        this.logger.info(`📝 Trying text extraction from message`)
        // TODO: Appeler TextExtractor
      }

      // Placeholder - sera implémenté avec l'intégration des extracteurs
      return {
        success: false,
        error: 'Extracteurs non encore intégrés (Phase 2.5 en cours)'
      }

    } catch (error: any) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Extrait les URLs d'un texte Slack
   */
  private extractUrls(text: string): string[] {
    // Format Slack: <https://example.com|label> ou <https://example.com>
    const slackUrlPattern = /<(https?:\/\/[^|>]+)(?:\|[^>]*)?>/g
    const urls: string[] = []
    let match

    while ((match = slackUrlPattern.exec(text)) !== null) {
      urls.push(match[1])
    }

    return urls
  }

  /**
   * Sauvegarde l'état de traitement d'un message
   */
  async saveMessageState(messageTs: string, state: Record<string, any>): Promise<void> {
    await this.stateService.setState(this.config.id, `message:${messageTs}`, state)
  }

  /**
   * Récupère l'état de traitement d'un message
   */
  async getMessageState(messageTs: string): Promise<Record<string, any> | null> {
    return this.stateService.getState(this.config.id, `message:${messageTs}`)
  }

  /**
   * Récupère les messages en attente de relance
   */
  async getPendingReminders(): Promise<Array<{ messageTs: string; state: any }>> {
    // TODO: Implémenter la logique de relance
    return []
  }
}

// Export par défaut
export default SlackEventAgent
