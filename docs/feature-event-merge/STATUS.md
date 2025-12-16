# Status : Fusion d'événements (Event Merge)

## Statut global : TERMINÉ

**Branche** : `main`
**Date de début** : 2025-12-15
**Date de fin** : 2025-12-16
**Dernière mise à jour** : 2025-12-16 (amélioration affichage détail EVENT_MERGE)

---

## Progression

| Phase | Description | Statut |
|-------|-------------|--------|
| Phase 1 | Backend - Schéma et Types | TERMINÉ |
| Phase 2 | Backend - Endpoint de création | TERMINÉ |
| Phase 3 | Backend - Application de la fusion | TERMINÉ |
| Phase 3b | Backend - Copie des éditions manquantes | TERMINÉ |
| Phase 4 | Frontend - Page de création | TERMINÉ |
| Phase 5 | Frontend - Intégration | TERMINÉ |
| Phase 6 | Frontend - Vue détail | TERMINÉ |
| Tests | Tests unitaires et d'intégration | TERMINÉ |
| Documentation | PLAN.md, IMPLEMENTATION.md, STATUS.md | TERMINÉ |

---

## Fichiers modifiés/créés

### Backend

| Fichier | Action | Statut |
|---------|--------|--------|
| `packages/database/prisma/schema.prisma` | Modifié - Ajout EVENT_MERGE | TERMINÉ |
| `packages/types/src/database.ts` | Modifié - Ajout EVENT_MERGE | TERMINÉ |
| `apps/api/src/routes/proposals.ts` | Modifié - POST /merge | TERMINÉ |
| `apps/api/src/routes/events.ts` | Modifié - GET /:id/details | TERMINÉ |
| `packages/database/src/services/proposal-domain.service.ts` | Modifié - applyEventMerge() | TERMINÉ |

### Frontend

| Fichier | Action | Statut |
|---------|--------|--------|
| `apps/dashboard/src/types/index.ts` | Modifié - Ajout EVENT_MERGE | TERMINÉ |
| `apps/dashboard/src/services/api.ts` | Modifié - eventsApi, proposalsApi | TERMINÉ |
| `apps/dashboard/src/hooks/useApi.ts` | Modifié - useEventDetails, useCreateMergeProposal | TERMINÉ |
| `apps/dashboard/src/pages/EventMerge.tsx` | **Créé** | TERMINÉ |
| `apps/dashboard/src/pages/ProposalList.tsx` | Modifié - Menu dropdown | TERMINÉ |
| `apps/dashboard/src/App.tsx` | Modifié - Route /events/merge | TERMINÉ |
| `apps/dashboard/src/pages/proposals/detail/event-merge/EventMergeDetail.tsx` | **Créé** | TERMINÉ |
| `apps/dashboard/src/pages/proposals/ProposalDetailDispatcher.tsx` | Modifié - case EVENT_MERGE | TERMINÉ |
| `apps/dashboard/src/constants/proposals.ts` | Modifié - Labels et styles | TERMINÉ |

### Tests

| Fichier | Tests | Statut |
|---------|-------|--------|
| `packages/database/src/services/__tests__/event-merge.test.ts` | 20 tests | TERMINÉ |
| `apps/api/src/routes/__tests__/proposals.merge.test.ts` | 22 tests | TERMINÉ |
| `apps/dashboard/src/pages/proposals/detail/event-merge/__tests__/EventMergeDetail.test.tsx` | 19 tests | TERMINÉ |
| `apps/dashboard/src/pages/__tests__/EventMerge.test.tsx` | 16 tests | TERMINÉ |

---

## Tests

### Résultats

```
Backend (event-merge.test.ts)        : 20/20 PASS
Backend (proposals.merge.test.ts)    : 22/22 PASS
Frontend (EventMergeDetail.test.tsx) : 19/19 PASS
Frontend (EventMerge.test.tsx)       : 16/16 PASS
----------------------------------------
Total                                : 77/77 PASS
```

### Commandes de test

```bash
# Backend - ProposalDomainService
cd packages/database && npx jest --testPathPatterns="event-merge"

# Backend - API endpoints
cd apps/api && npx jest --testPathPatterns="proposals.merge"

# Frontend - EventMergeDetail
cd apps/dashboard && npx jest --testPathPatterns="EventMergeDetail"

# Frontend - EventMerge page
cd apps/dashboard && npx jest --testPathPatterns="pages/__tests__/EventMerge"
```

---

## Vérifications

### TypeScript

```bash
npm run tsc  # PASS
```

### Build

```bash
npm run build  # À vérifier en production
```

---

## Utilisation

### Accès à la fonctionnalité

1. Aller sur `/proposals`
2. Cliquer sur "Nouvelle proposition"
3. Sélectionner "Fusionner des doublons"

### Workflow complet

1. **Création** : Sélectionner 2 événements, choisir celui à conserver, soumettre
2. **Révision** : Voir la proposition dans `/proposals`, approuver/rejeter
3. **Application** : Après approbation, appliquer depuis `/updates`
4. **Résultat** : 
   - Événement conservé : `oldSlugId` = ID du doublon
   - Événement doublon : `status` = DELETED

---

## Notes techniques

### Heuristique de suggestion

L'événement avec le plus d'éditions est suggéré par défaut comme événement à conserver.

### Gestion de oldSlugId existant

Un événement ne peut avoir qu'un seul `oldSlugId`. Si l'événement choisi a déjà un `oldSlugId` :

1. **oldSlugId orphelin** (pointe vers un événement inexistant) : L'écrasement est automatique
2. **oldSlugId valide** (pointe vers un événement existant) : 
   - Une alerte s'affiche avec l'option de forcer
   - L'utilisateur peut confirmer pour écraser l'ancienne redirection
   - Le paramètre `forceOverwrite: true` est envoyé à l'API

### Copie des éditions manquantes

Lors de la fusion, les éditions du doublon qui n'existent pas (par année) sur l'événement conservé sont automatiquement copiées :

1. **Option activée par défaut** : `copyMissingEditions: true`
2. **Comparaison par année** : Une édition 2023 du doublon est copiée seulement si l'événement conservé n'a pas d'édition 2023
3. **Copie complète** : Les courses associées à chaque édition copiée sont également copiées
4. **Toggle frontend** : L'utilisateur peut désactiver cette option dans l'interface
5. **Prévisualisation** : Avant création, l'interface affiche les éditions qui seront copiées

### Éditions du doublon

Les éditions de l'événement doublon ne sont pas supprimées. Elles restent liées à l'événement marqué DELETED.
Les éditions copiées sont de **nouvelles** entrées créées sur l'événement conservé.

---

## Améliorations futures potentielles

1. **Agent automatique** : Détecter automatiquement les doublons potentiels
2. **Historique des redirections** : Supporter plusieurs `oldSlugId` (table de jointure)
3. **Fusion en masse** : Interface pour fusionner plusieurs paires d'événements
