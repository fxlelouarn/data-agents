import { setupMilesRepublicTests } from './proposal-application/helpers/db-setup'

/**
 * Setup global pour tous les tests proposal-application
 * 
 * - Nettoie les bases de données avant chaque test
 * - Ferme les connexions après tous les tests
 * - Configure le timeout à 30 secondes
 */

// Setup des bases de données
setupMilesRepublicTests()

// Configuration du timeout
jest.setTimeout(30000)

// Silence les logs pendant les tests (sauf si TEST_DEBUG=true)
if (!process.env.TEST_DEBUG) {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  }
}
