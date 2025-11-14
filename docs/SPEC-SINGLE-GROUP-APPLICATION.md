# Spécification : Application unique pour propositions groupées

**Date** : 2025-11-14  
**Statut** : 🔴 CRITIQUE - Incohérence conceptuelle  
**Priorité** : Haute

## Problème actuel

Lors de la validation par blocs d'une proposition groupée, **N `ProposalApplication`** sont créées (une par proposition individuelle) au lieu d'**une seule application consolidée** pour tout le groupe.

### Symptômes

```typescript
// Validation du bloc "edition" avec 3 propositions (3 agents)
validateBlock('edition', ['cm123', 'cm456', 'cm789'])

// ❌ Résultat actuel : 3 ProposalApplications créées
ProposalApplication {
  id: 'app1',
  proposalId: 'cm123', // Agent A
  changes: { startDate: '2025-11-14T09:00:00Z' } // Seulement les changements de A
}
ProposalApplication {
  id: 'app2',
  proposalId: 'cm456', // Agent B
  changes: { startDate: '2025-11-14T09:00:00Z', city: 'Dijon' } // Seulement les changements de B
}
ProposalApplication {
  id: 'app3',
  proposalId: 'cm789', // Agent C
  changes: { startDate: '2025-11-14T09:00:00Z', distance: 21.1 } // Seulement les changements de C
}
```

### Conséquences

1. **Perte de consolidation** : Les modifications utilisateur ne sont pas propagées à toutes les propositions
   - L'utilisateur modifie `city: 'Dijon'` dans l'interface
   - Cette modification est stockée dans `workingGroup.userModifiedChanges`
   - Mais seule la proposition de l'agent B l'appliquera ❌

2. **Applications conflictuelles** : Risque d'écraser mutuellement les données
   - 3 applications distinctes essayent de modifier la même édition
   - Ordre d'application indéterminé
   - Résultat final imprévisible

3. **Incohérence UI** : L'utilisateur voit une interface unique mais N opérations backend
   - Dashboard : Une seule vue consolidée
   - Backend : N applications distinctes
   - Conceptuellement incorrect

4. **Inefficacité** : N requêtes DB au lieu d'une seule

## Architecture cible

### Principe fondamental

> **Une proposition groupée = Une application consolidée**

```typescript
// ✅ Résultat attendu : 1 ProposalApplication pour tout le groupe
ProposalApplication {
  id: 'app-group-1',
  proposalIds: ['cm123', 'cm456', 'cm789'], // ✅ Toutes les propositions
  changes: { // ✅ Changements consolidés
    startDate: '2025-11-14T09:00:00Z',  // Sélectionné depuis workingGroup.consolidatedChanges
    city: 'Dijon',                      // Modifié par l'utilisateur
    distance: 21.1                      // Sélectionné depuis consolidation
  },
  status: 'PENDING'
}
```

### Flux de données

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend : GroupedProposalDetailBase                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  useProposalEditor (mode groupé)                            │
│  ├─ workingGroup.consolidatedChanges                        │
│  │  └─ { field: 'startDate', selectedValue: '2025-11-14' } │
│  ├─ workingGroup.userModifiedChanges                        │
│  │  └─ { city: 'Dijon' }                                    │
│  └─ workingGroup.originalProposals                          │
│     └─ [Proposal A, Proposal B, Proposal C]                │
│                                                             │
│  validateBlock('edition', ['cm123', 'cm456', 'cm789'])      │
│  └─ Construit payload consolidé                             │
│     └─ Envoie à POST /api/proposals/validate-block-group   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend : POST /api/proposals/validate-block-group          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Créer UNE ProposalApplication                           │
│     ├─ proposalIds: ['cm123', 'cm456', 'cm789']             │
│     └─ changes: { startDate, city, distance }               │
│                                                             │
│  2. Marquer TOUTES les propositions comme APPROVED          │
│     └─ UPDATE proposals SET status = 'APPROVED'             │
│        WHERE id IN ('cm123', 'cm456', 'cm789')              │
│                                                             │
│  3. Enregistrer le bloc validé dans chaque proposition      │
│     └─ UPDATE proposals SET approvedBlocks = { edition: true } │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Application : applyProposal()                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Récupérer ProposalApplication par proposalIds           │
│  2. Appliquer changements consolidés UNE SEULE FOIS         │
│  3. Marquer toutes les propositions comme APPLIED           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Modifications requises

