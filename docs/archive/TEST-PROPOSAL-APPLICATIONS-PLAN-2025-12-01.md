# Tests - Proposal Applications

**Date**: 1er Décembre 2025  
**Objectif**: Documenter la stratégie de tests exhaustive pour l'application des propositions NEW_EVENT et EDITION_UPDATE.

## 📋 Vue d'Ensemble

Cette documentation décrit les tests à implémenter pour garantir que :
- ✅ Les propositions NEW_EVENT créent correctement tous les objets (Event, Edition, Organizer, Races)
- ✅ Les propositions EDITION_UPDATE modifient uniquement les champs spécifiés
- ✅ Les champs non modifiés restent intacts (non-régression)
- ✅ Les opérations sur les courses (add/update/delete) fonctionnent correctement
- ✅ L'application par bloc fonctionne correctement
- ✅ Les modifications utilisateur (userModifiedChanges) prennent le dessus sur les propositions agent

## 🎯 Stratégie de Tests

### Principe AAA (Arrange-Act-Assert)

Tous les tests suivent le pattern **Given-When-Then** :

```typescript
it('should create event with all fields', async () => {
  // Given: État initial
  const proposal = createNewEventProposal({ name: 'Trail Test' })
  
  // When: Action testée
  const result = await applyProposal(proposal)
  
  // Then: Vérification du résultat
  const event = await db.event.findUnique({ where: { id: result.eventId } })
  expect(event.name).toBe('Trail Test')
})
```

### Isolation des Tests

Chaque test doit être complètement isolé :

```typescript
beforeEach(async () => {
  // Nettoyer la base de données test
  await db.$executeRaw`TRUNCATE TABLE "Event", "Edition", "Race", "Organizer" CASCADE`
})

afterEach(async () => {
  // Rollback des transactions si nécessaire
})
```

### Couverture Cible

| Catégorie | Couverture Cible | Tests Minimum |
|-----------|------------------|---------------|
| NEW_EVENT - Event | 100% | 10 tests |
| NEW_EVENT - Edition | 100% | 8 tests |
| NEW_EVENT - Organizer | 100% | 5 tests |
| NEW_EVENT - Races | 100% | 10 tests |
| EDITION_UPDATE - Event | 100% | 8 tests |
| EDITION_UPDATE - Edition | 100% | 8 tests |
| EDITION_UPDATE - Organizer | 100% | 5 tests |
| Race Operations (Update) | 100% | 10 tests |
| Race Operations (Add) | 100% | 5 tests |
| Race Operations (Delete) | 100% | 5 tests |
| Block Application | 100% | 8 tests |
| User Modifications | 100% | 10 tests |
| **TOTAL** | **100%** | **92 tests** |

## 🗂️ Organisation des Fichiers

```
apps/agents/src/__tests__/
└── proposal-application/
    ├── new-event.test.ts              # Tests NEW_EVENT (33 tests)
    ├── edition-update.test.ts         # Tests EDITION_UPDATE (21 tests)
    ├── race-operations.test.ts        # Tests races (20 tests)
    ├── block-application.test.ts      # Tests application par bloc (8 tests)
    ├── user-modifications.test.ts     # Tests userModifiedChanges (10 tests)
    ├── helpers/
    │   ├── fixtures.ts                # Données de test
    │   ├── assertions.ts              # Assertions personnalisées
    │   ├── db-setup.ts                # Configuration DB test
    │   └── index.ts                   # Exports centralisés
    └── README.md                      # Documentation rapide
```

## 🛠️ Helpers & Fixtures

### fixtures.ts - Création de Propositions

