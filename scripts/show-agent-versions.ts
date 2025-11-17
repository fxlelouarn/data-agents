#!/usr/bin/env tsx

/**
 * Script pour afficher les versions des agents depuis le code source
 * 
 * Usage:
 *   npm run show-versions
 *   # ou directement :
 *   tsx scripts/show-agent-versions.ts
 */

import { FFA_SCRAPER_AGENT_VERSION } from '../apps/agents/src/FFAScraperAgent'
import { GOOGLE_SEARCH_DATE_AGENT_VERSION } from '../apps/agents/src/GoogleSearchDateAgent'

console.log('\n📦 Versions des agents\n')
console.log('┌─────────────────────────────────┬─────────┐')
console.log('│ Agent                           │ Version │')
console.log('├─────────────────────────────────┼─────────┤')
console.log(`│ FFA Scraper Agent               │ ${FFA_SCRAPER_AGENT_VERSION.padEnd(7)} │`)
console.log(`│ Google Search Date Agent        │ ${GOOGLE_SEARCH_DATE_AGENT_VERSION.padEnd(7)} │`)
console.log('└─────────────────────────────────┴─────────┘')
console.log()
console.log('💡 Pour mettre à jour une version, éditez la constante *_VERSION dans le fichier de l\'agent.')
console.log('📖 Documentation : docs/AGENT-VERSIONING.md\n')
