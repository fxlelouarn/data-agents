import { MeiliSearch, Index } from 'meilisearch'

export interface MeilisearchEvent {
  objectID: string // Correspond à l'eventId de MilesRepublic
  name: string
  city: string
  country: string
  startDate?: string
  endDate?: string
  year?: string
  websiteUrl?: string
  slug?: string
  latitude?: number
  longitude?: number
  // Autres champs selon l'index Meilisearch
}

export interface MeilisearchSearchParams {
  query: string
  limit?: number
  offset?: number
  filters?: string
  facets?: string[]
  attributesToRetrieve?: string[]
  attributesToHighlight?: string[]
  attributesToCrop?: string[]
}

export interface MeilisearchSearchResult {
  hits: MeilisearchEvent[]
  query: string
  processingTimeMs: number
  limit: number
  offset: number
  estimatedTotalHits: number
}

export class MeilisearchService {
  private client: MeiliSearch | null = null
  private eventsIndex: Index | null = null
  private isConnected = false

  constructor(
    private url: string | null = null,
    private apiKey: string | null = null,
    private indexName: string = 'fra_events' // Nom de l'index par défaut
  ) {}

  /**
   * Configure et initialise la connexion à Meilisearch
   */
  configure(url: string, apiKey: string): void {
    this.url = url
    this.apiKey = apiKey
    this.client = null
    this.eventsIndex = null
    this.isConnected = false
  }

  /**
   * Initialise la connexion à Meilisearch si pas encore fait
   */
  private async ensureConnection(): Promise<void> {
    if (this.isConnected && this.client && this.eventsIndex) {
      return
    }

    if (!this.url || !this.apiKey) {
      throw new Error('Meilisearch URL and API key must be configured')
    }

    try {
      this.client = new MeiliSearch({
        host: this.url,
        apiKey: this.apiKey,
      })

      // Test de la connexion
      await this.client.health()
      
      // Récupérer l'index des événements
      this.eventsIndex = this.client.index(this.indexName)
      
      this.isConnected = true
      console.log('✅ Meilisearch connection established')
    } catch (error) {
      this.isConnected = false
      this.client = null
      this.eventsIndex = null
      throw new Error(`Failed to connect to Meilisearch: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Teste la connexion à Meilisearch
   */
  async testConnection(): Promise<{ success: boolean, message: string }> {
    try {
      await this.ensureConnection()
      
      if (!this.eventsIndex) {
        return { success: false, message: 'Events index not available' }
      }

      // Test avec une recherche simple (compatible avec search API key)
      const searchResult = await this.eventsIndex.search('', { limit: 1 })
      
      return {
        success: true,
        message: `Connected successfully. Search test returned ${searchResult.estimatedTotalHits} total events`
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown connection error'
      }
    }
  }

  /**
   * Recherche des événements dans Meilisearch
   */
  async searchEvents(params: MeilisearchSearchParams): Promise<MeilisearchSearchResult> {
    await this.ensureConnection()

    if (!this.eventsIndex) {
      throw new Error('Meilisearch events index not available')
    }

    try {
      const searchParams = {
        limit: params.limit || 20,
        offset: params.offset || 0,
        filter: params.filters,
        facets: params.facets,
      attributesToRetrieve: params.attributesToRetrieve || ['objectID', 'eventName', 'eventCity', 'eventCountry', 'editionLiveStartDateTimestamp', 'eventSlug'],
        attributesToHighlight: params.attributesToHighlight,
        attributesToCrop: params.attributesToCrop,
      }

      // Retirer les paramètres undefined pour éviter les erreurs
      Object.keys(searchParams).forEach(key => {
        if (searchParams[key as keyof typeof searchParams] === undefined) {
          delete searchParams[key as keyof typeof searchParams]
        }
      })

      const result = await this.eventsIndex.search(params.query, searchParams)

      return {
        hits: result.hits as MeilisearchEvent[],
        query: result.query,
        processingTimeMs: result.processingTimeMs,
        limit: result.limit,
        offset: result.offset,
        estimatedTotalHits: result.estimatedTotalHits
      }
    } catch (error) {
      throw new Error(`Meilisearch search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Recherche d'événements avec suggestion d'autocomplétion
   */
  async searchEventsAutocomplete(query: string, limit: number = 10): Promise<MeilisearchEvent[]> {
    if (!query.trim()) {
      return []
    }

    const result = await this.searchEvents({
      query: query.trim(),
      limit,
      attributesToRetrieve: ['objectID', 'eventName', 'eventCity', 'eventCountry', 'editionLiveStartDateTimestamp'],
      attributesToHighlight: ['eventName', 'eventCity']
    })

    return result.hits
  }

  /**
   * Récupère un événement par son objectID (eventId)
   */
  async getEventById(objectId: string): Promise<MeilisearchEvent | null> {
    await this.ensureConnection()

    if (!this.eventsIndex) {
      throw new Error('Meilisearch events index not available')
    }

    try {
      const document = await this.eventsIndex.getDocument(objectId)
      return document as MeilisearchEvent
    } catch (error) {
      // Si le document n'existe pas, retourner null
      if (error && typeof error === 'object' && 'code' in error && error.code === 'document_not_found') {
        return null
      }
      throw new Error(`Failed to get event by ID: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Vérifie si Meilisearch est configuré et disponible
   */
  isConfigured(): boolean {
    return !!(this.url && this.apiKey)
  }

  /**
   * Vérifie si la connexion est active
   */
  isConnectionActive(): boolean {
    return this.isConnected
  }

  /**
   * Force la reconnexion
   */
  async reconnect(): Promise<void> {
    this.isConnected = false
    this.client = null
    this.eventsIndex = null
    await this.ensureConnection()
  }

  /**
   * Ferme la connexion (cleanup)
   */
  disconnect(): void {
    this.isConnected = false
    this.client = null
    this.eventsIndex = null
    console.log('🔌 Meilisearch connection closed')
  }
}

// Instance singleton du service
let meilisearchServiceInstance: MeilisearchService | null = null

export const getMeilisearchService = (url?: string, apiKey?: string): MeilisearchService => {
  if (!meilisearchServiceInstance) {
    meilisearchServiceInstance = new MeilisearchService(url, apiKey)
  } else if (url && apiKey) {
    // Reconfigure si de nouveaux paramètres sont fournis
    meilisearchServiceInstance.configure(url, apiKey)
  }
  
  return meilisearchServiceInstance
}