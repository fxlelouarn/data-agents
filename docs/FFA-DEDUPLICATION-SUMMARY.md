# Déduplication des propositions FFA - Résumé

## 🎯 Problème résolu
L'agent FFA Scraper créait des propositions EDITION_UPDATE identiques multiples (ex: grouped proposal 5925-40214).

## ✅ Solution (2 axes)

### 1. Vérification des propositions PENDING
**Fichier créé** : `/apps/agents/src/ffa/deduplication.ts`

Avant de créer une proposition EDITION_UPDATE, l'agent :
1. Récupère les propositions PENDING pour cette édition
2. Vérifie si une proposition identique existe (via hash SHA256)
3. Filtre les changements pour ne garder que les nouvelles informations
4. Skip si aucune nouvelle information

**Fonctions clés** :
- `hasIdenticalPendingProposal()` : Détecte doublons complets
- `filterNewChanges()` : Ne garde que les nouvelles infos
- `hashChanges()` : Hash stable pour comparaison

### 2. Amélioration du cooldown global
**Fichier modifié** : `/apps/agents/src/FFAScraperAgent.ts` → `getNextTargets()`

L'agent vérifie maintenant correctement si un cycle complet est terminé :
- Détecte si toutes les ligues × tous les mois sont scannés
- Si oui ET `lastCompletedAt` < `rescanDelayDays` → pause
- Si cooldown écoulé → reset et nouveau cycle

## 📊 Logs ajoutés
- `⏭️  Proposition identique déjà en attente` : Duplication détectée
- `⏭️  Aucune nouvelle information` : Changements déjà proposés
- `🔍 Filtrage des changements` : Certains changements filtrés
- `⏸️  Cooldown actif: X/Y jours` : En pause
- `🔄 Cooldown terminé` : Nouveau cycle

## 🧪 Test requis
**TODO** : Vérifier avec le grouped proposal 5925-40214
1. Identifier l'édition concernée
2. Lancer l'agent en dry-run
3. Confirmer que les duplicates sont détectés et skippés

## 📁 Fichiers modifiés
- ✅ **CRÉÉ** : `/apps/agents/src/ffa/deduplication.ts` (252 lignes)
- ✅ **MODIFIÉ** : `/apps/agents/src/FFAScraperAgent.ts` (2 sections)
  - Import + logique déduplication dans `createProposalsForCompetition()`
  - Amélioration cooldown dans `getNextTargets()`
- ✅ **DOC** : `/docs/FFA-DEDUPLICATION-IMPLEMENTATION.md` (complète)

## ⚡ Impact performance
- +1 requête DB par édition matchée (récupérer propositions PENDING)
- Optimisation possible : Index sur `(editionId, status, type)` dans table `proposals`

---
**Status** : ✅ Implémentation complète | 🧪 Tests en attente
