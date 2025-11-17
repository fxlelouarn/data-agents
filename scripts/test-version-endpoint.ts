#!/usr/bin/env tsx

/**
 * Script de test pour l'endpoint /api/version
 * 
 * Usage:
 *   npm run test:version
 */

import { getVersions } from '../apps/api/src/version'

console.log('\n📦 Test de l\'endpoint /api/version\n')
console.log('─────────────────────────────────────────')

try {
  const versions = getVersions()
  
  console.log('\n✅ Versions récupérées avec succès:\n')
  console.log(JSON.stringify(versions, null, 2))
  
  console.log('\n─────────────────────────────────────────')
  console.log('\n💡 Pour tester via HTTP:')
  console.log('   curl http://localhost:4001/api/version')
  console.log('\n📖 Documentation : docs/AGENT-VERSIONING.md\n')
} catch (error) {
  console.error('\n❌ Erreur:', error)
  console.log('\n💡 Assurez-vous que les agents sont buildés:')
  console.log('   npm run build:agents\n')
  process.exit(1)
}
