export interface FieldCategory {
  id: string
  label: string
  iconName?: string // Nom de l'icône MUI
  description?: string
  fields: string[]
  priority: number // Pour l'ordre d'affichage
  entityType: 'EVENT' | 'EDITION' | 'RACE'
}

// ========================================
// EVENT CATEGORIES
// ========================================
export const EVENT_CATEGORIES: FieldCategory[] = [
  {
    id: 'event-basic',
    label: 'Informations de base',
    iconName: 'Info',
    description: 'Nom, localisation et adresse',
    entityType: 'EVENT',
    priority: 1,
    fields: [
      'name',
      'city',
      'country',
      'countrySubdivisionNameLevel1',
      'countrySubdivisionNameLevel2',
      'countrySubdivisionDisplayCodeLevel1',
      'countrySubdivisionDisplayCodeLevel2',
      'fullAddress',
      'latitude',
      'longitude'
    ]
  },
  {
    id: 'event-media',
    label: 'Médias et visibilité',
    iconName: 'Language',
    description: 'Site web, réseaux sociaux et images',
    entityType: 'EVENT',
    priority: 2,
    fields: [
      'websiteUrl',
      'facebookUrl',
      'instagramUrl',
      'twitterUrl',
      'coverImage',
      'images',
      'isPrivate',
      'isFeatured',
      'isRecommended'
    ]
  },
  {
    id: 'event-metadata',
    label: 'Métadonnées',
    iconName: 'Storage',
    description: 'Source des données et statut',
    entityType: 'EVENT',
    priority: 3,
    fields: [
      'dataSource',
      'status'
    ]
  }
]

// ========================================
// EDITION CATEGORIES
// ========================================
export const EDITION_CATEGORIES: FieldCategory[] = [
  {
    id: 'edition-dates',
    label: 'Dates de l\'édition',
    iconName: 'Event',
    description: 'Dates de début, fin et fuseau horaire',
    entityType: 'EDITION',
    priority: 1,
    fields: [
      'year',
      'startDate',
      'endDate',
      'timeZone'
    ]
  },
  {
    id: 'edition-registration',
    label: 'Inscriptions',
    iconName: 'PersonAdd',
    description: 'Dates d\'ouverture/fermeture et nombre d\'inscrits',
    entityType: 'EDITION',
    priority: 2,
    fields: [
      'registrationOpeningDate',
      'registrationClosingDate',
      'registrantsNumber'
    ]
  },
  {
    id: 'edition-status',
    label: 'Statut et organisation',
    iconName: 'Work',
    description: 'Statut calendrier, client et type',
    entityType: 'EDITION',
    priority: 3,
    fields: [
      'calendarStatus',
      'clientStatus',
      'customerType'
    ]
  },
  {
    id: 'edition-bib-withdrawal',
    label: 'Retrait des dossards',
    iconName: 'LocalShipping',
    description: 'Lieu et informations de retrait',
    entityType: 'EDITION',
    priority: 4,
    fields: [
      'bibWithdrawalFullAddress',
      'bibWithdrawalStreet',
      'bibWithdrawalPostalCode',
      'bibWithdrawalCity',
      'bibWithdrawalCountry',
      'bibWithdrawalLongitude',
      'bibWithdrawalLatitude',
      'bibWithdrawalInfo'
    ]
  },
  {
    id: 'edition-commerce',
    label: 'Commerce',
    iconName: 'AttachMoney',
    description: 'Devise, assurance et inclusions',
    entityType: 'EDITION',
    priority: 5,
    fields: [
      'currency',
      'hasInsurance',
      'whatIsIncluded',
      'medusaVersion',
      'organizerStripeConnectedAccountId'
    ]
  },
  {
    id: 'edition-partnerships',
    label: 'Partenariats et affiliations',
    iconName: 'Handshake',
    description: 'Fédération et règlement',
    entityType: 'EDITION',
    priority: 6,
    fields: [
      'federationId',
      'generalRulesUrl'
    ]
  }
]