```typescript
/**
 * Crée une proposition NEW_EVENT avec valeurs par défaut
 */
export const createNewEventProposal = (overrides: Partial<any> = {}): Proposal => {
  const baseProposal = {
    id: `cm-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'NEW_EVENT',
    agentId: 'ffa-scraper',
    status: 'APPROVED',
    changes: {
      name: 'Trail Test',
      city: 'Paris',
      country: 'France',
      edition: {
        new: {
          year: 2026,
          startDate: '2026-03-15T09:00:00.000Z',
          endDate: '2026-03-15T18:00:00.000Z',
          timeZone: 'Europe/Paris',
          races: []
        }
      }
    },
    selectedChanges: {},
    userModifiedChanges: {},
    userModifiedRaceChanges: {},
    createdAt: new Date(),
    updatedAt: new Date()
  }
  
  return merge(baseProposal, overrides)
}

/**
 * Crée une proposition EDITION_UPDATE
 */
export const createEditionUpdateProposal = (
  eventId: number,
  editionId: number,
  changes: Partial<any> = {}
): Proposal => {
  return {
    id: `cm-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'EDITION_UPDATE',
    agentId: 'ffa-scraper',
    status: 'APPROVED',
    eventId: eventId.toString(),
    editionId: editionId.toString(),
    changes: {
      ...changes
    },
    selectedChanges: { ...changes },
    userModifiedChanges: {},
    userModifiedRaceChanges: {},
    createdAt: new Date(),
    updatedAt: new Date()
  }
}
```

### fixtures.ts - Création d'Objets en Base

```typescript
/**
 * Crée un événement existant en base
 */
export const createExistingEvent = async (data: Partial<Event> = {}): Promise<Event> => {
  return await testDb.event.create({
    data: {
      name: 'Event Test',
      city: 'Paris',
      country: 'France',
      slug: `event-test-${Date.now()}`,
      toUpdate: true,
      ...data
    }
  })
}

/**
 * Crée une édition existante en base
 */
export const createExistingEdition = async (
  eventId?: number,
  data: Partial<Edition> = {}
): Promise<Edition> => {
  const event = eventId ? 
    await testDb.event.findUnique({ where: { id: eventId } }) :
    await createExistingEvent()
  
  return await testDb.edition.create({
    data: {
      eventId: event!.id,
      year: 2026,
      startDate: new Date('2026-03-15T09:00:00.000Z'),
      endDate: new Date('2026-03-15T18:00:00.000Z'),
      timeZone: 'Europe/Paris',
      currentEditionEventId: event!.id,
      ...data
    }
  })
}

/**
 * Crée une course existante en base
 */
export const createExistingRace = async (data: Partial<Race> = {}): Promise<Race> => {
  const edition = data.editionId ? 
    await testDb.edition.findUnique({ where: { id: data.editionId } }) :
    await createExistingEdition()
  
  return await testDb.race.create({
    data: {
      editionId: edition!.id,
      name: '10km Test',
      distance: 10,
      startDate: new Date('2026-03-15T09:00:00.000Z'),
      categoryLevel1: 'RUNNING',
      categoryLevel2: 'KM10',
      ...data
    }
  })
}

/**
 * Crée un organisateur existant en base
 */
export const createExistingOrganizer = async (data: Partial<Organizer> = {}): Promise<Organizer> => {
  return await testDb.organizer.create({
    data: {
      name: 'Organizer Test',
      email: 'test@example.com',
      ...data
    }
  })
}
```

### assertions.ts - Assertions Personnalisées

```typescript
/**
 * Vérifie que tous les champs d'un objet correspondent aux valeurs attendues
 */
export const expectObjectFields = <T extends Record<string, any>>(
  obj: T,
  expected: Partial<T>
) => {
  Object.entries(expected).forEach(([key, value]) => {
    if (value instanceof Date) {
      expect(obj[key]).toEqual(value)
    } else {
      expect(obj[key]).toBe(value)
    }
  })
}

/**
 * Vérifie le nombre de courses d'une édition
 */
export const expectRaceCount = async (editionId: number, count: number) => {
  const races = await testDb.race.findMany({
    where: { editionId, archivedAt: null }
  })
  expect(races).toHaveLength(count)
}

/**
 * Vérifie qu'une course est archivée
 */
export const expectRaceArchived = async (raceId: number) => {
  const race = await testDb.race.findUnique({ where: { id: raceId } })
  expect(race).not.toBeNull()
  expect(race!.archivedAt).not.toBeNull()
}

/**
 * Vérifie qu'une course est active
 */
export const expectRaceActive = async (raceId: number) => {
  const race = await testDb.race.findUnique({ where: { id: raceId } })
  expect(race).not.toBeNull()
  expect(race!.archivedAt).toBeNull()
}

/**
 * Vérifie qu'un champ n'a pas été modifié
 */
export const expectFieldUnchanged = async <T>(
  model: string,
  id: number,
  field: keyof T,
  expectedValue: any
) => {
  const obj = await testDb[model].findUnique({ where: { id } })
  expect(obj[field]).toBe(expectedValue)
}
```

### db-setup.ts - Configuration Base de Données Test

```typescript
import { PrismaClient } from '@prisma/client'

// Client Prisma dédié aux tests
export const testDb = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_TEST_URL || 'postgresql://localhost:5432/data-agents-test'
    }
  }
})

/**
 * Nettoie toutes les tables avant chaque test
 */
export const cleanDatabase = async () => {
  await testDb.$transaction([
    testDb.$executeRaw`TRUNCATE TABLE "Race" CASCADE`,
    testDb.$executeRaw`TRUNCATE TABLE "Edition" CASCADE`,
    testDb.$executeRaw`TRUNCATE TABLE "Event" CASCADE`,
    testDb.$executeRaw`TRUNCATE TABLE "Organizer" CASCADE`,
    testDb.$executeRaw`TRUNCATE TABLE "Proposal" CASCADE`,
    testDb.$executeRaw`TRUNCATE TABLE "ProposalApplication" CASCADE`
  ])
}

/**
 * Ferme la connexion DB après tous les tests
 */
export const closeDatabase = async () => {
  await testDb.$disconnect()
}

/**
 * Setup global pour Jest
 */
export const setupGlobalTests = () => {
  beforeEach(async () => {
    await cleanDatabase()
  })
  
  afterAll(async () => {
    await closeDatabase()
  })
}
```

## 📝 Exemples de Tests Détaillés

### Test NEW_EVENT - Création Complète

```typescript
describe('NEW_EVENT - Full Creation', () => {
  it('should create event + edition + organizer + races', async () => {
    // Given: Proposition NEW_EVENT complète
    const proposal = createNewEventProposal({
      name: 'Trail des Loups',
      city: 'Bonnefontaine',
      country: 'France',
      countrySubdivision: 'Bourgogne-Franche-Comté',
      websiteUrl: 'https://traildesloups.fr',
      facebookUrl: 'https://facebook.com/traildesloups',
      edition: {
        new: {
          year: 2026,
          startDate: '2026-03-15T09:00:00.000Z',
          endDate: '2026-03-15T18:00:00.000Z',
          timeZone: 'Europe/Paris',
          calendarStatus: 'CONFIRMED',
          races: [
            {
              name: '10km',
              distance: 10,
              startDate: '2026-03-15T09:00:00.000Z',
              categoryLevel1: 'RUNNING',
              categoryLevel2: 'KM10'
            },
            {
              name: 'Semi-Marathon',
              distance: 21.1,
              startDate: '2026-03-15T10:00:00.000Z',
              categoryLevel1: 'RUNNING',
              categoryLevel2: 'HALF_MARATHON'
            },
            {
              name: 'Trail 35km',
              distance: 35,
              elevation: 1500,
              startDate: '2026-03-15T08:00:00.000Z',
              categoryLevel1: 'TRAIL',
              categoryLevel2: 'LONG_TRAIL'
            }
          ]
        }
      },
      organizer: {
        new: {
          name: 'Association Trail BFC',
          email: 'contact@trailbfc.fr',
          phone: '0601020304'
        }
      }
    })
    
    // When: Application de la proposition
    const domainService = new ProposalDomainService(testDb)
    const result = await domainService.applyProposal(
      proposal,
      proposal.selectedChanges,
      {}
    )
    
    // Then: Vérifier Event créé
    const event = await testDb.event.findUnique({
      where: { id: result.createdEventId }
    })
    expect(event).not.toBeNull()
    expect(event!.name).toBe('Trail des Loups')
    expect(event!.city).toBe('Bonnefontaine')
    expect(event!.country).toBe('France')
    expect(event!.websiteUrl).toBe('https://traildesloups.fr')
    expect(event!.slug).toMatch(/^trail-des-loups-\d+$/)
    
    // Then: Vérifier Edition créée
    const edition = await testDb.edition.findUnique({
      where: { id: result.createdEditionId }
    })
    expect(edition).not.toBeNull()
    expect(edition!.year).toBe(2026)
    expect(edition!.startDate).toEqual(new Date('2026-03-15T09:00:00.000Z'))
    expect(edition!.timeZone).toBe('Europe/Paris')
    expect(edition!.calendarStatus).toBe('CONFIRMED')
    expect(edition!.currentEditionEventId).toBe(event!.id)
    
    // Then: Vérifier Organizer créé
    expect(edition!.organizerId).not.toBeNull()
    const organizer = await testDb.organizer.findUnique({
      where: { id: edition!.organizerId! }
    })
    expect(organizer!.name).toBe('Association Trail BFC')
    expect(organizer!.email).toBe('contact@trailbfc.fr')
    
    // Then: Vérifier 3 Races créées
    const races = await testDb.race.findMany({
      where: { editionId: edition!.id },
      orderBy: { startDate: 'asc' }
    })
    expect(races).toHaveLength(3)
    
    expect(races[0].name).toBe('Trail 35km')
    expect(races[0].distance).toBe(35)
    expect(races[0].elevation).toBe(1500)
    
    expect(races[1].name).toBe('10km')
    expect(races[1].distance).toBe(10)
    
    expect(races[2].name).toBe('Semi-Marathon')
    expect(races[2].distance).toBe(21.1)
  })
})
```

### Test EDITION_UPDATE - Non-Régression

```typescript
describe('EDITION_UPDATE - Non-Regression', () => {
  it('should not modify unspecified fields', async () => {
    // Given: Event existant avec tous les champs remplis
    const event = await createExistingEvent({
      name: 'Trail Original',
      city: 'Paris',
      country: 'France',
      countrySubdivision: 'Île-de-France',
      websiteUrl: 'https://old-site.com',
      facebookUrl: 'https://facebook.com/old',
      instagramUrl: 'https://instagram.com/old'
    })
    
    const edition = await createExistingEdition(event.id, {
      year: 2026,
      startDate: new Date('2026-03-15T09:00:00.000Z'),
      endDate: new Date('2026-03-15T18:00:00.000Z'),
      timeZone: 'Europe/Paris',
      calendarStatus: 'ANNOUNCED'
    })
    
    // Given: Proposition modifiant UNIQUEMENT 2 champs
    const proposal = createEditionUpdateProposal(event.id, edition.id, {
      // Bloc Event
      websiteUrl: {
        old: 'https://old-site.com',
        new: 'https://new-site.com'
      },
      // Bloc Edition
      calendarStatus: {
        old: 'ANNOUNCED',
        new: 'CONFIRMED'
      }
    })
    
    // When: Application de la proposition
    const domainService = new ProposalDomainService(testDb)
    await domainService.applyProposal(
      proposal,
      proposal.selectedChanges,
      {}
    )
    
    // Then: Vérifier UNIQUEMENT les 2 champs modifiés
    const updatedEvent = await testDb.event.findUnique({ where: { id: event.id } })
    expect(updatedEvent!.websiteUrl).toBe('https://new-site.com') // ✅ Modifié
    
    const updatedEdition = await testDb.edition.findUnique({ where: { id: edition.id } })
    expect(updatedEdition!.calendarStatus).toBe('CONFIRMED') // ✅ Modifié
    
    // Then: Vérifier que les autres champs SONT INTACTS
    expect(updatedEvent!.name).toBe('Trail Original') // ✅ Inchangé
    expect(updatedEvent!.city).toBe('Paris') // ✅ Inchangé
    expect(updatedEvent!.facebookUrl).toBe('https://facebook.com/old') // ✅ Inchangé
    expect(updatedEvent!.instagramUrl).toBe('https://instagram.com/old') // ✅ Inchangé
    
    expect(updatedEdition!.year).toBe(2026) // ✅ Inchangé
    expect(updatedEdition!.startDate).toEqual(new Date('2026-03-15T09:00:00.000Z')) // ✅ Inchangé
    expect(updatedEdition!.timeZone).toBe('Europe/Paris') // ✅ Inchangé
  })
})
```

### Test Race Operations - Suppression

```typescript
describe('Race Operations - Delete', () => {
  it('should archive deleted races without touching others', async () => {
    // Given: Edition avec 3 courses actives
    const edition = await createExistingEdition()
    const race1 = await createExistingRace({ 
      editionId: edition.id, 
      name: '10km',
      distance: 10
    })
    const race2 = await createExistingRace({ 
      editionId: edition.id, 
      name: 'Semi',
      distance: 21.1
    })
    const race3 = await createExistingRace({ 
      editionId: edition.id, 
      name: 'Marathon',
      distance: 42.195
    })
    
    // Given: Proposition supprimant UNIQUEMENT race2
    const proposal = createEditionUpdateProposal(edition.eventId, edition.id, {
      racesToDelete: [race2.id]
    })
    
    // When: Application de la proposition
    const domainService = new ProposalDomainService(testDb)
    await domainService.applyProposal(
      proposal,
      proposal.selectedChanges,
      {}
    )
    
    // Then: race2 archivée
    await expectRaceArchived(race2.id)
    
    // Then: race1 et race3 toujours actives
    await expectRaceActive(race1.id)
    await expectRaceActive(race3.id)
    
    // Then: 2 courses actives au total
    await expectRaceCount(edition.id, 2)
  })
})
```

## 🚀 Scripts NPM

Ajouter dans `package.json` à la racine :

```json
{
  "scripts": {
    "test:proposals": "jest apps/agents/src/__tests__/proposal-application --runInBand",
    "test:proposals:new-event": "jest apps/agents/src/__tests__/proposal-application/new-event.test.ts",
    "test:proposals:edition-update": "jest apps/agents/src/__tests__/proposal-application/edition-update.test.ts",
    "test:proposals:races": "jest apps/agents/src/__tests__/proposal-application/race-operations.test.ts",
    "test:proposals:blocks": "jest apps/agents/src/__tests__/proposal-application/block-application.test.ts",
    "test:proposals:user-mods": "jest apps/agents/src/__tests__/proposal-application/user-modifications.test.ts",
    "test:proposals:watch": "jest apps/agents/src/__tests__/proposal-application --watch",
    "test:proposals:coverage": "jest apps/agents/src/__tests__/proposal-application --coverage"
  }
}
```

**Note importante** : `--runInBand` force Jest à exécuter les tests en séquentiel pour éviter les conflits de base de données.

## ⚙️ Configuration Jest

Créer/modifier `jest.config.js` :

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/apps/agents/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'apps/agents/src/**/*.ts',
    '!apps/agents/src/**/*.test.ts',
    '!apps/agents/src/__tests__/**/*'
  ],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
  setupFilesAfterEnv: ['<rootDir>/apps/agents/src/__tests__/setup.ts'],
  testTimeout: 30000 // 30s pour tests DB
}
```

Créer `apps/agents/src/__tests__/setup.ts` :

```typescript
import { setupGlobalTests } from './proposal-application/helpers/db-setup'

