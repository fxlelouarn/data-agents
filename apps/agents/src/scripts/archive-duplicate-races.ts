#!/usr/bin/env npx tsx
/**
 * Archive duplicate races in Miles Republic.
 *
 * Finds races with the same name + same distance + same edition,
 * keeps the oldest one and archives the newer duplicate.
 *
 * Usage:
 *   npx tsx apps/agents/src/scripts/archive-duplicate-races.ts --dry-run
 *   npx tsx apps/agents/src/scripts/archive-duplicate-races.ts
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '/Users/fx/dev/data-agents/.env.prod', override: true })
dotenv.config({ path: '/Users/fx/dev/data-agents/.env' })

import { PrismaClient } from '.prisma/client-miles'

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.MILES_REPUBLIC_DATABASE_URL } },
})

async function main() {
  console.log(`\n=== ARCHIVE DUPLICATE RACES ===`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : '🔴 LIVE (will archive duplicates)'}`)
  console.log()

  // Find strict duplicates: same name (case-insensitive) + same distance + same edition
  const duplicates = await prisma.$queryRaw<Array<{
    dup_id: number
    dup_name: string
    dup_distance: number | null
    edition_id: number
    dup_created: Date
    orig_id: number
    orig_created: Date
    event_name: string
  }>>`
    SELECT
      r1.id as dup_id,
      r1.name as dup_name,
      r1."runDistance" as dup_distance,
      r1."editionId" as edition_id,
      r1."createdAt" as dup_created,
      r2.id as orig_id,
      r2."createdAt" as orig_created,
      e.name as event_name
    FROM "Race" r1
    JOIN "Race" r2 ON r1."editionId" = r2."editionId"
      AND r1."runDistance" = r2."runDistance"
      AND LOWER(r1.name) = LOWER(r2.name)
      AND r1.id > r2.id
      AND r1."isArchived" = false
      AND r2."isArchived" = false
    JOIN "Edition" ed ON r1."editionId" = ed.id
    JOIN "Event" e ON ed."eventId" = e.id
    WHERE r1."createdAt" > '2026-01-01'::timestamp
      AND r1.name NOT LIKE '%%(copie)%%'
    ORDER BY e.name, r1.name
  `

  console.log(`Found ${duplicates.length} duplicate races to archive.\n`)

  if (duplicates.length === 0) {
    await prisma.$disconnect()
    return
  }

  // Group by event for reporting
  const byEvent = new Map<string, typeof duplicates>()
  for (const d of duplicates) {
    const key = d.event_name
    if (!byEvent.has(key)) byEvent.set(key, [])
    byEvent.get(key)!.push(d)
  }

  let archived = 0
  for (const [eventName, dups] of byEvent) {
    console.log(`${eventName} (${dups.length} duplicate(s)):`)
    for (const d of dups) {
      console.log(`  Archive #${d.dup_id} "${d.dup_name}" (${d.dup_distance ?? 0}km, created ${d.dup_created.toISOString().slice(0, 19)}) — keep #${d.orig_id}`)

      if (!DRY_RUN) {
        await prisma.race.update({
          where: { id: d.dup_id },
          data: { isArchived: true },
        })
        archived++
      }
    }
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`SUMMARY${DRY_RUN ? ' (DRY RUN)' : ''}`)
  console.log(`${'='.repeat(50)}`)
  console.log(`  Events affected: ${byEvent.size}`)
  console.log(`  Duplicates found: ${duplicates.length}`)
  console.log(`  Archived: ${archived}`)
  console.log()

  await prisma.$disconnect()
}

main().catch(err => {
  console.error('Fatal error:', err)
  prisma.$disconnect()
  process.exit(1)
})