// ========================================
// RACE CATEGORIES
// ========================================
export const RACE_CATEGORIES: FieldCategory[] = [
  {
    id: 'race-basic',
    label: 'Informations de base',
    iconName: 'Info',
    description: 'Nom et date de départ',
    entityType: 'RACE',
    priority: 1,
    fields: [
      'name',
      'startDate',
      'timeZone'
    ]
  },
  {
    id: 'race-distances',
    label: 'Distances',
    iconName: 'Straighten',
    description: 'Distances natation, vélo, course, etc.',
    entityType: 'RACE',
    priority: 2,
    fields: [
      'swimDistance',
      'bikeDistance',
      'runDistance',
      'runDistance2',
      'walkDistance',
      'swimRunDistance',
      'bikeRunDistance'
    ]
  },
  {
    id: 'race-elevations',
    label: 'Dénivelés',
    iconName: 'Terrain',
    description: 'Dénivelés positifs et négatifs',
    entityType: 'RACE',
    priority: 3,
    fields: [
      'runPositiveElevation',
      'runNegativeElevation',
      'bikePositiveElevation',
      'bikeNegativeElevation',
      'walkPositiveElevation',
      'walkNegativeElevation'
    ]
  },
  {
    id: 'race-classification',
    label: 'Classification',
    iconName: 'Category',
    description: 'Type et catégorie de course',
    entityType: 'RACE',
    priority: 4,
    fields: [
      'distance',
      'type',
      'distanceCategory',
      'categoryLevel1',
      'categoryLevel2'
    ]
  },
  {
    id: 'race-pricing',
    label: 'Tarification',
    iconName: 'EuroSymbol',
    description: 'Prix et type de paiement',
    entityType: 'RACE',
    priority: 5,
    fields: [
      'price',
      'priceType',
      'paymentCollectionType'
    ]
  },
  {
    id: 'race-teams',
    label: 'Équipes',
    iconName: 'Groups',
    description: 'Taille min/max des équipes',
    entityType: 'RACE',
    priority: 6,
    fields: [
      'maxTeamSize',
      'minTeamSize'
    ]
  },
  {
    id: 'race-licenses',
    label: 'Licences et justificatifs',
    iconName: 'Badge',
    description: 'Type de licence et justificatifs requis',
    entityType: 'RACE',
    priority: 7,
    fields: [
      'licenseNumberType',
      'adultJustificativeOptions',
      'minorJustificativeOptions'
    ]
  },
  {
    id: 'race-forms',
    label: 'Formulaires et inscriptions',
    iconName: 'Assignment',
    description: 'Champs demandés lors de l\'inscription',
    entityType: 'RACE',
    priority: 8,
    fields: [
      'askAttendeeBirthDate',
      'askAttendeeGender',
      'askAttendeeNationality',
      'askAttendeePhoneNumber',
      'askAttendeePostalAddress',
      'showClubOrAssoInput',
      'showPublicationConsentCheckbox'
    ]
  },
  {
    id: 'race-stock',
    label: 'Stock et disponibilité',
    iconName: 'Inventory',
    description: 'Gestion du stock et disponibilité',
    entityType: 'RACE',
    priority: 9,
    fields: [
      'isActive',
      'isArchived',
      'isWaitingList',
      'stockDisplayThreshold',
      'stockDisplayThresholdValue',
      'resaleEnabled'
    ]
  },
  {
    id: 'race-integrations',
    label: 'Intégrations externes',
    iconName: 'Link',
    description: 'URLs et IDs externes',
    entityType: 'RACE',
    priority: 10,
    fields: [
      'externalFunnelURL',
      'medusaProductId',
      'raceVariantStoreId'
    ]
  }
]

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Récupère toutes les catégories pour un type d'entité donné
 */
export function getCategoriesForEntityType(entityType: 'EVENT' | 'EDITION' | 'RACE'): FieldCategory[] {
  switch (entityType) {
    case 'EVENT':
      return EVENT_CATEGORIES
    case 'EDITION':
      return EDITION_CATEGORIES
    case 'RACE':
      return RACE_CATEGORIES
    default:
      return []
  }
}

/**
 * Récupère la catégorie d'un champ donné
 */
export function getCategoryForField(fieldName: string, entityType: 'EVENT' | 'EDITION' | 'RACE'): FieldCategory | undefined {
  const categories = getCategoriesForEntityType(entityType)
  return categories.find(cat => cat.fields.includes(fieldName))
}

/**
 * Groupe les changements par catégorie
 * Ne retourne que les catégories qui ont des changements
 */
export function groupChangesByCategory<T extends { field: string }>(
  changes: T[],
  entityType: 'EVENT' | 'EDITION' | 'RACE'
): Array<{ category: FieldCategory; changes: T[] }> {
  const categories = getCategoriesForEntityType(entityType)
  const grouped: Array<{ category: FieldCategory; changes: T[] }> = []

  for (const category of categories) {
    const categoryChanges = changes.filter(change => category.fields.includes(change.field))
    
    // Ne retourner que les catégories qui ont des changements
    if (categoryChanges.length > 0) {
      grouped.push({ category, changes: categoryChanges })
    }
  }

  return grouped
}

/**
 * Détermine si un champ appartient à une entité donnée
 */
export function isFieldOfEntityType(fieldName: string, entityType: 'EVENT' | 'EDITION' | 'RACE'): boolean {
  const categories = getCategoriesForEntityType(entityType)
  return categories.some(cat => cat.fields.includes(fieldName))
}
