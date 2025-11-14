# Analyse d'impact : Working Proposals et Application de Propositions

**Date** : 2025-11-13  
**Statut** : Étude préliminaire  
**Objectif** : Vérifier la compatibilité du système d'application avec les changements récents (working proposals, validation par blocs)

---

## Résumé Exécutif

✅ **Bonne nouvelle** : L'architecture actuelle semble compatible avec les working proposals.  
⚠️ **Points d'attention** : Quelques zones critiques à vérifier lors de tests manuels.

---

## 1. Architecture Actuelle

### 1.1. Frontend (Dashboard)

**Hook `useProposalEditor`** :
- **Rôle** : Gestion de l'état consolidé des propositions (mode simple et groupé)
- **Structure de données** :
  ```typescript
  interface WorkingProposal {
    id: string
    originalProposal: Proposal // Proposition backend (immuable)
    
    // État proposé (SANS modifications utilisateur)
    changes: Record<string, any> // Changements proposés par l'agent
    races: Record<string, RaceData> // Courses proposées par l'agent
    
    // Modifications utilisateur (stockées séparément) ✅ CLEF
    userModifiedChanges: Record<string, any>
    userModifiedRaceChanges: Record<string, any>
    
    // Blocs validés
    approvedBlocks: Record<string, boolean>
    
    // Métadonnées
    isDirty: boolean
    lastSaved: Date | null
  }
  ```

**Fonction `calculateDiff()` (lignes 1023-1058)** :
```typescript
const calculateDiff = (working: WorkingProposal): Record<string, any> => {
  const diff: Record<string, any> = {}
  
  // 1. Modifications utilisateur uniquement ✅
  Object.assign(diff, working.userModifiedChanges)
  
  // 2. Construire raceEdits et racesToDelete
  if (working.userModifiedRaceChanges) {
    const raceEdits: Record<string, any> = {}
    Object.entries(working.userModifiedRaceChanges).forEach(([raceId, changes]) => {
      if (!changes._deleted) {
        raceEdits[raceId] = changes
      }
    })
    if (Object.keys(raceEdits).length > 0) {
      diff.raceEdits = raceEdits
    }
  }
  
  return diff
}
```

**Format sauvegardé en backend** :
```json
{
  "userModifiedChanges": {
    "startDate": "2025-11-15T09:00:00.000Z",
    "calendarStatus": "CONFIRMED",
    "raceEdits": {
      "141829": {
        "distance": "12",
        "startDate": "2025-11-15T09:00:00.000Z"
      }
    }
  }
}
```

### 1.2. Backend (API)

**Endpoint `/api/proposals/:id`** (lignes 534-670 de `proposals.ts`) :
- Reçoit les modifications via `body.userModifiedChanges`
- Stocke directement dans `Proposal.userModifiedChanges` (JSON)

**Endpoint `/api/proposals/:id/apply`** (lignes 700-783 de `proposals.ts`) :
```typescript
// 1. Récupérer la proposition
const proposal = await db.prisma.proposal.findUnique({ where: { id } })

// 2. Appliquer via DatabaseService
const applicationResult = await db.applyProposal(id, selectedChanges)
```

**Service `ProposalApplicationService.applyProposal()`** (lignes 54-112 de `ProposalApplicationService.ts`) :
- Délègue à `ProposalDomainService.applyProposal()`

**Service `ProposalDomainService.applyProposal()`** (lignes 29-120 de `proposal-domain.service.ts`) :
```typescript
// 3. Merge changes (user modifications take precedence) ✅ CRUCIAL
const finalChanges = {
  ...(proposal.changes as Record<string, any>),
  ...(proposal.userModifiedChanges ? (proposal.userModifiedChanges as Record<string, any>) : {})
}

// 4. Filter changes based on approved blocks
const filteredSelectedChanges = this.filterChangesByApprovedBlocks(selectedChanges, approvedBlocks)

// 5. Route to appropriate handler
switch (proposal.type) {
  case 'NEW_EVENT':
    result = await this.applyNewEvent(finalChanges, filteredSelectedChanges, options)
    break
  case 'EDITION_UPDATE':
    result = await this.applyEditionUpdate(proposal.editionId, finalChanges, filteredSelectedChanges, options, proposal)
    break
  // ...
}
```

