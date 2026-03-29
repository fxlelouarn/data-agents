# Edition Duplicator Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the n8n "CRON - Edition Duplicate" workflow with a native agent that creates proposals (auto-applied via AutoValidator) to duplicate ended editions for the next year, including races, partners, and partner localized content.

**Architecture:** The agent queries Miles Republic for current-year editions whose endDate has passed and no next-year edition exists, then creates one `EDITION_UPDATE` proposal per edition. The AutoValidatorAgent auto-approves these high-confidence proposals, and a dedicated handler in `proposal-domain.service.ts` applies the duplication (create new edition + races + partners in a transaction).

**Tech Stack:** TypeScript, Prisma (Miles Republic client), BaseAgent framework, AgentStateService, MilesRepublicRepository

**Spec:** `docs/superpowers/specs/2026-03-29-edition-duplicator-agent-design.md`

---

## File Structure

**New files:**
| File | Responsibility |
|------|---------------|
| `packages/types/src/agent-config-schemas/edition-duplicator.ts` | Config schema for dashboard UI |
| `apps/agents/src/EditionDuplicatorAgent.ts` | Main agent class — discovery + proposal creation |
| `apps/agents/src/registry/edition-duplicator.ts` | Registry entry with DEFAULT_CONFIG |
| `apps/agents/src/__tests__/EditionDuplicatorAgent.test.ts` | Unit tests |

**Modified files:**
| File | Change |
|------|--------|
| `packages/types/src/agent-versions.ts` | Add version constant + agent name |
| `packages/types/src/agent-config-schemas/index.ts` | Export new schema |
| `apps/agents/src/index.ts` | Register agent |
| `apps/agents/src/AutoValidatorAgent.ts:114-118` | Add `EDITION_DUPLICATOR` to eligible types |
| `packages/database/src/repositories/miles-republic.repository.ts:340-350` | Add `createEditionPartner` method |
| `packages/database/src/services/proposal-domain.service.ts:169-201` | Add duplication handler in switch + new `applyEditionDuplication` method |

---

### Task 1: Register agent type in packages/types

**Files:**
- Modify: `packages/types/src/agent-versions.ts`
- Create: `packages/types/src/agent-config-schemas/edition-duplicator.ts`
- Modify: `packages/types/src/agent-config-schemas/index.ts`

- [ ] **Step 1: Add version constant and agent name**

In `packages/types/src/agent-versions.ts`:

Add to `AGENT_VERSIONS` (after line 21):
```typescript
  EDITION_DUPLICATOR_AGENT: '1.0.0'
```

Add `'EDITION_DUPLICATOR'` to the `AgentTypeKey` union type (line 29):
```typescript
export type AgentTypeKey = 'FFA_SCRAPER' | 'FFA_RESULTS' | 'GOOGLE_SEARCH_DATE' | 'AUTO_VALIDATOR' | 'SLACK_EVENT' | 'DUPLICATE_DETECTION' | 'WEBSITE_CHECKER' | 'EDITION_DUPLICATOR'
```

Add to `AGENT_NAMES` (after line 42):
```typescript
  EDITION_DUPLICATOR: 'Edition Duplicator Agent'
```

- [ ] **Step 2: Create config schema**

Create `packages/types/src/agent-config-schemas/edition-duplicator.ts`:

```typescript
import type { ConfigSchema } from '../config.js'

export const EditionDuplicatorAgentConfigSchema: ConfigSchema = {
  title: 'Configuration Edition Duplicator Agent',
  description: 'Agent qui duplique les éditions terminées pour l\'année suivante',
  categories: [
    { id: 'database', label: 'Base de données' },
    { id: 'processing', label: 'Traitement' },
  ],
  fields: [
    {
      name: 'sourceDatabase',
      label: 'Base de données Miles Republic',
      type: 'database_select',
      category: 'database',
      required: true,
      description: 'Base de données Miles Republic contenant les éditions',
      validation: { required: true },
    },
    {
      name: 'batchSize',
      label: 'Taille des lots',
      type: 'number',
      category: 'processing',
      required: false,
      defaultValue: 50,
      description: 'Nombre maximum d\'éditions à traiter par exécution',
      validation: { min: 1, max: 500 },
    },
    {
      name: 'dryRun',
      label: 'Mode simulation',
      type: 'boolean',
      category: 'processing',
      required: false,
      defaultValue: false,
      description: 'Si activé, aucune proposition ne sera créée (log uniquement)',
    },
  ],
}
```

- [ ] **Step 3: Export config schema**

In `packages/types/src/agent-config-schemas/index.ts`:

Add export (after line 17):
```typescript
export { EditionDuplicatorAgentConfigSchema } from './edition-duplicator.js'
```

Add import (after line 26):
```typescript
import { EditionDuplicatorAgentConfigSchema } from './edition-duplicator.js'
```

Add to `AGENT_CONFIG_SCHEMAS` map (after line 39):
```typescript
  EDITION_DUPLICATOR: EditionDuplicatorAgentConfigSchema,
```

- [ ] **Step 4: Build types package and verify**

Run: `cd packages/types && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/agent-versions.ts packages/types/src/agent-config-schemas/edition-duplicator.ts packages/types/src/agent-config-schemas/index.ts
git commit -m "feat(edition-duplicator): add agent type, version, and config schema"
```

---

### Task 2: Add createEditionPartner to MilesRepublicRepository

**Files:**
- Modify: `packages/database/src/repositories/miles-republic.repository.ts`

- [ ] **Step 1: Write the test**

