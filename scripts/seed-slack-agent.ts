/**
 * Script de seed pour créer l'agent Slack Event
 * 
 * Usage:
 *   npx tsx scripts/seed-slack-agent.ts
 * 
 * Ce script crée l'agent Slack dans la base de données avec la configuration par défaut.
 * Il peut être exécuté plusieurs fois sans créer de doublons (upsert).
 */

import { prisma } from '@data-agents/database'
import { AGENT_VERSIONS } from '@data-agents/types'
import { SlackEventAgentConfigSchema } from '../apps/agents/src/SlackEventAgent.configSchema'

async function main() {
  console.log('🤖 Seeding Slack Event Agent...')

  const agentName = 'Slack Event Agent'
  const agentId = 'slack-event-agent'

  // Configuration par défaut
  const defaultConfig = {
    version: AGENT_VERSIONS.SLACK_EVENT_AGENT,
    // Credentials (fallback sur env vars si non définis)
    slackBotToken: undefined, // Utilise SLACK_BOT_TOKEN
    slackSigningSecret: undefined, // Utilise SLACK_SIGNING_SECRET
    anthropicApiKey: undefined, // Utilise ANTHROPIC_API_KEY
    // Channels
    channels: [
      {
        id: process.env.SLACK_CHANNEL_ID || '',
        name: 'data-events',
        autoCreateProposal: true,
        notifyOnValidation: true
      }
    ],
    // Extraction
    extraction: {
      preferredModel: 'haiku',
      fallbackToSonnet: true,
      maxImageSizeMB: 20
    },
    // Relances
    reminders: {
      enabled: true,
      delayHours: 24,
      maxReminders: 2
    },
    // Source database (à configurer via dashboard)
    sourceDatabase: undefined,
    // Schéma de configuration pour le dashboard
    configSchema: SlackEventAgentConfigSchema
  }

  // Upsert l'agent
  const agent = await prisma.agent.upsert({
    where: { name: agentName },
    update: {
      description: `Agent qui traite les messages Slack @databot pour extraire des événements (v${AGENT_VERSIONS.SLACK_EVENT_AGENT})`,
      config: defaultConfig,
      // Ne pas écraser isActive si l'agent existe déjà
    },
    create: {
      id: agentId,
      name: agentName,
      description: `Agent qui traite les messages Slack @databot pour extraire des événements (v${AGENT_VERSIONS.SLACK_EVENT_AGENT})`,
      type: 'EXTRACTOR',
      frequency: '0 0 31 2 *', // 31 février = jamais (webhook-driven)
      isActive: true,
      config: defaultConfig
    }
  })

  console.log(`✅ Agent créé/mis à jour: ${agent.name}`)
  console.log(`   ID: ${agent.id}`)
  console.log(`   Type: ${agent.type}`)
  console.log(`   Actif: ${agent.isActive}`)
  console.log(`   Version: ${AGENT_VERSIONS.SLACK_EVENT_AGENT}`)
  console.log('')
  console.log('📋 Configuration par défaut:')
  console.log('   - Channels: Utilise SLACK_CHANNEL_ID env var')
  console.log('   - Modèle: Haiku avec fallback Sonnet')
  console.log('   - Relances: 24h, max 2')
  console.log('')
  console.log('💡 Pour configurer:')
  console.log('   1. Aller dans le dashboard → Agents → Slack Event Agent')
  console.log('   2. Configurer les channels et la base de données source')
  console.log('   3. Optionnel: Définir les credentials directement (sinon env vars)')
}

main()
  .catch((e) => {
    console.error('❌ Error seeding Slack agent:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
