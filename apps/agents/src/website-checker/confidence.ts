import type { UrlCheckResultWithAnalysis } from './types'

/**
 * Source weight factors for confidence calculation.
 * Event's own website is most reliable, then organizer, then timer.
 */
export const SOURCE_WEIGHTS: Record<string, number> = {
  event: 1.0,
  organizer: 0.85,
  timer: 0.75,
}

interface ConfidenceResult {
  decision: 'CONFIRMED' | 'CANCELED' | 'INCONCLUSIVE'
  confidence: number
  bestSource?: string
}

/**
 * Computes the final decision and confidence from all URL check results.
 *
 * Rules:
 * - Any confirmation wins (decision = CONFIRMED)
 * - Any explicit cancellation wins (unless contradicted by a confirmation)
 * - Confidence is weighted by source type (event > organizer > timer)
 * - Bonuses for: registration open, year mentioned, dates found
 * - Dead URLs are excluded from analysis (handled separately as EVENT_UPDATE proposals)
 */
export function computeFinalConfidence(results: UrlCheckResultWithAnalysis[]): ConfidenceResult {
  // Filter to alive results with analysis
  const analyzed = results.filter(r => r.isAlive && r.analysis)

  if (analyzed.length === 0) {
    return { decision: 'INCONCLUSIVE', confidence: 0 }
  }

  // Check for any confirmation
  const confirmations = analyzed.filter(r => r.analysis!.confirmed)
  const cancellations = analyzed.filter(r => r.analysis!.canceled)

  // Confirmation wins over cancellation (different sources may disagree)
  if (confirmations.length > 0) {
    // Pick the best confirmation (highest weighted confidence)
    const best = confirmations.reduce((best, r) => {
      const score = weightedScore(r)
      return score > weightedScore(best) ? r : best
    })

    return {
      decision: 'CONFIRMED',
      confidence: weightedScore(best),
      bestSource: best.sourceType,
    }
  }

  if (cancellations.length > 0) {
    const best = cancellations.reduce((best, r) => {
      const score = weightedScore(r)
      return score > weightedScore(best) ? r : best
    })

    return {
      decision: 'CANCELED',
      confidence: weightedScore(best),
      bestSource: best.sourceType,
    }
  }

  return { decision: 'INCONCLUSIVE', confidence: 0 }
}

/**
 * Computes a weighted confidence score for a single URL result.
 * Combines: LLM confidence × source weight × bonuses
 */
function weightedScore(result: UrlCheckResultWithAnalysis): number {
  const analysis = result.analysis!
  const sourceWeight = SOURCE_WEIGHTS[result.sourceType] ?? 0.5

  let score = analysis.confidence * sourceWeight

  // Bonus: registration is open (+5%)
  if (analysis.registrationOpen) {
    score = Math.min(1.0, score + 0.05)
  }

  // Bonus: target year mentioned (+3%)
  if (analysis.yearMentioned) {
    score = Math.min(1.0, score + 0.03)
  }

  // Bonus: dates found on page (+2%)
  if (analysis.datesFound.length > 0) {
    score = Math.min(1.0, score + 0.02)
  }

  return Math.round(score * 100) / 100
}
