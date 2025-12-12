import { ConfigSchema } from '../config.js'

export const AutoValidatorAgentConfigSchema: ConfigSchema = {
  title: "Configuration Auto Validator Agent",
  description: "Agent qui valide automatiquement les propositions FFA sous certaines conditions",
  categories: [
    {
      id: "validation",
      label: "Validation",
      description: "Critères de validation automatique"
    },
    {
      id: "blocks",
      label: "Blocs",
      description: "Blocs à valider automatiquement"
    },
    {
      id: "advanced",
      label: "Avancé",
      description: "Options avancées"
    }
  ],
  fields: [
    // === Catégorie: Validation ===
    {
      name: "milesRepublicDatabase",
      label: "Base Miles Republic",
      type: "select",
      category: "validation",
      required: true,
      description: "Connexion à Miles Republic pour vérifier les critères",
      helpText: "Utilisée pour vérifier isFeatured et customerType",
      options: [],
      validation: { required: true }
    },
    {
      name: "minConfidence",
      label: "Confiance minimale",
      type: "slider",
      category: "validation",
      required: true,
      defaultValue: 0.7,
      description: "Confiance minimale requise pour auto-valider",
      helpText: "Les propositions avec une confiance inférieure seront ignorées (0.5 = permissif, 0.9 = strict)",
      validation: { min: 0.5, max: 1.0, step: 0.05 }
    },
    {
      name: "maxProposalsPerRun",
      label: "Propositions max par run",
      type: "number",
      category: "validation",
      required: true,
      defaultValue: 100,
      description: "Nombre maximum de propositions à traiter par exécution",
      helpText: "Limite pour éviter les runs trop longs",
      validation: { required: true, min: 10, max: 500 }
    },

    // === Catégorie: Blocs ===
    {
      name: "enableEditionBlock",
      label: "Valider bloc Edition",
      type: "switch",
      category: "blocks",
      required: false,
      defaultValue: true,
      description: "Valider automatiquement les modifications d'édition",
      helpText: "Dates, URLs, infos générales de l'édition"
    },
    {
      name: "enableOrganizerBlock",
      label: "Valider bloc Organisateur",
      type: "switch",
      category: "blocks",
      required: false,
      defaultValue: true,
      description: "Valider automatiquement les modifications d'organisateur",
      helpText: "Nom, contact, URLs de l'organisateur"
    },
    {
      name: "enableRacesBlock",
      label: "Valider bloc Courses",
      type: "switch",
      category: "blocks",
      required: false,
      defaultValue: true,
      description: "Valider automatiquement les modifications de courses existantes",
      helpText: "Ne crée jamais de nouvelles courses - uniquement les mises à jour"
    },

    // === Catégorie: Avancé ===
    {
      name: "dryRun",
      label: "Mode simulation",
      type: "switch",
      category: "advanced",
      required: false,
      defaultValue: false,
      description: "Simuler sans appliquer les validations",
      helpText: "Utile pour tester la configuration avant activation"
    }
  ]
}
