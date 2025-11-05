#!/usr/bin/env node

/**
 * View Proposal Utility
 * 
 * Affiche le contenu détaillé d'une proposal depuis la base de données
 * 
 * Usage:
 *   node scripts/view-proposal.js <proposal-id>
 *   npm run view-proposal <proposal-id>
 */

const { PrismaClient } = require('@prisma/client');
const util = require('util');

// Couleurs pour le terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

function colorize(color, text) {
  return `${colors[color]}${text}${colors.reset}`;
}

function separator(char = '=', length = 80) {
  console.log(colorize('dim', char.repeat(length)));
}

function header(text) {
  console.log('\n');
  separator();
  console.log(colorize('bright', text));
  separator();
}

function section(title) {
  console.log('\n' + colorize('cyan', `▸ ${title}`));
}

function field(label, value, color = 'reset') {
  console.log(`  ${colorize('dim', label + ':')} ${colorize(color, value)}`);
}

function formatDate(date) {
  if (!date) return 'N/A';
  return new Date(date).toLocaleString('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatJSON(obj, indent = 2) {
  return util.inspect(obj, { 
    depth: null, 
    colors: true, 
    maxArrayLength: null,
    breakLength: 80,
    compact: false
  });
}

function displayProposalType(type) {
  const typeLabels = {
    'NEW_EVENT': '🆕 Nouvel événement',
    'EVENT_UPDATE': '📝 Mise à jour événement',
    'EDITION_UPDATE': '📅 Mise à jour édition',
    'RACE_UPDATE': '🏁 Mise à jour course',
    'NEW_EDITION': '🆕 Nouvelle édition',
    'NEW_RACE': '🆕 Nouvelle course'
  };
  return typeLabels[type] || type;
}

function displayStatus(status) {
  const statusConfig = {
    'PENDING': { color: 'yellow', icon: '⏳', label: 'En attente' },
    'APPROVED': { color: 'green', icon: '✅', label: 'Approuvée' },
    'REJECTED': { color: 'red', icon: '❌', label: 'Rejetée' },
    'APPLIED': { color: 'blue', icon: '✓', label: 'Appliquée' }
  };
  const config = statusConfig[status] || { color: 'reset', icon: '?', label: status };
  return colorize(config.color, `${config.icon} ${config.label}`);
}

async function viewProposal(proposalId) {
  const prisma = new PrismaClient();
  
  try {
    // Récupérer la proposal avec toutes les relations
    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            type: true,
            isActive: true
          }
        }
      }
    });

    if (!proposal) {
      console.error(colorize('red', `\n❌ Proposal non trouvée: ${proposalId}\n`));
      process.exit(1);
    }

    // Affichage du contenu
    header(`📋 PROPOSAL: ${proposal.id}`);

    // Informations générales
    section('Informations générales');
    field('Type', displayProposalType(proposal.type));
    field('Statut', displayStatus(proposal.status));
    field('Confiance', `${(proposal.confidence * 100).toFixed(1)}%`, 
          proposal.confidence >= 0.8 ? 'green' : proposal.confidence >= 0.5 ? 'yellow' : 'red');
    field('Créée le', formatDate(proposal.createdAt));
    field('Mise à jour le', formatDate(proposal.updatedAt));

    // Contexte
    section('Contexte');
    if (proposal.eventId) field('Event ID', proposal.eventId, 'cyan');
    if (proposal.eventName) field('Nom événement', proposal.eventName, 'bright');
    if (proposal.eventCity) field('Ville', proposal.eventCity);
    if (proposal.editionId) field('Edition ID', proposal.editionId, 'cyan');
    if (proposal.editionYear) field('Année', proposal.editionYear.toString());
    if (proposal.raceId) field('Race ID', proposal.raceId, 'cyan');
    if (proposal.raceName) field('Nom course', proposal.raceName, 'bright');

    // Agent
    section('Agent');
    if (proposal.agent) {
      field('ID', proposal.agent.id);
      field('Nom', proposal.agent.name, 'bright');
      field('Type', proposal.agent.type);
      field('Actif', proposal.agent.isActive ? '✓ Oui' : '✗ Non', 
            proposal.agent.isActive ? 'green' : 'red');
    } else {
      field('Agent ID', proposal.agentId);
      console.log(colorize('yellow', '  ⚠️  Informations agent non disponibles'));
    }

    // Révision
    if (proposal.reviewedAt || proposal.reviewedBy) {
      section('Révision');
      if (proposal.reviewedAt) field('Révisée le', formatDate(proposal.reviewedAt));
      if (proposal.reviewedBy) field('Révisée par', proposal.reviewedBy);
    }

    // Modifications utilisateur
    if (proposal.userModifiedChanges || proposal.modificationReason) {
      section('Modifications utilisateur');
      if (proposal.modifiedBy) field('Modifiée par', proposal.modifiedBy);
      if (proposal.modifiedAt) field('Modifiée le', formatDate(proposal.modifiedAt));
      if (proposal.modificationReason) {
        console.log('\n  ' + colorize('yellow', 'Raison:'));
        console.log('  ' + proposal.modificationReason.split('\n').join('\n  '));
      }
      if (proposal.userModifiedChanges) {
        console.log('\n  ' + colorize('yellow', 'Changements modifiés:'));
        console.log(formatJSON(proposal.userModifiedChanges).split('\n').map(l => '  ' + l).join('\n'));
      }
    }

    // Changements proposés
    section('Changements proposés');
    if (proposal.changes && typeof proposal.changes === 'object') {
      console.log(formatJSON(proposal.changes).split('\n').map(l => '  ' + l).join('\n'));
    } else {
      console.log(colorize('dim', '  Aucun changement'));
    }

    // Justifications
    section('Justifications');
    if (proposal.justification && Array.isArray(proposal.justification)) {
      proposal.justification.forEach((just, index) => {
        console.log(`\n  ${colorize('bright', `${index + 1}.`)}`);
        if (typeof just === 'string') {
          console.log(`     ${just}`);
        } else if (just && typeof just === 'object') {
          if (just.type) {
            console.log(`     ${colorize('blue', `Type:`)} ${just.type}`);
          }
          if (just.content) {
            console.log(`     ${colorize('blue', `Contenu:`)} ${just.content}`);
          }
          if (just.metadata) {
            console.log(`     ${colorize('blue', `Métadonnées:`)}`);
            console.log(formatJSON(just.metadata).split('\n').map(l => '       ' + l).join('\n'));
          }
          // Afficher les autres propriétés
          const otherProps = Object.keys(just).filter(k => !['type', 'content', 'metadata'].includes(k));
          otherProps.forEach(prop => {
            console.log(`     ${colorize('blue', `${prop}:`)} ${JSON.stringify(just[prop])}`);
          });
        }
      });
    } else if (proposal.justification) {
      console.log(formatJSON(proposal.justification).split('\n').map(l => '  ' + l).join('\n'));
    } else {
      console.log(colorize('dim', '  Aucune justification'));
    }

    separator();
    console.log('');

  } catch (error) {
    console.error(colorize('red', `\n❌ Erreur: ${error.message}\n`));
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// CLI
const proposalId = process.argv[2];

if (!proposalId) {
  console.error(colorize('red', '\n❌ Usage: node scripts/view-proposal.js <proposal-id>\n'));
  console.log(colorize('dim', 'Exemple:'));
  console.log('  node scripts/view-proposal.js cmhlcp7gr01rvqy79muaap880\n');
  process.exit(1);
}

// Exécution
viewProposal(proposalId).catch(error => {
  console.error(colorize('red', `\n❌ Erreur fatale: ${error.message}\n`));
  process.exit(1);
});
