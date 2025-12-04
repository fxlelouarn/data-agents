import {
  sortBlocksByDependencies,
  validateRequiredBlocks,
  explainExecutionOrder,
  BlockApplication,
  BLOCK_DEPENDENCIES
} from '../block-execution-order'

describe('sortBlocksByDependencies', () => {
  test('Ordre correct déjà fourni → Pas de changement', () => {
    const blocks: BlockApplication[] = [
      { blockType: 'event', id: 'app1' },
      { blockType: 'edition', id: 'app2' },
      { blockType: 'races', id: 'app3' }
    ]
    
    const sorted = sortBlocksByDependencies(blocks)
    
    expect(sorted.map(b => b.blockType)).toEqual(['event', 'edition', 'races'])
    expect(sorted.map(b => b.id)).toEqual(['app1', 'app2', 'app3'])
  })
  
  test('Ordre inversé (races, edition, event) → Réordonné (event, edition, races)', () => {
    const blocks: BlockApplication[] = [
      { blockType: 'races', id: 'app3' },
      { blockType: 'edition', id: 'app2' },
      { blockType: 'event', id: 'app1' }
    ]
    
    const sorted = sortBlocksByDependencies(blocks)
    
    expect(sorted.map(b => b.blockType)).toEqual(['event', 'edition', 'races'])
    expect(sorted.map(b => b.id)).toEqual(['app1', 'app2', 'app3'])
  })
  
  test('Ordre mélangé (organizer, races, edition, event) → Réordonné correctement', () => {
    const blocks: BlockApplication[] = [
      { blockType: 'organizer', id: 'app4' },
      { blockType: 'races', id: 'app3' },
      { blockType: 'edition', id: 'app2' },
      { blockType: 'event', id: 'app1' }
    ]
    
    const sorted = sortBlocksByDependencies(blocks)
    
    // event → edition → { organizer, races }
    // L'ordre entre organizer et races est indéterminé (tous deux dépendent de edition)
    expect(sorted.map(b => b.blockType)).toEqual([
      'event',
      'edition',
      expect.stringMatching(/^(organizer|races)$/),
      expect.stringMatching(/^(organizer|races)$/)
    ])
    
    // Vérifier que event est avant edition
    const eventIndex = sorted.findIndex(b => b.blockType === 'event')
    const editionIndex = sorted.findIndex(b => b.blockType === 'edition')
    expect(eventIndex).toBeLessThan(editionIndex)
    
    // Vérifier que edition est avant organizer et races
    const organizerIndex = sorted.findIndex(b => b.blockType === 'organizer')
    const racesIndex = sorted.findIndex(b => b.blockType === 'races')
    expect(editionIndex).toBeLessThan(organizerIndex)
    expect(editionIndex).toBeLessThan(racesIndex)
  })
  
  test('Blocs manquants (event, races) → Ordre: [event, races]', () => {
    const blocks: BlockApplication[] = [
      { blockType: 'races', id: 'app3' },
      { blockType: 'event', id: 'app1' }
    ]
    
    const sorted = sortBlocksByDependencies(blocks)
    
    // event avant races, même sans edition
    expect(sorted.map(b => b.blockType)).toEqual(['event', 'races'])
  })
  
  test('Seulement edition (pas de event) → Reste edition seule', () => {
    const blocks: BlockApplication[] = [
      { blockType: 'edition', id: 'app2' }
    ]
    
    const sorted = sortBlocksByDependencies(blocks)
    
    // edition passe même sans event (dépendance absente)
    expect(sorted.map(b => b.blockType)).toEqual(['edition'])
  })
  
  test('Blocs dupliqués → Déduplication', () => {
    const blocks: BlockApplication[] = [
      { blockType: 'event', id: 'app1' },
      { blockType: 'event', id: 'app1-bis' }, // Doublon
      { blockType: 'edition', id: 'app2' }
    ]
    
    const sorted = sortBlocksByDependencies(blocks)
    
    // Un seul 'event' dans le résultat (le premier rencontré)
    expect(sorted).toHaveLength(2)
    expect(sorted.map(b => b.blockType)).toEqual(['event', 'edition'])
    expect(sorted[0].id).toBe('app1') // Premier event gardé
  })
  
  test('blockType null → Ajouté à la fin', () => {
    const blocks: BlockApplication[] = [
      { blockType: 'races', id: 'app3' },
      { blockType: null, id: 'app-legacy' },
      { blockType: 'event', id: 'app1' }
    ]
    
    const sorted = sortBlocksByDependencies(blocks)
    
    expect(sorted.map(b => b.blockType)).toEqual(['event', 'races', null])
    expect(sorted[2].id).toBe('app-legacy')
  })
  
  test('Liste vide → Retourne liste vide', () => {
    const blocks: BlockApplication[] = []
    
    const sorted = sortBlocksByDependencies(blocks)
    
    expect(sorted).toEqual([])
  })
  
  test('Tous les blocs du même type → Un seul gardé', () => {
    const blocks: BlockApplication[] = [
      { blockType: 'edition', id: 'app1' },
      { blockType: 'edition', id: 'app2' },
      { blockType: 'edition', id: 'app3' }
    ]
    
    const sorted = sortBlocksByDependencies(blocks)
    
    expect(sorted).toHaveLength(1)
    expect(sorted[0].blockType).toBe('edition')
    expect(sorted[0].id).toBe('app1') // Premier gardé
  })
})

