#!/usr/bin/env npx tsx
/**
 * Dry-run the LLM event extractor on 15 pending FFA proposals.
 *
 * Fetches the source HTML from FFA, runs LLMEventExtractor.extract(),
 * and compares the LLM output with the existing proposal changes.
 *
 * Usage:
 *   npx tsx apps/agents/src/scripts/dry-run-llm-extractor.ts [--limit N]
 *
 * Environment variables (loaded from .env.prod):
 *   DATABASE_URL           - data-agents database
 *   LLM_MATCHING_API_KEY   - Anthropic API key (falls back to ANTHROPIC_API_KEY)
 */

import * as dotenv from 'dotenv'
// Load .env.prod for DATABASE_URL (override=true to ensure prod DB is used)
dotenv.config({ path: '/Users/fx/dev/data-agents/.env.prod', override: true })
// Load .env for API keys (override=false to keep prod DATABASE_URL)
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
const LIMIT = parseInt(getArg('limit') || '15', 10)
const DELAY_MS = 2000

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
const prisma = new PrismaClient()

const apiKey = process.env.LLM_MATCHING_API_KEY || process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error('ERROR: LLM_MATCHING_API_KEY or ANTHROPIC_API_KEY environment variable is required')
  process.exit(1)
}

const extractor = new LLMEventExtractor({ apiKey })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ExistingRace {
  name: string
  runDistance?: number
  price?: number
  startDate?: string
  categoryLevel1?: string
  categoryLevel2?: string
  runPositiveElevation?: number
  raceId?: number
  raceName?: string
}

