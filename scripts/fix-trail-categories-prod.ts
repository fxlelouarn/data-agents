/**
 * Script de correction des categoryLevel2 des trails dans la base de production
 * 
 * Nouveaux seuils (2025-11-17):
 * - Trail découverte : ≤ 21 km
 * - Trail court : 21-41 km
 * - Trail long : 42-80 km
 * - Ultra trail : > 80 km
 * 
 * Anciens seuils (incorrects):
 * - Trail découverte : < 13 km
 * - Trail court : 13-24 km
 * - Trail long : 25-49 km
 * - Ultra trail : ≥ 50 km
 */

import { PrismaClient } from '@prisma/client'

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://data_agents_user:epbhY7JjPVJERAY7tkHzBWx3THEFFy0M@dpg-d4c5448dl3ps73b959s0-a.frankfurt-postgres.render.com/data_agents_8bni'

const prisma = new PrismaClient({
  datasources: {
    db: { url: DATABASE_URL }
  }
})

interface TrailChange {
  proposalId: string
  currentCategory: string | null
  newCategory: string
  distance: number
  raceName?: string
}

/**
 * Détermine le bon categoryLevel2 selon les nouveaux seuils
 */
function getCorrectTrailCategory(distance: number): string {
  if (distance <= 21) return 'DISCOVERY_TRAIL'
  if (distance <= 41) return 'SHORT_TRAIL'
  if (distance <= 80) return 'LONG_TRAIL'
  return 'ULTRA_TRAIL'
}

/**
 * Extrait la distance d'une course depuis les changes
 */
function extractDistance(changes: any): number | null {
  if (!changes) return null
  
  // Structure imbriquée (edition.new.races)
  if (changes.edition?.new?.races) {
    const races = changes.edition.new.races
    if (Array.isArray(races) && races.length > 0) {
      const distance = races[0].runDistance
      return distance ? parseFloat(distance) : null
    }
  }
  
  // Structure plate (runDistance direct)
  if (changes.runDistance) {
    const value = typeof changes.runDistance === 'object' 
      ? changes.runDistance.new || changes.runDistance.proposed
      : changes.runDistance
    return value ? parseFloat(value) : null
  }
  
  return null
}

/**
 * Extrait le nom de la course
 */
function extractRaceName(changes: any): string | undefined {
  if (!changes) return undefined
  
  if (changes.edition?.new?.races?.[0]?.name) {
    return changes.edition.new.races[0].name
  }
  
  if (changes.raceName) {
    const value = typeof changes.raceName === 'object'
      ? changes.raceName.new || changes.raceName.proposed
      : changes.raceName
    return value
  }
  
  return undefined
}

/**
 * Met à jour le categoryLevel2 dans les changes
 */
function updateCategoryLevel2InChanges(changes: any, newCategory: string): any {
  const updatedChanges = JSON.parse(JSON.stringify(changes))
  
  // Structure imbriquée
  if (updatedChanges.edition?.new?.races?.[0]) {
    updatedChanges.edition.new.races[0].categoryLevel2 = newCategory
  }
  
  // Structure plate
  if (updatedChanges.categoryLevel2 !== undefined) {
    if (typeof updatedChanges.categoryLevel2 === 'object') {
      updatedChanges.categoryLevel2.new = newCategory
    } else {
      updatedChanges.categoryLevel2 = { new: newCategory }
    }
  }
  
  return updatedChanges
}

