/**
 * Service d'enrichissement des courses
 *
 * Fournit des fonctions pour :
 * - Inférer les catégories (categoryLevel1, categoryLevel2)
 * - Normaliser les noms de courses
 * - Obtenir les labels de catégories
 */

// Inférence de catégories
export { inferRaceCategories, enrichRaceCategories } from './category-inference'
export type { RaceEnrichmentInput, EnrichedRaceCategories } from './category-inference'

// Normalisation des noms
export {
  normalizeRaceName,
  cleanRaceName,
  normalizeRaceNameWithCategory,
  getCategoryLabel,
} from './race-normalizer'
