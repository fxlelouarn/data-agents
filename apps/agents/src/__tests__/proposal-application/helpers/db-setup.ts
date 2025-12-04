import { PrismaClient } from '@prisma/client'
import path from 'path'

/**
 * Client Prisma dédié aux tests (data-agents schema)
 * Utilise DATABASE_TEST_URL ou une base locale par défaut
 */
export const testDb = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_TEST_URL || 'postgresql://localhost:5432/data-agents-test'
    }
  },
  log: process.env.TEST_DEBUG ? ['query', 'error', 'warn'] : ['error']
})

/**
 * Client Prisma pour Miles Republic (tests nécessitant la base MR)
 * ✅ Utilise le client généré depuis apps/agents/prisma/miles-republic.prisma
 * ✅ Import dynamique pour éviter les problèmes de chemin avec Jest
 */
// ✅ Utiliser process.cwd() depuis la racine du projet
const clientMilesPath = path.resolve(process.cwd(), 'node_modules/.prisma/client-miles')
const { PrismaClient: MilesPrismaClient } = require(clientMilesPath)

export const testMilesRepublicDb = new MilesPrismaClient({
  datasources: {
    db: {
      url: process.env.MILES_REPUBLIC_TEST_DATABASE_URL || process.env.MILES_REPUBLIC_DATABASE_URL
    }
  },
  log: process.env.TEST_DEBUG ? ['query', 'error', 'warn'] : ['error']
})

/**
 * Nettoie toutes les tables avant chaque test
 * Utilise TRUNCATE CASCADE pour gérer les dépendances
 */
export const cleanDatabase = async () => {
  try {
    await testDb.$transaction([
      testDb.$executeRaw`TRUNCATE TABLE "proposal_applications" CASCADE`,
      testDb.$executeRaw`TRUNCATE TABLE "proposals" CASCADE`,
      testDb.$executeRaw`TRUNCATE TABLE "agent_states" CASCADE`,
      testDb.$executeRaw`TRUNCATE TABLE "agent_runs" CASCADE`,
      testDb.$executeRaw`TRUNCATE TABLE "agents" CASCADE`,
      testDb.$executeRaw`TRUNCATE TABLE "database_connections" CASCADE`,
      testDb.$executeRaw`TRUNCATE TABLE "agent_logs" CASCADE`
    ])
  } catch (error) {
    console.error('❌ Error cleaning database:', error)
    throw error
  }
}

/**
 * Nettoie les tables Miles Republic (si nécessaire pour certains tests)
 * ATTENTION: Utiliser avec précaution
 */
export const cleanMilesRepublicDatabase = async () => {
  try {
    await testMilesRepublicDb.$transaction([
      testMilesRepublicDb.$executeRaw`TRUNCATE TABLE "Race" CASCADE`,
      testMilesRepublicDb.$executeRaw`TRUNCATE TABLE "Edition" CASCADE`,
      testMilesRepublicDb.$executeRaw`TRUNCATE TABLE "Event" CASCADE`
    ])
  } catch (error) {
    console.error('❌ Error cleaning Miles Republic database:', error)
    throw error
  }
}

/**
 * Ferme les connexions DB après tous les tests
 */
export const closeDatabase = async () => {
  await testDb.$disconnect()
  await testMilesRepublicDb.$disconnect()
}

/**
 * Setup global pour Jest
 * À utiliser dans setup.ts
 */
export const setupGlobalTests = () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  afterAll(async () => {
    await closeDatabase()
  })
}

/**
 * Setup pour tests nécessitant Miles Republic
 */
export const setupMilesRepublicTests = () => {
  beforeEach(async () => {
    await cleanDatabase()
    await cleanMilesRepublicDatabase()
  })

  afterAll(async () => {
    await closeDatabase()
  })
}

/**
 * Helper pour exécuter un test dans une transaction (rollback automatique)
 * Utile pour isolation maximale
 */
export const runInTransaction = async <T>(
  callback: (tx: PrismaClient) => Promise<T>
): Promise<T> => {
  return await testDb.$transaction(async (tx) => {
    return await callback(tx as PrismaClient)
  })
}
