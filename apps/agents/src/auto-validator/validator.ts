/**
 * Logique de validation des propositions pour l'agent Auto-Validateur
 *
 * Ce module contient toutes les règles de validation qui déterminent
 * si une proposition peut être validée automatiquement.
 */

import { AutoValidatorConfig, ValidationResult, RaceChange } from './types'

/**
 * Valide une proposition pour déterminer si elle peut être auto-validée
 *
 * Critères de validation:
 * 1. Confiance >= minConfidence
 * 2. Event.isFeatured = false/null
 * 3. Edition.customerType = null OU proposition MR interne (justificationType: 'mr_internal')
 * 4. Pas de création de nouvelles courses (tous les raceId doivent exister)
 */
export async function validateProposal(
  proposal: any,
  sourceDb: any,
  config: AutoValidatorConfig,
  logger: any
): Promise<ValidationResult> {
  const proposalId = proposal.id
  const eventId = proposal.eventId
  const editionId = proposal.editionId
  const changes = proposal.changes as Record<string, any>

  // 1. Vérifier la confiance minimale
  if (proposal.confidence !== null && proposal.confidence !== undefined) {
    if (proposal.confidence < config.minConfidence) {
      return {
        isValid: false,
        reason: `Confiance trop basse: ${proposal.confidence} < ${config.minConfidence}`,
        exclusionReason: 'lowConfidence',
        details: {
          confidence: proposal.confidence,
          minRequired: config.minConfidence
        }
      }
    }
  }

  // 2. Vérifier Event.isFeatured
  if (eventId) {
    try {
      const event = await sourceDb.event.findUnique({
        where: { id: parseInt(eventId) },
        select: { id: true, name: true, isFeatured: true }
      })

      if (!event) {
        logger.warn(`Event ${eventId} non trouvé dans Miles Republic`)
        // On continue quand même car l'event pourrait avoir été supprimé
      } else if (event.isFeatured === true) {
        return {
          isValid: false,
          reason: `Événement featured: ${event.name}`,
          exclusionReason: 'featuredEvent',
          details: {
            eventId: event.id,
            eventName: event.name,
            isFeatured: true
          }
        }
      }
    } catch (error) {
      logger.error(`Erreur lors de la vérification de l'événement ${eventId}`, { error: String(error) })
      // En cas d'erreur, on refuse la validation automatique par sécurité
      return {
        isValid: false,
        reason: `Erreur lors de la vérification de l'événement: ${error}`,
        exclusionReason: 'featuredEvent'
      }
    }
  }

  // 3. Vérifier Edition.customerType
  // EXCEPTION: Les propositions MR internes (justificationType: 'mr_internal') sont
  // valides même pour les éditions premium car c'est notre propre donnée (comptage Attendees)
  const isMRInternalProposal = isMRInternal(proposal)

  if (editionId) {
    try {
      const edition = await sourceDb.edition.findUnique({
        where: { id: parseInt(editionId) },
        select: { id: true, customerType: true, year: true, registrantsNumber: true }
      })

      if (!edition) {
        logger.warn(`Edition ${editionId} non trouvée dans Miles Republic`)
        // On continue quand même
      } else if (edition.customerType !== null) {
        // Exception: propositions MR internes pour éditions premium
        // On accepte si:
        // - C'est une proposition MR interne (données Attendees)
        // - registrantsNumber n'est pas déjà renseigné
        // - La proposition ne modifie QUE registrantsNumber
        if (isMRInternalProposal) {
          const onlyRegistrantsNumber = isOnlyRegistrantsNumberChange(changes)

          if (edition.registrantsNumber !== null) {
            return {
              isValid: false,
              reason: `Édition premium avec registrantsNumber déjà renseigné: ${edition.registrantsNumber}`,
              exclusionReason: 'premiumCustomer',
              details: {
                editionId: edition.id,
                editionYear: edition.year,
                customerType: edition.customerType,
                existingRegistrantsNumber: edition.registrantsNumber
              }
            }
          }

          if (!onlyRegistrantsNumber) {
            return {
              isValid: false,
              reason: `Édition premium: proposition MR interne mais modifie plus que registrantsNumber`,
              exclusionReason: 'premiumCustomer',
              details: {
                editionId: edition.id,
                editionYear: edition.year,
                customerType: edition.customerType,
                changedFields: Object.keys(changes)
              }
            }
          }

          // OK: proposition MR interne, registrantsNumber vide, ne modifie que ce champ
          logger.info(`✅ Proposition MR interne acceptée pour édition premium ${edition.id}`)
        } else {
          return {
            isValid: false,
            reason: `Édition avec client premium: customerType = ${edition.customerType}`,
            exclusionReason: 'premiumCustomer',
            details: {
              editionId: edition.id,
              editionYear: edition.year,
              customerType: edition.customerType
            }
          }
        }
      }
    } catch (error) {
      logger.error(`Erreur lors de la vérification de l'édition ${editionId}`, { error: String(error) })
      return {
        isValid: false,
        reason: `Erreur lors de la vérification de l'édition: ${error}`,
        exclusionReason: 'premiumCustomer'
      }
    }
  }

  // 4. Vérifier qu'il n'y a pas de nouvelles courses
  const newRacesCheck = checkForNewRaces(changes, logger)
  if (!newRacesCheck.isValid) {
    return newRacesCheck
  }

  // Toutes les vérifications passées
  return {
    isValid: true,
    details: {
      confidence: proposal.confidence,
      eventId,
      editionId,
      hasEditionChanges: hasEditionChanges(changes),
      hasOrganizerChanges: !!changes.organizer,
      hasRaceChanges: hasRaceChanges(changes)
    }
  }
}

