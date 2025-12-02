/**
 * Exports centralisés pour tous les helpers de tests
 * 
 * Usage:
 * import {
 *   createNewEventProposal,
 *   expectRaceCount,
 *   testDb
 * } from './helpers'
 */

// Database setup
export {
  testDb,
  testMilesRepublicDb,
  cleanDatabase,
  cleanMilesRepublicDatabase,
  closeDatabase,
  setupGlobalTests,
  setupMilesRepublicTests,
  runInTransaction
} from './db-setup'

// Service setup
export {
  setupProposalService,
  cleanupProposalService,
  setupTestEnvironment,
  testLogger
} from './service-setup'

// Fixtures
export {
  createNewEventProposal,
  createEditionUpdateProposal,
  createExistingEvent,
  createExistingEdition,
  createExistingRace,
  createExistingOrganizer,
  createTestAgent,
  createTestProposal,
  createCompleteSetup
} from './fixtures'

// Assertions
export {
  expectObjectFields,
  expectRaceCount,
  expectRaceArchived,
  expectRaceActive,
  expectFieldUnchanged,
  expectEventExists,
  expectEditionExists,
  expectSlugFormat,
  expectDateClose,
  expectOrganizerLinked,
  expectFieldsUnchanged
} from './assertions'
