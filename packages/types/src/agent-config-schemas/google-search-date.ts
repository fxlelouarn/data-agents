import { ConfigSchema } from '../config.js'

export const GoogleSearchDateAgentConfigSchema: ConfigSchema = {
  title: "Configuration Google Search Date Agent",
  description: "Agent qui recherche les dates d'événements via Google Search",
  categories: [
    {
      id: "database",
      label: "Base de données",
      description: "Configuration de la source de données"
    },
    {
      id: "google",
      label: "Google Search API",
      description: "Paramètres de l'API Google Custom Search"
    },
    {
      id: "processing",
      label: "Traitement",
      description: "Paramètres de traitement des événements"
    },
    {
      id: "advanced",
      label: "Avancé",
      description: "Options avancées et filtres"
    }
  ],
  fields: [
    // Base de données
    {
      name: "sourceDatabase",
      label: "Base de données source",
      type: "select",
      category: "database",
      required: true,
      defaultValue: "",
      description: "Base de données contenant les événements à traiter",
      helpText: "Sélectionnez la base de données configurée dans les Settings qui contient les événements TO_BE_CONFIRMED",
      options: [],
      validation: { required: true }
    },

    // Traitement
    {
      name: "batchSize",
      label: "Taille des lots",
      type: "number",
      category: "processing",
      required: true,
      defaultValue: 10,
      description: "Nombre d'événements à traiter par exécution",
      helpText: "Plus la valeur est élevée, plus l'agent traitera d'événements par run, mais plus l'exécution sera longue",
      validation: { required: true, min: 1, max: 100 }
    },
    {
      name: "cooldownDays",
      label: "Cooldown (jours)",
      type: "number",
      category: "processing",
      required: true,
      defaultValue: 14,
      description: "Nombre de jours d'attente avant de retraiter un événement",
      helpText: "Évite les recherches Google répétitives. 14 jours = 2 semaines d'attente minimum entre les traitements d'un même événement",
      validation: { required: true, min: 1, max: 90 }
    },

    // Google API
    {
      name: "googleResultsCount",
      label: "Nombre de résultats Google",
      type: "number",
      category: "google",
      required: true,
      defaultValue: 5,
      description: "Nombre de résultats Google à analyser par recherche",
      helpText: "Plus de résultats = plus de chances de trouver des dates, mais plus lent et plus de consommation API",
      validation: { required: true, min: 1, max: 10 }
    },
    {
      name: "googleApiKey",
      label: "Clé API Google",
      type: "password",
      category: "google",
      required: false,
      description: "Clé API Google Custom Search (optionnelle)",
      helpText: "Si non fournie, utilise la variable d'environnement GOOGLE_API_KEY",
      placeholder: "Votre clé API Google Custom Search"
    },
    {
      name: "googleSearchEngineId",
      label: "ID du moteur de recherche",
      type: "text",
      category: "google",
      required: false,
      description: "ID du moteur de recherche personnalisé Google",
      helpText: "Si non fourni, utilise la variable d'environnement GOOGLE_SEARCH_ENGINE_ID",
      placeholder: "Votre Search Engine ID"
    },

    // Avancé
    {
      name: "dateConfidenceThreshold",
      label: "Seuil de confiance",
      type: "slider",
      category: "advanced",
      required: false,
      defaultValue: 0.6,
      description: "Seuil minimum de confiance pour retenir une date extraite",
      helpText: "Entre 0 et 1. Plus élevé = plus strict mais moins de résultats",
      validation: { min: 0, max: 1, step: 0.1 }
    },
    {
      name: "maxDatesPerEvent",
      label: "Dates max par événement",
      type: "number",
      category: "advanced",
      required: false,
      defaultValue: 5,
      description: "Nombre maximum de dates à proposer par événement",
      helpText: "Limite le nombre de propositions générées par événement",
      validation: { min: 1, max: 20 }
    },
    {
      name: "searchTimeoutMs",
      label: "Timeout recherche (ms)",
      type: "number",
      category: "advanced",
      required: false,
      defaultValue: 10000,
      description: "Timeout en millisecondes pour les recherches Google",
      helpText: "Augmenter si les recherches échouent par timeout",
      validation: { min: 1000, max: 60000 }
    },
    {
      name: "onlyFrenchEvents",
      label: "Événements français uniquement",
      type: "switch",
      category: "advanced",
      required: false,
      defaultValue: true,
      description: "Limiter aux événements français",
      helpText: "Optimise l'extraction pour les formats de dates français"
    }
  ]
}
