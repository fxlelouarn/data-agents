# Plan: Frontend Dashboard Alignment (Phase 3)
**Date**: 2 Décembre 2025  
**Objectif**: Adapter le frontend Dashboard pour fonctionner avec le backend Phase 2.9  
**Statut**: 🟡 À démarrer
## 🎯 Contexte
Le backend a été mis à jour (Phases 2.6-2.9) avec:
* ✅ Merge intelligent `userModifiedChanges`
* ✅ Support `editedData.runDistance` (champs spécifiques)
* ✅ Distinction `event` vs `edition` dans les blocs
Le frontend Dashboard nécessite maintenant des adaptations pour:
1. Compiler sans erreurs TypeScript
2. Utiliser les nouveaux helpers et structures
3. S'aligner avec la logique backend
## 📍 Diagnostic Initial
### Étape 1: Vérifier la compilation
✅ **COMPLÈTE** (2025-12-02)

**Résultat**:
- **25 → 8 erreurs** (-68%)
- **0 erreur dans scope Phase 3** (propositions)
- **8 erreurs hors scope** (pages /updates)

**Rapport détaillé**: `docs/FRONTEND_ALIGNMENT_PHASE_3_DIAGNOSTIC.md`
### Étape 2: Analyser les composants clés
**Composants à vérifier**:
1. `apps/dashboard/src/hooks/useProposalEditor.ts`
    * Utilise-t-il `userModifiedChanges` correctement?
    * Support des champs spécifiques (`runDistance`, etc.)?
2. `apps/dashboard/src/hooks/useBlockValidation.ts`
    * Envoie-t-il les modifications user?
    * Construit-il le payload complet?
3. `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`
    * État local vs hook?
    * Sauvegarde des modifications?
4. Composants de changements:
    * `RacesToAddSection.tsx`
    * `RacesChangesTable.tsx`
    * Utilisent-ils `distance` (legacy) ou `runDistance` (spécifique)?
