import { ConfigSchema } from '../config.js'

export const SlackEventAgentConfigSchema: ConfigSchema = {
  title: "Configuration Slack Event Agent",
  description: "Agent qui traite les messages Slack @databot pour extraire des événements",
  categories: [
    {
      id: 'credentials',
      label: 'Identifiants',
      description: 'Tokens et clés API (optionnel si définis en variables d\'environnement)'
    },
    {
      id: 'channels',
      label: 'Channels Slack',
      description: 'Configuration des channels surveillés'
    },
    {
      id: 'extraction',
      label: 'Extraction',
      description: 'Configuration de l\'extraction de données'
    },
    {
      id: 'reminders',
      label: 'Relances',
      description: 'Configuration des relances automatiques'
    },
    {
      id: 'database',
      label: 'Base de données',
      description: 'Configuration de la connexion à la base source'
    }
  ],
  fields: [
    // Credentials
    {
      name: 'slackBotToken',
      label: 'Slack Bot Token',
      type: 'password',
      category: 'credentials',
      description: 'Token du bot Slack (xoxb-...). Fallback: SLACK_BOT_TOKEN',
      helpText: 'Obtenu depuis https://api.slack.com/apps',
      placeholder: 'xoxb-...',
      required: false
    },
    {
      name: 'slackSigningSecret',
      label: 'Slack Signing Secret',
      type: 'password',
      category: 'credentials',
      description: 'Secret de signature Slack. Fallback: SLACK_SIGNING_SECRET',
      required: false
    },
    {
      name: 'anthropicApiKey',
      label: 'Anthropic API Key',
      type: 'password',
      category: 'credentials',
      description: 'Clé API Anthropic pour Claude. Fallback: ANTHROPIC_API_KEY',
      placeholder: 'sk-ant-...',
      required: false
    },

    // Channels - using textarea for JSON array
    {
      name: 'channels',
      label: 'Channels',
      type: 'textarea',
      category: 'channels',
      description: 'Liste des channels à surveiller (format JSON)',
      helpText: 'Ex: [{"id": "C123", "name": "data-events", "autoCreateProposal": true, "notifyOnValidation": true}]',
      required: true,
      defaultValue: '[]'
    },

    // Extraction
    {
      name: 'extraction.preferredModel',
      label: 'Modèle préféré',
      type: 'select',
      category: 'extraction',
      description: 'Modèle Claude à utiliser en priorité',
      required: true,
      defaultValue: 'haiku',
      options: [
        { value: 'haiku', label: 'Claude Haiku (rapide, économique)' },
        { value: 'sonnet', label: 'Claude Sonnet (plus précis)' }
      ]
    },
    {
      name: 'extraction.fallbackToSonnet',
      label: 'Fallback vers Sonnet',
      type: 'switch',
      category: 'extraction',
      description: 'Utiliser Sonnet si Haiku échoue',
      required: true,
      defaultValue: true
    },
    {
      name: 'extraction.maxImageSizeMB',
      label: 'Taille max image (MB)',
      type: 'number',
      category: 'extraction',
      description: 'Taille maximale des images en mégaoctets',
      required: true,
      defaultValue: 20,
      validation: { min: 1, max: 50 }
    },

    // Reminders
    {
      name: 'reminders.enabled',
      label: 'Activer les relances',
      type: 'switch',
      category: 'reminders',
      description: 'Envoyer des relances si pas de validation',
      required: true,
      defaultValue: true
    },
    {
      name: 'reminders.delayHours',
      label: 'Délai avant relance (heures)',
      type: 'number',
      category: 'reminders',
      description: 'Nombre d\'heures avant la première relance',
      required: true,
      defaultValue: 24,
      validation: { min: 1, max: 168 }
    },
    {
      name: 'reminders.maxReminders',
      label: 'Nombre max de relances',
      type: 'number',
      category: 'reminders',
      description: 'Nombre maximum de relances avant abandon',
      required: true,
      defaultValue: 2,
      validation: { min: 0, max: 5 }
    },

    // Database
    {
      name: 'sourceDatabase',
      label: 'Base de données source',
      type: 'database_select',
      category: 'database',
      description: 'Base de données Miles Republic pour le matching',
      required: true
    }
  ]
}
