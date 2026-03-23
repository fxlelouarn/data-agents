#!/usr/bin/env npx tsx
/**
 * Enrich pending FFA proposals with LLM-extracted data.
 *
 * For each pending FFA proposal with a source URL:
 * 1. Fetches the original FFA page
 * 2. Extracts data via LLMEventExtractor
 * 3. Enriches the proposal's changes with:
 *    - Race prices (if missing)
 *    - Better race names (if current name is generic like "Course X km")
 *    - Organizer phone/website (if missing)
 *
 * Usage:
 *   npx tsx apps/agents/src/scripts/enrich-pending-proposals.ts [options]
 *
 * Options:
 *   --limit N        Process at most N proposals (default: all)
 *   --dry-run        Don't write to DB, just show what would change
 *   --concurrency N  Parallel LLM calls (default: 5)
 *   --delay N        Delay between HTTP fetches in ms (default: 1000)
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '/Users/fx/dev/data-agents/.env.prod', override: true })
dotenv.config({ path: '/Users/fx/dev/data-agents/.env' })

import { PrismaClient } from '@prisma/client'
import axios from 'axios'
import { LLMEventExtractor } from '@data-agents/agent-framework'

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined
}
const LIMIT = getArg('limit') ? parseInt(getArg('limit')!, 10) : undefined
const DRY_RUN = args.includes('--dry-run')
const CONCURRENCY = parseInt(getArg('concurrency') || '5', 10)
const DELAY_MS = parseInt(getArg('delay') || '1000', 10)

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
const prisma = new PrismaClient()
const apiKey = process.env.LLM_MATCHING_API_KEY || process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error('ERROR: LLM_MATCHING_API_KEY or ANTHROPIC_API_KEY required')
  process.exit(1)
}
const extractor = new LLMEventExtractor({ apiKey })

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// Generic name detection
// ---------------------------------------------------------------------------
const GENERIC_NAME_PATTERNS = [
  /^Course\s+\d/i,
  /^Trail\s+\d/i,
  /^Marche\s+\d/i,
  /^Randonnée\s+\d/i,
  /^Marche Nordique\s+\d/i,
  /^Course Relais\s+\d/i,
  /^Course Enfants?\s+\d/i,
]

function isGenericName(name: string): boolean {
  return GENERIC_NAME_PATTERNS.some(p => p.test(name.trim()))
}

/**
 * Clean LLM race name: remove trailing " - Course HS non officielle" etc.
 */
function cleanLLMRaceName(name: string): string {
  return name
    .replace(/\s*-\s*Course HS non officielle$/i, '')
    .replace(/\s*-\s*Trail [X]+S[^-]*$/i, '')
    .replace(/\s*-\s*MN Label[^-]*$/i, '')
    .replace(/\s*-\s*Relais Running$/i, '')
    .trim()
}

// ---------------------------------------------------------------------------
// Race matching (by distance)
// ---------------------------------------------------------------------------
interface ExistingRace {
  name: string
  runDistance?: number       // km
  walkDistance?: number
  bikeDistance?: number
  price?: number
  startDate?: string
  startTime?: string
  categoryLevel1?: string
  categoryLevel2?: string
  runPositiveElevation?: number
  timeZone?: string
  [key: string]: any
}

interface LLMRace {
  name: string
  distance?: number          // meters
  elevation?: number
  price?: number
  startTime?: string
  categoryLevel1?: string
  description?: string
  raceDate?: string
}

/**
 * Get the primary distance in km for an existing race.
 */
function getDistanceKm(race: ExistingRace): number {
  return race.runDistance || race.walkDistance || race.bikeDistance || 0
}

/**
 * Match LLM races to existing races by distance (with 15% tolerance).
 * Returns pairs of [existingIndex, llmIndex].
 */
