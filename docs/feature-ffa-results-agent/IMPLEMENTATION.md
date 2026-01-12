# FFA Results Agent - Implémentation

## Vue d'ensemble

L'agent FFA Results scrape le calendrier FFA passé pour récupérer le nombre de participants (`registrantsNumber`) des compétitions et propose des mises à jour des éditions Miles Republic correspondantes.

## Architecture

### Fichiers créés

| Fichier | Description |
|---------|-------------|
| `packages/types/src/agent-config-schemas/ffa-results.ts` | Schéma de configuration UI |
| `apps/agents/src/FFAResultsAgent.ts` | Agent principal (~700 lignes) |
| `apps/agents/src/ffa/results-parser.ts` | Parser HTML page résultats FFA |
| `apps/agents/src/registry/ffa-results.ts` | Registration dans le registry |

### Fichiers modifiés

| Fichier | Modification |
|---------|--------------|
| `packages/types/src/agent-versions.ts` | Ajouté `FFA_RESULTS_AGENT: '1.0.0'` |
| `packages/types/src/agent-config-schemas/index.ts` | Export du schéma |
| `apps/agents/src/index.ts` | Enregistrement de l'agent |
| `apps/agents/src/ffa/parser.ts` | Extraction de `resultsUrl` depuis colonne 8 |
| `apps/agents/src/ffa/types.ts` | Interfaces + mapping `DEPARTMENT_TO_LIGUE` |
| `apps/api/src/services/agent-metadata.ts` | Métadonnées agent |
| `apps/dashboard/src/components/ScraperProgressCard.tsx` | Gestion valeurs undefined |

---

## Phases de fonctionnement

### Phase 1 : Pré-remplissage MR opérées

Pour les éditions où Miles Republic opère l'événement (`customerType = ESSENTIAL` ou `PREMIUM`) :

```typescript
// Requête Prisma
const editions = await this.sourceDb.edition.findMany({
  where: {
    registrantsNumber: null,
    customerType: { in: ['ESSENTIAL', 'PREMIUM'] },
    startDate: { lt: new Date(), gte: new Date(config.minEditionDate) }
  },
  include: { event: true, races: true }
})

// Comptage des Attendees
const count = await this.sourceDb.attendees.count({
  where: {
    raceId: { in: raceIds },
    cancelledAt: null,
    status: { in: ['PAID', 'PAID_MANUALLY', 'FREE'] }
  }
})
```

**Résultat** : Propositions avec `confidence: 1.0`, `eventId` et `editionId` renseignés.

### Phase 2 : Scraping FFA

Parcours du calendrier FFA passé mois par mois, ligue par ligue :

1. **Scraper le listing FFA** via `fetchAllCompetitionsForPeriod()`
2. **Filtrer les compétitions avec résultats** (`resultsUrl` non null)
3. **Récupérer le nombre de participants** via `parseResultsCount()`
4. **Chercher les éditions MR candidates** via fuzzy matching (Fuse.js)
5. **Créer une proposition** avec les candidats

**Résultat** : 
- Si candidat trouvé avec score >= 0.9 : `eventId` et `editionId` pré-remplis
- Sinon : `eventId` et `editionId` null, `confidence: 0.5`

---

## Format des propositions

### Phase 1 (MR interne)

```json
{
  "type": "EDITION_UPDATE",
  "eventId": "11316",
  "editionId": "35294",
  "confidence": 1.0,
  "changes": {
    "registrantsNumber": { "new": 90, "old": null, "confidence": 1.0 }
  },
  "justification": [{
    "type": "text",
    "content": "Nombre de participants calculé depuis les inscriptions Miles Republic",
    "metadata": {
      "justificationType": "mr_internal",
      "eventName": "La Traversante",
      "eventCity": "Belleville-en-Beaujolais",
      "editionYear": "2025",
      "raceCount": 4,
      "attendeeCount": 90,
      "customerType": "ESSENTIAL"
    }
  }]
}
```

