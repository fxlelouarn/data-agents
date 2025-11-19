# Typage fort – Roadmap

Ce document liste les étapes d'amélioration du typage TypeScript dans le monorepo `data-agents`.

## État actuel

- **Packages (`packages/*`)** :
  - `@data-agents/types`, `@data-agents/database`, `@data-agents/agent-framework`, `@data-agents/utils`, `@data-agents/schemas` sont déjà en `strict: true`.
- **Apps** :
  - `apps/agents` : `strict: true` (OK).
  - `apps/api` : `strict: true` (activé, compilation OK).
  - `apps/dashboard` : `strict: true` (activé, à surveiller sur la durée).

## Étapes futures – apps/api

Objectif : passer d'un strict minimal (aucun `any` implicite) à un typage riche et explicite.

1. **Remplacer les `any` explicites par des types métiers**
   - Introduire des types dédiés pour les payloads d'API (ex : `CreateProposalPayload`, `ValidateBlockGroupPayload`).
   - Favoriser l'import de types partagés depuis `@data-agents/types` plutôt que des `Record<string, any>`.
   - Typer les structures JSON stockées en base (`changes`, `userModifiedChanges`, `approvedBlocks`, etc.).

2. **Typage des routes Express**
   - Utiliser les generics d'Express (`Request<Params, ResBody, ReqBody, Query>`) pour les routes critiques.
   - Créer des types de corps de requête par endpoint dans un fichier dédié (ex : `src/routes/proposals.types.ts`).
   - Ajouter une validation runtime (Zod ou similaire) alignée avec ces types si besoin.

3. **Options de compilation plus strictes** (à activer quand le code est prêt)
   - Envisager `noUnusedLocals: true` et `noUnusedParameters: true` côté API.
   - Optionnel : `noUncheckedIndexedAccess: true` sur les modules les plus sensibles.

4. **Documentation**
   - Documenter dans `docs/` les conventions de typage d'API (noms, structure des DTO, etc.).

## Étapes futures – apps/dashboard

Objectif : typage fort React/MUI, moins de `any`, meilleure sécurité sur les hooks et props.

1. **Nettoyage des `any` et types implicites**
   - Remplacer progressivement les `any` par :
     - des types d'entités partagés (`Proposal`, `Agent`, `Edition`, `Race`, ...),
     - des unions discriminées pour les types de proposition (`NEW_EVENT`, `EDITION_UPDATE`, ...).
   - Centraliser les types d'API front (par ex. `apps/dashboard/src/types/api.ts`).

2. **Composants React & hooks**
   - Typer les props des composants principaux (`GroupedProposalDetailBase`, tables de changements, sections d'organisateur, etc.).
   - Typer les hooks personnalisés (`useProposalEditor`, `useBlockValidation`, `useApi`, ...).
   - Vérifier le typage des routes et de la navigation (React Router).

3. **Options de compilation**
   - Étape ultérieure : activer `noUnusedLocals` / `noUnusedParameters` quand le code aura été nettoyé.
   - Étape encore plus stricte : envisager `noUncheckedIndexedAccess` sur les fichiers les plus critiques.

4. **Guides internes**
   - Rédiger un petit guide "Patterns de typage React/MUI" pour les composants du dashboard.

## Étapes futures – packages

Les packages sont déjà en `strict: true`, mais on peut aller plus loin :

1. **@data-agents/types**
   - S'assurer que tous les contrats entre apps utilisent ces types (et pas des inline types dupliqués).
   - Ajouter des types plus précis pour les champs JSON (`changes`, `justification`, etc.).

2. **@data-agents/database**
   - Ajouter, si nécessaire, `noUncheckedIndexedAccess: true` sur ce package en priorité (zone sensible).
   - Renforcer le typage des services de domaine (`ProposalDomainService`, etc.).

3. **@data-agents/agent-framework / utils / schemas**
   - Même approche : options plus strictes ciblées + nettoyage progressif.

## Suivi

Cette roadmap est volontairement itérative :

- Étape 1 : tout compiler en `strict: true` (fait pour `apps/api` et `apps/dashboard`).
- Étape 2 : réduire progressivement les `any` explicites dans l'API et le dashboard.
- Étape 3 : activer des options plus strictes (`noUnused*`, `noUncheckedIndexedAccess`, etc.) sur les modules stabilisés.

Les changements concrets seront référencés ici au fur et à mesure (liens vers PRs / commits si besoin).