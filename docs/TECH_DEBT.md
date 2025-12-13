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

---

## 2. Tolérance de matching des courses hardcodée

**Date** : 2025-12-13

**Problème** : La tolérance de matching des courses (distance) est hardcodée à 15% dans `matchRaces()` au lieu d'être paramétrable dans les Settings de la plateforme.

**Localisation** : `packages/agent-framework/src/services/event-matching/event-matcher.ts` ligne 350
```typescript
tolerancePercent: number = 0.15 // TECH DEBT: Should be configurable in platform Settings
```

**Contexte** : La tolérance a été augmentée de 5% à 15% pour améliorer le matching des courses dont les distances varient légèrement entre sources (ex: 25km vs 27.5km).

**Amélioration recommandée** :
1. Ajouter un champ `raceMatchingTolerancePercent` dans la table `Settings` (schema Prisma)
2. Créer un endpoint API pour lire/modifier ce paramètre
3. Passer le paramètre depuis les Settings aux agents qui appellent `matchRaces()`
4. Ajouter une UI dans la page Administration du dashboard

**Impact** : Moyen - Permet aux administrateurs d'ajuster le seuil sans déploiement de code.

**Fichiers concernés** :
- `packages/database/prisma/schema.prisma` (ajouter champ Settings)
- `packages/agent-framework/src/services/event-matching/event-matcher.ts`
- `apps/api/src/services/slack/SlackProposalService.ts`
- `apps/agents/src/FFAScraperAgent.ts`
- `apps/dashboard/src/pages/Settings.tsx`
