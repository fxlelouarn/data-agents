#!/usr/bin/env node

/**
 * Script pour ajouter le Google Search Date Agent à la base de données
 * 
 * Usage: node scripts/add-google-search-date-agent.js
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
})

const AGENT_CONFIG = {
  name: 'Google Search Date Agent',
  description: 'Recherche automatique des dates d\'événements sportifs via Google Search API',
  type: 'EXTRACTOR',
  isActive: true,
  frequency: '0 */6 * * *', // Toutes les 6 heures
  config: {
    // Paramètres par défaut
    batchSize: 10,                    // Événements par batch
    googleResultsCount: 5,            // Résultats Google à analyser
    
    // Clés API (à configurer via variables d'environnement)
    googleApiKey: process.env.GOOGLE_API_KEY || null,
    googleSearchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID || null,
    
    // Configuration avancée
    dateConfidenceThreshold: 0.6,     // Seuil de confiance minimum
    maxDatesPerEvent: 5,              // Dates maximum par événement
    searchTimeoutMs: 10000,           // Timeout recherche Google (10s)
    
    // Mode développement
    enableMockMode: !process.env.GOOGLE_API_KEY, // Auto-detect mock mode
    
    // Filtres
    onlyFrenchEvents: true,           // Limiter aux événements français
    excludeWeekends: false,           // Exclure les weekends
    
    // Base de données Next Prod
    nextProdUrl: process.env.MILES_REPUBLIC_DATABASE_URL,
    
    // Metadata pour l'interface
    author: 'Data Agents System',
    version: '1.0.0',
    tags: ['google', 'search', 'dates', 'extraction', 'events'],
    
    // Paramètres d'interface
    displayName: 'Google Search Date Agent',
    category: 'Extraction',
    icon: '🔍',
    color: '#4285F4', // Google Blue
    
    // Configuration de l'UI
    configSchema: {
      sourceDatabase: {
        type: 'database_select',
        label: 'Base de données source',
        description: 'Base de données contenant les événements à traiter pour la recherche de dates',
        required: true,
        category: 'Paramètres principaux',
        order: 1
      },
      batchSize: {
        type: 'number',
        label: 'Nombre d\'événements par batch',
        description: 'Nombre d\'événements à traiter par exécution',
        min: 1,
        max: 100,
        default: 10,
        category: 'Paramètres principaux',
        order: 2
      },
      googleResultsCount: {
        type: 'number', 
        label: 'Nombre de résultats Google par requête',
        description: 'Nombre de résultats Google à analyser par recherche',
        min: 1,
        max: 10,
        default: 5,
        category: 'Paramètres principaux',
        order: 3
      },
      googleApiKey: {
        type: 'password',
        label: 'Clé API Google',
        description: 'Clé API Google Custom Search (optionnel, utilise la variable d\'environnement)',
        required: false,
        category: 'API Google'
      },
      googleSearchEngineId: {
        type: 'text',
        label: 'ID Moteur de recherche',
        description: 'ID du moteur de recherche personnalisé Google',
        required: false,
        category: 'API Google'
      },
      dateConfidenceThreshold: {
        type: 'number',
        label: 'Seuil de confiance minimum',
        description: 'Seuil de confiance minimum pour accepter une date extraite (0.0 à 1.0)',
        min: 0.0,
        max: 1.0,
        step: 0.1,
        default: 0.6,
        category: 'Extraction de dates'
      },
      maxDatesPerEvent: {
        type: 'number',
        label: 'Dates maximum par événement',
        description: 'Nombre maximum de dates à extraire par événement',
        min: 1,
        max: 20,
        default: 5,
        category: 'Extraction de dates'
      },
      searchTimeoutMs: {
        type: 'number',
        label: 'Timeout recherche (ms)',
        description: 'Délai d\'attente maximum pour les requêtes Google en millisecondes',
        min: 1000,
        max: 30000,
        step: 1000,
        default: 10000,
        category: 'Paramètres avancés'
      },
      enableMockMode: {
        type: 'boolean',
        label: 'Mode simulation',
        description: 'Activer le mode simulation sans appel API réel (utile pour les tests)',
        default: false,
        category: 'Paramètres avancés'
      },
      onlyFrenchEvents: {
        type: 'boolean',
        label: 'Événements français uniquement',
        description: 'Limiter la recherche aux événements français',
        default: true,
        category: 'Filtres'
      },
      excludeWeekends: {
        type: 'boolean',
        label: 'Exclure les weekends',
        description: 'Exclure les dates tombant le weekend des propositions',
        default: false,
        category: 'Filtres'
      }
    }
  }
}

