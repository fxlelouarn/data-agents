/**
 * LLM Prompt Templates and Tool Schemas for Event/Race Matching
 *
 * This module provides:
 * - sanitizeName: cleans names for safe inclusion in prompts
 * - buildRaceMatchingPrompt: prompt for LLM to match proposed races with DB races
 * - buildEventJudgePrompt: prompt for LLM to judge if a candidate event matches
 * - raceMatchingTool: Anthropic tool schema for structured race matching output
 * - eventJudgeTool: Anthropic tool schema for structured event judge output
 */

import { DbRace, RaceMatchInput } from './types'

/**
 * Candidate event for LLM event judge
 */
export interface EventJudgeCandidate {
  eventId: number
  eventName: string
  eventCity: string
  department?: string
  editionYear?: number
  editionDate?: string
  score: number
}

/**
 * Sanitize a name for safe inclusion in an LLM prompt.
 * - Replaces control characters (newlines, tabs, etc.) with spaces
 * - Collapses multiple spaces into one
 * - Trims leading/trailing whitespace
 * - Truncates to 200 characters
 */
export function sanitizeName(name: string): string {
  return name
    .replace(/[\n\r\t\x00-\x1f]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, 200)
}

/**
 * Format the distance info of a DB race into a human-readable string.
 * Combines run, bike, swim, walk distances.
 */
function formatDbRaceDistance(race: DbRace): string {
  const parts: string[] = []

  if (race.runDistance && race.runDistance > 0) {
    parts.push(`${race.runDistance}km`)
  }
  if (race.bikeDistance && race.bikeDistance > 0) {
    parts.push(`vélo ${race.bikeDistance}km`)
  }
  if (race.swimDistance && race.swimDistance > 0) {
    parts.push(`nat ${race.swimDistance}m`)
  }
  if (race.walkDistance && race.walkDistance > 0) {
    parts.push(`marche ${race.walkDistance}km`)
  }

  return parts.length > 0 ? parts.join(' + ') : 'distance inconnue'
}

/**
 * Format a start time from a startDate value.
 * Returns "HH:MM" from UTC hours/minutes, or "?" if null/undefined.
 */