### Phase 2 (Scraping FFA)

```json
{
  "type": "EDITION_UPDATE",
  "eventId": null,
  "editionId": null,
  "confidence": 0.5,
  "changes": {
    "registrantsNumber": { "new": 289, "confidence": 0.5 }
  },
  "justification": [
    {
      "type": "text",
      "content": "Résultats FFA: 289 participants",
      "metadata": {
        "justificationType": "ffa_source",
        "ffaId": "296428",
        "ffaName": "La Moursoise",
        "ffaCity": "Mours Saint Eusebe",
        "ffaDate": "2025-01-04T00:00:00.000Z",
        "ffaLigue": "ARA",
        "registrantsNumber": 289,
        "resultsUrl": "https://www.athle.fr/..."
      }
    },
    {
      "type": "text",
      "content": "Aucune édition Miles Republic trouvée - recherche manuelle requise",
      "metadata": {
        "justificationType": "mr_candidates",
        "candidates": [],
        "allowManualSearch": true
      }
    }
  ]
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
  similarityThreshold: number   // Seuil fuzzy matching (défaut: 0.75)
  confidenceBase: number        // Confiance de base (défaut: 0.95)
  maxCandidates: number         // Max candidats par proposition (défaut: 5)
  rescanDelayDays: number       // Cooldown entre cycles (défaut: 30)
}
```

---

## Gestion de la progression

```typescript
interface FFAResultsProgress {
  currentLigue: string
  currentMonth: string           // Format YYYY-MM
  currentPage: number
  completedLigues: string[]
  completedMonths: Record<string, string[]>
  lastCompletedAt?: Date
  totalCompetitionsScraped: number
  totalResultsFound: number
  totalProposalsCreated: number
}
```

L'état est sauvegardé dans `agent_states` via `AgentStateService`.

---

## Parser de résultats

### `results-parser.ts`

```typescript
// Extrait le nombre de participants depuis la page résultats FFA
// Pattern recherché: <p>207 résultats</p>
export function parseResultsCount(html: string): number | null

// Construit l'URL de la page résultats
export function buildResultsPageURL(ffaId: string): string

// Extrait l'ID FFA depuis une URL de résultats
export function extractFFAIdFromResultsUrl(url: string): string | null
```

### Modification de `parser.ts`

Extraction de `resultsUrl` depuis la colonne 8 du listing FFA :

```typescript
// URL de la page résultats (colonne 8) - si disponible
const resultsLink = $cells.eq(7).find('a[href*="frmbase=resultats"]')
let resultsUrl: string | null = null
if (resultsLink.length > 0) {
  const resultsPath = resultsLink.attr('href')
  if (resultsPath) {
    resultsUrl = resultsPath.startsWith('http')
      ? resultsPath
      : `https://www.athle.fr${resultsPath}`
  }
}
```

---

## Matching avec Fuse.js

```typescript
const fuse = new Fuse(editions, {
  keys: [
    { name: 'event.name', weight: 0.5 },
    { name: 'event.city', weight: 0.3 }
  ],
  threshold: 1 - config.similarityThreshold,
  includeScore: true
})

const searchQuery = `${competition.name} ${competition.city}`
const results = fuse.search(searchQuery)
```

---

## Points d'attention techniques

### Enum Miles Republic

- `customerType` (pas `clientStatus`) pour identifier les éditions MR opérées
- Valeurs : `ESSENTIAL`, `PREMIUM`, `LEAD_INT`, `LEAD_EXT`, `BASIC`, `MEDIA`

### Modèle Attendees

- Nom du modèle Prisma : `attendees` (avec 's')
- Champ annulation : `cancelledAt` (pas `isCancelled`)
- Champ statut : `status` (enum `AttendeeStatus`)

### Format de progression

- Champ : `totalCompetitionsScraped` (compatible avec `ScraperProgressCard`)
