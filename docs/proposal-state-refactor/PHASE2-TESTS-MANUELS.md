# Phase 2 - Tests Manuels de Validation

**Date** : 2025-11-12  
**Statut** : 📋 À EXÉCUTER  
**Objectif** : Valider que le refactoring de l'état des propositions fonctionne correctement

## Prérequis

### 1. Environnement de développement

```bash
# Terminal 1 : API
cd /Users/fx/dev/data-agents
npm run dev:api

# Terminal 2 : Dashboard  
npm run dev:dashboard
```

**Vérifier** :
- ✅ API écoute sur `http://localhost:4001`
- ✅ Dashboard écoute sur `http://localhost:3000`
- ✅ Base de données PostgreSQL accessible

### 2. Données de test

**Préparer au moins** :
- 1 proposition **NEW_EVENT** avec plusieurs courses
- 1 proposition **EDITION_UPDATE** groupée (plusieurs agents)
- 1 proposition **EDITION_UPDATE** simple

**Comment obtenir des propositions** :
```bash
# Lancer le scraper FFA pour générer des propositions
npm run agents
```

---

## Test 1 : Édition et persistance (EDITION_UPDATE) ✅

### Objectif
Vérifier que `workingGroup` gère correctement les modifications et les sauvegarde automatiquement.

### Steps

1. **Ouvrir le dashboard**
   - URL : `http://localhost:3000/proposals`
   - Cliquer sur une proposition groupée (type EDITION_UPDATE)

2. **Éditer un champ d'édition**
   - Modifier le champ `name` : `"Trail des Loups"` → `"Trail des Loups 2026"`
   - Observer : Le champ est modifié dans l'UI

3. **Éditer une course**
   - Cliquer sur "Éditer" d'une course
   - Modifier `distance` : `10` → `13`
   - Sauvegarder la modification
   - Observer : La distance est mise à jour dans le tableau

