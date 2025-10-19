import { DatabaseService } from '@data-agents/database'

const db = new DatabaseService()

async function addGroupedProposals() {
  console.log('🔗 Ajout de propositions groupées pour le Marathon de Paris...')

  try {
    // Récupérer les IDs existants
    const agents = await db.getAgents()
    const ffaAgent = agents.find(a => a.name === 'FFA Scraper')
    const comparatorAgent = agents.find(a => a.name === 'Data Comparator')
    const validatorAgent = agents.find(a => a.name === 'Race Validator')

    if (!ffaAgent || !comparatorAgent || !validatorAgent) {
      throw new Error('Agents requis non trouvés dans la base de données')
    }

    // Récupérer les données du Marathon de Paris
    const marathonParis = await db.prisma.eventCache.findUnique({
      where: { id: 'event_marathon_paris_2024' },
      include: {
        editions: {
          include: {
            races: true
          }
        }
      }
    })

    if (!marathonParis || marathonParis.editions.length === 0) {
      throw new Error('Marathon de Paris non trouvé dans la base de données')
    }

    const edition = marathonParis.editions[0]
    const race = edition.races[0]

    console.log(`✅ Données trouvées: ${marathonParis.name}, édition ${edition.year}, course ${race.name}`)

    // Créer les propositions groupées
    const groupedProposal1 = await db.createProposal({
      agentId: ffaAgent.id,
      type: 'EDITION_UPDATE',
      eventId: marathonParis.id,
      editionId: edition.id,
      changes: {
        registrationClosingDate: {
          old: '2024-03-15T23:59:59Z',
          new: '2024-03-10T23:59:59Z',
          confidence: 0.85
        },
        registrantsNumber: {
          old: 50000,
          new: 52000,
          confidence: 0.9
        }
      },
      justification: [{
        type: 'url',
        content: 'https://www.schneiderelectricparismarathon.com/inscriptions-2024',
        metadata: { title: 'Mise à jour inscriptions Marathon Paris', source: 'site officiel' }
      }],
      confidence: 0.87
    })

    const groupedProposal2 = await db.createProposal({
      agentId: comparatorAgent.id,
      type: 'RACE_UPDATE',
      eventId: marathonParis.id,
      raceId: race.id,
      changes: {
        price: {
          old: 95.0,
          new: 98.0,
          confidence: 0.95
        },
        runPositiveElevation: {
          old: 156,
          new: 162,
          confidence: 0.8
        }
      },
      justification: [{
        type: 'html',
        content: '<div>Données IGN mises à jour pour le parcours 2024</div>',
        metadata: { source: 'IGN', accuracy: 'GPS surveyed' }
      }],
      confidence: 0.88
    })

    const groupedProposal3 = await db.createProposal({
      agentId: validatorAgent.id,
      type: 'EVENT_UPDATE',
      eventId: marathonParis.id,
      changes: {
        websiteUrl: {
          old: 'https://www.schneiderelectricparismarathon.com',
          new: 'https://www.parismarathon.com',
          confidence: 0.75
        },
        fullAddress: {
          old: 'Champs-Élysées, 75008 Paris',
          new: 'Avenue des Champs-Élysées, 75008 Paris, France',
          confidence: 0.9
        }
      },
      justification: [{
        type: 'text',
        content: 'Validation automatique des données événement - redirect détecté vers nouveau domaine',
        metadata: { checkType: 'url_redirect', timestamp: new Date().toISOString() }
      }],
      confidence: 0.82
    })

    const groupedProposal4 = await db.createProposal({
      agentId: ffaAgent.id,
      type: 'RACE_UPDATE',
      eventId: marathonParis.id,
      raceId: race.id,
      changes: {
        registrationOpeningDate: {
          old: '2023-09-01T00:00:00Z',
          new: '2023-08-15T00:00:00Z',
          confidence: 0.85
        },
        categoryLevel2: {
          old: 'Road',
          new: 'Urban',
          confidence: 0.7
        }
      },
      justification: [{
        type: 'url',
        content: 'https://bases.athle.fr/calendrier/2024/marathon-paris',
        metadata: { title: 'Calendrier FFA - Marathon de Paris 2024' }
      }],
      confidence: 0.78
    })

    console.log('✅ 4 propositions groupées créées avec succès!')
    console.log('')
    console.log('🔗 Propositions créées pour Marathon de Paris:')
    console.log(`  1. Édition: fermeture inscriptions + capacité (${groupedProposal1.id})`)
    console.log(`  2. Course: prix + dénivelé (${groupedProposal2.id})`)
    console.log(`  3. Événement: URL + adresse (${groupedProposal3.id})`)
    console.log(`  4. Course: dates inscriptions + catégorie (${groupedProposal4.id})`)
    console.log('')
    console.log('💡 Ces propositions peuvent maintenant être approuvées/rejetées en lot dans le dashboard')

  } catch (error) {
    console.error('❌ Erreur lors de l\'ajout des propositions groupées:', error)
    throw error
  }
}

// Exécuter le script
if (require.main === module) {
  addGroupedProposals()
    .then(() => {
      console.log('✅ Script terminé avec succès')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Script échoué:', error)
      process.exit(1)
    })
}

export { addGroupedProposals }