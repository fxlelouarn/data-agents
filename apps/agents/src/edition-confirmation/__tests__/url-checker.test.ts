import { checkUrl, isParkedDomain } from '../url-checker'

// Mock node-fetch
jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockFetch = require('node-fetch').default as jest.Mock

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
    mockFetch.mockReset()
  })

  it('returns isAlive=true and extracted text for a 200 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '<html><head><title>Marathon</title></head><body><main><h1>Marathon de Lyon 2026</h1><p>Inscriptions ouvertes</p></main></body></html>',
    })

    const result = await checkUrl({ url: 'https://marathon-lyon.fr', sourceType: 'event' })

    expect(result.isAlive).toBe(true)
    expect(result.isDead).toBe(false)
    expect(result.httpStatus).toBe(200)
    expect(result.htmlText).toContain('Marathon de Lyon 2026')
    expect(result.htmlText).toContain('Inscriptions ouvertes')
  })

  it('returns isDead=true for 404 responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    })

    const result = await checkUrl({ url: 'https://dead-site.fr', sourceType: 'event' })

    expect(result.isAlive).toBe(false)
    expect(result.isDead).toBe(true)
    expect(result.errorReason).toBe('HTTP_404')
  })

  it('returns isDead=true for DNS failures', async () => {
    mockFetch.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND dead-site.fr'))

    const result = await checkUrl({ url: 'https://dead-site.fr', sourceType: 'event' })

    expect(result.isAlive).toBe(false)
    expect(result.isDead).toBe(true)
    expect(result.errorReason).toBe('DNS_FAILURE')
  })

  it('returns isDead=true for parking pages', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '<html><body>This domain is parked free, courtesy of GoDaddy.com</body></html>',
    })

    const result = await checkUrl({ url: 'https://parked-domain.fr', sourceType: 'event' })

    expect(result.isAlive).toBe(false)
    expect(result.isDead).toBe(true)
    expect(result.errorReason).toBe('PARKING_PAGE')
  })

  it('returns isDead=false for timeout (not dead, just unreachable)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network timeout'))

    const result = await checkUrl({ url: 'https://slow-site.fr', sourceType: 'event' })

    expect(result.isAlive).toBe(false)
    expect(result.isDead).toBe(false)
    expect(result.errorReason).toBe('TIMEOUT')
  })

  it('strips nav, footer, script, style from extracted text', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => `<html><body>
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
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => `<html><body><p>${longText}</p></body></html>`,
    })

    const result = await checkUrl({ url: 'https://example.fr', sourceType: 'event' }, { maxChars: 5000 })

    expect(result.htmlText!.length).toBeLessThanOrEqual(5000)
  })
})
