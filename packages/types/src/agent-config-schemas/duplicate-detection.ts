import { ConfigSchema } from '../config.js'

export const DuplicateDetectionAgentConfigSchema: ConfigSchema = {
  title: "Configuration Duplicate Detection Agent",
  description: "Agent qui détecte automatiquement les événements doublons dans Miles Republic",
  categories: [
    {
      id: "database",
      label: "Base de données",
      description: "Configuration de la source de données"
    },
    {
      id: "detection",
      label: "Détection",
      description: "Paramètres de détection des doublons"
    },
    {
      id: "weights",
      label: "Pondération",
      description: "Poids des différents critères de scoring"
    },
    {
      id: "performance",
      label: "Performance",
      description: "Options de performance et batching"
    },
    {
      id: "notifications",
      label: "Notifications",
      description: "Options de notification"
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
      description: "Base de données Miles Republic à analyser",
      helpText: "Base de données contenant les événements à vérifier",
      options: [],
      validation: { required: true }
    },

    // Détection
    {
      name: "minDuplicateScore",
      label: "Score minimum pour doublon",
      type: "slider",
      category: "detection",
      required: true,
      defaultValue: 0.80,
      description: "Score minimum (0-1) pour créer une proposition de fusion",
      helpText: "0.80 = recommandé, 0.90 = très strict (moins de faux positifs)",
      validation: { min: 0.5, max: 1.0, step: 0.05 }
    },
    {
      name: "maxDistanceKm",
      label: "Distance max (km)",
      type: "number",
      category: "detection",
      required: true,
      defaultValue: 15,
      description: "Distance maximum entre deux événements pour être considérés proches",
      helpText: "Utilisé si les coordonnées GPS sont disponibles",
      validation: { min: 1, max: 50 }
    },
    {
      name: "dateToleranceDays",
      label: "Tolérance date (jours)",
      type: "number",
      category: "detection",
      required: true,
      defaultValue: 30,
      description: "Écart maximum en jours entre les dates d'édition",
      helpText: "30 jours = recommandé pour les événements annuels",
      validation: { min: 7, max: 90 }
    },
    {
      name: "excludeStatuses",
      label: "Statuts à exclure",
      type: "text",
      category: "detection",
      required: false,
      defaultValue: "",
      description: "Statuts d'événements à ignorer (séparés par virgule)",
      helpText: "Ex: DRAFT,REVIEW pour n'analyser que les événements LIVE"
    },

    // Pondération
    {
      name: "nameWeight",
      label: "Poids du nom",
      type: "slider",
      category: "weights",
      required: true,
      defaultValue: 0.40,
      description: "Importance de la similarité de nom dans le score",
      helpText: "40% = recommandé, le nom est le critère principal",
      validation: { min: 0.1, max: 0.6, step: 0.05 }
    },
    {
      name: "locationWeight",
      label: "Poids de la localisation",
      type: "slider",
      category: "weights",
      required: true,
      defaultValue: 0.30,
      description: "Importance de la proximité géographique",
      helpText: "30% = recommandé, vérifie ville/département/coordonnées",
      validation: { min: 0.1, max: 0.5, step: 0.05 }
    },
    {
      name: "dateWeight",
      label: "Poids de la date",
      type: "slider",
      category: "weights",
      required: true,
      defaultValue: 0.20,
      description: "Importance de la proximité temporelle des éditions",
      helpText: "20% = recommandé, compare les dates des éditions",
      validation: { min: 0.1, max: 0.4, step: 0.05 }
    },
    {
      name: "categoryWeight",
      label: "Poids des catégories",
      type: "slider",
      category: "weights",
      required: true,
      defaultValue: 0.10,
      description: "Importance du chevauchement des types de courses",
      helpText: "10% = recommandé, compare RUNNING/TRAIL/etc.",
      validation: { min: 0.0, max: 0.3, step: 0.05 }
    },

    // Performance
    {
      name: "batchSize",
      label: "Taille des lots",
      type: "number",
      category: "performance",
      required: true,
      defaultValue: 100,
      description: "Nombre d'événements à traiter par exécution",
      helpText: "100 = recommandé, augmenter si runs fréquents",
      validation: { min: 10, max: 500 }
    },
    {
      name: "rescanDelayDays",
      label: "Délai avant rescan (jours)",
      type: "number",
      category: "performance",
      required: true,
      defaultValue: 30,
      description: "Nombre de jours avant de re-analyser un événement",
      helpText: "30 = recommandé, évite d'analyser les mêmes événements trop souvent",
      validation: { min: 7, max: 180 }
    },
    {
      name: "useMeilisearch",
      label: "Utiliser Meilisearch",
      type: "switch",
      category: "performance",
      required: false,
      defaultValue: true,
      description: "Utiliser Meilisearch pour la recherche de candidats",
      helpText: "Plus rapide si Meilisearch est configuré, sinon fallback SQL"
    },
    {
      name: "dryRun",
      label: "Mode simulation",
      type: "switch",
      category: "performance",
      required: false,
      defaultValue: false,
      description: "Analyser sans créer de propositions",
      helpText: "Utile pour tester la configuration avant de créer des propositions"
    },

    // Notifications
    {
      name: "notifySlack",
      label: "Notifier sur Slack",
      type: "switch",
      category: "notifications",
      required: false,
      defaultValue: false,
      description: "Envoyer un résumé des doublons détectés sur Slack",
      helpText: "Nécessite une configuration Slack active"
    }
  ]
}
