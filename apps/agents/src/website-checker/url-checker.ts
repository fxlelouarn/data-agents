import axios, { AxiosError } from 'axios'
import { preprocessHtml } from '@data-agents/agent-framework'
import type { UrlSource, UrlCheckResult } from './types'

const DEFAULT_TIMEOUT = 10_000
const DEFAULT_MAX_CHARS = 8_000
const USER_AGENT = 'Mozilla/5.0 (compatible; DataAgentsBot/1.0; +https://milesrepublic.com)'

const PARKING_INDICATORS = [
  'domain is parked',
  'domain is for sale',
  'domaine à vendre',
  'buy this domain',
  'this domain has expired',
  'godaddy',
  'sedoparking',
  'hugedomains',
  'dan.com',
  'afternic',
]

/**
 * Detects if HTML content is a parked/for-sale domain page.
 */
export function isParkedDomain(html: string): boolean {
  const lower = html.toLowerCase()
  return PARKING_INDICATORS.some(indicator => lower.includes(indicator))
}

/**
 * Converts HTML to clean markdown using shared preprocessor (cheerio + turndown).
 * Truncates to maxChars.
 */
function extractContent(html: string, maxChars: number): string {
  const markdown = preprocessHtml(html)
  return markdown.slice(0, maxChars)
}

interface CheckUrlOptions {
  timeoutMs?: number
  maxChars?: number
}

/**
 * Checks a single URL for liveness and extracts text content.
 *
 * Returns:
 * - isAlive: true if the site responded with 2xx and has real content
 * - isDead: true if the URL is permanently dead (404, DNS failure, parking)
 *   Note: timeout = NOT dead (site might be temporarily slow)
 */
export async function checkUrl(
  source: UrlSource,
  options?: CheckUrlOptions
): Promise<UrlCheckResult> {
  const { url, sourceType } = source
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT
  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS

  const base: Pick<UrlCheckResult, 'url' | 'sourceType'> = { url, sourceType }

  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: timeoutMs,
      maxRedirects: 5,
      responseType: 'text',
      validateStatus: () => true, // Don't throw on non-2xx
    })

    if (response.status >= 400) {
      const isDead = response.status === 404 || response.status === 410 || response.status === 403
      return {
        ...base,
        isAlive: false,
        isDead,
        httpStatus: response.status,
        errorReason: `HTTP_${response.status}`,
      }
    }

    const html = typeof response.data === 'string' ? response.data : String(response.data)

    // Check for parked domains
    if (isParkedDomain(html)) {
      return {
        ...base,
        isAlive: false,
        isDead: true,
        httpStatus: response.status,
        errorReason: 'PARKING_PAGE',
      }
    }

    const htmlText = extractContent(html, maxChars)

    return {
      ...base,
      isAlive: true,
      isDead: false,
      httpStatus: response.status,
      htmlText,
      contentLength: htmlText.length,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    const code = err instanceof AxiosError ? err.code : undefined

    // DNS failure = dead URL
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || message.includes('ENOTFOUND') || message.includes('EAI_AGAIN')) {
      return {
        ...base,
        isAlive: false,
        isDead: true,
        errorReason: 'DNS_FAILURE',
      }
    }

    // Connection refused = dead
    if (code === 'ECONNREFUSED' || message.includes('ECONNREFUSED')) {
      return {
        ...base,
        isAlive: false,
        isDead: true,
        errorReason: 'CONNECTION_REFUSED',
      }
    }

    // Timeout = NOT dead, just unreachable
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || message.includes('timeout') || message.includes('ETIMEDOUT')) {
      return {
        ...base,
        isAlive: false,
        isDead: false,
        errorReason: 'TIMEOUT',
      }
    }

    // Other errors = not dead (unknown issue)
    return {
      ...base,
      isAlive: false,
      isDead: false,
      errorReason: `UNKNOWN: ${message}`,
    }
  }
}
