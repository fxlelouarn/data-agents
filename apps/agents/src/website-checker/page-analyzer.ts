import Anthropic from '@anthropic-ai/sdk'
import type { EditionTarget, PageAnalysisResult } from './types'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'
const DEFAULT_TIMEOUT = 15_000

interface AnalyzerConfig {
  apiKey: string
  model?: string
  timeout?: number
}

/**
 * Anthropic tool definition for structured edition status analysis
 */
const analysisTool: Anthropic.Tool = {
  name: 'analyze_edition_status',
  description: "Analyze a webpage's content to determine if a sporting event edition is confirmed, canceled, or unknown.",
  input_schema: {
    type: 'object' as const,
    properties: {
      confirmed: {
        type: 'boolean',
        description: 'True if the page confirms the edition will take place (registration open, dates announced, event details for the target year)',
      },
      canceled: {
        type: 'boolean',
        description: 'True only if the page EXPLICITLY states the event is canceled/annulé for the target year',
      },
      registrationOpen: {
        type: 'boolean',
        description: 'True if registrations/inscriptions are currently open for the target edition',
      },
      startDate: {
        type: 'string',
        description: 'The start date of the edition in ISO format (YYYY-MM-DD), if found on the page. null if not found.',
      },
      endDate: {
        type: 'string',
        description: 'The end date of the edition in ISO format (YYYY-MM-DD), if found and different from startDate. null if single-day event or not found.',
      },
      datesFound: {
        type: 'array',
        items: { type: 'string' },
        description: 'All dates found on the page in ISO format (YYYY-MM-DD) that seem related to the target edition',
      },
      yearMentioned: {
        type: 'boolean',
        description: 'True if the target year (e.g., 2026) appears on the page in the context of the event',
      },
      confidence: {
        type: 'number',
        description: 'Your confidence in this analysis (0.0 to 1.0). High (>0.9) when registration is open or dates match. Low (<0.5) when page is ambiguous.',
      },
      reasoning: {
        type: 'string',
        description: 'Short (1-2 sentence) explanation of your conclusion',
      },
    },
    required: ['confirmed', 'canceled', 'registrationOpen', 'startDate', 'endDate', 'datesFound', 'yearMentioned', 'confidence', 'reasoning'],
  },
}

/**
 * Builds the LLM prompt for analyzing a page in the context of a specific edition.
 */
export function buildAnalysisPrompt(target: EditionTarget, pageText: string): string {
  const dateStr = target.startDate
    ? format(target.startDate, 'dd MMMM yyyy', { locale: fr })
    : 'date inconnue'

  return `Analyse le contenu de cette page web pour déterminer si l'événement sportif suivant est confirmé pour l'année cible.

## Événement recherché
- **Nom** : ${target.eventName}
- **Ville** : ${target.eventCity || 'inconnue'}
- **Année cible** : ${target.editionYear}
- **Date attendue** : ${dateStr}

## Règles d'analyse
- "confirmed = true" si la page contient des signes clairs que l'édition ${target.editionYear} aura lieu : inscriptions ouvertes, dates annoncées, programme publié, etc.
- "canceled = true" UNIQUEMENT si la page dit explicitement que l'événement est annulé/supprimé pour ${target.editionYear}.
- Si la page parle d'une édition passée ou d'une autre année, ce n'est PAS une confirmation.
- Si la page est un site générique sans mention de ${target.editionYear}, ce n'est PAS une confirmation.
- **Extraction des dates** : Si tu trouves la date de l'événement pour ${target.editionYear}, remplis "startDate" (et "endDate" si multi-jours). Format YYYY-MM-DD. C'est CRITIQUE — une confirmation sans date est inutile.
- Confidence élevée (≥ 0.9) : inscriptions ouvertes OU dates ${target.editionYear} explicites.
- Confidence moyenne (0.7-0.9) : année mentionnée mais pas de détails précis.
- Confidence basse (< 0.7) : page ambiguë ou contenu ancien.

## Contenu de la page
${pageText}`
}

/**
 * Analyzes a page's text content using LLM to determine edition status.
 * Returns null if analysis fails.
 */
export async function analyzePage(
  pageText: string,
  target: EditionTarget,
  config: AnalyzerConfig
): Promise<PageAnalysisResult | null> {
  try {
    const client = new Anthropic({ apiKey: config.apiKey })
    const model = config.model ?? DEFAULT_MODEL
    const timeout = config.timeout ?? DEFAULT_TIMEOUT

    const userPrompt = buildAnalysisPrompt(target, pageText)

    const response = await Promise.race([
      client.messages.create({
        model,
        max_tokens: 1024,
        tools: [analysisTool],
        tool_choice: { type: 'tool' as const, name: 'analyze_edition_status' },
        messages: [{ role: 'user', content: userPrompt }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LLM analysis timeout')), timeout)
      ),
    ])

    const toolBlock = (response as Anthropic.Message).content.find(
      (block) => block.type === 'tool_use'
    ) as Anthropic.ToolUseBlock | undefined

    if (!toolBlock) {
      return null
    }

    const input = toolBlock.input as PageAnalysisResult
    return {
      confirmed: Boolean(input.confirmed),
      canceled: Boolean(input.canceled),
      registrationOpen: Boolean(input.registrationOpen),
      startDate: typeof input.startDate === 'string' ? input.startDate : null,
      endDate: typeof input.endDate === 'string' ? input.endDate : null,
      datesFound: Array.isArray(input.datesFound) ? input.datesFound : [],
      yearMentioned: Boolean(input.yearMentioned),
      confidence: typeof input.confidence === 'number' ? input.confidence : 0.5,
      reasoning: String(input.reasoning || ''),
    }
  } catch {
    return null
  }
}
