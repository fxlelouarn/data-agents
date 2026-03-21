/**
 * Tests pour llm-prompts - Templates de prompts LLM pour le matching
 *
 * Cas testés :
 * - sanitizeName : nettoyage des noms (caractères de contrôle, troncature)
 * - buildRaceMatchingPrompt : prompt de matching de courses
 * - buildEventJudgePrompt : prompt de jugement d'événement
 */

import {
  sanitizeName,
  buildRaceMatchingPrompt,
  buildEventJudgePrompt,
  raceMatchingTool,
  eventJudgeTool,
  EventJudgeCandidate,
} from '../llm-prompts'
import { DbRace, RaceMatchInput } from '../types'

describe('sanitizeName', () => {
  it('should handle normal names without modification', () => {
    expect(sanitizeName('Trail des Crêtes')).toBe('Trail des Crêtes')
  })

  it('should strip newlines', () => {
    expect(sanitizeName('Trail\ndes Crêtes')).toBe('Trail des Crêtes')
    expect(sanitizeName('Trail\r\ndes Crêtes')).toBe('Trail des Crêtes')
  })

  it('should strip tab characters', () => {
    expect(sanitizeName('Trail\tdes Crêtes')).toBe('Trail des Crêtes')
  })

  it('should strip control characters (\\x00-\\x1f)', () => {
    expect(sanitizeName('Trail\x00des\x1fCrêtes')).toBe('Trail des Crêtes')
  })

  it('should collapse multiple spaces into one', () => {
    expect(sanitizeName('Trail   des   Crêtes')).toBe('Trail des Crêtes')
  })

  it('should trim leading and trailing spaces', () => {
    expect(sanitizeName('  Trail des Crêtes  ')).toBe('Trail des Crêtes')
  })

  it('should truncate to 200 characters', () => {
    const longName = 'A'.repeat(250)
    expect(sanitizeName(longName)).toHaveLength(200)
  })

  it('should not truncate names shorter than 200 characters', () => {
    const shortName = 'A'.repeat(100)
    expect(sanitizeName(shortName)).toHaveLength(100)
  })

  it('should handle empty string', () => {
    expect(sanitizeName('')).toBe('')
  })
})

