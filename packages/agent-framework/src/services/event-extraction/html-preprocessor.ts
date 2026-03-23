/**
 * HTML preprocessor for LLM extraction.
 * Strips unnecessary elements to minimize token usage.
 */

import * as cheerio from 'cheerio'

/**
 * Preprocess HTML for LLM extraction.
 * Strips scripts, styles, nav, header, footer.
 * Optionally extracts specific CSS selector sections.
 *
 * @param html - Raw HTML string
 * @param cssSelector - Optional CSS selector(s) to extract. Can be:
 *   - A single selector: "#epreuves"
 *   - Multiple selectors (comma-separated CSS): "#infoPratique, #epreuves"
 *   - Multiple selectors (array): ["#infoPratique", "#epreuves"]
 * @returns Cleaned HTML string
 */
export function preprocessHtml(html: string, cssSelector?: string | string[]): string {
  const $ = cheerio.load(html)

  // Remove noise elements
  $('script, style, nav, header, footer, link, meta, noscript, svg, iframe').remove()

  // If specific selectors are requested, extract those sections
  if (cssSelector) {
    const selectors = Array.isArray(cssSelector) ? cssSelector : [cssSelector]
    const parts: string[] = []

    for (const sel of selectors) {
      $(sel).each((_, el) => {
        const sectionHtml = $(el).html()
        if (sectionHtml) {
          parts.push(sectionHtml)
        }
      })
    }

    if (parts.length > 0) {
      return collapseWhitespace(parts.join('\n'))
    }
    // No selectors found — fall through to full document
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
