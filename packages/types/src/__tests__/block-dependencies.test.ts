import { getAllDependencies, BLOCK_DEPENDENCIES, BlockType } from '../block-dependencies'

describe('block-dependencies', () => {
  describe('BLOCK_DEPENDENCIES constant', () => {
    it('should have correct dependency graph', () => {
      expect(BLOCK_DEPENDENCIES).toEqual({
        'event': [],
        'edition': ['event'],
        'organizer': ['edition'],
        'races': ['edition']
      })
    })
  })

  describe('getAllDependencies', () => {
    it('should return empty array for event (no dependencies)', () => {
      const deps = getAllDependencies('event')
      expect(deps).toEqual([])
    })

    it('should return [event] for edition', () => {
      const deps = getAllDependencies('edition')
      expect(deps).toEqual(['event'])
    })

    it('should return [event, edition] for organizer (transitive)', () => {
      const deps = getAllDependencies('organizer')
      expect(deps).toEqual(['event', 'edition'])
    })

    it('should return [event, edition] for races (transitive)', () => {
      const deps = getAllDependencies('races')
      expect(deps).toEqual(['event', 'edition'])
    })

    it('should return dependencies in correct order (topological sort)', () => {
      // organizer dépend de edition, qui dépend de event
      // L'ordre doit être: event d'abord, puis edition
      const deps = getAllDependencies('organizer')
      
      const eventIndex = deps.indexOf('event')
      const editionIndex = deps.indexOf('edition')
      
      expect(eventIndex).toBeLessThan(editionIndex)
    })

    it('should handle all block types without error', () => {
      const blockTypes: BlockType[] = ['event', 'edition', 'organizer', 'races']
      
      blockTypes.forEach(blockType => {
        expect(() => getAllDependencies(blockType)).not.toThrow()
      })
    })

    it('should not include the block itself in dependencies', () => {
      const deps = getAllDependencies('organizer')
      expect(deps).not.toContain('organizer')
    })

    it('should return unique dependencies (no duplicates)', () => {
      const deps = getAllDependencies('organizer')
      const uniqueDeps = [...new Set(deps)]
      expect(deps).toEqual(uniqueDeps)
    })
  })
})
