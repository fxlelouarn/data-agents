// packages/database/src/services/edition-protection.service.ts

export interface ProtectionResult {
  protected: boolean
  reasons: string[]
}

export class EditionProtectionService {
  constructor(private milesDb: any) {}

  async isEditionProtected(editionId: number): Promise<ProtectionResult> {
    const result = await this.getProtectedEditionIds([editionId])
    return result.get(editionId) || { protected: false, reasons: [] }
  }

  async getProtectedEditionIds(editionIds: number[]): Promise<Map<number, ProtectionResult>> {
    if (editionIds.length === 0) return new Map()

    const results = new Map<number, ProtectionResult>()
    const now = new Date()

    const editions = await this.milesDb.edition.findMany({
      where: {
        id: { in: editionIds },
        status: 'LIVE',
        OR: [
          { endDate: { gte: now } },
          { endDate: null }
        ]
      },
      select: {
        id: true,
        customerType: true,
        registrationOpeningDate: true,
        registrationClosingDate: true,
        event: {
          select: {
            isFeatured: true
          }
        },
        races: {
          select: {
            id: true,
            _count: {
              select: { attendees: true }
            }
          },
          where: { isArchived: false }
        }
      }
    })

    for (const edition of editions) {
      const reasons: string[] = []

      if (edition.event?.isFeatured === true) {
        reasons.push('isFeatured')
      }

      if (edition.customerType) {
        reasons.push(`customerType:${edition.customerType}`)
      }

      if (
        edition.registrationOpeningDate &&
        edition.registrationOpeningDate <= now &&
        (!edition.registrationClosingDate || edition.registrationClosingDate > now)
      ) {
        reasons.push('registrationOpen')
      }

      const totalAttendees = edition.races.reduce(
        (sum: number, race: any) => sum + (race._count?.attendees || 0),
        0
      )
      if (totalAttendees > 0) {
        reasons.push(`hasAttendees:${totalAttendees}`)
      }

      if (reasons.length > 0) {
        results.set(edition.id, { protected: true, reasons })
      }
    }

    return results
  }
}
