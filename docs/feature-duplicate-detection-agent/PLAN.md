# Plan : Agent de Détection de Doublons d'Événements

## Objectif

Créer un agent automatisé qui détecte les événements potentiellement doublons dans la base Miles Republic et crée des propositions de fusion (`EVENT_MERGE`) pour validation humaine ou automatique.

---

## Analyse des Critères de Détection

### Critères principaux

| Critère | Poids | Description |
|---------|-------|-------------|
| **Similarité de nom** | 40% | Fuzzy matching après normalisation (stopwords, accents, apostrophes) |
| **Proximité géographique** | 30% | Même ville OU même département OU distance < 15km (via lat/lng) |
| **Proximité temporelle** | 20% | Éditions avec dates dans une fenêtre ±30 jours sur la même année |
| **Catégories de courses** | 10% | Chevauchement des types de courses (RUNNING, TRAIL, etc.) |

### Seuils de décision

- **Score ≥ 0.90** : Doublon très probable → Proposition automatique
- **Score 0.80-0.89** : Doublon probable → Proposition avec confidence moyenne
- **Score < 0.80** : Pas de proposition (éviter les faux positifs)

### Bonus/Malus

| Condition | Ajustement |
|-----------|------------|
| Même ville exacte | +10% |
| Même département | +5% |
| Distance < 5km (lat/lng) | +10% |
| Années d'édition identiques | +5% |
| Un événement a beaucoup plus d'éditions | -5% (moins probable d'être le même) |
| Événement avec status != LIVE | Exclus |

---

## Architecture Technique

### Positionnement dans le système

```
┌─────────────────────────────────────────────────────────────┐
│                   DuplicateDetectionAgent                    │
│  Type: ANALYZER | Fréquence: Configurable (ex: 1x/jour)     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Algorithme de Détection                         │
│  1. Batch d'événements (offset tracking)                    │
│  2. Pour chaque event: chercher candidats similaires        │
│  3. Scoring multi-critères                                  │
│  4. Création proposition EVENT_MERGE si score > seuil       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Proposal (type: EVENT_MERGE)                    │
│  Validée par humain ou AutoValidatorAgent                   │
└─────────────────────────────────────────────────────────────┘
```

### Stratégie de recherche de candidats

Pour éviter de comparer N² événements (très coûteux), on utilise une stratégie en entonnoir :

```
Événement source (ex: "Marathon Annecy")
        │
        ▼
┌───────────────────────────────────────┐
│  FILTRE 1: Même département           │  ~50-200 événements
│  WHERE countrySubdivisionDisplayCodeLevel2 = '74'
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│  FILTRE 2: Nom similaire (SQL ILIKE)  │  ~5-20 événements
│  WHERE name ILIKE '%marathon%' OR name ILIKE '%annecy%'
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│  FILTRE 3: Fuzzy matching + scoring   │  0-3 candidats
│  fuse.js avec seuil 0.80              │
└───────────────────────────────────────┘
        │
        ▼
   Proposition EVENT_MERGE (si score ≥ 0.80)
```

### Utilisation de Meilisearch (optionnel)

Si Meilisearch est configuré, l'agent peut l'utiliser pour le filtre 2 :

```typescript
// Recherche Meilisearch
const results = await meilisearchClient.index('events').search(
  normalizedEventName,
  { 
    filter: [`department = "${event.department}"`],
    limit: 50 
  }
)
```

---

## Fichiers à Créer/Modifier

### Nouveaux fichiers

| Fichier | Description |
|---------|-------------|
| `packages/types/src/agent-config-schemas/duplicate-detection.ts` | Schéma de configuration |
| `apps/agents/src/DuplicateDetectionAgent.ts` | Classe principale de l'agent |
| `apps/agents/src/duplicate-detection/scoring.ts` | Algorithme de scoring |
| `apps/agents/src/duplicate-detection/candidates.ts` | Recherche de candidats |
| `apps/agents/src/registry/duplicate-detection.ts` | Configuration par défaut |

