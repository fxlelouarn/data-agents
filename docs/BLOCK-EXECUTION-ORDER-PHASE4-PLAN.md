# Phase 4 : Validation en cascade frontend - Plan d'implémentation

**Date** : 2025-12-03  
**Statut** : 📋 Planifié (non implémenté)  
**Priorité** : P2 (Amélioration UX)

## Objectif

Améliorer l'UX en validant automatiquement les dépendances d'un bloc lorsque l'utilisateur clique sur "Valider [bloc]".

## Problème actuel

**Scénario** : NEW_EVENT avec 4 blocs (event, edition, organizer, races)

**Utilisateur** :
1. Valide `organizer` en premier
2. Rien ne se passe (dépendances manquantes)
3. Doit manuellement valider `event` puis `edition`
4. Peut enfin valider `organizer`

**Résultat** : ❌ 4 clics au lieu de 1, frustrant

## Solution : Validation en cascade automatique

**Nouveau comportement** :

**Utilisateur** :
1. Clique "Valider Organisateur"

**Système** :
```
ℹ️ Notification: "Validation automatique : event → edition → organizer"
  ↓
✅ Valide event
✅ Valide edition  
✅ Valide organizer
  ↓
✅ Notification: "Organisateur validé avec succès (+ 2 dépendances)"
```

**Résultat** : ✅ 1 clic, transparent, fluide

## Architecture

### 1. Importer les dépendances (Backend → Frontend)

**Créer un fichier partagé** : `packages/types/src/block-dependencies.ts`

```typescript
/**
 * Graphe de dépendances entre blocs
 * ⚠️ DOIT être synchronisé avec backend (block-execution-order.ts)
 */
export type BlockType = 'event' | 'edition' | 'organizer' | 'races'

export const BLOCK_DEPENDENCIES: Record<BlockType, BlockType[]> = {
  'event': [],               // Pas de dépendances
  'edition': ['event'],      // Dépend de event
  'organizer': ['edition'],  // Dépend de edition
  'races': ['edition']       // Dépend de edition
}

/**
 * Calcule toutes les dépendances transitives d'un bloc
 * 
 * @example
 * getAllDependencies('organizer') 
 * → ['event', 'edition']  // Ordre résolu
 */
export function getAllDependencies(blockType: BlockType): BlockType[] {
  const result: BlockType[] = []
  const visited = new Set<BlockType>()
  
  function visit(block: BlockType) {
    if (visited.has(block)) return
    visited.add(block)
    
    const deps = BLOCK_DEPENDENCIES[block] || []
    deps.forEach(dep => visit(dep))
    result.push(block)
  }
  
  BLOCK_DEPENDENCIES[blockType]?.forEach(dep => visit(dep))
  return result
}
```

**Tests** : `packages/types/src/__tests__/block-dependencies.test.ts`

```typescript
test('getAllDependencies organizer → [event, edition]', () => {
  expect(getAllDependencies('organizer')).toEqual(['event', 'edition'])
})

test('getAllDependencies event → []', () => {
  expect(getAllDependencies('event')).toEqual([])
})
```

---

### 2. Modifier le hook `useBlockValidation`

**Fichier** : `apps/dashboard/src/hooks/useBlockValidation.ts`

**Nouvelle fonction** : `validateBlockWithDependencies()`

