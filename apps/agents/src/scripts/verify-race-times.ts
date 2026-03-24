#!/usr/bin/env npx tsx
/**
 * Verify and fix race start times in pending FFA proposals.
 *
 * For each proposal with a source URL:
 * 1. Fetches the FFA page
 * 2. Parses the race start times from the HTML (cheerio)
 * 3. Compares with the stored startDate in the proposal
 * 4. Reports and optionally fixes mismatches
 *
 * Usage:
 *   npx tsx apps/agents/src/scripts/verify-race-times.ts --limit 5
 *   npx tsx apps/agents/src/scripts/verify-race-times.ts --since 2026-03-22 --dry-run
 *   npx tsx apps/agents/src/scripts/verify-race-times.ts --id cmn3rg9p10nolis1ein35tg70
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '/Users/fx/dev/data-agents/.env.prod', override: true })
dotenv.config({ path: '/Users/fx/dev/data-agents/.env' })

import { PrismaClient } from '@prisma/client'
import axios from 'axios'
import * as cheerio from 'cheerio'
import { fromZonedTime } from 'date-fns-tz'

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined
}
const LIMIT = getArg('limit') ? parseInt(getArg('limit')!, 10) : undefined
const SINCE = getArg('since')
const PROPOSAL_ID = getArg('id')
const DRY_RUN = args.includes('--dry-run')
const DELAY_MS = parseInt(getArg('delay') || '1000', 10)

const prisma = new PrismaClient()
const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// Parse race times from FFA HTML (same logic as parser.ts)
// ---------------------------------------------------------------------------
interface ParsedRace {
  name: string
  startTime?: string  // HH:mm local time
  raceDate?: string   // DD/MM for multi-day
}

function parseRaceTimesFromHtml(html: string): ParsedRace[] {
  const $ = cheerio.load(html)
  const races: ParsedRace[] = []

  const $epreuves = $('#epreuves')
  if (!$epreuves.length) return races

  $epreuves.find('.club-card').each((_, element) => {
    const raceTitle = $(element).find('h3').text().trim()
    if (!raceTitle) return

    let startTime: string | undefined
    let raceDate: string | undefined
    let cleanedName = raceTitle

    // Format multi-jours: "03/04 05:30 - Course name"
    const dateMatch = raceTitle.match(/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2})/)
    if (dateMatch) {
      raceDate = `${dateMatch[1]}/${dateMatch[2]}`
      startTime = `${dateMatch[3].padStart(2, '0')}:${dateMatch[4]}`
      cleanedName = raceTitle.replace(/^\d{1,2}\/\d{2}\s+\d{1,2}:\d{2}\s*-?\s*/, '')
    } else {
      // Format 1 jour: "14:00 - Course name"
      const timeMatch = raceTitle.match(/(\d{1,2}):(\d{2})/)
      if (timeMatch) {
        startTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
        cleanedName = raceTitle.replace(/^\d{1,2}:\d{2}\s*-?\s*/, '')
      }
    }

    races.push({ name: cleanedName.trim(), startTime, raceDate })
  })

  return races
}

// ---------------------------------------------------------------------------
// Convert local time to UTC
// ---------------------------------------------------------------------------
function localTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const localDateStr = `${dateStr}T${timeStr}:00`
  return fromZonedTime(localDateStr, timeZone)
}

// ---------------------------------------------------------------------------
// Extract stored races from proposal changes
// ---------------------------------------------------------------------------
interface StoredRace {
  name: string
  startDate?: string  // ISO UTC
  index: number
  path: string        // where in changes this race lives
}

