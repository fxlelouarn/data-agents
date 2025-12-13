/**
 * Types partagés pour les agents et le dashboard
 * Ces types définissent les contrats obligatoires entre les agents et l'application
 */

// Source metadata
export {
  SourceMetadata,
  SourceMetadataExtra,
  SourceType,
  createSourceMetadata
} from './source-metadata'

// Justifications
export {
  Justification,
  JustificationMetadata,
  JustificationType,
  RejectedMatch,
  createRejectedMatchesJustification,
  createUrlSourceJustification,
  createMatchingJustification
} from './justification'