describe('buildRaceMatchingPrompt', () => {
  const dbRaces: DbRace[] = [
    {
      id: 175549,
      name: 'Trail la caburotte 53 km',
      runDistance: 53,
      runPositiveElevation: 2100,
      startDate: new Date('2025-06-15T08:00:00Z'),
    },
    {
      id: 175550,
      name: 'Trail la bataille 25 km',
      runDistance: 25,
      startDate: new Date('2025-06-15T09:30:00Z'),
    },
    {
      id: 175546,
      name: 'Randonnée 11,5 km',
      walkDistance: 11.5,
      startDate: null,
    },
  ]

  const inputRaces: RaceMatchInput[] = [
    { name: 'La Caburotte', distance: 55, elevation: 2200, categoryLevel1: 'TRAIL', categoryLevel2: 'LONG_TRAIL' },
    { name: 'La Bataille', distance: 27.5 },
    { name: 'Rando 10km', distance: 10 },
  ]

  it('should include event name and year in the prompt', () => {
    const prompt = buildRaceMatchingPrompt('Trail de la Grande Champagne', 2025, 'Bordeaux', dbRaces, inputRaces)
    expect(prompt).toContain('Trail de la Grande Champagne')
    expect(prompt).toContain('2025')
    expect(prompt).toContain('Bordeaux')
  })

  it('should include all DB race IDs with [id:X] prefix', () => {
    const prompt = buildRaceMatchingPrompt('Event', 2025, 'City', dbRaces, inputRaces)
    expect(prompt).toContain('[id:175549]')
    expect(prompt).toContain('[id:175550]')
    expect(prompt).toContain('[id:175546]')
  })

  it('should include all DB race names', () => {
    const prompt = buildRaceMatchingPrompt('Event', 2025, 'City', dbRaces, inputRaces)
    expect(prompt).toContain('Trail la caburotte 53 km')
    expect(prompt).toContain('Trail la bataille 25 km')
    expect(prompt).toContain('Randonnée 11,5 km')
  })

  it('should include elevation (D+) when available', () => {
    const prompt = buildRaceMatchingPrompt('Event', 2025, 'City', dbRaces, inputRaces)
    expect(prompt).toContain('D+2100m')
  })

  it('should include start time from startDate', () => {
    const prompt = buildRaceMatchingPrompt('Event', 2025, 'City', dbRaces, inputRaces)
    expect(prompt).toContain('08:00')
    expect(prompt).toContain('09:30')
  })

  it('should show ? for start time when startDate is null', () => {
    const prompt = buildRaceMatchingPrompt('Event', 2025, 'City', dbRaces, inputRaces)
    // The randonnée has null startDate, should show ?
    expect(prompt).toContain('?')
  })

  it('should label proposed races with letters (A, B, C...)', () => {
    const prompt = buildRaceMatchingPrompt('Event', 2025, 'City', dbRaces, inputRaces)
    expect(prompt).toContain('[A]')
    expect(prompt).toContain('[B]')
    expect(prompt).toContain('[C]')
  })

  it('should include proposed race names', () => {
    const prompt = buildRaceMatchingPrompt('Event', 2025, 'City', dbRaces, inputRaces)
    expect(prompt).toContain('La Caburotte')
    expect(prompt).toContain('La Bataille')
    expect(prompt).toContain('Rando 10km')
  })

  it('should show "distance inconnue" for DB races with no distance', () => {
    const noDistRaces: DbRace[] = [
      { id: 999, name: 'Course mystère' }
    ]
    const prompt = buildRaceMatchingPrompt('Event', 2025, 'City', noDistRaces, inputRaces)
    expect(prompt).toContain('distance inconnue')
  })

  it('should format multi-discipline distance (run + bike + swim)', () => {
    const triathlonRaces: DbRace[] = [
      {
        id: 1,
        name: 'Triathlon XXL',
        swimDistance: 3800,
        bikeDistance: 180,
        runDistance: 42,
      }
    ]
    const prompt = buildRaceMatchingPrompt('Event', 2025, 'City', triathlonRaces, [])
    expect(prompt).toContain('42km')
    expect(prompt).toContain('vélo 180km')
    expect(prompt).toContain('nat 3800m')
  })

  it('should format walk distance', () => {
    const walkRaces: DbRace[] = [
      { id: 1, name: 'Marche nordique', walkDistance: 15 }
    ]
    const prompt = buildRaceMatchingPrompt('Event', 2025, 'City', walkRaces, [])
    expect(prompt).toContain('marche 15km')
  })
})

