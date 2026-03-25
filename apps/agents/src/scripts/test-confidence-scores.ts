#!/usr/bin/env npx tsx
/**
 * Compare two confidence scoring approaches for EDITION_UPDATE auto-validation:
 * 1. Mechanical score (fast, free)
 * 2. LLM review score (slow, ~$0.01/call)
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '/Users/fx/dev/data-agents/.env.prod', override: true })
dotenv.config({ path: '/Users/fx/dev/data-agents/.env' })

import { PrismaClient } from '@prisma/client'
import Anthropic from '@anthropic-ai/sdk'

const prisma = new PrismaClient()
const apiKey = process.env.LLM_MATCHING_API_KEY || process.env.ANTHROPIC_API_KEY
const anthropic = apiKey ? new Anthropic({ apiKey }) : null

const PROPOSAL_IDS = [
  'cmn41iebl1r09is1eljm99qp4', // Les Drailles De Campuget
  'cmn2qh7gk27dpk61wxwkqdvrr', // Trail Du Couserans
  'cmn41iec71r0lis1e6di1466y', // Trail Saint Roch
  'cmn3rg9rs0npxis1et9lt8bna', // Les 10Kms Des Sapeurs Pompiers
  'cmn41ie4p1qwhis1efwk5shw3', // Trail De La Souleuvre
  'cmn3rg9lc0nmvis1eey71he9y', // La Meldoise
  'cmn3rga6l0nrzis1evficqqbz', // Foulées Gauloises Puymiclan
  'cmlgka625o5vfn01w8wzj033b', // Cross de la ville de Sceaux
  'cmjvpho2q3rqlmq1wivd2rjy6', // Côtelettes
  'cmn2qh7iv27f1k61wbp8jq506', // La 83430
]

// ---------------------------------------------------------------------------
// Approach 1: Mechanical score
// ---------------------------------------------------------------------------
function mechanicalScore(p: any): { score: number, reasons: string[] } {
  const changes = p.changes
  const reasons: string[] = []
  let score = 0

  // 1. Event match quality (from existing confidence)
  if (p.confidence >= 0.95) {
    score += 0.30
    reasons.push('event match: EXACT (0.30)')
  } else if (p.confidence >= 0.85) {
    score += 0.25
    reasons.push(`event match: good ${p.confidence} (0.25)`)
  } else if (p.confidence >= 0.70) {
    score += 0.15
    reasons.push(`event match: moderate ${p.confidence} (0.15)`)
  } else {
    score += 0.05
    reasons.push(`event match: weak ${p.confidence} (0.05)`)
  }

  // 2. All races matched (no racesToAdd)
  const racesToAdd = changes.racesToAdd?.new || []
  const racesToUpdate = changes.racesToUpdate?.new || []
  if (racesToAdd.length === 0) {
    score += 0.30
    reasons.push('no racesToAdd (0.30)')
  } else {
    // Penalize suspicious racesToAdd
    const suspicious = racesToAdd.filter((r: any) => {
      const dist = r.runDistance || r.walkDistance || r.bikeDistance || 0
      return dist < 0.1 || dist > 200 // < 100m or > 200km
    })
    if (suspicious.length > 0) {
      score += 0.00
      reasons.push(`racesToAdd with suspicious distances: ${suspicious.length} (0.00)`)
    } else {
      score += 0.10
      reasons.push(`racesToAdd: ${racesToAdd.length} races, looks OK (0.10)`)
    }
  }

  // 3. Updates are reasonable (startDate changes < 4h)
  let allUpdatesReasonable = true
  for (const race of racesToUpdate) {
    const updates = race.updates || {}
    if (updates.startDate?.new && updates.startDate?.old) {
      const diff = Math.abs(new Date(updates.startDate.new).getTime() - new Date(updates.startDate.old).getTime())
      if (diff > 4 * 60 * 60 * 1000) { // > 4 hours
        allUpdatesReasonable = false
        break
      }
    }
  }
  if (allUpdatesReasonable && racesToUpdate.length > 0) {
    score += 0.15
    reasons.push('all updates reasonable (0.15)')
  } else if (racesToUpdate.length === 0) {
    score += 0.10
    reasons.push('no updates to check (0.10)')
  } else {
    score += 0.00
    reasons.push('some updates have large time changes (0.00)')
  }

  // 4. Has organizer info
  const org = changes.edition?.new?.organizer || changes.organizer?.new
  if (org?.name || org?.email) {
    score += 0.10
    reasons.push('has organizer (0.10)')
  }

  // 5. Has timezone
  const tz = changes.timeZone?.new || changes.edition?.new?.timeZone
  if (tz) {
    score += 0.05
    reasons.push('has timezone (0.05)')
  }

  // 6. Race count sanity (not too many racesToUpdate for a small event)
  const racesExisting = changes.racesExisting?.new || []
  const totalDbRaces = racesToUpdate.length + racesExisting.length
  if (totalDbRaces > 0 && racesToAdd.length <= totalDbRaces) {
    score += 0.10
    reasons.push(`race balance OK: ${racesToUpdate.length} update, ${racesToAdd.length} add, ${racesExisting.length} existing (0.10)`)
  } else if (racesToAdd.length > totalDbRaces && totalDbRaces > 0) {
    score += 0.00
    reasons.push(`more adds than existing: ${racesToAdd.length} > ${totalDbRaces} (0.00)`)
  } else {
    score += 0.05
    reasons.push('race balance neutral (0.05)')
  }

  return { score: Math.min(Math.round(score * 100) / 100, 1), reasons }
}

// ---------------------------------------------------------------------------
// Approach 2: LLM review score
// ---------------------------------------------------------------------------
async function llmReviewScore(p: any): Promise<{ score: number, reason: string }> {
  if (!anthropic) return { score: 0, reason: 'no API key' }

  const changes = p.changes
  const racesToUpdate = changes.racesToUpdate?.new || []
  const racesToAdd = changes.racesToAdd?.new || []
  const racesExisting = changes.racesExisting?.new || []

  // Build compact summary
  const racesSummary = [
    ...racesToUpdate.map((r: any) => {
      const updates = Object.keys(r.updates || {}).filter(k => r.updates[k]?.new !== undefined)
      return `  MATCH: "${r.raceName}" (id:${r.raceId}) — updates: ${updates.join(', ') || 'none'}`
    }),
    ...racesToAdd.map((r: any) => {
      const dist = r.runDistance || r.walkDistance || r.bikeDistance || 0
      return `  NEW: "${r.name}" (${dist}km)`
    }),
    ...racesExisting.map((r: any) => `  EXISTING (not matched): "${r.raceName}" (id:${r.raceId})`),
  ].join('\n')

  const editionUpdates = Object.entries(changes)
    .filter(([k]) => !['racesToUpdate', 'racesToAdd', 'racesExisting', 'registrationUrl'].includes(k))
    .map(([k, v]: [string, any]) => `  ${k}: ${v?.old ?? '-'} → ${v?.new ?? '-'}`)
    .join('\n')

  const prompt = `Tu es un expert en données d'événements sportifs. Évalue cette proposition de mise à jour.

## Événement
Nom: ${p.eventName}
Ville: ${p.eventCity || '-'}
Édition: ${p.editionYear || '-'}
Confiance du match événement: ${p.confidence}

## Mises à jour de l'édition
${editionUpdates || '  (aucune)'}

## Courses
${racesSummary || '  (aucune)'}

## Question
Cette proposition est-elle correcte et peut-elle être auto-validée ?

Évalue avec un score de 0 à 1:
- 0.95+ : tout est cohérent, auto-validation recommandée
- 0.80-0.94 : probablement correct mais un détail à surveiller
- 0.60-0.79 : des doutes, review humain recommandé
- <0.60 : problèmes détectés, ne pas auto-valider

Utilise l'outil pour répondre.`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    tools: [{
      name: 'confidence_score',
      description: 'Score de confiance pour auto-validation',
      input_schema: {
        type: 'object' as const,
        properties: {
          score: { type: 'number', description: 'Score 0-1' },
          reason: { type: 'string', description: 'Explication courte' },
          issues: { type: 'array', items: { type: 'string' }, description: 'Problèmes détectés (vide si tout OK)' },
        },
        required: ['score', 'reason'],
      },
    }],
    tool_choice: { type: 'tool' as const, name: 'confidence_score' },
    messages: [{ role: 'user', content: prompt }],
  })

  const toolBlock = response.content.find(b => b.type === 'tool_use') as any
  if (!toolBlock) return { score: 0, reason: 'no tool response' }

  const result = toolBlock.input as { score: number, reason: string, issues?: string[] }
  const issueStr = result.issues?.length ? ` Issues: ${result.issues.join('; ')}` : ''
  return { score: result.score, reason: `${result.reason}${issueStr}` }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== CONFIDENCE SCORE COMPARISON ===\n')

  const proposals = await prisma.proposal.findMany({
    where: { id: { in: PROPOSAL_IDS } },
  })

  console.log(`${'Event'.padEnd(40)} ${'Cur'.padStart(4)} ${'Mech'.padStart(5)} ${'LLM'.padStart(5)}  Mechanical reasons / LLM reason`)
  console.log(`${'-'.repeat(40)} ${'-'.repeat(4)} ${'-'.repeat(5)} ${'-'.repeat(5)}  ${'-'.repeat(60)}`)

  for (const p of proposals) {
    const mech = mechanicalScore(p)
    const llm = await llmReviewScore(p)

    const name = p.eventName?.substring(0, 38).padEnd(40) || '?'.padEnd(40)
    const cur = p.confidence?.toFixed(2).padStart(4) || '?'
    const mechStr = mech.score.toFixed(2).padStart(5)
    const llmStr = llm.score.toFixed(2).padStart(5)

    console.log(`${name} ${cur} ${mechStr} ${llmStr}  M: ${mech.reasons.join(' | ')}`)
    console.log(`${''.padEnd(57)} L: ${llm.reason}`)
    console.log()
  }

  await prisma.$disconnect()
}

main().catch(err => {
  console.error('Fatal:', err)
  prisma.$disconnect()
  process.exit(1)
})
