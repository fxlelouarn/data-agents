import { Page } from 'playwright'
import { 
  WebScraperAgent, 
  AgentContext, 
  ExtractionResult, 
  EventData, 
  EditionData, 
  RaceData 
} from '@data-agents/agent-framework'

/**
 * FFA (Fédération Française d'Athlétisme) Scraper Agent
 * Extracts running events from the official FFA calendar
 */
export class FFAScraperAgent extends WebScraperAgent {
  private baseUrl = 'https://bases.athle.fr/calendrier/'

  async scrapeData(page: Page, context: AgentContext): Promise<ExtractionResult[]> {
    const results: ExtractionResult[] = []

    try {
      context.logger.info('Starting FFA calendar scraping')
      
      // Navigate to FFA calendar
      await this.navigateToUrl(this.baseUrl, '.calendar-container')

      // Extract event links from the calendar
      const eventLinks = await this.extractEventLinks(page, context)
      
      context.logger.info(`Found ${eventLinks.length} events to process`)

      // Process each event
      for (const eventUrl of eventLinks.slice(0, 10)) { // Limit to first 10 for demo
        try {
          const eventData = await this.scrapeEventDetails(page, eventUrl, context)
          if (eventData) {
            results.push(eventData)
          }
        } catch (error) {
          context.logger.warn(`Failed to scrape event ${eventUrl}`, { error: error?.toString() })
        }
      }

      context.logger.info(`Successfully scraped ${results.length} events`)

    } catch (error) {
      context.logger.error('FFA scraping failed', { error: error?.toString() })
      throw error
    }

    return results
  }

  private async extractEventLinks(page: Page, context: AgentContext): Promise<string[]> {
    // Wait for calendar to load
    await this.waitForElement('.event-list', 5000)

    // Extract event URLs
    const links = await page.$$eval('a.event-link', (elements: HTMLAnchorElement[]) => 
      elements.map(el => el.href).filter(href => href.includes('/competitions/'))
    )

    return links.map(link => new URL(link, this.baseUrl).href)
  }

  private async scrapeEventDetails(
    page: Page, 
    eventUrl: string, 
    context: AgentContext
  ): Promise<ExtractionResult | null> {
    context.logger.debug(`Scraping event: ${eventUrl}`)

    await this.navigateToUrl(eventUrl)

    try {
      // Extract basic event information
      const eventName = await this.extractText(page, 'h1.event-title') || 
                       await this.extractText(page, '.competition-name') ||
                       'Event FFA'

      const eventLocation = await this.extractText(page, '.event-location') ||
                           await this.extractText(page, '.lieu')

      const eventDate = await this.extractText(page, '.event-date') ||
                       await this.extractText(page, '.date-competition')

      // Extract city from location
      const city = this.extractCityFromLocation(eventLocation || '')

      // Parse event date
      const parsedDate = this.parseDate(eventDate || '')
      const year = parsedDate ? parsedDate.getFullYear() : new Date().getFullYear()

      // Create event data
      const event: EventData = {
        name: this.cleanText(eventName),
        city: city || 'Paris', // Default fallback
        country: 'France',
        countrySubdivisionNameLevel1: this.extractRegion(eventLocation || ''),
        countrySubdivisionNameLevel2: this.extractDepartment(eventLocation || ''),
        fullAddress: eventLocation || undefined,
        websiteUrl: eventUrl,
        dataSource: 'FEDERATION' as const
      }

      // Create edition data
      const edition: EditionData = {
        year: year.toString(),
        calendarStatus: 'TO_BE_CONFIRMED',
        startDate: parsedDate,
        registrationOpeningDate: this.calculateRegistrationStart(parsedDate),
        registrationClosingDate: this.calculateRegistrationEnd(parsedDate),
        timeZone: 'Europe/Paris',
        currency: 'EUR',
        dataSource: 'FEDERATION' as const
      }

      // Extract race information
      const races = await this.extractRaces(page, context)

      return {
        events: [event],
        editions: [edition],
        races: races,
        confidence: 0.8,
        source: eventUrl
      }

    } catch (error) {
      context.logger.warn(`Failed to extract details for ${eventUrl}`, { 
        error: error?.toString() 
      })
      return null
    }
  }

  private async extractRaces(page: Page, context: AgentContext): Promise<RaceData[]> {
    const races: RaceData[] = []

    try {
      // Look for race information in various possible selectors
      const raceSelectors = [
        '.race-list .race-item',
        '.epreuves-list .epreuve',
        '.competitions-table tr'
      ]

      for (const selector of raceSelectors) {
        const elements = await page.$$(selector)
        
        if (elements.length > 0) {
          for (const element of elements) {
            const raceText = await element.textContent()
            if (raceText) {
              const race = this.parseRaceFromText(raceText.trim())
              if (race) {
                races.push(race)
              }
            }
          }
          break // Stop after finding races with one selector
        }
      }

      // If no structured races found, try to extract from general text
      if (races.length === 0) {
        const pageText = await page.textContent('body')
        if (pageText) {
          const extractedRaces = this.extractRacesFromText(pageText)
          races.push(...extractedRaces)
        }
      }

    } catch (error) {
      context.logger.debug('Failed to extract races', { error: error?.toString() })
    }

    return races
  }

