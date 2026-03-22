#!/usr/bin/env npx tsx
/**
 * Re-verify existing PENDING Google proposals by checking their source pages.
 *
 * Usage:
 *   npx tsx apps/agents/src/scripts/verify-google-proposals.ts [--dry-run] [--limit N]
 *
 * Environment variables required:
 *   DATABASE_URL         - data-agents database
 *   ANTHROPIC_API_KEY    - Anthropic API key (used by verifyDateFromSource)
 */

import { PrismaClient } from '@prisma/client'
import { verifyDateFromSource } from '../google/date-verifier'

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined
}
const hasFlag = (name: string) => args.includes(`--${name}`)

const LIMIT = parseInt(getArg('limit') || '9999', 10)
const DRY_RUN = hasFlag('dry-run')
const DELAY_MS = 500

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
const prisma = new PrismaClient()

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error('❌ ANTHROPIC_API_KEY environment variable is required')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
const stats = {
  processed: 0,
  confirmed: 0,
  archivedNotConfirmed: 0,
  archivedInaccessible: 0,
  errors: 0,
  startTime: Date.now(),
}

// ---------------------------------------------------------------------------
// Archive helper
// ---------------------------------------------------------------------------
async function archiveProposal(proposalId: string, reason: string): Promise<void> {
  if (DRY_RUN) return

  await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      status: 'ARCHIVED',
      reviewedAt: new Date(),
      reviewedBy: 'google-date-verification-script',
      modificationReason: reason,
    },
  })
}

// ---------------------------------------------------------------------------
// Sleep helper
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Verify PENDING Google proposals ===')
  console.log(`Limit: ${LIMIT}, Dry-run: ${DRY_RUN}`)
  console.log()

  // Find the Google Search Date agent
  const googleAgent = await prisma.agent.findFirst({
    where: {
      config: {
        path: ['agentType'],
        equals: 'GOOGLE_SEARCH_DATE',
      },
    },
  })

  if (!googleAgent) {
    console.error('❌ GOOGLE_SEARCH_DATE agent not found in agents table')
    process.exit(1)
  }

  console.log(`✅ Found Google agent: "${googleAgent.name}" (id: ${googleAgent.id})`)

  // Fetch PENDING EDITION_UPDATE proposals from the Google agent
  const proposals = await prisma.proposal.findMany({
    where: {
      agentId: googleAgent.id,
      status: 'PENDING',
      type: 'EDITION_UPDATE',
    },
    orderBy: { createdAt: 'asc' },
    take: LIMIT,
  })

  console.log(`Found ${proposals.length} PENDING EDITION_UPDATE proposals from Google agent\n`)

  for (const proposal of proposals) {
    stats.processed++
    const changes = proposal.changes as Record<string, any>
    const justification = (proposal.justification as any[]) || []

    // Extract source URL from justification[0].metadata.source
    const firstJustification = justification[0] || {}
    const rawSource = firstJustification?.metadata?.source
    const sourceUrl: string | null = Array.isArray(rawSource)
      ? (rawSource[0] as string) || null
      : (rawSource as string) || null

    // Extract proposed date from changes.startDate.new
    const rawDate = changes?.startDate?.new
    let dateStr: string | null = null
    if (rawDate) {
      try {
        const d = new Date(rawDate)
        if (!isNaN(d.getTime())) {
          dateStr = d.toISOString().slice(0, 10) // YYYY-MM-DD
        }
      } catch {
        // ignore
      }
    }

    const eventName = proposal.eventName || ''
    const label = `[${stats.processed}/${proposals.length}] "${eventName}" (${proposal.id})`

    // --- No source URL ---
    if (!sourceUrl) {
      stats.archivedInaccessible++
      console.log(`${label} — ⚠️  No source URL → archiving`)
      if (DRY_RUN) {
        console.log(`  🔍 [DRY-RUN] Would archive: "No source URL"`)
      } else {
        await archiveProposal(proposal.id, 'No source URL')
      }
      continue
    }

    // --- No date to verify ---
    if (!dateStr) {
      stats.archivedInaccessible++
      console.log(`${label} — ⚠️  No valid date in changes.startDate.new → archiving`)
      if (DRY_RUN) {
        console.log(`  🔍 [DRY-RUN] Would archive: "No valid date to verify"`)
      } else {
        await archiveProposal(proposal.id, 'No valid date to verify')
      }
      continue
    }

    console.log(`${label}`)
    console.log(`  URL: ${sourceUrl}`)
    console.log(`  Date: ${dateStr}`)

    try {
      const result = await verifyDateFromSource(sourceUrl, dateStr, eventName, undefined, apiKey)

      if (result === null) {
        // Page inaccessible or unparseable
        stats.archivedInaccessible++
        const reason = 'Source page inaccessible'
        console.log(`  ❌ Page inaccessible → archiving`)
        if (DRY_RUN) {
          console.log(`  🔍 [DRY-RUN] Would archive: "${reason}"`)
        } else {
          await archiveProposal(proposal.id, reason)
        }
      } else if (result.confirmed) {
        stats.confirmed++
        console.log(`  ✅ Confirmed: ${result.reason}`)
      } else {
        stats.archivedNotConfirmed++
        const reason = `Date not confirmed: ${result.reason}`
        console.log(`  ❌ Not confirmed: ${result.reason} → archiving`)
        if (DRY_RUN) {
          console.log(`  🔍 [DRY-RUN] Would archive: "${reason}"`)
        } else {
          await archiveProposal(proposal.id, reason)
        }
      }
    } catch (error: any) {
      stats.errors++
      console.error(`  ❌ Error: ${error.message}`)
    }

    // Delay between requests to avoid rate limiting
    await sleep(DELAY_MS)
  }

  printReport()

  await prisma.$disconnect()
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
function printReport() {
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1)

  console.log('\n========================================')
  console.log(`=== Google Date Verification - Rapport ${DRY_RUN ? '(DRY-RUN)' : ''} ===`)
  console.log('========================================')
  console.log(`\nPropositions traitées :       ${stats.processed}`)
  console.log(`  ✅ Confirmées :              ${stats.confirmed}`)
  console.log(`  ❌ Archivées (non confirmé): ${stats.archivedNotConfirmed}`)
  console.log(`  ⚠️  Archivées (inaccessible): ${stats.archivedInaccessible}`)
  console.log(`  💥 Erreurs :                 ${stats.errors}`)
  console.log(`\nDurée : ${elapsed}s`)
  console.log('========================================')
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
