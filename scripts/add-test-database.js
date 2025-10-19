const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function addTestDatabase() {
  try {
    const db = await prisma.databaseConnection.create({
      data: {
        name: 'Test Database',
        description: 'Base de données de test pour développement des agents',
        type: 'POSTGRESQL',
        isActive: true,
        host: 'localhost',
        port: 5432,
        database: 'test_events',
        username: 'test_user',
        tags: ['test', 'development', 'local']
      }
    })
    console.log('✅ Base de données de test créée avec succès!')
    console.log(`   ID: ${db.id}`)
    console.log(`   Nom: ${db.name}`)
    console.log(`   Type: ${db.type}`)
    console.log(`   Actif: ${db.isActive}`)
  } catch (error) {
    console.error('❌ Erreur:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

addTestDatabase()