### 1. Schéma Prisma

**Fichier** : `packages/database/prisma/schema.prisma`

```prisma
model ProposalApplication {
  id            String   @id @default(cuid())
  
  // ❌ AVANT : Une seule proposition
  proposalId    String?  // ✅ Rendre optionnel pour rétrocompatibilité
  proposal      Proposal? @relation(fields: [proposalId], references: [id])
  
  // ✅ NOUVEAU : Support des propositions groupées
  proposalIds   String[] // Liste des propositions du groupe
  
  status        String   // PENDING | APPLIED | FAILED
  scheduledAt   DateTime?
  appliedAt     DateTime?
  errorMessage  String?
  appliedChanges Json?   // ✅ Changements consolidés appliqués
  rollbackData  Json?
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model Proposal {
  id                     String   @id @default(cuid())
  // ...
  applications           ProposalApplication[] // ✅ Relation inverse
  // ...
}
```

**Migration** :
```sql
-- Ajouter le champ proposalIds
ALTER TABLE "ProposalApplication" ADD COLUMN "proposalIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Rendre proposalId nullable
ALTER TABLE "ProposalApplication" ALTER COLUMN "proposalId" DROP NOT NULL;

-- Migrer les données existantes
UPDATE "ProposalApplication" 
SET "proposalIds" = ARRAY["proposalId"]::TEXT[]
WHERE "proposalId" IS NOT NULL;
```

### 2. Backend - Nouvel endpoint

**Fichier** : `apps/api/src/routes/proposals.ts`

```typescript
/**
 * POST /api/proposals/validate-block-group
 * Valider un bloc pour un groupe de propositions consolidées
 * 
 * Body:
 * {
 *   proposalIds: string[]       // IDs des propositions du groupe
 *   consolidatedChanges: object // Changements consolidés depuis workingGroup
 *   blockKey: string            // 'event' | 'edition' | 'organizer' | 'races'
 *   userModifiedChanges: object // Modifications utilisateur
 * }
 */
router.post('/validate-block-group', requireAuth, [
  body('proposalIds').isArray().notEmpty(),
  body('consolidatedChanges').isObject(),
  body('blockKey').isString().notEmpty(),
  body('userModifiedChanges').optional().isObject(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { proposalIds, consolidatedChanges, blockKey, userModifiedChanges } = req.body
  const userId = req.user!.userId
  
  // Vérifier que toutes les propositions existent
  const proposals = await db.prisma.proposal.findMany({
    where: { id: { in: proposalIds } }
  })
  
  if (proposals.length !== proposalIds.length) {
    throw createError(404, 'Some proposals not found', 'PROPOSALS_NOT_FOUND')
  }
  
  // Vérifier qu'elles ciblent la même entité (eventId-editionId)
  const firstProposal = proposals[0]
  const sameTarget = proposals.every(p => 
    p.eventId === firstProposal.eventId && 
    p.editionId === firstProposal.editionId
  )
  
  if (!sameTarget) {
    throw createError(400, 'Proposals must target the same entity', 'DIFFERENT_TARGETS')
  }
  
  // ✅ Créer UNE SEULE ProposalApplication pour tout le groupe
  const application = await db.prisma.proposalApplication.create({
    data: {
      proposalIds,
      status: 'PENDING',
      appliedChanges: {
        consolidatedChanges,
        userModifiedChanges: userModifiedChanges || {},
        blockKey
      }
    }
  })
  
  // ✅ Marquer toutes les propositions comme APPROVED
  await db.prisma.proposal.updateMany({
    where: { id: { in: proposalIds } },
    data: {
      status: 'APPROVED',
      reviewedAt: new Date(),
      reviewedBy: userId,
      approvedBlocks: {
        // Merge avec les blocs déjà approuvés
        [blockKey]: true
      }
    }
  })
  
  // Logger
  await db.createLog({
    agentId: firstProposal.agentId,
    level: 'INFO',
    message: `Block "${blockKey}" validated for ${proposalIds.length} grouped proposals`,
    data: {
      proposalIds,
      applicationId: application.id,
      blockKey,
      consolidatedChanges
    }
  })
  
  res.json({
    success: true,
    data: {
      application,
      approvedProposals: proposalIds.length
    },
    message: `Block "${blockKey}" validated successfully for ${proposalIds.length} proposals`
  })
}))
```

### 3. Frontend - Hook useBlockValidation

