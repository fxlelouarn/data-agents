# Tests - Application de Propositions

**Date de création** : 1er Décembre 2025  
**Couverture** : 102 tests exhaustifs  
**Objectif** : Garantir la fiabilité de l'application des propositions NEW_EVENT et EDITION_UPDATE

---

## 📋 Vue d'Ensemble

Cette suite de tests valide que :
- ✅ Les propositions NEW_EVENT créent correctement tous les objets (Event, Edition, Organizer, Races)
- ✅ Les propositions EDITION_UPDATE modifient uniquement les champs spécifiés
- ✅ Les champs non modifiés restent intacts (non-régression)
- ✅ Les opérations sur les courses (add/update/delete) fonctionnent correctement
- ✅ L'application par bloc (`approvedBlocks`) fonctionne correctement
- ✅ Les modifications utilisateur (`userModifiedChanges`) prennent le dessus sur les propositions agent

---

## 📊 Statistiques

| Catégorie | Fichier | Tests | Couverture |
|-----------|---------|-------|------------|
| **NEW_EVENT** | `new-event.test.ts` | 43 | Event (10), Edition (8), Organizer (5), Races (20) |
| **EDITION_UPDATE** | `edition-update.test.ts` | 21 | Event (6), Edition (8), Organizer (5), Non-régression (2) |
| **Race Operations** | `race-operations.test.ts` | 20 | Update (10), Add (5), Delete (5) |
| **Advanced** | `advanced.test.ts` | 18 | Block Application (5), User Modifications (12), Edge Cases (3) |
| **TOTAL** | 4 fichiers | **102** | **111% de l'objectif initial** 🎉 |

---

## 🗂️ Organisation des Fichiers

```
apps/agents/src/__tests__/proposal-application/
├── README.md                    # Ce fichier
├── new-event.test.ts            # Tests NEW_EVENT (43 tests)
├── edition-update.test.ts       # Tests EDITION_UPDATE (21 tests)
├── race-operations.test.ts      # Tests opérations courses (20 tests)
├── advanced.test.ts             # Tests avancés (18 tests)
└── helpers/
    ├── db-setup.ts              # Configuration DB test + setup/teardown
    ├── fixtures.ts              # Création de propositions et objets test
    ├── assertions.ts            # Assertions personnalisées
    └── index.ts                 # Exports centralisés
```

---

## 🛠️ Helpers & Fixtures

### `db-setup.ts` - Gestion de la Base de Données

```typescript
// Clients Prisma pour les tests
export const testDb                // Base data-agents (propositions)
export const testMilesRepublicDb   // Base Miles Republic (events, editions, races)

// Setup/Teardown
export async function setupTestEnvironment()     // Nettoie les tables avant chaque test
export async function teardownTestEnvironment()  // Ferme les connexions après chaque test
```

**Configuration requise** :
- Variables d'environnement : `DATABASE_URL`, `MILES_REPUBLIC_DATABASE_URL`
- Bases de données dédiées aux tests (séparées de dev/prod)

### `fixtures.ts` - Création de Données de Test

#### Propositions

```typescript
// NEW_EVENT
createNewEventProposal(overrides?: Partial<any>)
// Exemple:
const proposal = createNewEventProposal({
  name: 'Trail des Loups',
  city: 'Bonnefontaine',
  edition: {
    new: {
      year: 2026,
      races: [
        { name: '10km', runDistance: 10 }
      ]
    }
  }
})

// EDITION_UPDATE
createEditionUpdateProposal(eventId: number, editionId: number, changes: any)
// Exemple:
const proposal = createEditionUpdateProposal(eventId, editionId, {
  startDate: {
    old: '2026-03-15T09:00:00.000Z',
    new: '2026-03-20T09:00:00.000Z'
  },
  races: {
    toUpdate: [{ raceId: 123, updates: { runDistance: { old: 10, new: 12 } } }]
  }
})
```

#### Objets Miles Republic