### Fichiers à modifier

| Fichier | Modification |
|---------|--------------|
| `packages/types/src/agent-versions.ts` | Ajouter `DUPLICATE_DETECTION_AGENT: '1.0.0'` |
| `packages/types/src/agent-config-schemas/index.ts` | Exporter le schéma |
| `apps/agents/src/index.ts` | Enregistrer l'agent dans le registry |
| `apps/api/src/services/agent-metadata.ts` | Ajouter métadonnées et labels |

---

## Configuration de l'Agent

### Schéma de configuration

```typescript
export const DuplicateDetectionAgentConfigSchema: ConfigSchema = {
  title: "Configuration Duplicate Detection Agent",
  description: "Agent de détection automatique des événements doublons",
  categories: [
    { id: "general", label: "Configuration générale" },
    { id: "detection", label: "Paramètres de détection" },
    { id: "performance", label: "Performance" }
  ],
  fields: [
    // Général
    {
      name: "sourceDatabase",
      label: "Base de données",
      type: "database_select",
      category: "general",
      required: true,
      description: "Base de données Miles Republic à analyser"
    },
    
    // Détection
    {
      name: "minDuplicateScore",
      label: "Score minimum pour doublon",
      type: "slider",
      category: "detection",
      required: false,
      defaultValue: 0.80,
      description: "Score minimum (0-1) pour créer une proposition de fusion",
      validation: { min: 0.5, max: 1.0, step: 0.05 }
    },
    {
      name: "nameWeight",
      label: "Poids du nom",
      type: "slider",
      category: "detection",
      required: false,
      defaultValue: 0.40,
      description: "Importance de la similarité de nom dans le score",
      validation: { min: 0.1, max: 0.6, step: 0.05 }
    },
    {
      name: "locationWeight",
      label: "Poids de la localisation",
      type: "slider",
      category: "detection",
      required: false,
      defaultValue: 0.30,
      description: "Importance de la proximité géographique",
      validation: { min: 0.1, max: 0.5, step: 0.05 }
    },
    {
      name: "dateWeight",
      label: "Poids de la date",
      type: "slider",
      category: "detection",
      required: false,
      defaultValue: 0.20,
      description: "Importance de la proximité temporelle",
      validation: { min: 0.1, max: 0.4, step: 0.05 }
    },
    {
      name: "categoryWeight",
      label: "Poids des catégories",
      type: "slider",
      category: "detection",
      required: false,
      defaultValue: 0.10,
      description: "Importance du chevauchement des types de courses",
      validation: { min: 0.0, max: 0.3, step: 0.05 }
    },
    {
      name: "maxDistanceKm",
      label: "Distance max (km)",
      type: "number",
      category: "detection",
      required: false,
      defaultValue: 15,
      description: "Distance maximum entre deux événements pour être considérés proches",
      validation: { min: 1, max: 50 }
    },
    {
      name: "dateTolerance",
      label: "Tolérance date (jours)",
      type: "number",
      category: "detection",
      required: false,
      defaultValue: 30,
      description: "Écart maximum en jours entre les dates d'édition",
      validation: { min: 7, max: 90 }
    },
    
    // Performance
    {
      name: "batchSize",
      label: "Taille des lots",
      type: "number",
      category: "performance",
      required: false,
      defaultValue: 100,
      description: "Nombre d'événements à traiter par exécution",
      validation: { min: 10, max: 500 }
    },
    {
      name: "rescanDelayDays",
      label: "Délai avant rescan (jours)",
      type: "number",
      category: "performance",
      required: false,
      defaultValue: 30,
      description: "Nombre de jours avant de re-analyser un événement",
      validation: { min: 7, max: 180 }
    },
    {
      name: "useMeilisearch",
      label: "Utiliser Meilisearch",
      type: "switch",
      category: "performance",
      required: false,
      defaultValue: true,
      description: "Utiliser Meilisearch pour la recherche de candidats (si configuré)"
    },
    
    // Options avancées
    {
      name: "dryRun",
      label: "Mode simulation",
      type: "switch",
      category: "performance",
      required: false,
      defaultValue: false,
      description: "Analyser sans créer de propositions (pour tests)"
    },
    {
      name: "notifySlack",
      label: "Notifier sur Slack",
      type: "switch",
      category: "general",
      required: false,
      defaultValue: false,
      description: "Envoyer un résumé des doublons détectés sur Slack"
    },
    {
      name: "excludeStatuses",
      label: "Statuts à exclure",
      type: "text",
      category: "detection",
      required: false,
      defaultValue: "",
      description: "Statuts d'événements à ignorer (séparés par virgule, ex: DRAFT,REVIEW)"
    }
  ]
}
```

