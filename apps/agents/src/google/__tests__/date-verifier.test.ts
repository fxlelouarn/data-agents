import { cleanHtml } from '../date-verifier'

describe('cleanHtml', () => {
  it('removes scripts and styles', () => {
    const html = `
      <html><body>
        <script>alert("xss")</script>
        <style>.foo { color: red; }</style>
        <p>Contenu utile</p>
      </body></html>
    `
    const result = cleanHtml(html)
    expect(result).not.toContain('alert')
    expect(result).not.toContain('color: red')
    expect(result).toContain('Contenu utile')
  })

  it('removes nav, footer and header', () => {
    const html = `
      <html><body>
        <header>Navigation principale</header>
        <nav>Liens de navigation</nav>
        <main><p>Article principal</p></main>
        <footer>Pied de page</footer>
      </body></html>
    `
    const result = cleanHtml(html)
    expect(result).not.toContain('Navigation principale')
    expect(result).not.toContain('Liens de navigation')
    expect(result).not.toContain('Pied de page')
    expect(result).toContain('Article principal')
  })

  it('prefers main content element over body', () => {
    const html = `
      <html><body>
        <div>Contenu parasite</div>
        <main><p>Contenu principal de la page</p></main>
      </body></html>
    `
    const result = cleanHtml(html)
    expect(result).toContain('Contenu principal de la page')
    // With <main> found, body fallback is not used
    expect(result).not.toContain('Contenu parasite')
  })

  it('limits output to 50KB', () => {
    // Create a string that is definitely more than 50KB
    const bigContent = 'A'.repeat(60 * 1024)
    const html = `<html><body><p>${bigContent}</p></body></html>`
    const result = cleanHtml(html)
    expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(50 * 1024)
  })

  it('collapses whitespace', () => {
    const html = `
      <html><body>
        <p>Texte   avec   beaucoup     d'espaces</p>
        <p>et
        des
        sauts
        de
        ligne</p>
      </body></html>
    `
    const result = cleanHtml(html)
    // Multiple spaces should be collapsed to single space
    expect(result).not.toMatch(/\s{2,}/)
  })

  it('removes cookie and popup elements by class', () => {
    const html = `
      <html><body>
        <div class="cookie-banner">Acceptez les cookies</div>
        <div class="modal-overlay">Popup</div>
        <div class="gdpr-notice">RGPD</div>
        <div class="consent-popup">Consentement</div>
        <main><p>Vrai contenu de l'événement</p></main>
      </body></html>
    `
    const result = cleanHtml(html)
    expect(result).not.toContain('Acceptez les cookies')
    expect(result).not.toContain('Popup')
    expect(result).not.toContain('RGPD')
    expect(result).not.toContain('Consentement')
    expect(result).toContain("Vrai contenu de l'événement")
  })

  it('removes elements with noise ids', () => {
    const html = `
      <html><body>
        <div id="cookie-notice">Notice cookies</div>
        <div id="banner-top">Bannière</div>
        <article><p>Contenu article</p></article>
      </body></html>
    `
    const result = cleanHtml(html)
    expect(result).not.toContain('Notice cookies')
    expect(result).not.toContain('Bannière')
    expect(result).toContain('Contenu article')
  })

  it('falls back to body when no main content selector found', () => {
    const html = `
      <html><body>
        <div><p>Contenu dans body sans balise main</p></div>
      </body></html>
    `
    const result = cleanHtml(html)
    expect(result).toContain('Contenu dans body sans balise main')
  })
})