describe('buildEventJudgePrompt', () => {
  const candidates: EventJudgeCandidate[] = [
    {
      eventId: 2642,
      eventName: "Marathon du lac d'Annecy",
      eventCity: 'Annecy',
      department: '74',
      editionYear: 2026,
      editionDate: '2026-05-10',
      score: 0.85,
    },
    {
      eventId: 5517,
      eventName: "Grand trail de la vallée d'Ossau",
      eventCity: 'Laruns',
      department: '64',
      editionYear: 2026,
      editionDate: '2026-07-18',
      score: 0.62,
    },
  ]

  it('should include the input event name', () => {
    const prompt = buildEventJudgePrompt('Brooks Marathon Annecy', 'Annecy', '74', '2026-05-10', candidates)
    expect(prompt).toContain('Brooks Marathon Annecy')
  })

  it('should include the input city and department', () => {
    const prompt = buildEventJudgePrompt('Brooks Marathon Annecy', 'Annecy', '74', '2026-05-10', candidates)
    expect(prompt).toContain('Annecy')
    expect(prompt).toContain('74')
  })

  it('should include the input date', () => {
    const prompt = buildEventJudgePrompt('Brooks Marathon Annecy', 'Annecy', '74', '2026-05-10', candidates)
    expect(prompt).toContain('2026-05-10')
  })

  it('should include all candidate IDs with [id:X] prefix', () => {
    const prompt = buildEventJudgePrompt('Brooks Marathon Annecy', 'Annecy', '74', '2026-05-10', candidates)
    expect(prompt).toContain('[id:2642]')
    expect(prompt).toContain('[id:5517]')
  })

  it('should include candidate names', () => {
    const prompt = buildEventJudgePrompt('Brooks Marathon Annecy', 'Annecy', '74', '2026-05-10', candidates)
    expect(prompt).toContain("Marathon du lac d'Annecy")
    expect(prompt).toContain("Grand trail de la vallée d'Ossau")
  })

  it('should include candidate scores', () => {
    const prompt = buildEventJudgePrompt('Brooks Marathon Annecy', 'Annecy', '74', '2026-05-10', candidates)
    expect(prompt).toContain('0.85')
    expect(prompt).toContain('0.62')
  })

  it('should include candidate cities', () => {
    const prompt = buildEventJudgePrompt('Brooks Marathon Annecy', 'Annecy', '74', '2026-05-10', candidates)
    expect(prompt).toContain('Laruns')
  })

  it('should work without optional parameters (department, date)', () => {
    const prompt = buildEventJudgePrompt('Trail des Crêtes', 'Lyon', undefined, undefined, candidates)
    expect(prompt).toContain('Trail des Crêtes')
    expect(prompt).toContain('Lyon')
  })
})

describe('raceMatchingTool', () => {
  it('should have the correct tool name', () => {
    expect(raceMatchingTool.name).toBe('race_matching_result')
  })

  it('should have an input_schema with matches and newRaces', () => {
    expect(raceMatchingTool.input_schema.properties).toHaveProperty('matches')
    expect(raceMatchingTool.input_schema.properties).toHaveProperty('newRaces')
  })

  it('should require matches and newRaces', () => {
    expect(raceMatchingTool.input_schema.required).toContain('matches')
    expect(raceMatchingTool.input_schema.required).toContain('newRaces')
  })

  it('should have correct structure for matches items', () => {
    const matchesSchema = raceMatchingTool.input_schema.properties.matches as any
    expect(matchesSchema.type).toBe('array')
    const itemProps = matchesSchema.items.properties
    expect(itemProps).toHaveProperty('proposedIndex')
    expect(itemProps).toHaveProperty('existingRaceId')
    expect(itemProps).toHaveProperty('confidence')
    expect(itemProps).toHaveProperty('reason')
  })

  it('should have correct structure for newRaces items', () => {
    const newRacesSchema = raceMatchingTool.input_schema.properties.newRaces as any
    expect(newRacesSchema.type).toBe('array')
    const itemProps = newRacesSchema.items.properties
    expect(itemProps).toHaveProperty('proposedIndex')
    expect(itemProps).toHaveProperty('reason')
  })
})

describe('eventJudgeTool', () => {
  it('should have the correct tool name', () => {
    expect(eventJudgeTool.name).toBe('event_judge_result')
  })

  it('should have found as a boolean property', () => {
    const foundSchema = eventJudgeTool.input_schema.properties.found as any
    expect(foundSchema.type).toBe('boolean')
  })

  it('should have eventId, confidence, and reason properties', () => {
    expect(eventJudgeTool.input_schema.properties).toHaveProperty('eventId')
    expect(eventJudgeTool.input_schema.properties).toHaveProperty('confidence')
    expect(eventJudgeTool.input_schema.properties).toHaveProperty('reason')
  })

  it('should require found and reason', () => {
    expect(eventJudgeTool.input_schema.required).toContain('found')
    expect(eventJudgeTool.input_schema.required).toContain('reason')
  })

  it('should NOT require eventId (only present when found=true)', () => {
    expect(eventJudgeTool.input_schema.required).not.toContain('eventId')
  })
})
