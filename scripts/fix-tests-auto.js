#!/usr/bin/env node

/**
 * Script de correction automatique des tests proposal-application
 * 
 * Corrections appliquées :
 * 1. Ajouter `await` devant createNewEventProposal() et createEditionUpdateProposal()
 * 2. Remplacer applyProposal(proposal, ...) par applyProposal(proposal.id, ...)
 * 3. Ajouter l'option milesRepublicDatabaseId aux appels applyProposal
 */

const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '../apps/agents/src/__tests__/proposal-application');

// Couleurs pour les logs
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m'
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

/**
 * Applique les corrections à un fichier
 */
function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  const fixes = [];

  // Fix 1: Ajouter await devant createNewEventProposal
  const awaitNewEventRegex = /(?<!await\s)createNewEventProposal\(/g;
  if (awaitNewEventRegex.test(content)) {
    content = content.replace(/(?<!await\s)createNewEventProposal\(/g, 'await createNewEventProposal(');
    fixes.push('Ajout de await devant createNewEventProposal()');
    modified = true;
  }

  // Fix 2: Ajouter await devant createEditionUpdateProposal
  const awaitEditionUpdateRegex = /(?<!await\s)createEditionUpdateProposal\(/g;
  if (awaitEditionUpdateRegex.test(content)) {
    content = content.replace(/(?<!await\s)createEditionUpdateProposal\(/g, 'await createEditionUpdateProposal(');
    fixes.push('Ajout de await devant createEditionUpdateProposal()');
    modified = true;
  }

  // Fix 3: Remplacer domainService.applyProposal(proposal, ...) par domainService.applyProposal(proposal.id, ...)
  const applyProposalRegex = /(\w+)\.applyProposal\(\s*proposal\s*,\s*proposal\.selectedChanges/g;
  if (applyProposalRegex.test(content)) {
    content = content.replace(
      /(\w+)\.applyProposal\(\s*proposal\s*,\s*proposal\.selectedChanges\s*(as\s+any)?\s*,/g,
      '$1.applyProposal(proposal.id, proposal.selectedChanges as any,'
    );
    fixes.push('Correction des appels applyProposal (proposal → proposal.id)');
    modified = true;
  }

  // Fix 4: Ajouter milesRepublicDatabaseId si absent
  const applyWithoutDbIdRegex = /\.applyProposal\([^)]*\{\s*\}/g;
  if (applyWithoutDbIdRegex.test(content)) {
    content = content.replace(
      /\.applyProposal\(([^,]+),\s*([^,]+),\s*\{\s*\}/g,
      '.applyProposal($1, $2, { milesRepublicDatabaseId: \'miles-republic-test\' }'
    );
    fixes.push('Ajout de milesRepublicDatabaseId aux options');
    modified = true;
  }

  // Fix 5: Remplacer proposalService.applyProposal(proposal as any, {}) par la bonne signature
  const applyProposalLegacyRegex = /(\w+)\.applyProposal\(\s*proposal\s+as\s+any\s*,\s*\{\s*\}/g;
  if (applyProposalLegacyRegex.test(content)) {
    content = content.replace(
      /(\w+)\.applyProposal\(\s*proposal\s+as\s+any\s*,\s*\{\s*\}/g,
      '$1.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: \'miles-republic-test\' })'
    );
    fixes.push('Correction de la signature legacy applyProposal');
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    return { modified: true, fixes };
  }

  return { modified: false, fixes: [] };
}

/**
 * Parcourt récursivement un répertoire
 */
function walkDir(dir, callback) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && file !== 'node_modules' && file !== 'dist') {
      walkDir(filePath, callback);
    } else if (stat.isFile() && file.endsWith('.test.ts')) {
      callback(filePath);
    }
  });
}

/**
 * Main
 */
function main() {
  log(colors.blue, '\n🔧 Correction automatique des tests proposal-application\n');

  let totalFiles = 0;
  let modifiedFiles = 0;
  const results = [];

  walkDir(TEST_DIR, (filePath) => {
    totalFiles++;
    const relativePath = path.relative(process.cwd(), filePath);
    const result = fixFile(filePath);
    
    if (result.modified) {
      modifiedFiles++;
      log(colors.green, `✓ ${relativePath}`);
      result.fixes.forEach(fix => {
        log(colors.yellow, `  - ${fix}`);
      });
      results.push({ file: relativePath, fixes: result.fixes });
    } else {
      log(colors.blue, `○ ${relativePath} (aucune modification)`);
    }
  });

  log(colors.blue, '\n📊 Résumé :');
  log(colors.blue, `  Fichiers analysés : ${totalFiles}`);
  log(colors.green, `  Fichiers modifiés : ${modifiedFiles}`);
  log(colors.blue, `  Fichiers inchangés : ${totalFiles - modifiedFiles}`);

  if (modifiedFiles > 0) {
    log(colors.green, '\n✅ Corrections appliquées avec succès !');
    log(colors.yellow, '\n⚠️  Vérifiez les changements avec git diff avant de commiter.');
  } else {
    log(colors.blue, '\n✓ Aucune correction nécessaire.');
  }
}

main();
