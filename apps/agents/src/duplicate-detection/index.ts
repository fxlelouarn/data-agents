/**
 * Duplicate Detection Module
 *
 * Exports for the duplicate detection functionality
 */

// Scoring
export {
  calculateNameScore,
  calculateLocationScore,
  calculateDateScore,
  calculateCategoryScore,
  calculateDuplicateScore,
  chooseKeepEvent,
  haversineDistance,
  DEFAULT_SCORING_CONFIG,
  type DuplicateScoringConfig,
  type DuplicateScore,
  type EventForScoring,
  type EditionForScoring,
  type RaceForScoring
} from './scoring'

// Candidates
export {
  findCandidateEvents,
  getPairKey,
  hasExistingMergeProposal,
  DEFAULT_CANDIDATE_CONFIG,
  type CandidateSearchConfig,
  type CandidateLogger
} from './candidates'