interface LLMRace {
  name: string
  distance?: number // meters
  price?: number
  startTime?: string
  categoryLevel1?: string
  elevation?: number
  description?: string
  raceDate?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function extractExistingRaces(changes: Record<string, any>): ExistingRace[] {
  // NEW_EVENT: changes.edition.new.races
  if (changes.edition?.new?.races) {
    return changes.edition.new.races
  }
  // EDITION_UPDATE with racesToUpdate
  if (changes.racesToUpdate?.new) {
    return changes.racesToUpdate.new.map((r: any) => ({
      name: r.raceName || r.currentData?.name || '?',
      runDistance: r.currentData?.runDistance ?? r.updates?.runDistance?.new,
      startDate: r.currentData?.startDate,
      categoryLevel1: r.currentData?.categoryLevel1,
      runPositiveElevation: r.currentData?.runPositiveElevation ?? r.updates?.runPositiveElevation?.new,
    }))
  }
  // EDITION_UPDATE with racesExisting
  if (changes.racesExisting?.new) {
    return changes.racesExisting.new.map((r: any) => ({
      name: r.raceName || '?',
      runDistance: r.runDistance,
      startDate: r.startDate,
      categoryLevel1: r.categoryLevel1,
      runPositiveElevation: r.runPositiveElevation,
    }))
  }
  return []
}

function extractExistingOrganizer(changes: Record<string, any>): { name?: string; email?: string; website?: string } | null {
  if (changes.edition?.new?.organizer) {
    return changes.edition.new.organizer
  }
  return null
}

function distDisplay(distKm: number | undefined, distMeters: number | undefined): string {
  if (distKm != null && distKm > 0) return `${distKm}km`
  if (distMeters != null && distMeters > 0) {
    return distMeters >= 1000 ? `${(distMeters / 1000).toFixed(1)}km` : `${distMeters}m`
  }
  return '-'
}

function timeFromISO(iso: string | undefined): string {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`
  } catch { return '-' }
}

function padRight(s: string, len: number): string {
  return s.length >= len ? s.substring(0, len) : s + ' '.repeat(len - s.length)
}

function padLeft(s: string, len: number): string {
  return s.length >= len ? s.substring(0, len) : ' '.repeat(len - s.length) + s
}

function printRaceComparison(existingRaces: ExistingRace[], llmRaces: LLMRace[]) {
  console.log('')
  console.log('  EXISTING RACES (FFA scraper):')
  if (existingRaces.length === 0) {
    console.log('    (none)')
  } else {
    console.log(`    ${padRight('Name', 35)} ${padLeft('Dist', 10)} ${padLeft('D+', 6)} ${padLeft('Time', 6)} ${padLeft('Price', 6)} ${padRight('Cat', 10)}`)
    console.log(`    ${'-'.repeat(35)} ${'-'.repeat(10)} ${'-'.repeat(6)} ${'-'.repeat(6)} ${'-'.repeat(6)} ${'-'.repeat(10)}`)
    for (const r of existingRaces) {
      const dist = distDisplay(r.runDistance, undefined)
      const elev = r.runPositiveElevation != null ? `${r.runPositiveElevation}` : '-'
      const time = timeFromISO(r.startDate)
      const price = r.price != null ? `${r.price}e` : '-'
      const cat = r.categoryLevel1 || '-'
      console.log(`    ${padRight(r.name || r.raceName || '?', 35)} ${padLeft(dist, 10)} ${padLeft(elev, 6)} ${padLeft(time, 6)} ${padLeft(price, 6)} ${padRight(cat, 10)}`)
    }
  }

  console.log('')
  console.log('  LLM EXTRACTED RACES:')
  if (llmRaces.length === 0) {
    console.log('    (none)')
  } else {
    console.log(`    ${padRight('Name', 35)} ${padLeft('Dist', 10)} ${padLeft('D+', 6)} ${padLeft('Time', 6)} ${padLeft('Price', 6)} ${padRight('Cat', 10)} Description`)
    console.log(`    ${'-'.repeat(35)} ${'-'.repeat(10)} ${'-'.repeat(6)} ${'-'.repeat(6)} ${'-'.repeat(6)} ${'-'.repeat(10)} ${'-'.repeat(20)}`)
    for (const r of llmRaces) {
      const dist = distDisplay(undefined, r.distance)
      const elev = r.elevation != null ? `${r.elevation}` : '-'
      const time = r.startTime || '-'
      const price = r.price != null ? `${r.price}e` : '-'
      const cat = r.categoryLevel1 || '-'
      const desc = r.description || ''
      console.log(`    ${padRight(r.name, 35)} ${padLeft(dist, 10)} ${padLeft(elev, 6)} ${padLeft(time, 6)} ${padLeft(price, 6)} ${padRight(cat, 10)} ${desc}`)
    }
  }
}

function printNewFields(existingOrg: { name?: string; email?: string; website?: string } | null, llmData: any) {
  const newFields: string[] = []

  // Compare organizer
  if (llmData.organizerName && !existingOrg?.name) newFields.push(`organizerName: ${llmData.organizerName}`)
  if (llmData.organizerEmail && !existingOrg?.email) newFields.push(`organizerEmail: ${llmData.organizerEmail}`)
  if (llmData.organizerPhone) newFields.push(`organizerPhone: ${llmData.organizerPhone}`)
  if (llmData.organizerWebsite && !existingOrg?.website) newFields.push(`organizerWebsite: ${llmData.organizerWebsite}`)
  if (llmData.registrationUrl) newFields.push(`registrationUrl: ${llmData.registrationUrl}`)

  // Check for prices in LLM but not in existing
  const llmRacesWithPrice = (llmData.races || []).filter((r: any) => r.price != null)
  if (llmRacesWithPrice.length > 0) {
    newFields.push(`${llmRacesWithPrice.length} races with prices extracted`)
  }

  // Check for descriptions
  const llmRacesWithDesc = (llmData.races || []).filter((r: any) => r.description)
  if (llmRacesWithDesc.length > 0) {
    newFields.push(`${llmRacesWithDesc.length} races with descriptions`)
  }

  if (newFields.length > 0) {
    console.log('')
    console.log('  NEW/ADDITIONAL FIELDS from LLM:')
    for (const f of newFields) {
      console.log(`    + ${f}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n=== DRY-RUN LLM EVENT EXTRACTOR ===`)
  console.log(`Fetching ${LIMIT} pending FFA proposals with source URLs...\n`)

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
       AND justification->0->'metadata'->>'source' IS NOT NULL
     ORDER BY "createdAt" DESC
     LIMIT $1`,
    LIMIT
  )

  console.log(`Found ${proposals.length} proposals.\n`)

  const stats = {
    processed: 0,
    success: 0,
    fetchError: 0,
    extractError: 0,
    moreRaces: 0,
    fewerRaces: 0,
    sameRaces: 0,
    pricesFound: 0,
    descriptionsFound: 0,
  }