async function addGoogleSearchDateAgent() {
  try {
    console.log('🚀 Ajout du Google Search Date Agent à la base de données...')
    
    // Vérifier si l'agent existe déjà
    const existingAgent = await prisma.agent.findFirst({
      where: {
        name: AGENT_CONFIG.name
      }
    })
    
    if (existingAgent) {
      console.log('⚠️  Un agent avec ce nom existe déjà. Mise à jour...')
      
      const updatedAgent = await prisma.agent.update({
        where: {
          id: existingAgent.id
        },
        data: {
          description: AGENT_CONFIG.description,
          type: AGENT_CONFIG.type,
          isActive: AGENT_CONFIG.isActive,
          frequency: AGENT_CONFIG.frequency,
          config: AGENT_CONFIG.config,
          updatedAt: new Date()
        }
      })
      
      console.log('✅ Agent mis à jour avec succès!')
      console.log(`   ID: ${updatedAgent.id}`)
      console.log(`   Nom: ${updatedAgent.name}`)
      console.log(`   Type: ${updatedAgent.type}`)
      console.log(`   Actif: ${updatedAgent.isActive}`)
      console.log(`   Fréquence: ${updatedAgent.frequency}`)
      
    } else {
      const newAgent = await prisma.agent.create({
        data: AGENT_CONFIG
      })
      
      console.log('✅ Agent créé avec succès!')
      console.log(`   ID: ${newAgent.id}`)
      console.log(`   Nom: ${newAgent.name}`)
      console.log(`   Type: ${newAgent.type}`)
      console.log(`   Actif: ${newAgent.isActive}`)
      console.log(`   Fréquence: ${newAgent.frequency}`)
    }
    
    // Afficher les informations de configuration
    console.log('\n📋 Configuration de l\'agent:')
    console.log(`   Taille de batch: ${AGENT_CONFIG.config.batchSize}`)
    console.log(`   Résultats Google: ${AGENT_CONFIG.config.googleResultsCount}`)
    console.log(`   Mode mock: ${AGENT_CONFIG.config.enableMockMode}`)
    console.log(`   Seuil de confiance: ${AGENT_CONFIG.config.dateConfidenceThreshold}`)
    
    // Vérifications des variables d'environnement
    console.log('\n🔧 Variables d\'environnement:')
    console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? '✅ Configurée' : '❌ Manquante'}`)
    console.log(`   MILES_REPUBLIC_DATABASE_URL: ${process.env.MILES_REPUBLIC_DATABASE_URL ? '✅ Configurée' : '❌ Manquante'}`)
    console.log(`   GOOGLE_API_KEY: ${process.env.GOOGLE_API_KEY ? '✅ Configurée' : '⚠️  Manquante (mode mock actif)'}`)
    console.log(`   GOOGLE_SEARCH_ENGINE_ID: ${process.env.GOOGLE_SEARCH_ENGINE_ID ? '✅ Configurée' : '⚠️  Manquante (mode mock actif)'}`)
    
    if (!process.env.GOOGLE_API_KEY || !process.env.GOOGLE_SEARCH_ENGINE_ID) {
      console.log('\n💡 Note: Sans les clés API Google, l\'agent fonctionnera en mode mock avec des données de test.')
      console.log('   Pour obtenir les clés API:')
      console.log('   1. Aller sur https://console.cloud.google.com')
      console.log('   2. Activer l\'API Custom Search')
      console.log('   3. Créer un moteur de recherche personnalisé sur https://cse.google.com')
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'ajout de l\'agent:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Fonction pour supprimer l'agent (utile pour les tests)
async function removeGoogleSearchDateAgent() {
  try {
    console.log('🗑️  Suppression du Google Search Date Agent...')
    
    const deletedAgent = await prisma.agent.deleteMany({
      where: {
        name: AGENT_CONFIG.name
      }
    })
    
    console.log(`✅ ${deletedAgent.count} agent(s) supprimé(s)`)
    
  } catch (error) {
    console.error('❌ Erreur lors de la suppression:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Gestion des arguments de ligne de commande
const command = process.argv[2]

if (command === 'remove' || command === '--remove') {
  removeGoogleSearchDateAgent()
} else {
  addGoogleSearchDateAgent()
}