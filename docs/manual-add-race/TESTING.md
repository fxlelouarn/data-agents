# Guide de test manuel

## Checklist pré-test

- [ ] Base de données seedée : `npm run db:seed`
- [ ] API en cours d'exécution : `npm run dev:api`
- [ ] Dashboard en cours d'exécution : `npm run dev:dashboard`
- [ ] Variables d'environnement chargées correctement
- [ ] Aucune erreur console au démarrage

## Test 1 : Affichage du dialog

### Étapes
1. Naviguer vers une proposition EDITION_UPDATE groupée
2. Scroller jusqu'à la section "Courses"
3. Regarder en haut de la table
4. Observer le bouton "+ Ajouter une course"

### Résultats attendus
- ✅ Bouton visible et actif
- ✅ Icône "+" affichée
- ✅ Clic ouvre un dialog modal

### Debug en cas d'erreur
```bash
# Vérifier que AddRaceDialog est importé
grep "import.*AddRaceDialog" apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateGroupedDetail.tsx

# Vérifier l'état du dialog
console.log({openAddDialog, onAddRace})
```

## Test 2 : Validation du formulaire

### Étapes
1. Clic sur "Ajouter une course"
2. Cliquer directement sur "Ajouter" (sans remplir)
3. Observer les erreurs

### Résultats attendus
- ❌ Dialog reste ouvert
- ❌ Erreur rouge : "Le nom est requis"
- ❌ Erreur rouge : "La catégorie principale est requise"
- ❌ Erreur rouge : "Au moins une distance doit être renseignée"
- ❌ Bouton "Ajouter" désactivé ou non cliquable

### Résultats non attendus
- ⚠️ Dialog se ferme (bug : validation non effectuée)
- ⚠️ Course ajoutée sans données (bug : validation contournée)

### Debug
```typescript
// Dans AddRaceDialog.tsx
const validateForm = (): boolean => {
  console.log('Validation en cours...', {
    name: formData.name?.trim(),
    categoryLevel1: formData.categoryLevel1,
    hasDistance: activeFields.distances.some(...)
  })
  // ...
}
```

## Test 3 : Champs dynamiques

### Scénario 1 : Catégorie RUNNING
1. Remplir "Nom" : "Marathon de Paris"
2. Sélectionner "Catégorie" = "Course à pied"
3. Observer les champs de distance affichés

**Attendu** :
- ✅ Seul "Distance course" visible
- ✅ "Distance vélo" masquée
- ✅ "Distance marche" masquée
- ✅ "Distance natation" masquée
- ✅ Seul "D+ course" visible pour l'élévation

### Scénario 2 : Catégorie TRIATHLON
1. Changer la catégorie = "Triathlon"
2. Observer les champs de distance

**Attendu** :
- ✅ "Distance course" visible
- ✅ "Distance vélo" visible
- ✅ "Distance natation" visible
- ✅ "Distance marche" masquée
- ✅ "D+ course" ET "D+ vélo" visibles

### Scénario 3 : Changement de catégorie réinitialise les champs
1. Remplir "Distance course" = 42.195
2. Remplir "D+ course" = 800
3. Changer catégorie = "Cyclisme"
4. Observer les champs

**Attendu** :
- ✅ "Distance course" masquée (réinitialisée)
- ✅ "D+ course" masquée (réinitialisée)
- ✅ "Distance vélo" visible (vide)
- ✅ "D+ vélo" visible (vide)

### Debug
```typescript
const activeFields = useMemo(
  () => getActiveFields(formData.categoryLevel1 || null),
  [formData.categoryLevel1]
)

console.log('Champs actifs:', activeFields)
```

## Test 4 : Sous-catégories

### Étapes
1. Sélectionner "Catégorie" = "Course à pied"
2. Cliquer sur "Sous-catégorie"
3. Observer la liste des options

### Résultats attendus (Catégorie=RUNNING)
- ✅ Options : "Moins de 5 km", "5 km", "10 km", "Semi-marathon", "Marathon", etc.
- ✅ Peut sélectionner "Marathon"
- ✅ Peut dé-sélectionner (revenir à vide)

### Résultats attendus (Catégorie=TRAIL)
- ✅ Différentes options : "Trail court", "Trail long", "Ultra trail", etc.
- ✅ Les options changent selon la catégorie

### Résultats attendus (Catégorie=OTHER)
- ✅ Liste vide ou "-" par défaut

