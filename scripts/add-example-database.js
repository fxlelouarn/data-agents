#!/usr/bin/env node

/**
 * Script pour ajouter une base de données d'exemple à la configuration
 * 
 * Usage: node scripts/add-example-database.js
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
})

const EXAMPLE_DATABASE = {
  name: 'Miles Republic Production',
  description: 'Base de données principale de Miles Republic contenant les événements, éditions et courses',
  type: 'MILES_REPUBLIC',
  isActive: true,
  connectionUrl: process.env.MILES_REPUBLIC_DATABASE_URL,
  tags: ['production', 'events', 'primary'],
  sslMode: 'prefer',
  timeout: 30000,
  maxConnections: 10
}

async function addExampleDatabase() {
  try {
    console.log('🗄️ Ajout de la base de données d\'exemple...')
    
    // Vérifier si une base avec ce nom existe déjà
    const existingDb = await prisma.databaseConnection.findFirst({
      where: {
        name: EXAMPLE_DATABASE.name
      }
    })
    
    if (existingDb) {
      console.log('⚠️  Une base de données avec ce nom existe déjà. Mise à jour...')
      
      const updatedDb = await prisma.databaseConnection.update({
        where: {
          id: existingDb.id
        },
        data: {
          description: EXAMPLE_DATABASE.description,
          type: EXAMPLE_DATABASE.type,
          isActive: EXAMPLE_DATABASE.isActive,
          connectionUrl: EXAMPLE_DATABASE.connectionUrl,
          tags: EXAMPLE_DATABASE.tags,
          sslMode: EXAMPLE_DATABASE.sslMode,
          timeout: EXAMPLE_DATABASE.timeout,
          maxConnections: EXAMPLE_DATABASE.maxConnections,
          updatedAt: new Date()
        }
      })
      
      console.log('✅ Base de données mise à jour avec succès!')
      console.log(`   ID: ${updatedDb.id}`)
      console.log(`   Nom: ${updatedDb.name}`)
      console.log(`   Type: ${updatedDb.type}`)
      console.log(`   Actif: ${updatedDb.isActive}`)
      
    } else {
      const newDb = await prisma.databaseConnection.create({
        data: EXAMPLE_DATABASE
      })
      
      console.log('✅ Base de données créée avec succès!')
      console.log(`   ID: ${newDb.id}`)
      console.log(`   Nom: ${newDb.name}`)
      console.log(`   Type: ${newDb.type}`)
      console.log(`   Actif: ${newDb.isActive}`)
    }
    
    // Afficher les informations de configuration
    console.log('\n📋 Configuration de la base de données:')
    console.log(`   Description: ${EXAMPLE_DATABASE.description}`)
    console.log(`   URL de connexion: ${EXAMPLE_DATABASE.connectionUrl ? '✅ Configurée' : '❌ Manquante'}`)
    console.log(`   Tags: ${EXAMPLE_DATABASE.tags.join(', ')}`)
    console.log(`   SSL Mode: ${EXAMPLE_DATABASE.sslMode}`)
    console.log(`   Timeout: ${EXAMPLE_DATABASE.timeout}ms`)
    
    // Vérifications des variables d'environnement
    console.log('\n🔧 Variables d\'environnement:')
    console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? '✅ Configurée' : '❌ Manquante'}`)
    console.log(`   MILES_REPUBLIC_DATABASE_URL: ${process.env.MILES_REPUBLIC_DATABASE_URL ? '✅ Configurée' : '❌ Manquante'}`)
    
    if (!process.env.MILES_REPUBLIC_DATABASE_URL) {
      console.log('\n💡 Note: La variable MILES_REPUBLIC_DATABASE_URL n\'est pas configurée.')
      console.log('   Cette base de données sera marquée comme inactive jusqu\'à configuration complète.')
      
      // Désactiver la base si pas d'URL
      await prisma.databaseConnection.updateMany({
        where: { name: EXAMPLE_DATABASE.name },
        data: { isActive: false }
      })
      console.log('   → Base de données désactivée automatiquement.')
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'ajout de la base de données:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Fonction pour supprimer la base de données exemple (utile pour les tests)
async function removeExampleDatabase() {
  try {
    console.log('🗑️  Suppression de la base de données d\'exemple...')
    
    const deletedDb = await prisma.databaseConnection.deleteMany({
      where: {
        name: EXAMPLE_DATABASE.name
      }
    })
    
    console.log(`✅ ${deletedDb.count} base(s) de données supprimée(s)`)
    
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
  removeExampleDatabase()
} else {
  addExampleDatabase()
}