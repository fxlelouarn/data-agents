import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function seedConsensusExample() {
  try {
    console.log('🌱 Seeding consensus example data...')

    // Créer deux agents s'ils n'existent pas
    const agent1 = await prisma.agent.upsert({
      where: { name: 'DataScraper' },
      update: {},
      create: {
        name: 'DataScraper',
        description: 'Agent spécialisé dans l\'extraction de données web',
        type: 'EXTRACTOR',
        isActive: true,
        frequency: '0 */6 * * *', // Toutes les 6 heures
        config: {
          targets: ['website', 'social'],
          priority: 'high'
        }
      }
    })

    const agent2 = await prisma.agent.upsert({
      where: { name: 'WebCrawler' },
      update: {},
      create: {
        name: 'WebCrawler',
        description: 'Agent de crawling de sites web d\'événements',
        type: 'EXTRACTOR',
        isActive: true,
        frequency: '0 */4 * * *', // Toutes les 4 heures
        config: {
          crawlDepth: 3,
          respectRobots: true
        }
      }
    })

    const agent3 = await prisma.agent.upsert({
      where: { name: 'EmailParser' },
      update: {},
      create: {
        name: 'EmailParser',
        description: 'Agent d\'analyse des emails d\'inscription',
        type: 'EXTRACTOR',
        isActive: true,
        frequency: '0 */2 * * *', // Toutes les 2 heures
        config: {
          emailSources: ['gmail', 'outlook'],
          parseAttachments: true
        }
      }
    })

    console.log('✅ Agents créés')

    // Créer un événement dans le cache pour référence
    const eventCache = await prisma.eventCache.upsert({
      where: { id: 'event_marathon_paris_2024' },
      update: {},
      create: {
        id: 'event_marathon_paris_2024',
        name: 'Marathon de Paris',
        city: 'Paris',
        country: 'France',
        countrySubdivisionNameLevel1: 'Île-de-France',
        countrySubdivisionNameLevel2: 'Paris',
        fullAddress: 'Avenue des Champs-Élysées, Paris',
        websiteUrl: 'https://www.marathon-de-paris.com',
        instagramUrl: 'https://instagram.com/marathondeparis',
        facebookUrl: 'https://facebook.com/marathondeparis'
      }
    })

    // Créer une édition dans le cache
    const editionCache = await prisma.editionCache.upsert({
      where: { id: 'edition_marathon_paris_2024' },
      update: {},
      create: {
        id: 'edition_marathon_paris_2024',
        eventId: 'event_marathon_paris_2024',
        year: '2024',
        calendarStatus: 'TO_BE_CONFIRMED',
        registrationOpeningDate: new Date('2024-03-01T10:00:00Z'), // Valeur actuelle
        registrationClosingDate: new Date('2024-04-01T23:59:59Z'),
        timeZone: 'Europe/Paris',
        registrantsNumber: 0
      }
    })

    console.log('✅ Cache événement/édition créé')

    // Créer les propositions avec consensus
    // Agent 1 et Agent 2 proposent la même date (consensus)
    const proposal1 = await prisma.proposal.create({
      data: {
        agentId: agent1.id,
        type: 'EDITION_UPDATE',
        status: 'PENDING',
        eventId: 'event_marathon_paris_2024',
        editionId: 'edition_marathon_paris_2024',
        changes: {
          registrationOpeningDate: {
            field: 'registrationOpeningDate',
            current: '2024-03-01T10:00:00Z',
            proposed: '2024-03-15T10:00:00Z' // CONSENSUS: même valeur que agent2
          },
          registrationClosingDate: {
            field: 'registrationClosingDate', 
            current: '2024-04-01T23:59:59Z',
            proposed: '2024-04-15T23:59:59Z'
          },
          registrantsNumber: {
            field: 'registrantsNumber',
            current: 0,
            proposed: 50000
          }
        },
        justification: {
          sources: [
            {
              type: 'webpage',
              url: 'https://www.marathon-de-paris.com/inscriptions',
              title: 'Page d\'inscription Marathon de Paris',
              extractedText: 'Les inscriptions ouvrent le 15 mars 2024 à 10h00.',
              screenshot: null,
              timestamp: new Date().toISOString()
            }
          ]
        },
        confidence: 0.95
      }
    })

    const proposal2 = await prisma.proposal.create({
      data: {
        agentId: agent2.id,
        type: 'EDITION_UPDATE', 
        status: 'PENDING',
        eventId: 'event_marathon_paris_2024',
        editionId: 'edition_marathon_paris_2024',
        changes: {
          registrationOpeningDate: {
            field: 'registrationOpeningDate',
            current: '2024-03-01T10:00:00Z',
            proposed: '2024-03-15T10:00:00Z' // CONSENSUS: même valeur que agent1
          },
          registrationClosingDate: {
            field: 'registrationClosingDate',
            current: '2024-04-01T23:59:59Z', 
            proposed: '2024-04-10T23:59:59Z' // Différent de agent1
          },
          timeZone: {
            field: 'timeZone',
            current: 'Europe/Paris',
            proposed: 'Europe/Paris' // Pas de changement mais inclus
          }
        },
        justification: {
          sources: [
            {
              type: 'social',
              url: 'https://www.facebook.com/marathondeparis/posts/12345',
              title: 'Post Facebook Marathon de Paris',
              extractedText: 'Ouverture des inscriptions confirmée pour le 15 mars à 10h !',
              screenshot: 'base64encodedimage...',
              timestamp: new Date().toISOString()
            }
          ]
        },
        confidence: 0.88
      }
    })

    // Agent 3 propose une valeur différente (pas de consensus)
    const proposal3 = await prisma.proposal.create({
      data: {
        agentId: agent3.id,
        type: 'EDITION_UPDATE',
        status: 'PENDING', 
        eventId: 'event_marathon_paris_2024',
        editionId: 'edition_marathon_paris_2024',
        changes: {
          registrationOpeningDate: {
            field: 'registrationOpeningDate',
            current: '2024-03-01T10:00:00Z',
            proposed: '2024-03-20T09:00:00Z' // DIFFÉRENT: pas de consensus
          },
          registrantsNumber: {
            field: 'registrantsNumber',
            current: 0,
            proposed: 45000 // Différent de agent1
          }
        },
        justification: {
          sources: [
            {
              type: 'email',
              title: 'Email de confirmation Marathon de Paris',
              extractedText: 'Suite à votre demande, les inscriptions débuteront le 20 mars à 9h00.',
              sender: 'inscriptions@marathon-de-paris.com',
              timestamp: new Date().toISOString()
            }
          ]
        },
        confidence: 0.72
      }
    })

    console.log('✅ Propositions avec consensus créées')

    console.log(`
🎯 EXEMPLE DE CONSENSUS CRÉÉ :

📊 Agents:
- ${agent1.name} (ID: ${agent1.id})
- ${agent2.name} (ID: ${agent2.id})  
- ${agent3.name} (ID: ${agent3.id})

🏃 Événement: Marathon de Paris 2024
📅 Édition: edition_marathon_paris_2024

🤝 CONSENSUS détecté sur registrationOpeningDate:
- ${agent1.name}: 15/03/2024 10:00 (confiance: 95%)
- ${agent2.name}: 15/03/2024 10:00 (confiance: 88%)
- ${agent3.name}: 20/03/2024 09:00 (confiance: 72%)

➡️  2 agents d'accord sur la même valeur !

🔗 Pour tester:
1. Allez sur /proposals
2. Cherchez le groupe "Marathon de Paris 2024" 
3. Cliquez sur l'icône 📋 "Vue consolidée"
4. Regardez le dropdown pour registrationOpeningDate
`)

    console.log('🎉 Seeding terminé avec succès')

  } catch (error) {
    console.error('❌ Erreur lors du seeding:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Exécuter si appelé directement
if (require.main === module) {
  seedConsensusExample()
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}

export default seedConsensusExample