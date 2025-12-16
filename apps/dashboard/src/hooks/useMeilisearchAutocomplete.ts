import { useState, useEffect, useCallback } from 'react'
import { useDebounce } from './useDebounce'

// Utiliser la même URL de base que le reste de l'application
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

export interface MeilisearchEvent {
  objectID: string
  name?: string
  city?: string
  country?: string
  year?: string
  startDate?: string
  eventName?: string
  eventCity?: string
}

export interface MeilisearchAutocompleteResult {
  events: MeilisearchEvent[]
  loading: boolean
  error: string | null
  configured: boolean
}

export const useMeilisearchAutocomplete = (
  query: string,
  limit: number = 10
): MeilisearchAutocompleteResult => {
  const [events, setEvents] = useState<MeilisearchEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [configured, setConfigured] = useState(true)

  // Debounce the search query to avoid too many API calls
  const debouncedQuery = useDebounce(query, 300)

  const searchEvents = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setEvents([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `${API_BASE_URL}/events/autocomplete?q=${encodeURIComponent(searchQuery)}&limit=${limit}`
      )
      const data = await response.json()

      if (data.success) {
        setEvents(data.data.events)
        setConfigured(data.data.configured)
      } else {
        setError(data.message || 'Erreur de recherche')
        setConfigured(data.data?.configured ?? false)
        setEvents([])
      }
    } catch (err) {
      setError('Erreur de connexion à Meilisearch')
      setEvents([])
      setConfigured(false)
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => {
    if (debouncedQuery) {
      searchEvents(debouncedQuery)
    } else {
      setEvents([])
      setLoading(false)
    }
  }, [debouncedQuery, searchEvents])

  return {
    events,
    loading,
    error,
    configured
  }
}

// Hook for caching an event found via Meilisearch
export const useCacheEventFromMeilisearch = () => {
  const [caching, setCaching] = useState(false)

  const cacheEvent = useCallback(async (eventId: string) => {
    setCaching(true)
    try {
      const response = await fetch(`${API_BASE_URL}/events/${eventId}?cache=true`)
      const data = await response.json()

      if (data.success) {
        return data.data.event
      } else {
        throw new Error(data.message || 'Erreur lors de la mise en cache')
      }
    } catch (error) {
      console.error('Error caching event:', error)
      throw error
    } finally {
      setCaching(false)
    }
  }, [])

  return { cacheEvent, caching }
}
