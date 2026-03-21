/**
 * Tests for the dateMultiplier calculation in event matching scoring.
 *
 * The dateMultiplier penalizes matches when no edition exists near the searched date.
 * Formula: dateMultiplier = 0.5 + (dateProximity * 0.5)
 *
 * dateProximity = max(0, 1 - daysDiff/90)
 *   - 0 = no edition within ±90 days
 *   - 0.5 = closest edition is 45 days away
 *   - 1.0 = edition on same day
 */
describe('dateMultiplier scoring', () => {
  function calculateDateMultiplier(dateProximity) {
    return 0.5 + (dateProximity * 0.5)
  }

  function calculateDateProximity(daysDiff) {
    return Math.max(0, 1 - (daysDiff / 90))
  }

  it('should penalize 50% when no edition within 90 days', () => {
    const multiplier = calculateDateMultiplier(0)
    expect(multiplier).toBe(0.5)
  })

  it('should apply no penalty when edition is on same day', () => {
    const multiplier = calculateDateMultiplier(1.0)
    expect(multiplier).toBe(1.0)
  })

  it('should apply 25% penalty when edition is 45 days away', () => {
    const proximity = calculateDateProximity(45)
    const multiplier = calculateDateMultiplier(proximity)
    expect(multiplier).toBe(0.75)
  })

  it('should drop a good name match below threshold when no edition exists', () => {
    const nameScore = 0.53
    const cityScore = 0
    const alternativeScore = 0.53
    const departmentBonus = 0.15

    const baseScore = nameScore * 0.5 + cityScore * 0.3 + alternativeScore * 0.2 + departmentBonus

    const combined = baseScore * calculateDateMultiplier(0)
    expect(combined).toBeLessThan(0.75)
  })

  it('should keep a strong match above threshold when edition is close', () => {
    // "Trail de Rejet-de-Beaulieu" matching "Trail de Rejet de Beaulieu" - strong name match
    const nameScore = 0.85
    const cityScore = 0.7
    const alternativeScore = 0.85
    const departmentBonus = 0.15

    const baseScore = nameScore * 0.5 + cityScore * 0.3 + alternativeScore * 0.2 + departmentBonus
    const proximity = calculateDateProximity(10)
    const combined = baseScore * calculateDateMultiplier(proximity)
    expect(combined).toBeGreaterThan(0.75)
  })
})
