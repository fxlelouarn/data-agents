#!/usr/bin/env npx tsx
/**
 * Check if racesExisting dates from applied proposals match current DB dates.
 * Detects races that should have been updated when edition date changed.
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '/Users/fx/dev/data-agents/.env.prod', override: true })
dotenv.config({ path: '/Users/fx/dev/data-agents/.env' })

import { PrismaClient } from '@prisma/client'
import { DatabaseManager, createConsoleLogger } from '@data-agents/agent-framework'

const prisma = new PrismaClient()
const logger = createConsoleLogger('CHECK', 'script')
const DRY_RUN = process.argv.includes('--dry-run')
const FIX = process.argv.includes('--fix')
const MAX_DIFF_DAYS = parseInt(process.argv.find(a => a.startsWith('--max-days='))?.split('=')[1] || '9999', 10)

async function main() {
  // Connect to Miles Republic
  const milesConn = await prisma.databaseConnection.findFirst({
    where: { name: { contains: 'Miles Republic' } }
  })
  if (!milesConn) { console.error('No Miles Republic connection'); process.exit(1) }
  const dbManager = DatabaseManager.getInstance(logger)
  const sourceDb = await dbManager.getConnection(milesConn.id)

  // Get all applied proposals with startDate change + racesExisting
  const proposals = await prisma.$queryRawUnsafe<any[]>(`
    SELECT DISTINCT ON (p.id)
      p.id, p."eventName", p."editionId",
      p.changes->'startDate'->>'new' as new_edition_date,
      p.changes->'racesExisting'->'new' as races_existing
    FROM proposal_applications pa
    JOIN proposals p ON pa."proposalId" = p.id
    WHERE pa.status = 'APPLIED'
      AND pa."blockType" IN ('edition', 'races')
      AND p.changes->'startDate'->'new' IS NOT NULL
      AND p.changes->'racesExisting'->'new' IS NOT NULL
      AND jsonb_array_length(p.changes->'racesExisting'->'new') > 0
  `)

  console.log(`Found ${proposals.length} applied proposals with racesExisting\n`)

  let totalMismatches = 0
  let totalFixed = 0
  const editionIdsToFlag = new Set<number>()
  const mismatches: Array<{ raceId: number, raceName: string, eventName: string, currentDate: string, proposedDate: string }> = []

  for (const p of proposals) {
    const racesExisting = typeof p.races_existing === 'string'
      ? JSON.parse(p.races_existing)
      : p.races_existing

    for (const race of racesExisting) {
      if (!race.raceId || !race.startDate) continue

      // Get current date from Miles Republic
      const dbRace = await sourceDb.race.findUnique({
        where: { id: race.raceId },
        select: { id: true, name: true, startDate: true, isArchived: true, editionId: true }
      })

      if (!dbRace || dbRace.isArchived) continue

      const currentDate = dbRace.startDate ? new Date(dbRace.startDate).toISOString() : null
      const proposedDate = new Date(race.startDate).toISOString()

      if (currentDate && proposedDate && currentDate !== proposedDate) {
        // Check if the difference is > 1 hour (ignore minor timezone diffs)
        const diffMs = Math.abs(new Date(currentDate).getTime() - new Date(proposedDate).getTime())
        const diffDays = diffMs / 86400000
        if (diffMs > 3600000 && diffDays <= MAX_DIFF_DAYS) {
          totalMismatches++
          mismatches.push({
            raceId: race.raceId,
            raceName: race.raceName || dbRace.name,
            eventName: p.eventName || '?',
            currentDate,
            proposedDate,
          })

          if (FIX) {
            // Update race date + flag edition for Algolia sync
            await sourceDb.$executeRawUnsafe(
              `UPDATE "Race" SET "startDate" = $1 WHERE id = $2`,
              new Date(proposedDate),
              race.raceId
            )
            if (dbRace.editionId) {
              editionIdsToFlag.add(dbRace.editionId)
            }
            totalFixed++
          }
        }
      }
    }
  }

  // Flag affected events for update (toUpdate + algoliaObjectToUpdate are on Event table)
  if (FIX && editionIdsToFlag.size > 0) {
    const ids = Array.from(editionIdsToFlag)
    for (const id of ids) {
      await sourceDb.$queryRawUnsafe(
        `UPDATE "Event" SET "toUpdate" = true, "algoliaObjectToUpdate" = true
         WHERE id = (SELECT "eventId" FROM "Edition" WHERE id = ${id})`
      )
    }
    console.log(`\nFlagged events for ${ids.length} editions (toUpdate + algoliaObjectToUpdate)`)
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`RESULTS${DRY_RUN ? ' (DRY RUN)' : FIX ? ' (FIXED)' : ''}`)
  console.log(`${'='.repeat(60)}`)
  console.log(`  Proposals checked: ${proposals.length}`)
  console.log(`  Date mismatches:   ${totalMismatches}`)
  if (FIX) {
    console.log(`  Fixed:             ${totalFixed}`)
    console.log(`  Editions flagged:  ${editionIdsToFlag.size}`)
  }
  console.log()

  if (mismatches.length > 0) {
    console.log('Mismatches:')
    for (const m of mismatches.slice(0, 30)) {
      const currentDay = m.currentDate.split('T')[0]
      const proposedDay = m.proposedDate.split('T')[0]
      const dayDiff = currentDay !== proposedDay ? ` (${currentDay} → ${proposedDay})` : ' (time only)'
      console.log(`  [${m.raceId}] ${m.raceName} — ${m.eventName}${dayDiff}`)
    }
    if (mismatches.length > 30) {
      console.log(`  ... and ${mismatches.length - 30} more`)
    }
  }

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
