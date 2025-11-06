# Tests de la déduplication FFA - Guide pratique

## 🎯 Objectif
Vérifier que l'agent FFA Scraper ne crée plus de propositions EDITION_UPDATE dupliquées.

## ✅ Prérequis
- Agent FFA Scraper configuré et fonctionnel
- Base de données Miles Republic accessible
- Base de données data-agents accessible

## 🧪 Scénarios de test

### Test 1 : Cas réel - Grouped proposal 5925-40214

#### Étape 1 : Identifier l'édition concernée
```sql
-- Dans la base data-agents
SELECT 
  p.id,
  p."eventId",
  p."editionId",
  p.status,
  p."createdAt",
  p.changes::text
FROM proposals p
WHERE p.id LIKE '%5925-40214%'
   OR p.id LIKE '%40214%'
ORDER BY p."createdAt" DESC
LIMIT 10;
```

**Objectif** : Récupérer l'`editionId` des propositions dupliquées.

#### Étape 2 : Vérifier l'édition dans Miles Republic
```sql
-- Dans la base Miles Republic (avec l'editionId trouvé à l'étape 1)
SELECT 
  e.id,
  e.year,
  e."startDate",
  e."calendarStatus",
  ev.id as event_id,
  ev.name as event_name,
  ev.city
FROM editions e
JOIN events ev ON ev.id = e."eventId"
WHERE e.id = 'EDITION_ID_ICI';
```

#### Étape 3 : Nettoyer les propositions dupliquées (optionnel)
```sql
-- ATTENTION : Sauvegarder avant !
-- Supprimer les propositions identiques (garder la plus ancienne)
DELETE FROM proposals 
WHERE id IN (
  SELECT id FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY "editionId", 
        encode(digest(changes::text, 'sha256'), 'hex')
        ORDER BY "createdAt" ASC
      ) as rn
    FROM proposals
    WHERE "editionId" = 'EDITION_ID_ICI'
      AND status = 'PENDING'
  ) sub
  WHERE rn > 1
);
```

#### Étape 4 : Lancer l'agent en dry-run
```bash
cd /Users/fx/dev/data-agents

# Lancer l'agent
node apps/agents/dist/run-agent.js ffa-scraper-agent --dry-run
```

**Résultat attendu** :
- Log : `⏭️  Proposition identique déjà en attente pour édition XXX`
- OU Log : `⏭️  Aucune nouvelle information pour édition XXX`
- Aucune proposition créée

### Test 2 : Simulation de duplication

#### Étape 1 : Créer une proposition manuelle
```typescript
// Dans un script Node.js ou via Prisma Studio
await prisma.proposal.create({
  data: {
    agentId: 'ffa-scraper-agent',
    type: 'EDITION_UPDATE',
    status: 'PENDING',
    eventId: 'EVENT_ID_TEST',
    editionId: 'EDITION_ID_TEST',
    changes: {
      startDate: {
        old: new Date('2025-11-01'),
        new: new Date('2025-11-02'),
        confidence: 0.9
      }
    },
    justification: [{
      type: 'text',
      content: 'Test de déduplication'
    }],
    confidence: 0.9
  }
})
```

#### Étape 2 : Lancer l'agent sur cette édition
L'agent devrait détecter la proposition PENDING et :
- Si changements identiques → skip avec log `⏭️  Proposition identique`
- Si nouveaux changements → créer proposition avec seulement les nouveaux champs

### Test 3 : Cooldown global

#### Étape 1 : Vérifier l'état actuel
```sql
-- Dans la base data-agents
SELECT 
  key,
  value->'lastCompletedAt' as last_completed,
  value->'completedMonths' as completed_months,
  value->'currentLigue' as current_ligue,
  value->'currentMonth' as current_month
FROM agent_states
WHERE "agentId" = 'ffa-scraper-agent' AND key = 'progress';
```

#### Étape 2 : Simuler un cycle complet
Modifier manuellement l'état pour indiquer que toutes les ligues sont complétées :
```sql
UPDATE agent_states
SET value = jsonb_set(
  value,
  '{completedMonths}',
  '{"ARA": ["2025-11", "2025-12"], "BFC": ["2025-11", "2025-12"], ...}' -- Toutes les ligues
)
WHERE "agentId" = 'ffa-scraper-agent' AND key = 'progress';

-- Définir lastCompletedAt à il y a 10 jours
UPDATE agent_states
SET value = jsonb_set(
  value,
  '{lastCompletedAt}',
  to_jsonb(now() - interval '10 days')
)
WHERE "agentId" = 'ffa-scraper-agent' AND key = 'progress';
```

