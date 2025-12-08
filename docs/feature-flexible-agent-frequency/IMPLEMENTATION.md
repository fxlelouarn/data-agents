# Implémentation : Fréquence Flexible des Agents

## Résumé

Cette fonctionnalité remplace le système de fréquence basé sur des expressions cron par un système flexible avec :
- **Variance aléatoire (jitter)** : permet de varier l'heure d'exécution
- **Fenêtres temporelles** : limite les exécutions à certaines heures
- **Types de fréquence** : interval, daily, weekly

## Format de Configuration

```typescript
interface FrequencyConfig {
  type: 'interval' | 'daily' | 'weekly'
  intervalMinutes?: number    // Ex: 120 (2h)
  jitterMinutes?: number      // Ex: 30 (±30min)
  windowStart?: string        // Ex: "00:00"
  windowEnd?: string          // Ex: "05:00"
  daysOfWeek?: number[]       // Ex: [1,2,3,4,5] (lun-ven)
}
```

## Exemples

| Configuration | Comportement |
|---------------|--------------|
| `{ type: 'interval', intervalMinutes: 120, jitterMinutes: 30 }` | Toutes les 2h ± 30min |
| `{ type: 'daily', windowStart: '00:00', windowEnd: '05:00' }` | 1x/jour entre minuit et 5h |
| `{ type: 'weekly', windowStart: '06:00', windowEnd: '09:00', daysOfWeek: [1,2,3,4,5] }` | 1x/semaine lun-ven matin |

## Fichiers Modifiés/Créés

### Nouveaux fichiers

| Fichier | Description |
|---------|-------------|
| `packages/types/src/frequency.ts` | Types TypeScript + presets |
| `packages/database/src/services/frequency-calculator.ts` | Calcul du prochain run |
| `apps/api/src/services/flexible-scheduler.ts` | Nouveau scheduler |
| `apps/dashboard/src/components/FrequencySelector.tsx` | Composant UI |

### Fichiers modifiés

| Fichier | Changement |
|---------|------------|
| `packages/database/prisma/schema.prisma` | `frequency: String` → `Json`, ajout `nextRunAt` |
| `packages/database/src/validation/schemas.ts` | Nouveau schéma FrequencyConfig |
| `packages/database/src/DatabaseService.ts` | Types mis à jour |
| `packages/database/src/services/interfaces.ts` | Types mis à jour |
| `apps/api/src/routes/agents.ts` | Validation FrequencyConfig |
| `apps/api/src/index.ts` | Import FlexibleScheduler |
| `apps/dashboard/src/pages/AgentEdit.tsx` | Intégration FrequencySelector |
| `apps/dashboard/src/types/index.ts` | Type `frequency: any` |

### Fichiers supprimés

| Fichier | Raison |
|---------|--------|
| `apps/api/src/services/scheduler.ts` | Remplacé par `flexible-scheduler.ts` |

## Migration des Données

La migration Prisma `20251205174001_flexible_frequency` convertit automatiquement les expressions cron existantes :

```sql
-- Exemple de conversion
'0 */2 * * *' → { type: 'interval', intervalMinutes: 120, jitterMinutes: 30 }
'0 0 * * *'   → { type: 'daily', windowStart: '00:00', windowEnd: '05:00' }
```

## UI Dashboard

### Presets disponibles

- Toutes les heures ± 15min
- Toutes les 2h ± 30min
- Toutes les 4h ± 1h
- Toutes les 6h ± 1h
- Quotidien nuit (00h-05h)
- Quotidien matin (06h-09h)
- Quotidien soir (18h-22h)
- Hebdo lun-ven (nuit)
- Hebdo week-end (matin)

### Mode avancé

Permet de configurer :
- Type de fréquence (interval/daily/weekly)
- Intervalle en minutes (slider)
- Jitter en minutes (slider)
- Fenêtre horaire (time pickers)
- Jours de la semaine (toggle buttons)

## Comportement du Scheduler

1. **Au démarrage** : Charge tous les agents actifs, calcule `nextRunAt` pour chacun
2. **Après exécution** : Recalcule `nextRunAt` avec le jitter aléatoire
3. **Persistance** : `nextRunAt` est stocké en base pour survivre aux redémarrages
4. **Au redémarrage** : Toujours recalculer (pas d'exécution immédiate si retard)

## Timezone

Toutes les fenêtres horaires sont en **Europe/Paris**. Le calcul utilise `date-fns-tz` pour la conversion.

## Tests

Le calculateur peut être testé unitairement en passant une date fixe :

```typescript
const result = calculateNextRun(config, new Date('2025-12-05T10:00:00Z'))
```
