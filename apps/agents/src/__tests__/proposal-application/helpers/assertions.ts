import { testMilesRepublicDb } from './db-setup'

/**
 * Vérifie que tous les champs d'un objet correspondent aux valeurs attendues
 * 
 * @example
 * expectObjectFields(event, {
 *   name: 'Trail Test',
 *   city: 'Paris',
 *   country: 'France'
 * })
 */
export const expectObjectFields = <T extends Record<string, any>>(
  obj: T | null,
  expected: Partial<T>
) => {
  expect(obj).not.toBeNull()
  
  Object.entries(expected).forEach(([key, value]) => {
    if (value instanceof Date) {
      expect(obj![key]).toEqual(value)
    } else if (value === null) {
      expect(obj![key]).toBeNull()
    } else {
      expect(obj![key]).toBe(value)
    }
  })
}

/**
 * Vérifie le nombre de courses actives d'une édition
 * 
 * @param editionId - ID de l'édition
 * @param count - Nombre attendu de courses actives
 * 
 * @example
 * await expectRaceCount(editionId, 3)
 */
export const expectRaceCount = async (editionId: number, count: number) => {
  const races = await testMilesRepublicDb.race.findMany({
    where: {
      editionId,
      archivedAt: null
    }
  })
  expect(races).toHaveLength(count)
}

/**
 * Vérifie qu'une course est archivée
 * 
 * @param raceId - ID de la course
 * 
 * @example
 * await expectRaceArchived(raceId)
 */
export const expectRaceArchived = async (raceId: number) => {
  const race = await testMilesRepublicDb.race.findUnique({
    where: { id: raceId }
  })
  
  expect(race).not.toBeNull()
  expect(race!.archivedAt).not.toBeNull()
}

/**
 * Vérifie qu'une course est active (non archivée)
 * 
 * @param raceId - ID de la course
 * 
 * @example
 * await expectRaceActive(raceId)
 */
export const expectRaceActive = async (raceId: number) => {
  const race = await testMilesRepublicDb.race.findUnique({
    where: { id: raceId }
  })
  
  expect(race).not.toBeNull()
  expect(race!.archivedAt).toBeNull()
}

/**
 * Vérifie qu'un champ spécifique n'a pas été modifié
 * 
 * @param model - Nom du modèle Prisma (minuscule: 'event', 'edition', 'race')
 * @param id - ID de l'objet
 * @param field - Nom du champ à vérifier
 * @param expectedValue - Valeur attendue (inchangée)
 * 
 * @example
 * await expectFieldUnchanged('event', eventId, 'city', 'Paris')
 */
export const expectFieldUnchanged = async <T = any>(
  model: 'event' | 'edition' | 'race' | 'organizer',
  id: number,
  field: string,
  expectedValue: any
) => {
  const obj = await (testMilesRepublicDb[model] as any).findUnique({
    where: { id }
  })
  
  expect(obj).not.toBeNull()
  expect(obj[field]).toBe(expectedValue)
}

/**
 * Vérifie qu'un événement existe en base
 * 
 * @param eventId - ID de l'événement
 * @returns L'événement trouvé
 * 
 * @example
 * const event = await expectEventExists(eventId)
 */
export const expectEventExists = async (eventId: number) => {
  const event = await testMilesRepublicDb.event.findUnique({
    where: { id: eventId }
  })
  
  expect(event).not.toBeNull()
  return event!
}

/**
 * Vérifie qu'une édition existe en base
 * 
 * @param editionId - ID de l'édition
 * @returns L'édition trouvée
 * 
 * @example
 * const edition = await expectEditionExists(editionId)
 */
export const expectEditionExists = async (editionId: number) => {
  const edition = await testMilesRepublicDb.edition.findUnique({
    where: { id: editionId },
    include: {
      event: true,
      organizer: true,
      races: true
    }
  })
  
  expect(edition).not.toBeNull()
  return edition!
}

/**
 * Vérifie qu'un slug respecte le format attendu
 * 
 * @param slug - Slug à vérifier
 * @param baseName - Nom de base attendu dans le slug
 * 
 * @example
 * expectSlugFormat('trail-des-loups-12345', 'trail-des-loups')
 */
export const expectSlugFormat = (slug: string, baseName: string) => {
  const regex = new RegExp(`^${baseName}-\\d+$`)
  expect(slug).toMatch(regex)
}

/**
 * Vérifie qu'une date est proche d'une autre (tolérance de quelques ms)
 * Utile pour les dates générées automatiquement
 * 
 * @param actual - Date actuelle
 * @param expected - Date attendue
 * @param toleranceMs - Tolérance en millisecondes (défaut: 5000ms)
 * 
 * @example
 * expectDateClose(createdAt, new Date(), 5000)
 */
export const expectDateClose = (
  actual: Date | null,
  expected: Date,
  toleranceMs: number = 5000
) => {
  expect(actual).not.toBeNull()
  
  const diff = Math.abs(actual!.getTime() - expected.getTime())
  expect(diff).toBeLessThan(toleranceMs)
}

/**
 * Vérifie qu'un organisateur a été créé ou réutilisé
 * 
 * @param editionId - ID de l'édition
 * @param expectedName - Nom attendu de l'organisateur
 * @returns L'organisateur trouvé
 * 
 * @example
 * const organizer = await expectOrganizerLinked(editionId, 'Trail BFC')
 */
export const expectOrganizerLinked = async (
  editionId: number,
  expectedName: string
) => {
  const edition = await testMilesRepublicDb.edition.findUnique({
    where: { id: editionId },
    include: { organizer: true }
  })
  
  expect(edition).not.toBeNull()
  expect(edition!.organizerId).not.toBeNull()
  expect(edition!.organizer).not.toBeNull()
  expect(edition!.organizer!.name).toBe(expectedName)
  
  return edition!.organizer!
}

/**
 * Vérifie que plusieurs champs n'ont PAS été modifiés
 * 
 * @param model - Nom du modèle
 * @param id - ID de l'objet
 * @param fields - Map { field: expectedValue }
 * 
 * @example
 * await expectFieldsUnchanged('event', eventId, {
 *   city: 'Paris',
 *   country: 'France',
 *   facebookUrl: 'https://facebook.com/old'
 * })
 */
export const expectFieldsUnchanged = async (
  model: 'event' | 'edition' | 'race' | 'organizer',
  id: number,
  fields: Record<string, any>
) => {
  const obj = await (testMilesRepublicDb[model] as any).findUnique({
    where: { id }
  })
  
  expect(obj).not.toBeNull()
  
  Object.entries(fields).forEach(([field, expectedValue]) => {
    if (expectedValue instanceof Date) {
      expect(obj[field]).toEqual(expectedValue)
    } else {
      expect(obj[field]).toBe(expectedValue)
    }
  })
}
