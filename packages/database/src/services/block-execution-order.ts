/**
 * Block Execution Order - Tri topologique des blocs selon leurs dépendances
 * 
 * Ce module garantit que les ProposalApplication sont exécutées dans le bon ordre,
 * même si l'utilisateur les a validées dans le désordre.
 * 
 * Dépendances:
 * - event → Pas de dépendances
 * - edition → Dépend de event
 * - organizer → Dépend de edition
 * - races → Dépend de edition
 */

export type BlockType = 'event' | 'edition' | 'organizer' | 'races'

export interface BlockApplication {
  blockType: BlockType | null
  id: string
}

/**
 * Graphe de dépendances entre blocs
 * 
 * Exemple: BLOCK_DEPENDENCIES['edition'] = ['event']
 * → Pour exécuter 'edition', il faut d'abord exécuter 'event'
 */
export const BLOCK_DEPENDENCIES: Record<BlockType, BlockType[]> = {
  'event': [],               // Pas de dépendances
  'edition': ['event'],      // Dépend de event
  'organizer': ['edition'],  // Dépend de edition
  'races': ['edition']       // Dépend de edition
}

/**
 * Tri topologique des blocs selon leurs dépendances
 * 
 * Algorithme:
 * 1. Pour chaque bloc, visiter récursivement ses dépendances
 * 2. Ajouter le bloc à la liste triée après ses dépendances
 * 3. Éviter les doublons avec un Set
 * 
 * @param blocks Liste de blocs à trier
 * @returns Liste triée selon l'ordre de dépendances
 * 
 * @example
 * // Input: [races, event, edition]
 * // Output: [event, edition, races]
 * 
 * @example
 * // Input: [edition, races] (pas de event)
 * // Output: [edition, races] (edition passe même sans event car event absent)
 */
export function sortBlocksByDependencies(
  blocks: BlockApplication[]
): BlockApplication[] {
  const sorted: BlockApplication[] = []
  const visited = new Set<string>() // Set de blockType pour éviter doublons
  
  // Map pour retrouver rapidement un bloc par son blockType
  // En cas de doublons, on garde le PREMIER rencontré
  const blocksByType = new Map<string, BlockApplication>()
  blocks.forEach(block => {
    if (block.blockType && !blocksByType.has(block.blockType)) {
      blocksByType.set(block.blockType, block)
    }
  })
  
  /**
   * Visite récursive d'un bloc et de ses dépendances (DFS)
   */
  function visit(block: BlockApplication) {
    // Ignorer les blocs déjà visités
    if (!block.blockType || visited.has(block.blockType)) {
      return
    }
    
    // Visiter d'abord les dépendances
    const deps = BLOCK_DEPENDENCIES[block.blockType as BlockType] || []
    deps.forEach(depType => {
      const depBlock = blocksByType.get(depType)
      // Si la dépendance existe dans la liste, la visiter d'abord
      if (depBlock) {
        visit(depBlock)
      }
      // Sinon, continuer (la dépendance n'est peut-être pas validée)
    })
    
    // Marquer comme visité et ajouter à la liste triée
    visited.add(block.blockType)
    sorted.push(block)
  }
  
  // Visiter dans un ordre stable : event → edition → organizer → races
  // Cela garantit un ordre déterministe
  const visitOrder: BlockType[] = ['event', 'edition', 'organizer', 'races']
  visitOrder.forEach(blockType => {
    const block = blocksByType.get(blockType)
    if (block) {
      visit(block)
    }
  })
  
  // Visiter les blocs restants qui ne sont pas dans l'ordre standard
  blocks.forEach(block => {
    if (block.blockType && !visited.has(block.blockType)) {
      visit(block)
    }
  })
  
  // Ajouter les blocs sans blockType (legacy) à la fin
  blocks.forEach(block => {
    if (!block.blockType && !sorted.includes(block)) {
      sorted.push(block)
    }
  })
  
  return sorted
}

/**
 * Vérifie si tous les blocs requis sont présents
 * 
 * @param blocks Liste de blocs à vérifier
 * @param proposalType Type de proposition (NEW_EVENT, EDITION_UPDATE, etc.)
 * @returns { valid: boolean, missing: BlockType[] }
 */
export function validateRequiredBlocks(
  blocks: BlockApplication[],
  proposalType: string
): { valid: boolean; missing: BlockType[] } {
  const blockTypes = new Set(
    blocks.map(b => b.blockType).filter(Boolean) as BlockType[]
  )
  
  const missing: BlockType[] = []
  
  if (proposalType === 'NEW_EVENT') {
    // NEW_EVENT requiert: event, edition (races optionnel)
    if (!blockTypes.has('event')) missing.push('event')
    if (!blockTypes.has('edition')) missing.push('edition')
  } else if (proposalType === 'EDITION_UPDATE') {
    // EDITION_UPDATE requiert au moins: edition
    if (!blockTypes.has('edition')) missing.push('edition')
  }
  
  return {
    valid: missing.length === 0,
    missing
  }
}

/**
 * Récupère toutes les dépendances d'un bloc (récursif)
 * 
 * @param blockType Type de bloc
 * @returns Liste de tous les blocs dont dépend ce bloc (ordre: racine → feuille)
 * 
 * @example
 * getAllDependencies('races') // → ['event', 'edition']
 * getAllDependencies('edition') // → ['event']
 * getAllDependencies('event') // → []
 */
export function getAllDependencies(blockType: BlockType): BlockType[] {
  const deps = BLOCK_DEPENDENCIES[blockType] || []
  const allDeps: BlockType[] = []
  
  // Ajouter les dépendances directes
  for (const dep of deps) {
    // Récursivement ajouter les dépendances de la dépendance
    const subDeps = getAllDependencies(dep)
    subDeps.forEach(subDep => {
      if (!allDeps.includes(subDep)) {
        allDeps.push(subDep)
      }
    })
    
    // Ajouter la dépendance elle-même
    if (!allDeps.includes(dep)) {
      allDeps.push(dep)
    }
  }
  
  return allDeps
}

/**
 * Explique l'ordre d'exécution pour le logging
 * 
 * @param blocks Liste triée de blocs
 * @returns String lisible pour les logs
 */
export function explainExecutionOrder(blocks: BlockApplication[]): string {
  const order = blocks
    .map(b => b.blockType || 'legacy')
    .join(' → ')
  
  return `Ordre d'exécution: ${order}`
}
