#!/usr/bin/env node

/**
 * Sync Prisma Clients
 * 
 * Ce script copie les clients Prisma générés vers tous les emplacements
 * où les packages les recherchent au runtime.
 * 
 * Problème résolu :
 * - packages/database cherche dans packages/database/node_modules/@prisma/client
 * - apps/* cherchent dans node_modules/@prisma/client (racine)
 * - Prisma génère dans packages/database/node_modules/@prisma/client
 * 
 * Solution :
 * - Copier le client généré vers node_modules/@prisma/client à la racine
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Sources : où Prisma génère les clients
const SOURCES = [
  {
    src: path.join(ROOT, 'packages/database/node_modules/@prisma/client'),
    dest: path.join(ROOT, 'node_modules/@prisma/client'),
    name: '@prisma/client'
  },
  {
    src: path.join(ROOT, 'packages/database/node_modules/.prisma/client'),
    dest: path.join(ROOT, 'node_modules/.prisma/client'),
    name: '.prisma/client'
  }
];

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    console.error(`❌ Source not found: ${src}`);
    console.error('   Run: npm run prisma:generate:main');
    process.exit(1);
  }

  // Créer le répertoire de destination s'il n'existe pas
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('🔄 Syncing Prisma clients...');

for (const { src, dest, name } of SOURCES) {
  console.log(`   ${name}:`);
  console.log(`     Source: ${src}`);
  console.log(`     Dest:   ${dest}`);
  
  copyRecursive(src, dest);
  console.log(`     ✅ Synced`);
}

console.log('✅ All Prisma clients synced successfully!');
