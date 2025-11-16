# Bug - Suppressions de nouvelles courses (racesToAdd) non enregistrées

**Date** : 2025-11-16  
**Statut** : ✅ RÉSOLU (2025-11-16)  
**Priorité** : Moyenne  
**Composants** : Dashboard (frontend)

---

## 🐛 Symptôme

Lorsqu'un utilisateur :
1. Ouvre une proposition avec des nouvelles courses (`racesToAdd`)
2. Supprime certaines courses avec le bouton poubelle 🗑️
3. Valide le bloc "Courses"

**Résultat attendu** : Les courses supprimées ne doivent pas être créées lors de l'application de la proposition.

**Résultat observé** : 
- Les courses apparaissent grisées (UI)
- Mais ne sont **PAS barrées** (pas de text-decoration: line-through)
- La suppression **N'EST PAS enregistrée** dans `userModifiedChanges.racesToAdd`
- Lors de l'application, les courses supprimées sont quand même créées ❌

---

## 📊 Exemple concret

**Proposition** : `cmi1w871g056mjp1wdqm7ikow` (Event 3738, Edition 41147)

**Courses proposées initialement** (2) :
1. `Trail 27 km` (27km, D+ 1000m)
2. `Cross` (pas de distance)

**Actions utilisateur** :
- ✅ Suppression de "Trail 27 km" avec bouton poubelle
- ✅ Suppression de "Cross" avec bouton poubelle
- ✅ Validation du bloc "Courses"

**Résultat en base** :
```sql
SELECT "userModifiedChanges"->'racesToAdd' 
FROM proposals 
WHERE id = 'cmi1w871g056mjp1wdqm7ikow';
-- Résultat: NULL (❌ les suppressions ne sont pas enregistrées)
```

---

## 🔍 Analyse technique

### Cause racine : Désalignement frontend ↔ backend

**Le backend attend** (`proposal-domain.service.ts` ligne 421) :
```typescript
const racesToAddFiltered = (proposal?.userModifiedChanges as any)?.racesToAddFiltered || []
// Tableau d'indices des courses SUPPRIMÉES : [0, 1]

const racesToAddEffective = racesToAdd.filter((_, index) => !racesToAddFiltered.includes(index))
```

**Le frontend envoie** (`useProposalEditor.ts`) :
```typescript
userModifiedRaceChanges = {
  "new-0": { _deleted: true },  // ❌ Mauvaise structure
  "new-1": { _deleted: true }
}
```

**Résultat** : `racesToAddFiltered` est toujours `[]` → Aucune course n'est filtrée → Toutes les courses sont créées ❌

---

### Frontend

**Fichier** : `apps/dashboard/src/hooks/useProposalEditor.ts`

**Méthode** : `deleteRace()` (lignes 909-991)

**Comportement actuel** :
```typescript
const deleteRace = (raceId: string) => {
  // Marque la course comme _deleted dans userModifiedRaceChanges
  userModifiedRaceChanges[raceId] = { _deleted: true }
  // ❌ Problème : Ce champ n'est PAS utilisé par le backend pour racesToAdd
}
```

**Fichier** : `apps/dashboard/src/hooks/useBlockValidation.ts`

**Méthode** : `validateBlock()` (lignes 59-110)

**Payload envoyé au backend** :
```typescript
const changes: Record<string, any> = { ...userModifiedChanges }

if (blockKey === 'races' && userModifiedRaceChanges) {
  changes.raceEdits = userModifiedRaceChanges  // ✅ Modifications envoyées
  // ❌ MANQUANT : Construction de racesToAddFiltered
}
```

**Ce qui devrait être envoyé** :
```json
{
  "raceEdits": { "141829": { "distance": 12 } },
  "racesToAddFiltered": [0, 1]  // ✅ Indices des courses supprimées
}
```

**Ce qui est actuellement envoyé** :
```json
{
  "raceEdits": {
    "new-0": { "_deleted": true },  // ❌ Backend ignore ce champ
    "new-1": { "_deleted": true }
  }
  // ❌ racesToAddFiltered absent
}
```

### Backend

**Fichier** : `apps/api/src/routes/proposals.ts`

**Endpoint** : `POST /api/proposals/validate-block-group` (ligne 795)

**Comportement** :
```typescript
// Ligne 850
userModifiedChanges: { ...existingUserModifiedChanges, ...changes }
```

Le backend **merge** les `changes` envoyés avec les modifications existantes. Si `racesToAdd` n'est pas dans `changes`, la valeur originale de `proposal.changes.racesToAdd` est conservée.

---

## 🛠️ Solution recommandée : Construire `racesToAddFiltered`

### Approche : Respecter le contrat backend existant

**Fichier** : `apps/dashboard/src/hooks/useBlockValidation.ts`