---

## Algorithme de Scoring Détaillé

### 1. Score de similarité de nom (40%)

```typescript
function calculateNameScore(event1: Event, event2: Event): number {
  // Normaliser les noms
  const name1 = normalizeString(event1.name)  // "marathon lac d annecy"
  const name2 = normalizeString(event2.name)  // "marathon annecy"
  
  // Extraire les mots-clés significatifs
  const keywords1 = removeStopwords(name1).split(' ')
  const keywords2 = removeStopwords(name2).split(' ')
  
  // Score fuse.js sur le nom complet
  const fuseScore = fuzzyMatch(name1, name2)  // 0.92
  
  // Score de chevauchement des mots-clés
  const commonKeywords = intersection(keywords1, keywords2)
  const keywordScore = commonKeywords.length / Math.max(keywords1.length, keywords2.length)
  
  // Score combiné
  return fuseScore * 0.7 + keywordScore * 0.3
}
```

### 2. Score de localisation (30%)

```typescript
function calculateLocationScore(event1: Event, event2: Event): number {
  // Même ville exacte
  if (normalizeCity(event1.city) === normalizeCity(event2.city)) {
    return 1.0
  }
  
  // Même département
  const sameDept = event1.countrySubdivisionDisplayCodeLevel2 === 
                   event2.countrySubdivisionDisplayCodeLevel2
  
  // Distance géographique (si lat/lng disponibles)
  if (event1.latitude && event1.longitude && event2.latitude && event2.longitude) {
    const distanceKm = haversineDistance(
      event1.latitude, event1.longitude,
      event2.latitude, event2.longitude
    )
    
    if (distanceKm <= 5) return 1.0
    if (distanceKm <= 15) return 0.8
    if (distanceKm <= 30) return 0.5
    if (distanceKm <= 50) return 0.3
    return 0.0
  }
  
  // Fallback: même département sans coordonnées
  return sameDept ? 0.6 : 0.0
}
```

### 3. Score de proximité temporelle (20%)

```typescript
function calculateDateScore(event1: Event, event2: Event, toleranceDays: number): number {
  // Récupérer les éditions des 3 dernières années
  const recentEditions1 = getRecentEditions(event1.editions, 3)
  const recentEditions2 = getRecentEditions(event2.editions, 3)
  
  // Chercher des correspondances d'année
  let bestScore = 0
  
  for (const ed1 of recentEditions1) {
    for (const ed2 of recentEditions2) {
      // Même année ?
      if (ed1.year === ed2.year) {
        // Comparer les dates si disponibles
        if (ed1.startDate && ed2.startDate) {
          const diffDays = Math.abs(differenceInDays(ed1.startDate, ed2.startDate))
          
          if (diffDays === 0) {
            bestScore = Math.max(bestScore, 1.0)
          } else if (diffDays <= 7) {
            bestScore = Math.max(bestScore, 0.9)
          } else if (diffDays <= toleranceDays) {
            bestScore = Math.max(bestScore, 0.7)
          } else {
            bestScore = Math.max(bestScore, 0.3)  // Même année mais dates éloignées
          }
        } else {
          bestScore = Math.max(bestScore, 0.5)  // Même année, dates inconnues
        }
      }
    }
  }
  
  return bestScore
}
```

### 4. Score de catégories de courses (10%)

