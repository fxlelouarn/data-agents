# Fix : Déduplication et progression du scraper FFA

**Date** : 2025-11-06  
**Problèmes résolus** :
1. Propositions dupliquées (race condition dans déduplication)
2. État d'avancement refaisant la dernière combinaison ligue-mois

---

## 🔴 Problème 1 : Propositions dupliquées

### Symptômes
- Plusieurs propositions identiques pour la même édition (ex: 3 propositions identiques pour 10172-40098)
- Les propositions ont exactement les mêmes changements (même hash)

### Cause racine

**Race condition dans le processus de déduplication** :

```
Temps  │ Compétition A            │ Compétition B            │ Base de données
───────┼──────────────────────────┼──────────────────────────┼──────────────────
  1    │ Match édition 10172      │                          │ 0 propositions
  2    │ Query: propositions?     │                          │ 0 propositions
  3    │ Résultat: []             │                          │ 0 propositions
  4    │ Cache en mémoire: ✅     │                          │ 0 propositions
  5    │                          │ Match édition 10172      │ 0 propositions
  6    │                          │ Query: propositions?     │ 0 propositions
  7    │                          │ Résultat: []             │ 0 propositions
  8    │                          │ Cache en mémoire: ✅     │ 0 propositions
  9    │ [Toutes sauvegardées en batch à la fin] ─────────> │ 2+ propositions ❌
```

Le problème : **les propositions sont créées en mémoire et sauvegardées en batch** (lignes 974-994). Si plusieurs compétitions matchent la même édition dans le même run, la requête Prisma (ligne 769) ne voit que les propositions déjà persistées en DB, pas celles en mémoire.

### Solution implémentée

**Cache en mémoire partagé entre toutes les compétitions d'un même run** :

```typescript
// Dans run() - ligne 915
const proposalsCache = new Map<string, Set<string>>()
// Map<editionId, Set<changeHash>>

// Passé à createProposalsForCompetition() - ligne 940
const proposals = await this.createProposalsForCompetition(
  competition,
  matchResult,
  config,
  context,
  proposalsCache // ✅ Cache partagé
)

// Vérification dans createProposalsForCompetition() - lignes 798-817
if (proposalsCache) {
  const changeHash = crypto.createHash('sha256')
    .update(JSON.stringify(changes))
    .digest('hex')
  const cacheKey = matchResult.edition.id.toString()
  
  if (!proposalsCache.has(cacheKey)) {
    proposalsCache.set(cacheKey, new Set())
  }
  
  // ❌ Déjà créée dans ce run ?
  if (proposalsCache.get(cacheKey)!.has(changeHash)) {
    context.logger.info(`⏭️  Proposition identique déjà créée dans ce run`)
    return proposals
  }
  
  // ✅ Enregistrer dans le cache
  proposalsCache.get(cacheKey)!.add(changeHash)
}
```

**Résultat** : Double protection
1. Vérification DB : propositions déjà persistées (ligne 788)
2. Vérification cache : propositions créées dans ce run (ligne 808)

---

## 🟡 Problème 2 : État d'avancement refait la dernière combinaison

### Symptômes
- Après un crash/erreur, le scraper refait la dernière combinaison ligue-mois
- Propositions potentiellement recréées

### Cause racine

**Sauvegarde tardive de la progression** :

```typescript
// Ligne 932 : Mois marqué comme complété
if (!progress.completedMonths[ligue].includes(month)) {
  progress.completedMonths[ligue].push(month)
}

// Ligne 936 : Attendre délai
await humanDelay(config.humanDelayMs)

// ... Traitement d'autres mois/ligues ...

// Ligne 970 : Sauvegarde de la progression ⚠️ TROP TARD
await this.saveProgress(progress)
```

**Scénario de perte** :
1. Agent traite `Ligue A - Janvier` → marque complété en mémoire
2. Agent traite `Ligue A - Février` → crash avant saveProgress()
3. Redémarrage → `completedMonths` vide → refait Janvier **ET** Février

### Solution implémentée

**Sauvegarde immédiate après chaque mois complété** :

```typescript
// Ligne 965-966
await this.saveProgress(progress)
context.logger.info(`💾 Progression sauvegardée: ${ligue} - ${month}`)
```

**Bénéfices** :
- ✅ Crash pendant `Février` → Janvier déjà sauvegardé → reprend à Février
- ✅ Pas de perte de progression
- ✅ Idempotence : refaire un mois n'est pas grave (déduplication en place)

**Note** : La sauvegarde finale (ligne 1004) met à jour les statistiques globales (`totalCompetitionsScraped`, `lastCompletedAt`).

---

## 📊 Impact sur les performances

### Sauvegarde progressive (Fix 2)
- **Avant** : 1 écriture DB pour tout le run (N ligues × M mois)
- **Après** : N×M écritures DB (1 par mois)
- **Impact** : Négligeable (sauvegarde dans `AgentState` via Prisma)
- **Trade-off** : Performance vs résilience → résilience prioritaire

### Cache en mémoire (Fix 1)
- **Overhead** : O(P) mémoire où P = nombre de propositions créées
- **Gain** : Évite P² requêtes Prisma potentielles en cas de doublons
- **Impact net** : Positif (moins de requêtes DB)

---

## 🧪 Comment tester

### Test 1 : Déduplication intra-run

1. Trouver une compétition FFA qui match plusieurs fois la même édition
2. Lancer le scraper avec logs détaillés
3. Vérifier dans les logs :
   ```
   ⏭️  Proposition identique déjà créée dans ce run pour édition 41175
   ```
4. Vérifier en DB : 1 seule proposition créée

### Test 2 : Progression incrémentale

1. Lancer le scraper
2. Tuer le processus pendant le traitement d'un mois
3. Vérifier dans `AgentState` que les mois complétés avant le crash sont sauvegardés
4. Relancer → doit reprendre au mois suivant, pas refaire les mois complétés

---

## 📝 Fichiers modifiés

- `apps/agents/src/FFAScraperAgent.ts` :
  - Ligne 601 : Ajout paramètre `proposalsCache` à `createProposalsForCompetition()`
  - Lignes 797-817 : Vérification cache avant création proposition
  - Ligne 915 : Initialisation cache au début du run
  - Ligne 940 : Passage cache à `createProposalsForCompetition()`
  - Lignes 965-966 : Sauvegarde progression après chaque mois

---

## 🔄 Prochaines améliorations possibles

### Problème 3 (cosmétique) : Compteur groupé incorrect
- **Symptôme** : Frontend affiche "2 propositions" alors qu'il y en a 3
- **Cause** : Groupement sur données paginées côté frontend
- **Solution** : Ajouter agrégation SQL dans API `/api/proposals` pour compter réellement par groupe
- **Priorité** : Basse (n'affecte pas la fonctionnalité)

### Optimisation : Batch insert des propositions
- **Actuel** : Insertion 1 par 1 (lignes 974-994)
- **Potentiel** : `prisma.proposal.createMany()` en batch
- **Gain** : Réduction requêtes DB de O(N) à O(1)
- **Complexité** : Gestion des erreurs partielles plus difficile
