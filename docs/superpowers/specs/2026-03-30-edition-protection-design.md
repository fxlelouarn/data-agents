# Edition Protection — Design Spec

**Date**: 2026-03-30
**Problème**: Les agents (auto-validator, auto-apply scheduler) modifient des éditions protégées dans Miles Republic — events featured, clients actifs, inscriptions ouvertes — sans aucun garde-fou.

## Contexte

### Impact constaté

- **82 events featured** touchés, **232 propositions approuvées**, **291 applications appliquées**
- **37 éditions 2026 LIVE** modifiées (dates, organisateurs, courses ajoutées/supprimées)
- **31 éditions** avec inscriptions ouvertes au moment de l'analyse
- 96% des modifications viennent de l'auto-validator-agent
- 5 courses archivées par les agents (0 attendees perdus heureusement)

### Cause racine

| Entry point | Vérifie isFeatured? | Vérifie customerType? | Vérifie dates? | Vérifie attendees? |
|---|---|---|---|---|
| AutoValidatorAgent | ✅ (partiel) | ✅ (partiel) | ❌ | ❌ |
| Auto-apply scheduler | ❌ | ❌ | ❌ | ❌ |
| Manual apply (API) | ❌ | ❌ | ❌ | ❌ |
| Update apply (API) | ❌ | ❌ | ❌ | ❌ |
| ProposalDomainService | ❌ | ❌ | ❌ | ❌ |

L'AutoValidatorAgent vérifie `isFeatured` et `customerType` mais uniquement au moment de la validation. Le scheduler et les routes d'application n'ont aucun check.

## Design

### Critères de protection

Une édition est **protégée** si elle remplit les conditions de base ET au moins un critère métier :

**Conditions de base (toutes requises)** :
- `edition.status = 'LIVE'`
- `edition.endDate >= NOW()` ou `edition.endDate IS NULL`

**Critères métier (au moins un)** :
- `event.isFeatured = true`
- `edition.customerType IS NOT NULL` (BASIC, PREMIUM, ESSENTIAL, LEAD_INT, LEAD_EXT, MEDIA)

**Info contextuelle (affichée dans le banner, pas un critère de protection)** :
- Inscriptions ouvertes : `registrationOpeningDate <= NOW() AND (registrationClosingDate IS NULL OR registrationClosingDate > NOW())`
- Au moins 1 attendee sur une course de l'édition

### EditionProtectionService

Nouveau service dans `packages/database/src/services/edition-protection.service.ts`.

```typescript
interface ProtectionResult {
  protected: boolean
  reasons: string[]
  // Exemples de reasons :
  // 'isFeatured'
  // 'customerType:PREMIUM'
  // 'registrationOpen'
  // 'hasAttendees:42' (nombre total)
}

class EditionProtectionService {
  constructor(private milesDb: PrismaClient) {}

  /**
   * Check si une édition est protégée.
   * Requête unique avec jointures Edition → Event + Race → Attendees count.
   */
  async isEditionProtected(editionId: number): Promise<ProtectionResult>

  /**
   * Check batch pour éviter N requêtes (utilisé par auto-validator et scheduler).
   * Retourne uniquement les éditions protégées.
   */
  async getProtectedEditionIds(editionIds: number[]): Promise<Map<number, ProtectionResult>>
}
```

**Implémentation de la requête** : une seule query SQL avec :
- JOIN `Event` pour `isFeatured`
- `edition.customerType`, `registrationOpeningDate`, `registrationClosingDate`, `status`, `endDate`
- Sous-query `EXISTS` sur `Attendees` via `Race.editionId` pour le count

### Points d'intégration

#### 1. AutoValidatorAgent

**Fichier** : `apps/agents/src/AutoValidatorAgent.ts`

Remplacer le check maison `isFeatured` + `customerType` dans `getEligibleEditionIds()` par un appel à `getProtectedEditionIds()`. Les éditions protégées sont exclues avec log du motif.

