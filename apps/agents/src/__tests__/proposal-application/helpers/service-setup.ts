import { ProposalDomainService } from '@data-agents/database'
import { ProposalRepository } from '../../../../../../packages/database/src/repositories/proposal.repository'
import { DatabaseManager } from '../../../../../../packages/agent-framework/src/database-manager'
import { testDb, testMilesRepublicDb } from './db-setup'

/**
 * Logger de test (console ou noop selon TEST_DEBUG)
 */
export const testLogger = {
  info: (...args: any[]) => process.env.TEST_DEBUG && console.log('[INFO]', ...args),
  error: (...args: any[]) => console.error('[ERROR]', ...args),
  warn: (...args: any[]) => process.env.TEST_DEBUG && console.warn('[WARN]', ...args),
  debug: (...args: any[]) => process.env.TEST_DEBUG && console.debug('[DEBUG]', ...args)
}

/**
 * Setup environnement pour ProposalDomainService
 * 
 * Retourne :
 * - proposalService : Instance configurée de ProposalDomainService
 * - databaseManager : Instance configurée de DatabaseManager
 * - proposalRepo : Repository (peut être mocké si nécessaire)
 */
export async function setupProposalService(): Promise<{
  proposalService: ProposalDomainService
  databaseManager: DatabaseManager
  proposalRepo: ProposalRepository
}> {
  // 1. Créer ProposalRepository
  const proposalRepo = new ProposalRepository(testDb)

  // 2. Créer DatabaseManager
  const databaseManager = DatabaseManager.getInstance(testLogger)

  // 3. Enregistrer connexion Miles Republic pour les tests
  // ✅ Passer directement le client Prisma au lieu du schema
  await databaseManager.addTestConnection('miles-republic-test', testMilesRepublicDb)

  // 4. Créer ProposalDomainService
  const proposalService = new ProposalDomainService(
    proposalRepo,
    databaseManager,
    testLogger
  )

  return {
    proposalService,
    databaseManager,
    proposalRepo
  }
}

/**
 * Cleanup après test
 */
export async function cleanupProposalService(databaseManager: DatabaseManager) {
  if (databaseManager) {
    await databaseManager.closeAllConnections()
  }
}

/**
 * Setup complet pour beforeEach
 */
export function setupTestEnvironment() {
  let proposalService: ProposalDomainService
  let databaseManager: DatabaseManager
  let proposalRepo: ProposalRepository

  beforeEach(async () => {
    const setup = await setupProposalService()
    proposalService = setup.proposalService
    databaseManager = setup.databaseManager
    proposalRepo = setup.proposalRepo
  })

  afterEach(async () => {
    await cleanupProposalService(databaseManager)
  })

  return {
    get proposalService() { return proposalService },
    get databaseManager() { return databaseManager },
    get proposalRepo() { return proposalRepo }
  }
}
