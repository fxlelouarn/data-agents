/**
 * HTML preprocessor for LLM extraction.
 * Strips unnecessary elements to minimize token usage.
 */

import * as cheerio from 'cheerio'

/**
 * Preprocess HTML for LLM extraction.
 * Strips scripts, styles, nav, header, footer.
 * Optionally extracts a specific CSS selector section.
 *
 * @param html - Raw HTML string
 * @param cssSelector - Optional CSS selector to extract (e.g. "#epreuves")
 * @returns Cleaned HTML string
 */
export function preprocessHtml(html: string, cssSelector?: string): string {
  const $ = cheerio.load(html)

  // Remove noise elements
  $('script, style, nav, header, footer, link, meta, noscript, svg, iframe').remove()

  // If a specific selector is requested, try to extract just that section
  if (cssSelector) {
    const $section = $(cssSelector)
    if ($section.length > 0) {
      const sectionHtml = $section.html() || ''
      return collapseWhitespace(sectionHtml)
    }
    // Selector not found — fall through to full document
  }

  const cleaned = $('body').html() || $.html()
  return collapseWhitespace(cleaned)
}

function collapseWhitespace(text: string): string {
  return text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}