```typescript
import { getAllDependencies, BlockType } from '@data-agents/types'
import { useSnackbar } from 'notistack'

export function useBlockValidation(props: UseBlockValidationProps) {
  const { enqueueSnackbar } = useSnackbar()
  
  // ... code existant ...
  
  /**
   * Valide un bloc et toutes ses dépendances manquantes
   * 
   * @param blockKey - Bloc à valider
   * @param options - Options de validation
   */
  const validateBlockWithDependencies = async (
    blockKey: BlockType,
    options?: {
      silent?: boolean  // Si true, pas de notifications
    }
  ) => {
    const isBlockValidated = (block: string) => {
      return approvedBlocks[block] === true
    }
    
    // 1. Calculer les dépendances manquantes
    const allDeps = getAllDependencies(blockKey)
    const missingDeps = allDeps.filter(dep => !isBlockValidated(dep))
    
    if (missingDeps.length === 0) {
      // Pas de dépendances manquantes, validation directe
      return validateBlock(blockKey, proposalIds, changes)
    }
    
    // 2. Notification anticipée
    if (!options?.silent) {
      const depsChain = [...missingDeps, blockKey].join(' → ')
      enqueueSnackbar(
        `Validation automatique : ${depsChain}`,
        { 
          variant: 'info',
          autoHideDuration: 3000
        }
      )
    }
    
    // 3. Valider les dépendances dans l'ordre
    for (const dep of missingDeps) {
      try {
        await validateBlock(dep, proposalIds, changes)
        
        if (!options?.silent) {
          enqueueSnackbar(
            `✅ ${dep} validé`,
            { variant: 'success', autoHideDuration: 2000 }
          )
        }
      } catch (error) {
        enqueueSnackbar(
          `❌ Erreur lors de la validation de ${dep}`,
          { variant: 'error' }
        )
        throw error  // Stop la cascade
      }
    }
    
    // 4. Valider le bloc demandé
    try {
      await validateBlock(blockKey, proposalIds, changes)
      
      if (!options?.silent) {
        const message = missingDeps.length > 0
          ? `✅ ${blockKey} validé avec succès (+ ${missingDeps.length} dépendance(s))`
          : `✅ ${blockKey} validé avec succès`
        
        enqueueSnackbar(message, { variant: 'success' })
      }
    } catch (error) {
      enqueueSnackbar(
        `❌ Erreur lors de la validation de ${blockKey}`,
        { variant: 'error' }
      )
      throw error
    }
  }
  
  return {
    // ... exports existants ...
    validateBlock,
    validateBlockWithDependencies,  // ✅ Nouveau
    validateAllBlocks
  }
}
```

---

### 3. Utiliser dans les composants UI

**Fichiers à modifier** :
- `apps/dashboard/src/components/proposals/BlockValidationButton.tsx`
- `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`

**Exemple** : `BlockValidationButton.tsx`

```typescript
interface BlockValidationButtonProps {
  blockKey: BlockType
  label: string
  isValidated: boolean
  onValidate: (blockKey: BlockType) => Promise<void>
  // ✅ Nouveau
  onValidateWithDependencies?: (blockKey: BlockType) => Promise<void>
  useCascadeValidation?: boolean  // Default: true
}

export function BlockValidationButton({
  blockKey,
  label,
  isValidated,
  onValidate,
  onValidateWithDependencies,
  useCascadeValidation = true
}: BlockValidationButtonProps) {
  const [loading, setLoading] = useState(false)
  
  const handleClick = async () => {
    setLoading(true)
    try {
      // ✅ Utiliser validation en cascade si disponible
      if (useCascadeValidation && onValidateWithDependencies) {
        await onValidateWithDependencies(blockKey)
      } else {
        await onValidate(blockKey)
      }
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <Button
      variant="contained"
      color={isValidated ? 'success' : 'primary'}
      onClick={handleClick}
      disabled={loading}
      startIcon={loading ? <CircularProgress size={20} /> : <CheckIcon />}
    >
      {label}
    </Button>
  )
}
```

**Usage** :

```typescript
// Dans GroupedProposalDetailBase.tsx
const { validateBlockWithDependencies } = useBlockValidation({
  proposalIds,
  selectedChanges,
  userModifiedChanges,
  userModifiedRaceChanges,
  approvedBlocks
})

return (
  <>
    <BlockValidationButton
      blockKey="organizer"
      label="Valider Organisateur"
      isValidated={isBlockValidated('organizer')}
      onValidate={validateBlock}
      onValidateWithDependencies={validateBlockWithDependencies}  // ✅ Nouveau
      useCascadeValidation={true}
    />
  </>
)
```

---

### 4. Notifications empilées (Snackbar)

**Librairie** : `notistack` (déjà installée)

**Configuration** : Augmenter `maxSnack` pour les cascades

