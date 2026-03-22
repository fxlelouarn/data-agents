#!/usr/bin/env npx ts-node
/**
 * rematch-pending-proposals.ts
 *
 * Re-matches PENDING proposals using LLM to detect:
 * 1. NEW_EVENT that should be EDITION_UPDATE (event exists in DB)
 * 2. EDITION_UPDATE with racesToAdd that are actually existing races reformatted
 *
 * Usage:
 *   npx ts-node apps/agents/src/scripts/rematch-pending-proposals.ts --limit 100
 *   npx ts-node apps/agents/src/scripts/rematch-pending-proposals.ts --limit 50 --type new-events
 *   npx ts-node apps/agents/src/scripts/rematch-pending-proposals.ts --limit 50 --type races
 *   npx ts-node apps/agents/src/scripts/rematch-pending-proposals.ts --limit 10 --dry-run
 *   npx ts-node apps/agents/src/scripts/rematch-pending-proposals.ts --limit 100 --min-confidence 0.85
 *   npx ts-node apps/agents/src/scripts/rematch-pending-proposals.ts --limit 100 --concurrency 5
 *
 * Environment variables required:
 *   DATABASE_URL             - data-agents database
 *   LLM_MATCHING_API_KEY     - Anthropic API key
 *   LLM_MATCHING_MODEL       - Model (default: claude-haiku-4-5-20251001)
 */

import { PrismaClient } from '@prisma/client'
import {
  matchEvent,
  matchRaces,
  LLMMatchingService,
  LLMMatchingConfig,
  createConsoleLogger,
  DatabaseManager,
  DEFAULT_MATCHING_CONFIG,
  buildEditionUpdateChanges,
  DbRace,
} from '@data-agents/agent-framework'

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined
}
const hasFlag = (name: string) => args.includes(`--${name}`)

const LIMIT = parseInt(getArg('limit') || '100', 10)
const TYPE_FILTER = getArg('type') as 'new-events' | 'races' | undefined
const DRY_RUN = hasFlag('dry-run')
const MIN_CONFIDENCE = parseFloat(getArg('min-confidence') || '0.80')

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
const prisma = new PrismaClient()
const logger = createConsoleLogger('Rematch', 'rematch-pending')

const llmApiKey = process.env.LLM_MATCHING_API_KEY
if (!llmApiKey) {
  console.error('❌ LLM_MATCHING_API_KEY environment variable is required')
  process.exit(1)
}

const llmConfig: LLMMatchingConfig = {
  apiKey: llmApiKey,
  model: process.env.LLM_MATCHING_MODEL || 'claude-haiku-4-5-20251001',
  enabled: true,
}
const llmService = new LLMMatchingService(llmConfig, logger)

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
const stats = {
  newEvents: { processed: 0, reclassified: 0, confirmed: 0, errors: 0 },
  races: { processed: 0, reclassifiedRaces: 0, confirmedNew: 0, errors: 0 },
  startTime: Date.now(),
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Rematch PENDING proposals with LLM ===')
  console.log(`Limit: ${LIMIT}, Type: ${TYPE_FILTER || 'all'}, Dry-run: ${DRY_RUN}, Min confidence: ${MIN_CONFIDENCE}`)
  console.log()

  // Connect to Miles Republic
  const dbManager = DatabaseManager.getInstance(logger)
  const milesRepublicConn = await prisma.databaseConnection.findFirst({
    where: { name: { contains: 'Miles Republic' } }
  })
  if (!milesRepublicConn) {
    console.error('❌ Miles Republic connection not found in database_connections')
    process.exit(1)
  }
  const sourceDb = await dbManager.getConnection(milesRepublicConn.id)
  logger.info(`Connected to Miles Republic (${milesRepublicConn.name})`)

  // Process NEW_EVENT proposals
  if (!TYPE_FILTER || TYPE_FILTER === 'new-events') {
    await processNewEvents(sourceDb)
  }

  // Process EDITION_UPDATE with racesToAdd
  if (!TYPE_FILTER || TYPE_FILTER === 'races') {
    await processRacesToAdd(sourceDb)
  }

  // Report
  printReport()

  await prisma.$disconnect()
}