async function main() {
  console.log('🔍 Recherche des propositions Trail à corriger...\n')
  
  // Récupérer toutes les propositions avec categoryLevel1 = TRAIL
  const proposals = await prisma.proposal.findMany({
    where: {
      OR: [
        { status: 'PENDING' },
        { status: 'APPROVED' }
      ]
    },
    select: {
      id: true,
      changes: true,
      status: true,
      eventName: true,
      createdAt: true
    }
  })
  
  console.log(`📊 ${proposals.length} propositions actives trouvées\n`)
  
  const corrections: TrailChange[] = []
  let trailCount = 0
  
  for (const proposal of proposals) {
    const changes = proposal.changes as any
    
    // Vérifier si c'est un trail
    let isTrail = false
    let currentCategory: string | null = null
    
    // Structure imbriquée
    if (changes?.edition?.new?.races?.[0]?.categoryLevel1 === 'TRAIL') {
      isTrail = true
      currentCategory = changes.edition.new.races[0].categoryLevel2 || null
    }
    
    // Structure plate
    if (changes?.categoryLevel1) {
      const cat1 = typeof changes.categoryLevel1 === 'object'
        ? changes.categoryLevel1.new || changes.categoryLevel1.proposed
        : changes.categoryLevel1
      
      if (cat1 === 'TRAIL') {
        isTrail = true
        
        if (changes.categoryLevel2) {
          currentCategory = typeof changes.categoryLevel2 === 'object'
            ? changes.categoryLevel2.new || changes.categoryLevel2.proposed
            : changes.categoryLevel2
        }
      }
    }
    
    if (!isTrail) continue
    
    trailCount++
    
    // Extraire la distance
    const distance = extractDistance(changes)
    
    if (!distance) {
      console.log(`⚠️  Trail sans distance: ${proposal.id} - ${proposal.eventName}`)
      continue
    }
    
    // Calculer la bonne catégorie
    const correctCategory = getCorrectTrailCategory(distance)
    
    // Vérifier si correction nécessaire
    if (currentCategory !== correctCategory) {
      const raceName = extractRaceName(changes)
      
      corrections.push({
        proposalId: proposal.id,
        currentCategory,
        newCategory: correctCategory,
        distance,
        raceName
      })
    }
  }
  
  console.log(`\n🏔️  ${trailCount} propositions Trail trouvées`)
  console.log(`🔧 ${corrections.length} corrections nécessaires\n`)
  
  if (corrections.length === 0) {
    console.log('✅ Aucune correction nécessaire !')
    return
  }
  
  // Afficher le résumé des corrections
  console.log('📋 Corrections à effectuer:\n')
  
  const byCategory: Record<string, number> = {
    'DISCOVERY_TRAIL': 0,
    'SHORT_TRAIL': 0,
    'LONG_TRAIL': 0,
    'ULTRA_TRAIL': 0
  }
  
  for (const change of corrections) {
    byCategory[change.newCategory]++
    console.log(`  ${change.proposalId.substring(0, 8)}... | ${change.distance.toFixed(1)}km | ${change.currentCategory || 'null'} → ${change.newCategory}`)
    if (change.raceName) {
      console.log(`    "${change.raceName}"`)
    }
  }
  
  console.log('\n📊 Répartition après correction:')
  console.log(`  - DISCOVERY_TRAIL (≤21km): ${byCategory['DISCOVERY_TRAIL']}`)
  console.log(`  - SHORT_TRAIL (21-41km): ${byCategory['SHORT_TRAIL']}`)
  console.log(`  - LONG_TRAIL (42-80km): ${byCategory['LONG_TRAIL']}`)
  console.log(`  - ULTRA_TRAIL (>80km): ${byCategory['ULTRA_TRAIL']}`)
  
  // Confirmation
  console.log('\n⚠️  Voulez-vous appliquer ces corrections ? (Ctrl+C pour annuler)')
  console.log('Appuyez sur Entrée pour continuer...')
  
  // Attendre confirmation (en production, vous pouvez ajouter un prompt)
  if (process.env.SKIP_CONFIRMATION !== 'true') {
    await new Promise(resolve => {
      process.stdin.once('data', resolve)
    })
  }
  
  console.log('\n🔄 Application des corrections...\n')
  
  let successCount = 0
  let errorCount = 0
  
  for (const change of corrections) {
    try {
      // Récupérer la proposition complète
      const proposal = await prisma.proposal.findUnique({
        where: { id: change.proposalId },
        select: { changes: true }
      })
      
      if (!proposal) {
        console.log(`❌ Proposition ${change.proposalId} introuvable`)
        errorCount++
        continue
      }
      
      // Mettre à jour le categoryLevel2
      const updatedChanges = updateCategoryLevel2InChanges(
        proposal.changes,
        change.newCategory
      )
      
      // Sauvegarder
      await prisma.proposal.update({
        where: { id: change.proposalId },
        data: { changes: updatedChanges }
      })
      
      console.log(`✅ ${change.proposalId.substring(0, 8)}... | ${change.distance.toFixed(1)}km → ${change.newCategory}`)
      successCount++
      
    } catch (error) {
      console.error(`❌ Erreur pour ${change.proposalId}:`, error)
      errorCount++
    }
  }
  
  console.log('\n' + '='.repeat(60))
  console.log(`✅ ${successCount} corrections appliquées`)
  console.log(`❌ ${errorCount} erreurs`)
  console.log('='.repeat(60))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
