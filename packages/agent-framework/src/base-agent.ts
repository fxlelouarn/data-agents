import {
  IAgent,
  AgentConfig,
  AgentContext,
  AgentRunResult,
  AgentLogger
} from './types'
import { createLogger } from './logger'
import { IDatabaseService, getDatabaseService } from './database-interface'
import { DatabaseManager } from './database-manager'
import { ConnectionManager, PrismaClientType } from './connection-manager'

export abstract class BaseAgent implements IAgent {
  protected db: IDatabaseService | null = null
  protected logger: AgentLogger
  protected connectionManager: ConnectionManager
  protected dbManager: DatabaseManager

  constructor(
    public readonly config: AgentConfig,
    db?: IDatabaseService,
    logger?: AgentLogger
  ) {
    this.db = db || null
    this.logger = logger || createLogger(config.name, config.id)
    this.connectionManager = new ConnectionManager()
    this.dbManager = DatabaseManager.getInstance(this.logger)
  }

  protected async getDb(): Promise<IDatabaseService> {
    if (!this.db) {
      this.db = await getDatabaseService()
    }
    return this.db
  }

  // Abstract method that must be implemented by each agent
  abstract run(context: AgentContext): Promise<AgentRunResult>

  // Default validation - can be overridden
  async validate(): Promise<boolean> {
    try {
      // Basic validation - check if config is valid
      if (!this.config.name || !this.config.type || !this.config.frequency) {
        return false
      }

      // Validate cron expression
      const cronRegex = /^(\*|[0-5]?\d) (\*|[01]?\d|2[0-3]) (\*|[012]?\d|3[01]) (\*|[0-9]|1[012]|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC) (\*|[0-7]|SUN|MON|TUE|WED|THU|FRI|SAT)$/
      if (!cronRegex.test(this.config.frequency)) {
        return false
      }

      return true
    } catch (error) {
      this.logger.error('Agent validation failed', { error: error?.toString() })
      return false
    }
  }

  // Get agent status
  async getStatus() {
    try {
      const db = await this.getDb()
      const agent = await db.getAgent(this.config.id)
      if (!agent) {
        return {
          healthy: false,
          message: 'Agent not found in database'
        }
      }

      const lastRun = agent.runs[0]
      const lastRunTime = lastRun?.startedAt
      const nextRun = this.getNextRunTime()

      return {
        healthy: agent.isActive && (await this.validate()),
        lastRun: lastRunTime,
        nextRun,
        message: lastRun?.error || 'Agent operational'
      }
    } catch (error) {
      return {
        healthy: false,
        message: `Status check failed: ${error}`
      }
    }
  }

  // Helper method to get next run time based on cron expression
  protected getNextRunTime(): Date | undefined {
    try {
      const cron = require('cron')
      const job = new cron.CronJob(this.config.frequency, () => {})
      return job.nextDate()?.toDate()
    } catch {
      return undefined
    }
  }

  // Helper method to create proposals
  protected async createProposal(
    type: string,
    changes: Record<string, any>,
    justification: any[],
    eventId?: string,
    editionId?: string,
    raceId?: string,
    confidence: number = 0.8
  ) {
    const db = await this.getDb()

    // Auto-extraction des métadonnées depuis la première justification
    // Ces champs sont utilisés pour l'affichage dans le dashboard et les logs
    const metadata = justification?.[0]?.metadata || {}

    return db.createProposal({
      agentId: this.config.id,
      type,
      eventId,
      editionId,
      raceId,
      changes,
      justification,
      confidence,
      // Champs extraits automatiquement depuis metadata
      eventName: metadata.eventName,
      eventCity: metadata.eventCity,
      editionYear: metadata.editionYear
    })
  }

  // Helper method for text similarity comparison
  protected calculateSimilarity(text1: string, text2: string): number {
    const stringSimilarity = require('string-similarity')
    return stringSimilarity.compareTwoStrings(text1.toLowerCase(), text2.toLowerCase())
  }

  // Helper method to normalize event names for comparison
  protected normalizeEventName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  // Helper method to extract year from date or text
  protected extractYear(input: Date | string | number): number {
    if (input instanceof Date) {
      return input.getFullYear()
    }
    if (typeof input === 'number') {
      return input > 1900 && input < 2100 ? input : new Date().getFullYear()
    }
    if (typeof input === 'string') {
      const yearMatch = input.match(/\b(20\d{2}|19\d{2})\b/)
      return yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear()
    }
    return new Date().getFullYear()
  }

  // Helper method to parse dates from various formats
  protected parseDate(dateStr: string, timezone?: string): Date | undefined {
    try {
      // Try different date formats
      const formats = [
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})/, // MM/DD/YYYY or DD/MM/YYYY
        /^(\d{4})-(\d{1,2})-(\d{1,2})/, // YYYY-MM-DD
        /^(\d{1,2})-(\d{1,2})-(\d{4})/, // DD-MM-YYYY or MM-DD-YYYY
      ]

      for (const format of formats) {
        const match = dateStr.match(format)
        if (match) {
          const [, p1, p2, p3] = match
          // Try both DD/MM and MM/DD interpretations
          const date1 = new Date(parseInt(p3), parseInt(p2) - 1, parseInt(p1))
          const date2 = new Date(parseInt(p3), parseInt(p1) - 1, parseInt(p2))

          // Return the more reasonable date (not too far in future/past)
          const now = new Date()
          const yearFromNow = new Date(now.getFullYear() + 1, 11, 31)
          const yearAgo = new Date(now.getFullYear() - 1, 0, 1)

          if (date1 >= yearAgo && date1 <= yearFromNow) return date1
          if (date2 >= yearAgo && date2 <= yearFromNow) return date2

          return date1 // Default to first interpretation
        }
      }

      // Try native Date parsing as fallback
      const parsed = new Date(dateStr)
      return isNaN(parsed.getTime()) ? undefined : parsed
    } catch {
      return undefined
    }
  }

  // Helper method to extract numeric values (prices, distances, elevations)
  protected extractNumber(text: string, unit?: string): number | undefined {
    try {
      // Remove common currency symbols and units
      let cleaned = text.replace(/[€$£,\s]/g, '')

      if (unit) {
        cleaned = cleaned.replace(new RegExp(unit, 'gi'), '')
      }

      // Extract number
      const match = cleaned.match(/(\d+(?:\.\d+)?)/)
      return match ? parseFloat(match[1]) : undefined
    } catch {
      return undefined
    }
  }

  /**
   * Établit une connexion à une base de données source
   *
   * Cette méthode centralise la logique de connexion qui était auparavant
   * dupliquée dans chaque agent (GoogleSearchDateAgent, FFAScraperAgent).
   *
   * @param sourceDbId - ID de la base de données source dans la configuration
   * @returns Client Prisma connecté
   * @throws Error si la configuration est introuvable ou la connexion échoue
   *
   * @example
   * ```typescript
   * // Dans votre agent
   * const sourceDb = await this.connectToSource(config.sourceDatabase)
   * const events = await sourceDb.event.findMany({ ... })
   * ```
   *
   * @since 2025-11-05 - Refactoring pour éliminer duplication
   */
  protected async connectToSource(sourceDbId: string): Promise<PrismaClientType> {
    return this.connectionManager.connectToSource(
      sourceDbId,
      this.dbManager,
      this.logger
    )
  }

  /**
   * Ferme toutes les connexions sources actives
   * À appeler dans le cleanup de l'agent si nécessaire
   */
  protected async closeSourceConnections(): Promise<void> {
    await this.connectionManager.closeAllConnections()
  }
}
