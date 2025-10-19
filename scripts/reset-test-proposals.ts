import { DatabaseService } from '@data-agents/database'

const db = new DatabaseService()

async function resetTestProposals() {
  console.log('🧹 Nettoyage et recréation des propositions de test...')

  try {
    // 1. Supprimer toutes les propositions existantes
    console.log('🗑️  Suppression des anciennes propositions...')
    await db.prisma.proposal.deleteMany({})
    console.log('✅ Toutes les propositions supprimées')

    // 2. Récupérer les agents existants
    const agents = await db.prisma.agent.findMany()
    if (agents.length === 0) {
      throw new Error('Aucun agent trouvé. Veuillez d\'abord exécuter le script de seed.')
    }

    // 3. Récupérer les événements existants
    const events = await db.prisma.eventCache.findMany({
      include: {
        editions: {
          include: {
            races: true
          }
        }
      }
    })

    console.log(`📋 Trouvé ${agents.length} agents et ${events.length} événements`)

    // 4. Créer 5 nouvelles propositions
    console.log('🆕 Création de 5 nouvelles propositions...')

    // Proposition 1: Une seule sous-proposition (simple)
    await db.createProposal({
      agentId: agents[0].id,
      type: 'RACE_UPDATE',
      eventId: events[0]?.id,
      editionId: events[0]?.editions[0]?.id,
      raceId: events[0]?.editions[0]?.races[0]?.id,
      changes: {
        price: {
          current: 45.0,
          proposed: 50.0,
          confidence: 0.95
        }
      },
      justification: [{
        type: 'url',
        content: 'https://example.com/price-update-2024',
        metadata: { title: 'Mise à jour tarifs 2024', source: 'site officiel' }
      }],
      confidence: 0.95
    })

    // Proposition 2: Deux sous-propositions
    await db.createProposal({
      agentId: agents[1].id,
      type: 'EDITION_UPDATE', 
      eventId: events[0]?.id,
      editionId: events[0]?.editions[0]?.id,
      changes: {
        registrationClosingDate: {
          current: '2024-03-15T23:59:59Z',
          proposed: '2024-03-20T23:59:59Z',
          confidence: 0.9
        },
        registrantsNumber: {
          current: 5000,
          proposed: 5500,
          confidence: 0.85
        }
      },
      justification: [{
        type: 'html',
        content: '<p>Données mises à jour suite à l\'ouverture d\'inscriptions tardives</p>',
        metadata: { source: 'API organisateur', accuracy: 'high' }
      }],
      confidence: 0.87
    })

    // Proposition 3: Trois sous-propositions
    await db.createProposal({
      agentId: agents[2].id,
      type: 'EVENT_UPDATE',
      eventId: events[0]?.id,
      changes: {
        websiteUrl: {
          current: 'https://old-site.com',
          proposed: 'https://new-official-site.com',
          confidence: 0.9
        },
        instagramUrl: {
          current: null,
          proposed: 'https://instagram.com/event_official',
          confidence: 0.8
        },
        facebookUrl: {
          current: 'https://facebook.com/old-page',
          proposed: 'https://facebook.com/official-event-page',
          confidence: 0.85
        }
      },
      justification: [{
        type: 'text',
        content: 'Mise à jour des liens officiels suite au rebranding de l\'événement',
        metadata: { checkType: 'social_media_scan', timestamp: new Date().toISOString() }
      }],
      confidence: 0.85
    })

    // Proposition 4: Quatre sous-propositions (course complète)
    await db.createProposal({
      agentId: agents[0].id,
      type: 'RACE_UPDATE',
      eventId: events[1]?.id,
      editionId: events[1]?.editions[0]?.id,
      raceId: events[1]?.editions[0]?.races[0]?.id,
      changes: {
        runDistance: {
          current: 21.097,
          proposed: 21.1,
          confidence: 0.95
        },
        runPositiveElevation: {
          current: 250,
          proposed: 275,
          confidence: 0.9
        },
        price: {
          current: 35.0,
          proposed: 40.0,
          confidence: 0.85
        },
        registrationOpeningDate: {
          current: '2024-01-01T00:00:00Z',
          proposed: '2023-12-15T00:00:00Z',
          confidence: 0.8
        }
      },
      justification: [{
        type: 'url',
        content: 'https://ign.fr/parcours-officiel-2024',
        metadata: { title: 'Parcours officiel IGN 2024', source: 'IGN' }
      }, {
        type: 'text',
        content: 'Relevé GPS précis du nouveau parcours avec correction du dénivelé',
        metadata: { device: 'GPS Garmin', accuracy: '±2m' }
      }],
      confidence: 0.87
    })

    // Proposition 5: Nouvelle course (format races array)
    await db.createProposal({
      agentId: agents[2].id,
      type: 'NEW_EVENT',
      changes: {
        name: 'Trail des Gorges du Verdon',
        city: 'Castellane',
        country: 'France',
        countrySubdivisionNameLevel1: 'Provence-Alpes-Côte d\'Azur',
        countrySubdivisionNameLevel2: '04',
        fullAddress: 'Place Marcel Sauvaire, 04120 Castellane',
        websiteUrl: 'https://trail-verdon.fr',
        instagramUrl: 'https://instagram.com/trailverdon',
        races: [{
          name: 'Trail Ultra 50km',
          runDistance: 50,
          runPositiveElevation: 2800,
          runNegativeElevation: 2800,
          distanceCategory: 'XXL',
          price: 75.0,
          priceType: 'PER_PERSON',
          startDate: new Date('2024-09-15T07:00:00Z'),
          registrationOpeningDate: new Date('2024-02-01T00:00:00Z'),
          registrationClosingDate: new Date('2024-09-01T23:59:59Z'),
          categoryLevel1: 'Trail',
          categoryLevel2: 'Nature'
        }, {
          name: 'Trail Découverte 15km', 
          runDistance: 15,
          runPositiveElevation: 800,
          runNegativeElevation: 800,
          distanceCategory: 'M',
          price: 35.0,
          priceType: 'PER_PERSON',
          startDate: new Date('2024-09-15T09:00:00Z'),
          registrationOpeningDate: new Date('2024-02-01T00:00:00Z'),
          registrationClosingDate: new Date('2024-09-01T23:59:59Z'),
          categoryLevel1: 'Trail',
          categoryLevel2: 'Nature'
        }, {
          name: 'Randonnée Famille 8km',
          runDistance: 8,
          runPositiveElevation: 300,
          runNegativeElevation: 300, 
          distanceCategory: 'S',
          price: 20.0,
          priceType: 'PER_PERSON',
          startDate: new Date('2024-09-15T10:30:00Z'),
          registrationOpeningDate: new Date('2024-03-01T00:00:00Z'),
          registrationClosingDate: new Date('2024-09-01T23:59:59Z'),
          categoryLevel1: 'Randonnée',
          categoryLevel2: 'Famille'
        }, {
          name: 'Course Enfants 2km',
          runDistance: 2,
          runPositiveElevation: 50,
          runNegativeElevation: 50,
          distanceCategory: 'XS',
          price: 10.0,
          priceType: 'PER_PERSON', 
          startDate: new Date('2024-09-15T16:00:00Z'),
          registrationOpeningDate: new Date('2024-03-01T00:00:00Z'),
          registrationClosingDate: new Date('2024-09-01T23:59:59Z'),
          categoryLevel1: 'Course',
          categoryLevel2: 'Jeunesse'
        }]
      },
      justification: [{
        type: 'url',
        content: 'https://trail-verdon.fr/edition-2024',
        metadata: { title: 'Site officiel Trail des Gorges du Verdon 2024' }
      }],
      confidence: 0.82
    })

    console.log('✅ 5 nouvelles propositions créées avec succès')
    
    // 5. Statistiques finales
    const newProposals = await db.prisma.proposal.findMany({
      include: {
        agent: {
          select: { name: true, type: true }
        }
      }
    })

    console.log('\n📊 Résumé des propositions créées:')
    newProposals.forEach((prop, index) => {
      const changeCount = Object.keys(prop.changes).length
      const racesCount = prop.changes.races ? prop.changes.races.length : 0
      const subProposalCount = racesCount > 0 ? racesCount : changeCount
      
      console.log(`${index + 1}. ${prop.type} par ${prop.agent.name} - ${subProposalCount} sous-proposition${subProposalCount > 1 ? 's' : ''}`)
    })

    console.log('\n🎉 Nettoyage et recréation terminés avec succès!')

  } catch (error) {
    console.error('❌ Erreur lors du reset:', error)
  } finally {
    process.exit(0)
  }
}

resetTestProposals()