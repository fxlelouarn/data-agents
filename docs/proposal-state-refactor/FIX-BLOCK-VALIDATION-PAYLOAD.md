# Fix: Payload complet lors de la validation par blocs

**Date** : 2025-11-11  
**Problème résolu** : Les valeurs proposées par les agents n'étaient pas incluses dans le payload lors de la validation par blocs.

## Problème

Lorsqu'un utilisateur :
1. Modifie **manuellement** un champ (ex: distance d'une course)
2. Valide le bloc (ex: "races")

**Résultat observé** :
```json
{
  "races": {
    "141829": {
      "distance": "12"  // ✅ Modification manuelle présente
    }
  }
}
```

❌ **Les autres champs proposés par l'agent étaient perdus** (ex: `startDate` proposée mais non modifiée).

## Cause

Dans `useBlockValidation.ts`, lors de la validation d'un bloc, seul le paramètre `block` était envoyé au backend :

```typescript
// ❌ AVANT (bugué)
await updateProposalMutation.mutateAsync({
  id,
  status: 'APPROVED',
  reviewedBy: 'Utilisateur',
  block: blockKey // N'envoie que le block, pas les valeurs
})
```

Le backend ne recevait **jamais** :
- Les valeurs proposées par les agents (`selectedChanges`)
- Les modifications manuelles (`userModifiedChanges`)
- Les modifications de courses (`userModifiedRaceChanges`)

## Solution

### 1. Ajouter des props à `useBlockValidation`

**Fichier** : `apps/dashboard/src/hooks/useBlockValidation.ts`

```typescript
interface UseBlockValidationProps {
  proposals?: Proposal[]
  blockProposals?: Record<string, string[]>
  // ✅ Nouvelles props
  selectedChanges?: Record<string, any>
  userModifiedChanges?: Record<string, any>
  userModifiedRaceChanges?: Record<number, Record<string, any>>
}
```

### 2. Construire le payload complet

**Logique de merge** :

```typescript
const validateBlock = useCallback(async (blockKey: string, proposalIds: string[]) => {
  // Construire le payload avec TOUTES les valeurs (proposées + modifiées)
  const finalPayload: Record<string, any> = {}
  
  // 1. Ajouter les valeurs sélectionnées (proposées par les agents)
  Object.entries(selectedChanges).forEach(([field, value]) => {
    finalPayload[field] = value
  })
  
  // 2. Écraser avec les modifications manuelles
  Object.entries(userModifiedChanges).forEach(([field, value]) => {
    finalPayload[field] = value
  })
  
  // 3. Ajouter les modifications de courses si c'est le bloc "races"
  if (blockKey === 'races' && Object.keys(userModifiedRaceChanges).length > 0) {
    finalPayload.raceEdits = userModifiedRaceChanges
  }
  
  // ✅ Envoyer TOUT le payload
  await updateProposalMutation.mutateAsync({
    id,
    status: 'APPROVED',
    reviewedBy: 'Utilisateur',
    block: blockKey,
    userModifiedChanges: finalPayload // ✅ Payload complet
  })
}, [selectedChanges, userModifiedChanges, userModifiedRaceChanges])
```

### 3. Passer les props depuis les composants

**Propositions groupées** (`GroupedProposalDetailBase.tsx`) :

```typescript
const { ... } = useBlockValidation({
  proposals: groupProposals,
  blockProposals,
  selectedChanges,        // ✅
  userModifiedChanges,    // ✅
  userModifiedRaceChanges // ✅
})
```

**Propositions simples** (`ProposalDetailBase.tsx`) :

```typescript
const { ... } = useBlockValidation({
  proposals: proposal ? [proposal] : [],
  blockProposals,
  selectedChanges,        // ✅
  userModifiedChanges,    // ✅
  userModifiedRaceChanges // ✅
})
```

## Résultat

### Avant fix

```json
{
  "races": {
    "141829": {
      "distance": "12"  // Seulement la modification manuelle
    }
  }
}
```

### Après fix

```json
{
  "races": {
    "141826": {
      "startDate": "2025-11-14T23:00:00.000Z"  // ✅ Valeur proposée
    },
    "141827": {
      "startDate": "2025-11-14T23:00:00.000Z"  // ✅ Valeur proposée
    },
    "141828": {
      "startDate": "2025-11-14T23:00:00.000Z"  // ✅ Valeur proposée
    },
    "141829": {
      "distance": "12",                         // ✅ Modification manuelle
      "startDate": "2025-11-14T23:00:00.000Z"  // ✅ Valeur proposée
    }
  }
}
```

## Impact

### ✅ Bénéfices

- **Cohérence** : Toutes les valeurs proposées sont appliquées
- **Pas de perte de données** : Modifications manuelles + Propositions agents
- **Workflow complet** : Les utilisateurs peuvent modifier certains champs sans perdre les autres

### 🔍 Logging

Des logs détaillés ont été ajoutés pour debugging :

```typescript
console.log(`✅ [useBlockValidation] Validation bloc "${blockKey}" avec payload:`, {
  blockKey,
  proposalIds,
  selectedChanges,
  userModifiedChanges,
  userModifiedRaceChanges,
  finalPayload
})
```

## Fichiers modifiés

1. **`apps/dashboard/src/hooks/useBlockValidation.ts`**
   - Ajout des props `selectedChanges`, `userModifiedChanges`, `userModifiedRaceChanges`
   - Construction du `finalPayload` complet
   - Logs de debugging

2. **`apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`**
   - Passage des props à `useBlockValidation`

3. **`apps/dashboard/src/pages/proposals/detail/base/ProposalDetailBase.tsx`**
   - Passage des props à `useBlockValidation`

## Tests

### Test manuel

1. Ouvrir une proposition avec des courses (ex: EDITION_UPDATE)
2. Modifier manuellement la distance d'une course (ex: 21.1 → 12)
3. Valider le bloc "races"
4. Vérifier le payload dans les logs console

**Résultat attendu** :
- ✅ Distance modifiée présente
- ✅ `startDate` proposée présente pour toutes les courses (même celles non modifiées)

### Points de vérification

- [ ] Propositions simples : tous les champs proposés + modifiés
- [ ] Propositions groupées : tous les champs proposés + modifiés
- [ ] Bloc "event" : OK
- [ ] Bloc "edition" : OK
- [ ] Bloc "organizer" : OK
- [ ] Bloc "races" : OK (avec `raceEdits`)

## Notes techniques

### Structure du payload

Le payload final suit cette structure :

```typescript
{
  // Champs d'édition
  startDate: "...",
  endDate: "...",
  
  // Modifications de courses (si bloc "races")
  raceEdits: {
    "existing-0": { startDate: "..." },
    "existing-1": { startDate: "..." },
    "new-0": { distance: "12", startDate: "..." }
  }
}
```

### Ordre de priorité

1. **`selectedChanges`** : Valeurs proposées par les agents (base)
2. **`userModifiedChanges`** : Modifications manuelles (écrase la base)
3. **`userModifiedRaceChanges`** : Modifications spécifiques aux courses (si bloc "races")

### Rétrocompatibilité

✅ Le fix est **rétrocompatible** :
- Si `selectedChanges` est vide → Comportement identique (pas de payload)
- Si `userModifiedChanges` est vide → Seules les valeurs proposées sont envoyées
- Les props sont **optionnelles** (valeurs par défaut `{}`)

## Voir aussi

- `docs/BLOCK-SEPARATION-EVENT-EDITION.md` - Séparation des blocs
- `docs/FIX-USER-MODIFICATIONS-APPLICATION.md` - Application des modifications utilisateur
- `apps/dashboard/src/utils/blockFieldMapping.ts` - Mapping des champs par bloc