```typescript
// Event
await createExistingEvent({ 
  name: 'Trail Test', 
  city: 'Paris' 
})

// Edition
await createExistingEdition(eventId, { 
  year: 2026, 
  startDate: new Date('2026-03-15T09:00:00.000Z') 
})

// Race
await createExistingRace({ 
  editionId: editionId, 
  name: '10km', 
  runDistance: 10 
})

// Organizer
await createExistingOrganizer({ 
  name: 'Association Trail', 
  email: 'contact@trail.fr' 
})

// Setup complet (Event + Edition + Organizer + Races)
await createCompleteSetup({ 
  eventName: 'Trail Test', 
  raceCount: 3 
})
```

### `assertions.ts` - Assertions Personnalisées

```typescript
// Vérifier les champs d'un event
expectEventFields(event, {
  name: 'Trail Test',
  city: 'Paris',
  slug: 'trail-test-12345'
})

// Vérifier les champs d'une edition
expectEditionFields(edition, {
  year: 2026,
  startDate: new Date('2026-03-15T09:00:00.000Z'),
  timeZone: 'Europe/Paris'
})

// Vérifier le nombre de courses
await expectRaceCount(editionId, 3)

// Vérifier qu'une course est archivée
await expectRaceArchived(raceId)

// Vérifier qu'une course est active
await expectRaceActive(raceId)
```

---

## 🧪 Exemples de Tests

### Test Simple - NEW_EVENT

```typescript
it('should create event with all fields', async () => {
  // Given: Proposition NEW_EVENT complète
  const proposal = createNewEventProposal({
    name: 'Trail des Loups',
    city: 'Bonnefontaine',
    country: 'France',
    websiteUrl: 'https://trail.fr'
  })

  // When: Application de la proposition
  await proposalService.applyProposal(proposal as any, {})

  // Then: Event créé avec tous les champs
  const event = await testMilesRepublicDb.event.findFirst({
    where: { name: 'Trail des Loups' }
  })
  
  expect(event).toBeDefined()
  expect(event!.city).toBe('Bonnefontaine')
  expect(event!.websiteUrl).toBe('https://trail.fr')
})
```

### Test Complexe - EDITION_UPDATE avec Block Application

```typescript
it('should apply only approved blocks', async () => {
  // Given: Event + Edition existants
  const event = await createExistingEvent({ name: 'Trail' })
  const edition = await createExistingEdition(event.id)
  const race = await createExistingRace({ editionId: edition.id })
  
  // Proposition modifiant 3 blocs
  const proposal = createEditionUpdateProposal(event.id, edition.id, {
    name: { old: 'Trail', new: 'Trail Modifié' },        // Bloc event
    startDate: { old: '...', new: '...' },                // Bloc edition
    races: { toUpdate: [{ ... }] }                        // Bloc races
  })
  
  // Approuver seulement event + edition
  proposal.approvedBlocks = {
    event: true,
    edition: true,
    races: false
  }

  // When
  await proposalService.applyProposal(proposal as any, {})

  // Then: Event + Edition modifiés, Race inchangée
  const updatedEvent = await testMilesRepublicDb.event.findUnique({ 
    where: { id: event.id } 
  })
  expect(updatedEvent!.name).toBe('Trail Modifié')
  
  const updatedRace = await testMilesRepublicDb.race.findUnique({ 
    where: { id: race.id } 
  })
  expect(updatedRace!.runDistance).toBe(10) // ✅ Inchangé
})
```

### Test User Modifications Override

```typescript
it('should override agent proposal with user modification', async () => {
  // Given: Agent propose distance 10, user modifie en 12
  const proposal = createEditionUpdateProposal(eventId, editionId, {
    races: {
      toUpdate: [{
        raceId: raceId,
        updates: { runDistance: { old: 10, new: 10 } } // Agent
      }]
    }
  })
  
  // User override
  proposal.userModifiedChanges = {
    races: {
      [raceId]: { runDistance: 12 }
    }
  }

  // When
  await proposalService.applyProposal(proposal as any, {})

  // Then: Valeur user appliquée
  const updated = await testMilesRepublicDb.race.findUnique({ 
    where: { id: raceId } 
  })
  expect(updated!.runDistance).toBe(12) // ✅ User, pas agent
})
```