/**
 * Vérifie si les changements contiennent des créations de nouvelles courses
 *
 * Une course est considérée comme "nouvelle" si elle n'a pas de raceId.
 * L'agent Auto-Validateur ne peut PAS créer de nouvelles courses.
 */
function checkForNewRaces(changes: Record<string, any>, logger: any): ValidationResult {
  // Vérifier racesToAdd
  if (changes.racesToAdd) {
    const racesToAdd = changes.racesToAdd.new || changes.racesToAdd
    if (Array.isArray(racesToAdd) && racesToAdd.length > 0) {
      logger.info(`🚫 racesToAdd détecté: ${racesToAdd.length} nouvelle(s) course(s)`)
      return {
        isValid: false,
        reason: `Proposition contient ${racesToAdd.length} nouvelle(s) course(s) à créer`,
        exclusionReason: 'newRaces',
        details: {
          newRacesCount: racesToAdd.length,
          newRaces: racesToAdd.map((r: any) => r.name || 'Unknown')
        }
      }
    }
  }

  // Vérifier racesToUpdate pour des courses sans raceId
  if (changes.racesToUpdate) {
    const racesToUpdate = changes.racesToUpdate.new || changes.racesToUpdate
    if (Array.isArray(racesToUpdate)) {
      const racesWithoutId = racesToUpdate.filter((race: RaceChange) => !race.raceId)
      if (racesWithoutId.length > 0) {
        logger.info(`🚫 Courses sans raceId dans racesToUpdate: ${racesWithoutId.length}`)
        return {
          isValid: false,
          reason: `Proposition contient ${racesWithoutId.length} course(s) sans raceId`,
          exclusionReason: 'newRaces',
          details: {
            racesWithoutIdCount: racesWithoutId.length,
            races: racesWithoutId.map((r: RaceChange) => r.raceName || 'Unknown')
          }
        }
      }
    }
  }

  // Vérifier le champ races (format legacy ou NEW_EVENT)
  if (changes.races) {
    const races = changes.races.new || changes.races
    if (Array.isArray(races)) {
      // Dans ce format, les courses sans ID sont des créations
      const newRaces = races.filter((race: any) => !race.id && !race.raceId)
      if (newRaces.length > 0) {
        logger.info(`🚫 Nouvelles courses dans changes.races: ${newRaces.length}`)
        return {
          isValid: false,
          reason: `Proposition contient ${newRaces.length} nouvelle(s) course(s)`,
          exclusionReason: 'newRaces',
          details: {
            newRacesCount: newRaces.length,
            races: newRaces.map((r: any) => r.name || 'Unknown')
          }
        }
      }
    }
  }

  return { isValid: true }
}

/**
 * Vérifie si les changements contiennent des modifications d'édition
 */
function hasEditionChanges(changes: Record<string, any>): boolean {
  const editionFields = [
    'startDate', 'endDate', 'calendarStatus', 'timeZone',
    'registrationClosingDate', 'registrationOpeningDate', 'year'
  ]
  return editionFields.some(field => changes[field] !== undefined)
}

/**
 * Vérifie si les changements contiennent des modifications de courses
 */
function hasRaceChanges(changes: Record<string, any>): boolean {
  return !!(changes.racesToUpdate || changes.races || changes.racesToDelete)
}

/**
 * Détermine les blocs qui peuvent être validés pour une proposition
 */
export function getValidatableBlocks(
  changes: Record<string, any>,
  config: AutoValidatorConfig
): string[] {
  const blocks: string[] = []

  // Bloc edition
  if (config.enableEditionBlock && hasEditionChanges(changes)) {
    blocks.push('edition')
  }

  // Bloc organizer
  if (config.enableOrganizerBlock && changes.organizer) {
    blocks.push('organizer')
  }

  // Bloc races (seulement updates, pas de nouvelles courses)
  if (config.enableRacesBlock && hasRaceChanges(changes)) {
    // Double check: pas de nouvelles courses
    const hasNewRaces = changes.racesToAdd ||
      (changes.races && Array.isArray(changes.races.new || changes.races) &&
        (changes.races.new || changes.races).some((r: any) => !r.id && !r.raceId))

    if (!hasNewRaces) {
      blocks.push('races')
    }
  }

  return blocks
}

/**
 * Vérifie si une proposition provient de données MR internes (comptage Attendees)
 * Ces propositions sont identifiées par justificationType: 'mr_internal'
 */
function isMRInternal(proposal: any): boolean {
  const justification = proposal.justification
  if (!Array.isArray(justification)) return false

  return justification.some((j: any) =>
    j.metadata?.justificationType === 'mr_internal'
  )
}

/**
 * Vérifie si les changements ne contiennent QUE registrantsNumber
 * Utilisé pour les propositions MR internes sur éditions premium
 */
function isOnlyRegistrantsNumberChange(changes: Record<string, any>): boolean {
  const keys = Object.keys(changes)
  return keys.length === 1 && keys[0] === 'registrantsNumber'
}