  private parseRaceFromText(text: string): RaceData | null {
    // Common race distance patterns
    const distancePatterns = [
      /(\d+(?:\.\d+)?)\s*km/i,
      /(\d+(?:\.\d+)?)\s*kilomètre/i,
      /(\d+)\s*m(?:\s|$)/i, // meters
      /marathon/i,
      /semi[-\s]?marathon/i,
      /10\s?km/i,
      /5\s?km/i
    ]

    let distanceKm: number | undefined
    let name = text

    // Extract distance
    for (const pattern of distancePatterns) {
      const match = text.match(pattern)
      if (match) {
        if (match[0].toLowerCase().includes('marathon')) {
          distanceKm = match[0].toLowerCase().includes('semi') ? 21.1 : 42.195
          name = match[0].toLowerCase().includes('semi') ? 'Semi-marathon' : 'Marathon'
        } else if (match[1]) {
          distanceKm = parseFloat(match[1])
          if (text.includes(' m ') && distanceKm < 100) {
            distanceKm = distanceKm / 1000 // Convert meters to kilometers
          }
        }
        break
      }
    }

    if (distanceKm) {
      return {
        name: name,
        runDistance: distanceKm,
        distanceCategory: this.mapDistanceToCategory(distanceKm)
      }
    }

    return null
  }

  private mapDistanceToCategory(distanceKm: number): RaceData['distanceCategory'] {
    if (distanceKm < 2) return 'XXS'
    if (distanceKm < 5) return 'XS'
    if (distanceKm < 15) return 'S'
    if (distanceKm < 25) return 'M'
    if (distanceKm < 50) return 'L'
    if (distanceKm < 100) return 'XL'
    return 'XXL'
  }

  private extractRacesFromText(text: string): RaceData[] {
    const races: RaceData[] = []
    const lines = text.split('\n')

    for (const line of lines) {
      const race = this.parseRaceFromText(line)
      if (race && !races.some(r => r.runDistance === race.runDistance)) {
        races.push(race)
      }
    }

    return races
  }

  private async extractText(page: Page, selector: string): Promise<string | null> {
    try {
      const element = await page.$(selector)
      return element ? await element.textContent() : null
    } catch {
      return null
    }
  }

  private extractCityFromLocation(location: string): string {
    // Extract city from location string
    // Common patterns: "City (Department)" or "City - Department" or just "City"
    const cityMatch = location.match(/^([^(-]+)/)
    return cityMatch ? cityMatch[1].trim() : location
  }

  private extractRegion(location: string): string {
    // Extract region from location - simplified mapping for French departments
    const departmentRegionMap: Record<string, string> = {
      '75': 'Île-de-France', 'Paris': 'Île-de-France',
      '92': 'Île-de-France', '93': 'Île-de-France', '94': 'Île-de-France',
      '13': 'Provence-Alpes-Côte d\'Azur', 'Marseille': 'Provence-Alpes-Côte d\'Azur',
      '69': 'Auvergne-Rhône-Alpes', 'Lyon': 'Auvergne-Rhône-Alpes'
    }
    
    for (const [dept, region] of Object.entries(departmentRegionMap)) {
      if (location.toLowerCase().includes(dept.toLowerCase())) {
        return region
      }
    }
    return 'France' // Default fallback
  }

  private extractDepartment(location: string): string {
    // Extract department from location
    const deptMatch = location.match(/\((\d{2,3})\)|\b(\d{2,3})\b/)
    if (deptMatch) {
      const deptCode = deptMatch[1] || deptMatch[2]
      return deptCode
    }
    
    // Common city to department mapping
    const cityDeptMap: Record<string, string> = {
      'paris': '75',
      'marseille': '13', 
      'lyon': '69',
      'toulouse': '31',
      'nice': '06'
    }
    
    for (const [city, dept] of Object.entries(cityDeptMap)) {
      if (location.toLowerCase().includes(city)) {
        return dept
      }
    }
    
    return '75' // Default to Paris
  }

  private calculateRegistrationStart(eventDate: Date | undefined): Date | undefined {
    if (!eventDate) return undefined
    // Assume registration opens 3 months before event
    const start = new Date(eventDate)
    start.setMonth(start.getMonth() - 3)
    return start
  }

  private calculateRegistrationEnd(eventDate: Date | undefined): Date | undefined {
    if (!eventDate) return undefined
    // Assume registration closes 1 week before event
    const end = new Date(eventDate)
    end.setDate(end.getDate() - 7)
    return end
  }
}