function formatStartTime(startDate: Date | string | null | undefined): string {
  if (!startDate) return '?'
  const d = startDate instanceof Date ? startDate : new Date(startDate)
  if (isNaN(d.getTime())) return '?'
  const hours = String(d.getUTCHours()).padStart(2, '0')
  const minutes = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/**
 * Build a prompt (in French) asking the LLM to match proposed races
 * against existing DB races for a given event/edition.
 *
 * @param eventName - Name of the event
 * @param editionYear - Year of the edition
 * @param eventCity - City of the event
 * @param dbRaces - Existing races from the database
 * @param inputRaces - Proposed races to match
 */
export function buildRaceMatchingPrompt(
  eventName: string,
  editionYear: number,
  eventCity: string,
  dbRaces: DbRace[],
  inputRaces: RaceMatchInput[]
): string {
  const safeEventName = sanitizeName(eventName)
  const safeCity = sanitizeName(eventCity)

  const dbRaceLines = dbRaces.map((race) => {
    const distance = formatDbRaceDistance(race)
    const elevation = race.runPositiveElevation ? ` D+${race.runPositiveElevation}m` : ''
    const startTime = formatStartTime(race.startDate)
    const name = sanitizeName(race.name)
    return `  [id:${race.id}] ${name} — ${distance}${elevation} — départ ${startTime}`
  }).join('\n')

  const inputRaceLines = inputRaces.map((race, index) => {
    const label = String.fromCharCode(65 + index) // A, B, C...
    const name = sanitizeName(race.name)
    const distancePart = race.distance && race.distance > 0 ? `${race.distance}km` : 'distance inconnue'
    const elevationPart = race.elevation ? ` D+${race.elevation}m` : ''
    const startTimePart = race.startTime ? ` départ ${race.startTime}` : ''
    const categoryPart = race.categoryLevel1 ? ` [${race.categoryLevel1}${race.categoryLevel2 ? '/' + race.categoryLevel2 : ''}]` : ''
    return `  [${label}] ${name} — ${distancePart}${elevationPart}${startTimePart}${categoryPart}`
  }).join('\n')

  return `Tu es un expert en courses sportives. Tu dois identifier les correspondances entre des courses proposées et des courses existantes en base de données pour l'événement "${safeEventName}" ${editionYear} à ${safeCity}.

## Courses existantes en base de données

${dbRaceLines || '  (aucune course existante)'}

## Courses proposées (à analyser)

${inputRaceLines || '  (aucune course proposée)'}

## Instructions

Pour chaque course proposée (A, B, C...), détermine si elle correspond à une course existante (même course reformatée) ou s'il s'agit d'une nouvelle course.

RÈGLE PRINCIPALE : La **distance** est le critère de matching le plus important, pas le nom.

Règles de correspondance :
1. **Même distance (marge 15%)** = très probablement la même course, MÊME si les noms sont complètement différents. Les noms peuvent être génériques d'un côté et spécifiques de l'autre (ex: "Course 10 km" ↔ "10 km de Marseille", ou "Trail XXS" ↔ "Pitchoun'trail 4 km"). Ne te fie pas aux noms — fie-toi à la distance.
2. **S'il n'y a qu'une seule course existante à cette distance**, c'est forcément la correspondance — valide-la.
3. **S'il y a plusieurs courses existantes à la même distance**, utilise les noms, catégories et heures de départ pour départager.
4. **Distance à 0 ou absente** : utilise uniquement le nom pour matcher (marches, randonnées sans distance).
5. **Chaque course existante ne peut être matchée qu'une seule fois** (pas de doublons).
6. **Une course proposée est "nouvelle" UNIQUEMENT si aucune course existante n'a une distance compatible**. Ne crée pas de "nouvelle course" quand une existante a la même distance.

Utilise l'outil race_matching_result pour structurer ta réponse.`
}

/**
 * Build a prompt (in French) asking the LLM to judge whether any candidate
 * event matches the input event.
 *
 * @param inputName - Name of the input event
 * @param inputCity - City of the input event
 * @param inputDepartment - Department code (optional)
 * @param inputDate - Date string of the input event (optional)
 * @param candidates - Candidate events from the database
 */
export function buildEventJudgePrompt(
  inputName: string,
  inputCity: string,
  inputDepartment: string | undefined,
  inputDate: string | undefined,
  candidates: EventJudgeCandidate[],
  inputOrganizer?: string
): string {
  const safeName = sanitizeName(inputName)
  const safeCity = sanitizeName(inputCity)

  const inputLines = [
    `  Nom : ${safeName}`,
    `  Ville : ${safeCity}`,
    inputDepartment ? `  Département : ${inputDepartment}` : null,
    inputDate ? `  Date : ${inputDate}` : null,
    inputOrganizer ? `  Organisateur : ${sanitizeName(inputOrganizer)}` : null,
  ].filter(Boolean).join('\n')

  const candidateLines = candidates.map((c) => {
    const safeCandidateName = sanitizeName(c.eventName)
    const safeCandidateCity = sanitizeName(c.eventCity)
    const deptPart = c.department ? ` (dépt ${c.department})` : ''
    const yearPart = c.editionYear ? ` — édition ${c.editionYear}` : ''
    const datePart = c.editionDate ? ` (${c.editionDate})` : ''
    return `  [id:${c.eventId}] ${safeCandidateName} — ${safeCandidateCity}${deptPart}${yearPart}${datePart} — score fuse.js : ${c.score}`
  }).join('\n')

  return `Tu es un expert en événements sportifs. Tu dois déterminer si un événement en cours d'import correspond à un événement existant dans la base de données.

## Événement à importer

${inputLines}

## Candidats trouvés par recherche textuelle

${candidateLines || '  (aucun candidat)'}

## Instructions

Analyse le nom, la ville, le département et la date de l'événement à importer et compare-les avec les candidats.

Un match est valide si les deux événements décrivent le même événement sportif (même nom de marque, même lieu), même si la formulation diffère légèrement.

Indices importants :
- Si l'organisateur est le même, c'est un fort indice que les événements sont identiques même si la ville diffère (changement de lieu entre éditions)
- Des villes proches dans des départements voisins peuvent correspondre au même événement

Ne valide PAS un match si :
- Les noms désignent clairement des événements différents
- Les villes sont incompatibles sans raison évidente
- La date est trop éloignée (plus de 6 mois d'écart)

## Score de confiance

Le champ confidence est OBLIGATOIRE dans tous les cas :

**Si found=true** (match trouvé) : confiance que le match est correct.
- 0.95+ : même nom, même ville, même date — quasi certain
- 0.85-0.94 : très probable (nom similaire, même ville/département)
- 0.70-0.84 : probable mais avec une différence (ville voisine, nom légèrement différent)

**Si found=false** (pas de match) : confiance que c'est un VRAI nouvel événement.
- 0.95+ : aucun candidat ne ressemble — clairement nouveau
- 0.80-0.94 : probablement nouveau, les candidats sont très différents
- 0.60-0.79 : un candidat ressemble un peu mais pas assez pour confirmer — à vérifier manuellement
- <0.60 : un candidat ressemble fortement, tu n'es pas sûr que ce soit un nouvel événement

## Nom pérenne de l'événement (cleanedEventName)

Le champ cleanedEventName est OBLIGATOIRE. Il doit contenir le nom de l'événement nettoyé de tout élément spécifique à une édition donnée, pour qu'il reste valable d'une année sur l'autre.

Éléments à RETIRER :
- Années : "2025", "2026"
- Numéros d'édition : "5ème édition", "XXIIe", "3è", "10Eme Edition"
- Prépositions orphelines après suppression : "du", "de la", "des" si elles ne servent plus à rien

Éléments à CONSERVER :
- Le nom de marque/identité de l'événement
- La ville/lieu si elle fait partie du nom
- Les mots descriptifs ("Trail", "Marathon", "Nocturne", etc.)
- Les arrondissements de Paris, Lyon et Marseille : "14ème", "19ème" etc. sont des arrondissements, PAS des numéros d'édition. Ex: "10 km du 14ème" → conserver tel quel

Exemples :
- "5è édition du Trail des Loups" → "Trail des Loups"
- "Marathon de Paris 2026" → "Marathon de Paris"
- "Les 28èMes Foulées Coudekerquoises" → "Les Foulées Coudekerquoises"
- "XXIIe semi-marathon de Boulogne" → "Semi-marathon de Boulogne"
- "Trail des Vikings" → "Trail des Vikings" (déjà propre)

Utilise l'outil event_judge_result pour structurer ta réponse.`
}

/**
 * Anthropic tool schema for structured race matching output.
 */
export const raceMatchingTool = {
  name: 'race_matching_result',
  description: 'Résultat du matching des courses proposées avec les courses existantes',
  input_schema: {
    type: 'object' as const,
    properties: {
      matches: {
        type: 'array',
        description: 'Liste des correspondances trouvées entre courses proposées et existantes',
        items: {
          type: 'object',
          properties: {
            proposedIndex: {
              type: 'string',
              description: 'Lettre de la course proposée (A, B, C...)',
            },
            existingRaceId: {
              type: 'number',
              description: 'ID de la course existante en base de données',
            },
            confidence: {
              type: 'number',
              description: 'Score de confiance du match (0-1)',
            },
            reason: {
              type: 'string',
              description: 'Explication du match',
            },
          },
          required: ['proposedIndex', 'existingRaceId', 'confidence', 'reason'],
        },
      },
      newRaces: {
        type: 'array',
        description: 'Liste des courses proposées sans correspondance (nouvelles courses)',
        items: {
          type: 'object',
          properties: {
            proposedIndex: {
              type: 'string',
              description: 'Lettre de la course proposée (A, B, C...)',
            },
            reason: {
              type: 'string',
              description: 'Explication pourquoi cette course est nouvelle',
            },
          },
          required: ['proposedIndex', 'reason'],
        },
      },
    },
    required: ['matches', 'newRaces'],
  },
}

/**
 * Anthropic tool schema for structured event judge output.
 * Uses found: boolean pattern instead of nullable object.
 */
export const eventJudgeTool = {
  name: 'event_judge_result',
  description: "Résultat du jugement sur la correspondance entre l'événement à importer et les candidats",
  input_schema: {
    type: 'object' as const,
    properties: {
      found: {
        type: 'boolean',
        description: "true si un candidat correspond à l'événement à importer, false sinon",
      },
      eventId: {
        type: 'number',
        description: "ID de l'événement candidat correspondant (uniquement si found=true)",
      },
      confidence: {
        type: 'number',
        description: 'Score de confiance entre 0 et 1. Si found=true: confiance que le match est correct. Si found=false: confiance que cet événement est vraiment NOUVEAU (pas un doublon). Exemples: 0.95 = très sûr, 0.7 = probable mais pas certain, 0.5 = douteux.',
      },
      reason: {
        type: 'string',
        description: 'Explication du jugement (match ou non-match)',
      },
      cleanedEventName: {
        type: 'string',
        description: "Nom de l'événement nettoyé des éléments spécifiques à une édition (année, numéro d'édition, etc.) pour qu'il reste valable d'année en année",
      },
    },
    required: ['found', 'confidence', 'reason', 'cleanedEventName'],
  },
}