#### 2. Auto-apply scheduler

**Fichier** : `apps/api/src/services/update-auto-apply-scheduler.ts`

Avant d'appliquer les ProposalApplications PENDING :
1. Collecter tous les `editionId` distincts des propositions à appliquer
2. Appeler `getProtectedEditionIds()` en batch
3. Skip les applications sur éditions protégées **sauf** si la proposition a `forceProtectedEdition: true` dans `userModifiedChanges`
4. Les applications skippées restent en PENDING avec un log

#### 3. ProposalDomainService (filet de sécurité)

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`

Dans `applyProposal()`, avant d'écrire dans Miles Republic :
- Appeler `isEditionProtected(editionId)`
- Si protégée ET pas de `forceProtectedEdition` dans la proposition → throw `EditionProtectedError`
- Dernier rempart si un entry point oublie le check

#### 4. Dashboard — Banner d'avertissement

**Comportement** :
1. Au chargement d'une proposition dans le dashboard, appel API pour vérifier la protection de l'édition
2. Si protégée → banner warning permanent en haut du formulaire avec les raisons en langage clair :
   - "Événement featured"
   - "Client ESSENTIAL"
   - "42 inscrits sur les courses"
   - "Inscriptions ouvertes jusqu'au 15/04/2026"
3. L'utilisateur peut continuer à éditer et valider malgré le warning
4. À la validation (approve/validate-block), le flag `forceProtectedEdition: true` est stocké dans `userModifiedChanges` de la proposition

**Composant** : nouveau composant `EditionProtectionBanner` utilisé dans les pages de détail de propositions.

#### 5. Nouvel endpoint API

```
GET /api/editions/:id/protection-status
```

Retourne `ProtectionResult`. Utilisé par le frontend pour afficher le banner.

#### 6. Auto-archivage

Pas de changement. L'auto-archivage continue à archiver les autres propositions PENDING du même groupe quand une proposition est validée.

### Flow complet

```
Proposition créée par un agent
    ↓
AutoValidatorAgent
    → isEditionProtected? → OUI → skip (log motif)
    → NON → valide, crée ProposalApplication PENDING
    ↓
Auto-apply scheduler
    → isEditionProtected? → OUI, pas de force → skip (reste PENDING)
    → NON ou force → applique
    ↓
ProposalDomainService (filet de sécurité)
    → isEditionProtected? → OUI, pas de force → throw EditionProtectedError
    → NON ou force → écrit dans Miles Republic

---

Proposition manuelle (dashboard)
    ↓
Chargement dans le dashboard
    → GET /api/editions/:id/protection-status
    → Si protégée → banner warning avec raisons
    ↓
Utilisateur valide la proposition
    → forceProtectedEdition: true stocké dans userModifiedChanges
    → ProposalApplication PENDING créée
    ↓
Auto-apply scheduler / apply manuel
    → force présent → applique normalement
```

### Fichiers impactés

| Fichier | Modification |
|---|---|
| `packages/database/src/services/edition-protection.service.ts` | **Nouveau** — EditionProtectionService |
| `packages/database/src/index.ts` | Export du nouveau service |
| `apps/agents/src/AutoValidatorAgent.ts` | Remplacer checks maison par EditionProtectionService |
| `apps/api/src/services/update-auto-apply-scheduler.ts` | Ajouter check protection avant apply |
| `packages/database/src/services/proposal-domain.service.ts` | Filet de sécurité avant écriture MR |
| `apps/api/src/routes/editions.ts` ou `proposals.ts` | Nouvel endpoint protection-status |
| `apps/dashboard/src/components/EditionProtectionBanner.tsx` | **Nouveau** — composant banner warning |
| `apps/dashboard/src/pages/proposals/detail/base/ProposalDetailBase.tsx` | Intégration banner |
| `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx` | Intégration banner |
| `apps/dashboard/src/hooks/useProposalEditor.ts` | Stocker forceProtectedEdition à la validation |
