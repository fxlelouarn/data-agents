/**
 * Script to clean event names in:
 * 1. PENDING NEW_EVENT proposals (changes.name.new)
 * 2. Miles Republic Event table (name)
 *
 * Usage:
 *   npx tsx scripts/fix-event-names.ts --dry-run          # Preview changes
 *   npx tsx scripts/fix-event-names.ts                     # Apply changes
 *   npx tsx scripts/fix-event-names.ts --proposals-only    # Only fix proposals
 *   npx tsx scripts/fix-event-names.ts --events-only       # Only fix MR events
 */

import { PrismaClient } from '@prisma/client'
import { cleanEventNameForCreation } from '@data-agents/agent-framework'
import { execSync } from 'child_process'

const dryRun = process.argv.includes('--dry-run')
const proposalsOnly = process.argv.includes('--proposals-only')
const eventsOnly = process.argv.includes('--events-only')

const prisma = new PrismaClient()
const mrUrl = process.env.MILES_REPUBLIC_DATABASE_URL!

function mrQuery(sql: string): string {
  return execSync(`psql "${mrUrl}" -t -A -c "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf-8' })
}

async function fixProposals() {
  console.log('\n=== PENDING NEW_EVENT proposals ===\n')

  const proposals = await prisma.$queryRawUnsafe<{ id: string; changes: any }[]>(`
    SELECT id, changes
    FROM proposals
    WHERE type = 'NEW_EVENT' AND status = 'PENDING'
      AND changes->'name'->>'new' IS NOT NULL
  `)

  console.log(`Found ${proposals.length} proposals to check`)

  let fixed = 0
  for (const p of proposals) {
    const oldName = p.changes?.name?.new
    if (!oldName) continue

    const newName = cleanEventNameForCreation(oldName)
    if (newName === oldName || !newName) continue

    console.log(`  ${oldName.padEnd(55)} → ${newName}`)
    fixed++

    if (!dryRun) {
      const updatedChanges = { ...p.changes, name: { ...p.changes.name, new: newName } }
      await prisma.$executeRawUnsafe(
        `UPDATE proposals SET changes = $1::jsonb, "eventName" = $2 WHERE id = $3`,
        JSON.stringify(updatedChanges),
        newName,
        p.id
      )
    }
  }

  console.log(`\n${dryRun ? '[DRY RUN] Would fix' : 'Fixed'} ${fixed}/${proposals.length} proposals`)
}

async function fixEvents() {
  console.log('\n=== Miles Republic Events ===\n')

  const rows = mrQuery(`SELECT id, name FROM "Event"`).trim().split('\n').filter(Boolean)
  console.log(`Found ${rows.length} events to check`)

  let fixed = 0
  let skipped = 0
  const updates: { id: number; newName: string }[] = []

  for (const row of rows) {
    const sepIdx = row.indexOf('|')
    const id = parseInt(row.substring(0, sepIdx))
    const name = row.substring(sepIdx + 1)

    const newName = cleanEventNameForCreation(name)
    if (newName === name || !newName) {
      skipped++
      continue
    }

    console.log(`  [${id}] ${name.padEnd(55)} → ${newName}`)
    updates.push({ id, newName })
    fixed++
  }

  if (!dryRun && updates.length > 0) {
    console.log(`\nApplying ${updates.length} updates...`)
    for (const { id, newName } of updates) {
      const escaped = newName.replace(/'/g, "''")
      mrQuery(`UPDATE "Event" SET name = '${escaped}' WHERE id = ${id}`)
    }
  }

  console.log(`\n${dryRun ? '[DRY RUN] Would fix' : 'Fixed'} ${fixed}/${rows.length} events (${skipped} already clean)`)
}

async function main() {
  console.log(dryRun ? '🧪 DRY RUN MODE\n' : '🚀 APPLYING CHANGES\n')

  if (!eventsOnly) await fixProposals()
  if (!proposalsOnly) await fixEvents()

  await prisma.$disconnect()
}

main().catch(console.error)