4. **Attendre l'autosave**
   - Attendre **2 secondes** (délai d'autosave)
   - Observer dans les **DevTools Network** : Une requête `PATCH /api/proposals/:id`

5. **Recharger la page**
   - Appuyer sur `F5` ou `Cmd+R`
   - Observer : Les modifications sont **toujours présentes**

### ✅ Critères de succès

- [ ] Le champ `name` modifié est conservé après reload
- [ ] La `distance` modifiée est conservée après reload
- [ ] Aucune erreur dans la console navigateur
- [ ] Aucune erreur dans les logs API (terminal)
- [ ] La requête PATCH contient `userModifiedChanges`

### 🐛 En cas d'échec

**Symptôme** : Modifications perdues après reload  
**Diagnostic** :
1. Ouvrir **DevTools Console** (`F12`)
2. Vérifier les erreurs JavaScript
3. Ouvrir **DevTools Network** → Onglet `Fetch/XHR`
4. Vérifier si la requête PATCH a été envoyée
5. Copier le **payload** de la requête et le **response**

---

## Test 2 : Validation par blocs avec payload complet ✅

### Objectif
Vérifier que lors de la validation d'un bloc, **toutes les modifications** (proposées + manuelles) sont envoyées.

### Steps

1. **Éditer plusieurs champs**
   - Sur la même proposition que Test 1
   - Éditer champ édition : `city` → `"Paris"`
   - Éditer Course 1 : `distance` → `13`
   - Éditer Course 2 : `startDate` → nouvelle date via le date picker

2. **Ouvrir DevTools Network**
   - Appuyer sur `F12` → Onglet **Network**
   - Filter : `validate-block`

3. **Valider le bloc Edition**
   - Cliquer sur **"Valider le bloc Edition"**
   - Observer la requête `POST /api/proposals/:id/validate-block`
   - Cliquer sur la requête → Onglet **Payload**

4. **Vérifier le payload Edition**
   ```json
   {
     "blockKey": "edition",
     "proposalIds": ["cm..."],
     "changes": {
       "city": "Paris",  // ✅ Modification manuelle
       "startDate": "...",  // ✅ Proposé par agent
       "endDate": "..."     // ✅ Proposé par agent
     }
   }
   ```

5. **Valider le bloc Courses**
   - Cliquer sur **"Valider le bloc Courses"**
   - Observer la requête `POST /api/proposals/:id/validate-block`
   - Vérifier le payload

6. **Vérifier le payload Courses**
   ```json
   {
     "blockKey": "races",
     "proposalIds": ["cm..."],
     "changes": {
       "races": {
         "141826": {
           "startDate": "2025-11-14T23:00:00.000Z"  // ✅ Proposé
         },
         "141829": {
           "distance": "13",  // ✅ Modification manuelle
           "startDate": "2025-11-14T23:00:00.000Z"  // ✅ Proposé
         }
       }
     }
   }
   ```

### ✅ Critères de succès

- [ ] Le payload contient `city = "Paris"` (modification manuelle)
- [ ] Le payload contient les champs proposés par l'agent
- [ ] Le payload Courses contient `distance = "13"` (modification manuelle)
- [ ] Le payload Courses contient les `startDate` proposées
- [ ] Les blocs sont marqués **"Validé"** dans l'UI après validation
- [ ] Aucune erreur 400/500 dans Network

### 🐛 En cas d'échec

**Symptôme** : Modification manuelle absente du payload  
**Diagnostic** :
1. Copier le **payload complet** de la requête
2. Vérifier si `userModifiedChanges` est dans la requête
3. Vérifier les logs API : chercher `[validateBlock]`

---

## Test 3 : Propagation de dates aux courses ✅

### Objectif
Vérifier que la modale de propagation fonctionne avec le hook `useProposalEditor`.

### Steps

1. **Modifier startDate de l'édition**
   - Sur une proposition EDITION_UPDATE avec **plusieurs courses**
   - Cliquer sur le date picker de `startDate`
   - Sélectionner une nouvelle date

2. **Observer la modale**
   - Une modale apparaît : **"Propager aux courses ?"**
   - Message : _"Voulez-vous propager cette date aux X courses ?"_

3. **Cliquer "Oui"**
   - Observer : Toutes les courses ont maintenant la **même startDate**

4. **Recharger la page**
   - `F5` ou `Cmd+R`
   - Observer : Les dates des courses sont **conservées**

5. **Vérifier en base de données**
   ```bash
   psql "$DATABASE_URL" -c "
     SELECT 
       p.id,
       p.\"userModifiedChanges\"->'raceEdits' as race_edits
     FROM proposals p
     WHERE p.id = 'VOTRE_PROPOSITION_ID';
   "
   ```

### ✅ Critères de succès

- [ ] Modale de propagation apparaît
- [ ] Toutes les courses ont la nouvelle `startDate` après "Oui"
- [ ] Les dates sont conservées après reload
- [ ] La requête PATCH contient `raceEdits` avec les nouvelles dates
- [ ] Les données sont correctes en base

### 🐛 En cas d'échec

**Symptôme** : Dates non propagées  
**Diagnostic** :
1. Vérifier que la modale a bien ouvert (pas d'erreur avant)
2. Vérifier la console pour erreurs dans `confirmDatePropagation`
3. Vérifier si `updateFieldEditor` et `updateRaceEditor` sont appelés

---

## Test 4 : Synchronisation inverse (Course → Edition) ✅

### Objectif
Vérifier que si une course a une date **hors de la plage d'édition**, une modale propose de mettre à jour l'édition.

### Steps

1. **Connaître la plage de l'édition**
   - Noter `Edition.startDate` (ex: `15/03/2025`)
   - Noter `Edition.endDate` (ex: `16/03/2025`)

2. **Modifier une course AVANT startDate**
   - Éditer Course 1
   - Modifier `startDate` → `10/03/2025` (avant `15/03/2025`)
   - Sauvegarder

3. **Observer la modale**
   - Modale apparaît : **"Mettre à jour Edition.startDate ?"**
   - Message : _"La course [nom] démarre avant l'édition"_

4. **Cliquer "Oui"**
   - Observer : `Edition.startDate` = `10/03/2025`
   - Observer : Course également à `10/03/2025`

5. **Modifier une course APRÈS endDate**
   - Éditer Course 2
   - Modifier `startDate` → `20/03/2025` (après `16/03/2025`)
   - Sauvegarder

6. **Observer la modale**
   - Modale apparaît : **"Mettre à jour Edition.endDate ?"**

7. **Cliquer "Oui"**
   - Observer : `Edition.endDate` = `20/03/2025`

### ✅ Critères de succès

- [ ] Modale apparaît pour course avant `startDate`
- [ ] Modale apparaît pour course après `endDate`
- [ ] `Edition.startDate` mise à jour correctement
- [ ] `Edition.endDate` mise à jour correctement
- [ ] Modifications conservées après reload

### 🐛 En cas d'échec

**Symptôme** : Modale ne s'ouvre pas  
**Diagnostic** :
1. Vérifier que la date de la course est bien **hors plage**
2. Vérifier la console pour erreurs dans `handleRaceFieldModify`

---

## Test 5 : NEW_EVENT avec courses ✅

### Objectif
Vérifier que les propositions NEW_EVENT fonctionnent correctement avec le hook.

### Steps

1. **Ouvrir une proposition NEW_EVENT**
   - URL : `http://localhost:3000/proposals`
   - Cliquer sur une proposition type **NEW_EVENT**

2. **Éditer plusieurs champs**
   - Bloc Event : `name` → `"Marathon de Paris 2026"`
   - Bloc Edition : `city` → `"Paris"`
   - Bloc Courses : Course 1 → `distance` = `42`
   - Bloc Courses : Course 2 → `startDate` = nouvelle date

3. **Valider le bloc Event**
   - Cliquer **"Valider le bloc Event"**
   - Observer Network : payload contient `name = "Marathon de Paris 2026"`

4. **Valider le bloc Courses**
   - Cliquer **"Valider le bloc Courses"**
   - Observer Network : payload contient `distance = 42`

5. **Recharger la page**
   - `F5` ou `Cmd+R`
   - Observer : Toutes les modifications conservées
   - Observer : Blocs marqués **"Validé"**

### ✅ Critères de succès

- [ ] Modification `name` conservée
- [ ] Modification `city` conservée
- [ ] Modification `distance` conservée
- [ ] Modification `startDate` course conservée
- [ ] Blocs validés après reload
- [ ] Aucune erreur console

---

## Test 6 : Détection de dirty state ✅

### Objectif
Vérifier que `isDirty` détecte correctement les modifications non sauvegardées.

### Steps

1. **Observer l'état initial**
   - Ouvrir une proposition
   - Aucun champ modifié

2. **Éditer un champ**
   - Modifier `name` : `"Trail des Loups"` → `"Trail des Loups 2026"`
   - Observer immédiatement : Un indicateur visuel devrait montrer "modifications non sauvegardées"

3. **Attendre l'autosave**
   - Attendre **2 secondes**
   - Observer : Indicateur disparaît ou change (ex: "Sauvegardé ✓")

4. **Vérifier dans la console**
   - Ouvrir **React DevTools** → **Components**
   - Chercher `useProposalEditor`
   - Vérifier `isDirty` :
     - `isDirty = true` après modification
     - `isDirty = false` après autosave

### ✅ Critères de succès

- [ ] `isDirty = true` immédiatement après modification
- [ ] `isDirty = false` 2 secondes après (autosave réussi)
- [ ] Indicateur visuel cohérent avec `isDirty`
- [ ] Aucune erreur pendant l'autosave

### 🐛 En cas d'échec

**Symptôme** : `isDirty` toujours `false`  
**Diagnostic** :
1. Vérifier que `updateFieldEditor` est bien appelé
2. Vérifier les logs dans `useProposalEditor` (si ajoutés)

---

## Test 7 : Console sans erreurs ❌

### Objectif
S'assurer qu'il n'y a **aucune erreur** JavaScript/TypeScript dans la console navigateur.

### Steps

1. **Ouvrir DevTools Console**
   - `F12` → Onglet **Console**
   - Activer "Preserve log"

2. **Naviguer entre propositions**
   - Cliquer sur 3-4 propositions différentes
   - Observer la console

3. **Éditer des champs**
   - Éditer plusieurs champs sur différentes propositions
   - Observer la console

4. **Valider des blocs**
   - Valider 2-3 blocs sur différentes propositions
   - Observer la console

5. **Vérifier l'absence de :**
   - ❌ Erreurs rouges
   - ❌ Warnings `userModifiedChanges is not defined`
   - ❌ Warnings `userModifiedRaceChanges is not defined`
   - ❌ Logs `[PHASE 2]` (doivent être supprimés)

### ✅ Critères de succès

- [ ] **Aucune erreur rouge** dans la console
- [ ] **Aucun warning** lié à `userModified*`
- [ ] **Aucun log `[PHASE 2]`** (supprimés)
- [ ] Seulement des logs informatifs (si présents)

### 🐛 En cas d'échec

**Symptôme** : Erreurs dans la console  
**Diagnostic** :
1. Copier **toute la stack trace** de l'erreur
2. Noter **quelle action** a déclenché l'erreur
3. Vérifier si l'erreur bloque l'utilisation

---

## Test 8 : Compilation TypeScript ✅

### Objectif
Vérifier qu'il n'y a **aucune erreur TypeScript** dans `GroupedProposalDetailBase.tsx`.

### Steps

```bash
cd /Users/fx/dev/data-agents/apps/dashboard
npx tsc --noEmit 2>&1 | grep -E "(GroupedProposalDetailBase|Found [0-9]+ error)"
```

### ✅ Critères de succès

**Résultat acceptable 1** (idéal) :
```
(aucun résultat)
```

**Résultat acceptable 2** (4 erreurs dans RaceUpdate*) :
```
src/pages/proposals/detail/race-update/RaceUpdateDetail.tsx(33,15): error TS2322
src/pages/proposals/detail/race-update/RaceUpdateDetail.tsx(37,15): error TS2322
src/pages/proposals/detail/race-update/RaceUpdateGroupedDetail.tsx(55,15): error TS2322
src/pages/proposals/detail/race-update/RaceUpdateGroupedDetail.tsx(61,15): error TS2322
```

**Résultat NON acceptable** :
```
GroupedProposalDetailBase.tsx(XXX,YY): error TS2304: Cannot find name 'userModifiedChanges'
```

### 🐛 En cas d'échec

**Symptôme** : Erreurs TypeScript dans `GroupedProposalDetailBase.tsx`  
**Diagnostic** :
1. Copier **toutes les erreurs** TypeScript
2. Vérifier si elles concernent `userModifiedChanges` ou `userModifiedRaceChanges`

---

## Récapitulatif des tests

| # | Test | Durée | Critique |
|---|------|-------|----------|
| 1 | Édition et persistance | 3 min | 🔴 |
| 2 | Validation par blocs | 5 min | 🔴 |
| 3 | Propagation dates | 3 min | 🟡 |
| 4 | Synchronisation inverse | 3 min | 🟡 |
| 5 | NEW_EVENT | 5 min | 🔴 |
| 6 | Dirty state | 2 min | 🟢 |
| 7 | Console sans erreurs | 3 min | 🔴 |
| 8 | Compilation TypeScript | 1 min | 🔴 |

**Durée totale estimée** : ~25 minutes

---

## Résultats des tests

### Tableau de suivi

| Test | Statut | Notes | Testeur | Date |
|------|--------|-------|---------|------|
| 1. Édition et persistance | ✅ | Fix stale closure avec useRef | Warp | 2025-11-12 |
| 2. Validation par blocs | ⏳ | | | |
| 3. Propagation dates | ⏳ | | | |
| 4. Synchronisation inverse | ⏳ | | | |
| 5. NEW_EVENT | ⏳ | | | |
| 6. Dirty state | ⏳ | | | |
| 7. Console sans erreurs | ⏳ | | | |
| 8. Compilation TypeScript | ✅ | 4 erreurs RaceUpdate* (OK) | Warp | 2025-11-12 |

**Légende** :
- ⏳ À tester
- ✅ Passé
- ❌ Échoué
- ⚠️ Passé avec réserves

---

## Prochaines étapes

### Si tous les tests passent ✅

1. ✅ Phase 2 validée
2. → Passer à **Phase 3** : Migration des composants enfants
3. → Documenter l'architecture finale
4. → Déployer en staging

### Si des tests échouent ❌

1. ❌ Identifier le test échoué
2. → Copier les logs/erreurs
3. → Créer un ticket avec diagnostic complet
4. → Fixer le bug
5. → Re-tester

---

## Ressources

- `docs/proposal-state-refactor/PLAN-PROPOSAL-STATE-REFACTOR.md` - Plan global
- `docs/proposal-state-refactor/PHASE2-STEP6-PROGRESS.md` - Détails Step 6
- `apps/dashboard/src/hooks/useProposalEditor.ts` - Hook principal
- `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx` - Composant base