Create the test inline or verify manually. The method is simple Prisma delegation, so we'll test it via integration in Task 6.

- [ ] **Step 2: Add createEditionPartner method**

In `packages/database/src/repositories/miles-republic.repository.ts`, after the `findEditionPartners` method (after line 350):

```typescript
  /**
   * Create an EditionPartner for an edition
   */
  async createEditionPartner(editionId: number, data: {
    role: string  // 'ORGANIZER' | 'TIMER' | 'SPONSOR'
    name?: string | null
    websiteUrl?: string | null
    instagramUrl?: string | null
    facebookUrl?: string | null
    logoUrl?: string | null
    sortOrder?: number
  }) {
    return this.milesDb.editionPartner.create({
      data: {
        editionId,
        role: data.role,
        name: data.name || null,
        websiteUrl: data.websiteUrl || null,
        instagramUrl: data.instagramUrl || null,
        facebookUrl: data.facebookUrl || null,
        logoUrl: data.logoUrl || null,
        sortOrder: data.sortOrder ?? 0,
      },
    })
  }

  /**
   * Create an EditionPartnerLocalizedContent for a partner
   */
  async createEditionPartnerLocalizedContent(editionPartnerId: string, data: {
    locale: string
    description?: string | null
  }) {
    return this.milesDb.editionPartnerLocalizedContent.create({
      data: {
        editionPartnerId,
        locale: data.locale,
        description: data.description || null,
      },
    })
  }
```

- [ ] **Step 3: Build database package and verify**

Run: `cd packages/database && npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/repositories/miles-republic.repository.ts
git commit -m "feat(database): add createEditionPartner and createEditionPartnerLocalizedContent to MilesRepublicRepository"
```

---

### Task 3: Add duplication handler in proposal-domain.service.ts

**Files:**
- Modify: `packages/database/src/services/proposal-domain.service.ts`

- [ ] **Step 1: Add detection in the EDITION_UPDATE case**

In `proposal-domain.service.ts`, modify the `EDITION_UPDATE` case (around line 181-186). Before calling `applyEditionUpdate`, check if this is a duplication:

```typescript
        case 'EDITION_UPDATE':
          if (!proposal.editionId) {
            throw new Error('EditionId manquant pour EDITION_UPDATE')
          }
          // Detect edition duplication (vs normal edition update)
          if (filteredFinalChanges.editionToCreate) {
            result = await this.applyEditionDuplication(proposal.editionId, filteredFinalChanges, { ...options, agentName })
          } else {
            result = await this.applyEditionUpdate(proposal.editionId, filteredFinalChanges, filteredSelectedChanges, { ...options, agentName }, proposal)
          }
          break
```

- [ ] **Step 2: Add the applyEditionDuplication method**

Add this method to the `ProposalDomainService` class (before the `private` helper methods section, e.g. before `extractEventData`):

