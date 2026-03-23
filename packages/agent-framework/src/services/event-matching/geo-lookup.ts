/**
 * Geo lookup via Meilisearch geonames index.
 * Infers department code from a city name.
 */

import { MeilisearchMatchingConfig } from './types'

interface GeonamesHit {
  name: string
  id: string
  'admin2 code'?: string
  'feature code'?: string
}

interface MeilisearchResponse {
  hits: GeonamesHit[]
}

/**
 * Look up the French department code for a given city name
 * using the Meilisearch geonames index.
 *
 * Returns the department code (e.g. "42", "69", "2A") or undefined if not found.
 * Fails silently on any error.
 */
export async function lookupDepartmentFromCity(
  city: string,
  meilisearchConfig: MeilisearchMatchingConfig
): Promise<string | undefined> {
  if (!city || !meilisearchConfig.url || !meilisearchConfig.apiKey) {
    return undefined
  }

  try {
    const url = `${meilisearchConfig.url}/indexes/geonames/search`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${meilisearchConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: city,
        limit: 1,
        attributesToRetrieve: ['name', 'id', 'admin2 code', 'feature code'],
      }),
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      return undefined
    }

    const data = await response.json() as MeilisearchResponse
    if (data.hits.length === 0) {
      return undefined
    }

    return data.hits[0]['admin2 code'] || undefined
  } catch {
    return undefined
  }
}