---

## 2. Flux de Données : Édition → Application

### 2.1. Scénario Typique

**Étape 1 : Utilisateur édite une proposition**
```
Frontend (useProposalEditor)
  → updateField('startDate', '2025-11-15T09:00:00.000Z')
  → setWorkingProposal({ userModifiedChanges: { startDate: '...' } })
  → Autosave (debounced 2s)
  → PUT /api/proposals/:id { userModifiedChanges: { startDate: '...' } }
```

**Étape 2 : Sauvegarde backend**
```sql
UPDATE proposals 
SET "userModifiedChanges" = '{"startDate":"2025-11-15T09:00:00.000Z"}',
    "modifiedAt" = NOW()
WHERE id = 'cmhstf28403tjmu3ref0q3nbz';
```

**Étape 3 : Validation d'un bloc**
```
Frontend
  → validateBlock('edition')
  → getPayloadForBlock('edition') // Construit payload avec userModifiedChanges
  → PUT /api/proposals/:id { status: 'APPROVED', block: 'edition', userModifiedChanges: {...} }
  → POST /api/proposals/:id/apply { selectedChanges: {...} }
```

**Étape 4 : Application**
```typescript
// ProposalDomainService.applyProposal()
const finalChanges = {
  ...proposal.changes,           // ✅ Changements agent
  ...proposal.userModifiedChanges // ✅ Écrase avec modifs utilisateur
}

// → applyNewEvent() / applyEditionUpdate()
// → MilesRepublicRepository.updateEdition(editionId, finalChanges)
```

---

## 3. Points de Compatibilité ✅

### 3.1. Séparation `changes` / `userModifiedChanges`

✅ **Frontend** : `useProposalEditor` stocke les deux séparément
✅ **Backend** : `ProposalDomainService` merge correctement les deux

**Code frontend** (lignes 797-805 de `useProposalEditor.ts`) :
```typescript
const updateField = (field: string, value: any) => {
  setWorkingProposal(prev => ({
    ...prev,
    userModifiedChanges: { // ✅ Stocké séparément
      ...prev.userModifiedChanges,
      [field]: value
    },
    isDirty: true
  }))
}
```

**Code backend** (lignes 49-53 de `proposal-domain.service.ts`) :
```typescript
const finalChanges = {
  ...(proposal.changes as Record<string, any>),        // ✅ Base agent
  ...(proposal.userModifiedChanges as Record<string, any>) // ✅ Écrase avec user
}
```

### 3.2. Structure `raceEdits`

✅ **Frontend** : `calculateDiff()` construit `raceEdits` depuis `userModifiedRaceChanges`
✅ **Backend** : Les handlers d'application lisent `raceEdits`

**Format attendu par le backend** :
```json
{
  "raceEdits": {
    "141829": {
      "distance": "12",
      "startDate": "2025-11-15T09:00:00.000Z"
    }
  }
}
```

**Preuve de compatibilité** : Documentation fixes antérieurs
- `docs/FIX-USER-MODIFICATIONS-APPLICATION.md` (2025-11-10) : Fix application `raceEdits`
- `docs/FIX-BLOCK-VALIDATION-PAYLOAD.md` (2025-11-11) : Fix payload complet lors validation

### 3.3. Validation par Blocs

✅ **Frontend** : `validateBlock()` appelle `getPayloadForBlock()` avec les modifications
✅ **Backend** : `applyProposal()` filtre les changements par `approvedBlocks`

