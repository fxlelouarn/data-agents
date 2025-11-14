# Tests - Single Group Application

## Checklist de tests

### ✅ Backend

#### Endpoint `/api/proposals/validate-block-group`

**Test 1 : Validation basique**
```bash
# Propositions : cmhstf28403tjmu3ref0q3nbz, cmhstf284...
curl -X POST http://localhost:4001/api/proposals/validate-block-group \
  -H "Content-Type: application/json" \
  -d '{
    "proposalIds": ["cmhstf28403tjmu3ref0q3nbz", "cmhstf284..."],
    "block": "edition",
    "changes": {
      "startDate": "2025-11-14T23:00:00.000Z",
      "endDate": "2025-11-14T23:00:00.000Z"
    }
  }'
```

**Vérifications :**
- [ ] Toutes les propositions ont `approvedBlocks.edition = true`
- [ ] Toutes les propositions ont `userModifiedChanges` mergé
- [ ] UNE SEULE `ProposalApplication` créée quand tous les blocs sont validés
- [ ] `proposalIds` contient tous les IDs du groupe

#### Application groupée

**Test 2 : Application avec mode groupé**
```bash
# 1. Valider tous les blocs
curl -X POST http://localhost:4001/api/proposals/validate-block-group ...

# 2. Vérifier la ProposalApplication
psql "$DATABASE_URL" -c "
  SELECT id, \"proposalId\", \"proposalIds\", status 
  FROM proposal_applications 
  WHERE \"proposalId\" = 'cmhstf28403tjmu3ref0q3nbz';
"

# 3. Appliquer l'update
POST /api/updates/{applicationId}/apply
```

**Vérifications :**
- [ ] Logs backend contiennent `📦 MODE GROUPÉ détecté: N propositions`
- [ ] Logs backend contiennent `✅ Application unique pour le groupe [...]`
- [ ] Une seule mise à jour appliquée dans Miles Republic
- [ ] `proposalIds` passé correctement à `ProposalDomainService`

### ✅ Frontend

#### Hook `useBlockValidation`

**Test 3 : Validation groupée depuis l'UI**

**Étapes :**
1. Ouvrir une proposition groupée (ex: `/proposals/group/10172-40098`)
2. Modifier un champ (ex: distance d'une course)
3. Cliquer sur "Valider" pour le bloc `races`
4. Observer les logs console

**Vérifications :**
- [ ] Log `📦 [useBlockValidation] MODE GROUPÉ - Bloc "races"`
- [ ] Payload contient `proposalIds` (array)
- [ ] Payload contient `changes` (object consolidé)
- [ ] Un seul appel API POST `/validate-block-group`
- [ ] Snackbar : "N propositions mises à jour"

**Test 4 : Validation de tous les blocs**

**Étapes :**
1. Ouvrir une proposition groupée
2. Cliquer sur "Tout valider (blocs)"
3. Observer les logs console

**Vérifications :**
- [ ] 4 appels à `validateBlock()` (event, edition, organizer, races)
- [ ] Chaque appel utilise le mode groupé
- [ ] À la fin, toutes les propositions sont `APPROVED`
- [ ] Une seule `ProposalApplication` créée

### ✅ Base de données

#### Schéma

**Test 5 : Migration Prisma**

```bash
psql "$DATABASE_URL" -c "\d proposal_applications"
```

**Vérifications :**
- [ ] Colonne `proposalIds` existe (type `TEXT[]`)
- [ ] Valeur par défaut : `ARRAY[]::TEXT[]`

**Test 6 : Données créées**

```bash
psql "$DATABASE_URL" -c "
  SELECT 
    id, 
    \"proposalId\", 
    array_length(\"proposalIds\", 1) as group_size,
    status
  FROM proposal_applications
  WHERE array_length(\"proposalIds\", 1) > 1;
"
```

**Vérifications :**
- [ ] `proposalIds` contient plusieurs IDs
- [ ] `proposalId` = premier ID du groupe

### ✅ Workflow complet (E2E)

**Scénario : Validation et application d'un groupe**

**Étapes :**
1. Ouvrir `/proposals/group/10172-40098`
2. Vérifier que 3 propositions sont affichées
3. Modifier la `startDate` de l'édition
4. Valider le bloc `edition`
5. Valider le bloc `races`
6. Valider le bloc `event`
7. Valider le bloc `organizer`
8. Vérifier que les propositions passent à `APPROVED`
9. Aller dans "Mises à jour en attente"
10. Appliquer la mise à jour
11. Vérifier les logs d'application
12. Vérifier dans Miles Republic que la modification est appliquée UNE SEULE FOIS

**Logs attendus :**

**Backend (validation):**
```
📦 validate-block-group appelé avec: { proposalIds: [...], block: 'edition', changesKeys: ['startDate', 'endDate'] }
✅ Propositions mises à jour: [...]
✅ Application groupée créée: cm...
```

**Backend (application):**
```
📦 Mode groupé détecté: 3 propositions
📦 MODE GROUPÉ détecté: 3 propositions
✅ Application unique pour le groupe [...]
```

**Frontend:**
```
📦 [useBlockValidation] MODE GROUPÉ - Bloc "edition": { proposalIds: [...], proposalCount: 3, changes: {...} }
📦 useUpdateProposal MODE GROUPÉ: 3 propositions, bloc "edition"
✅ [useBlockValidation] Bloc "edition" validé pour 3 propositions
```

### ✅ Edge cases

**Test 7 : Propositions déjà approuvées**
- [ ] Ne pas recréer de `ProposalApplication` si elle existe déjà

**Test 8 : Validation partielle**
- [ ] Valider seulement 2 blocs sur 4
- [ ] Status reste `PENDING`
- [ ] Pas de `ProposalApplication` créée

**Test 9 : Annulation d'approbation**
- [ ] Annuler un bloc validé
- [ ] Vérifier que `approvedBlocks[blockKey]` est retiré
- [ ] Si c'était le dernier bloc, status repasse à `PENDING`

## Métriques de succès

- ✅ **Zéro duplication** : Une seule mise à jour appliquée dans Miles Republic
- ✅ **Logs clairs** : Mode groupé identifiable dans les logs
- ✅ **Performance** : Temps de validation réduit (1 appel vs N appels)
- ✅ **Cohérence** : Toutes les propositions du groupe ont le même état

## Bugs connus à vérifier

### Bug #1 : Payload incomplet (FIX 2025-11-11)
- Valider qu'une modification manuelle + modification agent sont TOUTES envoyées

### Bug #2 : Blocs disparaissant après validation (FIX 2025-11-14)
- Valider que les blocs restent visibles après validation

## Rollback plan

Si l'implémentation pose problème :

1. Revert frontend : Rétablir l'ancien `useBlockValidation` (1 appel par proposition)
2. Revert backend : Désactiver l'endpoint `/validate-block-group`
3. Revert DB : Migration Prisma pour retirer `proposalIds`

**Note :** Les anciennes `ProposalApplication` sans `proposalIds` continuent de fonctionner (rétrocompatibilité).
