# Plan d'implémentation : FFA Results Agent

## Objectif

Créer un agent qui parcourt le calendrier FFA passé pour récupérer le nombre de participants (`registrantsNumber`) des compétitions et propose des mises à jour des éditions Miles Republic correspondantes.

---

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FFA Results Agent                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PHASE 1: Pré-remplissage automatique (éditions MR opérées)                 │
│     └─ Pour les éditions avec clientStatus = ESSENTIAL | PREMIUM            │
│        → Compter les Attendees (PAID, PAID_MANUALLY, FREE, non cancelled)   │
│        → Créer proposition EDITION_UPDATE avec registrantsNumber            │
│                                                                             │
│  PHASE 2: Scraping FFA (mois par mois, ligue par ligue)                     │
│     ├─ Parcourir le calendrier FFA passé (>= 2025-01-01, < today - 30j)    │
│     ├─ Pour chaque compétition FFA avec résultats :                         │
│     │   ├─ Extraire le nombre de participants (page résultats)              │
│     │   ├─ Chercher les éditions MR candidates (matching)                   │
│     │   └─ Créer proposition avec candidats pour review utilisateur         │
│     └─ Sauvegarder la progression                                           │
│                                                                             │
│  PHASE 3: Interface utilisateur                                             │
│     └─ L'utilisateur choisit parmi les candidats MR ou cherche via          │
│        Meilisearch si aucun candidat trouvé                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Fichiers créés

| Fichier | Description |
|---------|-------------|
| `packages/types/src/agent-config-schemas/ffa-results.ts` | Schéma de configuration UI |
| `apps/agents/src/FFAResultsAgent.ts` | Agent principal (~500 lignes) |
| `apps/agents/src/ffa/results-parser.ts` | Parser HTML page résultats (~80 lignes) |
| `apps/agents/src/registry/ffa-results.ts` | Registration dans le registry |
| `docs/feature-ffa-results-agent/PLAN.md` | Ce plan |

## Fichiers modifiés

| Fichier | Modification |
|---------|--------------|
| `packages/types/src/agent-versions.ts` | Ajouté `FFA_RESULTS_AGENT: '1.0.0'` |
| `packages/types/src/agent-config-schemas/index.ts` | Export du schéma |
| `apps/agents/src/index.ts` | Enregistrement de l'agent dans le registry |
| `apps/agents/src/ffa/parser.ts` | Extraction de `resultsUrl` depuis la colonne 8 |
| `apps/agents/src/ffa/types.ts` | Ajout `resultsUrl` à `FFACompetition`, interfaces agent, mapping `DEPARTMENT_TO_LIGUE` |
| `apps/api/src/services/agent-metadata.ts` | Métadonnées agent |

---

## Architecture de l'agent

### Phase 1 : Pré-remplissage MR opérées

Pour les éditions où Miles Republic opère l'événement (`clientStatus = ESSENTIAL` ou `PREMIUM`) :
- Compter les Attendees non annulés avec `paymentStatus` dans `['PAID', 'PAID_MANUALLY', 'FREE']`
- Créer une proposition `EDITION_UPDATE` avec `registrantsNumber`
- Exclure les `clientStatus = LEAD_INTERNAL` (trop peu de participants)

### Phase 2 : Scraping FFA

Parcours du calendrier FFA passé :
- Mois par mois, ligue par ligue (même pattern que FFA Scraper)
- Filtrer les compétitions avec `resultsUrl` (colonne 8 du listing)
- Récupérer le nombre de participants depuis la page résultats
- Trouver les éditions MR candidates via fuzzy matching (Fuse.js)
- Créer une proposition avec les candidats pour validation utilisateur

### Gestion de la progression

```typescript
interface FFAResultsProgress {
  currentLigue: string
  currentMonth: string  // Format YYYY-MM
  completedLigues: string[]
  completedMonths: Record<string, string[]>  // { "ARA": ["2025-01", "2025-02"] }
  totalCompetitionsProcessed: number
  totalResultsFound: number
  lastCompletedAt?: Date
}
```

---

## Format de la proposition

```typescript
{
  type: 'EDITION_UPDATE',
  eventId: null,      // L'utilisateur choisira parmi les candidats
  editionId: null,    // L'utilisateur choisira parmi les candidats
  
  changes: {
    registrantsNumber: {
      new: 207,
      confidence: 0.95
    }
  },
  
  justification: [
    {
      type: 'ffa_source',
      content: 'Résultats FFA: 207 participants',
      metadata: {
        ffaId: '285687',
        ffaName: 'Trail de la Dagnarde',
        ffaCity: 'Saint-Julien',
        ffaDate: '2025-03-15',
        registrantsNumber: 207
      }
    },
    {
      type: 'mr_candidates',
      content: 'Éditions Miles Republic candidates',
      metadata: {
        candidates: [
          {
            eventId: 2642,
            eventName: 'Trail de la Dagnarde',
            eventCity: 'Saint-Julien',
            eventSlug: 'trail-de-la-dagnarde-2642',
            editionId: 41175,
            editionYear: '2025',
            startDate: '2025-03-15',
            registrantsNumber: null,
            matchScore: 0.92,
            nameScore: 0.95,
            cityScore: 0.88,
            dateProximity: 1.0
          }
        ],
        allowManualSearch: true
      }
    }
  ],
  
  confidence: 0.92  // Score du meilleur candidat
}
```

---

## Configuration

```typescript
interface FFAResultsConfig {
  sourceDatabase: string        // Base Miles Republic
  liguesPerRun: number          // Ligues par exécution (défaut: 2)
  monthsPerRun: number          // Mois par exécution (défaut: 1)
  humanDelayMs: number          // Délai entre requêtes (défaut: 2000)
  levels: string[]              // Niveaux FFA à traiter
  minEditionDate: string        // Date minimale (défaut: "2025-01-01")
  minDaysAgo: number            // Événements terminés depuis X jours (défaut: 30)
  similarityThreshold: number   // Seuil fuzzy matching (défaut: 0.65)
  confidenceBase: number        // Confiance de base (défaut: 0.8)
  maxCandidates: number         // Max candidats par proposition (défaut: 5)
}
```

---

## Points d'attention

1. **Saison FFA inversée** : La saison 2025 va du 1er sept 2024 au 31 août 2025.

2. **Déduplication** : Vérifier qu'aucune proposition PENDING n'existe déjà pour le même `ffaId`.

3. **Rate limiting** : Respecter le délai `humanDelayMs` entre les requêtes FFA.

4. **Mapping département → ligue** : Utiliser `DEPARTMENT_TO_LIGUE` dans `types.ts`.

---

## Prochaines étapes

1. Vérifier le build TypeScript
2. Tester l'agent en local
3. Créer le composant Meilisearch réutilisable pour le dashboard
4. Adapter l'interface de validation des propositions pour les candidats MR