```typescript
function calculateCategoryScore(event1: Event, event2: Event): number {
  // Extraire les catégories de toutes les courses
  const categories1 = new Set(
    event1.editions.flatMap(e => e.races.map(r => r.categoryLevel1))
  )
  const categories2 = new Set(
    event2.editions.flatMap(e => e.races.map(r => r.categoryLevel1))
  )
  
  // Calcul du coefficient de Jaccard
  const intersection = [...categories1].filter(c => categories2.has(c))
  const union = new Set([...categories1, ...categories2])
  
  return intersection.length / union.size
}
```

### 5. Score combiné final

```typescript
function calculateDuplicateScore(
  event1: Event, 
  event2: Event, 
  config: DuplicateDetectionConfig
): DuplicateScore {
  const nameScore = calculateNameScore(event1, event2)
  const locationScore = calculateLocationScore(event1, event2)
  const dateScore = calculateDateScore(event1, event2, config.dateTolerance)
  const categoryScore = calculateCategoryScore(event1, event2)
  
  // Score pondéré
  const rawScore = (
    nameScore * config.nameWeight +
    locationScore * config.locationWeight +
    dateScore * config.dateWeight +
    categoryScore * config.categoryWeight
  )
  
  // Bonus/Malus
  let finalScore = rawScore
  
  // Bonus si même ville ET même date
  if (locationScore === 1.0 && dateScore >= 0.9) {
    finalScore = Math.min(1.0, finalScore + 0.05)
  }
  
  // Malus si grande différence d'éditions (un a 10 éditions, l'autre 1)
  const editionRatio = Math.min(
    event1.editions.length, 
    event2.editions.length
  ) / Math.max(event1.editions.length, event2.editions.length, 1)
  
  if (editionRatio < 0.2) {
    finalScore = finalScore * 0.9  // -10%
  }
  
  return {
    score: finalScore,
    details: {
      nameScore,
      locationScore,
      dateScore,
      categoryScore,
      editionRatio
    }
  }
}
```

---

## Gestion de l'État et Progression

### Structure de l'état

```typescript
interface DuplicateDetectionState {
  // Offset de traitement
  lastProcessedEventId: number
  
  // Statistiques du run actuel
  currentRunStats: {
    startedAt: string
    eventsProcessed: number
    duplicatesFound: number
    proposalsCreated: number
  }
  
  // Cache des événements déjà analysés (pour éviter les doublons de propositions)
  analyzedPairs: Map<string, { 
    analyzedAt: string
    score: number
    proposalCreated: boolean 
  }>
  
  // Statistiques globales
  totalStats: {
    totalEventsAnalyzed: number
    totalDuplicatesFound: number
    lastFullScanAt: string
  }
}
```

### Éviter les propositions en double

```typescript
// Clé unique pour une paire d'événements (ordre indépendant)
function getPairKey(eventId1: number, eventId2: number): string {
  const [min, max] = eventId1 < eventId2 
    ? [eventId1, eventId2] 
    : [eventId2, eventId1]
  return `${min}-${max}`
}

// Vérifier si une proposition existe déjà
async function hasExistingProposal(
  db: DatabaseService,
  keepEventId: number,
  duplicateEventId: number
): Promise<boolean> {
  const existing = await db.prisma.proposal.findFirst({
    where: {
      type: 'EVENT_MERGE',
      status: { in: ['PENDING', 'APPROVED'] },
      OR: [
        // keepEvent = event1, duplicate = event2
        {
          eventId: keepEventId.toString(),
          changes: {
            path: ['merge', 'duplicateEventId'],
            equals: duplicateEventId
          }
        },
        // keepEvent = event2, duplicate = event1
        {
          eventId: duplicateEventId.toString(),
          changes: {
            path: ['merge', 'duplicateEventId'],
            equals: keepEventId
          }
        }
      ]
    }
  })
  
  return existing !== null
}
```

---

## Structure de la Proposition EVENT_MERGE

La proposition créée utilise le format existant de `EVENT_MERGE` :

