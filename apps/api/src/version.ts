/**
 * Versions de l'application Data Agents
 * 
 * Cette configuration centralisée permet de tracker les versions de:
 * - L'application globale (API + Dashboard + Agents)
 * - Chaque agent individuellement
 */

// Version globale de l'application
export const APP_VERSION = '1.0.0'

// Importer les versions des agents depuis leurs fichiers sources
// Note: Ces imports peuvent échouer en développement si les agents ne sont pas buildés
export let FFA_SCRAPER_VERSION = 'unknown'
export let GOOGLE_SEARCH_DATE_VERSION = 'unknown'

// Chargement dynamique des versions des agents (avec fallback)
try {
  // Utiliser l'index des agents qui exporte tout proprement
  const agentsModule = require('../../agents/dist/index')
  if (agentsModule.AGENT_VERSIONS) {
    FFA_SCRAPER_VERSION = agentsModule.AGENT_VERSIONS.ffaScraper || 'unknown'
    GOOGLE_SEARCH_DATE_VERSION = agentsModule.AGENT_VERSIONS.googleSearchDate || 'unknown'
  } else {
    // Fallback vers les exports individuels
    FFA_SCRAPER_VERSION = agentsModule.FFA_SCRAPER_AGENT_VERSION || 'unknown'
    GOOGLE_SEARCH_DATE_VERSION = agentsModule.GOOGLE_SEARCH_DATE_AGENT_VERSION || 'unknown'
  }
} catch (e) {
  // Les agents ne sont pas buildés - c'est normal en développement si on lance juste l'API
  console.warn('⚠️  Agents versions non disponibles (agents non buildés)')
  console.warn('   Run: npm run build:agents')
}

/**
 * Retourne toutes les versions de l'application
 */
export function getVersions() {
  return {
    app: APP_VERSION,
    api: APP_VERSION, // L'API suit la version de l'app
    agents: {
      ffaScraper: FFA_SCRAPER_VERSION,
      googleSearchDate: GOOGLE_SEARCH_DATE_VERSION
    },
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    env: process.env.NODE_ENV || 'development'
  }
}
