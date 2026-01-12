import { ConfigSchema } from '../config.js'

export const FFAResultsAgentConfigSchema: ConfigSchema = {
  title: "Configuration FFA Results Agent",
  description: "Agent qui récupère le nombre de participants depuis les résultats FFA pour les éditions passées",
  categories: [
    {
      id: "database",
      label: "Base de données",
      description: "Configuration de la source de données"
    },
    {
      id: "scraping",
      label: "Scraping",
      description: "Paramètres de scraping des résultats FFA"
    },
    {
      id: "filtering",
      label: "Filtrage",
      description: "Filtres sur les compétitions à traiter"
    },
    {
      id: "matching",
      label: "Matching",
      description: "Configuration du matching avec Miles Republic"
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
      description: "Base de données Miles Republic",
      helpText: "Base de données contenant les éditions à enrichir",
      options: [],
      validation: { required: true }
    },

    // Scraping
    {
      name: "liguesPerRun",
      label: "Ligues par exécution",
      type: "number",
      category: "scraping",
      required: true,
      defaultValue: 2,
      description: "Nombre de ligues à traiter par run",
      helpText: "Plus la valeur est élevée, plus l'exécution sera longue",
      validation: { required: true, min: 1, max: 21 }
    },
    {
      name: "monthsPerRun",
      label: "Mois par exécution",
      type: "number",
      category: "scraping",
      required: true,
      defaultValue: 1,
      description: "Nombre de mois à traiter par run",
      helpText: "Recommandé: 1 mois par run pour éviter les timeouts",
      validation: { required: true, min: 1, max: 12 }
    },
    {
      name: "humanDelayMs",
      label: "Délai entre requêtes (ms)",
      type: "number",
      category: "scraping",
      required: true,
      defaultValue: 2000,
      description: "Délai entre chaque requête HTTP",
      helpText: "Simule un comportement humain (recommandé: 1500-3000ms)",
      validation: { required: true, min: 500, max: 10000 }
    },
    {
      name: "rescanDelayDays",
      label: "Délai de rescan (jours)",
      type: "number",
      category: "scraping",
      required: true,
      defaultValue: 30,
      description: "Délai avant de rescanner la même période",
      helpText: "Après avoir couvert toute la fenêtre, attendre X jours avant de recommencer",
      validation: { required: true, min: 1, max: 365 }
    },

    // Filtrage
    {
      name: "levels",
      label: "Niveaux de compétition",
      type: "multiselect",
      category: "filtering",
      required: true,
      defaultValue: ["Départemental", "Régional", "National", "International"],
      description: "Niveaux de compétition à inclure",
      helpText: "Tous les niveaux sont inclus par défaut pour les résultats",
      options: [
        { value: "Départemental", label: "Départemental" },
        { value: "Régional", label: "Régional" },
        { value: "National", label: "National" },
        { value: "International", label: "International" }
      ],
      validation: { required: true }
    },
    {
      name: "minEditionDate",
      label: "Date minimale des éditions",
      type: "text",
      category: "filtering",
      required: true,
      defaultValue: "2025-01-01",
      description: "Date minimale pour les éditions à traiter",
      helpText: "Format YYYY-MM-DD. Les éditions avant cette date sont ignorées",
      validation: { required: true }
    },
    {
      name: "minDaysAgo",
      label: "Délai minimum (jours)",
      type: "number",
      category: "filtering",
      required: true,
      defaultValue: 30,
      description: "Événements terminés depuis au moins X jours",
      helpText: "Laisser le temps à la FFA de publier les résultats",
      validation: { required: true, min: 7, max: 90 }
    },

    // Matching
    {
      name: "similarityThreshold",
      label: "Seuil de similarité",
      type: "slider",
      category: "matching",
      required: true,
      defaultValue: 0.75,
      description: "Seuil minimum de similarité pour proposer un match",
      helpText: "75% = correspondance acceptable, 90% = correspondance forte",
      validation: { min: 0.5, max: 1.0, step: 0.05 }
    },
    {
      name: "confidenceBase",
      label: "Confiance de base",
      type: "slider",
      category: "matching",
      required: true,
      defaultValue: 0.95,
      description: "Confiance de base pour les données FFA",
      helpText: "Résultats officiels FFA = très haute confiance (0.95)",
      validation: { min: 0.5, max: 1.0, step: 0.05 }
    },
    {
      name: "maxCandidates",
      label: "Nombre max de candidats",
      type: "number",
      category: "matching",
      required: true,
      defaultValue: 5,
      description: "Nombre maximum d'éditions MR candidates à proposer",
      helpText: "L'utilisateur choisira parmi ces candidats",
      validation: { required: true, min: 1, max: 10 }
    }
  ]
}
