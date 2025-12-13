# Plan: Amélioration de l'Agent Slack + Contrats Agents

## Problèmes identifiés

1. **Dates incomplètes** : `startDate`/`endDate` de l'édition sans heures
2. **Pas de `startDate` sur les courses** : Seulement `startTime` (HH:mm) sans date
3. **Catégories non enrichies** : `categoryLevel1`/`categoryLevel2` manquants
4. **Bouton "Voir la source"** : Doit supporter un format générique de sourceMetadata
5. **RejectedMatchesCard non affichée** : Pas de format standardisé pour les rejectedMatches
6. **Timezone non inféré** : Doit être déduit depuis le département/pays

## Principes directeurs

1. **Contrat sur `justification`** : Format unique pour `rejectedMatches` (type obligatoire)
2. **Contrat sur `sourceMetadata`** : Format générique pour toutes les sources (URL, image, texte, Slack, FFA, etc.)
3. **Services partagés** : Timezone, catégories, normalisation → dans `packages/database`
4. **Documentation** : Mettre à jour `docs/CREATING-AGENTS.md` avec les contrats

## Architecture cible

```
┌─────────────────────────────────────────────────────────────────┐
│                    packages/database                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ src/services/                                            │   │
│  │   ├── race-enrichment/                                   │   │
│  │   │   ├── category-inference.ts  (inferRaceCategories)   │   │
│  │   │   ├── category-labels.ts     (getCategoryLabel)      │   │
│  │   │   └── race-normalizer.ts     (normalizeRaceName)     │   │
│  │   │                                                      │   │
│  │   └── timezone/                                          │   │
│  │       └── timezone-resolver.ts   (getTimezoneFromLocation)│   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ src/types/                                               │   │
│  │   ├── source-metadata.ts    (SourceMetadata générique)   │   │
│  │   └── justification.ts      (Justification standardisé)  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓ importé par
┌─────────────────────────────────────────────────────────────────┐
│                 apps/api + apps/agents                          │
│   FFAScraperAgent  →  utilise les services partagés            │
│   SlackProposalService  →  utilise les services partagés       │
│   GoogleSearchDateAgent  →  utilise les services partagés      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Fichiers à modifier/créer

### Phase 0: Contrats et Types partagés

| Fichier | Action | Description |
|---------|--------|-------------|
| `packages/database/src/types/source-metadata.ts` | Créer | Type générique SourceMetadata |
| `packages/database/src/types/justification.ts` | Créer | Type standardisé Justification avec rejectedMatches |
| `packages/database/src/index.ts` | Modifier | Exporter les nouveaux types |
| `docs/CREATING-AGENTS.md` | Modifier | Documenter les contrats sourceMetadata et justification |

### Phase 1: Services partagés

| Fichier | Action | Description |
|---------|--------|-------------|
| `packages/database/src/services/race-enrichment/category-inference.ts` | Créer | Extraire `inferRaceCategories` du FFA |
| `packages/database/src/services/race-enrichment/category-labels.ts` | Créer | Extraire `getCategoryLabel` de parser.ts |
| `packages/database/src/services/race-enrichment/race-normalizer.ts` | Créer | Extraire `normalizeRaceName` |
| `packages/database/src/services/timezone/timezone-resolver.ts` | Créer | `getTimezoneFromLocation(department, country)` |
| `packages/database/src/services/timezone/department-timezones.ts` | Créer | Mapping départements → timezones |

### Phase 2: Enrichissement dans SlackProposalService

| Fichier | Action | Description |
|---------|--------|-------------|
| `apps/api/src/services/slack/SlackProposalService.ts` | Modifier | Enrichir races, dates, timezone + utiliser contrats |

### Phase 3: Corrections Dashboard

| Fichier | Action | Description |
|---------|--------|-------------|
| `apps/dashboard/src/pages/proposals/detail/new-event/NewEventDetail.tsx` | Modifier | Chercher `type === 'rejected_matches'` |
| `apps/dashboard/src/pages/proposals/detail/new-event/NewEventGroupedDetail.tsx` | Modifier | Chercher `type === 'rejected_matches'` |
| `apps/dashboard/src/components/proposals/AgentInfoSection.tsx` | Modifier | Supporter SourceMetadata générique |

### Phase 4: Migration des agents existants (Différée)

| Fichier | Action | Description |
|---------|--------|-------------|
| `apps/agents/src/FFAScraperAgent.ts` | Différé | Utiliser services partagés + contrats |
| `apps/agents/src/GoogleSearchDateAgent.ts` | Différé | Utiliser services partagés + contrats |

---

## Ordre d'exécution

1. **Phase 0** : Créer les types partagés (SourceMetadata, Justification) + documenter dans CREATING-AGENTS.md
2. **Phase 1** : Créer les services partagés (race-enrichment, timezone)
3. **Phase 2** : Modifier `SlackProposalService` pour utiliser les contrats + enrichir les données
4. **Phase 3** : Corriger le dashboard (utiliser les types standardisés)
5. **Phase 4** : Migrer FFAScraperAgent et GoogleSearchDateAgent vers les services partagés (différé)

## Tests à effectuer

- [ ] Créer une proposition via Slack avec une URL → vérifie contrat sourceMetadata
- [ ] Vérifier que les catégories sont enrichies automatiquement
- [ ] Vérifier que les dates ont des heures (pas 00:00:00)
- [ ] Vérifier que la timezone est correctement inférée (DOM-TOM vs métropole)
- [ ] Vérifier que le bouton "Voir la source" fonctionne avec SourceMetadata générique
- [ ] Vérifier que la card "Événements similaires détectés" s'affiche (type='rejected_matches')

## Rétro-compatibilité

- **Dashboard** : Continuer à chercher `type === 'text'` en fallback pour les anciennes propositions
- **Agents existants** : Migration progressive, pas de breaking change immédiat
- **sourceMetadata** : Les anciennes propositions avec l'ancien format Slack continueront à fonctionner

## Risques

- **Breaking change potentiel** : Si on modifie la structure de `sourceMetadata` pour les propositions existantes
- **Mitigation** : Garder les anciens champs (`sourceUrl`) en plus du nouveau (`url`) pendant la migration