describe('validateRequiredBlocks', () => {
  test('NEW_EVENT avec event + edition → Valid', () => {
    const blocks: BlockApplication[] = [
      { blockType: 'event', id: 'app1' },
      { blockType: 'edition', id: 'app2' }
    ]
    
    const result = validateRequiredBlocks(blocks, 'NEW_EVENT')
    
    expect(result.valid).toBe(true)
    expect(result.missing).toEqual([])
  })
  
  test('NEW_EVENT sans event → Invalid, missing: [event]', () => {
    const blocks: BlockApplication[] = [
      { blockType: 'edition', id: 'app2' }
    ]
    
    const result = validateRequiredBlocks(blocks, 'NEW_EVENT')
    
    expect(result.valid).toBe(false)
    expect(result.missing).toEqual(['event'])
  })
  
  test('NEW_EVENT sans edition → Invalid, missing: [edition]', () => {
    const blocks: BlockApplication[] = [
      { blockType: 'event', id: 'app1' }
    ]
    
    const result = validateRequiredBlocks(blocks, 'NEW_EVENT')
    
    expect(result.valid).toBe(false)
    expect(result.missing).toEqual(['edition'])
  })
  
  test('NEW_EVENT avec tous les blocs → Valid', () => {
    const blocks: BlockApplication[] = [
      { blockType: 'event', id: 'app1' },
      { blockType: 'edition', id: 'app2' },
      { blockType: 'organizer', id: 'app3' },
      { blockType: 'races', id: 'app4' }
    ]
    
    const result = validateRequiredBlocks(blocks, 'NEW_EVENT')
    
    expect(result.valid).toBe(true)
    expect(result.missing).toEqual([])
  })
  
  test('EDITION_UPDATE avec edition → Valid', () => {
    const blocks: BlockApplication[] = [
      { blockType: 'edition', id: 'app2' }
    ]
    
    const result = validateRequiredBlocks(blocks, 'EDITION_UPDATE')
    
    expect(result.valid).toBe(true)
    expect(result.missing).toEqual([])
  })
  
  test('EDITION_UPDATE sans edition → Invalid', () => {
    const blocks: BlockApplication[] = [
      { blockType: 'races', id: 'app3' }
    ]
    
    const result = validateRequiredBlocks(blocks, 'EDITION_UPDATE')
    
    expect(result.valid).toBe(false)
    expect(result.missing).toEqual(['edition'])
  })
  
  test('Type de proposition inconnu → Valid (pas de validation)', () => {
    const blocks: BlockApplication[] = [
      { blockType: 'races', id: 'app3' }
    ]
    
    const result = validateRequiredBlocks(blocks, 'UNKNOWN_TYPE')
    
    expect(result.valid).toBe(true)
    expect(result.missing).toEqual([])
  })
})

describe('explainExecutionOrder', () => {
  test('Ordre standard → String lisible', () => {
    const blocks: BlockApplication[] = [
      { blockType: 'event', id: 'app1' },
      { blockType: 'edition', id: 'app2' },
      { blockType: 'races', id: 'app3' }
    ]
    
    const explanation = explainExecutionOrder(blocks)
    
    expect(explanation).toBe('Ordre d\'exécution: event → edition → races')
  })
  
  test('Avec bloc legacy → Affiche "legacy"', () => {
    const blocks: BlockApplication[] = [
      { blockType: 'event', id: 'app1' },
      { blockType: null, id: 'app-legacy' }
    ]
    
    const explanation = explainExecutionOrder(blocks)
    
    expect(explanation).toBe('Ordre d\'exécution: event → legacy')
  })
  
  test('Liste vide → String vide', () => {
    const blocks: BlockApplication[] = []
    
    const explanation = explainExecutionOrder(blocks)
    
    expect(explanation).toBe('Ordre d\'exécution: ')
  })
})

describe('BLOCK_DEPENDENCIES', () => {
  test('Graphe de dépendances est correct', () => {
    expect(BLOCK_DEPENDENCIES).toEqual({
      'event': [],
      'edition': ['event'],
      'organizer': ['edition'],
      'races': ['edition']
    })
  })
  
  test('Aucune dépendance circulaire', () => {
    // Vérifier qu'on peut trier tous les blocs sans cycle infini
    const blocks: BlockApplication[] = [
      { blockType: 'organizer', id: 'app4' },
      { blockType: 'races', id: 'app3' },
      { blockType: 'edition', id: 'app2' },
      { blockType: 'event', id: 'app1' }
    ]
    
    // Si cycle infini, ce test timeout
    const sorted = sortBlocksByDependencies(blocks)
    
    expect(sorted).toHaveLength(4)
  })
})