```typescript
// apps/dashboard/src/App.tsx
<SnackbarProvider 
  maxSnack={5}  // ✅ Augmenter pour voir plusieurs notifications
  anchorOrigin={{ vertical: 'bottom', right: 'right' }}
  autoHideDuration={3000}
>
  {children}
</SnackbarProvider>
```

**Exemple de cascade** :
```
ℹ️ Validation automatique : event → edition → organizer
✅ event validé
✅ edition validé
✅ organizer validé avec succès (+ 2 dépendances)
```

---

## Tests

### Tests unitaires

**Fichier** : `apps/dashboard/src/hooks/__tests__/useBlockValidation.cascade.test.ts`

```typescript
describe('validateBlockWithDependencies', () => {
  test('Valider organizer → Valide event, edition, puis organizer', async () => {
    const { result } = renderHook(() => useBlockValidation({
      proposalIds: ['prop1'],
      approvedBlocks: {},
      // ...
    }))
    
    await act(async () => {
      await result.current.validateBlockWithDependencies('organizer')
    })
    
    // Vérifier que les 3 blocs ont été validés
    expect(mockValidateBlock).toHaveBeenCalledTimes(3)
    expect(mockValidateBlock).toHaveBeenNthCalledWith(1, 'event', ...)
    expect(mockValidateBlock).toHaveBeenNthCalledWith(2, 'edition', ...)
    expect(mockValidateBlock).toHaveBeenNthCalledWith(3, 'organizer', ...)
  })
  
  test('Valider races (edition déjà validé) → Valide seulement races', async () => {
    const { result } = renderHook(() => useBlockValidation({
      proposalIds: ['prop1'],
      approvedBlocks: { edition: true },  // ✅ Déjà validé
      // ...
    }))
    
    await act(async () => {
      await result.current.validateBlockWithDependencies('races')
    })
    
    // Seulement races validé (edition skip)
    expect(mockValidateBlock).toHaveBeenCalledTimes(1)
    expect(mockValidateBlock).toHaveBeenCalledWith('races', ...)
  })
  
  test('Erreur sur dépendance → Stop la cascade', async () => {
    mockValidateBlock.mockRejectedValueOnce(new Error('Edition validation failed'))
    
    const { result } = renderHook(() => useBlockValidation({ ... }))
    
    await expect(
      result.current.validateBlockWithDependencies('organizer')
    ).rejects.toThrow('Edition validation failed')
    
    // Seulement event validé, pas edition ni organizer
    expect(mockValidateBlock).toHaveBeenCalledTimes(2)  // event + edition (failed)
  })
})
```

### Tests E2E (Playwright/Cypress)

```typescript
test('Validation cascade organizer → event, edition, organizer', async ({ page }) => {
  await page.goto('/proposals/group/cm123')
  
  // Vérifier état initial (aucun bloc validé)
  await expect(page.locator('[data-testid="block-event-badge"]')).toHaveText('Non validé')
  await expect(page.locator('[data-testid="block-edition-badge"]')).toHaveText('Non validé')
  await expect(page.locator('[data-testid="block-organizer-badge"]')).toHaveText('Non validé')
  
  // Cliquer sur "Valider Organisateur"
  await page.click('[data-testid="validate-organizer-btn"]')
  
  // Attendre les notifications
  await expect(page.locator('.MuiSnackbar-root')).toContainText('Validation automatique')
  await expect(page.locator('.MuiSnackbar-root')).toContainText('event validé')
  await expect(page.locator('.MuiSnackbar-root')).toContainText('edition validé')
  await expect(page.locator('.MuiSnackbar-root')).toContainText('organizer validé avec succès')
  
  // Vérifier état final (3 blocs validés)
  await expect(page.locator('[data-testid="block-event-badge"]')).toHaveText('Validé')
  await expect(page.locator('[data-testid="block-edition-badge"]')).toHaveText('Validé')
  await expect(page.locator('[data-testid="block-organizer-badge"]')).toHaveText('Validé')
})
```

---

## Migration progressive

