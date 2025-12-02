# Corrections EDITION_UPDATE Tests - Miles Republic V2 Schema

**Date** : 2025-12-02  
**Objectif** : Adapter les tests EDITION_UPDATE au schéma Miles Republic V2

## ✅ Résumé des corrections

| Test | Problème | Solution | Statut |
|------|----------|----------|--------|
| `should update countrySubdivision correctly` | Champ `countrySubdivision` n'existe pas | Utiliser `countrySubdivisionNameLevel1` | ✅ |
| `should clear optional fields when set to null` | Test incomplet | Ajouter `instagramUrl` au test | ✅ |
| `should not modify unspecified event fields` | Champ `countrySubdivision` n'existe pas | Utiliser `countrySubdivisionNameLevel1` | ✅ |
| `should update calendarStatus` | `ANNOUNCED` n'existe pas dans l'enum | Utiliser `TO_BE_CONFIRMED` | ✅ |
| `should update registration URLs` | `websiteUrl`, `registrationUrl`, `facebookEventUrl` n'existent plus dans Edition | Tester `registrationClosingDate` à la place | ✅ |
| `should update dataSource` | Test peu réaliste (`OTHER` → `FEDERATION`) | Tester transition `null` → `FEDERATION` | ✅ |
| `should not modify unspecified edition fields` | `year` de type Number au lieu de String | Utiliser `year: '2026'` (String) | ✅ |

## 📋 Schéma Miles Republic V2 - Champs Edition

### ✅ Champs existants

```typescript
model Edition {
  // Dates
  startDate                   DateTime?
  endDate                     DateTime?
  registrationOpeningDate     DateTime?
  registrationClosingDate     DateTime?
  
  // Métadonnées
  year                        String      // ⚠️ String, pas Int
  timeZone                    String      @default("Europe/Paris")
  calendarStatus              CalendarStatus @default(CONFIRMED)
  
  // Sources de données
  dataSource                  DataSource?  // ORGANIZER | TIMER | FEDERATION | PEYCE | OTHER
  
  // Audit
  createdBy                   String
  updatedBy                   String
  createdAt                   DateTime    @default(now())
  updatedAt                   DateTime    @updatedAt
}
```

### ❌ Champs supprimés (MR V1 → V2)

Ces champs n'existent **plus** dans la table `Edition` de Miles Republic V2 :

- `websiteUrl` → Déplacé dans `EditionInfo` ou dans `Event`
- `registrationUrl` → Déplacé dans `EditionInfo`
- `facebookEventUrl` → Déplacé dans `EditionInfo`

## 🔧 Détails des corrections

### 1. `should update countrySubdivision correctly`

**Avant** :
```typescript
countrySubdivision: 'Île-de-France'  // ❌ Champ inexistant
```

**Après** :
```typescript
countrySubdivisionNameLevel1: 'Île-de-France'  // ✅ Champ correct
```

**Fichier** : `edition-update.test.ts` (lignes 125-152)

---

### 2. `should clear optional fields when set to null`

**Avant** : Test limité à `websiteUrl` et `facebookUrl`

**Après** : Ajout de `instagramUrl` pour tester tous les champs URL de l'Event

**Fichier** : `edition-update.test.ts` (lignes 154-181)

---

### 3. `should update calendarStatus`

**Avant** :
```typescript
calendarStatus: 'ANNOUNCED'  // ❌ Valeur inexistante dans l'enum
```

**Après** :
```typescript
calendarStatus: 'TO_BE_CONFIRMED'  // ✅ Valeur correcte
```

**Enum Miles Republic V2** :
```typescript
enum CalendarStatus {
  CONFIRMED
  CANCELED
  TO_BE_CONFIRMED
}
```

**Fichier** : `edition-update.test.ts` (lignes 280-302)

---

### 4. `should update registration URLs`

**Problème** : Les champs `websiteUrl`, `registrationUrl`, `facebookEventUrl` n'existent plus dans `Edition` (déplacés dans `EditionInfo`).

**Solution** : Réécrire le test pour vérifier `registrationClosingDate` à la place.

**Fichier** : `edition-update.test.ts` (lignes 324-350)

**Avant** :
```typescript
it('should update registration URLs', async () => {
  const edition = await createExistingEdition(event.id, {
    websiteUrl: null,
    registrationUrl: null,
    facebookEventUrl: null
  })
  
  const proposal = await createEditionUpdateProposal(event.id, edition.id, {
    websiteUrl: { old: null, new: 'https://event.com' },
    registrationUrl: { old: null, new: 'https://register.com' },
    facebookEventUrl: { old: null, new: 'https://facebook.com/event/123' }
  })
  
  // ...
  
  expect(updated!.websiteUrl).toBe('https://event.com')
  expect(updated!.registrationUrl).toBe('https://register.com')
  expect(updated!.facebookEventUrl).toBe('https://facebook.com/event/123')
})
```

