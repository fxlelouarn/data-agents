# Fix : Éviter les mises à jour en double lors de la validation de propositions groupées

## Problème

Lorsqu'une proposition groupée est validée (par exemple, plusieurs propositions pour la même édition d'un événement), chaque proposition enfant générait sa propre mise à jour (`ProposalApplication`) dans la base de données. Cela créait des doublons dans la page `/updates` car plusieurs propositions identiques créaient chacune leur propre mise à jour en attente.

### Exemple du problème
```
Proposition A : Change startDate de l'édition 123 à 2025-06-01
Proposition B : Change startDate de l'édition 123 à 2025-06-01  
Proposition C : Change startDate de l'édition 123 à 2025-06-01

→ Validation du groupe → 3 mises à jour identiques créées
```

## Solution implémentée

### 1. Validation individuelle (`PUT /api/proposals/:id`)

Dans le fichier `apps/api/src/routes/proposals.ts`, lignes 517-584 :

**Avant** : Chaque proposition approuvée créait automatiquement une `ProposalApplication`.

**Après** : Avant de créer une nouvelle application, le système :
1. Vérifie si une application existe déjà pour cette proposition
2. **Recherche toutes les applications PENDING existantes**
3. Compare les changements de la nouvelle proposition avec ceux des applications existantes
4. Si une application identique existe déjà (même type, même cible, mêmes changements) :
   - Ne crée **PAS** de nouvelle application
   - Log l'information avec `reason: 'duplicate_changes'`
5. Sinon, crée une nouvelle application

```typescript
// Vérifier si changements identiques déjà présents
const duplicateApp = allPendingApplications.find(app => {
  // Même type et même cible (event/edition/race)
  if (app.proposal.type !== proposal.type) return false
  if (app.proposal.eventId !== proposal.eventId) return false
  if (app.proposal.editionId !== proposal.editionId) return false
  if (app.proposal.raceId !== proposal.raceId) return false
  
  // Mêmes changements
  const appChanges = JSON.stringify(app.proposal.changes)
  return appChanges === proposalChanges
})
```

### 2. Validation en bulk (`POST /api/proposals/bulk-approve`)

Dans le fichier `apps/api/src/routes/proposals.ts`, lignes 936-993 :

**Avant** : Chaque proposition du groupe créait sa propre application.

**Après** : Le système utilise un `Set` pour tracker les changements déjà traités dans le batch :
1. Pour chaque proposition à approuver :
   - Crée une clé unique basée sur `type`, `eventId`, `editionId`, `raceId` et `changes`
   - Vérifie si cette clé a déjà été traitée dans le batch
   - Vérifie si une application PENDING identique existe déjà
2. Ne crée qu'**une seule application** par ensemble de changements identiques

```typescript
const processedChanges = new Set<string>()

for (const proposal of pendingProposals) {
  const changeKey = JSON.stringify({
    type: proposal.type,
    eventId: proposal.eventId,
    editionId: proposal.editionId,
    raceId: proposal.raceId,
    changes: proposal.changes
  })
  
  // Skip si déjà traité dans ce batch
  if (processedChanges.has(changeKey)) continue
  
  // ... vérification des doublons existants ...
  
  if (!duplicateApp) {
    applicationsToCreate.push(...)
    processedChanges.add(changeKey)
  }
}
```

## Résultat attendu

### Avant
```
3 propositions identiques validées → 3 mises à jour PENDING créées
→ Page /updates affiche 3 lignes identiques
```

### Après
```
3 propositions identiques validées → 1 seule mise à jour PENDING créée
→ Page /updates affiche 1 seule ligne
→ Les 2 autres propositions sont marquées comme approuvées mais sans créer d'application supplémentaire
```

## Avantages

1. **Évite la duplication** : Une seule mise à jour par ensemble de changements identiques
2. **Meilleure UX** : La page `/updates` est plus claire et lisible
3. **Performance** : Moins de requêtes lors de l'application des mises à jour
4. **Traçabilité** : Les logs indiquent clairement quand une application est réutilisée (`reason: 'duplicate_changes'`)

## Vérification

Pour tester que la correction fonctionne :

1. Créer plusieurs propositions identiques pour la même édition
2. Les valider toutes en même temps (validation groupée)
3. Aller sur `/updates` 
4. Vérifier qu'**une seule** mise à jour apparaît au lieu de plusieurs

## Remarques

- Cette logique s'applique uniquement aux propositions **PENDING** → **APPROVED**
- Les propositions sont toujours marquées comme approuvées individuellement
- Seule la création de `ProposalApplication` est dédupliquée
- La comparaison utilise `JSON.stringify()` pour détecter les changements identiques (ordre des clés peut affecter la comparaison)
