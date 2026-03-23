import { preprocessHtml } from '../html-preprocessor'

describe('preprocessHtml', () => {
  it('strips script tags', () => {
    const html = '<div>hello</div><script>alert("x")</script><p>world</p>'
    const result = preprocessHtml(html)
    expect(result).not.toContain('<script')
    expect(result).toContain('hello')
    expect(result).toContain('world')
  })

  it('strips style tags', () => {
    const html = '<style>.x{color:red}</style><div>content</div>'
    const result = preprocessHtml(html)
    expect(result).not.toContain('<style')
    expect(result).toContain('content')
  })

  it('strips nav, header, footer', () => {
    const html = '<nav>menu</nav><main>content</main><footer>foot</footer>'
    const result = preprocessHtml(html)
    expect(result).not.toContain('menu')
    expect(result).not.toContain('foot')
    expect(result).toContain('content')
  })

  it('extracts specific CSS selector when provided', () => {
    const html = '<div id="other">skip</div><section id="epreuves"><h2>Races</h2><p>10km trail</p></section><div>after</div>'
    const result = preprocessHtml(html, '#epreuves')
    expect(result).toContain('Races')
    expect(result).toContain('10km trail')
    expect(result).not.toContain('skip')
  })

  it('falls back to full cleaned HTML if selector not found', () => {
    const html = '<div>content</div><script>x</script>'
    const result = preprocessHtml(html, '#nonexistent')
    expect(result).toContain('content')
    expect(result).not.toContain('<script')
  })

  it('collapses whitespace', () => {
    const html = '<div>  hello   \n\n\n   world  </div>'
    const result = preprocessHtml(html)
    expect(result).not.toMatch(/\n{3,}/)
  })
})
