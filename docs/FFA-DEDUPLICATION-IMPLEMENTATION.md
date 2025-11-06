# Implémentation de la déduplication des propositions FFA

## 📋 Contexte

**Problème identifié** : L'agent FFA Scraper créait des propositions identiques multiples (ex: grouped proposal 5925-40214 avec 4 propositions identiques).

**Cause racine** :
1. L'agent rescannait les mêmes événements sans vérifier les propositions PENDING déjà créées
2. Pas de détection de contenu identique avant création de proposition
3. Le cooldown global ne vérifiait pas correctement si un cycle complet était terminé

## ✅ Solution implémentée

### 1. Module de déduplication créé
**Fichier** : `/apps/agents/src/ffa/deduplication.ts`

#### Fonctions principales :

##### `hasIdenticalPendingProposal(newChanges, pendingProposals)`
- Compare le hash SHA256 des changements proposés
- Retourne `true` si une proposition identique existe déjà en PENDING
- **Usage** : Évite les doublons complets

##### `filterNewChanges(changes, currentData, pendingProposals)`
- Filtre les changements pour ne garder que les nouvelles informations
- Compare avec :
  - Les données actuelles en BD
  - Les propositions PENDING existantes
- **Usage** : Évite de proposer des changements déjà proposés ou déjà présents

##### `hasNewInformation(changes, currentData, pendingProposals)`
- Vérifie si au moins un changement apporte une nouvelle information
- **Usage** : Décision rapide sans filtrage

##### `hashChanges(changes)`
- Calcule un hash SHA256 stable des changements
- Normalise les dates, trie les clés, ignore les champs volatiles (confidence, timestamps)
- **Usage** : Détection de propositions identiques

#### Fonctions helpers privées :
- `normalizeForHashing()` : Normalise un objet pour hashing stable
- `areValuesEqual()` : Comparaison profonde de valeurs
- `getNestedValue()` : Récupération de valeurs nested (ex: "organization.name")

### 2. Modifications dans FFAScraperAgent

**Fichier** : `/apps/agents/src/FFAScraperAgent.ts`

#### Import ajouté (ligne 33) :
```typescript
import { hasIdenticalPendingProposal, hasNewInformation, filterNewChanges } from './ffa/deduplication'
```

#### Modification de `createProposalsForCompetition()` (lignes 724-787) :

**Avant création d'une proposition EDITION_UPDATE** :

1. **Récupération des propositions PENDING** (lignes 726-742)
   ```typescript
   const pendingProposals = await this.prisma.proposal.findMany({
     where: {
       editionId: matchResult.edition.id,
       status: 'PENDING',
       type: ProposalType.EDITION_UPDATE
     },
     select: { id, type, eventId, editionId, raceId, changes, status, createdAt }
   })
   ```

2. **Vérification de duplication complète** (lignes 744-751)
   - Si `hasIdenticalPendingProposal()` retourne `true` → skip (log ⏭️)
   - Log inclut le hash des changements pour debug

3. **Filtrage des changements** (lignes 753-762)
   - Utilise `filterNewChanges()` pour garder seulement les nouvelles infos
   - Si aucun changement après filtrage → skip (log ⏭️)

4. **Log du filtrage** (lignes 764-771)
   - Si des changements ont été filtrés, log détaillé (emoji 🔍)
   - Affiche : nombre original, filtré, et champs supprimés

5. **Création de la proposition** (lignes 773-786)
   - Utilise `filteredChanges` au lieu de `changes`
   - Log inclut le nombre de propositions PENDING vérifiées

#### Modification de `getNextTargets()` (lignes 111-175) :

**Amélioration du cooldown global** :

1. **Détection de cycle complet** (lignes 122-127)
   ```typescript
   const allLiguesCompleted = FFA_LIGUES.every(ligue => {
     const completedMonthsForLigue = progress.completedMonths[ligue] || []
     return allMonths.every(month => completedMonthsForLigue.includes(month))
   })
   ```

2. **Vérification du cooldown** (lignes 129-139)
   - Si cycle complet ET `lastCompletedAt` existe
   - Calcule jours écoulés depuis dernier cycle
   - Si < `rescanDelayDays` → retourne `{ ligues: [], months: [] }` (pause)
   - Log clair : "⏸️ Cooldown actif: X/30 jours"

3. **Reset après cooldown** (lignes 141-146)
   - Si cooldown écoulé → reset `completedMonths`, `currentLigue`, `currentMonth`
   - Log : "🔄 Cooldown terminé, redémarrage d'un nouveau cycle"

## 📊 Logs ajoutés