**Code frontend** (lignes 1137-1173 de `useProposalEditor.ts`) :
```typescript
const getPayloadForBlock = (blockKey: string): Record<string, any> => {
  const payload: Record<string, any> = {}
  
  // Champs du bloc depuis consolidatedChanges
  workingGroup.consolidatedChanges.forEach(c => {
    if (getBlockForField(c.field) === blockKey) {
      const value = workingGroup.userModifiedChanges[c.field] ?? c.selectedValue
      if (value !== undefined) {
        payload[c.field] = value // ✅ Inclut modifs utilisateur
      }
    }
  })
  
  // Races
  if (blockKey === 'races' && workingGroup.userModifiedRaceChanges) {
    payload.races = workingGroup.userModifiedRaceChanges // ✅
  }
  
  return payload
}
```

**Code backend** (lignes 56-63 de `proposal-domain.service.ts`) :
```typescript
// Filter changes based on approved blocks
const approvedBlocks = (proposal.approvedBlocks as Record<string, boolean>) || {}
const filteredSelectedChanges = this.filterChangesByApprovedBlocks(selectedChanges, approvedBlocks)

const removedChanges = Object.keys(selectedChanges).filter(key => !(key in filteredSelectedChanges))
if (removedChanges.length > 0) {
  this.logger.info(`Filtered out ${removedChanges.length} changes from unapproved blocks`)
}
```

---

## 4. Zones d'Attention ⚠️

### 4.1. Format `raceEdits` vs `racesToUpdate`

**Problème potentiel** : Deux structures coexistent pour les courses.

**Structure FFA Scraper** :
```json
{
  "racesToUpdate": {
    "new": [
      {
        "raceId": 141829,
        "raceName": "Semi-Marathon",
        "updates": {
          "startDate": {
            "old": "2025-11-14T23:00:00.000Z",
            "new": "2025-11-15T09:00:00.000Z",
            "confidence": 0.9
          }
        }
      }
    ]
  }
}
```

**Structure `userModifiedChanges`** :
```json
{
  "raceEdits": {
    "141829": {
      "distance": "12",
      "startDate": "2025-11-15T09:00:00.000Z"
    }
  }
}
```

**Risque** : Si le backend ne gère pas les deux structures, certaines modifications pourraient être ignorées.

**Vérification recommandée** :
- Tester l'édition d'une course proposée par FFA Scraper (`racesToUpdate`)
- Vérifier que les modifications manuelles sont bien mergées avec les updates proposées

**Code concerné** : `proposal-domain.service.ts` lignes 200+ (méthodes `applyEditionUpdate` et extraction de courses)

### 4.2. Extraction Valeurs `new` vs Valeurs Directes

**Problème potentiel** : Format inconsistant entre agents.

**Format FFA Scraper** :
```json
{
  "startDate": {
    "old": "2025-11-14T23:00:00.000Z",
    "new": "2025-11-15T09:00:00.000Z",
    "confidence": 0.9
  }
}
```

**Format `userModifiedChanges`** :
```json
{
  "startDate": "2025-11-15T09:00:00.000Z"
}
```

**Gestion actuelle** : `extractNewValue()` dans `proposal-domain.service.ts` (non visible dans le code fourni, mais probablement présent)

**Vérification recommandée** :
- Tester que `finalChanges` contient bien les valeurs "aplaties" après merge
- Vérifier que les méthodes `extractEventData()`, `extractEditionsData()`, `extractRacesData()` gèrent les deux formats

