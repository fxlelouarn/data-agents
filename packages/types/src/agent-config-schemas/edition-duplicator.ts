import type { ConfigSchema } from '../config.js'

export const EditionDuplicatorAgentConfigSchema: ConfigSchema = {
  title: 'Configuration Edition Duplicator Agent',
  description: 'Agent qui duplique les éditions terminées pour l\'année suivante',
  categories: [
    { id: 'database', label: 'Base de données' },
    { id: 'processing', label: 'Traitement' },
  ],
  fields: [
    {
      name: 'sourceDatabase',
      label: 'Base de données Miles Republic',
      type: 'database_select',
      category: 'database',
      required: true,
      description: 'Base de données Miles Republic contenant les éditions',
      validation: { required: true },
    },
    {
      name: 'batchSize',
      label: 'Taille des lots',
      type: 'number',
      category: 'processing',
      required: false,
      defaultValue: 50,
      description: 'Nombre maximum d\'éditions à traiter par exécution',
      validation: { min: 1, max: 500 },
    },
    {
      name: 'dryRun',
      label: 'Mode simulation',
      type: 'boolean',
      category: 'processing',
      required: false,
      defaultValue: false,
      description: 'Si activé, aucune proposition ne sera créée (log uniquement)',
    },
  ],
}
