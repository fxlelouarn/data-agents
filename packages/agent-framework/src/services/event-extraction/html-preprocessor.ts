/**
 * HTML preprocessor for LLM extraction.
 * Converts HTML to clean markdown using cheerio + turndown.
 */

import * as cheerio from 'cheerio'
import TurndownService from 'turndown'

/**
 * Convert HTML to clean markdown for LLM extraction.
 * Strips noise elements (scripts, nav, footer, images, empty links),
 * then converts to markdown via turndown.
 *
 * @param html - Raw HTML string
 * @returns Clean markdown string
 */
export function preprocessHtml(html: string): string {
  const $ = cheerio.load(html)

  // Remove noise elements
  $('script, style, nav, header, footer, link, meta, noscript, svg, iframe, img').remove()

  // Remove empty links (sponsor logos, social icons with no text)
  $('a').each((_, el) => {
    const text = $(el).text().trim()
    if (!text) $(el).remove()
  })

  const body = $('body').html() || $.html()

  const td = new TurndownService({ headingStyle: 'atx' })
  const markdown = td.turndown(body)

  return collapseWhitespace(markdown)
}

function collapseWhitespace(text: string): string {
  return text
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