## Test 5 : Nettoyage des données

### Étapes
1. Remplir le formulaire partiellement
2. Laisser certains champs vides
3. Ajouter une course
4. Vérifier les données dans la table

### Exemple de test
```javascript
// Formulaire rempli
name: "Trail du Mont Blanc"
categoryLevel1: "TRAIL"
categoryLevel2: "" (vide)
runDistance: 170
bikeDistance: "" (vide)
walkDistance: "" (vide)
swimDistance: "" (vide)
runPositiveElevation: 8000
bikePositiveElevation: "" (vide)
walkPositiveElevation: "" (vide)
startDate: "2025-06-20T06:00:00Z"
timeZone: "Europe/Paris"

// Données nettoyées (avant envoi)
{
  name: "Trail du Mont Blanc",
  categoryLevel1: "TRAIL",
  runDistance: 170,
  runPositiveElevation: 8000,
  startDate: "2025-06-20T06:00:00Z",
  timeZone: "Europe/Paris"
}

// Attendu : Les champs vides/undefined/null sont supprimés
```

**Résultats attendus** :
- ✅ Pas de clés avec valeur undefined
- ✅ Pas de clés avec valeur null
- ✅ Pas de clés avec string vide
- ✅ Seuls les champs remplis sont présents

## Test 6 : Ajout à la table

### Étapes
1. Remplir et valider le formulaire
2. Cliquer "Ajouter"
3. Observer la table des courses

### Résultats attendus
- ✅ Dialog se ferme
- ✅ Nouvelle ligne apparaît en haut de la table
- ✅ Badge "Modifié" visible en rouge/orange
- ✅ Données correctes affichées
- ✅ Nom de la course visible
- ✅ Catégorie affichée avec label lisible (pas la clé)

### Interaction avec la table
- ✅ Peut éditer les champs
- ✅ Peut supprimer la course (bouton poubelle)
- ✅ Peut annuler les modifications (bouton "↶")

## Test 7 : Date héritée

### Étapes
1. Édition avec date : ex. "2025-06-20T10:00:00Z"
2. Ouvrir "Ajouter une course"
3. Observer le champ "Date et heure de départ"

### Résultats attendus
- ✅ Champ pré-rempli avec la date de l'édition
- ✅ Helper text : "Héritée de l'édition par défaut"
- ✅ Peut modifier la date
- ✅ Peut laisser telle quelle

### Cas édition sans date
- ✅ Champ vide
- ✅ Helper text : "Aucune date d'édition disponible"

## Test 8 : Bloc validé

### Étapes
1. Valider le bloc "Races"
2. Cliquer sur "Ajouter une course"

### Résultats attendus
- ❌ Bouton "Ajouter une course" désactivé (grisé)
- ❌ Impossible d'ouvrir le dialog
- ❌ Alert "Le bloc 'Courses' est déjà validé..." visible dans le dialog si forcément ouvert

## Test 9 : Cycle complet

### Étapes
1. Ouvrir une proposition EDITION_UPDATE groupée
2. Scroller à la section Courses
3. Cliquer "+ Ajouter une course"
4. Remplir les champs :
   - Nom : "Trail des Encombres"
   - Catégorie : "Trail"
   - Sous-cat : "Ultra trail"
   - Distance : 65 km
   - D+ : 4500 m
5. Cliquer "Ajouter"
6. Observer la nouvelle ligne dans la table
7. Cliquer sur "Valider" le bloc Races
8. Vérifier que la course est marquée pour être ajoutée

**Résultats attendus** :
- ✅ Dialog ouvre/ferme correctement
- ✅ Validation fonctionne
- ✅ Champs dynamiques changent
- ✅ Données nettoyées
- ✅ Nouvelle ligne apparaît
- ✅ Badge "Modifié" visible
- ✅ Validation du bloc accepte la nouvelle course

## Test 10 : Gestion des erreurs

### Test d'erreur : Pas de catégorie
1. Remplir "Nom"
2. Remplir "Distance course"
3. Pas de catégorie sélectionnée
4. Cliquer "Ajouter"

**Attendu** :
- ❌ Erreur : "La catégorie principale est requise"
- ❌ Dialog reste ouvert

### Test d'erreur : Pas de distance
1. Remplir "Nom"
2. Sélectionner "Catégorie" = "TRAIL"
3. Ne pas remplir de distance
4. Cliquer "Ajouter"

