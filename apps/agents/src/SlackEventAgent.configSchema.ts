/**
 * Schéma de configuration pour SlackEventAgent
 * Utilisé par le dashboard pour afficher un formulaire de configuration
 */

import { ConfigSchema } from '@data-agents/types'

export const SlackEventAgentConfigSchema: ConfigSchema = {
  categories: [
    {
      id: 'credentials',
      title: 'Identifiants',
      description: 'Tokens et clés API (optionnel si définis en variables d\'environnement)',
      fields: [
        {
          key: 'slackBotToken',
          label: 'Slack Bot Token',
          type: 'password',
          description: 'Token du bot Slack (xoxb-...). Fallback: SLACK_BOT_TOKEN',
          placeholder: 'xoxb-...',
          required: false
        },
        {
          key: 'slackSigningSecret',
          label: 'Slack Signing Secret',
          type: 'password',
          description: 'Secret de signature Slack. Fallback: SLACK_SIGNING_SECRET',
          required: false
        },
        {
          key: 'anthropicApiKey',
          label: 'Anthropic API Key',
          type: 'password',
          description: 'Clé API Anthropic pour Claude. Fallback: ANTHROPIC_API_KEY',
          placeholder: 'sk-ant-...',
          required: false
        }
      ]
    },
    {
      id: 'channels',
      title: 'Channels Slack',
      description: 'Configuration des channels surveillés',
      fields: [
        {
          key: 'channels',
          label: 'Channels',
          type: 'json',
          description: 'Liste des channels à surveiller avec leurs configurations',
          required: true,
          defaultValue: [
            {
              id: '',
              name: 'data-events',
              autoCreateProposal: true,
              notifyOnValidation: true
            }
          ]
        }
      ]
    },
    {
      id: 'extraction',
      title: 'Extraction',
      description: 'Configuration de l\'extraction de données',
      fields: [
        {
          key: 'extraction.preferredModel',
          label: 'Modèle préféré',
          type: 'select',
          description: 'Modèle Claude à utiliser en priorité',
          required: true,
          defaultValue: 'haiku',
          options: [
            { value: 'haiku', label: 'Claude Haiku (rapide, économique)' },
            { value: 'sonnet', label: 'Claude Sonnet (plus précis)' }
          ]
        },
        {
          key: 'extraction.fallbackToSonnet',
          label: 'Fallback vers Sonnet',
          type: 'boolean',
          description: 'Utiliser Sonnet si Haiku échoue',
          required: true,
          defaultValue: true
        },
        {
          key: 'extraction.maxImageSizeMB',
          label: 'Taille max image (MB)',
          type: 'number',
          description: 'Taille maximale des images en mégaoctets',
          required: true,
          defaultValue: 20,
          validation: {
            min: 1,
            max: 50
          }
        }
      ]
    },
    {
      id: 'reminders',
      title: 'Relances',
      description: 'Configuration des relances automatiques',
      fields: [
        {
          key: 'reminders.enabled',
          label: 'Activer les relances',
          type: 'boolean',
          description: 'Envoyer des relances si pas de validation',
          required: true,
          defaultValue: true
        },
        {
          key: 'reminders.delayHours',
          label: 'Délai avant relance (heures)',
          type: 'number',
          description: 'Nombre d\'heures avant la première relance',
          required: true,
          defaultValue: 24,
          validation: {
            min: 1,
            max: 168
          }
        },
        {
          key: 'reminders.maxReminders',
          label: 'Nombre max de relances',
          type: 'number',
          description: 'Nombre maximum de relances avant abandon',
          required: true,
          defaultValue: 2,
          validation: {
            min: 0,
            max: 5
          }
        }
      ]
    },
    {
      id: 'database',
      title: 'Base de données',
      description: 'Configuration de la connexion à la base source',
      fields: [
        {
          key: 'sourceDatabase',
          label: 'Base de données source',
          type: 'database',
          description: 'Base de données Miles Republic pour le matching',
          required: true
        }
      ]
    }
  ]
}
