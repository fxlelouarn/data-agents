import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Créer l'utilisateur admin par défaut
  const adminEmail = 'admin@data-agents.local'
  const adminPassword = 'admin123'  // À changer en production !

  // Vérifier s'il existe déjà un admin (n'importe lequel)
  const existingAdmin = await prisma.user.findFirst({
    where: { role: 'ADMIN', isActive: true }
  })

  if (existingAdmin) {
    console.log(`✅ Admin user already exists: ${existingAdmin.email}`)
  } else {
    const passwordHash = await bcrypt.hash(adminPassword, 10)

    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        firstName: 'Admin',
        lastName: 'Data Agents',
        role: 'ADMIN',
        isActive: true
      }
    })

    console.log(`✅ Created admin user: ${admin.email}`)
    console.log(`   Password: ${adminPassword}`)
    console.log(`   ⚠️  IMPORTANT: Change this password after first login!`)
  }

  // Créer un Settings singleton si nécessaire
  const existingSettings = await prisma.settings.findUnique({
    where: { id: 'singleton' }
  })

  if (!existingSettings) {
    await prisma.settings.create({
      data: {
        id: 'singleton',
        maxConsecutiveFailures: 3,
        enableAutoDisabling: true,
        checkIntervalMinutes: 5
      }
    })
    console.log('✅ Created default settings')
  }

  console.log('🌱 Seeding completed!')
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
