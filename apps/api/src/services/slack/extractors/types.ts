/**
 * Types for event data extraction from Slack messages
 */

export interface ExtractedEventData {
  // Event info
  eventName: string
  eventCity?: string
  eventCountry?: string
  eventDepartment?: string
  eventDescription?: string

  // Edition info
  editionYear?: number
  editionDate?: string // ISO date string
  editionEndDate?: string // For multi-day events

  // Races info
  races?: ExtractedRace[]

  // Organizer info
  organizerName?: string
  organizerEmail?: string
  organizerPhone?: string
  organizerWebsite?: string

  // Registration info
  registrationUrl?: string
  registrationDeadline?: string

  // Source info
  sourceUrl?: string

  // Extraction metadata
  confidence: number // 0-1 score
  extractionMethod: 'html' | 'image' | 'text'
  rawExtractedText?: string
}

export interface ExtractedRace {
  name: string
  distance?: number // in meters
  elevation?: number // D+ in meters
  startTime?: string // HH:mm format
  price?: number
  maxParticipants?: number
  categoryLevel1?: string // RUNNING, TRAIL, etc.
  categoryLevel2?: string // MARATHON, ULTRA_TRAIL, etc.
}

export interface ExtractionResult {
  success: boolean
  data?: ExtractedEventData
  error?: string
  errorType?: 'api_credit' | 'api_rate_limit' | 'fetch_failed' | 'parse_failed' | 'extraction_failed' | 'not_implemented'
  rawContent?: string
}

export interface HtmlExtractionOptions {
  url: string
  timeout?: number
  followRedirects?: boolean
}

export interface ImageExtractionOptions {
  imageUrl: string
  imageBuffer?: Buffer
  mimeType?: string
}

export const EXTRACTION_PROMPT_SYSTEM = `Tu es un assistant spécialisé dans l'extraction d'informations sur les événements sportifs (courses à pied, trails, marathons, etc.) en France.

Tu dois extraire les informations suivantes si elles sont EXPLICITEMENT présentes dans le texte:
- Nom de l'événement
- Ville et département
- Date(s) de l'événement
- Liste des courses avec: nom, distance, dénivelé, heure de départ, prix
- Informations sur l'organisateur
- Lien d'inscription

RÈGLES CRITIQUES:
- N'INVENTE JAMAIS de données. Si une information n'est pas explicitement dans le texte, NE L'INCLUS PAS.
- Pour les dates: tu dois trouver une date EXPLICITE (ex: "5 mars 2025", "05/03/2025"). N'invente JAMAIS de date.
- Si le contenu est principalement du code JavaScript/CSS ou du charabia technique, retourne {"error": "page_spa_no_content", "eventName": null}
- Si tu ne trouves pas de date précise, omets editionDate ET editionYear - ne les invente pas.
- Le score de confiance doit être < 0.3 si tu n'as pas trouvé de date.

FORMAT:
- Réponds UNIQUEMENT en JSON valide, sans commentaires ni texte avant/après
- Si une information n'est pas trouvée, omets le champ (ne mets pas null)
- Pour les distances, convertis en mètres (10km = 10000)
- Pour les dates, utilise le format ISO (YYYY-MM-DD)
- Pour les heures, utilise le format HH:mm`

/**
 * Structure JSON attendue pour l'extraction (partagée par tous les extracteurs)
 */
const EXTRACTION_JSON_SCHEMA = `{
  "eventName": "string (OBLIGATOIRE)",
  "eventCity": "string",
  "eventDepartment": "string (code ou nom)",
  "editionYear": number (SEULEMENT si trouvé explicitement),
  "editionDate": "YYYY-MM-DD (SEULEMENT si trouvé explicitement)",
  "editionEndDate": "YYYY-MM-DD (si multi-jours)",
  "races": [
    {
      "name": "string",
      "distance": number (en mètres),
      "elevation": number (D+ en mètres),
      "startTime": "HH:mm",
      "price": number (en euros),
      "type": "trail" | "rando" | "marche" | "ultra" | "autre"
    }
  ],
  "organizerName": "string",
  "organizerEmail": "string",
  "organizerPhone": "string",
  "organizerWebsite": "string",
  "registrationUrl": "string",
  "confidence": number (0-1, doit être < 0.3 si pas de date trouvée)
}`

/**
 * Règles communes pour l'extraction des courses
 */
const EXTRACTION_RACES_RULES = `IMPORTANT pour les courses: inclus TOUTES les épreuves mentionnées, y compris:
  * Les trails/courses principales
  * Les randonnées (rando, marche)
  * Les nouveautés annoncées (même si marquées "Nouveauté 2026" ou similaire)
  * Les formats ultra ou spéciaux`

/**
 * Génère le prompt d'extraction selon le type de source
 */
export type ExtractionSourceType = 'html' | 'image' | 'text'

export const buildExtractionPrompt = (content: string, sourceType: ExtractionSourceType): string => {
  const today = new Date().toISOString().split('T')[0]

  const introByType: Record<ExtractionSourceType, string> = {
    html: `Extrais les informations de l'événement sportif à partir du contenu HTML suivant.
RAPPEL: N'invente AUCUNE date. Si tu ne trouves pas de date explicite, omets editionDate et editionYear.`,
    image: `Analyse cette image d'un événement sportif et extrais TOUTES les informations visibles.
RAPPEL: N'invente AUCUNE date. Si tu ne trouves pas de date explicite, omets editionDate et editionYear.`,
    text: `Analyse ce texte décrivant un événement sportif et extrais TOUTES les informations présentes.
RAPPEL: N'invente AUCUNE date. Si tu ne trouves pas de date explicite, omets editionDate et editionYear.`
  }

  const contentSection = sourceType === 'image'
    ? '' // L'image est passée séparément dans le message
    : `
---
${content}
---`

  const spaErrorSection = sourceType === 'html'
    ? `
Si le contenu est du code JavaScript/CSS sans données lisibles, retourne:
{"error": "page_spa_no_content", "eventName": null, "confidence": 0}

Sinon, réponds avec un objet JSON (omets les champs non trouvés):`
    : `Réponds UNIQUEMENT avec un objet JSON valide (pas de texte avant/après):`

  return `Date du jour: ${today}

${introByType[sourceType]}

${EXTRACTION_RACES_RULES}
${contentSection}

${spaErrorSection}
${EXTRACTION_JSON_SCHEMA}`
}

/**
 * Prompt pour extraction HTML (rétro-compatibilité)
 */
export const EXTRACTION_PROMPT_USER = (content: string) => buildExtractionPrompt(content, 'html')
