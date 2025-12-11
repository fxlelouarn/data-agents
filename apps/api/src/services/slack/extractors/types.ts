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

Tu dois extraire les informations suivantes si elles sont présentes:
- Nom de l'événement
- Ville et département
- Date(s) de l'événement
- Liste des courses avec: nom, distance, dénivelé, heure de départ, prix
- Informations sur l'organisateur
- Lien d'inscription

IMPORTANT:
- Réponds UNIQUEMENT en JSON valide, sans commentaires ni texte avant/après
- Si une information n'est pas trouvée, omets le champ (ne mets pas null)
- Pour les distances, convertis en mètres (10km = 10000)
- Pour les dates, utilise le format ISO (YYYY-MM-DD)
- Pour les heures, utilise le format HH:mm
- Indique un score de confiance entre 0 et 1 basé sur la qualité des informations extraites`

export const EXTRACTION_PROMPT_USER = (content: string) => `Extrais les informations de l'événement sportif à partir du contenu suivant:

---
${content}
---

Réponds avec un objet JSON contenant les champs suivants (omets ceux non trouvés):
{
  "eventName": "string",
  "eventCity": "string",
  "eventDepartment": "string (code ou nom)",
  "editionYear": number,
  "editionDate": "YYYY-MM-DD",
  "editionEndDate": "YYYY-MM-DD (si multi-jours)",
  "races": [
    {
      "name": "string",
      "distance": number (en mètres),
      "elevation": number (D+ en mètres),
      "startTime": "HH:mm",
      "price": number (en euros)
    }
  ],
  "organizerName": "string",
  "organizerEmail": "string",
  "organizerPhone": "string",
  "organizerWebsite": "string",
  "registrationUrl": "string",
  "confidence": number (0-1)
}`
