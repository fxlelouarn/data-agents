// Mock @data-agents/agent-framework to provide preprocessHtml
jest.mock('@data-agents/agent-framework', () => ({
  preprocessHtml: jest.fn((html: string) => {
    // Simplified version: strip tags, collapse whitespace
    return html
      .replace(/<(nav|footer|script|style|noscript|iframe|svg|header)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }),
}))

import { checkUrl, isParkedDomain } from '../url-checker'
import { AxiosError } from 'axios'

// Mock axios
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn() },
  AxiosError: class AxiosError extends Error {
    code?: string
    constructor(message: string, code?: string) {
      super(message)
      this.code = code
      this.name = 'AxiosError'
    }
  },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockAxios = require('axios').default as { get: jest.Mock }

describe('isParkedDomain', () => {
  it('detects GoDaddy parking pages', () => {
    expect(isParkedDomain('<html><body>This domain is parked free, courtesy of GoDaddy</body></html>')).toBe(true)
  })

  it('detects "domain for sale" pages', () => {
    expect(isParkedDomain('<html><body>This domain is for sale! Contact us.</body></html>')).toBe(true)
  })

  it('detects generic parking indicators', () => {
    expect(isParkedDomain('<html><body>Buy this domain. domaine à vendre.</body></html>')).toBe(true)
  })

  it('returns false for normal content', () => {
    expect(isParkedDomain('<html><body>Marathon de Paris 2026 - Inscriptions ouvertes</body></html>')).toBe(false)
  })
})

describe('checkUrl', () => {
  beforeEach(() => {
    mockAxios.get.mockReset()
  })

  it('returns isAlive=true and extracted text for a 200 response', async () => {
    mockAxios.get.mockResolvedValueOnce({
      status: 200,
      data: '<html><head><title>Marathon</title></head><body><main><h1>Marathon de Lyon 2026</h1><p>Inscriptions ouvertes</p></main></body></html>',
    })

    const result = await checkUrl({ url: 'https://marathon-lyon.fr', sourceType: 'event' })

    expect(result.isAlive).toBe(true)
    expect(result.isDead).toBe(false)
    expect(result.httpStatus).toBe(200)
    expect(result.htmlText).toContain('Marathon de Lyon 2026')
    expect(result.htmlText).toContain('Inscriptions ouvertes')
  })

  it('returns isDead=true for 404 responses', async () => {
    mockAxios.get.mockResolvedValueOnce({
      status: 404,
      data: 'Not Found',
    })

    const result = await checkUrl({ url: 'https://dead-site.fr', sourceType: 'event' })

    expect(result.isAlive).toBe(false)
    expect(result.isDead).toBe(true)
    expect(result.errorReason).toBe('HTTP_404')
  })

  it('returns isDead=true for DNS failures', async () => {
    const err = new AxiosError('getaddrinfo ENOTFOUND dead-site.fr')
    ;(err as any).code = 'ENOTFOUND'
    mockAxios.get.mockRejectedValueOnce(err)

    const result = await checkUrl({ url: 'https://dead-site.fr', sourceType: 'event' })

    expect(result.isAlive).toBe(false)
    expect(result.isDead).toBe(true)
    expect(result.errorReason).toBe('DNS_FAILURE')
  })

  it('returns isDead=true for parking pages', async () => {
    mockAxios.get.mockResolvedValueOnce({
      status: 200,
      data: '<html><body>This domain is parked free, courtesy of GoDaddy.com</body></html>',
    })

    const result = await checkUrl({ url: 'https://parked-domain.fr', sourceType: 'event' })

    expect(result.isAlive).toBe(false)
    expect(result.isDead).toBe(true)
    expect(result.errorReason).toBe('PARKING_PAGE')
  })

  it('returns isDead=false for timeout (not dead, just unreachable)', async () => {
    const err = new AxiosError('timeout of 10000ms exceeded')
    ;(err as any).code = 'ECONNABORTED'
    mockAxios.get.mockRejectedValueOnce(err)

    const result = await checkUrl({ url: 'https://slow-site.fr', sourceType: 'event' })

    expect(result.isAlive).toBe(false)
    expect(result.isDead).toBe(false)
    expect(result.errorReason).toBe('TIMEOUT')
  })

  it('strips nav, footer, script, style from extracted text', async () => {
    mockAxios.get.mockResolvedValueOnce({
      status: 200,
      data: `<html><body>
        <nav>Menu item 1</nav>
        <script>var x = 1;</script>
        <style>.body { color: red; }</style>
        <main><p>Important content here</p></main>
        <footer>Copyright 2026</footer>
      </body></html>`,
    })

    const result = await checkUrl({ url: 'https://example.fr', sourceType: 'event' })

    expect(result.htmlText).toContain('Important content here')
    expect(result.htmlText).not.toContain('Menu item 1')
    expect(result.htmlText).not.toContain('var x = 1')
    expect(result.htmlText).not.toContain('color: red')
    expect(result.htmlText).not.toContain('Copyright 2026')
  })

  it('truncates extracted text to maxChars', async () => {
    const longText = 'A'.repeat(20000)
    mockAxios.get.mockResolvedValueOnce({
      status: 200,
      data: `<html><body><p>${longText}</p></body></html>`,
    })

    const result = await checkUrl({ url: 'https://example.fr', sourceType: 'event' }, { maxChars: 5000 })

    expect(result.htmlText!.length).toBeLessThanOrEqual(5000)
  })
})
