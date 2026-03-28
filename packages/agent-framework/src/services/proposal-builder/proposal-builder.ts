/**
 * Shared proposal builder functions.
 *
 * Produces the changes objects used in Proposal.changes for NEW_EVENT
 * and EDITION_UPDATE proposals. Both the FFA agent and the Slack agent
 * converge on this shared implementation.
 */

import {
  assignDistanceByCategory,
  calculateEditionDates,
  calculateRaceStartDate,
  cascadeDateToRace,
  classifyOrganizerUrl,
  inferAndAssignCategories,
  isMidnightInTimezone,
  isSameDateInTimezone,
} from './race-utils'
import { matchRaces, RaceMatchLLMContext } from '../event-matching'
import type { ProposalInput, ProposalRaceInput } from '@data-agents/types'

// ---------------------------------------------------------------------------
// cleanEventNameForCreation
// ---------------------------------------------------------------------------

/**
 * Cleans an event name for NEW_EVENT creation by removing edition-specific
 * elements that won't survive to the next edition.
 *
 * Examples:
 *   "5è édition du Trail des Loups"        → "Trail des Loups"
 *   "Marathon de Paris 2026"                → "Marathon de Paris"
 *   "3ème Trail du Mont Blanc 2025"         → "Trail du Mont Blanc"
 *   "XXIIe semi-marathon de Boulogne"       → "Semi-marathon de Boulogne"
 *   "10e course des remparts"               → "Course des remparts"
 *   "La 2ème édition de la course du lac"   → "La course du lac"
 *   "Trail n°8"                             → "Trail"
 */
export function cleanEventNameForCreation(name: string): string {
  let cleaned = name.trim()

  // Remove "Nè/ème/e/ères/èmes édition (de/du/des/de la/de l')" patterns
  // Handles: "5è édition du", "3ème édition de la", "1ère édition", "10e édition de l'"
  // Also handles spaces: "7 ème Edition", casing: "5Eme Edition"
  cleaned = cleaned.replace(/\d+\s*[èe]?r?[èe]?m?e?s?\s+(?:é|e)dition\s+(?:de\s+la\s+|de\s+l['']|du\s+|des\s+|de\s+|d[''])?/gi, '')

  // Remove standalone "Nè/ème/e édition" without preposition
  cleaned = cleaned.replace(/\d+\s*[èe]?r?[èe]?m?e?s?\s+(?:é|e)dition/gi, '')

  // Remove "édition" preceded by nothing useful (e.g. leftover "Edition Officielle" → "Officielle")
  // but only when it's the start of the string or after a separator
  cleaned = cleaned.replace(/(?:^|[-–—\s])(?:é|e)dition\b/gi, '')

  // Remove Roman numeral editions: "XXIIe", "IVème édition (du/de la/...)"
  cleaned = cleaned.replace(/\b[IVXLCDM]{2,}[èe]?r?[èe]?m?e?s?\s*(?:(?:é|e)dition\s*(?:de\s+la\s+|de\s+l['']|du\s+|des\s+|de\s+|d[''])?)?/gi, '')

  // Remove years (2020-2039)
  cleaned = cleaned.replace(/\b20[2-3]\d\b/g, '')

  // Remove "n°N" or "N°N" patterns (e.g. "Trail n°8")
  cleaned = cleaned.replace(/\bn°\s*\d+\b/gi, '')

  // Remove standalone ordinals: "3ème", "15èMes", "1ère", "39èmes"
  // Must be followed by a space or end-of-string, and not part of a word
  cleaned = cleaned.replace(/\b\d+\s*[èe]r?[èe]?m?e?s?\b/gi, '')

  // Clean up leftover punctuation: dangling dashes, colons, pipes
  cleaned = cleaned.replace(/\s*[-–—:|]\s*$/g, '')
  cleaned = cleaned.replace(/^\s*[-–—:|]\s*/g, '')

  // Collapse multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ')

  // Clean leading/trailing dashes, slashes, spaces
  cleaned = cleaned.replace(/^[-–/\s]+|[-–/\s]+$/g, '')

  return cleaned.trim()
}

