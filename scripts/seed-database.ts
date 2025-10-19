import { DatabaseService } from '@data-agents/database'

const db = new DatabaseService()

async function seedDatabase() {
  console.log('🌱 Début du peuplement de la base de données...')

  try {
    // 1. Créer des agents de test
    console.log('📊 Création des agents...')
    
    const ffaAgent = await db.createAgent({
      name: 'FFA Scraper',
      description: 'Agent de scraping pour la Fédération Française d\'Athlétisme',
      type: 'EXTRACTOR',
      frequency: '0 6 * * *', // Tous les jours à 6h
      config: {
        baseUrl: 'https://bases.athle.fr/calendrier/',
        maxEvents: 50,
        regions: ['ile-de-france', 'provence-alpes-cote-azur']
      }
    })

    const comparatorAgent = await db.createAgent({
      name: 'Data Comparator',
      description: 'Agent de comparaison des données événementielles',
      type: 'COMPARATOR', 
      frequency: '0 */4 * * *', // Toutes les 4h
      config: {
        confidenceThreshold: 0.7,
        autoApproveThreshold: 0.9
      }
    })

    const validatorAgent = await db.createAgent({
      name: 'Race Validator',
      description: 'Agent de validation des courses',
      type: 'VALIDATOR',
      frequency: '0 2 * * 0', // Dimanche à 2h
      config: {
        checkDistances: true,
        checkPricing: true,
        checkDates: true
      }
    })

    console.log(`✅ ${[ffaAgent, comparatorAgent, validatorAgent].length} agents créés`)

    // 2. Créer des événements de test
    console.log('🏃 Création des événements...')
    
    const marathonParis = await db.prisma.eventCache.create({
      data: {
        id: 'event_marathon_paris_2024',
        name: 'Marathon de Paris',
        city: 'Paris',
        country: 'France',
        countrySubdivisionNameLevel1: 'Île-de-France',
        countrySubdivisionNameLevel2: '75',
        longitude: 2.3522,
        latitude: 48.8566,
        fullAddress: 'Champs-Élysées, 75008 Paris',
        websiteUrl: 'https://www.schneiderelectricparismarathon.com',
        facebookUrl: 'https://facebook.com/parismarathon',
        instagramUrl: 'https://instagram.com/parismarathon',
        status: 'LIVE',
        dataSource: 'FEDERATION',
        isPrivate: false,
        isFeatured: true,
        isRecommended: true
      }
    })

    const semimarathanBoulogne = await db.prisma.eventCache.create({
      data: {
        id: 'event_semi_marathon_boulogne_2024',
        name: 'Semi-marathon de Boulogne-Billancourt',
        city: 'Boulogne-Billancourt',
        country: 'France',
        countrySubdivisionNameLevel1: 'Île-de-France',
        countrySubdivisionNameLevel2: '92',
        longitude: 2.2395,
        latitude: 48.8412,
        fullAddress: 'Parc de Billancourt, 92100 Boulogne-Billancourt',
        websiteUrl: 'https://www.semi-boulogne.fr',
        status: 'LIVE',
        dataSource: 'ORGANIZER',
        isPrivate: false,
        isFeatured: false,
        isRecommended: true
      }
    })

    const km10Nice = await db.prisma.eventCache.create({
      data: {
        id: 'event_10km_nice_2024',
        name: '10km de Nice',
        city: 'Nice',
        country: 'France',
        countrySubdivisionNameLevel1: 'Provence-Alpes-Côte d\'Azur',
        countrySubdivisionNameLevel2: '06',
        longitude: 7.2619,
        latitude: 43.7031,
        fullAddress: 'Promenade des Anglais, 06000 Nice',
        websiteUrl: 'https://www.10kmnice.fr',
        status: 'LIVE',
        dataSource: 'FEDERATION',
        isPrivate: false,
        isFeatured: false,
        isRecommended: false
      }
    })

    console.log(`✅ ${[marathonParis, semimarathanBoulogne, km10Nice].length} événements créés`)

    // 3. Créer des éditions
    console.log('📅 Création des éditions...')
    
    const editionMarathonParis2024 = await db.prisma.editionCache.create({
      data: {
        id: 'edition_marathon_paris_2024',
        eventId: marathonParis.id,
        year: '2024',
        startDate: new Date('2024-04-07T07:00:00Z'),
        endDate: new Date('2024-04-07T15:00:00Z'),
        status: 'LIVE',
        calendarStatus: 'CONFIRMED',
        clientStatus: 'INTERNAL_SALES_FUNNEL',
        registrationOpeningDate: new Date('2023-09-01T00:00:00Z'),
        registrationClosingDate: new Date('2024-03-15T23:59:59Z'),
        registrantsNumber: 50000,
        timeZone: 'Europe/Paris',
        currency: 'EUR',
        federationId: 'FFA',
        dataSource: 'FEDERATION',
        customerType: 'PREMIUM',
        medusaVersion: 'V2'
      }
    })

    const editionSemi2024 = await db.prisma.editionCache.create({
      data: {
        id: 'edition_semi_boulogne_2024',
        eventId: semimarathanBoulogne.id,
        year: '2024',
        startDate: new Date('2024-05-12T09:00:00Z'),
        endDate: new Date('2024-05-12T13:00:00Z'),
        status: 'LIVE',
        calendarStatus: 'CONFIRMED',
        registrationOpeningDate: new Date('2024-01-15T00:00:00Z'),
        registrationClosingDate: new Date('2024-05-01T23:59:59Z'),
        registrantsNumber: 5000,
        timeZone: 'Europe/Paris',
        currency: 'EUR',
        dataSource: 'ORGANIZER',
        customerType: 'BASIC',
        medusaVersion: 'V1'
      }
    })

    const edition10kmNice2024 = await db.prisma.editionCache.create({
      data: {
        id: 'edition_10km_nice_2024',
        eventId: km10Nice.id,
        year: '2024',
        startDate: new Date('2024-06-15T08:00:00Z'),
        endDate: new Date('2024-06-15T11:00:00Z'),
        status: 'LIVE',
        calendarStatus: 'CONFIRMED',
        registrationOpeningDate: new Date('2024-03-01T00:00:00Z'),
        registrationClosingDate: new Date('2024-06-10T23:59:59Z'),
        registrantsNumber: 3000,
        timeZone: 'Europe/Paris',
        currency: 'EUR',
        federationId: 'FFA',
        dataSource: 'FEDERATION',
        customerType: 'ESSENTIAL'
      }
    })

    console.log(`✅ ${[editionMarathonParis2024, editionSemi2024, edition10kmNice2024].length} éditions créées`)

    // 4. Créer des courses
    console.log('🏁 Création des courses...')
    
    const raceMarathon = await db.prisma.raceCache.create({
      data: {
        id: 'race_marathon_paris_2024',
        editionId: editionMarathonParis2024.id,
        name: 'Marathon',
        startDate: new Date('2024-04-07T07:00:00Z'),
        runDistance: 42.195,
        runPositiveElevation: 156,
        runNegativeElevation: 156,
        distanceCategory: 'XXL',
        price: 95.0,
        priceType: 'PER_PERSON',
        paymentCollectionType: 'SINGLE',
        registrationOpeningDate: new Date('2023-09-01T00:00:00Z'),
        registrationClosingDate: new Date('2024-03-15T23:59:59Z'),
        maxTeamSize: 1,
        minTeamSize: 1,
        licenseNumberType: 'FFA',
        adultJustificativeOptions: 'MEDICAL_CERTIFICATE',
        minorJustificativeOptions: 'HEALTH_QUESTIONNAIRE',
        isActive: true,
        isArchived: false,
        resaleEnabled: true,
        medusaProductId: 'prod_marathon_2024',
        categoryLevel1: 'Running',
        categoryLevel2: 'Road',
        federationId: 'FFA',
        dataSource: 'FEDERATION'
      }
    })

    const raceSemi = await db.prisma.raceCache.create({
      data: {
        id: 'race_semi_boulogne_2024',
        editionId: editionSemi2024.id,
        name: 'Semi-marathon',
        startDate: new Date('2024-05-12T09:00:00Z'),
        runDistance: 21.1,
        runPositiveElevation: 85,
        runNegativeElevation: 85,
        distanceCategory: 'L',
        price: 45.0,
        priceType: 'PER_PERSON',
        paymentCollectionType: 'SINGLE',
        registrationOpeningDate: new Date('2024-01-15T00:00:00Z'),
        registrationClosingDate: new Date('2024-05-01T23:59:59Z'),
        maxTeamSize: 1,
        minTeamSize: 1,
        licenseNumberType: 'FFA',
        adultJustificativeOptions: 'MEDICAL_CERTIFICATE',
        isActive: true,
        isArchived: false,
        resaleEnabled: false,
        categoryLevel1: 'Running',
        categoryLevel2: 'Road',
        dataSource: 'ORGANIZER'
      }
    })

    const race10km = await db.prisma.raceCache.create({
      data: {
        id: 'race_10km_nice_2024',
        editionId: edition10kmNice2024.id,
        name: '10km',
        startDate: new Date('2024-06-15T08:00:00Z'),
        runDistance: 10.0,
        runPositiveElevation: 45,
        runNegativeElevation: 45,
        distanceCategory: 'S',
        price: 25.0,
        priceType: 'PER_PERSON',
        paymentCollectionType: 'SINGLE',
        registrationOpeningDate: new Date('2024-03-01T00:00:00Z'),
        registrationClosingDate: new Date('2024-06-10T23:59:59Z'),
        maxTeamSize: 1,
        minTeamSize: 1,
        licenseNumberType: 'FFA',
        adultJustificativeOptions: 'MEDICAL_CERTIFICATE',
        isActive: true,
        isArchived: false,
        resaleEnabled: false,
        categoryLevel1: 'Running',
        categoryLevel2: 'Road',
        federationId: 'FFA',
        dataSource: 'FEDERATION'
      }
    })

    console.log(`✅ ${[raceMarathon, raceSemi, race10km].length} courses créées`)

    // 5. Créer des propositions de test
    console.log('💡 Création des propositions...')
    
    const proposalNewEvent = await db.createProposal({
      agentId: ffaAgent.id,
      type: 'NEW_EVENT',
      changes: {
        name: 'Trail des Calanques',
        city: 'Marseille',
        country: 'France',
        countrySubdivisionNameLevel1: 'Provence-Alpes-Côte d\'Azur',
        countrySubdivisionNameLevel2: '13',
        fullAddress: 'Parc National des Calanques, 13009 Marseille',
        websiteUrl: 'https://www.trail-calanques.fr',
        dataSource: 'FEDERATION',
        races: [{
          name: 'Trail 25km',
          runDistance: 25,
          runPositiveElevation: 800,
          runNegativeElevation: 800,
          distanceCategory: 'L',
          price: 55.0,
          priceType: 'PER_PERSON',
          startDate: new Date('2024-10-20T08:00:00Z'),
          categoryLevel1: 'Trail',
          categoryLevel2: 'Nature'
        }]
      },
      justification: [{
        type: 'url',
        content: 'https://www.trail-calanques.fr/edition-2024',
        metadata: { title: 'Site officiel Trail des Calanques 2024' }
      }],
      confidence: 0.85
    })

    const proposalPriceUpdate = await db.createProposal({
      agentId: comparatorAgent.id,
      type: 'RACE_UPDATE',
      raceId: race10km.id,
      changes: {
        price: {
          old: 25.0,
          new: 30.0,
          confidence: 0.9
        },
        registrationClosingDate: {
          old: '2024-06-10T23:59:59Z',
          new: '2024-06-08T23:59:59Z',
          confidence: 0.75
        }
      },
      justification: [{
        type: 'url',
        content: 'https://www.10kmnice.fr/tarifs-2024',
        metadata: { title: 'Mise à jour des tarifs 10km Nice' }
      }],
      confidence: 0.82
    })

    const proposalEditionUpdate = await db.createProposal({
      agentId: validatorAgent.id,
      type: 'EDITION_UPDATE',
      editionId: editionSemi2024.id,
      changes: {
        registrantsNumber: {
          old: 5000,
          new: 5500,
          confidence: 0.95
        }
      },
      justification: [{
        type: 'html',
        content: '<p>Mise à jour du nombre d\'inscrits basée sur les données officielles</p>',
        metadata: { source: 'API officielle', timestamp: new Date().toISOString() }
      }],
      confidence: 0.95
    })

    // 5b. Créer des propositions groupées pour le Marathon de Paris
    console.log('🔗 Création de propositions groupées...')
    
    const groupedProposal1 = await db.createProposal({
      agentId: ffaAgent.id,
      type: 'EDITION_UPDATE',
      eventId: marathonParis.id,
      editionId: editionMarathonParis2024.id,
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
      raceId: raceMarathon.id,
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
      raceId: raceMarathon.id,
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

    console.log(`✅ ${[proposalNewEvent, proposalPriceUpdate, proposalEditionUpdate].length + 4} propositions créées (dont 4 groupées pour Marathon Paris)`)

    // 6. Créer des logs d'exécution
    console.log('📝 Création des logs...')
    
    await db.createLog({
      agentId: ffaAgent.id,
      level: 'INFO',
      message: 'Scraping FFA calendar completed successfully',
      data: {
        eventsFound: 25,
        newEvents: 3,
        updatedEvents: 8,
        duration: '2.5s'
      }
    })

    await db.createLog({
      agentId: comparatorAgent.id,
      level: 'WARN',
      message: 'Price discrepancy detected for race',
      data: {
        raceId: race10km.id,
        expectedPrice: 25,
        foundPrice: 30,
        confidence: 0.82
      }
    })

    await db.createLog({
      agentId: validatorAgent.id,
      level: 'INFO',
      message: 'Validation completed for edition',
      data: {
        editionId: editionSemi2024.id,
        checksPerformed: ['dates', 'pricing', 'capacity'],
        issuesFound: 0
      }
    })

    console.log('✅ 3 logs créés')

    // 7. Créer quelques runs d'agents
    console.log('🚀 Création des runs d\'agents...')
    
    const run1 = await db.createRun(ffaAgent.id)
    await db.updateRun(run1.id, {
      status: 'SUCCESS',
      endedAt: new Date(Date.now() - 3540000), // Il y a 59min
      duration: 60000, // 1 minute
      result: {
        success: true,
        extractedEvents: 25,
        newProposals: 1,
        confidence: 0.85
      }
    })

    const run2 = await db.createRun(comparatorAgent.id)
    await db.updateRun(run2.id, {
      status: 'SUCCESS',
      endedAt: new Date(Date.now() - 7140000), // Il y a 1h59min
      duration: 60000,
      result: {
        success: true,
        comparisons: 150,
        discrepancies: 2,
        newProposals: 1
      }
    })

    console.log('✅ 2 runs d\'agents créés')

    console.log('\n🎉 Base de données peuplée avec succès!')
    console.log('📋 Résumé:')
    console.log('  - 3 agents')
    console.log('  - 3 événements')
    console.log('  - 3 éditions') 
    console.log('  - 3 courses')
    console.log('  - 7 propositions (dont 4 groupées)')
    console.log('  - 3 logs')
    console.log('  - 2 runs d\'agents')
    console.log('')
    console.log('🔗 Propositions groupées disponibles pour Marathon de Paris:')
    console.log('  - Édition: fermeture inscriptions + capacité')
    console.log('  - Course: prix + dénivelé')
    console.log('  - Événement: URL + adresse')
    console.log('  - Course: dates inscriptions + catégorie')

  } catch (error) {
    console.error('❌ Erreur lors du peuplement:', error)
    throw error
  }
}

// Exécuter le script
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('✅ Script terminé avec succès')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Script échoué:', error)
      process.exit(1)
    })
}

export { seedDatabase }