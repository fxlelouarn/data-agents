#!/usr/bin/env tsx

/**
 * Script de migration pour réparer les appliedChanges null
 * 
 * Problème: Quand une ProposalApplication échoue, appliedChanges était réinitialisé à null.
 * Solution: Reconstruire appliedChanges depuis la proposition originale.
 * 
 * Usage: npm run fix-null-applied-changes
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🔍 Recherche des applications avec appliedChanges null...')
  
  // Trouver toutes les applications avec appliedChanges null
  // Prisma ne supporte pas WHERE appliedChanges IS NULL directement sur JSON
  // On récupère tout et on filtre en mémoire
  const allApplications = await prisma.proposalApplication.findMany({
    include: {
      proposal: true
    }
  })
  
  // Filtrer celles avec appliedChanges null ou vide
  const applications = allApplications.filter(app => 
    !app.appliedChanges || 
    (typeof app.appliedChanges === 'object' && Object.keys(app.appliedChanges as any).length === 0)
  )
  
  console.log(`📦 Trouvé ${applications.length} application(s) à réparer`)
  
  if (applications.length === 0) {
    console.log('✅ Aucune réparation nécessaire')
    return
  }
  
  let repaired = 0
  let errors = 0
  
  for (const app of applications) {
    try {
      console.log(`\n🔧 Réparation de ${app.id} (${app.blockType || 'legacy'})...`)
      
      const proposal = app.proposal
      const changes = proposal.changes as Record<string, any>
      const userMods = (proposal.userModifiedChanges as Record<string, any>) || {}
      
      // Construire le payload selon le blockType
      let appliedChanges: any = {}
      
      if (app.blockType === 'races') {
        // Extraire seulement les champs de courses
        appliedChanges = {
          racesToUpdate: changes.racesToUpdate,
          racesToAdd: changes.racesToAdd,
          racesToDelete: changes.racesToDelete || [],
          races: changes.races
        }
        
        // Ajouter les modifications utilisateur
        if (userMods.raceEdits) {
          appliedChanges.raceEdits = userMods.raceEdits
        }
      } else if (app.blockType === 'edition') {
        // Extraire les champs d'édition
        const editionFields = ['year', 'startDate', 'endDate', 'calendarStatus', 'timeZone',
          'registrationOpeningDate', 'registrationClosingDate', 'websiteUrl', 'registrationUrl']
        
        editionFields.forEach(field => {
          if (changes[field] !== undefined || userMods[field] !== undefined) {
            appliedChanges[field] = userMods[field] !== undefined ? userMods[field] : changes[field]
          }
        })
      } else if (app.blockType === 'event') {
        // Extraire les champs d'événement
        const eventFields = ['name', 'city', 'country', 'countrySubdivisionNameLevel1',
          'countrySubdivisionNameLevel2', 'latitude', 'longitude', 'websiteUrl', 
          'facebookUrl', 'instagramUrl', 'twitterUrl']
        
        eventFields.forEach(field => {
          if (changes[field] !== undefined || userMods[field] !== undefined) {
            appliedChanges[field] = userMods[field] !== undefined ? userMods[field] : changes[field]
          }
        })
      } else if (app.blockType === 'organizer') {
        // Extraire l'organisateur
        appliedChanges.organizer = userMods.organizer || changes.organizer
      } else {
        // Legacy: prendre tous les changes
        appliedChanges = { ...changes, ...userMods }
      }
      
      // Mettre à jour l'application
      await prisma.proposalApplication.update({
        where: { id: app.id },
        data: {
          appliedChanges: appliedChanges
        }
      })
      
      console.log(`✅ Réparé avec ${Object.keys(appliedChanges).length} champs`)
      repaired++
      
    } catch (error) {
      console.error(`❌ Erreur pour ${app.id}:`, error)
      errors++
    }
  }
  
  console.log(`\n📊 Résumé:`)
  console.log(`  ✅ Réparé: ${repaired}`)
  console.log(`  ❌ Erreurs: ${errors}`)
  console.log(`  📦 Total: ${applications.length}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
