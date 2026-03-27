#!/usr/bin/env npx tsx
/**
 * Rebuild EDITION_UPDATE proposals from scratch using the corrected pipeline.
 *
 * For each EDITION_UPDATE proposal with a FFA source URL:
 * 1. Fetches the FFA page
 * 2. Extracts data via LLMEventExtractor
 * 3. Gets existing races from Miles Republic
 * 4. Matches races via LLM
 * 5. Rebuilds changes via shared builder
 * 6. Gets LLM confidence review score
 * 7. Updates the proposal
 *
 * Usage:
 *   npx tsx apps/agents/src/scripts/rebuild-edition-updates.ts --dry-run --limit 5
 *   npx tsx apps/agents/src/scripts/rebuild-edition-updates.ts --future-only --limit 200
 *   npx tsx apps/agents/src/scripts/rebuild-edition-updates.ts --id cmn41ieef1r1vis1emm4hk0wm
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '/Users/fx/dev/data-agents/.env.prod', override: true })
dotenv.config({ path: '/Users/fx/dev/data-agents/.env' })

import { PrismaClient } from '@prisma/client'
import axios from 'axios'
import {
  LLMEventExtractor,
  LLMMatchingService,
  LLMMatchingConfig,
  buildEditionUpdateChanges,
  createConsoleLogger,
  DatabaseManager,
  DbRace,
  reviewEditionUpdateConfidence,
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
const FUTURE_ONLY = args.includes('--future-only')
const SPREAD_FIX = args.includes('--spread-fix')
const MIN_SPREAD_DAYS = parseInt(getArg('min-spread') || '2', 10)
const DELAY_MS = parseInt(getArg('delay') || '1000', 10)
const OFFSET = parseInt(getArg('offset') || '0', 10)

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
const prisma = new PrismaClient()
const logger = createConsoleLogger('REBUILD', 'script')

const apiKey = process.env.LLM_MATCHING_API_KEY
if (!apiKey) {
  console.error('ERROR: LLM_MATCHING_API_KEY required')
  process.exit(1)
}

const extractor = new LLMEventExtractor({ apiKey, logger })
const llmConfig: LLMMatchingConfig = { apiKey, model: 'claude-haiku-4-5-20251001' }
const llmService = new LLMMatchingService(llmConfig, logger)
const delay = (ms: number) => new Promise(r => setTimeout(r, ms))
const reviewConfig = { apiKey }

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n=== REBUILD EDITION_UPDATE PROPOSALS ===`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : '🔴 LIVE'}`)
  if (PROPOSAL_ID) console.log(`Single: ${PROPOSAL_ID}`)
  if (FUTURE_ONLY) console.log(`Future events only`)
  if (SPREAD_FIX) console.log(`Spread fix mode: editions with races spread > ${MIN_SPREAD_DAYS} days`)
  if (LIMIT) console.log(`Limit: ${LIMIT}`)
  if (OFFSET) console.log(`Offset: ${OFFSET} (skipping first ${OFFSET} proposals)`)
  console.log()

  // Connect to Miles Republic
  const milesConn = await prisma.databaseConnection.findFirst({
    where: { name: { contains: 'Miles Republic' } }
  })
  if (!milesConn) { console.error('No Miles Republic connection'); process.exit(1) }
  const dbManager = DatabaseManager.getInstance(logger)
  const sourceDb = await dbManager.getConnection(milesConn.id)

  // Fetch proposals
  let proposals: Array<{
    id: string
    eventName: string
    eventCity: string | null
    eventId: string
    editionId: string
    editionYear: number | null
    confidence: number
    changes: any
    justification: any
  }>

  if (SPREAD_FIX) {
    // Spread fix mode: find editions where races are spread over multiple days,
    // then get the most recent APPLIED proposal with a FFA source for each edition
    console.log(`Querying Miles Republic for editions with race spread > ${MIN_SPREAD_DAYS} days...`)

    const spreadEditions: Array<{ id: number }> = await sourceDb.$queryRawUnsafe(`
      SELECT e.id
      FROM "Edition" e
      JOIN "Race" r ON r."editionId" = e.id AND r."isArchived" = false
      WHERE e."startDate" >= NOW()
        AND e."calendarStatus" = 'CONFIRMED'
      GROUP BY e.id
      HAVING MAX(r."startDate"::date) - MIN(r."startDate"::date) > ${MIN_SPREAD_DAYS}
    `)

    const spreadIds = spreadEditions.map((e: any) => e.id)
    console.log(`Found ${spreadIds.length} editions with spread > ${MIN_SPREAD_DAYS} days`)

    if (spreadIds.length === 0) {
      proposals = []
    } else {
      // Get the most recent APPLIED proposal per edition with a FFA source
      const editionIdList = spreadIds.map((id: any) => `'${id}'`).join(',')
      proposals = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT ON (p."editionId")
          p.id, p."eventName", p."eventCity", p."eventId", p."editionId",
          p."editionYear", p.confidence, p.changes, p.justification
        FROM proposals p
        JOIN proposal_applications pa ON pa."proposalId" = p.id AND pa.status = 'APPLIED'
        WHERE p."editionId" IN (${editionIdList})
          AND p."eventName" IS NOT NULL
          AND p.justification->0->'metadata'->>'source' LIKE '%athle.fr%'
        ORDER BY p."editionId", p."createdAt" DESC
        ${LIMIT ? `LIMIT ${LIMIT}` : ''}
      `)
    }

    console.log(`Found ${proposals.length} proposals with FFA source for spread editions`)
  } else {
    // Normal mode: rebuild PENDING proposals
    let whereClause: string
    if (PROPOSAL_ID) {
      whereClause = `id = '${PROPOSAL_ID}'`
    } else {
      whereClause = `type = 'EDITION_UPDATE'
        AND status IN ('PENDING', 'PARTIALLY_APPROVED')
        AND "eventName" IS NOT NULL
        AND justification->0->'metadata'->>'source' IS NOT NULL`
      if (FUTURE_ONLY) {
        whereClause += ` AND (
          (changes->'edition'->'new'->>'startDate')::timestamp >= NOW()
          OR (changes->'startDate'->>'new')::timestamp >= NOW()
          OR "editionYear" >= EXTRACT(YEAR FROM NOW())::int
        )`
      }
    }
    const limitClause = LIMIT ? `LIMIT ${LIMIT}` : ''

    proposals = await prisma.$queryRawUnsafe<typeof proposals>(
      `SELECT id, "eventName", "eventCity", "eventId", "editionId", "editionYear", confidence, changes, justification
       FROM proposals WHERE ${whereClause}
       ORDER BY "createdAt" DESC ${limitClause}`
    )
  }

  if (OFFSET > 0) {
    console.log(`Found ${proposals.length} proposals, skipping first ${OFFSET}.\n`)
    proposals = proposals.slice(OFFSET)
  }
  console.log(`Processing ${proposals.length} proposals to rebuild.\n`)

  const stats = { processed: 0, rebuilt: 0, noChange: 0, fetchError: 0, extractError: 0, errors: 0 }

  for (let i = 0; i < proposals.length; i++) {
    const p = proposals[i]
    stats.processed++
    const prefix = `[${i + 1}/${proposals.length}]`

    const source = p.justification?.[0]?.metadata?.source as string | undefined
    if (!source) { continue }

    const editionId = parseInt(p.editionId)
    if (isNaN(editionId)) { continue }

    try {
      // 1. Fetch FFA page
      let html: string
      try {
        const resp = await axios.get(source, {
          timeout: 30000,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DataAgentsRebuild/1.0)' },
          responseType: 'text',
        })
        html = resp.data
      } catch (err: any) {
        console.log(`${prefix} ❌ FETCH ${p.eventName}: ${err.message}`)
        stats.fetchError++
        await delay(DELAY_MS)
        continue
      }

      // 2. Extract via LLM
      const extractResult = await extractor.extract(
        { type: 'html', content: html },
        { context: 'Page détail FFA', timeout: 30000 }
      )

      if (!extractResult.success || !extractResult.data) {
        console.log(`${prefix} ❌ EXTRACT ${p.eventName}: ${extractResult.error}`)
        stats.extractError++
        await delay(DELAY_MS)
        continue
      }

      const extracted = extractResult.data

      // 3. Get existing races from Miles Republic
      const existingRaces = await sourceDb.race.findMany({
        where: { editionId, isArchived: false },
        select: {
          id: true, name: true, runDistance: true, walkDistance: true,
          swimDistance: true, bikeDistance: true, startDate: true,
          runPositiveElevation: true, categoryLevel1: true, categoryLevel2: true,
        }
      })

      // 4. Build ProposalInput from extracted data
      const proposalInput = {
        eventName: extracted.eventName || p.eventName,
        eventCity: extracted.eventCity || p.eventCity || '',
        eventCountry: 'France',
        editionDate: extracted.editionDate && /^\d{4}-\d{2}-\d{2}$/.test(extracted.editionDate)
          ? extracted.editionDate
          : (p.changes?.startDate?.new ? new Date(p.changes.startDate.new).toISOString().split('T')[0] : undefined),
        editionYear: extracted.editionYear || p.editionYear || undefined,
        timeZone: 'Europe/Paris',
        calendarStatus: 'CONFIRMED',
        races: (extracted.races || []).map(r => ({
          name: r.name,
          distance: r.distance, // already in meters
          elevation: r.elevation,
          startTime: r.startTime,
          price: r.price,
          raceDate: r.raceDate,
          categoryLevel1: r.categoryLevel1,
          categoryLevel2: r.categoryLevel2,
        })),
        organizer: (extracted.organizerName || extracted.organizerEmail) ? {
          name: extracted.organizerName,
          email: extracted.organizerEmail,
          phone: extracted.organizerPhone,
          websiteUrl: extracted.organizerWebsite,
        } : undefined,
        confidence: 0.9,
        source: 'ffa-rebuild',
      }

      // 5. Build match result (we know the event/edition already)
      const matchResult = {
        type: 'FUZZY_MATCH' as const,
        event: { id: parseInt(p.eventId), name: p.eventName, city: p.eventCity || '', similarity: 1 },
        edition: { id: editionId, year: String(p.editionYear || '') },
        confidence: 0.95,
      }

      // 6. Build changes with LLM race matching
      const newChanges = await buildEditionUpdateChanges(
        proposalInput,
        matchResult,
        existingRaces as DbRace[],
        undefined, // no pre-matched races — let LLM do it
        { llmService, eventName: p.eventName, editionYear: p.editionYear || new Date().getFullYear(), eventCity: p.eventCity || '' }
      )

      // 7. Get LLM confidence score
      const review = await reviewEditionUpdateConfidence(
        { eventName: p.eventName, eventCity: p.eventCity, editionYear: p.editionYear, changes: newChanges },
        reviewConfig
      )

      // 8. Report
      const racesToUpdate = newChanges.racesToUpdate?.new?.length || 0
      const racesToAdd = newChanges.racesToAdd?.new?.length || 0
      const oldRacesToUpdate = p.changes.racesToUpdate?.new?.length || 0
      const oldRacesToAdd = p.changes.racesToAdd?.new?.length || 0
      const issueStr = review.issues.length > 0 ? ` [${review.issues.length} issues]` : ''

      console.log(`${prefix} ${p.eventName}`)
      console.log(`       Before: ${oldRacesToUpdate} matched, ${oldRacesToAdd} new | confidence: ${p.confidence}`)
      console.log(`       After:  ${racesToUpdate} matched, ${racesToAdd} new | confidence: ${review.score.toFixed(2)}${issueStr}`)

      if (!SPREAD_FIX && racesToUpdate === oldRacesToUpdate && racesToAdd === oldRacesToAdd && Math.abs(review.score - p.confidence) < 0.05) {
        console.log(`       → No significant change`)
        stats.noChange++
      } else {
        stats.rebuilt++

        if (!DRY_RUN) {
          const justifications: any[] = [{
            type: 'text',
            content: `Rebuild from FFA source`,
            metadata: {
              eventName: p.eventName,
              eventCity: p.eventCity,
              editionYear: p.editionYear,
              source: p.justification?.[0]?.metadata?.source,
            },
          }, {
            type: 'llm_confidence_review',
            content: review.reason,
            metadata: {
              reviewedAt: new Date().toISOString(),
              score: review.score,
              issues: review.issues,
              rebuiltFrom: SPREAD_FIX ? 'spread-fix' : 'rebuild-edition-updates',
            },
          }]

          if (SPREAD_FIX) {
            // Create a new PENDING proposal (don't touch the APPLIED one)
            await prisma.proposal.create({
              data: {
                agentId: 'cmi3khznk0000g820hwxc2i8m', // FFA Scraper agent
                type: 'EDITION_UPDATE',
                status: 'PENDING',
                eventId: p.eventId,
                editionId: p.editionId,
                eventName: p.eventName,
                eventCity: p.eventCity,
                editionYear: p.editionYear,
                changes: newChanges as any,
                confidence: review.score,
                justification: justifications as any,
              },
            })
          } else {
            // Update existing PENDING proposal
            const existingJust = (p.justification as any[]) || []
            existingJust.push(justifications[1]) // Add just the review

            await prisma.proposal.update({
              where: { id: p.id },
              data: {
                changes: newChanges as any,
                confidence: review.score,
                justification: existingJust as any,
              },
            })
          }
        }
      }
    } catch (err: any) {
      console.log(`${prefix} ❌ ${p.eventName}: ${err.message}`)
      stats.errors++
    }

    await delay(DELAY_MS)
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`SUMMARY${DRY_RUN ? ' (DRY RUN)' : ''}`)
  console.log(`${'='.repeat(50)}`)
  console.log(`  Processed:    ${stats.processed}`)
  console.log(`  Rebuilt:      ${stats.rebuilt}`)
  console.log(`  No change:    ${stats.noChange}`)
  console.log(`  Fetch errors: ${stats.fetchError}`)
  console.log(`  Extract errors: ${stats.extractError}`)
  console.log(`  Other errors: ${stats.errors}`)
  console.log()

  await prisma.$disconnect()
}

main().catch(err => {
  console.error('Fatal:', err)
  prisma.$disconnect()
  process.exit(1)
})