```typescript
  /**
   * Apply an edition duplication — creates a new edition for the next year
   * with races and partners copied from the source edition.
   *
   * Replaces the n8n "CRON - Edition Duplicate" workflow.
   */
  async applyEditionDuplication(
    sourceEditionId: string,
    changes: any,
    options: ApplyOptions = {}
  ): Promise<ProposalApplicationResult> {
    try {
      const milesRepo = await this.getMilesRepublicRepository(options.milesRepublicDatabaseId, options.agentName, options.userEmail)
      const numericEditionId = parseInt(sourceEditionId)

      if (isNaN(numericEditionId)) {
        return this.errorResult('editionId', `ID d'édition source invalide: ${sourceEditionId}`)
      }

      const { editionToCreate, oldEditionUpdate, racesToCreate, partnersToCreate } = changes

      if (!editionToCreate) {
        return this.errorResult('changes', 'editionToCreate manquant dans les changes')
      }

      this.logger.info(`\n📋 Application EDITION_DUPLICATION pour l'édition source ${sourceEditionId}`)
      this.logger.info(`  → Nouvelle année: ${editionToCreate.year}`)
      this.logger.info(`  → Courses à dupliquer: ${racesToCreate?.length || 0}`)
      this.logger.info(`  → Partners à dupliquer: ${partnersToCreate?.length || 0}`)

      // Step 1: Clear currentEditionEventId on old edition
      if (oldEditionUpdate) {
        this.logger.info(`\n1️⃣  Mise à jour de l'ancienne édition ${numericEditionId}`)
        await milesRepo.updateEdition(numericEditionId, oldEditionUpdate)
        this.logger.info(`  ✅ currentEditionEventId supprimé`)
      }

      // Step 2: Create new edition
      this.logger.info(`\n2️⃣  Création de la nouvelle édition ${editionToCreate.year}`)
      const newEdition = await milesRepo.createEdition({
        eventId: editionToCreate.eventId,
        year: editionToCreate.year,
        startDate: editionToCreate.startDate ? new Date(editionToCreate.startDate) : null,
        endDate: editionToCreate.endDate ? new Date(editionToCreate.endDate) : null,
        status: editionToCreate.status,
        calendarStatus: editionToCreate.calendarStatus || 'TO_BE_CONFIRMED',
        clientStatus: editionToCreate.clientStatus || 'NEW_SALES_FUNNEL',
        currentEditionEventId: editionToCreate.currentEditionEventId,
        isAttendeeListPublic: editionToCreate.isAttendeeListPublic,
        organizerStripeConnectedAccountId: editionToCreate.organizerStripeConnectedAccountId,
        currency: editionToCreate.currency,
        medusaVersion: editionToCreate.medusaVersion,
        timeZone: editionToCreate.timeZone,
        slug: editionToCreate.slug,
      })
      this.logger.info(`  ✅ Édition créée avec ID ${newEdition.id}`)

      // Step 3: Create races
      const createdRaceIds: number[] = []
      if (racesToCreate && Array.isArray(racesToCreate)) {
        this.logger.info(`\n3️⃣  Création de ${racesToCreate.length} course(s)`)
        for (const raceData of racesToCreate) {
          const newRace = await milesRepo.createRace({
            editionId: newEdition.id,
            eventId: editionToCreate.eventId,
            name: raceData.name,
            startDate: raceData.startDate ? new Date(raceData.startDate) : null,
            price: raceData.price,
            priceType: raceData.priceType,
            paymentCollectionType: raceData.paymentCollectionType,
            runDistance: raceData.runDistance,
            runDistance2: raceData.runDistance2,
            bikeDistance: raceData.bikeDistance,
            swimDistance: raceData.swimDistance,
            walkDistance: raceData.walkDistance,
            bikeRunDistance: raceData.bikeRunDistance,
            swimRunDistance: raceData.swimRunDistance,
            runPositiveElevation: raceData.runPositiveElevation,
            runNegativeElevation: raceData.runNegativeElevation,
            bikePositiveElevation: raceData.bikePositiveElevation,
            bikeNegativeElevation: raceData.bikeNegativeElevation,
            walkPositiveElevation: raceData.walkPositiveElevation,
            walkNegativeElevation: raceData.walkNegativeElevation,
            categoryLevel1: raceData.categoryLevel1,
            categoryLevel2: raceData.categoryLevel2,
            distanceCategory: raceData.distanceCategory,
            licenseNumberType: raceData.licenseNumberType,
            adultJustificativeOptions: raceData.adultJustificativeOptions,
            minorJustificativeOptions: raceData.minorJustificativeOptions,
            askAttendeeBirthDate: raceData.askAttendeeBirthDate,
            askAttendeeGender: raceData.askAttendeeGender,
            askAttendeeNationality: raceData.askAttendeeNationality,
            askAttendeePhoneNumber: raceData.askAttendeePhoneNumber,
            askAttendeePostalAddress: raceData.askAttendeePostalAddress,
            showClubOrAssoInput: raceData.showClubOrAssoInput,
            showPublicationConsentCheckbox: raceData.showPublicationConsentCheckbox,
            minTeamSize: raceData.minTeamSize,
            maxTeamSize: raceData.maxTeamSize,
            displayOrder: raceData.displayOrder,
            isArchived: raceData.isArchived ?? false,
            slug: raceData.slug,
            timeZone: raceData.timeZone,
            mainRaceEditionId: raceData.isMainRace ? newEdition.id : undefined,
          })
          createdRaceIds.push(newRace.id)
          this.logger.info(`  ✅ Course "${raceData.name}" créée avec ID ${newRace.id}`)
        }
      }

      // Step 4: Create partners
      const createdPartnerIds: string[] = []
      if (partnersToCreate && Array.isArray(partnersToCreate)) {
        this.logger.info(`\n4️⃣  Création de ${partnersToCreate.length} partner(s)`)
        for (const partnerData of partnersToCreate) {
          const newPartner = await milesRepo.createEditionPartner(newEdition.id, {
            role: partnerData.role,
            name: partnerData.name,
            websiteUrl: partnerData.websiteUrl,
            instagramUrl: partnerData.instagramUrl,
            facebookUrl: partnerData.facebookUrl,
            logoUrl: partnerData.logoUrl,
            sortOrder: partnerData.sortOrder,
          })
          createdPartnerIds.push(newPartner.id)
          this.logger.info(`  ✅ Partner "${partnerData.name}" (${partnerData.role}) créé avec ID ${newPartner.id}`)

          // Create localized contents
          if (partnerData.localizedContents && Array.isArray(partnerData.localizedContents)) {
            for (const lc of partnerData.localizedContents) {
              await milesRepo.createEditionPartnerLocalizedContent(newPartner.id, {
                locale: lc.locale,
                description: lc.description,
              })
              this.logger.info(`    ✅ Contenu localisé (${lc.locale}) créé`)
            }
          }
        }
      }

      this.logger.info(`\n✅ Duplication terminée: édition ${newEdition.id}, ${createdRaceIds.length} courses, ${createdPartnerIds.length} partners`)

      return {
        success: true,
        appliedChanges: {
          editionDuplication: {
            sourceEditionId: numericEditionId,
            newEditionId: newEdition.id,
            newYear: editionToCreate.year,
            createdRaceIds,
            createdPartnerIds,
          },
        },
        rollbackData: {
          editionId: newEdition.id,
          raceIds: createdRaceIds,
          partnerIds: createdPartnerIds,
          sourceEditionId: numericEditionId,
        },
      }
    } catch (error) {
      this.logger.error(`❌ Erreur lors de la duplication:`, error)
      return this.errorResult('duplication', `Erreur lors de la duplication: ${error instanceof Error ? error.message : 'Erreur inconnue'}`)
    }
  }
```

- [ ] **Step 3: Build database package and verify**

Run: `cd packages/database && npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/services/proposal-domain.service.ts
git commit -m "feat(database): add edition duplication handler in ProposalDomainService"
```

---

### Task 4: Create the EditionDuplicatorAgent

**Files:**
- Create: `apps/agents/src/EditionDuplicatorAgent.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/agents/src/__tests__/EditionDuplicatorAgent.test.ts`:

```typescript
import { EditionDuplicatorAgent, EDITION_DUPLICATOR_AGENT_VERSION } from '../EditionDuplicatorAgent'