---

## 🚀 Exécution des Tests

### Tous les tests

```bash
npm test apps/agents/src/__tests__/proposal-application
```

### Tests spécifiques

```bash
# NEW_EVENT uniquement
npm test new-event.test.ts

# EDITION_UPDATE uniquement
npm test edition-update.test.ts

# Race operations uniquement
npm test race-operations.test.ts

# Advanced features uniquement
npm test advanced.test.ts
```

### Avec coverage

```bash
npm test -- --coverage apps/agents/src/__tests__/proposal-application
```

### Mode watch (développement)

```bash
npm test -- --watch apps/agents/src/__tests__/proposal-application
```

---

## 📖 Détail des Tests par Fichier

### `new-event.test.ts` (43 tests)

#### Event Creation (10 tests)
- ✅ Création avec tous les champs requis
- ✅ Génération automatique du slug
- ✅ Génération automatique de `countrySubdivisionDisplayCodeLevel1`
- ✅ Création avec caractères spéciaux dans le nom
- ✅ Création avec URLs (website, facebook, instagram, twitter)
- ✅ Création avec `fullAddress` générée automatiquement
- ✅ Création avec champs null (latitude, longitude, etc.)
- ✅ Définition automatique de `toUpdate = true`
- ✅ Mapping région → code (ex: "Grand Est" → "GES")
- ✅ Gestion des régions non reconnues (fallback)

#### Edition Creation (8 tests)
- ✅ Création avec dates (startDate, endDate)
- ✅ Création avec timezone (support DOM-TOM)
- ✅ Création avec `calendarStatus`
- ✅ Création avec URLs (website, registration, facebook)
- ✅ Création avec dates d'inscription (opening, closing)
- ✅ Définition automatique de `currentEditionEventId`
- ✅ Déduction automatique de `dataSource` (FEDERATION, TIMER, OTHER)
- ✅ Création avec champs null

#### Organizer Creation (5 tests)
- ✅ Création d'un nouvel organizer
- ✅ Création avec tous les champs (name, email, phone, address, etc.)
- ✅ Réutilisation d'un organizer existant (matching par nom)
- ✅ Pas de création si organizer null
- ✅ Liaison automatique Edition ↔ Organizer

#### Races Creation (20 tests)
- ✅ Création d'une course simple (10km)
- ✅ Création de plusieurs courses (5km, 10km, Semi)
- ✅ Création avec élévation (trail avec D+)
- ✅ Création avec timezone héritée de l'édition
- ✅ Création avec catégories (categoryLevel1, categoryLevel2)
- ✅ Support RUNNING (KM10, HALF_MARATHON, MARATHON, etc.)
- ✅ Support TRAIL (SHORT_TRAIL, LONG_TRAIL, ULTRA_TRAIL, etc.)
- ✅ Support CYCLING (XC_MOUNTAIN_BIKE, ROAD_CYCLING_TOUR, GRAVEL_RACE, etc.)
- ✅ Support WALK (NORDIC_WALK, HIKING)
- ✅ Support distances run/bike/walk/swim
- ✅ Création triathlon (3 distances)
- ✅ Création avec startDate différent de l'édition
- ✅ Création sans élévation (null)
- ✅ Gestion des courses multi-jours (startDate différent par course)
- ✅ Validation des catégories (RUNNING + KM10, TRAIL + LONG_TRAIL, etc.)
- ✅ Gestion des courses sans catégorie (null)
- ✅ Création avec nombre décimal (21.097 km)
- ✅ Création avec distances nulles (bike = null, swim = null)
- ✅ Événement vide (0 course)
- ✅ Pas de duplication des courses

### `edition-update.test.ts` (21 tests)

