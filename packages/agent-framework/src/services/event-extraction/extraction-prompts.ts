/**
 * Prompts and Anthropic tool schema for LLM event extraction.
 *
 * Adapted from Slack extractors (apps/api/src/services/slack/extractors/types.ts)
 * but uses tool_use for structured output instead of free-form JSON.
 */

/** System prompt for event extraction */
export const EXTRACTION_SYSTEM_PROMPT = `Tu es un assistant spécialisé dans l'extraction d'informations sur les événements sportifs (courses à pied, trails, marathons, relais, marches, etc.) en France.

RÈGLES CRITIQUES:
- N'INVENTE JAMAIS de données. Si une information n'est pas explicitement dans le contenu, NE L'INCLUS PAS.
- Pour les dates: utilise uniquement des dates EXPLICITEMENT présentes. Sans année, déduis-la depuis la date du jour fournie (prochaine occurrence future).
- Pour les distances: convertis TOUJOURS en mètres (10km = 10000, 42.195km = 42195). Si la course est un format chronométré (ex: 24h, 12h, 6h) sans distance fixe, mets distance à 0 et décris le format dans le champ description. ATTENTION: ignore la "distance effort" (qui intègre le dénivelé). Par exemple "10000 m / 150 m D+ / 11500 m effort" → distance = 10000 (PAS 11500, qui est la distance effort).
- Pour les prix: extrais le montant en euros. Si plusieurs tarifs existent (early bird, sur place), prends le tarif standard.
- Inclus TOUTES les épreuves: trails, courses, randonnées, marches, relais, formats spéciaux.
- Le score de confiance doit être < 0.3 si tu n'as pas trouvé de date.
- Pour eventName: retourne un nom PÉRENNE qui survivra d'une édition à l'autre. Retire les années ("2026"), les numéros d'édition ("5ème édition", "XXIIe"), et les prépositions orphelines. ATTENTION: les numéros d'arrondissement de Paris/Lyon/Marseille ("14ème", "19ème") ne sont PAS des éditions, il faut les conserver. Exemples: "5è édition du Trail des Loups 2026" → "Trail des Loups", "10 km du 14ème" à Paris → "10 km du 14ème".`

/**
 * Build the user prompt for extraction.
 * @param content - The preprocessed content (HTML, text)
 * @param context - Optional agent-specific context
 */
export function buildExtractionUserPrompt(content: string, context?: string): string {
  const today = new Date().toISOString().split('T')[0]
  const contextLine = context ? `\nContexte: ${context}` : ''

  return `Date du jour: ${today}${contextLine}

Extrais les informations de l'événement sportif à partir du contenu suivant. Utilise l'outil extract_event_data pour structurer ta réponse.

---
${content}
---`
}

/** Anthropic tool schema for structured extraction output */
export const extractionTool = {
  name: 'extract_event_data',
  description: 'Extraire les données structurées d\'un événement sportif',
  input_schema: {
    type: 'object' as const,
    properties: {
      eventName: { type: 'string', description: 'Nom de l\'événement' },
      eventCity: { type: 'string', description: 'Ville' },
      eventDepartment: { type: 'string', description: 'Code département (ex: "42", "69", "2A")' },
      editionYear: { type: 'number', description: 'Année de l\'édition' },
      editionDate: { type: 'string', description: 'Date de début ISO (YYYY-MM-DD)' },
      editionEndDate: { type: 'string', description: 'Date de fin ISO si multi-jours' },
      races: {
        type: 'array',
        description: 'Liste des courses/épreuves',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nom de la course' },
            distance: { type: 'number', description: 'Distance en mètres (0 si format chronométré sans distance fixe)' },
            elevation: { type: 'number', description: 'Dénivelé positif en mètres' },
            startTime: { type: 'string', description: 'Heure de départ (HH:mm)' },
            price: { type: 'number', description: 'Prix d\'inscription en euros' },
            raceDate: { type: 'string', description: 'Date de la course DD/MM (pour événements multi-jours)' },
            description: { type: 'string', description: 'Description du format si spécial (ex: relais 24h, boucle 4.4km)' },
            categoryLevel1: {
              type: 'string',
              enum: ['RUNNING', 'TRAIL', 'WALK', 'CYCLING', 'TRIATHLON', 'FUN', 'OTHER'],
              description: 'Catégorie principale'
            },
          },
          required: ['name'],
        },
      },
      organizerName: { type: 'string', description: 'Nom de l\'organisateur' },
      organizerEmail: { type: 'string', description: 'Email de l\'organisateur' },
      organizerPhone: { type: 'string', description: 'Téléphone' },
      organizerWebsite: { type: 'string', description: 'Site web' },
      registrationUrl: { type: 'string', description: 'URL d\'inscription' },
      confidence: { type: 'number', description: 'Score de confiance 0-1 (< 0.3 si pas de date)' },
    },
    required: ['eventName', 'confidence'],
  },
}
