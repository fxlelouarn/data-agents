# Plan : Fréquence Flexible des Agents

## Statut : ✅ IMPLÉMENTÉ

## Objectif

Remplacer le système de fréquence basé sur des expressions cron par un système plus flexible avec variance aléatoire (jitter) et fenêtres temporelles.

**Exemples d'usage :**
- "Toutes les 2h ± 1h" → exécution entre 1h et 3h après la précédente
- "1 fois par jour entre 00h et 05h" → heure choisie aléatoirement dans la fenêtre
- "Toutes les 4h ± 30min, seulement entre 08h et 20h"

## Format de Configuration

### Type `FrequencyConfig`

```typescript
type FrequencyConfig = {
  type: 'interval' | 'daily' | 'weekly'
  
  // Pour type 'interval' : intervalle de base en minutes
  intervalMinutes?: number        // Ex: 120 (2h)
  
  // Variance aléatoire en minutes (appliqué à intervalMinutes)
  jitterMinutes?: number          // Ex: 60 → ±60min
  
  // Fenêtre d'exécution autorisée (optionnel pour 'interval', requis pour 'daily'/'weekly')
  windowStart?: string            // Ex: "00:00" (format HH:mm)
  windowEnd?: string              // Ex: "05:00"
  
  // Pour type 'weekly' uniquement : jours autorisés (0=dim, 1=lun, ..., 6=sam)
  daysOfWeek?: number[]           // Ex: [1,2,3,4,5] (lun-ven)
}
```

### Exemples

| Preset | Configuration |
|--------|---------------|
| Toutes les 2h ± 1h | `{ type: 'interval', intervalMinutes: 120, jitterMinutes: 60 }` |
| Quotidien nuit (00h-05h) | `{ type: 'daily', windowStart: '00:00', windowEnd: '05:00' }` |
| Toutes les 4h ± 30min (journée) | `{ type: 'interval', intervalMinutes: 240, jitterMinutes: 30, windowStart: '08:00', windowEnd: '20:00' }` |
| Hebdo lun-ven matin | `{ type: 'weekly', windowStart: '06:00', windowEnd: '09:00', daysOfWeek: [1,2,3,4,5] }` |

## Architecture

### Changements Prisma

**Fichier** : `packages/database/prisma/schema.prisma`

```prisma
model Agent {
  // ... autres champs
  frequency   Json      // CHANGEMENT: String → Json (FrequencyConfig)
  // ...
}
```

**Migration** : Les agents existants seront migrés automatiquement.

### Nouveau Scheduler

**Fichier** : `apps/api/src/services/flexible-scheduler.ts`

Remplace l'utilisation de `CronJob` par un système custom :

1. **Calcul du prochain run** : `calculateNextRun(config: FrequencyConfig, lastRun?: Date): Date`
   - Applique le jitter aléatoire
   - Respecte les fenêtres temporelles
   - Gère le timezone Europe/Paris

2. **Boucle de scheduling** : `setTimeout` récursif plutôt que cron
   - Après chaque exécution, calcule le prochain délai
   - Stocke `nextRunAt` en base pour persistance

3. **Gestion des fenêtres** :
   - Si hors fenêtre, reporter au début de la prochaine fenêtre valide
   - Pour `weekly`, vérifier aussi le jour de la semaine

### Nouveau Champ Base de Données

Ajouter `nextRunAt: DateTime?` sur le modèle `Agent` pour persister la prochaine exécution planifiée (survit aux redémarrages serveur).

### API Endpoints

**Modifié** : `PUT /api/agents/:id`
- Valide le nouveau format `FrequencyConfig`
- Recalcule `nextRunAt` après modification

**Nouveau** : `GET /api/agents/:id/next-run`
- Retourne la prochaine exécution planifiée avec détails

### Dashboard UI

**Fichier** : `apps/dashboard/src/pages/AgentEdit.tsx`

#### Presets Prédéfinis

| Label | Config |
|-------|--------|
| Toutes les heures ± 15min | `{ type: 'interval', intervalMinutes: 60, jitterMinutes: 15 }` |
| Toutes les 2h ± 30min | `{ type: 'interval', intervalMinutes: 120, jitterMinutes: 30 }` |
| Toutes les 4h ± 1h | `{ type: 'interval', intervalMinutes: 240, jitterMinutes: 60 }` |
| Quotidien (nuit 00h-05h) | `{ type: 'daily', windowStart: '00:00', windowEnd: '05:00' }` |
| Quotidien (matin 06h-09h) | `{ type: 'daily', windowStart: '06:00', windowEnd: '09:00' }` |
| Hebdo lun-ven (nuit) | `{ type: 'weekly', windowStart: '00:00', windowEnd: '05:00', daysOfWeek: [1,2,3,4,5] }` |

#### Mode Avancé

Formulaire complet avec :
- Select pour `type` (interval/daily/weekly)
- Inputs numériques pour `intervalMinutes` et `jitterMinutes`
- Time pickers pour `windowStart` et `windowEnd`
- Checkboxes pour `daysOfWeek`
- Preview du comportement : "Prochain run estimé : entre X et Y"

## Plan d'Implémentation

### Phase 1 : Types et Utilitaires
1. Créer `packages/types/src/frequency.ts` avec les types
2. Créer `packages/database/src/services/frequency-calculator.ts` avec la logique de calcul
3. Tests unitaires pour le calculateur

### Phase 2 : Migration Base de Données
1. Migration Prisma : `frequency String` → `frequency Json`
2. Ajouter champ `nextRunAt DateTime?`
3. Script de migration des données existantes (cron → FrequencyConfig)

### Phase 3 : Backend Scheduler
1. Créer `flexible-scheduler.ts` remplaçant l'ancien scheduler
2. Intégrer au démarrage de l'API
3. Mettre à jour les routes agents

### Phase 4 : Dashboard UI
1. Créer composant `FrequencySelector` avec presets
2. Créer composant `FrequencyAdvancedForm` pour mode avancé
3. Intégrer dans `AgentEdit.tsx`
4. Affichage dans `AgentDetail.tsx` et `AgentList.tsx`

### Phase 5 : Tests et Documentation
1. Tests d'intégration scheduler
2. Tests E2E UI
3. Documentation utilisateur

## Risques et Mitigations

| Risque | Mitigation |
|--------|------------|
| Perte de runs planifiés au redémarrage | Champ `nextRunAt` persisté en base |
| Drift temporel sur longue période | Recalcul basé sur l'heure actuelle, pas l'heure prévue |
| Fenêtre trop courte = jamais d'exécution | Validation UI : fenêtre min 1h |
| Jitter > interval = comportement bizarre | Validation : jitter ≤ interval/2 |

## Dépendances NPM

- `date-fns` et `date-fns-tz` : déjà présents, utilisés pour le calcul timezone

## Questions Ouvertes

1. **Comportement au démarrage serveur** : Si `nextRunAt` est dans le passé, exécuter immédiatement ou recalculer ?
   → Proposition : Recalculer sauf si < 5 minutes dans le passé

2. **Affichage "prochaine exécution"** : Afficher une plage (entre X et Y) ou juste l'heure calculée ?
   → Proposition : Afficher l'heure exacte calculée (le jitter est déjà appliqué)