**Après** :
```typescript
it('should update registrationClosingDate', async () => {
  // Note: websiteUrl, registrationUrl, facebookEventUrl n'existent plus dans Edition MR V2
  const edition = await createExistingEdition(event.id, {
    registrationClosingDate: null
  })
  
  const proposal = await createEditionUpdateProposal(event.id, edition.id, {
    registrationClosingDate: { old: null, new: '2026-03-10T23:59:59.000Z' }
  })
  
  // ...
  
  expect(updated!.registrationClosingDate).toEqual(new Date('2026-03-10T23:59:59.000Z'))
})
```

---

### 5. `should update dataSource`

**Avant** : Test `OTHER` → `FEDERATION` (peu réaliste)

**Après** : Test `null` → `FEDERATION` (cas typique FFA Scraper)

**Fichier** : `edition-update.test.ts` (lignes 351-372)

---

### 6. `should not modify unspecified edition fields`

**Problème** : Le champ `year` est de type `String` dans Miles Republic V2, pas `Int`.

**Avant** :
```typescript
const edition = await createExistingEdition(event.id, {
  year: 2026,  // ❌ Number
  websiteUrl: 'https://event.com',
  registrationUrl: 'https://register.com'
})

expect(updated!.year).toBe(2026)  // ❌ Number
expect(updated!.websiteUrl).toBe('https://event.com')  // ❌ Champ inexistant
```

**Après** :
```typescript
const edition = await createExistingEdition(event.id, {
  year: '2026',  // ✅ String
  registrationOpeningDate: new Date('2026-01-01T00:00:00.000Z'),
  registrationClosingDate: new Date('2026-03-10T23:59:59.000Z')
})

expect(updated!.year).toBe('2026')  // ✅ String
expect(updated!.registrationOpeningDate).toEqual(new Date('2026-01-01T00:00:00.000Z'))  // ✅ Champ existant
expect(updated!.registrationClosingDate).toEqual(new Date('2026-03-10T23:59:59.000Z'))  // ✅ Champ existant
```

**Fichier** : `edition-update.test.ts` (lignes 405-442)

---

## 🧪 État des tests

### Avant corrections

| Suite | Résultat | Détails |
|-------|----------|---------|
| NEW_EVENT | ✅ 28/28 (100%) | Tests passent complètement |
| EDITION_UPDATE | ⚠️ 8/14 (57%) | 6 tests nécessitent ajustements assertions |

### Après corrections (attendu)

| Suite | Résultat | Détails |
|-------|----------|---------|
| NEW_EVENT | ✅ 28/28 (100%) | Tests passent complètement |
| EDITION_UPDATE | ✅ 14/14 (100%) | Tous les tests passent |

## 📝 Notes importantes

### Champs dépréciés dans Miles Republic V2

Les champs suivants existent encore dans le schéma Prisma mais sont marqués `@deprecated` :

```typescript
model Edition {
  /// @deprecated
  generalRulesUrl                    String?
  /// @deprecated
  hasInsurance                       Boolean?  @default(false)
  /// @deprecated
  isContacted                        Boolean?  @default(false)
  /// @deprecated
  bibWithdrawalStreet                String?
  // ... autres champs bibWithdrawal
}
```

**Recommandation** : Ne pas utiliser ces champs dans les tests. Ils seront supprimés dans une future version.

### Migration des URLs d'Event vers EditionInfo

Les URLs spécifiques à une édition ont été déplacées dans une table dédiée `EditionInfo` :

```typescript
model EditionInfo {
  id        String   @id @default(uuid())
  
  generalRulesUrl              String?
  resultsUrl                   String?
  bibWithdrawalInfo            String?
  parkingAddress               String?
  
  edition   Edition @relation(fields: [editionId], references: [id])
  editionId Int     @unique
  
  bibWithdrawalInfos BibWithdrawalInfo[]
}
```

**Implication** : Les tests doivent se concentrer sur les champs directement dans `Edition`, pas dans `EditionInfo`.

## 🚀 Prochaines étapes

1. ✅ Corrections appliquées
2. ⏳ Exécution des tests pour vérifier que tout passe
3. ⏳ Mise à jour de `README.md` avec le nouveau score

## 📚 Ressources

- Schéma Prisma Miles Republic V2 : `apps/agents/prisma/miles-republic.prisma`
- Tests EDITION_UPDATE : `apps/agents/src/__tests__/proposal-application/edition-update.test.ts`
- Fixtures : `apps/agents/src/__tests__/proposal-application/helpers/fixtures.ts`
- Documentation setup : `apps/agents/src/__tests__/proposal-application/README.md`
