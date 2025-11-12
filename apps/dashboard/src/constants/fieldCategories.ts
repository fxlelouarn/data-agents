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
    id: 'event-name',
    label: '', // Pas de titre visible
    iconName: '',
    description: 'Nom de l\'événement',
    entityType: 'EVENT',
    priority: 1,
    fields: [
      'name'
    ]
  },
  {
    id: 'event-location',
    label: '', // Pas de titre visible
    iconName: '',
    description: 'Localisation',
    entityType: 'EVENT',
    priority: 2,
    fields: [
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
    id: 'event-urls',
    label: '', // Pas de titre visible
    iconName: '',
    description: 'Liens web et réseaux sociaux',
    entityType: 'EVENT',
    priority: 3,
    fields: [
      'websiteUrl',
      'facebookUrl',
      'instagramUrl',
      'twitterUrl'
    ]
  },
  {
    id: 'event-media',
    label: '', // Pas de titre visible
    iconName: '',
    description: 'Images et visibilité',
    entityType: 'EVENT',
    priority: 4,
    fields: [
      'coverImage',
      'images',
      'isPrivate',
      'isFeatured',
      'isRecommended'
    ]
  },
  {
    id: 'event-metadata',
    label: '', // Pas de titre visible
    iconName: '',
    description: 'Métadonnées',
    entityType: 'EVENT',
    priority: 5,
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
    label: '', // Pas de titre visible
    iconName: '',
    description: 'Dates de l\'\u00e9dition',
    entityType: 'EDITION',
    priority: 1,
    fields: [
      'startDate',
      'endDate',
      'timeZone',
      'year'
    ]
  },
  {
    id: 'edition-registration',
    label: '', // Pas de titre visible
    iconName: '',
    description: 'Inscriptions',
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
    label: '', // Pas de titre visible
    iconName: '',
    description: 'Statut et organisation',
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
    label: '', // Pas de titre visible
    iconName: '',
    description: 'Retrait des dossards',
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
    label: '', // Pas de titre visible
    iconName: '',
    description: 'Commerce',
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
    label: '', // Pas de titre visible
    iconName: '',
    description: 'Partenariats et affiliations',
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
      // Trier les changements selon l'ordre défini dans category.fields
      categoryChanges.sort((a, b) => {
        const indexA = category.fields.indexOf(a.field)
        const indexB = category.fields.indexOf(b.field)
        return indexA - indexB
      })
      
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