  for (let i = 0; i < proposals.length; i++) {
    const p = proposals[i]
    const source = p.justification?.[0]?.metadata?.source as string | undefined
    if (!source) {
      console.log(`[${i + 1}/${proposals.length}] ${p.id} - No source URL, skipping`)
      continue
    }

    console.log(`${'='.repeat(80)}`)
    console.log(`[${i + 1}/${proposals.length}] ${p.eventName} (${p.type})`)
    console.log(`  Proposal: ${p.id}`)
    console.log(`  Source:   ${source}`)

    // Fetch HTML
    let html: string
    try {
      const resp = await axios.get(source, {
        timeout: 30000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DataAgentsDryRun/1.0)' },
        responseType: 'text',
      })
      html = resp.data
      console.log(`  HTML:     ${html.length} bytes`)
    } catch (err: any) {
      console.log(`  FETCH ERROR: ${err.message}`)
      stats.fetchError++
      stats.processed++
      if (i < proposals.length - 1) await delay(DELAY_MS)
      continue
    }

    // Extract with LLM
    try {
      const result = await extractor.extract(
        { type: 'html', content: html },
        { context: 'Page détail FFA', timeout: 30000 }
      )

      if (!result.success || !result.data) {
        console.log(`  EXTRACTION FAILED: ${result.error}`)
        stats.extractError++
        stats.processed++
        if (i < proposals.length - 1) await delay(DELAY_MS)
        continue
      }

      const llm = result.data
      console.log(`  LLM conf: ${llm.confidence} | Event: "${llm.eventName}" | City: ${llm.eventCity || '-'} | Date: ${llm.editionDate || '-'}`)

      // Compare races
      const existingRaces = extractExistingRaces(p.changes)
      const llmRaces = llm.races || []
      const existingOrg = extractExistingOrganizer(p.changes)

      console.log(`  Races:    existing=${existingRaces.length}, LLM=${llmRaces.length} ${llmRaces.length > existingRaces.length ? '(+NEW!)' : llmRaces.length < existingRaces.length ? '(fewer)' : '(same count)'}`)

      if (llmRaces.length > existingRaces.length) stats.moreRaces++
      else if (llmRaces.length < existingRaces.length) stats.fewerRaces++
      else stats.sameRaces++

      if (llmRaces.some((r: any) => r.price != null)) stats.pricesFound++
      if (llmRaces.some((r: any) => r.description)) stats.descriptionsFound++

      printRaceComparison(existingRaces, llmRaces)
      printNewFields(existingOrg, llm)

      // Organizer comparison
      if (existingOrg || llm.organizerName) {
        console.log('')
        console.log('  ORGANIZER:')
        if (existingOrg?.name) console.log(`    Existing: ${existingOrg.name} | ${existingOrg.email || '-'}`)
        if (llm.organizerName) console.log(`    LLM:      ${llm.organizerName} | ${llm.organizerEmail || '-'} | ${llm.organizerPhone || '-'}`)
      }

      stats.success++
    } catch (err: any) {
      console.log(`  EXTRACTION ERROR: ${err.message}`)
      stats.extractError++
    }

    stats.processed++
    if (i < proposals.length - 1) {
      await delay(DELAY_MS)
    }
  }

  // Summary
  console.log(`\n${'='.repeat(80)}`)
  console.log('SUMMARY')
  console.log(`${'='.repeat(80)}`)
  console.log(`  Processed:        ${stats.processed}`)
  console.log(`  Successful:       ${stats.success}`)
  console.log(`  Fetch errors:     ${stats.fetchError}`)
  console.log(`  Extract errors:   ${stats.extractError}`)
  console.log(`  More races (LLM): ${stats.moreRaces}`)
  console.log(`  Fewer races:      ${stats.fewerRaces}`)
  console.log(`  Same count:       ${stats.sameRaces}`)
  console.log(`  With prices:      ${stats.pricesFound}`)
  console.log(`  With descriptions:${stats.descriptionsFound}`)

  await prisma.$disconnect()
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

main().catch(async (err) => {
  console.error('Fatal error:', err)
  await prisma.$disconnect()
  process.exit(1)
})