**Attendu** :
- ❌ Erreur : "Au moins une distance doit être renseignée"
- ❌ Dialog reste ouvert

### Test d'erreur : Nom vide
1. Ne pas remplir "Nom"
2. Remplir les autres champs
3. Cliquer "Ajouter"

**Attendu** :
- ❌ Erreur : "Le nom est requis"

## Test 11 : Compatibilité MultiPropTypes

### Étapes
1. Tester sur une proposition NEW_EVENT groupée
2. Tester sur une proposition EDITION_UPDATE groupée
3. Vérifier le bon fonctionnement dans les deux cas

### Résultats attendus
- ✅ Feature fonctionne identiquement pour NEW_EVENT
- ✅ Feature fonctionne identiquement pour EDITION_UPDATE
- ✅ Pas d'erreurs spécifiques au type

## Test 12 : Console et erreurs

### Pendant tous les tests
Ouvrir la console du navigateur (F12) et vérifier :

- ✅ Pas d'erreur rouge
- ✅ Pas de warning "missing key" en console
- ✅ Pas de erreur TypeScript (si applicable)
- ✅ Pas de crash React

### Logs attendus (en dev)
```
// Lors de l'ouverture du dialog
[AddRaceDialog] Opened with defaultStartDate: "2025-06-20T10:00:00Z"

// Lors de la validation
[AddRaceDialog] Validation passed: {...}

// Lors de l'ajout
[EditionUpdateGroupedDetail] Added race: "Trail des Encombres"
```

## Logs pour debug

### Ajouter ces logs dans AddRaceDialog.tsx
```typescript
const handleSubmit = () => {
  console.log('[AddRaceDialog] Submitting...', {
    formData,
    errors,
    isValid: validateForm()
  })

  if (!validateForm()) {
    console.log('[AddRaceDialog] Validation failed')
    return
  }

  const cleanedData: RaceData = Object.fromEntries(
    Object.entries(formData).filter(([_, value]) =>
      value !== undefined && value !== '' && value !== null
    )
  ) as unknown as RaceData

  console.log('[AddRaceDialog] Cleaned data:', cleanedData)
  onAdd(cleanedData)
}
```

### Ajouter ces logs dans EditionUpdateGroupedDetail.tsx
```typescript
const handleAddRace = (raceData: RaceData) => {
  const newRaceId = `new_${Date.now()}`
  console.log('[EditionUpdateGroupedDetail] Adding race:', {
    newRaceId,
    raceData
  })

  setWorkingGroup(prev => {
    console.log('[EditionUpdateGroupedDetail] Updated racesChanges count:', prev.racesChanges.length + 1)
    return {...}
  })

  setUserModifiedRaceChanges(prev => {
    console.log('[EditionUpdateGroupedDetail] Updated userModifiedRaceChanges:', {...prev, [newRaceId]: raceData})
    return {...}
  })
}
```

## Résumé du coverage

| Aspect | Status |
|--------|--------|
| Affichage du dialog | ✅ Test 1 |
| Validation | ✅ Test 2 |
| Champs dynamiques | ✅ Test 3 |
| Sous-catégories | ✅ Test 4 |
| Nettoyage données | ✅ Test 5 |
| Ajout table | ✅ Test 6 |
| Date héritée | ✅ Test 7 |
| Bloc validé | ✅ Test 8 |
| Cycle complet | ✅ Test 9 |
| Gestion erreurs | ✅ Test 10 |
| Multi-type | ✅ Test 11 |
| Console/Logs | ✅ Test 12 |

## Outils de debug supplémentaires

### React DevTools
1. Installer l'extension Chrome "React Developer Tools"
2. Inspecter le composant `AddRaceDialog`
3. Vérifier l'état des props et state
4. Modifier le state en temps réel pour tester

### Network Tab
1. Ouvrir F12 → Network
2. Valider le bloc "Races"
3. Observer la requête POST vers `/api/proposals/.../validate-block`
4. Vérifier que les nouvelles courses (avec `raceId` = `new_*`) sont envoyées

### Exemple requête attendue
```json
{
  "blockKey": "races",
  "userModifications": {
    "new_1733350400000": {
      "name": "Trail des Encombres",
      "categoryLevel1": "TRAIL",
      "categoryLevel2": "ULTRA_TRAIL",
      "runDistance": 65,
      "runPositiveElevation": 4500
    }
  }
}
```