```typescript
const proposal = {
  type: 'EVENT_MERGE',
  status: 'PENDING',
  eventId: keepEvent.id.toString(),  // L'événement à conserver
  eventName: keepEvent.name,
  eventCity: keepEvent.city,
  confidence: duplicateScore.score,
  
  changes: {
    merge: {
      keepEventId: keepEvent.id,
      keepEventName: keepEvent.name,
      keepEventCity: keepEvent.city,
      keepEventEditionsCount: keepEvent.editions.length,
      duplicateEventId: duplicateEvent.id,
      duplicateEventName: duplicateEvent.name,
      duplicateEventCity: duplicateEvent.city,
      duplicateEventEditionsCount: duplicateEvent.editions.length,
      newEventName: null,  // Peut être suggéré si un nom est "meilleur"
      copyMissingEditions: true
    }
  },
  
  justification: [
    {
      type: 'duplicate_detection',
      message: `Doublon potentiel détecté (score: ${(duplicateScore.score * 100).toFixed(1)}%)`,
      metadata: {
        detectionMethod: 'automatic',
        agentVersion: DUPLICATE_DETECTION_AGENT_VERSION,
        scores: duplicateScore.details,
        keepEventReason: 'Plus d\'éditions',  // ou autre critère
        analyzedAt: new Date().toISOString()
      }
    }
  ],
  
  sourceMetadata: {
    type: 'INTERNAL_ANALYSIS',
    extractedAt: new Date().toISOString(),
    extra: {
      agentType: 'DUPLICATE_DETECTION'
    }
  }
}
```

---

## Choix de l'Événement à Conserver

Heuristique pour décider quel événement est le "principal" :