### Logs de déduplication :
- `⏭️  Proposition identique déjà en attente` : Hash identique détecté
- `⏭️  Aucune nouvelle information` : Tous les changements déjà proposés ou présents
- `🔍 Filtrage des changements` : Certains changements filtrés
- `📝 Proposition EDITION_UPDATE` : Maintenant inclut `pendingProposalsChecked`

### Logs de cooldown :
- `⏸️  Cooldown actif: X/Y jours` : En attente
- `⏭️  Prochain scan dans X jours` : Estimation
- `🔄 Cooldown terminé` : Nouveau cycle démarre

## 🧪 Tests à effectuer

### Test 1 : Duplication complète
1. Lancer l'agent avec une édition existante
2. Lancer l'agent à nouveau sans modifier la BD
3. **Résultat attendu** : Aucune proposition créée, log "⏭️ Proposition identique"

### Test 2 : Nouvelles informations partielles
1. Créer une proposition PENDING avec changement de `startDate`
2. L'agent détecte aussi `startDate` + `organizerEmail`
3. **Résultat attendu** : Proposition créée avec uniquement `organizerEmail`

### Test 3 : Cooldown global
1. Compléter un cycle complet (toutes ligues × tous mois)
2. Lancer l'agent avant 30 jours
3. **Résultat attendu** : Log "⏸️ Cooldown actif", aucun scan
4. Lancer après 30+ jours
5. **Résultat attendu** : Log "🔄 Cooldown terminé", scan reprend

### Test 4 : Cas spécifique 5925-40214
1. Identifier l'événement/édition concerné
2. Vérifier les propositions PENDING existantes
3. Lancer l'agent sur cette édition
4. **Résultat attendu** : Détection et skip des propositions identiques

## 📝 TODO restant

### À finaliser :
- [ ] **Test du système avec le grouped proposal 5925-40214**
  - Identifier l'édition concernée dans la BD
  - Vérifier les propositions en attente
  - Lancer un test dry-run de l'agent
  - Confirmer que les duplicates sont détectés

### Améliorations futures (optionnelles) :
- [ ] Ajouter un test unitaire pour `deduplication.ts`
- [ ] Monitorer les performances (requêtes DB supplémentaires)
- [ ] Indexer `editionId + status + type` dans la table `proposals` pour optimiser
- [ ] Dashboard : afficher les propositions "skippées" pour transparence

## 🔍 Debugging

### Si des duplicates persistent :

1. **Vérifier les logs** : Chercher "⏭️" et "🔍"
2. **Comparer les hash** :
   ```typescript
   const hash = require('crypto').createHash('sha256')
     .update(JSON.stringify(changes))
     .digest('hex')
   console.log('Hash:', hash.substring(0, 8))
   ```

3. **Vérifier les propositions PENDING** :
   ```sql
   SELECT id, "editionId", status, 
          LEFT(encode(digest(changes::text, 'sha256'), 'hex'), 8) as hash
   FROM proposals 
   WHERE "editionId" = 'XXX' AND status = 'PENDING';
   ```

4. **Activer les logs détaillés** :
   - Ajouter des `console.log` dans `filterNewChanges()`
   - Vérifier que `pendingProposals` est bien récupéré

### Si le cooldown ne fonctionne pas :

1. **Vérifier `lastCompletedAt`** dans AgentState :
   ```sql
   SELECT value->'lastCompletedAt' 
   FROM agent_states 
   WHERE "agentId" = 'ffa-scraper-agent' AND key = 'progress';
   ```

2. **Vérifier `completedMonths`** :
   - Doit contenir toutes les ligues avec tous les mois de la fenêtre
   - Si incomplet, le cooldown ne démarre pas

3. **Logs à surveiller** :
   - "⏸️ Cooldown actif" doit apparaître si cycle complet
   - Si absent, vérifier la logique `allLiguesCompleted`

## 📚 Références

- **BaseAgent** : `/packages/agent-framework/src/base-agent.ts`
- **AgentState** : `/packages/database/src/services/agent-state.service.ts`
- **Prisma schema** : `/packages/database/prisma/schema.prisma` (model Proposal)

## 📌 Notes importantes

1. **Performance** : La requête DB pour récupérer les propositions PENDING est exécutée **pour chaque édition matchée**. Si cela devient un problème, envisager :
   - Batch les requêtes
   - Cache des propositions PENDING au début du run
   - Index sur `(editionId, status, type)`

2. **Hash stability** : Le hash ignore `confidence` et `timestamps` pour éviter des faux négatifs. Si d'autres champs volatiles sont ajoutés, les ajouter au filtre dans `normalizeForHashing()`.

3. **Backward compatibility** : Les propositions créées avant cette implémentation ne seront pas affectées. Le système fonctionne uniquement pour les nouvelles propositions.

---

**Auteur** : Warp AI Assistant  
**Date** : 2025-11-05  
**Status** : Implémentation complète, tests en attente
