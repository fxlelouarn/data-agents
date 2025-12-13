# Dette Technique

Ce document recense les améliorations techniques à faire quand le temps le permet.

---

## 1. Incohérence de types dans MatchResult (IDs string vs number)

**Date** : 2025-12-13

**Problème** : Le type `MatchResult` dans `apps/agents/src/ffa/types.ts` définit `event.id` et `edition.id` comme `string`, alors que :
- Les IDs Miles Republic sont des `Int` en base
- Prisma attend des `number` pour les requêtes `findUnique`
- La documentation (`apps/agents/src/ffa/MATCHING.md` ligne 339) indique `id: number`

**Symptôme rencontré** : 
```
PrismaClientValidationError: Invalid `prisma.event.findUnique()` invocation:
Argument `id`: Invalid value provided. Expected Int, provided String.
```

**Fix appliqué** : Ajout de `parseInt()` dans `FFAScraperAgent.ts` (lignes 1543, 1558)

**Amélioration recommandée** :
1. Modifier `apps/agents/src/ffa/types.ts` pour utiliser `number` au lieu de `string` :
   ```typescript
   export interface MatchResult {
     event?: {
       id: number  // était: string
       // ...
     }
     edition?: {
       id: number  // était: string
       // ...
     }
   }
   ```

2. Supprimer `String()` dans `matchResultToFFA()` (`apps/agents/src/ffa/matcher.ts` ligne 55, 62)

3. Supprimer les `parseInt()` ajoutés dans `FFAScraperAgent.ts`

**Impact** : Faible - le fix actuel fonctionne, mais la correction de typage éviterait ce genre de bug à l'avenir avec une erreur TypeScript à la compilation.

**Fichiers concernés** :
- `apps/agents/src/ffa/types.ts`
- `apps/agents/src/ffa/matcher.ts`
- `apps/agents/src/FFAScraperAgent.ts`