**Fichier** : `apps/dashboard/src/hooks/useBlockValidation.ts`

```typescript
import { useProposalEditor } from './useProposalEditor'

export function useBlockValidation(
  proposals: Proposal[],
  // ✅ NOUVEAU : Passer le workingGroup pour accéder aux changements consolidés
  workingGroup?: WorkingProposalGroup
) {
  // ...
  
  const validateBlock = useCallback(async (blockKey: string, proposalIds: string[]) => {
    try {
      if (!workingGroup) {
        throw new Error('workingGroup is required for grouped proposal validation')
      }
      
      // ✅ Construire payload consolidé depuis workingGroup
      const consolidatedChanges: Record<string, any> = {}
      
      // 1. Ajouter les valeurs sélectionnées depuis consolidatedChanges
      workingGroup.consolidatedChanges.forEach(change => {
        if (change.selectedValue !== undefined && isFieldInBlock(change.field, blockKey)) {
          consolidatedChanges[change.field] = change.selectedValue
        }
      })
      
      // 2. Ajouter les modifications utilisateur
      Object.entries(workingGroup.userModifiedChanges).forEach(([field, value]) => {
        if (isFieldInBlock(field, blockKey)) {
          consolidatedChanges[field] = value
        }
      })
      
      // 3. Ajouter les courses si bloc "races"
      if (blockKey === 'races') {
        consolidatedChanges.races = workingGroup.consolidatedRaces.map(race => ({
          ...race,
          ...workingGroup.userModifiedRaceChanges[race.id]
        }))
      }
      
      console.log(`✅ [useBlockValidation] Validation bloc groupé "${blockKey}":`, {
        proposalIds,
        consolidatedChanges
      })
      
      // ✅ Appeler le nouvel endpoint groupé
      await api.validateBlockGroup({
        proposalIds,
        consolidatedChanges,
        blockKey,
        userModifiedChanges: workingGroup.userModifiedChanges
      })
      
      // Marquer le bloc comme validé
      setBlockStatus(prev => ({
        ...prev,
        [blockKey]: {
          isValidated: true,
          proposalIds
        }
      }))
    } catch (error) {
      console.error(`Error validating block ${blockKey}:`, error)
      throw error
    }
  }, [workingGroup])
  
  // ...
}
```

### 4. Frontend - Service API

**Fichier** : `apps/dashboard/src/services/api.ts`

```typescript
export const proposalsApi = {
  // ...
  
  /**
   * Valider un bloc pour un groupe de propositions
   */
  validateBlockGroup: async (params: {
    proposalIds: string[]
    consolidatedChanges: Record<string, any>
    blockKey: string
    userModifiedChanges?: Record<string, any>
  }) => {
    const response = await fetch('/api/proposals/validate-block-group', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`
      },
      body: JSON.stringify(params)
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to validate block group')
    }
    
    return response.json()
  }
}
```

### 5. Backend - Application des propositions

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`

```typescript
async applyProposal(proposalId: string, selectedChanges: any): Promise<ApplicationResult> {
  // Vérifier si c'est une application groupée
  const application = await this.prisma.proposalApplication.findFirst({
    where: {
      OR: [
        { proposalId },
        { proposalIds: { has: proposalId } } // ✅ Chercher dans proposalIds aussi
      ]
    }
  })
  
  if (!application) {
    throw new Error('No application found for this proposal')
  }
  
  // ✅ Si application groupée, utiliser les changements consolidés
  const changesToApply = application.proposalIds.length > 1
    ? application.appliedChanges.consolidatedChanges
    : selectedChanges
  
  try {
    // Appliquer les changements UNE SEULE FOIS
    const result = await this.applyChanges(changesToApply)
    
    // ✅ Marquer TOUTES les propositions du groupe comme APPLIED
    if (application.proposalIds.length > 0) {
      await this.prisma.proposal.updateMany({
        where: { id: { in: application.proposalIds } },
        data: { status: 'APPLIED' }
      })
    } else {
      // Rétrocompatibilité : proposition unique
      await this.prisma.proposal.update({
        where: { id: application.proposalId! },
        data: { status: 'APPLIED' }
      })
    }
    
    // Marquer l'application comme appliquée
    await this.prisma.proposalApplication.update({
      where: { id: application.id },
      data: {
        status: 'APPLIED',
        appliedAt: new Date()
      }
    })
    
    return { success: true, result }
  } catch (error) {
    // ...
  }
}
```

