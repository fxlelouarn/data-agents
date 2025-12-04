/**
 * Graphe de dépendances entre blocs pour la validation en cascade
 * ⚠️ DOIT être synchronisé avec backend (block-execution-order.ts)
 */
export type BlockType = 'event' | 'edition' | 'organizer' | 'races'

/**
 * Graphe des dépendances directes entre blocs
 * 
 * La validation d'un bloc nécessite que ses dépendances soient validées d'abord.
 * 
 * @example
 * organizer dépend de edition
 * edition dépend de event
 * → Pour valider organizer, il faut d'abord valider event puis edition
 */
export const BLOCK_DEPENDENCIES: Record<BlockType, BlockType[]> = {
  'event': [],               // Pas de dépendances (racine)
  'edition': ['event'],      // Dépend de event
  'organizer': ['edition'],  // Dépend de edition (et transitivement de event)
  'races': ['edition']       // Dépend de edition (et transitivement de event)
}

/**
 * Retourne tous les blocs qui dépendent (directement ou transitivement) d'un bloc donné
 * 
 * @param blockType - Type de bloc dont on veut les dépendants
 * @returns Liste des blocs qui dépendent de ce bloc
 * 
 * @example
 * getAllDependents('edition')
 * // → ['organizer', 'races']
 * // organizer et races dépendent de edition
 * 
 * @example
 * getAllDependents('event')
 * // → ['edition', 'organizer', 'races']
 * // Tous les blocs dépendent transitivement de event
 * 
 * @example
 * getAllDependents('organizer')
 * // → []
 * // Aucun bloc ne dépend de organizer
 */
export function getAllDependents(blockType: BlockType): BlockType[] {
  const result: BlockType[] = []
  const blocks = Object.keys(BLOCK_DEPENDENCIES) as BlockType[]

  // Vérifie si `candidate` dépend transitivement de `target`
  const dependsOn = (candidate: BlockType, target: BlockType, seen: Set<BlockType> = new Set()): boolean => {
    if (seen.has(candidate)) return false
    seen.add(candidate)
    const deps = BLOCK_DEPENDENCIES[candidate] || []
    if (deps.includes(target)) return true
    return deps.some(dep => dependsOn(dep, target, seen))
  }

  blocks.forEach(candidate => {
    if (candidate !== blockType && dependsOn(candidate, blockType)) {
      result.push(candidate)
    }
  })

  return result
}

/**
 * Calcule toutes les dépendances transitives d'un bloc dans l'ordre de validation
 * 
 * Utilise un parcours en profondeur pour résoudre les dépendances transitives
 * et retourne les blocs dans l'ordre dans lequel ils doivent être validés.
 * 
 * @param blockType - Type de bloc dont on veut les dépendances
 * @returns Liste ordonnée des blocs à valider avant le bloc demandé
 * 
 * @example
 * getAllDependencies('organizer')
 * // → ['event', 'edition']
 * // Ordre de validation : event d'abord, puis edition, puis organizer
 * 
 * @example
 * getAllDependencies('event')
 * // → []
 * // Aucune dépendance, peut être validé directement
 * 
 * @example
 * getAllDependencies('races')
 * // → ['event', 'edition']
 * // races dépend de edition, qui dépend de event
 */
export function getAllDependencies(blockType: BlockType): BlockType[] {
  const result: BlockType[] = []
  const visited = new Set<BlockType>()
  
  /**
   * Visite récursive des dépendances
   * Garantit qu'un bloc apparaît après toutes ses dépendances
   */
  function visit(block: BlockType) {
    if (visited.has(block)) return
    visited.add(block)
    
    // Visiter d'abord les dépendances de ce bloc
    const deps = BLOCK_DEPENDENCIES[block] || []
    deps.forEach(dep => visit(dep))
    
    // Puis ajouter le bloc lui-même
    result.push(block)
  }
  
  // Visiter uniquement les dépendances directes (pas le bloc lui-même)
  const directDeps = BLOCK_DEPENDENCIES[blockType] || []
  directDeps.forEach(dep => visit(dep))
  
  return result
}
