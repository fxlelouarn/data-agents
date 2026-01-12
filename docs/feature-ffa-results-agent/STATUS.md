# FFA Results Agent - Statut

## Résumé

| Phase | Statut | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Terminée | Pré-remplissage des éditions MR opérées |
| Phase 2 | ✅ Terminée | Scraping FFA + matching |
| Phase 3 | ✅ Terminée | Interface pour propositions sans match |

---

## Approche finale : Création de propositions sans match + Interface dédiée

**Décision mise à jour (2026-01-12)** : Créer des propositions même sans match automatique, avec une interface dédiée pour l'association manuelle.

### Comportement
```
Score >= 0.9 → Proposition EDITION_UPDATE créée avec eventId/editionId
Score < 0.9  → Proposition EDITION_UPDATE créée SANS eventId/editionId
               + candidats rejetés stockés dans justification
               → Interface UnmatchedResultDetail pour association manuelle
```

### Avantages
- Aucune compétition FFA n'est perdue
- L'utilisateur peut associer manuellement via Meilisearch
- Les candidats rejetés sont affichés pour faciliter le choix
- Option d'archiver les propositions non pertinentes

---

## Phase 3 : Interface utilisateur ✅

### Fichiers créés
- [x] `apps/dashboard/src/pages/proposals/detail/unmatched-result/UnmatchedResultDetail.tsx`
- [x] `apps/dashboard/src/components/EditionSelector.tsx`
- [x] `apps/dashboard/src/hooks/useLinkProposalToEdition.ts` (dans useApi.ts)

### Fichiers modifiés
- [x] `apps/api/src/routes/proposals.ts` - Endpoint `PATCH /:id/link-edition`
- [x] `apps/dashboard/src/pages/proposals/ProposalDetailDispatcher.tsx` - Routing vers UnmatchedResultDetail
- [x] `apps/dashboard/src/services/api.ts` - Méthode `linkToEdition`
- [x] `apps/agents/src/FFAResultsAgent.ts` - Création propositions sans match

### Fonctionnalités de l'interface
- Affichage des infos FFA (nom, ville, date, participants, ligue)
- Lien vers la page résultats FFA
- Liste des candidats rejetés (score < 0.9) cliquables
- Recherche Meilisearch pour trouver l'événement manuellement
- Sélecteur d'édition après choix de l'événement
- Bouton "Lier à cette édition" pour associer
- Bouton "Archiver" pour les propositions non pertinentes

### Détection des propositions non matchées
```typescript
const isUnmatchedFFAResult =
  proposalType === 'EDITION_UPDATE' &&
  !proposal.eventId &&
  proposal.justification?.some(
    (j: any) => j.metadata?.justificationType === 'ffa_source'
  )
```

---

## Phase 1 : Agent backend ✅

### Fichiers créés
- [x] `packages/types/src/agent-config-schemas/ffa-results.ts`
- [x] `apps/agents/src/FFAResultsAgent.ts`
- [x] `apps/agents/src/ffa/results-parser.ts`
- [x] `apps/agents/src/registry/ffa-results.ts`

### Fichiers modifiés
- [x] `packages/types/src/agent-versions.ts`
- [x] `packages/types/src/agent-config-schemas/index.ts`
- [x] `apps/agents/src/index.ts`
- [x] `apps/agents/src/ffa/parser.ts`
- [x] `apps/agents/src/ffa/types.ts`
- [x] `apps/api/src/services/agent-metadata.ts`

### Tests effectués
- [x] Build TypeScript passe
- [x] Agent s'enregistre correctement dans le registry
- [x] Phase 1 (MR interne) crée des propositions avec eventId/editionId
- [x] Phase 2 (scraping FFA) crée des propositions avec ou sans match

### Amélioration : Utilisation du service de matching mutualisé ✅

Le FFA Results Agent utilise maintenant le service de matching mutualisé du framework (`matchEvent`) au lieu d'un algorithme maison.

**Avantages** :
- Support Meilisearch (avec fallback SQL)
- Suppression des stopwords et sponsors
- Bonus département (+15%)
- Proximité temporelle avancée
- Code partagé avec FFA Scraper et Slack Agent

**Changements** :
- Suppression de `findMRCandidates()` (algorithme maison)
- Ajout de `matchWithFramework()` qui appelle `matchEvent` du framework
- Support de `MEILISEARCH_URL` et `MEILISEARCH_API_KEY` via variables d'environnement

---

## Phase 2 : Corrections runtime ✅

### Corrections apportées

| Bug | Correction |
|-----|------------|
| `clientStatus` inexistant | Remplacé par `customerType` |
| `LEAD_INTERNAL` inexistant | Remplacé par `LEAD_INT`, `LEAD_EXT` |
| `attendee` undefined | Modèle Prisma = `attendees` |
| `isCancelled` inexistant | Remplacé par `cancelledAt: null` |
| `paymentStatus` inexistant | Remplacé par `status` |
| `totalCompetitionsProcessed` | Renommé `totalCompetitionsScraped` |
| Dashboard crash | Ajouté `?? 0` dans ScraperProgressCard |

---

## Configuration recommandée

```yaml
liguesPerRun: 2          # Nombre de ligues par exécution
monthsPerRun: 1          # Nombre de mois par exécution
humanDelayMs: 2000       # Délai entre requêtes FFA
similarityThreshold: 0.75 # Seuil pour candidats (affiché dans rejectedMatches)
minEditionDate: "2025-01-01"
minDaysAgo: 30           # Événements terminés depuis au moins 30 jours
```

---

## Statistiques attendues

- **Phase 1** : Quelques propositions pour les éditions MR opérées (ESSENTIAL/PREMIUM)
- **Phase 2 avec match** : Propositions EDITION_UPDATE avec eventId/editionId
- **Phase 2 sans match** : Propositions EDITION_UPDATE sans eventId → Interface UnmatchedResultDetail

---

## API Endpoints

### PATCH /api/proposals/:id/link-edition

Lie une proposition sans match à une édition Miles Republic.

**Request body:**
```json
{
  "eventId": 12345,
  "editionId": 67890
}
```

**Response:**
```json
{
  "success": true,
  "message": "Proposition liée à l'édition avec succès",
  "data": { /* proposal mis à jour */ }
}
```

**Validation:**
- La proposition doit exister
- La proposition ne doit pas avoir d'eventId (sinon erreur 400)
- L'édition doit exister dans Miles Republic
