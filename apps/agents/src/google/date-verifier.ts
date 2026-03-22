import * as cheerio from 'cheerio'
import Anthropic from '@anthropic-ai/sdk'

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const MAX_OUTPUT_BYTES = 50 * 1024 // 50 KB
const MAX_CLAUDE_BYTES = 30 * 1024 // 30 KB
const MIN_TEXT_LENGTH = 50

/**
 * Fetches a page with a browser User-Agent and 15s timeout.
 * Returns the HTML string or null on any failure.
 */
export async function fetchPage(url: string): Promise<string | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': BROWSER_USER_AGENT },
      signal: controller.signal,
    })

    if (!response.ok) return null

    const html = await response.text()
    return html
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Cleans HTML using cheerio, removing noise and extracting meaningful text.
 * Limits output to 50 KB.
 */
export function cleanHtml(html: string): string {
  const $ = cheerio.load(html)

  // Remove noise elements
  $('script, style, noscript, iframe, svg, img, video, audio').remove()
  $('nav, footer, header, aside').remove()

  // Remove cookie/popup/modal/banner elements by class or id
  const noisePatterns = /cookie|popup|modal|banner|overlay|gdpr|consent|notice|alert/i
  $('[class],[id]').each((_i, el) => {
    const cls = $(el).attr('class') || ''
    const id = $(el).attr('id') || ''
    if (noisePatterns.test(cls) || noisePatterns.test(id)) {
      $(el).remove()
    }
  })

  // Try to find main content
  const contentSelectors = [
    'main',
    'article',
    '[role="main"]',
    '.content',
    '.main-content',
    '#content',
  ]

  let text = ''
  for (const selector of contentSelectors) {
    const el = $(selector).first()
    if (el.length) {
      text = el.text()
      break
    }
  }

  // Fallback to body
  if (!text) {
    text = $('body').text()
  }

  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim()

  // Limit to 50 KB
  if (Buffer.byteLength(text, 'utf8') > MAX_OUTPUT_BYTES) {
    // Slice by character count (approximate)
    text = text.slice(0, MAX_OUTPUT_BYTES)
  }

  return text
}

/**
 * Formats a YYYY-MM-DD date as DD/MM/YYYY.
 */
function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

/**
 * Asks Claude Haiku whether the page text confirms the given date for the event.
 * Returns { confirmed, reason } or null if unparseable.
 */
async function askClaude(
  pageText: string,
  extractedDate: string,
  eventName: string,
  eventCity: string | undefined,
  apiKey: string | undefined
): Promise<{ confirmed: boolean; reason: string } | null> {
  const client = new Anthropic({ apiKey })

  const truncatedText = pageText.slice(0, MAX_CLAUDE_BYTES)
  const formattedDate = formatDate(extractedDate)
  const cityLine = eventCity ? `Ville : ${eventCity}` : ''

  const userPrompt = `Voici une page web. Dis-moi si elle confirme que l'événement suivant a lieu le ${formattedDate}.

Événement : ${eventName}
${cityLine}

Texte de la page :
---
${truncatedText}
---

Réponds uniquement avec du JSON valide (sans markdown) :
{"confirmed": true/false, "reason": "explication courte"}`

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      temperature: 0,
      system:
        'Tu vérifies si une page web confirme la date d\'un événement sportif. Réponds uniquement en JSON valide.',
      messages: [{ role: 'user', content: userPrompt }],
    })

    const content = message.content[0]
    if (content.type !== 'text') return null

    let rawText = content.text.trim()

    // Strip markdown code blocks if present
    rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    const parsed = JSON.parse(rawText)
    if (typeof parsed.confirmed !== 'boolean' || typeof parsed.reason !== 'string') {
      return null
    }

    return { confirmed: parsed.confirmed, reason: parsed.reason }
  } catch {
    return null
  }
}

/**
 * Orchestrates: fetch → clean → ask Claude.
 * Returns null if the page is inaccessible, text too short, or Claude is unparseable.
 */
export async function verifyDateFromSource(
  url: string,
  extractedDate: string,
  eventName: string,
  eventCity?: string,
  apiKey?: string
): Promise<{ confirmed: boolean; reason: string } | null> {
  const html = await fetchPage(url)
  if (!html) return null

  const pageText = cleanHtml(html)
  if (pageText.length < MIN_TEXT_LENGTH) return null

  return askClaude(pageText, extractedDate, eventName, eventCity, apiKey)
}