setupGlobalTests()
```

## 📊 Suivi de la Couverture

### Commande pour générer le rapport

```bash
npm run test:proposals:coverage
```

### Seuils de couverture cibles

Dans `jest.config.js` :

```javascript
module.exports = {
  // ...
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './packages/database/src/services/proposal-domain.service.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    }
  }
}
```

## ✅ Checklist d'Implémentation

### Phase 1: Infrastructure (2h)
- [ ] Créer structure de dossiers `__tests__/proposal-application/`
- [ ] Créer `helpers/fixtures.ts` avec toutes les fonctions helper
- [ ] Créer `helpers/assertions.ts` avec assertions personnalisées
- [ ] Créer `helpers/db-setup.ts` avec configuration DB test
- [ ] Créer `helpers/index.ts` pour exports centralisés
- [ ] Ajouter scripts NPM dans `package.json`
- [ ] Configurer Jest avec `jest.config.js`
- [ ] Créer `setup.ts` pour setup global

### Phase 2: Tests NEW_EVENT (3h)
- [ ] `new-event.test.ts` - Tests création Event (10 tests)
- [ ] `new-event.test.ts` - Tests création Edition (8 tests)
- [ ] `new-event.test.ts` - Tests création Organizer (5 tests)
- [ ] `new-event.test.ts` - Tests création Races (10 tests)

### Phase 3: Tests EDITION_UPDATE (2h)
- [ ] `edition-update.test.ts` - Tests modification Event (8 tests)
- [ ] `edition-update.test.ts` - Tests modification Edition (8 tests)
- [ ] `edition-update.test.ts` - Tests modification Organizer (5 tests)

### Phase 4: Tests Races (2h)
- [ ] `race-operations.test.ts` - Tests update races (10 tests)
- [ ] `race-operations.test.ts` - Tests add races (5 tests)
- [ ] `race-operations.test.ts` - Tests delete races (5 tests)

### Phase 5: Tests Avancés (2h)
- [ ] `block-application.test.ts` - Tests application par bloc (8 tests)
- [ ] `user-modifications.test.ts` - Tests userModifiedChanges (10 tests)

### Phase 6: Documentation (30min)
- [ ] Créer `README.md` dans `__tests__/proposal-application/`
- [ ] Documenter helpers dans JSDoc
- [ ] Documenter assertions dans JSDoc
- [ ] Ajouter exemples d'utilisation

## 🎯 Critères de Succès

Pour considérer les tests comme complets, tous les critères suivants doivent être remplis :

✅ **Coverage globale ≥ 90%**
- Branches: ≥ 90%
- Functions: ≥ 90%
- Lines: ≥ 90%
- Statements: ≥ 90%

✅ **Tous les tests passent en vert**
- 0 tests en échec
- 0 tests skip
- 92 tests minimum

✅ **Tests isolés**
- Chaque test peut s'exécuter seul
- Pas d'effet de bord entre tests
- Base de données nettoyée entre chaque test

✅ **Performance acceptable**
- Temps d'exécution total < 2 minutes
- Temps d'exécution par test < 5 secondes

✅ **Documentation à jour**
- README.md avec exemples
- JSDoc pour tous les helpers
- Plan de tests synchronisé avec l'implémentation

## 📚 Ressources

- **Plan de tests** : Warp Drive Notebook "Plan de Tests - Proposal Applications"
- **Service à tester** : `packages/database/src/services/proposal-domain.service.ts`
- **Schéma Prisma** : `apps/agents/prisma/miles-republic.prisma`
- **Exemples existants** : `apps/agents/src/ffa/__tests__/`

## 🔄 Maintenance

### Ajout d'un nouveau test

1. Identifier la catégorie (NEW_EVENT, EDITION_UPDATE, etc.)
2. Ajouter le test dans le fichier approprié
3. Utiliser les helpers existants (`fixtures.ts`, `assertions.ts`)
4. Vérifier que le test est isolé
5. Lancer `npm run test:proposals:watch` pendant le développement
6. Mettre à jour cette documentation si nouvelle catégorie

### Mise à jour des tests après modification du code

1. Identifier les tests affectés
2. Mettre à jour les fixtures si nécessaire
3. Ajuster les assertions selon la nouvelle logique
4. Vérifier la couverture globale
5. Documenter les changements dans CHANGELOG

