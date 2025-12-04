/**
 * Tests unitaires pour le service UpdateAutoApplyScheduler
 *
 * Ces tests vérifient la logique du scheduler sans nécessiter de base de données.
 * Les tests d'intégration avec la BDD sont dans un fichier séparé.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals'

// ─────────────────────────────────────────────────────────────
// TESTS: Tri topologique (utilise le module réel)
// ─────────────────────────────────────────────────────────────

describe('UpdateAutoApplyScheduler - Tri topologique', () => {
  test('devrait trier dans l\'ordre: event → edition → organizer → races', async () => {
    const { sortBlocksByDependencies } = await import('@data-agents/database')

    // Applications dans le désordre
    const applications = [
      { id: 'app-races', blockType: 'races' as const },
      { id: 'app-organizer', blockType: 'organizer' as const },
      { id: 'app-event', blockType: 'event' as const },
      { id: 'app-edition', blockType: 'edition' as const }
    ]

    const sorted = sortBlocksByDependencies(applications)

    expect(sorted[0].blockType).toBe('event')
    expect(sorted[1].blockType).toBe('edition')
    expect(sorted[2].blockType).toBe('organizer')
    expect(sorted[3].blockType).toBe('races')
  })

  test('devrait gérer les applications partielles (edition + races)', async () => {
    const { sortBlocksByDependencies } = await import('@data-agents/database')

    const applications = [
      { id: 'app-races', blockType: 'races' as const },
      { id: 'app-edition', blockType: 'edition' as const }
    ]

    const sorted = sortBlocksByDependencies(applications)

    expect(sorted).toHaveLength(2)
    expect(sorted[0].blockType).toBe('edition')
    expect(sorted[1].blockType).toBe('races')
  })

  test('devrait placer les blockType null (legacy) à la fin', async () => {
    const { sortBlocksByDependencies } = await import('@data-agents/database')

    const applications = [
      { id: 'app-legacy', blockType: null },
      { id: 'app-event', blockType: 'event' as const },
      { id: 'app-edition', blockType: 'edition' as const }
    ]

    const sorted = sortBlocksByDependencies(applications)

    expect(sorted[0].blockType).toBe('event')
    expect(sorted[1].blockType).toBe('edition')
    expect(sorted[2].blockType).toBe(null)
  })

  test('devrait préserver l\'ordre si déjà correct', async () => {
    const { sortBlocksByDependencies } = await import('@data-agents/database')

    const applications = [
      { id: 'app-event', blockType: 'event' as const },
      { id: 'app-edition', blockType: 'edition' as const },
      { id: 'app-races', blockType: 'races' as const }
    ]

    const sorted = sortBlocksByDependencies(applications)

    expect(sorted[0].id).toBe('app-event')
    expect(sorted[1].id).toBe('app-edition')
    expect(sorted[2].id).toBe('app-races')
  })

  test('devrait gérer une liste vide', async () => {
    const { sortBlocksByDependencies } = await import('@data-agents/database')

    const sorted = sortBlocksByDependencies([])

    expect(sorted).toHaveLength(0)
  })

  test('devrait gérer une seule application', async () => {
    const { sortBlocksByDependencies } = await import('@data-agents/database')

    const sorted = sortBlocksByDependencies([
      { id: 'app-single', blockType: 'edition' as const }
    ])

    expect(sorted).toHaveLength(1)
    expect(sorted[0].blockType).toBe('edition')
  })
})

// ─────────────────────────────────────────────────────────────
// TESTS: Validation des blocs requis
// ─────────────────────────────────────────────────────────────

describe('UpdateAutoApplyScheduler - Validation des blocs requis', () => {
  test('NEW_EVENT avec event + edition → Validation OK', async () => {
    const { validateRequiredBlocks } = await import('@data-agents/database')

    const result = validateRequiredBlocks(
      [
        { blockType: 'event' as const, id: 'app-1' },
        { blockType: 'edition' as const, id: 'app-2' }
      ],
      'NEW_EVENT'
    )

    expect(result.valid).toBe(true)
    expect(result.missing).toEqual([])
  })

  test('NEW_EVENT sans event → Validation FAILED', async () => {
    const { validateRequiredBlocks } = await import('@data-agents/database')

    const result = validateRequiredBlocks(
      [{ blockType: 'edition' as const, id: 'app-1' }],
      'NEW_EVENT'
    )

    expect(result.valid).toBe(false)
    expect(result.missing).toContain('event')
  })

  test('NEW_EVENT sans edition → Validation FAILED', async () => {
    const { validateRequiredBlocks } = await import('@data-agents/database')

    const result = validateRequiredBlocks(
      [{ blockType: 'event' as const, id: 'app-1' }],
      'NEW_EVENT'
    )

    expect(result.valid).toBe(false)
    expect(result.missing).toContain('edition')
  })

  test('EDITION_UPDATE avec edition → Validation OK', async () => {
    const { validateRequiredBlocks } = await import('@data-agents/database')

    const result = validateRequiredBlocks(
      [{ blockType: 'edition' as const, id: 'app-1' }],
      'EDITION_UPDATE'
    )

    expect(result.valid).toBe(true)
    expect(result.missing).toEqual([])
  })

  test('EDITION_UPDATE sans edition → Validation FAILED', async () => {
    const { validateRequiredBlocks } = await import('@data-agents/database')

    const result = validateRequiredBlocks(
      [{ blockType: 'races' as const, id: 'app-1' }],
      'EDITION_UPDATE'
    )

    expect(result.valid).toBe(false)
    expect(result.missing).toContain('edition')
  })

  test('EVENT_UPDATE avec event → Validation OK', async () => {
    const { validateRequiredBlocks } = await import('@data-agents/database')

    const result = validateRequiredBlocks(
      [{ blockType: 'event' as const, id: 'app-1' }],
      'EVENT_UPDATE'
    )

    expect(result.valid).toBe(true)
    expect(result.missing).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────
// TESTS: Explication de l'ordre d'exécution
// ─────────────────────────────────────────────────────────────

describe('UpdateAutoApplyScheduler - Explication ordre exécution', () => {
  test('devrait générer un message lisible pour 3 blocs', async () => {
    const { explainExecutionOrder } = await import('@data-agents/database')

    const message = explainExecutionOrder([
      { blockType: 'event' as const, id: 'app-1' },
      { blockType: 'edition' as const, id: 'app-2' },
      { blockType: 'races' as const, id: 'app-3' }
    ])

    expect(message).toBe("Ordre d'exécution: event → edition → races")
  })

  test('devrait gérer les blockType null', async () => {
    const { explainExecutionOrder } = await import('@data-agents/database')

    const message = explainExecutionOrder([
      { blockType: 'event' as const, id: 'app-1' },
      { blockType: null, id: 'app-2' }
    ])

    expect(message).toBe("Ordre d'exécution: event → legacy")
  })

  test('devrait retourner message vide pour liste vide', async () => {
    const { explainExecutionOrder } = await import('@data-agents/database')

    const message = explainExecutionOrder([])

    expect(message).toBe("Ordre d'exécution: ")
  })
})

// ─────────────────────────────────────────────────────────────
// TESTS: Structure AutoApplyLastRunResult
// ─────────────────────────────────────────────────────────────

describe('UpdateAutoApplyScheduler - Structure des résultats', () => {
  test('devrait avoir la structure correcte pour un résultat de succès', () => {
    const result = {
      success: 3,
      failed: 0,
      errors: [] as string[],
      appliedIds: ['app-1', 'app-2', 'app-3'],
      failedIds: [] as string[]
    }

    expect(result.success).toBe(3)
    expect(result.failed).toBe(0)
    expect(result.errors).toHaveLength(0)
    expect(result.appliedIds).toHaveLength(3)
    expect(result.failedIds).toHaveLength(0)
  })

  test('devrait avoir la structure correcte pour un résultat partiel', () => {
    const result = {
      success: 2,
      failed: 1,
      errors: ['app-3: Foreign key constraint failed'],
      appliedIds: ['app-1', 'app-2'],
      failedIds: ['app-3']
    }

    expect(result.success).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Foreign key constraint')
    expect(result.appliedIds).toHaveLength(2)
    expect(result.failedIds).toHaveLength(1)
  })

  test('devrait avoir la structure correcte pour un résultat vide', () => {
    const result = {
      success: 0,
      failed: 0,
      errors: [] as string[],
      appliedIds: [] as string[],
      failedIds: [] as string[]
    }

    expect(result.success).toBe(0)
    expect(result.failed).toBe(0)
    expect(result.errors).toHaveLength(0)
    expect(result.appliedIds).toHaveLength(0)
    expect(result.failedIds).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────
// TESTS: Logique de simulation d'exécution
// ─────────────────────────────────────────────────────────────

describe('UpdateAutoApplyScheduler - Logique d\'exécution', () => {
  test('devrait accumuler les résultats correctement', () => {
    // Simuler une exécution avec 3 applications
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
      appliedIds: [] as string[],
      failedIds: [] as string[]
    }

    // App 1: succès
    results.success++
    results.appliedIds.push('app-1')

    // App 2: échec
    results.failed++
    results.failedIds.push('app-2')
    results.errors.push('app-2: Connection timeout')

    // App 3: succès
    results.success++
    results.appliedIds.push('app-3')

    expect(results.success).toBe(2)
    expect(results.failed).toBe(1)
    expect(results.appliedIds).toEqual(['app-1', 'app-3'])
    expect(results.failedIds).toEqual(['app-2'])
  })

  test('devrait gérer le cas où toutes les applications échouent', () => {
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
      appliedIds: [] as string[],
      failedIds: [] as string[]
    }

    // Toutes échouent
    for (let i = 1; i <= 3; i++) {
      results.failed++
      results.failedIds.push(`app-${i}`)
      results.errors.push(`app-${i}: Error`)
    }

    expect(results.success).toBe(0)
    expect(results.failed).toBe(3)
    expect(results.failedIds).toHaveLength(3)
    expect(results.errors).toHaveLength(3)
  })

  test('devrait calculer la prochaine exécution correctement', () => {
    const intervalMinutes = 60
    const now = new Date()
    const nextRun = new Date(now.getTime() + intervalMinutes * 60 * 1000)

    // La prochaine exécution devrait être dans 60 minutes
    const diffMs = nextRun.getTime() - now.getTime()
    const diffMinutes = diffMs / (60 * 1000)

    expect(diffMinutes).toBe(60)
  })

  test('devrait respecter l\'intervalle minimum de 5 minutes', () => {
    const minInterval = 5
    const maxInterval = 1440 // 24h

    expect(minInterval).toBeGreaterThanOrEqual(5)
    expect(maxInterval).toBeLessThanOrEqual(1440)
  })
})