// ---------------------------------------------------------------------------
// Process NEW_EVENT proposals
// ---------------------------------------------------------------------------
async function processNewEvents(sourceDb: any) {
  console.log('\n--- Processing NEW_EVENT proposals ---')

  const proposals = await prisma.proposal.findMany({
    where: { type: 'NEW_EVENT', status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    take: LIMIT,
  })

  console.log(`Found ${proposals.length} PENDING NEW_EVENT proposals`)

  for (const proposal of proposals) {
    stats.newEvents.processed++
    const changes = proposal.changes as Record<string, any>

    // Extract event info from changes
    const eventName = changes.name?.new || proposal.eventName || ''
    const eventCity = changes.city?.new || proposal.eventCity || ''
    const eventDepartment = changes.department?.new || ''
    const editionData = changes.edition?.new
    const editionDate = editionData?.startDate
      ? new Date(editionData.startDate)
      : proposal.editionYear
        ? new Date(`${proposal.editionYear}-06-01`)
        : new Date()

    if (!eventName) {
      logger.warn(`Skipping proposal ${proposal.id}: no event name`)
      continue
    }

    try {
      logger.info(`[${stats.newEvents.processed}/${proposals.length}] Matching "${eventName}" (${eventCity})...`)

      const matchResult = await matchEvent(
        { eventName, eventCity, eventDepartment, editionDate },
        sourceDb,
        {
          ...DEFAULT_MATCHING_CONFIG,
          llm: llmConfig,
          llmService,
        },
        logger
      )

      if (matchResult.type !== 'NO_MATCH' && matchResult.event && matchResult.edition) {
        if (matchResult.confidence < MIN_CONFIDENCE) {
          stats.newEvents.confirmed++
          logger.info(`  ⚠️ MATCH FOUND but below threshold: "${matchResult.event.name}" (id:${matchResult.event.id}, confidence:${matchResult.confidence.toFixed(2)} < ${MIN_CONFIDENCE}) — skipping`)
          continue
        }
        stats.newEvents.reclassified++
        logger.info(`  ✅ MATCH FOUND: "${matchResult.event.name}" (id:${matchResult.event.id}, confidence:${matchResult.confidence.toFixed(2)})`)

        if (!DRY_RUN) {
          // Fetch existing races from Miles Republic
          const existingRaces = await sourceDb.race.findMany({
            where: { editionId: matchResult.edition.id, isArchived: false },
            select: {
              id: true, name: true, runDistance: true, walkDistance: true,
              swimDistance: true, bikeDistance: true, startDate: true,
              runPositiveElevation: true, categoryLevel1: true, categoryLevel2: true,
            }
          })

          // Build EDITION_UPDATE changes using shared builder
          const races = editionData?.races || []
          const proposalInput = {
            eventName,
            eventCity,
            eventCountry: changes.country?.new || 'France',
            eventDepartment,
            editionDate: editionDate.toISOString(),
            editionYear: typeof matchResult.edition.year === 'string' ? parseInt(matchResult.edition.year) : matchResult.edition.year,
            timeZone: editionData?.timeZone || 'Europe/Paris',
            races: races.map((r: any) => {
              let startTime: string | undefined
              if (r.startDate) {
                try {
                  const d = new Date(r.startDate)
                  if (!isNaN(d.getTime())) startTime = d.toISOString().slice(11, 16)
                } catch { /* ignore invalid dates */ }
              }
              return {
                name: r.name,
                distance: r.distance ? r.distance * 1000 : undefined, // km → m for input
                elevation: r.elevationGain || r.runPositiveElevation,
                startTime,
                categoryLevel1: r.categoryLevel1,
                categoryLevel2: r.categoryLevel2,
              }
            }),
            organizer: changes.organizer?.new,
            registrationUrl: changes.websiteUrl?.new || changes.registrationUrl?.new,
            confidence: proposal.confidence || 0.8,
            source: 'rematch-script',
          }

          const newChanges = await buildEditionUpdateChanges(
            proposalInput,
            matchResult,
            existingRaces as DbRace[],
            undefined,
            { llmService, eventName, editionYear: typeof matchResult.edition.year === 'string' ? parseInt(matchResult.edition.year) : matchResult.edition.year, eventCity }
          )

          // Update the proposal
          await prisma.proposal.update({
            where: { id: proposal.id },
            data: {
              type: 'EDITION_UPDATE',
              eventId: matchResult.event.id.toString(),
              editionId: matchResult.edition.id.toString(),
              changes: newChanges,
              confidence: matchResult.confidence,
            }
          })
          logger.info(`  📝 Updated proposal ${proposal.id}: NEW_EVENT → EDITION_UPDATE`)
        } else {
          logger.info(`  🔍 [DRY-RUN] Would reclassify to EDITION_UPDATE (event:${matchResult.event.id}, edition:${matchResult.edition.id})`)
        }
      } else {
        stats.newEvents.confirmed++
        logger.info(`  — No match, confirmed as NEW_EVENT`)
      }
    } catch (error: any) {
      stats.newEvents.errors++
      logger.error(`  ❌ Error processing proposal ${proposal.id}: ${error.message}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Process EDITION_UPDATE with racesToAdd
// ---------------------------------------------------------------------------
async function processRacesToAdd(sourceDb: any) {
  console.log('\n--- Processing EDITION_UPDATE with racesToAdd ---')

  // Find EDITION_UPDATE proposals that have racesToAdd in their changes
  const proposals = await prisma.$queryRaw<any[]>`
    SELECT id, "eventId", "editionId", "eventName", "eventCity", changes, confidence
    FROM proposals
    WHERE type = 'EDITION_UPDATE'
      AND status = 'PENDING'
      AND changes::text LIKE '%racesToAdd%'
    ORDER BY "createdAt" DESC
    LIMIT ${LIMIT}
  `

  console.log(`Found ${proposals.length} EDITION_UPDATE proposals with racesToAdd`)

  for (const proposal of proposals) {
    stats.races.processed++
    const changes = typeof proposal.changes === 'string' ? JSON.parse(proposal.changes) : proposal.changes

    const racesToAdd = changes.racesToAdd?.new
    if (!racesToAdd || !Array.isArray(racesToAdd) || racesToAdd.length === 0) continue

    const editionId = proposal.editionId ? parseInt(proposal.editionId) : null
    if (!editionId) {
      logger.warn(`Skipping proposal ${proposal.id}: no editionId`)
      continue
    }

    try {
      logger.info(`[${stats.races.processed}/${proposals.length}] Re-matching ${racesToAdd.length} racesToAdd for "${proposal.eventName}" (edition:${editionId})...`)

      // Fetch existing races from Miles Republic
      const existingRaces: DbRace[] = await sourceDb.race.findMany({
        where: { editionId, isArchived: false },
        select: {
          id: true, name: true, runDistance: true, walkDistance: true,
          swimDistance: true, bikeDistance: true, startDate: true,
          runPositiveElevation: true, categoryLevel1: true, categoryLevel2: true,
        }
      })

      if (existingRaces.length === 0) {
        logger.info(`  — No existing races in DB, skipping`)
        continue
      }

      // Build RaceMatchInput from racesToAdd
      const raceInputs = racesToAdd.map((r: any) => ({
        name: r.name || '',
        distance: r.runDistance || r.distance,
        startTime: r.startDate ? new Date(r.startDate).toISOString().slice(11, 16) : undefined,
        categoryLevel1: r.categoryLevel1,
        categoryLevel2: r.categoryLevel2,
        elevation: r.runPositiveElevation,
      }))

      // Match using LLM
      const result = await matchRaces(raceInputs, existingRaces, logger, 0.15, {
        llmService,
        eventName: proposal.eventName || '',
        editionYear: new Date().getFullYear(),
        eventCity: proposal.eventCity || '',
      })

      if (result.matched.length > 0) {
        stats.races.reclassifiedRaces += result.matched.length
        stats.races.confirmedNew += result.unmatched.length

        logger.info(`  ✅ ${result.matched.length} races re-matched, ${result.unmatched.length} confirmed new`)
        for (const m of result.matched) {
          logger.info(`    "${m.input.name}" → "${m.db.name}" (id:${m.db.id})`)
        }

        if (!DRY_RUN) {
          // Move matched races from racesToAdd to racesToUpdate
          const newRacesToUpdate = result.matched.map(m => {
            const orig = racesToAdd.find((r: any) => r.name === m.input.name) || {}
            const updates: Record<string, any> = {}
            if (orig.runDistance && orig.runDistance !== m.db.runDistance) {
              updates.runDistance = { old: m.db.runDistance, new: orig.runDistance }
            }
            if (orig.startDate) {
              updates.startDate = { old: m.db.startDate, new: orig.startDate }
            }
            if (orig.categoryLevel1 && !(m.db as any).categoryLevel1) {
              updates.categoryLevel1 = { old: null, new: orig.categoryLevel1 }
            }
            if (orig.categoryLevel2 && !(m.db as any).categoryLevel2) {
              updates.categoryLevel2 = { old: null, new: orig.categoryLevel2 }
            }
            return {
              raceId: m.db.id,
              raceName: m.db.name,
              updates,
              currentData: { ...m.db },
            }
          })

          // Build updated changes
          const updatedChanges = { ...changes }

          // Merge with existing racesToUpdate
          const existingRacesToUpdate = updatedChanges.racesToUpdate?.new || []
          updatedChanges.racesToUpdate = {
            old: null,
            new: [...existingRacesToUpdate, ...newRacesToUpdate],
            confidence: changes.racesToAdd?.confidence || 0.8,
          }

          // Update racesToAdd to only keep truly new races
          if (result.unmatched.length > 0) {
            const unmatchedNames = new Set(result.unmatched.map(u => u.name))
            updatedChanges.racesToAdd = {
              old: null,
              new: racesToAdd.filter((r: any) => unmatchedNames.has(r.name)),
              confidence: changes.racesToAdd?.confidence || 0.8,
            }
          } else {
            delete updatedChanges.racesToAdd
          }

          await prisma.proposal.update({
            where: { id: proposal.id },
            data: { changes: updatedChanges }
          })
          logger.info(`  📝 Updated proposal ${proposal.id}: moved ${result.matched.length} races from racesToAdd to racesToUpdate`)
        } else {
          logger.info(`  🔍 [DRY-RUN] Would move ${result.matched.length} races from racesToAdd to racesToUpdate`)
        }
      } else {
        stats.races.confirmedNew += racesToAdd.length
        logger.info(`  — All ${racesToAdd.length} races confirmed as new`)
      }
    } catch (error: any) {
      stats.races.errors++
      logger.error(`  ❌ Error processing proposal ${proposal.id}: ${error.message}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
function printReport() {
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1)

  console.log('\n========================================')
  console.log(`=== Re-matching LLM - Rapport ${DRY_RUN ? '(DRY-RUN)' : ''} ===`)
  console.log('========================================')

  if (!TYPE_FILTER || TYPE_FILTER === 'new-events') {
    console.log(`\nNEW_EVENT (${stats.newEvents.processed} traitées) :`)
    console.log(`  Reclassées en EDITION_UPDATE : ${stats.newEvents.reclassified}`)
    console.log(`  Confirmées NEW_EVENT :         ${stats.newEvents.confirmed}`)
    console.log(`  Erreurs :                      ${stats.newEvents.errors}`)
  }

  if (!TYPE_FILTER || TYPE_FILTER === 'races') {
    console.log(`\nEDITION_UPDATE racesToAdd (${stats.races.processed} propositions traitées) :`)
    console.log(`  Courses reclassées (add → update) : ${stats.races.reclassifiedRaces}`)
    console.log(`  Courses confirmées nouvelles :      ${stats.races.confirmedNew}`)
    console.log(`  Erreurs :                           ${stats.races.errors}`)
  }

  console.log(`\nDurée : ${elapsed}s`)
  console.log('========================================')
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
