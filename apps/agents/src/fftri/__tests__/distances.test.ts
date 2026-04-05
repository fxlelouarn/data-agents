import { getStandardDistances } from '../distances'

describe('getStandardDistances', () => {
  describe('Triathlon (TRI)', () => {
    it('returns XXS distances', () => {
      expect(getStandardDistances('TRI', 'XXS')).toEqual({
        swimDistance: 100,
        bikeDistance: 4,
        runDistance: 1,
      })
    })

    it('returns XS distances', () => {
      expect(getStandardDistances('TRI', 'XS')).toEqual({
        swimDistance: 400,
        bikeDistance: 10,
        runDistance: 2.5,
      })
    })

    it('returns S distances', () => {
      expect(getStandardDistances('TRI', 'S')).toEqual({
        swimDistance: 750,
        bikeDistance: 20,
        runDistance: 5,
      })
    })

    it('returns M distances', () => {
      expect(getStandardDistances('TRI', 'M')).toEqual({
        swimDistance: 1500,
        bikeDistance: 40,
        runDistance: 10,
      })
    })

    it('returns L distances', () => {
      expect(getStandardDistances('TRI', 'L')).toEqual({
        swimDistance: 3000,
        bikeDistance: 80,
        runDistance: 30,
      })
    })

    it('returns XL distances', () => {
      expect(getStandardDistances('TRI', 'XL')).toEqual({
        swimDistance: 3000,
        bikeDistance: 120,
        runDistance: 30,
      })
    })

    it('returns XXL distances (Ironman)', () => {
      expect(getStandardDistances('TRI', 'XXL')).toEqual({
        swimDistance: 3800,
        bikeDistance: 180,
        runDistance: 42.195,
      })
    })

    it('returns null for unknown triathlon format', () => {
      expect(getStandardDistances('TRI', 'UNKNOWN')).toBeNull()
    })
  })

  describe('Duathlon (DUA)', () => {
    it('returns XS distances', () => {
      expect(getStandardDistances('DUA', 'XS')).toEqual({
        bikeDistance: 10,
        runDistance: 3.75,
      })
    })

    it('returns S distances', () => {
      expect(getStandardDistances('DUA', 'S')).toEqual({
        bikeDistance: 20,
        runDistance: 7.5,
      })
    })

    it('returns M distances', () => {
      expect(getStandardDistances('DUA', 'M')).toEqual({
        bikeDistance: 40,
        runDistance: 15,
      })
    })

    it('returns L distances', () => {
      expect(getStandardDistances('DUA', 'L')).toEqual({
        bikeDistance: 60,
        runDistance: 20,
      })
    })
  })

  describe('Cross Duathlon (X-DUA)', () => {
    it('returns S distances (same as DUA)', () => {
      expect(getStandardDistances('X-DUA', 'S')).toEqual({
        bikeDistance: 20,
        runDistance: 7.5,
      })
    })

    it('returns M distances (same as DUA)', () => {
      expect(getStandardDistances('X-DUA', 'M')).toEqual({
        bikeDistance: 40,
        runDistance: 15,
      })
    })
  })

  describe('Aquathlon (AQUA)', () => {
    it('returns XS distances', () => {
      expect(getStandardDistances('AQUA', 'XS')).toEqual({
        swimDistance: 250,
        runDistance: 1.5,
      })
    })

    it('returns S distances', () => {
      expect(getStandardDistances('AQUA', 'S')).toEqual({
        swimDistance: 750,
        runDistance: 5,
      })
    })

    it('returns M distances', () => {
      expect(getStandardDistances('AQUA', 'M')).toEqual({
        swimDistance: 1500,
        runDistance: 10,
      })
    })
  })

  describe('Non-standardized sport types', () => {
    it('returns null for RAID', () => {
      expect(getStandardDistances('RAID', 'S')).toBeNull()
    })

    it('returns null for CYCL', () => {
      expect(getStandardDistances('CYCL', 'M')).toBeNull()
    })

    it('returns null for X-TRI', () => {
      expect(getStandardDistances('X-TRI', 'M')).toBeNull()
    })

    it('returns null for S&R', () => {
      expect(getStandardDistances('S&R', 'S')).toBeNull()
    })

    it('returns null for S&B', () => {
      expect(getStandardDistances('S&B', 'S')).toBeNull()
    })

    it('returns null for B&R', () => {
      expect(getStandardDistances('B&R', 'S')).toBeNull()
    })

    it('returns null for unknown sport type', () => {
      expect(getStandardDistances('UNKNOWN_SPORT', 'S')).toBeNull()
    })
  })

  describe('Format suffix stripping', () => {
    it('strips -OP suffix: S-OP → S', () => {
      expect(getStandardDistances('TRI', 'S-OP')).toEqual({
        swimDistance: 750,
        bikeDistance: 20,
        runDistance: 5,
      })
    })

    it('strips -EQ suffix: S-EQ → S', () => {
      expect(getStandardDistances('TRI', 'S-EQ')).toEqual({
        swimDistance: 750,
        bikeDistance: 20,
        runDistance: 5,
      })
    })

    it('strips -CLM suffix: M-CLM → M', () => {
      expect(getStandardDistances('TRI', 'M-CLM')).toEqual({
        swimDistance: 1500,
        bikeDistance: 40,
        runDistance: 10,
      })
    })

    it('strips -OPEN suffix: M-OPEN → M', () => {
      expect(getStandardDistances('TRI', 'M-OPEN')).toEqual({
        swimDistance: 1500,
        bikeDistance: 40,
        runDistance: 10,
      })
    })

    it('strips -JEUNES suffix: S-JEUNES → S', () => {
      expect(getStandardDistances('TRI', 'S-JEUNES')).toEqual({
        swimDistance: 750,
        bikeDistance: 20,
        runDistance: 5,
      })
    })

    it('strips -JEUNES-N suffix: S-JEUNES-N → S', () => {
      expect(getStandardDistances('TRI', 'S-JEUNES-N')).toEqual({
        swimDistance: 750,
        bikeDistance: 20,
        runDistance: 5,
      })
    })

    it('works for duathlon with suffix: S-OP → S', () => {
      expect(getStandardDistances('DUA', 'S-OP')).toEqual({
        bikeDistance: 20,
        runDistance: 7.5,
      })
    })

    it('works for aquathlon with suffix: S-EQ → S', () => {
      expect(getStandardDistances('AQUA', 'S-EQ')).toEqual({
        swimDistance: 750,
        runDistance: 5,
      })
    })
  })
})
