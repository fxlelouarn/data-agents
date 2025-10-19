/**
 * Interface for database service
 * This allows agent-framework to work with database without direct dependency
 */
export interface IDatabaseService {
  getAgent(id: string): Promise<any>
  createProposal(proposal: any): Promise<any>
  createLog(log: any): Promise<any>
}

/**
 * Lazy loading wrapper for DatabaseService
 * This delays the import until runtime to avoid circular dependencies
 */
let databaseServiceInstance: IDatabaseService | null = null

export async function getDatabaseService(): Promise<IDatabaseService> {
  if (!databaseServiceInstance) {
    try {
      const { DatabaseService } = await import('@data-agents/database')
      databaseServiceInstance = new DatabaseService()
    } catch (error) {
      console.warn('Failed to load DatabaseService:', error)
      // Return a no-op implementation
      databaseServiceInstance = {
        getAgent: async () => null,
        createProposal: async () => null,
        createLog: async () => ({ id: '', agentId: '', runId: null, level: 'INFO', message: '', data: null, timestamp: new Date() }),
      }
    }
  }
  return databaseServiceInstance as IDatabaseService
}