## Plan d'implémentation

### Phase 1 : Migration du schéma ✅ (1-2h)

- [ ] Ajouter champ `proposalIds` dans `ProposalApplication`
- [ ] Rendre `proposalId` nullable
- [ ] Écrire migration Prisma
- [ ] Migrer données existantes (`proposalIds = [proposalId]`)
- [ ] Tester en local

### Phase 2 : Backend - Endpoint groupé ✅ (2-3h)

- [ ] Créer endpoint `POST /api/proposals/validate-block-group`
- [ ] Implémenter validation (même cible, propositions existantes)
- [ ] Créer application consolidée
- [ ] Marquer toutes les propositions comme APPROVED
- [ ] Tester avec Postman/Thunder Client

### Phase 3 : Frontend - Hook refactoring ✅ (2-3h)

- [ ] Modifier `useBlockValidation` pour accepter `workingGroup`
- [ ] Construire payload consolidé depuis `workingGroup`
- [ ] Appeler nouvel endpoint au lieu de l'ancien
- [ ] Mettre à jour `GroupedProposalDetailBase` pour passer `workingGroup`
- [ ] Tester en local

### Phase 4 : Backend - Application groupée ✅ (2-3h)

- [ ] Modifier `applyProposal()` pour supporter `proposalIds`
- [ ] Appliquer changements UNE SEULE FOIS
- [ ] Marquer toutes les propositions comme APPLIED
- [ ] Tester application manuelle depuis dashboard

### Phase 5 : Tests & Documentation ✅ (1-2h)

- [ ] Tests unitaires pour endpoint groupé
- [ ] Tests E2E pour workflow complet
- [ ] Documenter changements dans WARP.md
- [ ] Mettre à jour CHANGELOG

### Phase 6 : Rétrocompatibilité & Déploiement ✅ (1h)

- [ ] Vérifier que les anciennes applications (sans `proposalIds`) fonctionnent toujours
- [ ] Migration données production
- [ ] Déploiement sur Render

**Durée totale estimée** : 10-15 heures

## Tests à effectuer

### Test 1 : Validation bloc groupé

```typescript
// Scénario : 3 agents proposent la même édition
// Agent A : startDate
// Agent B : city = 'Dijon'
// Agent C : distance = 21.1
// Utilisateur : Modifie city = 'Besançon'

// ✅ Attendu :
ProposalApplication {
  proposalIds: ['cmA', 'cmB', 'cmC'],
  changes: {
    startDate: '2025-11-14T09:00:00Z', // Sélectionné
    city: 'Besançon',                   // Modifié par utilisateur
    distance: 21.1                      // Sélectionné
  }
}

// 3 propositions marquées APPROVED
// 1 seule application créée
```

### Test 2 : Application groupée

```typescript
// Scénario : Appliquer l'application groupée

// ✅ Attendu :
// - Edition mise à jour UNE SEULE FOIS avec tous les changements
// - 3 propositions marquées APPLIED
// - 1 application marquée APPLIED
```

### Test 3 : Rétrocompatibilité

```typescript
// Scénario : Ancienne proposition avec proposalId uniquement

// ✅ Attendu :
// - Application fonctionne normalement
// - Proposition marquée APPLIED
```

## Risques & Mitigation

| Risque | Impact | Mitigation |
|--------|--------|------------|
| **Migration données production** | Élevé | Tester migration sur dump production en local |
| **Applications existantes cassées** | Élevé | Garder `proposalId` nullable + logique rétrocompatible |
| **Payload consolidé incomplet** | Moyen | Logs détaillés + tests E2E exhaustifs |
| **Performance (N propositions)** | Faible | Index sur `proposalIds` (GIN) |

## Métriques de succès

- ✅ **1 application** créée pour N propositions groupées
- ✅ **100%** des modifications utilisateur préservées
- ✅ **0** conflit d'application (ordre déterministe)
- ✅ **Rétrocompatibilité** : anciennes applications fonctionnent
- ✅ **Performance** : Temps validation < 500ms pour 5 propositions

## Ressources

- `docs/proposal-state-refactor/` - Refactoring état propositions
- `docs/BLOCK-SEPARATION-SUMMARY.md` - Validation par blocs
- `WARP.md` (section Changelog) - Historique modifications
- `packages/database/prisma/schema.prisma` - Schéma actuel

---

**Prochaine étape** : Validation par l'équipe + planification sprint
