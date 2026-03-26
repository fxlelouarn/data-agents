/**
 * LLM-based confidence review for EDITION_UPDATE proposals.
 * Evaluates whether a proposal is coherent and can be auto-validated.
 */

import Anthropic from '@anthropic-ai/sdk'

export interface ConfidenceReviewInput {
  eventName: string | null
  eventCity: string | null
  editionYear: number | null | undefined
  changes: any
}

export interface ConfidenceReviewResult {
  score: number
  reason: string
  issues: string[]
}

export interface ConfidenceReviewConfig {
  apiKey: string
  model?: string
}

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

/**
 * Review an EDITION_UPDATE proposal's changes and return a confidence score.
 */
export async function reviewEditionUpdateConfidence(
  input: ConfidenceReviewInput,
  config: ConfidenceReviewConfig
): Promise<ConfidenceReviewResult> {
  const { changes } = input
  const model = config.model || DEFAULT_MODEL
  const anthropic = new Anthropic({ apiKey: config.apiKey })

  const racesToUpdate = changes.racesToUpdate?.new || []
  const racesToAdd = changes.racesToAdd?.new || []
  const racesExisting = changes.racesExisting?.new || []

  const getDistance = (r: any) => r.runDistance || r.walkDistance || r.bikeDistance || 0
  const getDistanceFromCurrent = (r: any) =>
    r.currentData?.runDistance || r.currentData?.walkDistance || r.currentData?.bikeDistance || 0

  let racesSummary = [
    ...racesToUpdate.map((r: any) => {
      const updates = Object.keys(r.updates || {}).filter(k => r.updates?.[k]?.new !== undefined)
      const dist = getDistanceFromCurrent(r)
      return `  MATCH: "${r.raceName}" (id:${r.raceId}, ${dist}km) — updates: ${updates.join(', ') || 'none'}`
    }),
    ...racesToAdd.map((r: any) => {
      const dist = getDistance(r)
      return `  NEW: "${r.name}" (${dist}km)`
    }),
    ...racesExisting.map((r: any) => {
      const dist = getDistance(r)
      return `  EXISTING (not matched): "${r.raceName}" (id:${r.raceId}, ${dist}km)`
    }),
  ].join('\n')

  // Detect potential duplicate NEW races (distance ±15% of a MATCH or EXISTING)
  const knownDistances = [
    ...racesToUpdate.map((r: any) => ({ name: r.raceName, dist: getDistanceFromCurrent(r) })),
    ...racesExisting.map((r: any) => ({ name: r.raceName, dist: getDistance(r) })),
  ].filter(d => d.dist > 0)

  const duplicateWarnings: string[] = []
  for (const newRace of racesToAdd) {
    const newDist = getDistance(newRace)
    if (newDist <= 0) continue
    const dup = knownDistances.find(k => Math.abs(k.dist - newDist) / k.dist < 0.15)
    if (dup) {
      duplicateWarnings.push(
        `⚠️ DOUBLON PROBABLE: NEW "${newRace.name}" (${newDist}km) a la même distance que "${dup.name}" (${dup.dist}km) — probablement un matching raté`
      )
    }
  }

  if (duplicateWarnings.length > 0) {
    racesSummary += '\n\n' + duplicateWarnings.join('\n')
  }

  const stringify = (val: any): string => {
    if (val === null || val === undefined) return '-'
    if (typeof val === 'object') return JSON.stringify(val)
    return String(val)
  }
  const editionUpdates = Object.entries(changes)
    .filter(([k]) => !['racesToUpdate', 'racesToAdd', 'racesExisting', 'registrationUrl'].includes(k))
    .map(([k, v]: [string, any]) => `  ${k}: ${stringify(v?.old)} → ${stringify(v?.new)}`)
    .join('\n')

  const prompt = `Tu es un expert en données d'événements sportifs. Évalue cette proposition de mise à jour d'une édition existante.

## Événement
Nom: ${input.eventName}
Ville: ${input.eventCity || '-'}
Édition: ${input.editionYear || '-'}

## Mises à jour de l'édition
${editionUpdates || '  (aucune)'}

## Courses
${racesSummary || '  (aucune)'}

## Règles d'évaluation

Ce qui est NORMAL et ne doit PAS baisser le score :
- startDate et endDate proches ou identiques : ce sont les heures de DÉPART de la première et dernière course, pas la durée de l'événement
- Des courses EXISTING (non matchées) : elles sont conservées telles quelles, pas supprimées. C'est attendu quand la source FFA ne couvre pas toutes les courses (ex: randonnées, courses enfants)
- timeZone ajouté quand il était null : c'est une correction normale
- Organizer ajouté quand il n'existait pas : c'est un enrichissement, pas un remplacement

Ce qui doit BAISSER le score :
- Incohérence entre le nom de l'événement et les courses (ex: "Trail des Monts" avec uniquement des courses sur route)
- Distances manifestement fausses (ex: marathon de 10km)
- Courses matchées à tort (ex: un 10km matché avec un 42km)
- Dates aberrantes (ex: édition 2026 avec date en 2024)
- Une course NEW dont la distance est quasi identique (±15%) à une course MATCH ou EXISTING : c'est probablement un doublon de matching raté, pas une vraie nouvelle course

## Barème
- 0.95+ : données cohérentes, matchings corrects, auto-validation recommandée
- 0.80-0.94 : probablement correct, un détail mineur à surveiller
- 0.60-0.79 : incohérence réelle détectée, review humain recommandé
- <0.60 : erreur manifeste

Utilise l'outil pour répondre. Ne signale que les vrais problèmes, pas les comportements attendus.`

  const response = await anthropic.messages.create({
    model,
    max_tokens: 512,
    tools: [{
      name: 'confidence_score',
      description: 'Score de confiance pour auto-validation',
      input_schema: {
        type: 'object' as const,
        properties: {
          score: { type: 'number', description: 'Score 0-1' },
          reason: { type: 'string', description: 'Explication courte' },
          issues: { type: 'array', items: { type: 'string' }, description: 'Problèmes détectés' },
        },
        required: ['score', 'reason'],
      },
    }],
    tool_choice: { type: 'tool' as const, name: 'confidence_score' },
    messages: [{ role: 'user', content: prompt }],
  })

  const toolBlock = response.content.find(b => b.type === 'tool_use') as Anthropic.ToolUseBlock | undefined
  if (!toolBlock) return { score: 0, reason: 'no LLM response', issues: [] }

  const result = toolBlock.input as { score: number; reason: string; issues?: string[] }
  return { score: result.score, reason: result.reason, issues: result.issues || [] }
}
