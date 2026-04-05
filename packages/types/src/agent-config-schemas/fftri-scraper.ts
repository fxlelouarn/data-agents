import { ConfigSchema } from '../config.js'

export const FFTRIScraperAgentConfigSchema: ConfigSchema = {
  title: "Configuration FFTRI Scraper Agent",
  description: "Agent qui scrape le calendrier FFTRI pour extraire les événements de triathlon/multisport",
  categories: [
    {
      id: "database",
      label: "Base de données",
      description: "Configuration de la source de données"
    },
    {
      id: "scraping",
      label: "Scraping",
      description: "Paramètres de scraping du calendrier FFTRI"
    },
    {
      id: "matching",
      label: "Matching",
      description: "Configuration du matching avec Miles Republic"
    },
    {
      id: "advanced",
      label: "Avancé",
      description: "Options avancées"
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
      helpText: "Base de données contenant les événements existants pour le matching",
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
      validation: { required: true, min: 1, max: 18 }
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
      name: "scrapingWindowMonths",
      label: "Fenêtre de scraping (mois)",
      type: "number",
      category: "scraping",
      required: true,
      defaultValue: 6,
      description: "Fenêtre temporelle à scraper (mois dans le futur)",
      helpText: "Ex: 6 = scraper les 6 prochains mois",
      validation: { required: true, min: 1, max: 24 }
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

    // Matching
    {
      name: "similarityThreshold",
      label: "Seuil de similarité",
      type: "slider",
      category: "matching",
      required: true,
      defaultValue: 0.75,
      description: "Seuil minimum de similarité pour matcher un événement",
      helpText: "75% = correspondance acceptable, 90% = correspondance forte",
      validation: { min: 0.5, max: 1.0, step: 0.05 }
    },
    {
      name: "distanceTolerancePercent",
      label: "Tolérance distance",
      type: "slider",
      category: "matching",
      required: true,
      defaultValue: 0.1,
      description: "Tolérance pour matcher les distances de courses (décimal: 0.1 = 10%)",
      helpText: "0.1 = 10% de tolérance (ex: 10km FFTRI match avec 9-11km DB)",
      validation: { min: 0, max: 0.5, step: 0.05 }
    },

    // Avancé
    {
      name: "confidenceBase",
      label: "Confiance de base",
      type: "slider",
      category: "advanced",
      required: true,
      defaultValue: 0.9,
      description: "Confiance de base pour les données FFTRI",
      helpText: "Données officielles FFTRI = haute confiance (0.9)",
      validation: { min: 0.5, max: 1.0, step: 0.05 }
    },
    {
      name: "maxEventsPerMonth",
      label: "Événements max par mois",
      type: "number",
      category: "advanced",
      required: false,
      defaultValue: 200,
      description: "Limite le nombre d'événements à traiter par mois",
      helpText: "Sécurité pour éviter les boucles infinies",
      validation: { min: 10, max: 1000 }
    }
  ]
}
