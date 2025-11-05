# Guide de Test - Validation par Blocs

## 🎯 Objectif

Ce guide vous permet de tester manuellement toutes les fonctionnalités de validation par bloc.

## 📋 Checklist de Test

### 1. Tests de base - Validation d'un seul bloc ✅

#### Test 1.1 : Validation du bloc Édition
**Prérequis** : Ouvrir une proposition groupée de type `EditionUpdate`

1. ✅ Le bloc "Édition" affiche un bouton **"Valider"** (vert)
2. ✅ Cliquer sur "Valider"
3. ✅ Le bouton devient **"Annuler"** (orange outlined)
4. ✅ Le header du bloc devient grisé (opacity 0.7)
5. ✅ Tous les champs du bloc sont désactivés (non-éditables)
6. ✅ Le bouton "Modifier" n'est plus visible sur les champs
7. ✅ Dans le réseau (DevTools), vérifier les appels API :
   - `PUT /api/proposals/{id}` avec `{status: 'APPROVED'}` pour chaque proposition du bloc

**Vérification backend** :
```sql
-- Vérifier que les ProposalApplications ont été créées
SELECT * FROM "ProposalApplication" 
WHERE "proposalId" IN (SELECT id FROM "Proposal" WHERE ...);
```

#### Test 1.2 : Validation du bloc Organisateur
**Prérequis** : Proposition groupée avec changements d'organisateur

1. ✅ Le bloc "Organisateur" affiche un bouton **"Valider"**
2. ✅ Cliquer sur "Valider"
3. ✅ Le bouton devient **"Annuler"**
4. ✅ Le Paper du bloc devient grisé
5. ✅ Le bouton "Approuver" est désactivé
6. ✅ Les boutons "Modifier" des champs sont masqués

#### Test 1.3 : Validation du bloc Courses
**Prérequis** : Proposition avec modifications de courses

1. ✅ Le bloc "Modifications des courses" affiche un bouton **"Valider"**
2. ✅ Cliquer sur "Valider"
3. ✅ Le bouton devient **"Annuler"**
4. ✅ La Card devient grisée
5. ✅ Les accordéons de courses sont grisés
6. ✅ Les boutons "Modifier" sur les dates de courses sont masqués

#### Test 1.4 : Validation du bloc Event
**Prérequis** : Proposition de type `EventUpdate` ou `NewEvent`

1. ✅ Le bloc "Informations de l'événement" affiche un bouton **"Valider"**
2. ✅ Cliquer sur "Valider"
3. ✅ Le bouton devient **"Annuler"**
4. ✅ Le header devient grisé
5. ✅ Tous les champs sont désactivés

### 2. Tests d'annulation ✅

#### Test 2.1 : Annuler un bloc validé
**Prérequis** : Avoir validé un bloc (ex: Édition)

1. ✅ Le bloc validé affiche un bouton **"Annuler"** (orange)
2. ✅ Cliquer sur "Annuler"
3. ✅ Le bouton redevient **"Valider"** (vert)
4. ✅ Le header redevient normal (pas grisé)
5. ✅ Les champs redeviennent éditables
6. ✅ Les boutons "Modifier" réapparaissent
7. ✅ Dans le réseau, vérifier :
   - `POST /api/proposals/{id}/unapprove` pour chaque proposition

**Vérification backend** :
```sql
-- Vérifier que les ProposalApplications ont été supprimées
SELECT * FROM "ProposalApplication" 
WHERE "proposalId" IN (...) AND status = 'PENDING';
-- Doit retourner 0 résultats
```

### 3. Tests de validation multiple ✅

#### Test 3.1 : Valider plusieurs blocs indépendamment
**Prérequis** : Proposition avec Édition + Organisateur + Courses

1. ✅ Valider le bloc "Édition"
2. ✅ Vérifier que seul ce bloc est verrouillé
3. ✅ Les autres blocs (Organisateur, Courses) restent éditables
4. ✅ Valider le bloc "Organisateur"
5. ✅ Vérifier que les deux blocs sont verrouillés
6. ✅ Le bloc "Courses" reste éditable
7. ✅ Valider le bloc "Courses"
8. ✅ Tous les blocs sont maintenant verrouillés

#### Test 3.2 : Annuler un bloc parmi plusieurs validés
**Prérequis** : Avoir validé Édition + Organisateur

