#!/usr/bin/env npx tsx
/**
 * Re-match races in EDITION_UPDATE proposals using LLM.
 *
 * For proposals that have racesToAdd or racesExisting (potentially mis-matched),
 * re-runs the race matching with LLM and rebuilds the changes.
 *
 * Usage:
 *   npx tsx apps/agents/src/scripts/rematch-races-in-proposals.ts --dry-run --limit 10
 *   npx tsx apps/agents/src/scripts/rematch-races-in-proposals.ts --limit 500
 *   npx tsx apps/agents/src/scripts/rematch-races-in-proposals.ts --id cmn41ieef1r1vis1emm4hk0wm
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '/Users/fx/dev/data-agents/.env.prod', override: true })
dotenv.config({ path: '/Users/fx/dev/data-agents/.env' })

import { PrismaClient } from '@prisma/client'
import {
  matchRaces,
  LLMMatchingService,
  LLMMatchingConfig,
  DbRace,
  RaceMatchInput,
  createConsoleLogger,
  DatabaseManager,
  ConnectionManager,
} from '@data-agents/agent-framework'

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined
}
const LIMIT = getArg('limit') ? parseInt(getArg('limit')!, 10) : undefined
const PROPOSAL_ID = getArg('id')
const DRY_RUN = args.includes('--dry-run')

const prisma = new PrismaClient()
const logger = createConsoleLogger('REMATCH-RACES', 'script')

const apiKey = process.env.LLM_MATCHING_API_KEY
if (!apiKey) {
  console.error('ERROR: LLM_MATCHING_API_KEY required')
  process.exit(1)
}
const llmConfig: LLMMatchingConfig = { apiKey, model: 'claude-haiku-4-5-20251001' }
const llmService = new LLMMatchingService(llmConfig, logger)

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n=== RE-MATCH RACES IN EDITION_UPDATE PROPOSALS ===`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : '🔴 LIVE'}`)
  if (PROPOSAL_ID) console.log(`Single proposal: ${PROPOSAL_ID}`)
  if (LIMIT) console.log(`Limit: ${LIMIT}`)
  console.log()

  // Connect to Miles Republic
  const milesConn = await prisma.databaseConnection.findFirst({
    where: { type: 'MILES_REPUBLIC' }
  })
  if (!milesConn) {
    console.error('No Miles Republic connection found')
    process.exit(1)
  }
  const dbManager = DatabaseManager.getInstance(logger)
  const sourceDb = await dbManager.getConnection(milesConn.id)

  // Fetch proposals
  let whereClause: string
  if (PROPOSAL_ID) {
    whereClause = `id = '${PROPOSAL_ID}'`
  } else {
    whereClause = `type = 'EDITION_UPDATE'
      AND status IN ('PENDING', 'PARTIALLY_APPROVED')
      AND "agentId" = 'cmi3khznk0000g820hwxc2i8m'
      AND (
        (changes->'racesToAdd' IS NOT NULL AND jsonb_array_length(changes->'racesToAdd'->'new') > 0)
        OR (changes->'racesExisting' IS NOT NULL AND jsonb_array_length(changes->'racesExisting'->'new') > 0)
      )`
  }
  const limitClause = LIMIT ? `LIMIT ${LIMIT}` : ''

  const proposals = await prisma.$queryRawUnsafe<Array<{
    id: string
    eventName: string
    eventId: string
    editionId: string
    changes: any
  }>>(
    `SELECT id, "eventName", "eventId", "editionId", changes
     FROM proposals WHERE ${whereClause}
     ORDER BY "createdAt" DESC ${limitClause}`
  )

  console.log(`Found ${proposals.length} proposals to process.\n`)

  const stats = {
    processed: 0,
    improved: 0,
    unchanged: 0,
    errors: 0,
  }

  for (let i = 0; i < proposals.length; i++) {
    const p = proposals[i]
    stats.processed++
    const prefix = `[${i + 1}/${proposals.length}]`

    if (!p.editionId) {
      console.log(`${prefix} ⏭️  ${p.eventName} — no editionId`)
      continue
    }

    try {
      const editionId = parseInt(p.editionId)

      // Get existing races from Miles Republic
      const dbRaces = await sourceDb.race.findMany({
        where: { editionId, isArchived: false },
        select: {
          id: true, name: true, runDistance: true, walkDistance: true,
          swimDistance: true, bikeDistance: true, startDate: true,
          runPositiveElevation: true, categoryLevel1: true, categoryLevel2: true,
        }
      })

      if (dbRaces.length === 0) {
        console.log(`${prefix} ⏭️  ${p.eventName} — no races in DB`)
        continue
      }

      // Collect ALL input races from the proposal (racesToUpdate + racesToAdd + racesExisting)
      const inputRaces: RaceMatchInput[] = []

      // From racesToUpdate (already matched — extract the proposed data)
      const racesToUpdate = p.changes.racesToUpdate?.new || []
      for (const r of racesToUpdate) {
        const name = r.raceName || r.currentData?.name || '?'
        const dist = r.currentData?.runDistance || r.currentData?.walkDistance || r.currentData?.bikeDistance || 0
        inputRaces.push({ name, distance: dist })
      }

      // From racesToAdd (unmatched — these are the ones we want to re-match)
      const racesToAdd = p.changes.racesToAdd?.new || []
      for (const r of racesToAdd) {
        const dist = r.runDistance || r.walkDistance || r.bikeDistance || 0
        inputRaces.push({ name: r.name, distance: dist })
      }

      // From racesExisting (unmatched DB races listed for reference)
      // These are NOT input races — they're DB races that weren't matched
      // We don't include them in input, they're already in dbRaces

      if (inputRaces.length === 0) {
        console.log(`${prefix} ⏭️  ${p.eventName} — no input races`)
        continue
      }

      // Re-match with LLM
      const result = await matchRaces(inputRaces, dbRaces as DbRace[], logger, 0.15, {
        llmService,
        eventName: p.eventName,
        editionYear: new Date().getFullYear(),
        eventCity: '',
      })

      // Compare with current state
      const currentMatchedCount = racesToUpdate.length
      const currentUnmatchedCount = racesToAdd.length
      const newMatchedCount = result.matched.length
      const newUnmatchedCount = result.unmatched.length

      // Consider it improved if:
      // - racesToAdd decreases (fewer new races to create)
      // - Or the matching changed at all (different DB race IDs matched)
      const currentMatchedDbIds = new Set(racesToUpdate.map((r: any) => r.raceId))
      const newMatchedDbIds = new Set(result.matched.map(m => m.db.id))
      const matchingChanged =
        newUnmatchedCount < currentUnmatchedCount ||
        result.matched.some(m => !currentMatchedDbIds.has(m.db.id))

      if (!matchingChanged) {
        console.log(`${prefix} — ${p.eventName} (no change: ${currentMatchedCount} matched, ${currentUnmatchedCount} unmatched)`)
        stats.unchanged++
        continue
      }

      console.log(`${prefix} ✅ ${p.eventName} — improved: ${currentMatchedCount}→${newMatchedCount} matched, ${currentUnmatchedCount}→${newUnmatchedCount} unmatched`)
      for (const m of result.matched) {
        const wasUnmatched = racesToAdd.some((r: any) => r.name === m.input.name)
        if (wasUnmatched) {
          console.log(`         🔗 "${m.input.name}" → "${m.db.name}" (id: ${m.db.id}) [NEW MATCH]`)
        }
      }

      stats.improved++

      if (!DRY_RUN) {
        // Rebuild racesToUpdate from matched results
        const newRacesToUpdate = result.matched.map(m => {
          // Try to find existing racesToUpdate entry for this DB race
          const existingEntry = racesToUpdate.find((r: any) => r.raceId === m.db.id)
          if (existingEntry) return existingEntry

          // Build new entry from the match
          return {
            raceId: m.db.id,
            raceName: (m.db as any).name,
            currentData: {
              name: (m.db as any).name,
              startDate: (m.db as any).startDate,
              runDistance: (m.db as any).runDistance,
              walkDistance: (m.db as any).walkDistance,
              bikeDistance: (m.db as any).bikeDistance,
              swimDistance: (m.db as any).swimDistance,
              categoryLevel1: (m.db as any).categoryLevel1,
              categoryLevel2: (m.db as any).categoryLevel2,
              runPositiveElevation: (m.db as any).runPositiveElevation,
            },
            updates: {},
          }
        })

        // Rebuild racesToAdd from unmatched
        const newRacesToAdd = result.unmatched.map(u => {
          // Try to find the original racesToAdd entry
          const existing = racesToAdd.find((r: any) => r.name === u.name)
          return existing || { name: u.name, runDistance: u.distance }
        })

        // Rebuild racesExisting (DB races not in any match)
        const matchedDbIds = new Set(result.matched.map(m => m.db.id))
        const newRacesExisting = dbRaces
          .filter((r: any) => !matchedDbIds.has(r.id))
          .map((r: any) => ({
            raceId: r.id,
            raceName: r.name,
            startDate: r.startDate,
            runDistance: r.runDistance,
            walkDistance: r.walkDistance,
            bikeDistance: r.bikeDistance,
            swimDistance: r.swimDistance,
            categoryLevel1: r.categoryLevel1,
            categoryLevel2: r.categoryLevel2,
            runPositiveElevation: r.runPositiveElevation,
          }))

        // Update changes
        p.changes.racesToUpdate = { new: newRacesToUpdate, old: null }
        if (newRacesToAdd.length > 0) {
          p.changes.racesToAdd = { new: newRacesToAdd, old: null }
        } else {
          delete p.changes.racesToAdd
        }
        if (newRacesExisting.length > 0) {
          p.changes.racesExisting = { new: newRacesExisting, old: null }
        } else {
          delete p.changes.racesExisting
        }

        await prisma.proposal.update({
          where: { id: p.id },
          data: { changes: p.changes as any },
        })
      }
    } catch (err: any) {
      console.log(`${prefix} ❌ ${p.eventName}: ${err.message}`)
      stats.errors++
    }
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`SUMMARY${DRY_RUN ? ' (DRY RUN)' : ''}`)
  console.log(`${'='.repeat(50)}`)
  console.log(`  Processed: ${stats.processed}`)
  console.log(`  Improved:  ${stats.improved}`)
  console.log(`  Unchanged: ${stats.unchanged}`)
  console.log(`  Errors:    ${stats.errors}`)
  console.log()

  await prisma.$disconnect()
}

main().catch(err => {
  console.error('Fatal error:', err)
  prisma.$disconnect()
  process.exit(1)
})