// ---------------------------------------------------------------------------
// buildNewEventChanges
// ---------------------------------------------------------------------------

/**
 * Builds the `changes` object for a NEW_EVENT proposal.
 *
 * Output structure mirrors the FFA Scraper implementation:
 * - Top-level event fields with { new, confidence }
 * - `edition.new` containing year, dates, timezone, races and optional organizer
 */
export function buildNewEventChanges(input: ProposalInput): Record<string, any> {
  const confidence = input.confidence
  const timeZone = input.timeZone || 'Europe/Paris'

  // Enrich races with categories
  const enrichedRaces: ProposalRaceInput[] = (input.races || []).map(race =>
    inferAndAssignCategories(race, input.eventName)
  )

  // Calculate edition start / end dates from race times
  const editionDate = input.editionDate || ''
  const { startDate: editionStartDate, endDate: editionEndDate } =
    editionDate
      ? calculateEditionDates(enrichedRaces, editionDate, timeZone)
      : { startDate: undefined, endDate: undefined }

  // Build edition.new.races
  const races = enrichedRaces.map(race => {
    const startDate = calculateRaceStartDate(editionDate, race.startTime, timeZone, race.raceDate)
    const distanceFields = race.distance
      ? assignDistanceByCategory(race.distance, race.categoryLevel1)
      : {}

    // Elevation field key depends on category
    const elevationFields: Record<string, any> = {}
    if (race.elevation !== undefined) {
      if (race.categoryLevel1 === 'WALK') {
        elevationFields.walkPositiveElevation = race.elevation
      } else if (race.categoryLevel1 === 'CYCLING') {
        elevationFields.bikePositiveElevation = race.elevation
      } else {
        elevationFields.runPositiveElevation = race.elevation
      }
    }

    const raceObj: Record<string, any> = {
      name: race.name,
      startDate,
      startTime: race.startTime,
      ...distanceFields,
      ...elevationFields,
      categoryLevel1: race.categoryLevel1,
      categoryLevel2: race.categoryLevel2,
      timeZone,
    }

    // Add price if present
    if (race.price !== undefined) {
      raceObj.price = race.price
    }

    // Remove undefined values
    for (const key of Object.keys(raceObj)) {
      if (raceObj[key] === undefined) {
        delete raceObj[key]
      }
    }

    return raceObj
  })

  // Build edition.new
  const editionNew: Record<string, any> = {
    year: input.editionYear?.toString() || (editionDate ? editionDate.substring(0, 4) : undefined),
    startDate: editionStartDate,
    endDate: editionEndDate,
    timeZone,
  }

  if (input.calendarStatus) {
    editionNew.calendarStatus = input.calendarStatus
  }

  // Organizer
  if (input.organizer) {
    const org = input.organizer
    const orgObj: Record<string, any> = {}
    if (org.name) orgObj.name = org.name
    if (org.email) orgObj.email = org.email
    if (org.phone) orgObj.phone = org.phone
    if (org.facebookUrl) orgObj.facebookUrl = org.facebookUrl
    if (org.instagramUrl) orgObj.instagramUrl = org.instagramUrl

    // Classify websiteUrl into the right field
    if (org.websiteUrl) {
      const classified = classifyOrganizerUrl(org.websiteUrl)
      Object.assign(orgObj, classified)
    }

    if (Object.keys(orgObj).length > 0) {
      editionNew.organizer = orgObj
    }
  }

  if (races.length > 0) {
    editionNew.races = races
  }

  if (input.registrationUrl) {
    editionNew.registrationUrl = input.registrationUrl
  }

  if (input.registrationClosingDate) {
    editionNew.registrationClosingDate = input.registrationClosingDate
  }

  // Build top-level changes
  const changes: Record<string, any> = {
    name: { new: cleanEventNameForCreation(input.eventName), confidence },
    city: { new: input.eventCity, confidence },
    country: { new: input.eventCountry || 'France', confidence },
  }

  // Subdivision fields (only if provided)
  if (input.countrySubdivisionNameLevel1) {
    changes.countrySubdivisionNameLevel1 = { new: input.countrySubdivisionNameLevel1, confidence }
  }
  if (input.countrySubdivisionDisplayCodeLevel1) {
    changes.countrySubdivisionDisplayCodeLevel1 = {
      new: input.countrySubdivisionDisplayCodeLevel1,
      confidence,
    }
  }
  if (input.countrySubdivisionNameLevel2) {
    changes.countrySubdivisionNameLevel2 = { new: input.countrySubdivisionNameLevel2, confidence }
  }
  if (input.countrySubdivisionDisplayCodeLevel2) {
    changes.countrySubdivisionDisplayCodeLevel2 = {
      new: input.countrySubdivisionDisplayCodeLevel2,
      confidence,
    }
  }

  // Optional top-level fields
  if (input.websiteUrl) {
    const classified = classifyOrganizerUrl(input.websiteUrl)
    // websiteUrl at event level
    if (classified.websiteUrl) changes.websiteUrl = { new: classified.websiteUrl, confidence }
    if (classified.facebookUrl) changes.facebookUrl = { new: classified.facebookUrl, confidence }
    if (classified.instagramUrl) changes.instagramUrl = { new: classified.instagramUrl, confidence }
  }

  if (input.dataSource) {
    changes.dataSource = { new: input.dataSource, confidence }
  }

  changes.edition = { new: editionNew, confidence }

  return changes
}