1. ✅ Annuler uniquement le bloc "Édition"
2. ✅ Le bloc "Édition" redevient éditable
3. ✅ Le bloc "Organisateur" reste verrouillé
4. ✅ Annuler le bloc "Organisateur"
5. ✅ Tous les blocs sont maintenant éditables

### 4. Test du bouton "Tout valider (blocs)" ✅

#### Test 4.1 : Validation globale
**Prérequis** : Proposition avec plusieurs blocs non validés

1. ✅ Dans la navigation du haut, un bouton **"Tout valider (blocs)"** est visible
2. ✅ Le bouton est affiché uniquement si :
   - Les propositions sont en status `PENDING`
   - L'événement n'est pas mort (`isEventDead = false`)
   - Il existe au moins un bloc à valider
3. ✅ Cliquer sur "Tout valider (blocs)"
4. ✅ **Tous** les blocs deviennent validés simultanément :
   - Édition → Validé
   - Organisateur → Validé
   - Courses → Validé
   - Event → Validé (si présent)
5. ✅ Tous les boutons "Valider" deviennent "Annuler"
6. ✅ Tous les blocs sont grisés et verrouillés

**Vérification réseau** :
- Plusieurs appels `PUT /api/proposals/{id}` en parallèle

#### Test 4.2 : Bouton désactivé si pending
**Prérequis** : En cours de validation

1. ✅ Cliquer sur "Tout valider (blocs)"
2. ✅ Le bouton devient désactivé pendant le traitement
3. ✅ Le bouton reste désactivé jusqu'à la fin de tous les appels API
4. ✅ Les autres actions sont bloquées pendant ce temps

### 5. Tests d'édition combinée ✅

#### Test 5.1 : Modifier puis valider
**Prérequis** : Proposition avec champ modifiable

1. ✅ Dans le bloc "Édition", cliquer sur "Modifier" pour un champ (ex: description)
2. ✅ Modifier la valeur
3. ✅ Sauvegarder la modification
4. ✅ Le champ affiche un badge **"Modifié"** (warning)
5. ✅ Valider le bloc "Édition"
6. ✅ Le badge "Modifié" reste visible (la modification est conservée)
7. ✅ Le champ est verrouillé avec la nouvelle valeur

**Vérification API** :
```json
PUT /api/proposals/{id}
{
  "status": "APPROVED",
  "reviewedBy": "Utilisateur",
  "userModifiedChanges": {
    "description": "Nouvelle valeur"
  }
}
```

#### Test 5.2 : Valider puis modifier (impossible)
**Prérequis** : Bloc validé

1. ✅ Le bouton "Modifier" n'est plus visible
2. ✅ Impossible d'éditer les champs directement
3. ✅ Il faut d'abord "Annuler" la validation
4. ✅ Après annulation, le bouton "Modifier" réapparaît

### 6. Tests de navigation et persistance ⚠️

#### Test 6.1 : Navigation entre propositions
**Prérequis** : Avoir validé un ou plusieurs blocs

1. ⚠️ **ATTENTION** : L'état de validation est **local** (non persisté)
2. ✅ Cliquer sur "Suivant" pour aller à la prochaine proposition
3. ⚠️ L'état de validation **n'est pas conservé** (comportement attendu actuel)
4. ✅ Revenir à la proposition précédente ("Précédent")
5. ⚠️ Les blocs ne sont plus validés (état perdu)

**Note** : Pour persister l'état, il faudrait :
- Soit stocker en base de données
- Soit utiliser un state management global (Redux, Zustand, etc.)
- Soit calculer l'état depuis les status des propositions

#### Test 6.2 : Refresh de la page
**Prérequis** : Avoir validé des blocs

1. ⚠️ Rafraîchir la page (F5 ou Cmd+R)
2. ⚠️ L'état de validation est perdu (pas de persistance)
3. ✅ Les propositions sont toujours en status `APPROVED` en base
4. ✅ Les `ProposalApplication` existent toujours

**Solution future** : Recalculer `isBlockValidated` depuis les statuts :
```typescript
const isBlockValidated = (blockKey: string) => {
  const proposalIds = blockProposals[blockKey] || []
  return proposalIds.every(id => {
    const proposal = groupProposals.find(p => p.id === id)
    return proposal?.status === 'APPROVED'
  })
}
```

### 7. Tests de cas limites ✅

#### Test 7.1 : Événement mort (DEAD)
**Prérequis** : Événement avec status `DEAD`

