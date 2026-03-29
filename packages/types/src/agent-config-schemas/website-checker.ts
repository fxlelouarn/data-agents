import { ConfigSchema } from '../config.js'

export const WebsiteCheckerAgentConfigSchema: ConfigSchema = {
  title: "Configuration Website Checker Agent",
  description: "Agent qui visite les sites web des événements pour confirmer les éditions TO_BE_CONFIRMED",
  categories: [
    { id: "database", label: "Base de données", description: "Configuration de la source de données" },
    { id: "processing", label: "Traitement", description: "Paramètres de traitement" },
    { id: "network", label: "Réseau", description: "Paramètres HTTP et rate limiting" },
    { id: "llm", label: "LLM", description: "Configuration de l'analyse par LLM" }
  ],
  fields: [
    {
      name: "sourceDatabase",
      label: "Base de données source",
      type: "select",
      category: "database",
      required: true,
      defaultValue: "",
      description: "Base de données Miles Republic contenant les éditions",
      helpText: "Sélectionnez la base de données configurée dans les Settings",
      options: [],
      validation: { required: true }
    },
    {
      name: "batchSize",
      label: "Taille des lots",
      type: "number",
      category: "processing",
      required: true,
      defaultValue: 30,
      description: "Nombre d'éditions à traiter par exécution",
      helpText: "Chaque édition peut avoir 1-3 URLs à vérifier",
      validation: { required: true, min: 5, max: 100 }
    },
    {
      name: "cooldownDays",
      label: "Cooldown (jours)",
      type: "number",
      category: "processing",
      required: true,
      defaultValue: 14,
      description: "Jours d'attente avant de re-vérifier une édition",
      validation: { required: true, min: 1, max: 90 }
    },
    {
      name: "lookAheadMonths",
      label: "Mois à l'avance",
      type: "number",
      category: "processing",
      required: true,
      defaultValue: 3,
      description: "Combien de mois à l'avance chercher les éditions TO_BE_CONFIRMED",
      validation: { required: true, min: 1, max: 12 }
    },
    {
      name: "requestDelayMs",
      label: "Délai entre requêtes (ms)",
      type: "number",
      category: "network",
      required: true,
      defaultValue: 3000,
      description: "Délai de politesse entre les requêtes HTTP",
      helpText: "Respecte les petits sites associatifs. 3000ms = 3 secondes",
      validation: { required: true, min: 1000, max: 10000 }
    },
    {
      name: "requestTimeoutMs",
      label: "Timeout requête (ms)",
      type: "number",
      category: "network",
      required: false,
      defaultValue: 10000,
      description: "Timeout pour chaque requête HTTP",
      validation: { min: 3000, max: 30000 }
    },
    {
      name: "anthropicApiKey",
      label: "Clé API Anthropic",
      type: "password",
      category: "llm",
      required: false,
      description: "Clé API Anthropic pour l'analyse LLM",
      helpText: "Si non fournie, utilise la variable d'environnement ANTHROPIC_API_KEY"
    },
    {
      name: "llmModel",
      label: "Modèle LLM",
      type: "text",
      category: "llm",
      required: false,
      defaultValue: "claude-haiku-4-5-20251001",
      description: "Modèle Anthropic à utiliser pour l'analyse",
      helpText: "Haiku recommandé pour le rapport coût/performance"
    },
    {
      name: "dryRun",
      label: "Mode simulation",
      type: "switch",
      category: "processing",
      required: false,
      defaultValue: false,
      description: "Analyser sans créer de propositions",
      helpText: "Utile pour tester l'agent avant de l'activer en production"
    }
  ]
}