function matchRacesByDistance(existing: ExistingRace[], llm: LLMRace[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = []
  const usedLLM = new Set<number>()

  for (let ei = 0; ei < existing.length; ei++) {
    const eDist = getDistanceKm(existing[ei])
    let bestLLMIdx = -1
    let bestDiff = Infinity

    for (let li = 0; li < llm.length; li++) {
      if (usedLLM.has(li)) continue
      const lDistKm = (llm[li].distance || 0) / 1000
      const diff = Math.abs(eDist - lDistKm)
      const tolerance = Math.max(eDist, lDistKm) * 0.15

      if (diff <= tolerance && diff < bestDiff) {
        bestDiff = diff
        bestLLMIdx = li
      }
    }

    if (bestLLMIdx >= 0) {
      pairs.push([ei, bestLLMIdx])
      usedLLM.add(bestLLMIdx)
    }
  }

  return pairs
}

// ---------------------------------------------------------------------------
// Enrichment logic
// ---------------------------------------------------------------------------
interface EnrichmentResult {
  updated: boolean
  pricesAdded: number
  namesImproved: number
  orgFieldsAdded: string[]
}

function enrichProposal(
  changes: Record<string, any>,
  llmData: { races?: LLMRace[]; organizerName?: string; organizerEmail?: string; organizerPhone?: string; organizerWebsite?: string }
): EnrichmentResult {
  const result: EnrichmentResult = { updated: false, pricesAdded: 0, namesImproved: 0, orgFieldsAdded: [] }

  // 1. Enrich races
  const existingRaces: ExistingRace[] = changes.edition?.new?.races || []
  const llmRaces = llmData.races || []

  if (existingRaces.length > 0 && llmRaces.length > 0) {
    const pairs = matchRacesByDistance(existingRaces, llmRaces)

    for (const [ei, li] of pairs) {
      const existing = existingRaces[ei]
      const llm = llmRaces[li]

      // Add price if missing
      if (existing.price == null && llm.price != null) {
        existing.price = llm.price
        result.pricesAdded++
        result.updated = true
      }

      // Improve generic name
      if (isGenericName(existing.name) && llm.name) {
        const cleanName = cleanLLMRaceName(llm.name)
        if (cleanName && !isGenericName(cleanName) && cleanName.length > 2) {
          existing.name = cleanName
          result.namesImproved++
          result.updated = true
        }
      }
    }
  }

  // 2. Enrich organizer
  const org = changes.edition?.new?.organizer
  if (org) {
    if (!org.phone && llmData.organizerPhone) {
      org.phone = llmData.organizerPhone
      result.orgFieldsAdded.push('phone')
      result.updated = true
    }
    // Don't overwrite websiteUrl from LLM — FFA scraper may have a better one
  }

  return result
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n=== ENRICH PENDING FFA PROPOSALS ===`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : '🔴 LIVE (writing to DB)'}`)
  console.log(`Concurrency: ${CONCURRENCY} | Delay: ${DELAY_MS}ms`)
  if (LIMIT) console.log(`Limit: ${LIMIT}`)
  console.log()

  // Fetch proposals
  const limitClause = LIMIT ? `LIMIT ${LIMIT}` : ''
  const proposals = await prisma.$queryRawUnsafe<Array<{
    id: string
    eventName: string
    type: string
    changes: any
    justification: any
  }>>(
    `SELECT id, "eventName", type, changes, justification
     FROM proposals
     WHERE "agentId" = 'cmi3khznk0000g820hwxc2i8m'
       AND status = 'PENDING'
       AND type = 'NEW_EVENT'
       AND justification->0->'metadata'->>'source' IS NOT NULL
     ORDER BY "createdAt" DESC
     ${limitClause}`
  )

  console.log(`Found ${proposals.length} proposals to process.\n`)

  const stats = {
    processed: 0,
    enriched: 0,
    skipped: 0,
    fetchError: 0,
    extractError: 0,
    urlMismatch: 0,
    totalPrices: 0,
    totalNames: 0,
    totalOrgFields: 0,
  }

  for (let i = 0; i < proposals.length; i++) {
    const p = proposals[i]
    const source = p.justification?.[0]?.metadata?.source as string | undefined
    if (!source) {
      stats.skipped++
      continue
    }

    // Skip already-enriched proposals (at least one race has a price)
    const existingRaces: any[] = p.changes?.edition?.new?.races || []
    const alreadyHasPrice = existingRaces.some((r: any) => r.price != null)
    if (alreadyHasPrice) {
      stats.skipped++
      continue
    }

    stats.processed++
    const prefix = `[${i + 1}/${proposals.length}]`

    // Fetch HTML
    let html: string
    try {
      const resp = await axios.get(source, {
        timeout: 30000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DataAgentsEnrich/1.0)' },
        responseType: 'text',
      })
      html = resp.data
    } catch (err: any) {
      const status = err.response?.status
      if (status === 404) {
        console.log(`${prefix} ❌ 404 ${p.eventName} — page removed`)
      } else {
        console.log(`${prefix} ❌ FETCH ${p.eventName}: ${err.message}`)
      }
      stats.fetchError++
      await delay(DELAY_MS)
      continue
    }

    // Verify the page corresponds to the proposal (check event name in HTML)
    const htmlLower = html.toLowerCase()
    const nameWords = p.eventName.toLowerCase().split(/\s+/).filter(w => w.length >= 4)
    const matchingWords = nameWords.filter(w => htmlLower.includes(w))
    if (nameWords.length > 0 && matchingWords.length === 0) {
      console.log(`${prefix} ⚠️  URL mismatch for "${p.eventName}" — no name words found in page`)
      stats.urlMismatch++
      await delay(DELAY_MS)
      continue
    }

    // Extract with LLM
    let llmData: any
    try {
      const result = await extractor.extract(
        { type: 'html', content: html },
        { cssSelector: ['#infoPratique', '#epreuves'], context: 'Page détail FFA', timeout: 30000 }
      )

      if (!result.success || !result.data) {
        console.log(`${prefix} ❌ LLM ${p.eventName}: ${result.error}`)
        stats.extractError++
        await delay(DELAY_MS)
        continue
      }
      llmData = result.data
    } catch (err: any) {
      console.log(`${prefix} ❌ LLM ${p.eventName}: ${err.message}`)
      stats.extractError++
      await delay(DELAY_MS)
      continue
    }

    // Enrich
    const enrichResult = enrichProposal(p.changes, llmData)

    if (!enrichResult.updated) {
      console.log(`${prefix} — ${p.eventName} (no changes)`)
      await delay(DELAY_MS)
      continue
    }

    // Report
    const parts: string[] = []
    if (enrichResult.pricesAdded > 0) parts.push(`+${enrichResult.pricesAdded} prices`)
    if (enrichResult.namesImproved > 0) parts.push(`+${enrichResult.namesImproved} names`)
    if (enrichResult.orgFieldsAdded.length > 0) parts.push(`+org: ${enrichResult.orgFieldsAdded.join(',')}`)
    console.log(`${prefix} ✅ ${p.eventName} — ${parts.join(', ')}`)

    stats.enriched++
    stats.totalPrices += enrichResult.pricesAdded
    stats.totalNames += enrichResult.namesImproved
    stats.totalOrgFields += enrichResult.orgFieldsAdded.length

    // Write to DB
    if (!DRY_RUN) {
      await prisma.proposal.update({
        where: { id: p.id },
        data: { changes: p.changes as any },
      })
    }

    await delay(DELAY_MS)
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`)
  console.log(`SUMMARY${DRY_RUN ? ' (DRY RUN)' : ''}`)
  console.log(`${'='.repeat(60)}`)
  console.log(`  Processed:      ${stats.processed}`)
  console.log(`  Enriched:       ${stats.enriched}`)
  console.log(`  No changes:     ${stats.processed - stats.enriched - stats.fetchError - stats.extractError - stats.urlMismatch}`)
  console.log(`  Fetch errors:   ${stats.fetchError}`)
  console.log(`  Extract errors: ${stats.extractError}`)
  console.log(`  URL mismatches: ${stats.urlMismatch}`)
  console.log(`  ---`)
  console.log(`  Prices added:   ${stats.totalPrices}`)
  console.log(`  Names improved: ${stats.totalNames}`)
  console.log(`  Org fields:     ${stats.totalOrgFields}`)
  console.log()

  await prisma.$disconnect()
}

main().catch(err => {
  console.error('Fatal error:', err)
  prisma.$disconnect()
  process.exit(1)
})