## 🔧 Corrections Attendues
### 1. Support Champs Spécifiques (Courses)
**Problème attendu**: Frontend utilise `distance` legacy
**Solution**:
```typescript
// ❌ AVANT
const distance = raceEdit.distance
// ✅ APRÈS
const runDistance = raceEdit.runDistance
const bikeDistance = raceEdit.bikeDistance
const walkDistance = raceEdit.walkDistance
const swimDistance = raceEdit.swimDistance
```
**Fichiers à modifier**:
* `apps/dashboard/src/components/proposals/edition-update/RacesToAddSection.tsx`
* `apps/dashboard/src/components/proposals/edition-update/RacesChangesTable.tsx`
* `apps/dashboard/src/hooks/useProposalEditor.ts` (si applicable)
### 2. Distinction Event vs Edition
**Problème attendu**: Frontend confond les blocs `event` et `edition`
**Solution**: Utiliser le même mapping que le backend
```typescript
const eventFields = [
  'name', 'city', 'country', 'websiteUrl', 'facebookUrl', 
  'instagramUrl', 'twitterUrl', 'countrySubdivisionNameLevel1', 
  'countrySubdivisionNameLevel2', 'fullAddress', 'latitude', 
  'longitude', 'coverImage', 'images', 'dataSource'
]
const editionFields = [
  'year', 'startDate', 'endDate', 'timeZone', 
  'registrationOpeningDate', 'registrationClosingDate',
  'calendarStatus', 'clientStatus', 'currency'
]
```
**Fichiers à modifier**:
* `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`
* `apps/dashboard/src/utils/proposal-helpers.ts` (si existe)
### 3. Sauvegarde userModifiedChanges
**Problème attendu**: Modifications perdues car non sauvegardées
**Solution**: Utiliser autosave du hook `useProposalEditor`
```typescript
const { workingGroup, updateField, updateRace } = useProposalEditor(
  proposalIds,
  { autosave: true }  // ✅ Active la sauvegarde automatique
)
```
**Vérifier**: Le hook sauvegarde bien via l'API à chaque modification
### 4. Construction Payload Validation
**Problème attendu**: Payload incomplet lors de la validation par blocs
**Solution**: Merger `selectedChanges` + `userModifiedChanges` + `raceEdits`
```typescript
// Dans useBlockValidation
const payload = {
  // 1. Valeurs proposées (agent)
  ...selectedChanges,
  
  // 2. Modifications utilisateur (écrasent agent)
  ...userModifiedChanges,
  
  // 3. Modifications courses
  raceEdits: userModifiedRaceChanges
}
```
**Fichier à modifier**:
* `apps/dashboard/src/hooks/useBlockValidation.ts`
## 📋 Checklist Validation
### Compilation
- [x] `npm run tsc` passe sans erreurs **dans scope Phase 3** (propositions)
- [x] Aucun warning TypeScript critique
- [x] Tous les imports résolus
- [ ] Pages /updates corrigées (hors scope, optionnel)
### Fonctionnalités
- [ ] Édition de proposition fonctionne
- [ ] Validation par blocs fonctionne
- [ ] Modifications user sauvegardées
- [ ] Champs spécifiques courses supportés
- [ ] Distinction event/edition correcte
### Tests Manuels
- [ ] Ouvrir proposition NEW_EVENT
- [ ] Ouvrir proposition EDITION_UPDATE
- [ ] Modifier un champ event (ex: `name`)
- [ ] Modifier un champ edition (ex: `startDate`)
- [ ] Modifier une course (`runDistance`)
- [ ] Valider un bloc (ex: `event` uniquement)
- [ ] Vérifier que les modifications sont appliquées
## 🚀 Étapes d'Implémentation
### Phase 3.1: Diagnostic (Urgent)
1. Compiler le dashboard
2. Lister TOUTES les erreurs TypeScript
3. Identifier les patterns récurrents
4. Créer un rapport de diagnostic
### Phase 3.2: Corrections Critiques
1. Corriger les erreurs bloquantes
2. Adapter les champs spécifiques courses
3. Fixer la distinction event/edition
### Phase 3.3: Tests & Validation
1. Tests manuels complets
2. Vérifier l'alignement backend/frontend
3. Documenter les changements
## 📝 Documentation Nécessaire
**Créer**:
* `docs/FRONTEND_ALIGNMENT_PHASE_3.md` - Rapport de diagnostic et corrections
* Mise à jour `WARP.md` si nécessaire
**Mettre à jour**:
* README du dashboard si architecture changée
## ⚠️ Risques Identifiés
1. **Breaking changes API**: Le backend a peut-être changé des contrats
    * **Mitigation**: Vérifier les types retournés par l'API
2. **État local désynchronisé**: Le frontend peut avoir des états redondants
    * **Mitigation**: Utiliser Single Source of Truth (`useProposalEditor`)
3. **Perte de données**: Modifications non sauvegardées
    * **Mitigation**: Activer autosave systématiquement
## 🎯 Succès Criteria
✅ **Compilation**:
* Aucune erreur TypeScript
* Build réussit sans warnings
✅ **Fonctionnel**:
* Édition de propositions fonctionne
* Validation par blocs fonctionne
* Modifications user appliquées correctement
✅ **Tests**:
* 3 propositions NEW_EVENT testées
* 3 propositions EDITION_UPDATE testées
* Validation partielle (blocs) testée
## 📅 Estimation
* **Phase 3.1 (Diagnostic)**: 30-60 min
* **Phase 3.2 (Corrections)**: 2-4h selon complexité
* **Phase 3.3 (Tests)**: 1-2h
**Total estimé**: 4-7h
## 🔗 Ressources
* Backend changes: `docs/tests/TEST_PHASE_2.9_FINAL.md`
* Tests backend: `apps/agents/src/__tests__/proposal-application/`
* API service: `apps/dashboard/src/services/api.ts`
