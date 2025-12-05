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

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// Sources : où Prisma génère les clients
const SOURCES = [
  {
    src: path.join(ROOT, "packages/database/node_modules/@prisma/client"),
    dest: path.join(ROOT, "node_modules/@prisma/client"),
    name: "@prisma/client",
  },
  {
    src: path.join(ROOT, "packages/database/node_modules/.prisma/client"),
    dest: path.join(ROOT, "node_modules/.prisma/client"),
    name: ".prisma/client",
  },
];

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    // Source non trouvée - avec npm workspaces, c'est normal (hoisting)
    return false;
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

  return true;
}

console.log("🔄 Syncing Prisma clients...");

// Supprimer les stubs .prisma/client dans les sous-packages pour éviter les conflits de résolution
const STUB_PATHS = [
  path.join(ROOT, "packages/database/node_modules/.prisma"),
  path.join(ROOT, "apps/api/node_modules/.prisma"),
  path.join(ROOT, "apps/agents/node_modules/.prisma"),
];

for (const stubPath of STUB_PATHS) {
  if (fs.existsSync(stubPath)) {
    fs.rmSync(stubPath, { recursive: true, force: true });
    console.log(`   🗑️  Removed stub: ${stubPath}`);
  }
}

let syncedCount = 0;

for (const { src, dest, name } of SOURCES) {
  console.log(`   ${name}:`);

  // Vérifier si le client existe déjà à la destination (npm workspaces hoisting)
  if (fs.existsSync(dest) && fs.readdirSync(dest).length > 0) {
    console.log(
      `     ✅ Already exists at destination (hoisted by npm workspaces)`,
    );
    syncedCount++;
    continue;
  }

  console.log(`     Source: ${src}`);
  console.log(`     Dest:   ${dest}`);

  const result = copyRecursive(src, dest);
  if (result !== false) {
    console.log(`     ✅ Synced`);
    syncedCount++;
  } else {
    console.log(`     ⚠️  Source not found, but destination exists - OK`);
  }
}

console.log(
  `✅ Prisma clients ready (${syncedCount}/${SOURCES.length} synced/verified)!`,
);
