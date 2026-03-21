/**
 * Common input format for the shared proposal builder.
 * All agents convert their extracted data into this format before calling the builder.
 */
export interface ProposalInput {
  // Event
  eventName: string
  eventCity?: string
  eventCountry?: string
  eventDepartment?: string
  countrySubdivisionNameLevel1?: string
  countrySubdivisionDisplayCodeLevel1?: string
  countrySubdivisionNameLevel2?: string
  countrySubdivisionDisplayCodeLevel2?: string

  // Edition
  editionYear?: number
  editionDate?: string       // ISO date (YYYY-MM-DD)
  editionEndDate?: string    // ISO date (YYYY-MM-DD)
  timeZone?: string          // IANA timezone (e.g. "Europe/Paris")
  calendarStatus?: string    // e.g. "CONFIRMED"
  registrationClosingDate?: string
  dataSource?: string        // e.g. "FEDERATION"

  // Races
  races?: ProposalRaceInput[]

  // Organizer
  organizer?: {
    name?: string
    email?: string
    phone?: string
    websiteUrl?: string
    facebookUrl?: string
    instagramUrl?: string
  }

  // URLs
  registrationUrl?: string
  websiteUrl?: string

  // Meta
  confidence: number         // source confidence (0-1)
  source: string             // e.g. "ffa", "slack", "google"
}

/**
 * Race data in common format.
 * Distance is ALWAYS in meters. The builder converts to km when assigning to DB fields.
 */
export interface ProposalRaceInput {
  name: string
  distance?: number          // meters
  elevation?: number         // D+ meters
  startTime?: string         // HH:mm local
  raceDate?: string          // for multi-day events (DD/MM or ISO)
  price?: number
  categoryLevel1?: string
  categoryLevel2?: string
}