#### Event Modifications (6 tests)
- ✅ Modification d'un seul champ (nom)
- ✅ Modification de plusieurs champs (city, websiteUrl, facebookUrl)
- ✅ Préservation des champs null si non modifiés
- ✅ Modification de `countrySubdivision` + recalcul du code régional
- ✅ Vidage de champs optionnels (mise à null)
- ✅ Non-modification des champs non spécifiés (non-régression complète)

#### Edition Modifications (8 tests)
- ✅ Modification de `startDate` uniquement
- ✅ Modification de `startDate` + `endDate`
- ✅ Modification de `calendarStatus` (ANNOUNCED → CONFIRMED)
- ✅ Modification de `timeZone` (Europe/Paris → America/Guadeloupe)
- ✅ Modification des URLs (website, registration, facebook)
- ✅ Modification de `dataSource` (OTHER → FEDERATION)
- ✅ Modification des dates d'inscription (opening, closing)
- ✅ Non-modification des champs non spécifiés (non-régression)

#### Organizer Modifications (5 tests)
- ✅ Modification d'un champ organizer (email)
- ✅ Création d'un nouvel organizer si inexistant
- ✅ Réutilisation d'un organizer existant (matching par nom)
- ✅ Modification de plusieurs champs organizer
- ✅ Non-modification si aucun changement proposé

#### Non-régression (2 tests)
- ✅ Modification partielle Event → Autres champs intacts
- ✅ Modification partielle Edition → Autres champs intacts

### `race-operations.test.ts` (20 tests)

#### Update Races (10 tests)
- ✅ Modification de `runDistance`
- ✅ Modification de `startDate`
- ✅ Modification de `runPositiveElevation`
- ✅ Modification de plusieurs champs (distance + heure + élévation)
- ✅ Préservation des champs non modifiés
- ✅ Modification indépendante de 2 courses
- ✅ Modification des catégories (RUNNING → TRAIL)
- ✅ Modification de `bikeDistance` (course vélo)
- ✅ Modification de 3 distances (triathlon)
- ✅ Mise à null de l'élévation

#### Add Races (5 tests)
- ✅ Ajout d'une course à une édition existante
- ✅ Ajout de plusieurs courses (3 courses)
- ✅ Ajout d'une course avec élévation (trail)
- ✅ Ajout d'une course vélo
- ✅ Ajout d'un triathlon

#### Delete Races (5 tests)
- ✅ Archive d'une course (soft delete)
- ✅ Archive de plusieurs courses
- ✅ Pas de suppression si `toDelete` absent
- ✅ Vérification soft delete (pas hard delete)
- ✅ Filtrage `racesToAddFiltered` (exclusion de courses)

### `advanced.test.ts` (18 tests)

#### Block Application (5 tests)
- ✅ Application partielle (2 blocs sur 3)
- ✅ Application complète si `approvedBlocks` vide
- ✅ Application partielle (1 bloc sur 4)
- ✅ Application du bloc organizer uniquement
- ✅ Application du bloc races avec toAdd + toUpdate

#### User Modifications Override (12 tests)
- ✅ Override agent → user (1 course)
- ✅ Override agent → user (2 courses)
- ✅ Override `edition.startDate`
- ✅ Override `event.city`
- ✅ Override `organizer.email`
- ✅ Merge agent + user (champs différents)
- ✅ Override NEW_EVENT (nom + ville)
- ✅ Override `userModifiedRaceChanges` (racesToAdd)
- ✅ Filtrage `racesToAddFiltered`
- ✅ Combinaison `approvedBlocks` + `userModifiedChanges`
- ✅ Pas d'application si bloc non approuvé
- ✅ Merge agent + user dans blocs approuvés

#### Edge Cases (3 tests)
- ✅ Gestion `userModifiedChanges` vide (`{}`)
- ✅ Gestion `userModifiedChanges` null
- ✅ Gestion `approvedBlocks` vide + `userModifiedChanges`

---

## 🔍 Concepts Clés Testés

### 1. Block Application (`approvedBlocks`)

Permet d'appliquer partiellement une proposition :