// ---------------------------------------------------------------------------
// buildEditionUpdateChanges
// ---------------------------------------------------------------------------

/**
 * Builds the `changes` object for an EDITION_UPDATE proposal.
 *
 * @param input         - Normalized input from any agent
 * @param matchResult   - Result from matchEvent() with edition and event data
 * @param existingRaces - List of existing DB races for this edition
 * @param matchedRaces  - Pre-computed race matching result (optional).
 *                        If provided, skips calling matchRaces() automatically.
 *                        Use this when the caller (e.g. FFA agent) has already
 *                        performed its own race-matching logic.
 */
export async function buildEditionUpdateChanges(
  input: ProposalInput,
  matchResult: any,
  existingRaces: any[],
  matchedRaces?: {
    matched: Array<{ input: any; db: any }>
    unmatched: any[]
  },
  llmContext?: RaceMatchLLMContext
): Promise<Record<string, any>> {
  const changes: Record<string, any> = {}
  const timeZone = input.timeZone || 'Europe/Paris'
  const editionDate = input.editionDate || ''

  // -------------------------------------------------------------------------
  // 1. Date comparison with 6h tolerance
  // -------------------------------------------------------------------------
  if (editionDate) {
    const enrichedRaces: ProposalRaceInput[] = (input.races || []).map(race =>
      inferAndAssignCategories(race, input.eventName)
    )
    const { startDate: newStartDate, endDate: newEndDate } = calculateEditionDates(
      enrichedRaces,
      editionDate,
      timeZone
    )

    if (matchResult.edition?.startDate) {
      const existingStartDate = new Date(matchResult.edition.startDate)
      const diff = Math.abs(newStartDate.getTime() - existingStartDate.getTime())
      if (diff > 6 * 3600 * 1000) {
        changes.startDate = { old: existingStartDate, new: newStartDate }
        changes.endDate = {
          old: matchResult.edition.endDate ? new Date(matchResult.edition.endDate) : null,
          new: newEndDate,
        }
      }
    } else if (!matchResult.edition?.startDate) {
      // No existing date — propose the new one
      changes.startDate = { old: null, new: newStartDate }
      changes.endDate = { old: null, new: newEndDate }
    }
  }

  // -------------------------------------------------------------------------
  // 2. Timezone
  // -------------------------------------------------------------------------
  const existingTZ = matchResult.edition?.timeZone || null
  if (existingTZ !== timeZone) {
    changes.timeZone = { old: existingTZ, new: timeZone }
  }

  // -------------------------------------------------------------------------
  // 3. Calendar status
  // -------------------------------------------------------------------------
  if (input.calendarStatus && matchResult.edition?.calendarStatus !== input.calendarStatus) {
    changes.calendarStatus = {
      old: matchResult.edition?.calendarStatus || null,
      new: input.calendarStatus,
    }
  }

  // -------------------------------------------------------------------------
  // 4. Registration closing date
  // -------------------------------------------------------------------------
  if (input.registrationClosingDate) {
    const newClosingDate = new Date(input.registrationClosingDate)
    const existingClosingDate = matchResult.edition?.registrationClosingDate
      ? new Date(matchResult.edition.registrationClosingDate)
      : null
    if (
      !existingClosingDate ||
      Math.abs(newClosingDate.getTime() - existingClosingDate.getTime()) > 3600 * 1000
    ) {
      changes.registrationClosingDate = {
        old: existingClosingDate,
        new: newClosingDate,
      }
    }
  }

  // -------------------------------------------------------------------------
  // 5. Organizer
  // -------------------------------------------------------------------------
  if (input.organizer) {
    const org = input.organizer
    const hasOrgData = org.name || org.email || org.phone || org.websiteUrl || org.facebookUrl || org.instagramUrl

    if (hasOrgData) {
      // Find existing organizer from editionPartners (role ORGANIZER)
      const existingOrganizer = (matchResult.edition?.editionPartners || []).find(
        (p: any) => p.role === 'ORGANIZER'
      ) || null

      // Classify the organizer URL
      const classifiedUrls = classifyOrganizerUrl(org.websiteUrl)

      const newOrgObj: Record<string, any> = {}
      if (org.name) newOrgObj.name = org.name
      if (org.email) newOrgObj.email = org.email
      if (org.phone) newOrgObj.phone = org.phone
      if (org.facebookUrl) newOrgObj.facebookUrl = org.facebookUrl
      if (org.instagramUrl) newOrgObj.instagramUrl = org.instagramUrl
      if (classifiedUrls.websiteUrl) newOrgObj.websiteUrl = classifiedUrls.websiteUrl
      if (classifiedUrls.facebookUrl) newOrgObj.facebookUrl = classifiedUrls.facebookUrl
      if (classifiedUrls.instagramUrl) newOrgObj.instagramUrl = classifiedUrls.instagramUrl

      const shouldUpdate =
        !existingOrganizer ||
        existingOrganizer.name !== org.name ||
        (classifiedUrls.websiteUrl && classifiedUrls.websiteUrl !== existingOrganizer.websiteUrl) ||
        (classifiedUrls.facebookUrl && classifiedUrls.facebookUrl !== existingOrganizer.facebookUrl) ||
        (classifiedUrls.instagramUrl && classifiedUrls.instagramUrl !== existingOrganizer.instagramUrl)

      if (shouldUpdate) {
        changes.organizer = {
          old: existingOrganizer
            ? {
                name: existingOrganizer.name,
                websiteUrl: existingOrganizer.websiteUrl,
                facebookUrl: existingOrganizer.facebookUrl,
                instagramUrl: existingOrganizer.instagramUrl,
              }
            : null,
          new: newOrgObj,
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 6. Registration URL
  // -------------------------------------------------------------------------
  if (input.registrationUrl) {
    changes.registrationUrl = { old: null, new: input.registrationUrl }
  }

  // -------------------------------------------------------------------------
  // 7. Races
  // -------------------------------------------------------------------------
  if (existingRaces.length > 0 || (input.races && input.races.length > 0)) {
    let matched: Array<{ input: any; db: any }> = []
    let unmatched: any[] = []

    if (input.races && input.races.length > 0) {
      if (matchedRaces) {
        // Use pre-computed matching (e.g. from FFA agent)
        matched = matchedRaces.matched
        unmatched = matchedRaces.unmatched
      } else {
        // Perform automatic matching via the shared matchRaces service
        const raceInputs = input.races.map(race => ({
          name: race.name,
          distance: race.distance ? race.distance / 1000 : undefined, // m → km
          startTime: race.startTime,
        }))
        const result = await matchRaces(raceInputs, existingRaces, undefined, undefined, llmContext)
        matched = result.matched
        unmatched = result.unmatched
      }
    }

    // --- racesToUpdate (matched input races) ---
    if (matched.length > 0) {
      const racesToUpdate = matched.map(({ input: matchedInput, db }) => {
        // Find the full input race by name
        const originalRace =
          input.races!.find(r => r.name === matchedInput.name) ||
          (matchedInput as ProposalRaceInput)
        const enrichedRace = inferAndAssignCategories(originalRace, input.eventName)
        const startDate = editionDate
          ? calculateRaceStartDate(editionDate, enrichedRace.startTime, timeZone, enrichedRace.raceDate)
          : undefined

        const updates: Record<string, any> = {}

        // Start date comparison
        if (startDate) {
          if (db.startDate) {
            const dbTZ = db.timeZone || timeZone
            const isDbMidnight = isMidnightInTimezone(new Date(db.startDate), dbTZ)

            if (enrichedRace.startTime) {
              // FFA/agent provides an exact time
              if (isDbMidnight) {
                // DB has midnight → always propose the precise time
                updates.startDate = { old: new Date(db.startDate), new: startDate }
              } else {
                const diff = Math.abs(startDate.getTime() - new Date(db.startDate).getTime())
                if (diff > 0) {
                  updates.startDate = { old: new Date(db.startDate), new: startDate }
                }
              }
            } else {
              // No precise time from source — only update if calendar date changed
              const sameDate = isSameDateInTimezone(new Date(db.startDate), startDate, dbTZ)
              if (!sameDate) {
                if (isDbMidnight) {
                  // DB has midnight → use the new date (also at midnight)
                  updates.startDate = { old: new Date(db.startDate), new: startDate }
                } else {
                  // DB has a precise time → keep the time, change the date
                  const newDate = cascadeDateToRace(startDate, new Date(db.startDate), dbTZ)
                  updates.startDate = { old: new Date(db.startDate), new: newDate }
                }
              }
            }
          } else {
            updates.startDate = { old: null, new: startDate }
          }
        }

        // Elevation
        if (enrichedRace.elevation !== undefined) {
          const dbElevation = db.runPositiveElevation || db.walkPositiveElevation || db.bikePositiveElevation
          if (!dbElevation || Math.abs(dbElevation - enrichedRace.elevation) > 10) {
            if (enrichedRace.categoryLevel1 === 'WALK') {
              updates.walkPositiveElevation = { old: db.walkPositiveElevation, new: enrichedRace.elevation }
            } else if (enrichedRace.categoryLevel1 === 'CYCLING') {
              updates.bikePositiveElevation = { old: db.bikePositiveElevation, new: enrichedRace.elevation }
            } else {
              updates.runPositiveElevation = { old: db.runPositiveElevation, new: enrichedRace.elevation }
            }
          }
        }

        // Category — only propose if DB doesn't have one
        if (enrichedRace.categoryLevel1 && !db.categoryLevel1) {
          updates.categoryLevel1 = { old: null, new: enrichedRace.categoryLevel1 }
        }
        if (enrichedRace.categoryLevel2 && !db.categoryLevel2) {
          updates.categoryLevel2 = { old: null, new: enrichedRace.categoryLevel2 }
        }

        // Timezone (only when startDate changed)
        if (updates.startDate && db.timeZone !== timeZone) {
          updates.timeZone = { old: db.timeZone || null, new: timeZone }
        }

        return {
          raceId: db.id,
          raceName: db.name,
          updates,
          currentData: {
            name: db.name,
            startDate: db.startDate ? new Date(db.startDate) : null,
            runDistance: db.runDistance,
            walkDistance: db.walkDistance,
            swimDistance: db.swimDistance,
            bikeDistance: db.bikeDistance,
            runPositiveElevation: db.runPositiveElevation,
            walkPositiveElevation: db.walkPositiveElevation,
            bikePositiveElevation: db.bikePositiveElevation,
            categoryLevel1: db.categoryLevel1,
            categoryLevel2: db.categoryLevel2,
            timeZone: db.timeZone,
          },
        }
      })

      changes.racesToUpdate = { old: null, new: racesToUpdate }
    }

    // --- racesToAdd (unmatched input races) ---
    if (unmatched.length > 0) {
      const racesToAdd = unmatched
        .filter((unmatchedInput: any) => {
          // Skip races without distance (they'd be noise)
          const originalRace = input.races!.find(r => r.name === unmatchedInput.name)
          return originalRace?.distance && originalRace.distance > 0
        })
        .map((unmatchedInput: any) => {
          const originalRace =
            input.races!.find(r => r.name === unmatchedInput.name) ||
            (unmatchedInput as ProposalRaceInput)
          const enrichedRace = inferAndAssignCategories(originalRace, input.eventName)
          const startDate = editionDate
            ? calculateRaceStartDate(editionDate, enrichedRace.startTime, timeZone, enrichedRace.raceDate)
            : undefined

          const distanceFields = enrichedRace.distance
            ? assignDistanceByCategory(enrichedRace.distance, enrichedRace.categoryLevel1)
            : {}

          const elevationFields: Record<string, any> = {}
          if (enrichedRace.elevation !== undefined) {
            if (enrichedRace.categoryLevel1 === 'WALK') {
              elevationFields.walkPositiveElevation = enrichedRace.elevation
            } else if (enrichedRace.categoryLevel1 === 'CYCLING') {
              elevationFields.bikePositiveElevation = enrichedRace.elevation
            } else {
              elevationFields.runPositiveElevation = enrichedRace.elevation
            }
          }

          const raceObj: Record<string, any> = {
            name: enrichedRace.name,
            startDate,
            startTime: enrichedRace.startTime,
            ...distanceFields,
            ...elevationFields,
            categoryLevel1: enrichedRace.categoryLevel1,
            categoryLevel2: enrichedRace.categoryLevel2,
            timeZone,
          }

          // Remove undefined values
          for (const key of Object.keys(raceObj)) {
            if (raceObj[key] === undefined) {
              delete raceObj[key]
            }
          }

          return raceObj
        })

      // Deduplicate racesToAdd by name + distance
      const seenRaces = new Set<string>()
      const dedupedRacesToAdd = racesToAdd.filter((r: any) => {
        const key = `${(r.name || '').toLowerCase().trim()}|${r.runDistance || r.walkDistance || r.bikeDistance || 0}`
        if (seenRaces.has(key)) return false
        seenRaces.add(key)
        return true
      })

      if (dedupedRacesToAdd.length > 0) {
        changes.racesToAdd = { old: null, new: dedupedRacesToAdd }
      }
    }

    // --- racesExisting (unmatched DB races) ---
    const matchedDbIds = new Set(matched.map(m => m.db.id))
    const unmatchedDbRaces = existingRaces.filter(r => !matchedDbIds.has(r.id))

    if (unmatchedDbRaces.length > 0) {
      // If edition start date changed, cascade it to unmatched DB races
      const newEditionStartDate = changes.startDate?.new
        ? new Date(changes.startDate.new)
        : null

      const racesExisting = unmatchedDbRaces.map(race => {
        const raceObj: Record<string, any> = {
          raceId: race.id,
          raceName: race.name,
          runDistance: race.runDistance,
          walkDistance: race.walkDistance,
          swimDistance: race.swimDistance,
          bikeDistance: race.bikeDistance,
          runPositiveElevation: race.runPositiveElevation,
          walkPositiveElevation: race.walkPositiveElevation,
          bikePositiveElevation: race.bikePositiveElevation,
          categoryLevel1: race.categoryLevel1,
          categoryLevel2: race.categoryLevel2,
          startDate: race.startDate ? new Date(race.startDate) : null,
        }

        // Cascade edition date change to unmatched race if needed
        if (newEditionStartDate && race.startDate) {
          const raceTZ = race.timeZone || timeZone
          const raceStartDate = new Date(race.startDate)
          const isSameDate = isSameDateInTimezone(raceStartDate, newEditionStartDate, raceTZ)
          if (!isSameDate) {
            raceObj.startDate = cascadeDateToRace(newEditionStartDate, raceStartDate, raceTZ)
          }
        }

        // Remove null/undefined values except explicitly kept ones
        for (const key of Object.keys(raceObj)) {
          if (raceObj[key] === undefined) {
            delete raceObj[key]
          }
        }

        return raceObj
      })

      changes.racesExisting = { old: null, new: racesExisting }
    }
  }

  return changes
}
