/**
 * Tests for the proposal type decision logic in SlackProposalService.
 *
 * When event matching finds an event but NO edition for the searched year,
 * the proposal should be NEW_EVENT (not EDITION_UPDATE with null editionId).
 */
describe('Proposal type decision', () => {
  const SIMILARITY_THRESHOLD = 0.75

  function shouldBeNewEvent(matchResult) {
    return matchResult.type === 'NO_MATCH' ||
      matchResult.confidence < SIMILARITY_THRESHOLD ||
      !matchResult.edition
  }

  it('should be EDITION_UPDATE when event AND edition are found', () => {
    const matchResult = {
      type: 'FUZZY_MATCH',
      event: { id: 15126, name: 'Color Night Run', city: 'Deulemont' },
      edition: { id: 50514, year: 2025 },
      confidence: 0.85
    }
    expect(shouldBeNewEvent(matchResult)).toBe(false)
  })

  it('should be NEW_EVENT when event found but NO edition', () => {
    const matchResult = {
      type: 'FUZZY_MATCH',
      event: { id: 15126, name: 'Color Night Run', city: 'Deulemont' },
      edition: undefined,
      confidence: 0.85
    }
    expect(shouldBeNewEvent(matchResult)).toBe(true)
  })

  it('should be NEW_EVENT when match confidence is below threshold', () => {
    const matchResult = {
      type: 'FUZZY_MATCH',
      event: { id: 15126, name: 'Color Night Run', city: 'Deulemont' },
      edition: { id: 50514, year: 2025 },
      confidence: 0.5
    }
    expect(shouldBeNewEvent(matchResult)).toBe(true)
  })

  it('should be NEW_EVENT when type is NO_MATCH', () => {
    const matchResult = {
      type: 'NO_MATCH',
      event: undefined,
      edition: undefined,
      confidence: 0
    }
    expect(shouldBeNewEvent(matchResult)).toBe(true)
  })
})
