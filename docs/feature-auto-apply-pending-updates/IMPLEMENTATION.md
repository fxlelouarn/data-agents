# Application automatique des mises à jour PENDING

## Statut : Implémenté (2025-12-04)

## Vue d'ensemble

Cette fonctionnalité permet d'appliquer automatiquement et périodiquement les `ProposalApplication` en statut `PENDING`. Elle est configurable depuis le panneau d'Administration du dashboard.

## Fonctionnalités

### Interface utilisateur (Administration)

Une nouvelle section "Application automatique des mises à jour" dans la page Administration :

- **Switch d'activation** : Active/désactive le scheduler automatique
- **Intervalle configurable** : Entre 5 minutes et 24 heures (1440 min)
- **Statut en temps réel** :
  - Scheduler actif/inactif
  - Prochaine exécution prévue
  - Dernière exécution (date + résultat)
  - Liste des erreurs (accordéon dépliable)
- **Bouton "Exécuter maintenant"** : Lance une exécution manuelle immédiate

### Backend

- **Service scheduler** : `UpdateAutoApplyScheduler` basé sur `setInterval()`
- **Tri topologique** : Les applications sont triées par dépendances avant exécution
- **Gestion des erreurs** : Continue avec les suivantes si une application échoue
- **Mutex** : Une seule exécution à la fois (flag `isCurrentlyApplying`)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Dashboard (Settings.tsx)                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  🔄 Application automatique des mises à jour              │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ [x] Activer l'application automatique               │  │  │
│  │  │ Fréquence: [____60____] minutes                     │  │  │
│  │  │                                                     │  │  │
│  │  │ Statut: ✅ Actif    Prochaine: 04/12/2025 15:30     │  │  │
│  │  │ Dernière: 04/12/2025 14:30  Résultat: 3 OK, 0 échec │  │  │
│  │  │                                                     │  │  │
│  │  │ [Exécuter maintenant]                               │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API Backend                               │
│                                                                  │
│  PUT /api/settings                                               │
│    - enableAutoApplyUpdates: boolean                             │
│    - autoApplyIntervalMinutes: number (5-1440)                   │
│                                                                  │
│  GET /api/settings/auto-apply-status                             │
│    - enabled, intervalMinutes                                    │
│    - lastRunAt, nextRunAt, lastRunResult                         │
│    - isSchedulerRunning, isCurrentlyApplying                     │
│                                                                  │
│  POST /api/settings/run-auto-apply                               │
│    - Exécution manuelle immédiate                                │
│    - Retourne: { success, failed, errors, appliedIds, failedIds }│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              UpdateAutoApplyScheduler (service)                  │
│                                                                  │
│  Méthodes publiques:                                             │
│  - start()     : Démarre le scheduler si activé                  │
│  - stop()      : Arrête le scheduler                             │
│  - restart()   : Redémarre avec nouveaux paramètres              │
│  - runNow()    : Exécution manuelle immédiate                    │
│  - isRunning() : Vérifie si scheduler actif                      │
│  - isCurrentlyApplying() : Vérifie si exécution en cours         │
│                                                                  │
│  Logique d'exécution:                                            │
│  1. Récupère tous les ProposalApplication PENDING                │
│  2. Trie par dépendances (sortBlocksByDependencies)              │
│  3. Applique séquentiellement via ProposalApplicationService     │
│  4. Sauvegarde le résultat dans Settings                         │
└─────────────────────────────────────────────────────────────────┘
```

## Fichiers implémentés

| Fichier | Description |
|---------|-------------|
| `packages/database/prisma/schema.prisma` | +5 champs dans modèle Settings |
| `packages/database/prisma/migrations/20251204155651_add_auto_apply_settings/` | Migration Prisma |
| `apps/api/src/config/settings.ts` | Interface `SystemSettings` + méthodes auto-apply |
| `apps/api/src/routes/settings.ts` | Endpoints API auto-apply |
| `apps/api/src/services/update-auto-apply-scheduler.ts` | Service scheduler (nouveau) |
| `apps/api/src/index.ts` | Intégration scheduler au démarrage + graceful shutdown |
| `apps/dashboard/src/services/api.ts` | Fonctions API `getAutoApplyStatus()`, `runAutoApply()` |
| `apps/dashboard/src/hooks/useApi.ts` | Hooks `useAutoApplyStatus()`, `useRunAutoApply()` |
| `apps/dashboard/src/pages/Settings.tsx` | Section UI dans Administration |

## Schéma de données

### Modèle Settings (nouveaux champs)

```prisma
model Settings {
  // ... champs existants ...
  
  // Application automatique des mises à jour PENDING
  enableAutoApplyUpdates     Boolean   @default(false)
  autoApplyIntervalMinutes   Int       @default(60)
  autoApplyLastRunAt         DateTime?
  autoApplyNextRunAt         DateTime?
  autoApplyLastRunResult     Json?
}
```

### Structure de `autoApplyLastRunResult`

```typescript
interface AutoApplyLastRunResult {
  success: number      // Nombre d'applications réussies
  failed: number       // Nombre d'échecs
  errors: string[]     // Messages d'erreur détaillés
  appliedIds: string[] // IDs des ProposalApplication appliquées
  failedIds: string[]  // IDs des ProposalApplication en échec
}
```

## Ordre d'exécution des blocs

Le scheduler utilise `sortBlocksByDependencies()` de `@data-agents/database` pour respecter l'ordre des dépendances :

```
event → edition → organizer → races
```

Cela garantit que :
- Un événement est créé avant son édition
- Une édition est créée avant ses courses
- Les contraintes de clés étrangères sont respectées

## Configuration

### Valeurs par défaut

| Paramètre | Valeur | Description |
|-----------|--------|-------------|
| `enableAutoApplyUpdates` | `false` | Désactivé par défaut |
| `autoApplyIntervalMinutes` | `60` | 1 heure |

### Limites

| Paramètre | Min | Max | Raison |
|-----------|-----|-----|--------|
| `autoApplyIntervalMinutes` | 5 | 1440 | Éviter surcharge (5 min) / Exécution quotidienne max (24h) |

## Comportement

### Au démarrage de l'API

1. L'API démarre
2. `updateAutoApplyScheduler.start()` est appelé
3. Si `enableAutoApplyUpdates` est `true`, le scheduler démarre
4. La prochaine exécution est planifiée

### Lors d'un changement de paramètres

- **Activation** : Le scheduler démarre immédiatement
- **Désactivation** : Le scheduler s'arrête
- **Changement d'intervalle** : Le scheduler redémarre avec le nouvel intervalle

### Lors d'une exécution

1. Récupération des `ProposalApplication` avec `status = 'PENDING'`
2. Si aucune : log "No pending updates" et fin
3. Tri topologique par dépendances
4. Pour chaque application :
   - Appel à `ProposalApplicationService.applyProposal()`
   - Mise à jour du statut (`APPLIED` ou `FAILED`)
   - Log du résultat
5. Sauvegarde du résultat global dans Settings

### Gestion des erreurs

- Si une application échoue, elle passe en `FAILED`
- L'exécution continue avec les applications suivantes
- Toutes les erreurs sont loggées dans `autoApplyLastRunResult.errors`

## API Reference

### GET /api/settings/auto-apply-status

Retourne le statut actuel de l'auto-apply.

**Réponse** :
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "intervalMinutes": 60,
    "lastRunAt": "2025-12-04T14:30:00.000Z",
    "nextRunAt": "2025-12-04T15:30:00.000Z",
    "lastRunResult": {
      "success": 3,
      "failed": 0,
      "errors": [],
      "appliedIds": ["abc123", "def456", "ghi789"],
      "failedIds": []
    },
    "isSchedulerRunning": true,
    "isCurrentlyApplying": false
  }
}
```

### POST /api/settings/run-auto-apply

Lance une exécution manuelle immédiate.

**Réponse (succès)** :
```json
{
  "success": true,
  "message": "Auto-apply completed",
  "data": {
    "success": 2,
    "failed": 1,
    "errors": ["abc123: Foreign key constraint failed"],
    "appliedIds": ["def456", "ghi789"],
    "failedIds": ["abc123"]
  }
}
```

**Réponse (déjà en cours)** :
```json
{
  "success": false,
  "message": "Auto-apply is already running"
}
```

## Tests manuels

1. **Activation** : Activer l'auto-apply → Vérifier que le scheduler démarre (chip "Actif")
2. **Exécution manuelle** : Cliquer "Exécuter maintenant" → Vérifier les résultats
3. **Désactivation** : Désactiver → Vérifier que le scheduler s'arrête (chip "Inactif")
4. **Changement d'intervalle** : Modifier l'intervalle → Vérifier la nouvelle "Prochaine exécution"
5. **Exécution automatique** : Attendre l'intervalle → Vérifier que les PENDING sont appliquées
6. **Dépendances** : Créer un NEW_EVENT avec blocs event/edition/races → Vérifier l'ordre d'application