**Code concerné** : `proposal-domain.service.ts` lignes 130-200 (méthodes d'extraction)

### 4.3. Propagation Dates aux Courses

**Problème potentiel** : La propagation de dates depuis `startDate` d'édition vers les courses.

**Workflow utilisateur** :
1. Utilisateur modifie `edition.startDate`
2. Modal propose de propager aux courses
3. Frontend construit `raceEdits` avec nouvelles dates

**Risque** : Si la propagation n'est pas incluse dans `userModifiedChanges`, les dates des courses ne seront pas mises à jour.

**Vérification recommandée** :
- Tester le workflow complet de propagation de dates
- Vérifier que `userModifiedChanges.raceEdits` contient bien les nouvelles `startDate` pour chaque course

**Code concerné** : 
- Frontend : Modales de propagation de dates
- Backend : `applyEditionUpdate()` dans `proposal-domain.service.ts`

---

## 5. Tests Recommandés

### 5.1. Test 1 : Édition Simple

**Objectif** : Vérifier le flux basique édition → sauvegarde → application

**Étapes** :
1. Ouvrir une proposition EDITION_UPDATE existante
2. Modifier un champ (ex: `calendarStatus` → "CONFIRMED")
3. Vérifier l'autosave (réseau : PUT /api/proposals/:id)
4. Valider le bloc "edition"
5. Appliquer la proposition (POST /api/proposals/:id/apply)
6. Vérifier dans Miles Republic que la modification est appliquée

**Résultat attendu** : ✅ `Edition.calendarStatus = "CONFIRMED"`

### 5.2. Test 2 : Édition Course

**Objectif** : Vérifier la gestion de `raceEdits`

**Étapes** :
1. Ouvrir une proposition avec `racesToUpdate` (FFA Scraper)
2. Modifier manuellement une course proposée (ex: distance)
3. Vérifier l'autosave
4. Valider le bloc "races"
5. Appliquer la proposition
6. Vérifier dans Miles Republic que TOUTES les modifications sont appliquées (celles de l'agent + celles de l'utilisateur)

**Résultat attendu** : 
- ✅ `Race.startDate` = valeur proposée par FFA
- ✅ `Race.runDistance` = valeur modifiée par utilisateur

### 5.3. Test 3 : Validation Partielle (Blocs)

**Objectif** : Vérifier le filtrage par `approvedBlocks`

**Étapes** :
1. Ouvrir une proposition groupée (plusieurs blocs : edition, organizer, races)
2. Modifier des champs dans chaque bloc
3. Valider UNIQUEMENT le bloc "edition"
4. Appliquer la proposition
5. Vérifier dans Miles Republic que SEULES les modifications du bloc "edition" sont appliquées

**Résultat attendu** :
- ✅ `Edition.startDate` = modifié
- ❌ `Organization.name` = **NON** modifié (bloc non validé)
- ❌ `Race.distance` = **NON** modifié (bloc non validé)

### 5.4. Test 4 : Propagation Dates

**Objectif** : Vérifier le workflow complet de propagation

**Étapes** :
1. Ouvrir une proposition avec des courses
2. Modifier `startDate` de l'édition
3. Accepter la propagation dans la modal
4. Vérifier que `userModifiedChanges.raceEdits` contient les nouvelles dates
5. Valider les blocs "edition" ET "races"
6. Appliquer la proposition
7. Vérifier dans Miles Republic que toutes les courses ont la nouvelle date

**Résultat attendu** :
- ✅ `Edition.startDate` = nouvelle date
- ✅ `Race[0].startDate` = nouvelle date + offset (si applicable)
- ✅ `Race[1].startDate` = nouvelle date + offset

### 5.5. Test 5 : NEW_EVENT Complet

**Objectif** : Vérifier la création d'événement avec structure imbriquée

**Étapes** :
1. Ouvrir une proposition NEW_EVENT (FFA Scraper)
2. Modifier des champs (`edition.startDate`, course distances, etc.)
3. Valider tous les blocs
4. Appliquer la proposition
5. Vérifier dans Miles Republic que :
   - L'événement est créé
   - L'édition est créée
   - Les courses sont créées avec les bonnes valeurs

**Résultat attendu** :
- ✅ `Event.name` = valeur proposée
- ✅ `Edition.startDate` = valeur modifiée par utilisateur
- ✅ `Race[0].runDistance` = valeur modifiée par utilisateur

---

## 6. Code à Examiner en Détail

### 6.1. Extraction de Données (Backend)

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`

**Fonctions critiques** :
- `extractEventData(changes)` (ligne ~130)
- `extractEditionsData(changes)` (ligne ~150)
- `extractRacesData(changes)` (ligne ~170)
- `extractNewValue(value)` (probablement présent, non visible dans le code fourni)

**Vérifications** :
- Ces fonctions gèrent-elles les valeurs "aplaties" depuis `finalChanges` ?
- Gèrent-elles à la fois `{ new: value }` et `value` directement ?
- Gèrent-elles `raceEdits` en plus de `racesToUpdate` ?

### 6.2. Merge Changes (Backend)

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`

**Code critique** (lignes 49-53) :
```typescript
const finalChanges = {
  ...(proposal.changes as Record<string, any>),
  ...(proposal.userModifiedChanges as Record<string, any>)
}
```

**Question** : Y a-t-il un merge profond (deep merge) ou superficiel (shallow merge) ?

**Exemple problématique** :
```json
proposal.changes = {
  "edition": {
    "new": {
      "startDate": "2025-11-14T09:00:00.000Z",
      "endDate": "2025-11-14T18:00:00.000Z"
    }
  }
}

proposal.userModifiedChanges = {
  "startDate": "2025-11-15T09:00:00.000Z"
}

// Shallow merge : ❌ edition.new perdu
finalChanges = {
  "edition": { "new": { ... } }, // Écrasé ?
  "startDate": "2025-11-15T09:00:00.000Z"
}

// Deep merge : ✅ Fusion correcte
finalChanges = {
  "edition": { "new": { "startDate": "2025-11-15...", "endDate": "2025-11-14..." } }
}
```

**Vérification recommandée** : Tracer `finalChanges` dans les logs lors de l'application.

### 6.3. Construction Payload (Frontend)

**Fichier** : `apps/dashboard/src/hooks/useProposalEditor.ts`

**Code critique** (lignes 1137-1173) :
```typescript
const getPayloadForBlock = (blockKey: string): Record<string, any> => {
  const payload: Record<string, any> = {}
  
  workingGroup.consolidatedChanges.forEach(c => {
    if (getBlockForField(c.field) === blockKey) {
      const value = workingGroup.userModifiedChanges[c.field] ?? c.selectedValue
      if (value !== undefined) {
        payload[c.field] = value
      }
    }
  })
  
  if (blockKey === 'races' && workingGroup.userModifiedRaceChanges) {
    payload.races = workingGroup.userModifiedRaceChanges
  }
  
  return payload
}
```

**Vérifications** :
- `c.selectedValue` contient-il les valeurs proposées par l'agent ?
- Fallback `??` garantit-il que les valeurs proposées sont incluses même sans modif utilisateur ?

---

## 7. Recommandations

### 7.1. Immédiat (Avant tout test)

1. **Ajouter des logs détaillés** dans `proposal-domain.service.ts` :
   ```typescript
   this.logger.debug('finalChanges after merge', finalChanges)
   this.logger.debug('filteredSelectedChanges', filteredSelectedChanges)
   ```

2. **Créer un script de test automatisé** pour simuler le workflow complet :
   ```bash
   npm run test:proposal-application
   ```

3. **Documenter les cas limites** (edge cases) :
   - Proposition avec `racesToUpdate` ET `raceEdits`
   - Proposition avec structure imbriquée `edition.new.races`
   - Proposition avec blocs partiellement validés

### 7.2. Court Terme (Post-tests manuels)

1. **Ajouter des tests unitaires** pour les fonctions d'extraction :
   ```typescript
   describe('extractRacesData', () => {
     it('should merge racesToUpdate with raceEdits', () => {
       const changes = {
         racesToUpdate: { new: [{ raceId: 123, updates: { ... } }] },
         raceEdits: { '123': { distance: 12 } }
       }
       const result = extractRacesData(changes)
       expect(result).toContainEqual({ raceId: 123, distance: 12, ... })
     })
   })
   ```

2. **Créer un guide de dépannage** :
   - Symptôme : "Modifications utilisateur non appliquées"
   - Diagnostic : Vérifier `proposal.userModifiedChanges` en DB
   - Solution : Re-sauvegarder depuis l'interface

3. **Améliorer les messages d'erreur** :
   - Afficher quels champs ont été filtrés par `approvedBlocks`
   - Afficher le payload exact envoyé à Miles Republic

### 7.3. Moyen Terme (Améliorations architecture)

1. **Centraliser la logique de merge** :
   ```typescript
   // Créer un service dédié
   class ChangeMerger {
     merge(agentChanges: any, userChanges: any): any {
       // Deep merge intelligent
     }
   }
   ```

2. **Typage strict des structures** :
   ```typescript
   // Définir des types pour les changements
   type ProposedChange<T> = {
     old: T
     new: T
     confidence: number
   }
   
   type UserModification<T> = T
   ```

3. **Validation schéma avant application** :
   ```typescript
   // Valider que finalChanges respecte le schéma Miles Republic
   const schema = await getSchemaForProposalType(proposal.type)
   validateChangesAgainstSchema(finalChanges, schema)
   ```

---

## 8. Conclusion

### 8.1. Synthèse

✅ **Points forts** :
- Architecture modulaire et séparation des responsabilités
- Merge explicite des modifications utilisateur (ligne 49-53 de `proposal-domain.service.ts`)
- Validation par blocs déjà implémentée
- Autosave et état consolidé (working proposals)

⚠️ **Zones d'incertitude** :
- Gestion de structures imbriquées (`edition.new.races`)
- Merge entre `racesToUpdate` et `raceEdits`
- Deep vs shallow merge dans `finalChanges`

❌ **Manques identifiés** :
- Logs insuffisants pour déboguer les applications
- Aucun test automatisé du workflow complet
- Documentation incomplète sur les structures de données

### 8.2. Verdict

**Le système DEVRAIT fonctionner** avec les working proposals, car :
1. Le merge `changes + userModifiedChanges` est explicite
2. Le filtrage par `approvedBlocks` est implémenté
3. Les fixes antérieurs (`FIX-USER-MODIFICATIONS-APPLICATION.md`) prouvent que le pattern fonctionne

**MAIS des tests manuels sont INDISPENSABLES** pour confirmer :
1. Que les structures imbriquées sont bien "aplaties"
2. Que `raceEdits` est mergé avec `racesToUpdate`
3. Que la propagation de dates fonctionne

### 8.3. Plan d'Action

**Priorité 1 (P1)** - Tests manuels :
- [ ] Test 2 : Édition Course (`raceEdits`)
- [ ] Test 3 : Validation Partielle (Blocs)
- [ ] Test 4 : Propagation Dates

**Priorité 2 (P2)** - Logs et monitoring :
- [ ] Ajouter logs détaillés dans `proposal-domain.service.ts`
- [ ] Créer un endpoint `/api/proposals/:id/preview-application` (dry run)

**Priorité 3 (P3)** - Documentation :
- [ ] Documenter le format exact de `userModifiedChanges`
- [ ] Créer un guide "Workflow Application de Propositions"
- [ ] Schéma visuel du flux de données

**Priorité 4 (P4)** - Améliorations :
- [ ] Tests unitaires pour extraction de données
- [ ] Validation schéma avant application
- [ ] Service centralisé de merge

---

## Annexes

### A. Structure `Proposal` (Schéma Prisma)

```prisma
model Proposal {
  id            String                @id @default(cuid())
  agentId       String
  type          ProposalType
  status        ProposalStatus        @default(PENDING)
  eventId       String?
  editionId     String?
  raceId        String?
  changes       Json                  // ✅ Changements proposés par l'agent
  justification Json
  confidence    Float?
  
  // Modifications utilisateur ✅ CRUCIAL
  userModifiedChanges Json?
  modificationReason  String?
  modifiedBy          String?
  modifiedAt          DateTime?
  
  // Approbations par bloc ✅
  approvedBlocks      Json?                 @default("{}")
  
  // Champs de contexte
  eventName     String?
  eventCity     String?
  editionYear   Int?
  raceName      String?
  
  createdAt     DateTime              @default(now())
  updatedAt     DateTime              @updatedAt
  reviewedAt    DateTime?
  reviewedBy    String?
  appliedBy     String?
  
  agent         Agent                 @relation(...)
  applications  ProposalApplication[]

  @@map("proposals")
}
```

### B. Exemples Réels de Propositions

**Exemple 1 : EDITION_UPDATE avec `racesToUpdate`**
```json
{
  "id": "cmhstf28403tjmu3ref0q3nbz",
  "type": "EDITION_UPDATE",
  "changes": {
    "startDate": {
      "old": "2025-11-14T23:00:00.000Z",
      "new": "2025-11-15T09:00:00.000Z",
      "confidence": 0.9
    },
    "racesToUpdate": {
      "new": [
        {
          "raceId": 141829,
          "raceName": "Semi-Marathon",
          "updates": {
            "startDate": {
              "old": "2025-11-14T23:00:00.000Z",
              "new": "2025-11-15T09:00:00.000Z",
              "confidence": 0.9
            }
          }
        }
      ],
      "confidence": 0.9
    }
  },
  "userModifiedChanges": {
    "startDate": "2025-11-16T10:00:00.000Z",
    "raceEdits": {
      "141829": {
        "distance": "12"
      }
    }
  },
  "approvedBlocks": {
    "edition": true,
    "races": false
  }
}
```

**Résultat attendu après application** :
```typescript
// finalChanges (après merge) :
{
  startDate: "2025-11-16T10:00:00.000Z", // ✅ User override
  racesToUpdate: { ... },                 // ✅ Agent
  raceEdits: { "141829": { distance: "12" } } // ✅ User
}

// Filtrage par approvedBlocks (block "races" non validé) :
{
  startDate: "2025-11-16T10:00:00.000Z" // ✅ Seul champ du bloc "edition"
}

// Application Miles Republic :
await milesRepo.updateEdition(editionId, {
  startDate: "2025-11-16T10:00:00.000Z"
})
// ✅ Courses NON modifiées (bloc non validé)
```

**Exemple 2 : NEW_EVENT avec structure imbriquée**
```json
{
  "id": "cm456xyz",
  "type": "NEW_EVENT",
  "changes": {
    "name": {
      "new": "Semi-Marathon du Grand Nancy",
      "confidence": 0.95
    },
    "edition": {
      "new": {
        "year": "2026",
        "startDate": "2026-03-29T09:00:00.000Z",
        "races": [
          {
            "name": "1/2 Marathon",
            "runDistance": 21.1,
            "startDate": "2026-03-29T09:00:00.000Z"
          }
        ]
      },
      "confidence": 0.95
    }
  },
  "userModifiedChanges": {
    "startDate": "2026-03-29T10:00:00.000Z"
  }
}
```

**Question critique** : Comment `finalChanges` gère-t-il cette structure imbriquée ?

**Option A (shallow merge)** :
```typescript
finalChanges = {
  name: { new: "...", confidence: 0.95 },
  edition: { new: { ... } }, // ✅ Préservé
  startDate: "2026-03-29T10:00:00.000Z" // ✅ Ajouté
}
// ⚠️ startDate à la racine, edition imbriquée → Incohérent
```

**Option B (flattening intelligent)** :
```typescript
finalChanges = {
  name: "Semi-Marathon du Grand Nancy",
  startDate: "2026-03-29T10:00:00.000Z", // ✅ User override
  year: "2026",
  races: [{ name: "1/2 Marathon", ... }]
}
// ✅ Cohérent, mais nécessite une fonction d'aplatissement
```

**TODO** : Vérifier quelle option est implémentée !

---

**Dernière mise à jour** : 2025-11-13