1. ✅ Aucun bouton "Valider" n'est affiché
2. ✅ Tous les champs sont désactivés (édition annulée)
3. ✅ Le bouton "Tout valider (blocs)" n'est pas visible
4. ✅ Un bouton "Ressusciter l'événement" peut être présent

#### Test 7.2 : Édition annulée (CANCELED)
**Prérequis** : Édition avec calendarStatus = `CANCELED`

1. ✅ Le bloc "Édition" peut être validé
2. ✅ Mais les champs (sauf calendarStatus) sont déjà désactivés
3. ✅ Le bloc "Courses" est grisé et non-éditable
4. ✅ Le comportement de validation reste cohérent

#### Test 7.3 : Propositions déjà approuvées
**Prérequis** : Propositions avec status `APPROVED` ou `REJECTED`

1. ✅ Le bouton "Tout valider (blocs)" n'est pas visible
2. ✅ Les boutons "Valider" des blocs ne sont pas visibles
3. ✅ Les champs restent en lecture seule

### 8. Tests d'intégration ✅

#### Test 8.1 : EditionUpdateGroupedDetail
**URL** : `/proposals/group/{eventId}-{editionId}`

1. ✅ Blocs disponibles : Édition, Organisateur, Courses
2. ✅ Chaque bloc a son bouton "Valider/Annuler"
3. ✅ "Tout valider (blocs)" valide les 3 blocs
4. ✅ Verrouillage individuel fonctionne
5. ✅ Annulation individuelle fonctionne

#### Test 8.2 : EventUpdateGroupedDetail
**URL** : `/proposals/group/{eventId}-{editionId}` (type EVENT_UPDATE)

1. ✅ Bloc disponible : Event
2. ✅ Bouton "Valider/Annuler" présent
3. ✅ "Tout valider (blocs)" valide le bloc Event
4. ✅ Verrouillage fonctionne
5. ✅ Les URLs de l'événement restent éditables dans la sidebar

#### Test 8.3 : NewEventGroupedDetail
**URL** : `/proposals/group/new-event-{proposalId}`

1. ✅ Blocs disponibles : Event, Édition, Courses
2. ✅ Chaque bloc a son bouton "Valider/Annuler"
3. ✅ "Tout valider (blocs)" valide les 3 blocs
4. ✅ Verrouillage fonctionne pour tous
5. ✅ Le contexte d'édition dans la sidebar reste visible

## 🐛 Bugs connus / Limitations

### 1. Persistance de l'état ⚠️
- **Problème** : L'état de validation est perdu au refresh ou navigation
- **Impact** : Moyen - L'utilisateur doit revalider après navigation
- **Solution** : Calculer depuis les statuts en base ou ajouter un champ `validatedBlocks` en DB

### 2. RacesToAddSection non traité
- **Problème** : Le composant n'a pas de validation de bloc
- **Impact** : Faible - Rare d'avoir uniquement des courses à ajouter
- **Solution** : À implémenter si nécessaire

### 3. RaceUpdateGroupedDetail non traité
- **Problème** : Vue non mise à jour
- **Impact** : À évaluer selon usage
- **Solution** : Répliquer le pattern des autres vues

## 📊 Métriques de réussite

### Tests critiques (bloquants) 🔴
- ✅ Test 1.1 : Validation bloc Édition
- ✅ Test 2.1 : Annulation bloc validé
- ✅ Test 4.1 : Tout valider (blocs)
- ✅ Test 5.1 : Modifier puis valider

### Tests importants (haute priorité) 🟡
- ✅ Test 1.2-1.4 : Validation autres blocs
- ✅ Test 3.1-3.2 : Validation multiple
- ✅ Test 8.1-8.3 : Intégration vues

### Tests complémentaires (moyenne priorité) 🟢
- ⚠️ Test 6.1-6.2 : Navigation (limitation connue)
- ✅ Test 7.1-7.3 : Cas limites

## 🎯 Résultats attendus

### Validation réussie ✅
Tous les tests critiques et importants passent sans erreur.

### Validation partielle ⚠️
Les tests critiques passent mais des limitations subsistent (ex: persistance).

### Échec ❌
Un ou plusieurs tests critiques échouent → Correction nécessaire.

---

**Testeur** : _________________  
**Date** : _________________  
**Version** : 1.0.0  
**Résultat global** : ⬜ ✅ Succès | ⬜ ⚠️ Partiel | ⬜ ❌ Échec