#### Étape 3 : Lancer l'agent
```bash
node apps/agents/dist/run-agent.js ffa-scraper-agent
```

**Résultat attendu** :
- Log : `⏸️  Cooldown actif: 10/30 jours écoulés`
- Log : `⏭️  Prochain scan dans 20 jours`
- Aucun scan effectué

#### Étape 4 : Simuler cooldown écoulé
```sql
UPDATE agent_states
SET value = jsonb_set(
  value,
  '{lastCompletedAt}',
  to_jsonb(now() - interval '31 days')
)
WHERE "agentId" = 'ffa-scraper-agent' AND key = 'progress';
```

Relancer l'agent :
```bash
node apps/agents/dist/run-agent.js ffa-scraper-agent
```

**Résultat attendu** :
- Log : `🔄 Cooldown terminé (31 jours), redémarrage d'un nouveau cycle complet`
- Le scan recommence depuis la première ligue

## 📊 Vérification des logs

### Logs de succès à rechercher :
```bash
# Déduplication détectée
grep "⏭️.*Proposition identique" logs/agent-ffa-scraper.log

# Filtrage de changements
grep "🔍 Filtrage des changements" logs/agent-ffa-scraper.log

# Cooldown actif
grep "⏸️.*Cooldown actif" logs/agent-ffa-scraper.log

# Nouveau cycle
grep "🔄 Cooldown terminé" logs/agent-ffa-scraper.log
```

### Compter les propositions créées
```sql
-- Avant le test
SELECT COUNT(*) FROM proposals 
WHERE "agentId" = 'ffa-scraper-agent' 
  AND status = 'PENDING'
  AND "createdAt" > now() - interval '1 hour';

-- Après le test (devrait être 0 ou très faible)
```

## 🐛 Debugging

### Si des duplicates sont encore créés :

1. **Vérifier que le code est déployé**
   ```bash
   cd /Users/fx/dev/data-agents
   grep "hasIdenticalPendingProposal" apps/agents/dist/FFAScraperAgent.js
   # Devrait retourner une ligne si compilé
   ```

2. **Activer les logs détaillés**
   Dans `FFAScraperAgent.ts`, ajouter avant l'appel à `hasIdenticalPendingProposal()` :
   ```typescript
   context.logger.info('DEBUG: Checking pending proposals', {
     editionId: matchResult.edition.id,
     pendingCount: pendingProposals.length,
     newChangesKeys: Object.keys(changes)
   })
   ```

3. **Comparer les hash manuellement**
   ```javascript
   const crypto = require('crypto')
   const changes1 = { /* changes de la proposition 1 */ }
   const changes2 = { /* changes de la proposition 2 */ }
   
   const hash1 = crypto.createHash('sha256').update(JSON.stringify(changes1)).digest('hex')
   const hash2 = crypto.createHash('sha256').update(JSON.stringify(changes2)).digest('hex')
   
   console.log('Hash 1:', hash1.substring(0, 8))
   console.log('Hash 2:', hash2.substring(0, 8))
   console.log('Equal:', hash1 === hash2)
   ```

### Si le cooldown ne fonctionne pas :

1. **Vérifier la logique completedMonths**
   ```sql
   SELECT 
     jsonb_object_keys(value->'completedMonths') as ligue,
     jsonb_array_length(value->'completedMonths'->jsonb_object_keys(value->'completedMonths')) as months_count
   FROM agent_states
   WHERE "agentId" = 'ffa-scraper-agent' AND key = 'progress';
   ```
   
   Toutes les ligues (21) doivent avoir tous les mois de la fenêtre (ex: 6 mois).

2. **Forcer un reset**
   ```sql
   UPDATE agent_states
   SET value = '{}'::jsonb
   WHERE "agentId" = 'ffa-scraper-agent' AND key = 'progress';
   ```

## ✅ Critères de succès

### Test réussi si :
1. ✅ Aucune proposition identique créée quand une PENDING existe
2. ✅ Seulement les nouveaux changements sont proposés (filtrage fonctionne)
3. ✅ Le cooldown empêche le scan avant le délai configuré
4. ✅ Les logs de déduplication apparaissent correctement
5. ✅ Le nombre de propositions créées est cohérent (pas de multiplication)

### Métriques à surveiller :
- **Avant déduplication** : ~4 propositions identiques par édition
- **Après déduplication** : ~1 proposition par édition (ou 0 si aucun changement)

---

**Note** : Ajuster les IDs et dates selon votre environnement de test.