### Étape 1 : Feature flag (optionnel)
```typescript
const ENABLE_CASCADE_VALIDATION = import.meta.env.VITE_ENABLE_CASCADE_VALIDATION === 'true'

if (ENABLE_CASCADE_VALIDATION) {
  await validateBlockWithDependencies(blockKey)
} else {
  await validateBlock(blockKey)
}
```

### Étape 2 : Déploiement beta
- Activer pour quelques utilisateurs
- Observer les métriques (nombre de clics, erreurs)

### Étape 3 : Rollout complet
- Activer pour tous
- Supprimer l'ancien comportement

---

## Métriques de succès

| Métrique | Avant | Après (objectif) |
|----------|-------|------------------|
| **Clics moyens pour valider 4 blocs** | 4 | **1-2** |
| **Temps moyen validation** | 30s | **10s** |
| **Erreurs "dépendances manquantes"** | 20% | **0%** |
| **Satisfaction utilisateur** | 3/5 | **4.5/5** |

---

## Fichiers à créer/modifier

### Nouveaux fichiers
- ✅ `packages/types/src/block-dependencies.ts` (graphe partagé)
- ✅ `packages/types/src/__tests__/block-dependencies.test.ts`
- ✅ `apps/dashboard/src/hooks/__tests__/useBlockValidation.cascade.test.ts`
- ✅ `docs/BLOCK-EXECUTION-ORDER-PHASE4-PLAN.md` (ce fichier)

### Fichiers à modifier
- 📝 `apps/dashboard/src/hooks/useBlockValidation.ts` (+50 lignes)
- 📝 `apps/dashboard/src/components/proposals/BlockValidationButton.tsx` (+10 lignes)
- 📝 `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx` (+5 lignes)
- 📝 `apps/dashboard/src/App.tsx` (maxSnack: 5)

### Backend (aucune modification requise)
- ✅ Tri topologique déjà en place
- ✅ Validation déjà en place
- ✅ API REST stable

---

## Effort estimé

| Tâche | Complexité | Temps |
|-------|------------|-------|
| **1. Créer module types partagé** | Faible | 1h |
| **2. Modifier useBlockValidation** | Moyenne | 2h |
| **3. Modifier UI (boutons)** | Faible | 1h |
| **4. Tests unitaires** | Moyenne | 2h |
| **5. Tests E2E** | Moyenne | 2h |
| **6. Documentation** | Faible | 1h |
| **Total** | - | **9h** |

---

## Risques et mitigations

| Risque | Impact | Probabilité | Mitigation |
|--------|--------|-------------|------------|
| **Validations cachées surprennent l'utilisateur** | Moyen | Faible | Notifications claires + logs |
| **Erreur en cascade bloque tout** | Élevé | Moyen | Try/catch + rollback notifications |
| **Performance (3 appels API)** | Faible | Faible | Déjà optimisé backend |
| **Désynchronisation graphe backend/frontend** | Élevé | Faible | Tests E2E + CI/CD |

---

## Alternatives considérées

### Option B : Boutons désactivés
- ❌ Plus de clics
- ❌ Moins fluide
- ✅ Plus de contrôle

**Verdict** : Moins adapté pour un workflow rapide

### Option C : Confirmation modale
- ❌ Popup supplémentaire
- ✅ Transparence totale

**Verdict** : Trop intrusif pour une action courante

---

## Prochaines étapes

1. ✅ **Valider ce plan** avec l'équipe
2. 📋 Créer les tickets JIRA/GitHub
3. 🏗️ Implémenter Phase 4
4. 🧪 Tests et QA
5. 🚀 Déploiement progressif
6. 📊 Mesurer les métriques

---

## Ressources

- Phase 1 : `docs/BLOCK-EXECUTION-ORDER.md`
- Phase 2 : `docs/BLOCK-EXECUTION-ORDER-PHASE2.md`
- Phase 3 : `docs/BLOCK-EXECUTION-ORDER-PHASE3.md`
- Graphe backend : `packages/database/src/services/block-execution-order.ts`
- API validation : `apps/api/src/routes/proposals.ts` (validate-block-group)

---

**Version** : 1.0.0  
**Dernière mise à jour** : 2025-12-03  
**Statut** : 📋 Prêt pour implémentation