```typescript
proposal.approvedBlocks = {
  event: true,       // ✅ Appliquer modifications Event
  edition: true,     // ✅ Appliquer modifications Edition
  organizer: false,  // ❌ Ne pas appliquer modifications Organizer
  races: false       // ❌ Ne pas appliquer modifications Races
}
```

**Cas d'usage** : L'utilisateur veut valider seulement certaines modifications proposées par l'agent.

### 2. User Modifications Override (`userModifiedChanges`)

Permet à l'utilisateur d'écraser les valeurs proposées par l'agent :

```typescript
// Agent propose
proposal.changes = {
  startDate: { old: '...', new: '2026-03-20T09:00:00.000Z' }
}

// User override
proposal.userModifiedChanges = {
  startDate: '2026-03-25T09:00:00.000Z' // ✅ Cette valeur sera appliquée
}
```

**Priorité** : `userModifiedChanges` > `changes` (agent)

### 3. Race Operations

Trois types d'opérations sur les courses :

```typescript
proposal.changes.races = {
  toUpdate: [        // Modifier courses existantes
    { raceId: 123, updates: { runDistance: { old: 10, new: 12 } } }
  ],
  toAdd: [           // Ajouter nouvelles courses
    { name: 'Semi', runDistance: 21.1 }
  ],
  toDelete: [456]    // Archiver courses (soft delete)
}
```

### 4. Soft Delete (Races)

Les courses ne sont **jamais supprimées physiquement** :

```typescript
// Avant suppression
race.archivedAt = null

// Après suppression
race.archivedAt = new Date('2025-12-01T16:00:00.000Z')

// La course existe toujours en DB
const race = await db.race.findUnique({ where: { id: raceId } })
expect(race).not.toBeNull() // ✅
expect(race.archivedAt).not.toBeNull() // ✅
```

### 5. Data Source Inference

Le `dataSource` de l'édition est automatiquement déduit :

```typescript
// Si agent = 'ffa-scraper' → dataSource = 'FEDERATION'
// Si agent = 'livetrail-scraper' → dataSource = 'TIMER'
// Sinon → dataSource = 'OTHER'
```

### 6. Region Code Mapping

Le code régional est automatiquement calculé :

```typescript
countrySubdivision: 'Bourgogne-Franche-Comté'
→ countrySubdivisionDisplayCodeLevel1: 'BFC'

countrySubdivision: 'Grand Est'
→ countrySubdivisionDisplayCodeLevel1: 'GES'
```

---

## 🔧 Configuration Requise

### Variables d'Environnement

```bash
# Base data-agents (propositions)
DATABASE_URL="postgresql://..."

# Base Miles Republic (events, editions, races)
MILES_REPUBLIC_DATABASE_URL="postgresql://..."
MILES_REPUBLIC_DATABASE_HOST="localhost"
MILES_REPUBLIC_DATABASE_PORT="5432"
MILES_REPUBLIC_DATABASE_USER="..."
MILES_REPUBLIC_DATABASE_PASSWORD="..."
MILES_REPUBLIC_DATABASE_NAME="..."
```

### Dépendances

```json
{
  "devDependencies": {
    "@jest/globals": "^29.0.0",
    "@types/jest": "^29.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0"
  }
}
```

### Configuration Jest

```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  collectCoverageFrom: [
    'packages/database/src/services/proposal-domain.service.ts',
    '!**/__tests__/**',
    '!**/node_modules/**'
  ]
}
```

---

## 📈 Couverture de Code

### Objectifs

| Métrique | Objectif | Actuel |
|----------|----------|--------|
| **Statements** | ≥ 90% | 📊 TBD |
| **Branches** | ≥ 85% | 📊 TBD |
| **Functions** | ≥ 90% | 📊 TBD |
| **Lines** | ≥ 90% | 📊 TBD |

### Générer le rapport

```bash
npm test -- --coverage apps/agents/src/__tests__/proposal-application
```

Le rapport sera généré dans `coverage/lcov-report/index.html`.

---

## 🐛 Debugging

### Tests qui échouent

1. **Vérifier les logs** :
```bash
npm test -- --verbose apps/agents/src/__tests__/proposal-application
```

