/**
 * Test d'intégration : Tri topologique dans /api/updates/bulk/apply
 * 
 * Vérifie que les ProposalApplication sont exécutées dans le bon ordre
 * selon les dépendances entre blocs, peu importe l'ordre de soumission.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

describe('POST /api/updates/bulk/apply - Tri topologique', () => {
  let testProposalId: string
  let testAgentId: string
  let appIds: string[]

  beforeAll(async () => {
    // Créer un agent de test
    testAgentId = `test-agent-${Date.now()}`
    await prisma.agent.create({
      data: {
        id: testAgentId,
        name: 'Test Agent',
        type: 'EXTRACTOR',
        isActive: false,
        frequency: 'MANUAL',
        config: {}
      }
    })
  })

  afterAll(async () => {
    // Nettoyer
    if (appIds && appIds.length > 0) {
      await prisma.proposalApplication.deleteMany({
        where: { id: { in: appIds } }
      })
    }
    if (testProposalId) {
      await prisma.proposal.deleteMany({
        where: { id: testProposalId }
      })
    }
    if (testAgentId) {
      await prisma.agent.deleteMany({
        where: { id: testAgentId }
      })
    }
    await prisma.$disconnect()
  })

  beforeEach(() => {
    appIds = []
  })

  test('Applications dans le désordre → Tri correct (event → edition → races)', async () => {
    // 1. Créer une proposition NEW_EVENT
    testProposalId = `test-proposal-${Date.now()}`
    
    await prisma.proposal.create({
      data: {
        id: testProposalId,
        agentId: testAgentId,
        type: 'NEW_EVENT',
        status: 'APPROVED',
        changes: {
          name: 'Test Event',
          city: 'Paris',
          year: 2025,
          startDate: new Date('2025-06-01')
        },
        justification: {},
        confidence: 0.9
      }
    })

    // 2. Créer 3 applications DANS LE DÉSORDRE : races, event, edition
    const appRaces = await prisma.proposalApplication.create({
      data: {
        id: `app-races-${Date.now()}`,
        proposalId: testProposalId,
        blockType: 'races',
        status: 'PENDING',
        appliedChanges: { racesToAdd: [] }
      }
    })
    appIds.push(appRaces.id)

    const appEvent = await prisma.proposalApplication.create({
      data: {
        id: `app-event-${Date.now()}`,
        proposalId: testProposalId,
        blockType: 'event',
        status: 'PENDING',
        appliedChanges: { name: 'Test Event' }
      }
    })
    appIds.push(appEvent.id)

    const appEdition = await prisma.proposalApplication.create({
      data: {
        id: `app-edition-${Date.now()}`,
        proposalId: testProposalId,
        blockType: 'edition',
        status: 'PENDING',
        appliedChanges: { year: 2025 }
      }
    })
    appIds.push(appEdition.id)

    // 3. Simuler l'appel à sortBlocksByDependencies
    const { sortBlocksByDependencies, explainExecutionOrder } = await import('@data-agents/database')
    
    const applications = [appRaces, appEvent, appEdition]
    
    const sortedApplications = sortBlocksByDependencies(
      applications.map(app => ({
        blockType: app.blockType,
        id: app.id
      }))
    )

    // 4. Récupérer dans l'ordre trié
    const applicationsInOrder = sortedApplications
      .map(sorted => applications.find(app => app.id === sorted.id)!)
      .filter(Boolean)

    // 5. Assertions
    expect(applicationsInOrder).toHaveLength(3)
    
    // Ordre attendu : event → edition → races
    expect(applicationsInOrder[0].blockType).toBe('event')
    expect(applicationsInOrder[1].blockType).toBe('edition')
    expect(applicationsInOrder[2].blockType).toBe('races')
    
    // Vérifier les IDs correspondants
    expect(applicationsInOrder[0].id).toBe(appEvent.id)
    expect(applicationsInOrder[1].id).toBe(appEdition.id)
    expect(applicationsInOrder[2].id).toBe(appRaces.id)

    // 6. Vérifier le message d'explication
    const executionOrder = explainExecutionOrder(sortedApplications)
    expect(executionOrder).toBe('Ordre d\'exécution: event → edition → races')
  })

  test('Applications partielles (edition + races) → Ordre préservé', async () => {
    // Créer une proposition EDITION_UPDATE
    testProposalId = `test-proposal-partial-${Date.now()}`
    
    await prisma.proposal.create({
      data: {
        id: testProposalId,
        agentId: testAgentId,
        type: 'EDITION_UPDATE',
        status: 'APPROVED',
        eventId: '12345',
        editionId: '67890',
        changes: {
          startDate: new Date('2025-06-01')
        },
        justification: {},
        confidence: 0.8
      }
    })

    // Créer 2 applications : races, edition (pas de event)
    const appRaces = await prisma.proposalApplication.create({
      data: {
        id: `app-races-partial-${Date.now()}`,
        proposalId: testProposalId,
        blockType: 'races',
        status: 'PENDING',
        appliedChanges: {}
      }
    })
    appIds.push(appRaces.id)

    const appEdition = await prisma.proposalApplication.create({
      data: {
        id: `app-edition-partial-${Date.now()}`,
        proposalId: testProposalId,
        blockType: 'edition',
        status: 'PENDING',
        appliedChanges: {}
      }
    })
    appIds.push(appEdition.id)

    // Tri
    const { sortBlocksByDependencies } = await import('@data-agents/database')
    
    const sortedApplications = sortBlocksByDependencies([
      { blockType: appRaces.blockType, id: appRaces.id },
      { blockType: appEdition.blockType, id: appEdition.id }
    ])

    // Assertions
    expect(sortedApplications).toHaveLength(2)
    expect(sortedApplications[0].blockType).toBe('edition')
    expect(sortedApplications[1].blockType).toBe('races')
  })

  test('Application avec blockType null (legacy) → Ajouté à la fin', async () => {
    testProposalId = `test-proposal-legacy-${Date.now()}`
    
    await prisma.proposal.create({
      data: {
        id: testProposalId,
        agentId: testAgentId,
        type: 'NEW_EVENT',
        status: 'APPROVED',
        changes: {},
        justification: {},
        confidence: 0.7
      }
    })

    // Créer applications mixtes (nouveau + legacy)
    const appLegacy = await prisma.proposalApplication.create({
      data: {
        id: `app-legacy-${Date.now()}`,
        proposalId: testProposalId,
        blockType: null, // Legacy
        status: 'PENDING',
        appliedChanges: {}
      }
    })
    appIds.push(appLegacy.id)

    const appEvent = await prisma.proposalApplication.create({
      data: {
        id: `app-event-legacy-${Date.now()}`,
        proposalId: testProposalId,
        blockType: 'event',
        status: 'PENDING',
        appliedChanges: {}
      }
    })
    appIds.push(appEvent.id)

    // Tri
    const { sortBlocksByDependencies } = await import('@data-agents/database')
    
    const sortedApplications = sortBlocksByDependencies([
      { blockType: appLegacy.blockType, id: appLegacy.id },
      { blockType: appEvent.blockType, id: appEvent.id }
    ])

    // Assertions
    expect(sortedApplications).toHaveLength(2)
    expect(sortedApplications[0].blockType).toBe('event')
    expect(sortedApplications[1].blockType).toBe(null) // Legacy à la fin
  })

  test('Ordre déjà correct → Pas de changement', async () => {
    testProposalId = `test-proposal-correct-${Date.now()}`
    
    await prisma.proposal.create({
      data: {
        id: testProposalId,
        agentId: testAgentId,
        type: 'NEW_EVENT',
        status: 'APPROVED',
        changes: {},
        justification: {},
        confidence: 0.9
      }
    })

    // Créer dans le bon ordre
    const appEvent = await prisma.proposalApplication.create({
      data: {
        id: `app-event-correct-${Date.now()}`,
        proposalId: testProposalId,
        blockType: 'event',
        status: 'PENDING',
        appliedChanges: {}
      }
    })
    appIds.push(appEvent.id)

    const appEdition = await prisma.proposalApplication.create({
      data: {
        id: `app-edition-correct-${Date.now()}`,
        proposalId: testProposalId,
        blockType: 'edition',
        status: 'PENDING',
        appliedChanges: {}
      }
    })
    appIds.push(appEdition.id)

    // Tri
    const { sortBlocksByDependencies } = await import('@data-agents/database')
    
    const sortedApplications = sortBlocksByDependencies([
      { blockType: appEvent.blockType, id: appEvent.id },
      { blockType: appEdition.blockType, id: appEdition.id }
    ])

    // L'ordre doit rester le même
    expect(sortedApplications[0].id).toBe(appEvent.id)
    expect(sortedApplications[1].id).toBe(appEdition.id)
  })
})

// ✅ PHASE 3: Tests de validation des blocs requis
describe('POST /api/updates/bulk/apply - Validation blocs requis', () => {
  let testProposalId: string
  let testAgentId: string
  let appIds: string[]

  beforeAll(async () => {
    testAgentId = `test-agent-validation-${Date.now()}`
    await prisma.agent.create({
      data: {
        id: testAgentId,
        name: 'Test Agent Validation',
        type: 'EXTRACTOR',
        isActive: false,
        frequency: 'MANUAL',
        config: {}
      }
    })
  })

  afterAll(async () => {
    if (appIds && appIds.length > 0) {
      await prisma.proposalApplication.deleteMany({
        where: { id: { in: appIds } }
      })
    }
    if (testProposalId) {
      await prisma.proposal.deleteMany({
        where: { id: testProposalId }
      })
    }
    if (testAgentId) {
      await prisma.agent.deleteMany({
        where: { id: testAgentId }
      })
    }
    await prisma.$disconnect()
  })

  beforeEach(() => {
    appIds = []
  })

  test('NEW_EVENT avec event + edition → Validation OK', async () => {
    testProposalId = `test-validation-ok-${Date.now()}`
    
    await prisma.proposal.create({
      data: {
        id: testProposalId,
        agentId: testAgentId,
        type: 'NEW_EVENT',
        status: 'APPROVED',
        changes: {},
        justification: {},
        confidence: 0.9
      }
    })

    const appEvent = await prisma.proposalApplication.create({
      data: {
        id: `app-event-valid-${Date.now()}`,
        proposalId: testProposalId,
        blockType: 'event',
        status: 'PENDING',
        appliedChanges: {}
      }
    })
    appIds.push(appEvent.id)

    const appEdition = await prisma.proposalApplication.create({
      data: {
        id: `app-edition-valid-${Date.now()}`,
        proposalId: testProposalId,
        blockType: 'edition',
        status: 'PENDING',
        appliedChanges: {}
      }
    })
    appIds.push(appEdition.id)

    // Validation
    const { validateRequiredBlocks } = await import('@data-agents/database')
    
    const result = validateRequiredBlocks(
      [
        { blockType: appEvent.blockType, id: appEvent.id },
        { blockType: appEdition.blockType, id: appEdition.id }
      ],
      'NEW_EVENT'
    )

    expect(result.valid).toBe(true)
    expect(result.missing).toEqual([])
  })

  test('NEW_EVENT sans event → Validation FAILED (missing: event)', async () => {
    testProposalId = `test-validation-no-event-${Date.now()}`
    
    await prisma.proposal.create({
      data: {
        id: testProposalId,
        agentId: testAgentId,
        type: 'NEW_EVENT',
        status: 'APPROVED',
        changes: {},
        justification: {},
        confidence: 0.9
      }
    })

    // Seulement edition (pas de event)
    const appEdition = await prisma.proposalApplication.create({
      data: {
        id: `app-edition-no-event-${Date.now()}`,
        proposalId: testProposalId,
        blockType: 'edition',
        status: 'PENDING',
        appliedChanges: {}
      }
    })
    appIds.push(appEdition.id)

    // Validation
    const { validateRequiredBlocks } = await import('@data-agents/database')
    
    const result = validateRequiredBlocks(
      [{ blockType: appEdition.blockType, id: appEdition.id }],
      'NEW_EVENT'
    )

    expect(result.valid).toBe(false)
    expect(result.missing).toContain('event')
  })

  test('NEW_EVENT sans edition → Validation FAILED (missing: edition)', async () => {
    testProposalId = `test-validation-no-edition-${Date.now()}`
    
    await prisma.proposal.create({
      data: {
        id: testProposalId,
        agentId: testAgentId,
        type: 'NEW_EVENT',
        status: 'APPROVED',
        changes: {},
        justification: {},
        confidence: 0.9
      }
    })

    // Seulement event (pas de edition)
    const appEvent = await prisma.proposalApplication.create({
      data: {
        id: `app-event-no-edition-${Date.now()}`,
        proposalId: testProposalId,
        blockType: 'event',
        status: 'PENDING',
        appliedChanges: {}
      }
    })
    appIds.push(appEvent.id)

    // Validation
    const { validateRequiredBlocks } = await import('@data-agents/database')
    
    const result = validateRequiredBlocks(
      [{ blockType: appEvent.blockType, id: appEvent.id }],
      'NEW_EVENT'
    )

    expect(result.valid).toBe(false)
    expect(result.missing).toContain('edition')
  })

  test('EDITION_UPDATE avec edition → Validation OK', async () => {
    testProposalId = `test-validation-edition-update-${Date.now()}`
    
    await prisma.proposal.create({
      data: {
        id: testProposalId,
        agentId: testAgentId,
        type: 'EDITION_UPDATE',
        status: 'APPROVED',
        eventId: '12345',
        editionId: '67890',
        changes: {},
        justification: {},
        confidence: 0.8
      }
    })

    const appEdition = await prisma.proposalApplication.create({
      data: {
        id: `app-edition-update-${Date.now()}`,
        proposalId: testProposalId,
        blockType: 'edition',
        status: 'PENDING',
        appliedChanges: {}
      }
    })
    appIds.push(appEdition.id)

    // Validation
    const { validateRequiredBlocks } = await import('@data-agents/database')
    
    const result = validateRequiredBlocks(
      [{ blockType: appEdition.blockType, id: appEdition.id }],
      'EDITION_UPDATE'
    )

    expect(result.valid).toBe(true)
    expect(result.missing).toEqual([])
  })

  test('EDITION_UPDATE sans edition → Validation FAILED', async () => {
    testProposalId = `test-validation-edition-update-no-edition-${Date.now()}`
    
    await prisma.proposal.create({
      data: {
        id: testProposalId,
        agentId: testAgentId,
        type: 'EDITION_UPDATE',
        status: 'APPROVED',
        eventId: '12345',
        editionId: '67890',
        changes: {},
        justification: {},
        confidence: 0.8
      }
    })

    // Seulement races (pas de edition)
    const appRaces = await prisma.proposalApplication.create({
      data: {
        id: `app-races-no-edition-${Date.now()}`,
        proposalId: testProposalId,
        blockType: 'races',
        status: 'PENDING',
        appliedChanges: {}
      }
    })
    appIds.push(appRaces.id)

    // Validation
    const { validateRequiredBlocks } = await import('@data-agents/database')
    
    const result = validateRequiredBlocks(
      [{ blockType: appRaces.blockType, id: appRaces.id }],
      'EDITION_UPDATE'
    )

    expect(result.valid).toBe(false)
    expect(result.missing).toContain('edition')
  })
})
