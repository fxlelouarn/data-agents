#!/usr/bin/env node
/**
 * Copie les clients Prisma générés depuis node_modules vers un répertoire
 * accessible au runtime pour éviter les problèmes de déploiement Render
 */

const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')

// Chemins source (node_modules)
const prismaClientSrc = path.join(rootDir, 'node_modules', '.prisma', 'client')
const prismaClientMilesSrc = path.join(rootDir, 'node_modules', '.prisma', 'client-miles')

// Chemins destination (dans le code source pour être inclus dans l'archive)
const prismaClientDest = path.join(rootDir, '.prisma-generated', 'client')
const prismaClientMilesDest = path.join(rootDir, '.prisma-generated', 'client-miles')

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`⚠️  Source directory not found: ${src}`)
    return false
  }

  // Créer le répertoire destination
  fs.mkdirSync(dest, { recursive: true })

  // Copier récursivement
  const entries = fs.readdirSync(src, { withFileTypes: true })
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
  
  return true
}

console.log('📦 Copie des clients Prisma générés...')

let success = true

if (copyDir(prismaClientSrc, prismaClientDest)) {
  console.log(`✅ Client Prisma principal copié: ${prismaClientDest}`)
} else {
  console.error('❌ Échec de la copie du client Prisma principal')
  success = false
}

if (copyDir(prismaClientMilesSrc, prismaClientMilesDest)) {
  console.log(`✅ Client Prisma Miles copié: ${prismaClientMilesDest}`)
} else {
  console.error('❌ Échec de la copie du client Prisma Miles')
  success = false
}

if (success) {
  console.log('✅ Tous les clients Prisma copiés avec succès')
  process.exit(0)
} else {
  console.error('❌ Erreur lors de la copie des clients Prisma')
  process.exit(1)
}