2. **Isoler un test** :
```typescript
it.only('should create event with all fields', async () => {
  // Ce test sera le seul exécuté
})
```

3. **Débugger avec VSCode** :
```json
// .vscode/launch.json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Debug",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand", "new-event.test.ts"],
  "console": "integratedTerminal"
}
```

### Erreurs Courantes

#### "Client Prisma non généré"

```bash
npm run db:generate
npm run prisma:generate:all
```

#### "Cannot connect to database"

Vérifier que les variables d'environnement sont définies et que les bases existent.

#### "Tables not found"

Exécuter les migrations :

```bash
npm run db:migrate
```

---

## 🤝 Contribution

### Ajouter un Test

1. Identifier le fichier approprié :
   - `new-event.test.ts` pour NEW_EVENT
   - `edition-update.test.ts` pour EDITION_UPDATE
   - `race-operations.test.ts` pour opérations courses
   - `advanced.test.ts` pour features avancées

2. Suivre le pattern AAA (Arrange-Act-Assert) :

```typescript
it('should do something', async () => {
  // Arrange: Préparer les données
  const event = await createExistingEvent()
  const proposal = createEditionUpdateProposal(...)
  
  // Act: Exécuter l'action testée
  await proposalService.applyProposal(proposal as any, {})
  
  // Assert: Vérifier le résultat
  const updated = await testMilesRepublicDb.event.findUnique(...)
  expect(updated!.name).toBe('Expected Value')
})
```

3. Ajouter des commentaires explicatifs :

```typescript
// Given: État initial
// When: Action testée
// Then: Résultat attendu
```

4. Exécuter tous les tests :

```bash
npm test apps/agents/src/__tests__/proposal-application
```

### Conventions

- ✅ Noms de tests descriptifs : `should create event with all fields`
- ✅ Un concept par test (pas de tests multi-responsabilités)
- ✅ Isolation complète (chaque test nettoie la DB)
- ✅ Utiliser les helpers (`createExistingEvent`, etc.)
- ✅ Documenter les cas limites et edge cases

---

## 📚 Ressources

### Documentation Connexe

- **Plan de tests** : `docs/TEST-PROPOSAL-APPLICATIONS.md`
- **Service testé** : `packages/database/src/services/proposal-domain.service.ts`
- **Schéma Prisma** : `packages/database/prisma/schema.prisma`
- **Schéma Miles Republic** : `apps/agents/prisma/miles-republic.prisma`

### Références Externes

- [Jest Documentation](https://jestjs.io/)
- [Prisma Testing Guide](https://www.prisma.io/docs/guides/testing)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

---

## 🎯 Prochaines Étapes

### Amélioration Continue

- [ ] Ajouter tests de performance (temps d'exécution)
- [ ] Ajouter tests de charge (100+ propositions simultanées)
- [ ] Ajouter tests de rollback (annulation de propositions)
- [ ] Ajouter tests de concurrence (2 users modifient la même proposition)
- [ ] Intégrer dans CI/CD (GitHub Actions)

### Tests Manquants Identifiés

- [ ] Test `NEW_EVENT` avec géocodage automatique (latitude/longitude)
- [ ] Test `EDITION_UPDATE` avec changement d'organisateur
- [ ] Test application de plusieurs propositions groupées (`proposalIds[]`)
- [ ] Test gestion des erreurs (DB inaccessible, données invalides)

---

## ✅ Checklist de Validation

Avant de merger une PR modifiant `proposal-domain.service.ts` :

- [ ] Tous les tests passent (`npm test`)
- [ ] Couverture ≥ 90% maintenue
- [ ] Nouveaux tests ajoutés pour nouvelles features
- [ ] README mis à jour si nécessaire
- [ ] Tests exécutés en local ET en CI
- [ ] Pas de régression dans les tests existants
- [ ] Temps d'exécution < 30s pour la suite complète

---

**Maintenu par** : Équipe Data Agents  
**Dernière mise à jour** : 1er Décembre 2025  
**Version** : 1.0.0