function extractStoredRaces(changes: any): { races: StoredRace[], timeZone: string } {
  const timeZone = changes.edition?.new?.timeZone || changes.timeZone?.new || 'Europe/Paris'
  const races: StoredRace[] = []

  // NEW_EVENT: changes.edition.new.races
  const editionRaces = changes.edition?.new?.races || []
  editionRaces.forEach((r: any, i: number) => {
    races.push({
      name: r.name,
      startDate: r.startDate,
      index: i,
      path: `edition.new.races[${i}]`,
    })
  })

  // EDITION_UPDATE: changes.racesToUpdate.new
  const racesToUpdate = changes.racesToUpdate?.new || []
  racesToUpdate.forEach((r: any, i: number) => {
    races.push({
      name: r.raceName || r.currentData?.name || '?',
      startDate: r.updates?.startDate?.new,
      index: i,
      path: `racesToUpdate.new[${i}]`,
    })
  })

  return { races, timeZone }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n=== VERIFY RACE START TIMES ===`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : '🔴 LIVE (will fix mismatches)'}`)
  if (PROPOSAL_ID) console.log(`Single proposal: ${PROPOSAL_ID}`)
  if (SINCE) console.log(`Since: ${SINCE}`)
  if (LIMIT) console.log(`Limit: ${LIMIT}`)
  console.log()

  // Build query
  let whereClause = `"agentId" = 'cmi3khznk0000g820hwxc2i8m' AND status = 'PENDING'`
  if (PROPOSAL_ID) {
    whereClause = `id = '${PROPOSAL_ID}'`
  } else {
    if (SINCE) whereClause += ` AND "createdAt" >= '${SINCE}'`
    whereClause += ` AND justification->0->'metadata'->>'source' IS NOT NULL`
  }
  const limitClause = LIMIT ? `LIMIT ${LIMIT}` : ''

  const proposals = await prisma.$queryRawUnsafe<Array<{
    id: string
    eventName: string
    type: string
    changes: any
    justification: any
  }>>(
    `SELECT id, "eventName", type, changes, justification
     FROM proposals WHERE ${whereClause}
     ORDER BY "createdAt" DESC ${limitClause}`
  )

  console.log(`Found ${proposals.length} proposals.\n`)

  const stats = {
    processed: 0,
    correct: 0,
    mismatch: 0,
    fixed: 0,
    noRaces: 0,
    fetchError: 0,
    noSourceTime: 0,
  }

  for (let i = 0; i < proposals.length; i++) {
    const p = proposals[i]
    const source = p.justification?.[0]?.metadata?.source as string | undefined
    if (!source) continue

    stats.processed++
    const prefix = `[${i + 1}/${proposals.length}]`

    // Get stored races
    const { races: storedRaces, timeZone } = extractStoredRaces(p.changes)
    if (storedRaces.length === 0 || storedRaces.every(r => !r.startDate)) {
      stats.noRaces++
      continue
    }

    // Fetch FFA page
    let html: string
    try {
      const resp = await axios.get(source, {
        timeout: 30000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DataAgentsVerify/1.0)' },
        responseType: 'text',
      })
      html = resp.data
    } catch (err: any) {
      console.log(`${prefix} ❌ FETCH ${p.eventName}: ${err.message}`)
      stats.fetchError++
      await delay(DELAY_MS)
      continue
    }

    // Parse race times from HTML
    const parsedRaces = parseRaceTimesFromHtml(html)
    if (parsedRaces.length === 0 || parsedRaces.every(r => !r.startTime)) {
      stats.noSourceTime++
      continue
    }

    // Determine the base date for conversion
    // Try multiple sources: edition startDate, first stored race startDate, editionYear
    const editionStartDate = p.changes.edition?.new?.startDate || p.changes.startDate?.new
    let baseDateStr: string | undefined
    if (editionStartDate) {
      const d = new Date(editionStartDate)
      baseDateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    }
    // Fallback: use the first stored race's startDate
    if (!baseDateStr) {
      const firstRaceWithDate = storedRaces.find(r => r.startDate)
      if (firstRaceWithDate?.startDate) {
        const d = new Date(firstRaceWithDate.startDate)
        baseDateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
      }
    }

    // Compare each race
    let hasAnyMismatch = false
    const fixes: Array<{ storedIdx: number, oldUtc: string, newUtc: string, raceName: string }> = []
    const usedStoredIndices = new Set<number>()

    for (let pi = 0; pi < parsedRaces.length; pi++) {
      const parsed = parsedRaces[pi]
      if (!parsed.startTime) continue

      // Determine the date for this race
      let raceDateStr = baseDateStr
      if (parsed.raceDate) {
        const [dayStr, monthStr] = parsed.raceDate.split('/')
        const year = baseDateStr ? baseDateStr.substring(0, 4) : '2026'
        raceDateStr = `${year}-${monthStr}-${dayStr.padStart(2, '0')}`
      }

      if (!raceDateStr) continue

      // Compute expected UTC
      const expectedUtc = localTimeToUtc(raceDateStr, parsed.startTime, timeZone)
      const expectedIso = expectedUtc.toISOString()

      // Find matching stored race: first try name similarity, then fall back to index
      let matchingStored: StoredRace | undefined

      // Strategy 1: match by name (skip already used)
      const parsedWords = parsed.name.toLowerCase().split(/\s+/).filter(w => w.length >= 3)
      for (const sr of storedRaces) {
        if (!sr.startDate || usedStoredIndices.has(sr.index)) continue
        const storedWords = sr.name.toLowerCase().split(/\s+/).filter(w => w.length >= 3)
        if (parsedWords.some(pw => storedWords.some(sw => sw.includes(pw) || pw.includes(sw)))) {
          matchingStored = sr
          break
        }
      }

      // Strategy 2: fall back to same index position
      if (!matchingStored && pi < storedRaces.length && storedRaces[pi].startDate && !usedStoredIndices.has(storedRaces[pi].index)) {
        matchingStored = storedRaces[pi]
      }

      if (!matchingStored || !matchingStored.startDate) continue
      usedStoredIndices.add(matchingStored.index)

      const storedUtc = matchingStored.startDate
      const storedDate = new Date(storedUtc)
      const diffMinutes = Math.abs(expectedUtc.getTime() - storedDate.getTime()) / (1000 * 60)

      if (diffMinutes > 5) {
        hasAnyMismatch = true
        const storedLocal = new Date(storedDate.getTime() + getOffsetMs(storedUtc, timeZone))
        const expectedLocal = new Date(expectedUtc.getTime() + getOffsetMs(expectedIso, timeZone))

        console.log(`${prefix} ⚠️  ${p.eventName} — "${parsed.name}"`)
        console.log(`         FFA page: ${parsed.startTime} local (${raceDateStr})`)
        console.log(`         Expected UTC: ${expectedIso}`)
        console.log(`         Stored UTC:   ${storedUtc}`)
        console.log(`         Diff: ${diffMinutes.toFixed(0)} minutes`)

        fixes.push({
          storedIdx: matchingStored.index,
          oldUtc: storedUtc,
          newUtc: expectedIso,
          raceName: parsed.name,
        })
      }
    }

    if (!hasAnyMismatch) {
      console.log(`${prefix} ✅ ${p.eventName} — all times correct`)
      stats.correct++
    } else {
      stats.mismatch++

      // Apply fixes
      if (!DRY_RUN && fixes.length > 0) {
        let changed = false
        for (const fix of fixes) {
          // Fix in edition.new.races
          const edRaces = p.changes.edition?.new?.races
          if (edRaces && edRaces[fix.storedIdx]) {
            edRaces[fix.storedIdx].startDate = fix.newUtc
            changed = true
          }
          // Fix in racesToUpdate
          const rtUpdate = p.changes.racesToUpdate?.new
          if (rtUpdate && rtUpdate[fix.storedIdx]?.updates?.startDate) {
            rtUpdate[fix.storedIdx].updates.startDate.new = fix.newUtc
            changed = true
          }
        }

        // Also fix edition startDate/endDate if they match the wrong time
        if (p.changes.edition?.new?.startDate || p.changes.startDate?.new) {
          const edStart = p.changes.edition?.new?.startDate || p.changes.startDate?.new
          const matchingFix = fixes.find(f => f.oldUtc === edStart)
          if (matchingFix) {
            if (p.changes.edition?.new?.startDate) p.changes.edition.new.startDate = matchingFix.newUtc
            if (p.changes.startDate?.new) p.changes.startDate.new = matchingFix.newUtc
            changed = true
          }
          // Same for endDate
          const edEnd = p.changes.edition?.new?.endDate || p.changes.endDate?.new
          const endFix = fixes.find(f => f.oldUtc === edEnd)
          if (endFix) {
            if (p.changes.edition?.new?.endDate) p.changes.edition.new.endDate = endFix.newUtc
            if (p.changes.endDate?.new) p.changes.endDate.new = endFix.newUtc
            changed = true
          }
        }

        if (changed) {
          await prisma.proposal.update({
            where: { id: p.id },
            data: { changes: p.changes as any },
          })
          console.log(`         → FIXED ${fixes.length} race(s)`)
          stats.fixed++
        }
      }
    }

    await delay(DELAY_MS)
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`SUMMARY${DRY_RUN ? ' (DRY RUN)' : ''}`)
  console.log(`${'='.repeat(50)}`)
  console.log(`  Processed:    ${stats.processed}`)
  console.log(`  Correct:      ${stats.correct}`)
  console.log(`  Mismatch:     ${stats.mismatch}`)
  console.log(`  Fixed:        ${stats.fixed}`)
  console.log(`  No races:     ${stats.noRaces}`)
  console.log(`  No source:    ${stats.noSourceTime}`)
  console.log(`  Fetch errors: ${stats.fetchError}`)
  console.log()

  await prisma.$disconnect()
}

function getOffsetMs(isoDate: string, timeZone: string): number {
  const date = new Date(isoDate)
  const utcMs = date.getTime()
  const localStr = date.toLocaleString('en-US', { timeZone })
  const localMs = new Date(localStr).getTime()
  return localMs - utcMs
}

main().catch(err => {
  console.error('Fatal error:', err)
  prisma.$disconnect()
  process.exit(1)
})
