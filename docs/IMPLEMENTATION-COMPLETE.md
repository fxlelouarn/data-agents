# Implémentation complète : Approbation partielle par bloc (Option 2)

## Résumé

L'implémentation de l'**Option 2 - Application partielle** est maintenant terminée. Le système permet d'approuver des propositions bloc par bloc, et seuls les changements des blocs approuvés sont appliqués.

## Modifications apportées

### 1. Base de données

**Fichier** : `packages/database/prisma/schema.prisma`

- Ajout du champ `approvedBlocks` (JSON) dans le modèle `Proposal`
- Migration créée : `20251105111007_add_approved_blocks`
- Valeur par défaut : `{}` (objet vide pour rétrocompatibilité)

### 2. Backend - API

**Fichier** : `apps/api/src/routes/proposals.ts`

#### Endpoint `PUT /api/proposals/:id`
- Ajout du paramètre optionnel `block` dans le body
- Logique : si `block` est fourni, on met à jour `approvedBlocks[block] = true`

#### Endpoint `POST /api/proposals/bulk-approve`
- Support du paramètre `block` pour approbation en masse par bloc

#### Nouvel endpoint `GET /api/proposals/:id/approved-blocks`
- Debug endpoint pour inspecter les blocs approuvés
- Retourne la catégorisation des changements par bloc
- Affiche quels blocs sont approuvés

### 3. Backend - Services

**Fichier** : `packages/database/src/services/ProposalService.ts`
- Ajout du champ `approvedBlocks` dans la signature `updateProposal`

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`

Nouvelles méthodes :
- `getBlockForField(field: string)`: Détermine à quel bloc appartient un champ
- `filterChangesByApprovedBlocks()`: Filtre les changements selon les blocs approuvés

Logique d'application modifiée :
1. Récupère `approvedBlocks` de la proposition
2. Filtre `selectedChanges` pour ne garder que les champs des blocs approuvés
3. Logue les changements filtrés
4. Applique uniquement les changements filtrés
5. Retourne les informations de filtrage dans le résultat

**Fichier** : `packages/database/src/services/interfaces.ts`
- Ajout du champ `filteredChanges` dans `ProposalApplicationResult`

### 4. Frontend

**Fichier** : `apps/dashboard/src/services/api.ts`
- Ajout du paramètre `block?: string` dans `proposalsApi.update()`

**Fichier** : `apps/dashboard/src/hooks/useApi.ts`
- Ajout du paramètre `block?: string` dans `useUpdateProposal`

**Fichier** : `apps/dashboard/src/hooks/useBlockValidation.ts`
- Modification de `validateBlock` pour passer `block: blockKey` lors de l'approbation

## Catégorisation des blocs

Les changements sont catégorisés selon cette logique :

```typescript
function getBlockForField(field: string): string {
  // Bloc Organisateur
  if (field === 'organizerId' || field === 'organizer') {
    return 'organizer'
  }
  
  // Bloc Courses
  if (field === 'racesToAdd' || field === 'races' || field.startsWith('race_')) {
    return 'races'
  }
  
  // Bloc Édition (défaut)
  return 'edition'
}
```

Cette logique correspond à celle du frontend dans `GroupedProposalDetailBase.tsx`.

## Fonctionnement

### Scénario : Proposition mixte (édition + courses)

1. **Proposition créée** avec :
   - `startDate`: "2025-06-15" (bloc edition)
   - `racesToAdd`: [...] (bloc races)
   - `approvedBlocks`: `{}`

2. **Approbation du bloc "édition"** :
   ```
   PUT /api/proposals/:id { status: "APPROVED", block: "edition" }
   ```
   → `approvedBlocks`: `{"edition": true}`

3. **Application** :
   ```
   POST /api/proposals/:id/apply { selectedChanges: {...} }
   ```
   → Seul `startDate` est appliqué
   → `racesToAdd` est filtré
   → Résultat contient `filteredChanges.removed: ["racesToAdd"]`

4. **Approbation du bloc "courses"** :
   ```
   PUT /api/proposals/:id { status: "APPROVED", block: "races" }
   ```
   → `approvedBlocks`: `{"edition": true, "races": true}`

5. **Nouvelle application** :
   → Tous les changements sont appliqués

## Avantages de l'implémentation

✅ **Granularité** : Validation précise par domaine fonctionnel  
✅ **Traçabilité** : On sait exactement quels blocs ont été validés  
✅ **Sécurité** : Impossible d'appliquer des changements non validés  
✅ **Rétrocompatibilité** : Les anciennes propositions fonctionnent toujours  
✅ **Transparence** : Les changements filtrés sont loggés et retournés  

## Fichiers modifiés

```
packages/database/
├── prisma/schema.prisma
├── src/services/
│   ├── ProposalService.ts
│   ├── proposal-domain.service.ts
│   └── interfaces.ts

apps/api/src/routes/
└── proposals.ts

apps/dashboard/src/
├── services/api.ts
└── hooks/
    ├── useApi.ts
    └── useBlockValidation.ts
```

## Tests

Voir le guide complet dans : [`block-approval-testing.md`](./block-approval-testing.md)

### Commandes de test rapides

```bash
# 1. Vérifier les blocs d'une proposition
curl http://localhost:3001/api/proposals/:id/approved-blocks

# 2. Approuver un bloc spécifique
curl -X PUT http://localhost:3001/api/proposals/:id \
  -H "Content-Type: application/json" \
  -d '{"status": "APPROVED", "block": "edition"}'

# 3. Appliquer la proposition
curl -X POST http://localhost:3001/api/proposals/:id/apply \
  -H "Content-Type: application/json" \
  -d '{"selectedChanges": {...}}'
```

## Améliorations futures possibles

### Interface utilisateur
- Afficher visuellement les blocs approuvés avec des badges
- Désactiver le bouton "Appliquer" tant que certains blocs ne sont pas approuvés
- Montrer un aperçu des changements qui seront filtrés

### Validation stricte (Option 1)
Implémenter une validation qui exige l'approbation de TOUS les blocs :

```typescript
const canApply = (proposal) => {
  const touchedBlocks = getTouchedBlocks(proposal.changes)
  return touchedBlocks.every(block => proposal.approvedBlocks[block])
}
```

### Statut par bloc (Option 3)
Permettre de rejeter certains blocs :

```typescript
approvedBlocks: {
  edition: 'APPROVED',
  races: 'PENDING',
  organizer: 'REJECTED'
}
```

## Notes importantes

1. **Compatibilité** : Si `approvedBlocks` est vide `{}`, tous les changements sont appliqués (comportement historique)

2. **Logs** : Tous les changements filtrés sont loggés :
   ```
   [INFO] Filtered out 2 changes from unapproved blocks: racesToAdd, organizer
   ```

3. **Résultat API** : Le résultat d'application contient toujours les informations de filtrage si des changements ont été exclus

4. **Idempotence** : Ré-appliquer une proposition avec les mêmes `approvedBlocks` produit le même résultat

## Documentation

- **Solution** : [`block-approval-solution.md`](./block-approval-solution.md)
- **Tests** : [`block-approval-testing.md`](./block-approval-testing.md)
- **Ce fichier** : Vue d'ensemble de l'implémentation

---

**Date d'implémentation** : 5 novembre 2025  
**Version** : 1.0  
**Status** : ✅ Implémentation complète
