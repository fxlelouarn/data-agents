/**
 * Fonction helper pour déterminer si un agent a un schema disponible
 * 
 * Les vrais agents en prod (FFA Scraper, Google Search Date) n'ont probablement
 * pas de configSchema en base car ils ont été créés avant l'implémentation du système
 * de schémas dynamiques. Cette fonction détecte les agents "connus" et indique
 * que leur schéma devrait être disponible.
 * 
 * Les schémas réels sont importés dynamiquement dans AgentDetail/AgentEdit
 * pour éviter les dépendances circulaires.
 * 
 * @param agentName - Nom de l'agent
 * @returns true si le schema est connu et devrait être disponible
 */
export const hasKnownAgentSchema = (agentName?: string): boolean => {
  if (!agentName) return false

  const lowerName = agentName.toLowerCase()

  // FFA Scraper Agent
  if (lowerName.includes('ffa') || lowerName.includes('scraper')) {
    return true
  }

  // Google Search Date Agent
  if ((lowerName.includes('google') && lowerName.includes('search')) || lowerName.includes('date')) {
    return true
  }

  return false
}

/**
 * Détecte le type d'agent à partir de son nom
 * Utilisé pour sélectionner le bon schéma
 */
export const detectAgentType = (agentName?: string): 'ffa' | 'google' | null => {
  if (!agentName) return null

  const lowerName = agentName.toLowerCase()

  if (lowerName.includes('ffa') || lowerName.includes('scraper')) {
    return 'ffa'
  }

  if (lowerName.includes('google') || lowerName.includes('search')) {
    return 'google'
  }

  return null
}
