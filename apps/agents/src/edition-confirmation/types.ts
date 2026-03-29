export type SourceType = 'event' | 'organizer' | 'timer'

export interface UrlSource {
  url: string
  sourceType: SourceType
}

export interface UrlCheckResult {
  url: string
  sourceType: SourceType
  isAlive: boolean
  isDead: boolean
  httpStatus?: number
  htmlText?: string
  contentLength?: number
  errorReason?: string
}

export interface UrlAnalysis {
  confirmed: boolean
  canceled: boolean
  registrationOpen: boolean
  datesFound: string[]
  yearMentioned: boolean
  confidence: number
  reasoning: string
}

export type UrlCheckResultWithAnalysis =
  | (UrlCheckResult & { isAlive: true; analysis: UrlAnalysis })
  | (UrlCheckResult & { isAlive: false; analysis?: undefined })
