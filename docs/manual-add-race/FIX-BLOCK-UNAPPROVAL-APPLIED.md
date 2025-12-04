# Fix: Empêcher l'annulation des blocs déjà appliqués

**Date** : 2025-12-04
**Branche** : `manual-add-race`
**Statut** : ✅ Implémenté

## Problème

Lorsqu'un bloc de proposition était validé **ET** appliqué en base de données (status `APPLIED`), l'utilisateur pouvait toujours cliquer sur "Annuler" pour tenter d'annuler la validation. Cela causait une erreur car les changements étaient déjà persistés en base.

### Comportement avant

| État du bloc | Bouton affiché | Résultat au clic |
|--------------|----------------|------------------|
| Non validé | "Valider" | ✅ Validation OK |
| Validé (PENDING) | "Annuler" | ✅ Annulation OK |
| Validé + Appliqué (APPLIED) | "Annuler" | ❌ Erreur API |

## Solution

### 1. Backend - Vérification par bloc spécifique

**Fichier** : `apps/api/src/routes/proposals.ts`

L'endpoint `/unapprove-block` vérifie maintenant si **le bloc spécifique** a été appliqué, au lieu de vérifier si n'importe quelle application existe.

```typescript
// AVANT - Vérification globale (incorrecte)
const appliedApplication = proposal.applications.find(app => app.status === 'APPLIED')
if (appliedApplication) {
  throw createError(400, 'Cannot unapprove a proposal that has already been applied')
}

// APRÈS - Vérification par bloc spécifique
const appliedBlockApplication = proposal.applications.find(
  app => app.status === 'APPLIED' && app.blockType === block
)
if (appliedBlockApplication) {
  throw createError(400, `Cannot unapprove block "${block}" that has already been applied`, 'BLOCK_ALREADY_APPLIED')
}
```

### 2. Backend - Inclusion des applications dans la réponse

**Fichier** : `apps/api/src/routes/proposals.ts`

L'endpoint `/group/:groupKey` inclut maintenant les `applications` dans la réponse pour que le frontend puisse savoir quels blocs sont appliqués.

```typescript
include: {
  agent: { select: { name: true, type: true } },
  applications: { select: { id: true, blockType: true, status: true } }  // ← NOUVEAU
}
```

### 3. Frontend - Type Proposal étendu

**Fichier** : `apps/dashboard/src/types/index.ts`

```typescript
export interface Proposal {
  // ... autres champs
  applications?: Array<{
    id: string
    blockType: string | null
    status: 'PENDING' | 'APPLIED' | 'FAILED'
  }>
}
```

### 4. Frontend - Composant BlockValidationButton

**Fichier** : `apps/dashboard/src/components/proposals/BlockValidationButton.tsx`

Nouvelle prop `isApplied` qui affiche un bouton verrouillé avec tooltip explicatif.

```tsx
interface BlockValidationButtonProps {
  // ... autres props
  isApplied?: boolean  // ← NOUVEAU
}

// Rendu conditionnel
if (isApplied && isValidated) {
  return (
    <Tooltip title="Ce bloc a déjà été appliqué en base de données et ne peut plus être annulé">
      <span>
        <Button
          variant="outlined"
          color="info"
          startIcon={<LockIcon />}
          disabled
          size="small"
        >
          {label} appliqué
        </Button>
      </span>
    </Tooltip>
  )
}
```

### 5. Frontend - Propagation de isBlockApplied

**Fichiers modifiés** :
- `GroupedProposalDetailBase.tsx` - Ajout de `isBlockApplied` au context
- `GenericChangesTable.tsx` - Nouvelle prop `isBlockApplied`
- `RaceChangesSection.tsx` - Nouvelle prop `isBlockApplied`
- `OrganizerSection.tsx` - Nouvelle prop `isBlockApplied`

## Comportement après

| État du bloc | Bouton affiché | Icône | Cliquable |
|--------------|----------------|-------|-----------|
| Non validé | "Valider {bloc}" | ✓ | Oui |
| Validé (PENDING) | "Annuler {bloc}" | ✗ | Oui |
| Validé + Appliqué | "{bloc} appliqué" | 🔒 | Non (disabled + tooltip) |

## Tests manuels

1. **Bloc validé non appliqué** :
   - Valider un bloc → Bouton "Annuler" actif
   - Cliquer "Annuler" → Bloc redevient éditable

2. **Bloc validé et appliqué** :
   - Valider un bloc
   - Aller dans /updates et appliquer le bloc
   - Revenir sur la proposition
   - Le bouton affiche "{bloc} appliqué" avec un cadenas
   - Le bouton est désactivé (grisé)
   - Hover affiche le tooltip explicatif

3. **Blocs mixtes** :
   - Valider 3 blocs (event, edition, races)
   - Appliquer seulement "edition"
   - "edition" → bouton verrouillé
   - "event" et "races" → boutons "Annuler" toujours actifs

## Code d'erreur API

```json
{
  "success": false,
  "error": {
    "code": "BLOCK_ALREADY_APPLIED",
    "message": "Cannot unapprove block \"edition\" that has already been applied"
  }
}
```
