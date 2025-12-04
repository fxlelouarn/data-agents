/**
 * Convertit une structure de changes (agent) en selectedChanges (API)
 * 
 * Structure agent (changes) :
 * ```
 * {
 *   name: { old: 'A', new: 'B' },
 *   races: { toUpdate: [...], toAdd: [...] }
 * }
 * ```
 * 
 * Structure API (selectedChanges) :
 * ```
 * {
 *   name: 'B',  // Valeur sélectionnée (new)
 *   races: { toUpdate: [...], toAdd: [...] }  // Sous-structures passées telles quelles
 * }
 * ```
 * 
 * @param changes - Structure de changes de l'agent
 * @returns selectedChanges prêt pour applyProposal()
 */
export function convertChangesToSelectedChanges(changes: Record<string, any>): Record<string, any> {
  const selected: Record<string, any> = {}
  
  for (const [key, value] of Object.entries(changes)) {
    if (value && typeof value === 'object') {
      // Si le champ a une structure { old, new }, prendre 'new'
      if ('old' in value && 'new' in value) {
        selected[key] = value.new
      }
      // Si c'est un objet sans { old, new }, le garder tel quel (ex: races, organizer)
      else {
        selected[key] = value
      }
    } else {
      // Valeur primitive, garder telle quelle
      selected[key] = value
    }
  }
  
  return selected
}
