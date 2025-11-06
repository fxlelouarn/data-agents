import { DatabaseService } from '@data-agents/database'
import { DatabaseManager, createConsoleLogger } from '@data-agents/agent-framework'

let dbServiceInstance: DatabaseService | null = null

/**
 * Get singleton DatabaseService instance with DatabaseManager configured
 */
export async function getDatabaseService(): Promise<DatabaseService> {
  if (!dbServiceInstance) {
    const logger = createConsoleLogger('API', 'database-service')
    const dbManager = DatabaseManager.getInstance(logger)
    dbServiceInstance = new DatabaseService(undefined, dbManager)
  }
  return dbServiceInstance
}

/**
 * Get DatabaseService synchronously (for backward compatibility)
 * Note: ProposalApplicationService will not be available until setDatabaseManager is called
 */
export function getDatabaseServiceSync(): DatabaseService {
  if (!dbServiceInstance) {
    dbServiceInstance = new DatabaseService()
    
    // Lazy-initialize DatabaseManager in the background
    import('@data-agents/agent-framework').then(({ DatabaseManager, createConsoleLogger }) => {
      const logger = createConsoleLogger('API', 'database-service')
      const dbManager = DatabaseManager.getInstance(logger)
      dbServiceInstance!.setDatabaseManager(dbManager)
    }).catch(err => {
      console.error('Failed to initialize DatabaseManager:', err)
    })
  }
  return dbServiceInstance
}