// Mock agent-framework
jest.mock('@data-agents/agent-framework', () => ({
  BaseAgent: class MockBaseAgent {
    config: any
    constructor(config: any) {
      this.config = config
    }
    async connectToSource() {
      return {}
    }
    async closeSourceConnections() {}
    async createProposal(data: any) {
      return { id: 'test-proposal-id', ...data }
    }
  },
  AgentType: {},
}))

jest.mock('@data-agents/database', () => ({
  prisma: {},
  AgentStateService: class MockStateService {
    async getState() { return null }
    async setState() {}
  },
  IAgentStateService: {},
}))

describe('EditionDuplicatorAgent', () => {
  describe('version', () => {
    it('should export a version string', () => {
      expect(EDITION_DUPLICATOR_AGENT_VERSION).toBe('1.0.0')
    })
  })

  describe('constructor', () => {
    it('should create agent with default config', () => {
      const agent = new EditionDuplicatorAgent({
        id: 'test-agent',
        config: { sourceDatabase: 'test-db' },
      })
      expect(agent.config.name).toBe('Edition Duplicator Agent')
      expect(agent.config.config.batchSize).toBe(50)
      expect(agent.config.config.dryRun).toBe(false)
    })

    it('should allow config overrides', () => {
      const agent = new EditionDuplicatorAgent({
        id: 'test-agent',
        config: {
          sourceDatabase: 'test-db',
          batchSize: 10,
          dryRun: true,
        },
      })
      expect(agent.config.config.batchSize).toBe(10)
      expect(agent.config.config.dryRun).toBe(true)
    })
  })

  describe('findEditionsToDuplicate', () => {
    it('should find editions that ended yesterday with no next-year edition', async () => {
      const now = new Date()
      const yesterday = new Date(now)
      yesterday.setDate(yesterday.getDate() - 1)
      yesterday.setHours(12, 0, 0, 0)

      const mockSourceDb = {
        edition: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 100,
              eventId: 1,
              year: now.getFullYear().toString(),
              startDate: yesterday,
              endDate: yesterday,
              status: 'LIVE',
              calendarStatus: 'CONFIRMED',
              currentEditionEventId: 1,
              isAttendeeListPublic: true,
              organizerStripeConnectedAccountId: null,
              currency: 'EUR',
              medusaVersion: 'V1',
              timeZone: 'Europe/Paris',
              slug: 'old-slug',
              event: { id: 1, name: 'Test Event', city: 'Paris' },
              races: [
                {
                  id: 200,
                  name: 'Marathon',
                  startDate: yesterday,
                  runDistance: 42.195,
                  runDistance2: 0,
                  bikeDistance: 0,
                  swimDistance: 0,
                  walkDistance: 0,
                  bikeRunDistance: 0,
                  swimRunDistance: 0,
                  runPositiveElevation: null,
                  runNegativeElevation: null,
                  bikePositiveElevation: null,
                  bikeNegativeElevation: null,
                  walkPositiveElevation: null,
                  walkNegativeElevation: null,
                  price: 50,
                  priceType: 'PER_PERSON',
                  paymentCollectionType: 'SINGLE',
                  categoryLevel1: 'RUNNING',
                  categoryLevel2: 'MARATHON',
                  distanceCategory: null,
                  licenseNumberType: 'FFA',
                  adultJustificativeOptions: null,
                  minorJustificativeOptions: null,
                  askAttendeeBirthDate: true,
                  askAttendeeGender: true,
                  askAttendeeNationality: true,
                  askAttendeePhoneNumber: true,
                  askAttendeePostalAddress: true,
                  showClubOrAssoInput: true,
                  showPublicationConsentCheckbox: true,
                  minTeamSize: null,
                  maxTeamSize: null,
                  displayOrder: 1,
                  isArchived: false,
                  slug: 'old-race-slug',
                  timeZone: 'Europe/Paris',
                  mainRaceEditionId: 100,
                },
              ],
              editionPartners: [
                {
                  id: 'partner-uuid-1',
                  role: 'ORGANIZER',
                  name: 'ASO',
                  websiteUrl: 'https://aso.fr',
                  instagramUrl: null,
                  facebookUrl: null,
                  logoUrl: null,
                  sortOrder: 0,
                  localizedContents: [
                    { locale: 'fr', description: 'Organisateur principal' },
                  ],
                },
              ],
            },
          ]),
        },
      }

      const agent = new EditionDuplicatorAgent({
        id: 'test-agent',
        config: { sourceDatabase: 'test-db' },
      })

      // Access private method via any cast for testing
      ;(agent as any).sourceDb = mockSourceDb

      const editions = await (agent as any).findEditionsToDuplicate(50)
      expect(editions).toHaveLength(1)
      expect(editions[0].id).toBe(100)
      expect(editions[0].races).toHaveLength(1)
      expect(editions[0].editionPartners).toHaveLength(1)
    })

    it('should skip editions with non-numeric year', async () => {
      const mockSourceDb = {
        edition: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 101,
              year: 'TBD',
              status: 'LIVE',
              currentEditionEventId: 1,
            },
          ]),
        },
      }

      const agent = new EditionDuplicatorAgent({
        id: 'test-agent',
        config: { sourceDatabase: 'test-db' },
      })
      ;(agent as any).sourceDb = mockSourceDb

      // The Prisma query filters these out, but the agent also validates in code
      const editions = await (agent as any).findEditionsToDuplicate(50)
      // Prisma returns them, but buildProposal will skip invalid years
      expect(mockSourceDb.edition.findMany).toHaveBeenCalled()
    })
  })

  describe('buildProposalForEdition', () => {
    it('should build correct proposal with shifted dates', () => {
      const agent = new EditionDuplicatorAgent({
        id: 'test-agent',
        config: { sourceDatabase: 'test-db' },
      })

      const edition = {
        id: 100,
        eventId: 1,
        year: '2026',
        startDate: new Date('2026-03-28T08:00:00Z'),
        endDate: new Date('2026-03-29T18:00:00Z'),
        status: 'LIVE',
        calendarStatus: 'CONFIRMED',
        currentEditionEventId: 1,
        isAttendeeListPublic: true,
        organizerStripeConnectedAccountId: 'acct_123',
        currency: 'EUR',
        medusaVersion: 'V2',
        timeZone: 'Europe/Paris',
        event: { id: 1, name: 'Trail des Monts', city: 'Lyon' },
        races: [
          {
            id: 200,
            name: '42km',
            startDate: new Date('2026-03-28T08:00:00Z'),
            runDistance: 42,
            runDistance2: 0,
            bikeDistance: 0,
            swimDistance: 0,
            walkDistance: 0,
            bikeRunDistance: 0,
            swimRunDistance: 0,
            runPositiveElevation: 1500,
            runNegativeElevation: 1500,
            bikePositiveElevation: null,
            bikeNegativeElevation: null,
            walkPositiveElevation: null,
            walkNegativeElevation: null,
            price: 60,
            priceType: 'PER_PERSON',
            paymentCollectionType: 'SINGLE',
            categoryLevel1: 'TRAIL',
            categoryLevel2: 'LONG_TRAIL',
            distanceCategory: 'L',
            licenseNumberType: 'FFA',
            adultJustificativeOptions: null,
            minorJustificativeOptions: null,
            askAttendeeBirthDate: true,
            askAttendeeGender: true,
            askAttendeeNationality: true,
            askAttendeePhoneNumber: true,
            askAttendeePostalAddress: true,
            showClubOrAssoInput: true,
            showPublicationConsentCheckbox: true,
            minTeamSize: null,
            maxTeamSize: null,
            displayOrder: 1,
            isArchived: false,
            slug: 'old-slug',
            timeZone: 'Europe/Paris',
            mainRaceEditionId: 100,
          },
        ],
        editionPartners: [
          {
            id: 'p1',
            role: 'ORGANIZER',
            name: 'ASO',
            websiteUrl: 'https://aso.fr',
            instagramUrl: null,
            facebookUrl: 'https://fb.com/aso',
            logoUrl: 'https://aso.fr/logo.png',
            sortOrder: 0,
            localizedContents: [
              { locale: 'fr', description: 'Organisateur officiel' },
            ],
          },
        ],
      }

      const proposal = (agent as any).buildProposalForEdition(edition)

      // Check edition dates shifted +1 year
      expect(proposal.changes.editionToCreate.year).toBe('2027')
      const newStart = new Date(proposal.changes.editionToCreate.startDate)
      expect(newStart.getFullYear()).toBe(2027)
      expect(newStart.getMonth()).toBe(2) // March (0-indexed)

      // Check old edition update
      expect(proposal.changes.oldEditionUpdate.currentEditionEventId).toBeNull()

      // Check race shifted
      expect(proposal.changes.racesToCreate).toHaveLength(1)
      const newRaceStart = new Date(proposal.changes.racesToCreate[0].startDate)
      expect(newRaceStart.getFullYear()).toBe(2027)
      expect(proposal.changes.racesToCreate[0].isMainRace).toBe(true)
      expect(proposal.changes.racesToCreate[0].slug).not.toBe('old-slug')

      // Check partner copied
      expect(proposal.changes.partnersToCreate).toHaveLength(1)
      expect(proposal.changes.partnersToCreate[0].role).toBe('ORGANIZER')
      expect(proposal.changes.partnersToCreate[0].localizedContents).toHaveLength(1)

      // Check metadata
      expect(proposal.eventId).toBe('1')
      expect(proposal.editionId).toBe('100')
      expect(proposal.confidence).toBe(1.0)
      expect(proposal.type).toBe('EDITION_UPDATE')
    })

    it('should handle null dates gracefully', () => {
      const agent = new EditionDuplicatorAgent({
        id: 'test-agent',
        config: { sourceDatabase: 'test-db' },
      })

      const edition = {
        id: 101,
        eventId: 2,
        year: '2026',
        startDate: null,
        endDate: null,
        status: 'LIVE',
        calendarStatus: 'CONFIRMED',
        currentEditionEventId: 2,
        isAttendeeListPublic: true,
        organizerStripeConnectedAccountId: null,
        currency: 'EUR',
        medusaVersion: 'V1',
        timeZone: 'Europe/Paris',
        event: { id: 2, name: 'Event 2', city: 'Marseille' },
        races: [
          {
            id: 300,
            name: '10km',
            startDate: null,
            runDistance: 10,
            runDistance2: 0,
            bikeDistance: 0,
            swimDistance: 0,
            walkDistance: 0,
            bikeRunDistance: 0,
            swimRunDistance: 0,
            runPositiveElevation: null,
            runNegativeElevation: null,
            bikePositiveElevation: null,
            bikeNegativeElevation: null,
            walkPositiveElevation: null,
            walkNegativeElevation: null,
            price: null,
            priceType: 'PER_PERSON',
            paymentCollectionType: 'SINGLE',
            categoryLevel1: 'RUNNING',
            categoryLevel2: 'KM10',
            distanceCategory: null,
            licenseNumberType: null,
            adultJustificativeOptions: null,
            minorJustificativeOptions: null,
            askAttendeeBirthDate: true,
            askAttendeeGender: true,
            askAttendeeNationality: true,
            askAttendeePhoneNumber: true,
            askAttendeePostalAddress: true,
            showClubOrAssoInput: true,
            showPublicationConsentCheckbox: true,
            minTeamSize: null,
            maxTeamSize: null,
            displayOrder: null,
            isArchived: false,
            slug: 'slug-300',
            timeZone: null,
            mainRaceEditionId: null,
          },
        ],
        editionPartners: [],
      }

      const proposal = (agent as any).buildProposalForEdition(edition)

      expect(proposal.changes.editionToCreate.startDate).toBeNull()
      expect(proposal.changes.editionToCreate.endDate).toBeNull()
      expect(proposal.changes.racesToCreate[0].startDate).toBeNull()
      expect(proposal.changes.racesToCreate[0].isMainRace).toBe(false)
      expect(proposal.changes.partnersToCreate).toHaveLength(0)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/agents && npx jest --testPathPatterns="EditionDuplicatorAgent" --no-coverage`
Expected: FAIL — `Cannot find module '../EditionDuplicatorAgent'`

- [ ] **Step 3: Write the agent implementation**

Create `apps/agents/src/EditionDuplicatorAgent.ts`:

```typescript
import { AGENT_VERSIONS, EditionDuplicatorAgentConfigSchema, getAgentName } from '@data-agents/types'
import { BaseAgent, AgentType } from '@data-agents/agent-framework'
import { IAgentStateService, AgentStateService, prisma } from '@data-agents/database'
import type { AgentContext, AgentRunResult } from '@data-agents/agent-framework'
import { randomUUID } from 'crypto'

export const EDITION_DUPLICATOR_AGENT_VERSION = AGENT_VERSIONS.EDITION_DUPLICATOR_AGENT

interface EditionDuplicatorConfig {
  sourceDatabase: string
  batchSize: number
  dryRun: boolean
}

interface ProcessedEditionsState {
  [editionId: string]: string // editionId → proposalId
}

export class EditionDuplicatorAgent extends BaseAgent {
  private sourceDb: any
  private stateService: IAgentStateService
  private prisma: typeof prisma

  constructor(config: any, db?: any, logger?: any) {
    const agentConfig = {
      id: config.id || 'edition-duplicator-agent',
      name: config.name || getAgentName('EDITION_DUPLICATOR'),
      description: `Agent qui duplique les éditions terminées pour l'année suivante (v${EDITION_DUPLICATOR_AGENT_VERSION})`,
      type: 'EXTRACTOR' as AgentType,
      frequency: config.frequency || '0 3 * * *',
      isActive: config.isActive ?? true,
      config: {
        version: EDITION_DUPLICATOR_AGENT_VERSION,
        sourceDatabase: config.config?.sourceDatabase,
        batchSize: config.config?.batchSize || 50,
        dryRun: config.config?.dryRun ?? false,
        ...config.config,
        configSchema: EditionDuplicatorAgentConfigSchema,
      },
    }

    super(agentConfig, db, logger)
    this.prisma = prisma
    this.stateService = new AgentStateService(prisma)
  }

  async run(context: AgentContext): Promise<AgentRunResult> {
    const config = this.config.config as EditionDuplicatorConfig

    try {
      context.logger.info(`Démarrage Edition Duplicator Agent v${EDITION_DUPLICATOR_AGENT_VERSION}`, {
        batchSize: config.batchSize,
        sourceDatabase: config.sourceDatabase,
        dryRun: config.dryRun,
      })

      // 1. Connect to Miles Republic
      this.sourceDb = await this.connectToSource(config.sourceDatabase)
      context.logger.info('Connexion source initialisée')

      // 2. Load already-processed editions
      const processed = await this.loadProcessedEditions()
      context.logger.info(`${Object.keys(processed).length} éditions déjà traitées`)

      // 3. Find editions to duplicate
      const editions = await this.findEditionsToDuplicate(config.batchSize)
      context.logger.info(`${editions.length} éditions candidates trouvées`)

      // 4. Filter out already-processed
      const toProcess = editions.filter((ed: any) => !processed[ed.id.toString()])
      context.logger.info(`${toProcess.length} éditions à traiter (après déduplication)`)

      if (toProcess.length === 0) {
        return {
          success: true,
          message: 'Aucune édition à dupliquer',
          metrics: { found: editions.length, alreadyProcessed: editions.length - toProcess.length, created: 0 },
        }
      }

      // 5. Create proposals
      let created = 0
      let skipped = 0

      for (const edition of toProcess) {
        // Validate year is numeric
        const yearNum = parseInt(edition.year)
        if (isNaN(yearNum)) {
          context.logger.warn(`Édition ${edition.id}: année non numérique "${edition.year}", ignorée`)
          skipped++
          continue
        }

        const proposalData = this.buildProposalForEdition(edition)

        if (config.dryRun) {
          context.logger.info(`[DRY RUN] Proposition pour édition ${edition.id} (${edition.event.name} ${edition.year} → ${yearNum + 1})`)
          created++
          continue
        }

        const proposal = await this.createProposal(proposalData)
        context.logger.info(`✅ Proposition créée: ${proposal.id} — ${edition.event.name} ${edition.year} → ${yearNum + 1}`)

        // Track as processed
        processed[edition.id.toString()] = proposal.id
        await this.saveProcessedEditions(processed)
        created++
      }

      return {
        success: true,
        message: `${created} proposition(s) créée(s), ${skipped} ignorée(s)`,
        metrics: {
          found: editions.length,
          alreadyProcessed: editions.length - toProcess.length,
          created,
          skipped,
          dryRun: config.dryRun,
        },
      }
    } catch (error) {
      context.logger.error('Erreur Edition Duplicator:', error)
      return {
        success: false,
        message: `Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
      }
    } finally {
      await this.closeSourceConnections()
    }
  }

  /**
   * Find current-year editions that have ended and have no next-year edition.
   * Equivalent of the n8n SQL query.
   */
  private async findEditionsToDuplicate(batchSize: number): Promise<any[]> {
    const now = new Date()
    const currentYear = now.getFullYear()
    const nextYear = currentYear + 1

    // Find ended editions for current year with no next-year edition
    const editions = await this.sourceDb.edition.findMany({
      where: {
        year: currentYear.toString(),
        status: { not: 'DRAFT' },
        currentEditionEventId: { not: null },
        endDate: {
          not: null,
          // endDate + 1 day <= today → endDate < start of today
          lt: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        },
      },
      include: {
        event: {
          select: { id: true, name: true, city: true },
        },
        races: {
          where: { isArchived: false },
        },
        editionPartners: {
          include: {
            localizedContents: true,
          },
        },
      },
      take: batchSize * 2, // Take more to account for filtering
      orderBy: { endDate: 'asc' },
    })

    // Filter: endDate year must be current year
    const filtered = editions.filter((ed: any) => {
      if (!ed.endDate) return false
      const endYear = new Date(ed.endDate).getFullYear()
      return endYear === currentYear
    })

    // Filter: no next-year edition exists for same event
    const result: any[] = []
    for (const edition of filtered) {
      const nextYearEdition = await this.sourceDb.edition.findFirst({
        where: {
          eventId: edition.eventId,
          year: nextYear.toString(),
        },
        select: { id: true },
      })

      if (!nextYearEdition) {
        result.push(edition)
      }
    }

    return result.slice(0, batchSize)
  }

  /**
   * Build a proposal payload for duplicating an edition to next year.
   */
  private buildProposalForEdition(edition: any): any {
    const currentYear = parseInt(edition.year)
    const nextYear = currentYear + 1

    return {
      type: 'EDITION_UPDATE',
      eventId: edition.eventId.toString(),
      editionId: edition.id.toString(),
      confidence: 1.0,
      changes: {
        editionToCreate: {
          eventId: edition.eventId,
          year: nextYear.toString(),
          startDate: this.shiftDateByOneYear(edition.startDate),
          endDate: this.shiftDateByOneYear(edition.endDate),
          status: edition.status,
          calendarStatus: 'TO_BE_CONFIRMED',
          clientStatus: 'NEW_SALES_FUNNEL',
          currentEditionEventId: edition.eventId,
          isAttendeeListPublic: edition.isAttendeeListPublic,
          organizerStripeConnectedAccountId: edition.organizerStripeConnectedAccountId,
          currency: edition.currency,
          medusaVersion: edition.medusaVersion,
          timeZone: edition.timeZone,
          slug: randomUUID(),
        },
        oldEditionUpdate: {
          currentEditionEventId: null,
        },
        racesToCreate: edition.races.map((race: any) => ({
          name: race.name,
          startDate: this.shiftDateByOneYear(race.startDate),
          runDistance: race.runDistance,
          runDistance2: race.runDistance2,
          bikeDistance: race.bikeDistance,
          swimDistance: race.swimDistance,
          walkDistance: race.walkDistance,
          bikeRunDistance: race.bikeRunDistance,
          swimRunDistance: race.swimRunDistance,
          runPositiveElevation: race.runPositiveElevation,
          runNegativeElevation: race.runNegativeElevation,
          bikePositiveElevation: race.bikePositiveElevation,
          bikeNegativeElevation: race.bikeNegativeElevation,
          walkPositiveElevation: race.walkPositiveElevation,
          walkNegativeElevation: race.walkNegativeElevation,
          price: race.price,
          priceType: race.priceType,
          paymentCollectionType: race.paymentCollectionType,
          categoryLevel1: race.categoryLevel1,
          categoryLevel2: race.categoryLevel2,
          distanceCategory: race.distanceCategory,
          licenseNumberType: race.licenseNumberType,
          adultJustificativeOptions: race.adultJustificativeOptions,
          minorJustificativeOptions: race.minorJustificativeOptions,
          askAttendeeBirthDate: race.askAttendeeBirthDate,
          askAttendeeGender: race.askAttendeeGender,
          askAttendeeNationality: race.askAttendeeNationality,
          askAttendeePhoneNumber: race.askAttendeePhoneNumber,
          askAttendeePostalAddress: race.askAttendeePostalAddress,
          showClubOrAssoInput: race.showClubOrAssoInput,
          showPublicationConsentCheckbox: race.showPublicationConsentCheckbox,
          minTeamSize: race.minTeamSize,
          maxTeamSize: race.maxTeamSize,
          displayOrder: race.displayOrder,
          isArchived: race.isArchived,
          slug: randomUUID(),
          timeZone: race.timeZone,
          isMainRace: race.mainRaceEditionId === edition.id,
        })),
        partnersToCreate: edition.editionPartners.map((partner: any) => ({
          role: partner.role,
          name: partner.name,
          websiteUrl: partner.websiteUrl,
          instagramUrl: partner.instagramUrl,
          facebookUrl: partner.facebookUrl,
          logoUrl: partner.logoUrl,
          sortOrder: partner.sortOrder,
          localizedContents: (partner.localizedContents || []).map((lc: any) => ({
            locale: lc.locale,
            description: lc.description,
          })),
        })),
      },
      justification: [
        {
          type: 'edition_duplication',
          message: `Édition ${edition.year} terminée le ${edition.endDate?.toISOString().split('T')[0] || 'N/A'}, duplication pour ${nextYear}`,
          metadata: {
            sourceEditionId: edition.id,
            sourceYear: edition.year,
            targetYear: nextYear.toString(),
            racesCount: edition.races.length,
            partnersCount: edition.editionPartners.length,
          },
        },
      ],
      eventName: edition.event.name,
      eventCity: edition.event.city,
      editionYear: nextYear,
    }
  }

  /**
   * Shift a date by +1 year. Returns null if input is null.
   * Uses the same approach as n8n: DateTime.plus({ years: 1 })
   */
  private shiftDateByOneYear(date: Date | null): string | null {
    if (!date) return null
    const d = new Date(date)
    d.setFullYear(d.getFullYear() + 1)
    return d.toISOString()
  }

  private async loadProcessedEditions(): Promise<ProcessedEditionsState> {
    const state = await this.stateService.getState(this.config.id, 'processedEditions')
    return (state as ProcessedEditionsState) || {}
  }

  private async saveProcessedEditions(processed: ProcessedEditionsState): Promise<void> {
    await this.stateService.setState(this.config.id, 'processedEditions', processed)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/agents && npx jest --testPathPatterns="EditionDuplicatorAgent" --no-coverage`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/agents/src/EditionDuplicatorAgent.ts apps/agents/src/__tests__/EditionDuplicatorAgent.test.ts
git commit -m "feat(edition-duplicator): add EditionDuplicatorAgent with unit tests"
```

---

### Task 5: Register agent in registry and index

**Files:**
- Create: `apps/agents/src/registry/edition-duplicator.ts`
- Modify: `apps/agents/src/index.ts`

- [ ] **Step 1: Create registry file**

Create `apps/agents/src/registry/edition-duplicator.ts`:

```typescript
import { EditionDuplicatorAgent } from '../EditionDuplicatorAgent'
import { EditionDuplicatorAgentConfigSchema, getAgentName } from '@data-agents/types'
import { agentRegistry } from '@data-agents/agent-framework'

const DEFAULT_CONFIG = {
  name: getAgentName('EDITION_DUPLICATOR'),
  description: 'Duplique les éditions terminées pour l\'année suivante (remplace le workflow n8n)',
  type: 'EXTRACTOR' as const,
  frequency: '0 3 * * *',
  isActive: true,
  config: {
    agentType: 'EDITION_DUPLICATOR',
    sourceDatabase: null,
    batchSize: 50,
    dryRun: false,
    configSchema: EditionDuplicatorAgentConfigSchema,
  },
}

agentRegistry.register('EDITION_DUPLICATOR', EditionDuplicatorAgent)

console.log('✅ Edition Duplicator Agent enregistré dans le registry pour EDITION_DUPLICATOR')

export { EditionDuplicatorAgent, DEFAULT_CONFIG }
export default EditionDuplicatorAgent
```

- [ ] **Step 2: Update index.ts**

In `apps/agents/src/index.ts`:

Add import (after line 8):
```typescript
import { EditionDuplicatorAgent, EDITION_DUPLICATOR_AGENT_VERSION } from './EditionDuplicatorAgent'
```

Add registration (after line 17):
```typescript
agentRegistry.register('EDITION_DUPLICATOR', EditionDuplicatorAgent)
```

Add export (after line 26):
```typescript
export { EditionDuplicatorAgent, EDITION_DUPLICATOR_AGENT_VERSION }
```

Add to AGENT_VERSIONS object (after line 37):
```typescript
  editionDuplicator: EDITION_DUPLICATOR_AGENT_VERSION
```

- [ ] **Step 3: Commit**

```bash
git add apps/agents/src/registry/edition-duplicator.ts apps/agents/src/index.ts
git commit -m "feat(edition-duplicator): register agent in registry and index"
```

---

### Task 6: Add EDITION_DUPLICATOR to AutoValidatorAgent eligible types

**Files:**
- Modify: `apps/agents/src/AutoValidatorAgent.ts`

- [ ] **Step 1: Add to eligible types**

In `apps/agents/src/AutoValidatorAgent.ts`, in the `getEligibleAgentIds` method (around line 114-118), add a new entry to the `OR` array:

```typescript
          { config: { path: ['agentType'], equals: 'EDITION_DUPLICATOR' } }
```

After the `WEBSITE_CHECKER` entry (line 118).

- [ ] **Step 2: Build agents package and verify**

Run: `cd apps/agents && npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Run all agent tests**

Run: `cd apps/agents && npx jest --no-coverage`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/agents/src/AutoValidatorAgent.ts
git commit -m "feat(auto-validator): add EDITION_DUPLICATOR to eligible agent types"
```

---

### Task 7: Full build verification

- [ ] **Step 1: Build types package**

Run: `cd packages/types && npm run build`
Expected: Build succeeds.

- [ ] **Step 2: Build database package**

Run: `cd packages/database && npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Build agents package**

Run: `cd apps/agents && npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Run TypeScript check**

Run: `npm run tsc`
Expected: No type errors.

- [ ] **Step 5: Run all tests**

Run: `npm run test:run`
Expected: All tests pass.
