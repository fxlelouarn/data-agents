# Fix: Validation par blocs - Badge "Modifié" sur tous les champs

**Date:** 2025-11-12  
**Problème:** Après validation d'un bloc, tous les champs du bloc affichaient le badge "Modifié" au lieu de seulement les champs réellement modifiés par l'utilisateur.

---

## 🔴 Symptômes

### Avant validation
- ✅ Autosave envoie uniquement les modifications
- ✅ Badge "Modifié" uniquement sur les champs modifiés

### Après validation du bloc
- ❌ Badge "Modifié" apparaît sur TOUS les champs du bloc
- ❌ Même les champs non modifiés (valeurs proposées par l'agent) sont marqués comme modifiés

---

## 🎯 Cause

Dans `useBlockValidation.ts` (lignes 69-127), lors de la validation d'un bloc, le code construisait un payload contenant :

```typescript
// ❌ AVANT (bugué)
const finalPayload = {}

// 1. Ajouter les valeurs proposées par l'agent
Object.entries(selectedChanges).forEach(([field, value]) => {
  finalPayload[field] = value
})

// 2. Écraser avec les modifications manuelles
Object.entries(userModifiedChanges).forEach(([field, value]) => {
  finalPayload[field] = value
})

// ❌ Envoyer TOUT dans userModifiedChanges
await updateProposalMutation.mutateAsync({
  userModifiedChanges: finalPayload  // Valeurs proposées + modifiées
})
```

**Résultat :** Le backend sauvegardait tout le payload dans `proposal.userModifiedChanges`, marquant ainsi tous les champs comme "modifiés par l'utilisateur".

---

## ✅ Solution

Le backend fait **déjà le merge correctement** dans `proposal-domain.service.ts` (lignes 49-53) :

```typescript
// 3. Merge changes (user modifications take precedence)
const finalChanges = {
  ...(proposal.changes as Record<string, any>),        // Valeurs proposées
  ...(proposal.userModifiedChanges as Record<string, any>)  // Modifications utilisateur
}
```

**Donc on ne doit envoyer QUE les modifications utilisateur**, le backend s'occupe du merge :

```typescript
// ✅ APRÈS (corrigé)
const payload: Record<string, any> = { ...userModifiedChanges }

// Ajouter les modifications de courses si bloc "races"
if (blockKey === 'races' && userModifiedRaceChanges) {
  payload.raceEdits = userModifiedRaceChanges
}

// ✅ Envoyer UNIQUEMENT les modifications
await updateProposalMutation.mutateAsync({
  userModifiedChanges: payload  // Modifications utilisateur seulement
})
```

---

## 📋 Flux de données

### Validation d'un bloc

```
Frontend (useBlockValidation.ts)
  ↓
  userModifiedChanges: { distance: "12" }  ← Seulement les modifs
  ↓
Backend (routes/proposals.ts)
  ↓
  Sauvegarde dans proposal.userModifiedChanges
  ↓
Backend (proposal-domain.service.ts)
  ↓
  finalChanges = {
    ...proposal.changes,           ← Valeurs proposées (startDate, etc.)
    ...proposal.userModifiedChanges  ← Modifs utilisateur (distance)
  }
  ↓
  Application à Miles Republic
```

---

## 🧪 Test manuel

### Setup
1. Ouvrir une proposition EDITION_UPDATE avec des courses
2. L'agent propose `startDate: 2025-11-14T23:00:00.000Z` pour toutes les courses
3. Modifier manuellement `distance: 21.1 → 12` pour une course

### Avant le fix

**Après validation du bloc "races"** :
- ❌ Toutes les courses affichent le badge "Modifié"
- ❌ `userModifiedChanges` contient `startDate` + `distance`
- ❌ Au prochain chargement, tous les champs sont marqués "modifiés"

### Après le fix

**Après validation du bloc "races"** :
- ✅ Seule la course avec `distance` modifiée affiche le badge "Modifié"
- ✅ `userModifiedChanges` contient uniquement `raceEdits: { "141829": { distance: "12" } }`
- ✅ Au prochain chargement, seul le champ `distance` est marqué "modifié"

---

## 📁 Fichiers modifiés

### `apps/dashboard/src/hooks/useBlockValidation.ts`

**Lignes 69-127** : Simplification de la construction du payload

**Avant** :
- 59 lignes de code avec deux branches (races vs autres blocs)
- Merge manuel de `selectedChanges` + `userModifiedChanges`
- Envoi de tout dans `userModifiedChanges`

**Après** :
- 23 lignes de code avec une seule branche
- Envoi uniquement de `userModifiedChanges` + `raceEdits`
- Le backend fait le merge

**Impact** :
- Code plus simple et maintenable
- Comportement correct : seules les modifications utilisateur sont marquées
- Cohérence avec le système d'autosave

---

## 🔗 Contexte

Ce fix complète le travail précédent sur la validation par blocs :

- **2025-11-11** : Ajout du payload complet lors de la validation (valeurs proposées + modifiées)
  - `docs/FIX-BLOCK-VALIDATION-PAYLOAD.md`
  - Ce fix était nécessaire pour appliquer les valeurs proposées

- **2025-11-12** : Correction de ce qu'on envoie dans `userModifiedChanges`
  - Le backend fait déjà le merge, on ne doit envoyer que les modifs
  - Ce fix corrige l'affichage incorrect des badges "Modifié"

---

## ✅ Résultat

**Comportement cohérent dans toute l'application** :

1. **Autosave** : Envoie uniquement les modifications utilisateur
2. **Validation par blocs** : Envoie uniquement les modifications utilisateur
3. **Backend** : Merge automatiquement avec les valeurs proposées
4. **Affichage** : Badge "Modifié" uniquement sur les champs réellement modifiés