```typescript
function chooseKeepEvent(event1: Event, event2: Event): {
  keepEvent: Event
  duplicateEvent: Event
  reason: string
} {
  // 1. Celui avec le plus d'éditions
  if (event1.editions.length !== event2.editions.length) {
    const [keep, dup] = event1.editions.length > event2.editions.length
      ? [event1, event2]
      : [event2, event1]
    return {
      keepEvent: keep,
      duplicateEvent: dup,
      reason: `Plus d'éditions (${keep.editions.length} vs ${dup.editions.length})`
    }
  }
  
  // 2. Celui avec status LIVE (vs DRAFT, REVIEW)
  if (event1.status === 'LIVE' && event2.status !== 'LIVE') {
    return { keepEvent: event1, duplicateEvent: event2, reason: 'Status LIVE' }
  }
  if (event2.status === 'LIVE' && event1.status !== 'LIVE') {
    return { keepEvent: event2, duplicateEvent: event1, reason: 'Status LIVE' }
  }
  
  // 3. Celui créé en premier (plus ancien)
  if (event1.createdAt < event2.createdAt) {
    return { keepEvent: event1, duplicateEvent: event2, reason: 'Plus ancien' }
  }
  
  return { keepEvent: event2, duplicateEvent: event1, reason: 'Plus ancien' }
}
```

---

## Tests Unitaires

### Fichiers de test à créer

| Fichier | Description |
|---------|-------------|
| `apps/agents/src/duplicate-detection/__tests__/scoring.test.ts` | Tests du scoring |
| `apps/agents/src/duplicate-detection/__tests__/candidates.test.ts` | Tests recherche candidats |
| `apps/agents/src/__tests__/DuplicateDetectionAgent.test.ts` | Tests intégration agent |

### Cas de test principaux

1. **Scoring du nom**
   - Noms identiques → score 1.0
   - Noms avec mots inversés ("Marathon Paris" vs "Paris Marathon") → score ≥ 0.9
   - Noms avec préfixes/suffixes ("Le Marathon de Paris" vs "Marathon Paris") → score ≥ 0.85
   - Noms complètement différents → score < 0.3

2. **Scoring de localisation**
   - Même ville → score 1.0
   - Même département, ville différente → score 0.6
   - Distance < 5km → score 1.0
   - Distance 15km → score 0.8
   - Distance > 50km → score 0.0

3. **Scoring de date**
   - Même date exacte → score 1.0
   - Écart 7 jours → score 0.9
   - Écart 30 jours → score 0.7
   - Années différentes sans overlap → score 0.0

4. **Score combiné**
   - Doublon évident (même nom, ville, date) → score ≥ 0.95
   - Doublon probable (nom similaire, même ville) → score ≥ 0.85
   - Faux positif (nom similaire, villes éloignées) → score < 0.80

5. **Gestion des cas limites**
   - Événement sans éditions
   - Événement sans coordonnées GPS
   - Événement avec nom très court (< 3 caractères)
   - Auto-comparaison (même événement) → exclus

---

## Étapes d'Implémentation

### Phase 1 : Infrastructure (Jour 1)
- [ ] Créer le schéma de configuration dans `packages/types`
- [ ] Créer la structure de fichiers de l'agent
- [ ] Enregistrer l'agent dans le registry
- [ ] Ajouter les métadonnées API

### Phase 2 : Algorithme de Scoring (Jour 2)
- [ ] Implémenter `calculateNameScore()`
- [ ] Implémenter `calculateLocationScore()` avec haversine
- [ ] Implémenter `calculateDateScore()`
- [ ] Implémenter `calculateCategoryScore()`
- [ ] Implémenter `calculateDuplicateScore()` combiné
- [ ] Écrire les tests unitaires du scoring

### Phase 3 : Recherche de Candidats (Jour 3)
- [ ] Implémenter la recherche SQL en entonnoir
- [ ] Ajouter le support Meilisearch optionnel
- [ ] Implémenter le filtrage des paires déjà analysées
- [ ] Écrire les tests de recherche

### Phase 4 : Agent Principal (Jour 4)
- [ ] Implémenter `DuplicateDetectionAgent.run()`
- [ ] Gestion de l'état et progression
- [ ] Création des propositions EVENT_MERGE
- [ ] Éviter les doublons de propositions
- [ ] Tests d'intégration

### Phase 5 : Validation et Documentation (Jour 5)
- [ ] Tests end-to-end sur données réelles
- [ ] Ajustement des seuils si nécessaire
- [ ] Documentation IMPLEMENTATION.md
- [ ] Mise à jour CLAUDE.md

---

## Dépendances

### Packages existants utilisés
- `@data-agents/agent-framework` : BaseAgent, AgentContext, etc.
- `@data-agents/database` : Prisma client, services
- `@data-agents/types` : Types partagés, ConfigSchema
- `fuse.js` : Fuzzy matching (déjà utilisé par event-matcher)
- `date-fns` : Manipulation de dates

### Aucune nouvelle dépendance requise

---

## Risques et Mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Trop de faux positifs | Pollution de la queue de validation | Seuil conservateur (0.80), tests sur données réelles |
| Performance N² | Temps d'exécution explosif | Recherche en entonnoir, batching, Meilisearch |
| Propositions en double | Confusion utilisateur | Vérification avant création, cache des paires |
| Choix du keepEvent incorrect | Perte de données importantes | Heuristique claire, validation humaine |

---

## Décisions Techniques

| Question | Décision |
|----------|----------|
| **Mode "dry run"** | Oui, option configurable `dryRun: true` |
| **Notification Slack** | Oui, configurable via `notifySlack: true` |
| **Fréquence d'exécution** | Utilise le système de fréquence flexible (voir ci-dessous) |
| **Exclusion d'événements** | Non par défaut, mais configurable via `excludeStatuses` |

### Fréquence Flexible

L'agent utilise le système de fréquence flexible (`FrequencyConfig`) au lieu des expressions cron :

```typescript
// Exemple de configuration recommandée
frequency: {
  type: 'daily',
  windowStart: '02:00',  // Entre 2h et 5h du matin
  windowEnd: '05:00',
  jitterMinutes: 60      // ± 1h de variance
}
```

Voir `docs/feature-flexible-agent-frequency/IMPLEMENTATION.md` pour les détails du système.