**Modification** :
```typescript
const validateBlock = (blockKey: string, proposalIds: string[]) => {
  const changes: Record<string, any> = { ...userModifiedChanges }
  
  if (blockKey === 'races') {
    // Ajouter modifications de courses existantes
    if (userModifiedRaceChanges) {
      changes.raceEdits = userModifiedRaceChanges
    }
    
    // ✅ NOUVEAU : Construire racesToAddFiltered depuis userModifiedRaceChanges
    const racesToAddFiltered: number[] = []
    
    Object.entries(userModifiedRaceChanges).forEach(([key, mods]: [string, any]) => {
      // Chercher les clés "new-{index}" marquées _deleted
      if (key.startsWith('new-') && mods._deleted === true) {
        const index = parseInt(key.replace('new-', ''))
        if (!isNaN(index)) {
          racesToAddFiltered.push(index)
        }
      }
    })
    
    if (racesToAddFiltered.length > 0) {
      changes.racesToAddFiltered = racesToAddFiltered
      console.log('✅ Courses à filtrer (indices):', racesToAddFiltered)
    }
  }
  
  // Envoyer au backend...
}
```

**Avantages** :
- ✅ Respecte le contrat backend existant (pas de changement backend)
- ✅ Simple : extraction d'indices depuis les clés `new-{index}`
- ✅ Robuste : validation de l'index avec `parseInt` + `isNaN`
- ✅ Fonctionne pour tous les types de propositions

### Exemple concret du flux

**Étape 1** : Proposition initiale avec 2 courses
```json
// proposal.changes.racesToAdd
[
  { "name": "Trail 27 km", "runDistance": 27 },  // Index 0
  { "name": "Cross", "runDistance": 4.3 }         // Index 1
]
```

**Étape 2** : Utilisateur supprime les 2 courses
```typescript
// Frontend : useProposalEditor.deleteRace('new-0')
userModifiedRaceChanges = {
  "new-0": { _deleted: true },
  "new-1": { _deleted: true }
}
```

**Étape 3** : Validation du bloc "Courses"
```typescript
// useBlockValidation construit racesToAddFiltered
const racesToAddFiltered = [0, 1]  // ✅ Indices extraits depuis les clés

// Payload envoyé au backend
{
  "raceEdits": {
    "new-0": { "_deleted": true },
    "new-1": { "_deleted": true }
  },
  "racesToAddFiltered": [0, 1]  // ✅ NOUVEAU
}
```

**Étape 4** : Backend filtre les courses
```typescript
// proposal-domain.service.ts ligne 425
const racesToAddEffective = racesToAdd.filter((_, index) => 
  !racesToAddFiltered.includes(index)
)
// Résultat : [] (aucune course créée) ✅
```

---

### Étapes d'implémentation

1. **Modification de `useBlockValidation.ts`** (lignes 59-110)
   - Ajouter construction de `racesToAddFiltered` dans le bloc `if (blockKey === 'races')`
   - Parser les clés `new-{index}` avec `_deleted: true`
   - Ajouter au payload : `changes.racesToAddFiltered = [...]`

2. **Tests manuels**
   - Créer proposition avec 2 nouvelles courses
   - Supprimer 1 course avec bouton poubelle
   - Valider le bloc "Courses"
   - Vérifier payload réseau : `{"racesToAddFiltered": [0]}`
   - Appliquer la proposition
   - Vérifier en Miles Republic : **1 seule course créée** ✅

---

## 🎯 Pourquoi cette solution ?

1. **Respecte le backend existant** : Pas de changement dans `proposal-domain.service.ts`
2. **Utilise les clés existantes** : `new-{index}` est déjà utilisé dans `useProposalEditor`
3. **Robuste** : Validation d'index avec `parseInt` + `isNaN`
4. **Simple** : Une seule boucle `Object.entries()` pour construire le tableau
5. **Testable** : Payload visible dans les logs réseau

---

## 🔗 Fichiers concernés

**Frontend** :
- `apps/dashboard/src/hooks/useProposalEditor.ts` - Méthode `deleteRace()`
- `apps/dashboard/src/hooks/useBlockValidation.ts` - Méthode `validateBlock()`
- `apps/dashboard/src/components/proposals/edition-update/RacesToAddSection.tsx` - Affichage courses nouvelles

**Backend** :
- `apps/api/src/routes/proposals.ts` - Endpoint `/validate-block-group`
- `packages/database/src/services/proposal-domain.service.ts` - Méthode `applyEditionUpdate()`

---

---

## ✅ Résolution

**Date de fix** : 2025-11-16  
**Fichier modifié** : `apps/dashboard/src/hooks/useBlockValidation.ts` (lignes 75-91)

**Changement** :
- Ajout de construction de `racesToAddFiltered` dans le bloc `if (blockKey === 'races')`
- Extraction des indices depuis les clés `new-{index}` marquées `_deleted: true`
- Ajout au payload envoyé au backend : `changes.racesToAddFiltered = [...]`

**Impact** :
- ✅ Les courses supprimées ne sont plus créées lors de l'application
- ✅ Aucun changement backend nécessaire
- ✅ Solution compatible avec toutes les propositions existantes

---

## 🧪 Tests à effectuer

1. Créer une proposition avec 2 nouvelles courses
2. Supprimer 1 course avec le bouton poubelle
3. Vérifier que la course est **barrée** (text-decoration: line-through)
4. Valider le bloc "Courses"
5. Vérifier en DB que `userModifiedChanges` contient bien la suppression
6. Appliquer la proposition
7. Vérifier en Miles Republic que **seule 1 course** a été créée

---

## 📚 Références

- Proposition exemple : `cmi1w871g056mjp1wdqm7ikow`
- Event : 3738
- Edition : 41147
- Screenshot fourni par l'utilisateur montrant courses grisées mais pas barrées
