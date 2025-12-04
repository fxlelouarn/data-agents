# Plan d'implémentation : Application automatique des ProposalApplications PENDING

## Contexte

Actuellement, les `ProposalApplication` en statut `PENDING` doivent être appliquées manuellement via le dashboard (bouton "Appliquer"). Cette fonctionnalité ajoutera un paramètre dans le panneau d'administration pour configurer une **application automatique périodique** de toutes les mises à jour en attente.

## Objectif

Ajouter dans la page Administration (`Settings.tsx`) une nouvelle section permettant de :
1. Activer/désactiver l'application automatique des updates PENDING
2. Configurer la fréquence d'exécution (en minutes)
3. Visualiser le statut de la dernière exécution automatique

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
│  │  │ Dernière exécution: 04/12/2025 14:30                │  │  │
│  │  │ Prochaine exécution: 04/12/2025 15:30               │  │  │
│  │  │ Statut: ✅ 3 updates appliquées                     │  │  │
│  │  │                                                     │  │  │
│  │  │ [Exécuter maintenant]                               │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API Backend                               │
│  PUT /api/settings                                               │
│    - enableAutoApplyUpdates: boolean                             │
│    - autoApplyIntervalMinutes: number                            │
│                                                                  │
│  POST /api/settings/run-auto-apply                               │
│    - Exécution manuelle immédiate                                │
│                                                                  │
│  GET /api/settings/auto-apply-status                             │
│    - lastRunAt, nextRunAt, lastRunResult                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              UpdateAutoApplyScheduler (service)                  │
│  - setInterval() basé sur autoApplyIntervalMinutes              │
│  - Récupère tous les ProposalApplication PENDING                 │
│  - Les trie par dépendances (sortBlocksByDependencies)          │
│  - Les applique séquentiellement                                 │
│  - Met à jour lastRunAt, lastRunResult                          │
└─────────────────────────────────────────────────────────────────┘
```

## Étapes d'implémentation

### Phase 1 : Schéma et API Settings

#### 1.1 Migration Prisma - Nouveaux champs Settings

**Fichier** : `packages/database/prisma/schema.prisma`

Ajouter au modèle `Settings` :
```prisma
model Settings {
  // ... champs existants ...
  
  // Application automatique des mises à jour
  enableAutoApplyUpdates     Boolean   @default(false)
  autoApplyIntervalMinutes   Int       @default(60)
  autoApplyLastRunAt         DateTime?
  autoApplyNextRunAt         DateTime?
  autoApplyLastRunResult     Json?     // { success: number, failed: number, errors: string[] }
}
```

#### 1.2 Mise à jour du service Settings

**Fichier** : `apps/api/src/config/settings.ts`

Ajouter les nouveaux champs à :
- Interface `SystemSettings`
- `defaultSettings`
- Méthodes `getSettings()`, `updateSetting()`
- Nouvelles méthodes : `getAutoApplySettings()`, `updateAutoApplyLastRun()`

#### 1.3 Mise à jour des routes Settings

**Fichier** : `apps/api/src/routes/settings.ts`

Ajouter :
- Validation des nouveaux champs dans `PUT /api/settings`
- Nouvel endpoint `GET /api/settings/auto-apply-status`
- Nouvel endpoint `POST /api/settings/run-auto-apply`

---

### Phase 2 : Service d'application automatique

#### 2.1 Créer le service UpdateAutoApplyScheduler

**Fichier** : `apps/api/src/services/update-auto-apply-scheduler.ts`

```typescript
export class UpdateAutoApplyScheduler {
  private intervalId: NodeJS.Timeout | null = null
  
  async start(): Promise<void>
  async stop(): Promise<void>
  async restart(): Promise<void>
  async runNow(): Promise<AutoApplyResult>
  
  private async applyAllPendingUpdates(): Promise<AutoApplyResult>
}
```

**Logique d'application** :
1. Récupérer tous les `ProposalApplication` avec `status = 'PENDING'`
2. Les trier avec `sortBlocksByDependencies()` pour respecter l'ordre des dépendances
3. Appliquer chaque update séquentiellement via `ProposalApplicationService.applyProposal()`
4. Enregistrer le résultat dans `Settings.autoApplyLastRunResult`

#### 2.2 Intégrer le scheduler au démarrage de l'API

**Fichier** : `apps/api/src/index.ts`

- Initialiser `UpdateAutoApplyScheduler` au démarrage
- Le démarrer si `enableAutoApplyUpdates` est activé
- Écouter les changements de settings pour restart si nécessaire

---

### Phase 3 : Interface utilisateur

#### 3.1 Hooks API

**Fichier** : `apps/dashboard/src/hooks/useApi.ts`

Ajouter :
- `useAutoApplyStatus()` - GET /api/settings/auto-apply-status
- `useRunAutoApply()` - POST /api/settings/run-auto-apply

#### 3.2 Section Settings.tsx

**Fichier** : `apps/dashboard/src/pages/Settings.tsx`

Ajouter une nouvelle Card "Application automatique des mises à jour" avec :
- Switch pour activer/désactiver
- TextField pour l'intervalle en minutes
- Affichage du statut (dernière exécution, prochaine, résultat)
- Bouton "Exécuter maintenant"

---

## Fichiers à modifier/créer

| Fichier | Action | Description |
|---------|--------|-------------|
| `packages/database/prisma/schema.prisma` | Modifier | Ajouter champs Settings |
| `apps/api/src/config/settings.ts` | Modifier | Interface + méthodes |
| `apps/api/src/routes/settings.ts` | Modifier | Nouveaux endpoints |
| `apps/api/src/services/update-auto-apply-scheduler.ts` | **Créer** | Service scheduler |
| `apps/api/src/index.ts` | Modifier | Intégration scheduler |
| `apps/dashboard/src/hooks/useApi.ts` | Modifier | Nouveaux hooks |
| `apps/dashboard/src/pages/Settings.tsx` | Modifier | Nouvelle section UI |

---

## Considérations techniques

### Gestion des erreurs
- Si une application échoue, continuer avec les suivantes
- Logger toutes les erreurs dans `autoApplyLastRunResult.errors`
- Ne pas réessayer les applications en échec automatiquement (elles passent en `FAILED`)

### Ordre d'exécution
- Utiliser `sortBlocksByDependencies()` de `@data-agents/database`
- Respecter l'ordre : event → edition → organizer → races

### Concurrence
- Une seule exécution à la fois (mutex/flag `isRunning`)
- Si une exécution est en cours, le bouton "Exécuter maintenant" est désactivé

### Sécurité
- Intervalle minimum : 5 minutes (éviter surcharge)
- Intervalle maximum : 1440 minutes (24h)

---

## Tests manuels à effectuer

1. Activer l'auto-apply avec intervalle de 1 minute
2. Créer une proposition et l'approuver → ProposalApplication PENDING créée
3. Attendre 1 minute → Vérifier que l'application passe en APPLIED
4. Tester le bouton "Exécuter maintenant"
5. Désactiver l'auto-apply → Vérifier que le scheduler s'arrête
6. Tester avec plusieurs updates ayant des dépendances (NEW_EVENT avec event, edition, races)

---

## Estimation

- Phase 1 (Schema + API) : ~30 min
- Phase 2 (Scheduler service) : ~45 min  
- Phase 3 (UI) : ~30 min
- Tests : ~15 min

**Total** : ~2h
