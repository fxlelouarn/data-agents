# Création manuelle de propositions NEW_EVENT

**Date** : 2025-11-17

## Fonctionnalité

Permet aux utilisateurs de créer manuellement des propositions NEW_EVENT complètes via une interface dédiée, sans dépendre des agents automatiques.

## Interface utilisateur

### Route
`/proposals/create` - Page dédiée accessible depuis le bouton "Créer une proposition" de la liste des propositions.

### Caractéristiques UX

✨ **Tous les champs sont directement éditables** - Aucun clic sur un bouton "stylo" nécessaire. Les champs de texte, sélecteurs et date pickers sont immédiatement disponibles.

### Sections

#### 1. Informations de l'événement
Champs Event éditables :
- `name` ⚠️ **Obligatoire**
- `city` ⚠️ **Obligatoire**
- `department` ⚠️ **Obligatoire**
- `countrySubdivision`
- `country` (défaut: `France`)
- `fullAddress`
- `websiteUrl`
- `facebookUrl`
- `instagramUrl`

#### 2. Informations de l'édition
Champs Edition éditables :
- `year` ⚠️ **Obligatoire**
- `startDate` ⚠️ **Obligatoire**
- `endDate`
- `timeZone` (défaut: `Europe/Paris`)
- `calendarStatus`
- `registrationOpeningDate`
- `registrationClosingDate`

#### 3. Organisateur
- `organizer` (champ texte)

#### 4. Courses
- Bouton "Ajouter une course" pour créer autant de courses que nécessaire
- Pour chaque course :
  - `name` ⚠️ **Obligatoire**
  - `distance` (km) ⚠️ **Obligatoire**
  - `categoryLevel1` (Course à pied, Trail, Marche, Cyclisme, etc.) ⚠️ **Obligatoire**
  - `categoryLevel2` (Semi-marathon, Ultra trail, etc.) - Optionnel, dépend de categoryLevel1
  - `elevationGain` (m) - Optionnel
  - `startDate` - Optionnel
- Bouton poubelle pour supprimer une course

#### 5. Sources
- Au moins une source avec URL ⚠️ **Obligatoire**
- Champs par source :
  - `url` ⚠️ **Obligatoire**
  - `description` (optionnel)
- Bouton "Ajouter une source" pour documenter plusieurs sources
- Bouton poubelle pour supprimer une source

### Actions

**Bouton "Enregistrer et valider"** :
- Valide tous les champs obligatoires
- Crée la proposition avec le statut `APPROVED` automatiquement
- Marque tous les blocs comme validés (`approvedBlocks`)
- Redirige vers la liste des propositions

**Bouton "Annuler"** :
- Retour à la liste sans sauvegarder

## Backend

### Endpoint

```
POST /api/proposals/manual
```

### Payload

```typescript
{
  type: 'NEW_EVENT',
  changes: Record<string, any>,              // Changements structurés
  userModifiedChanges: Record<string, any>,  // Valeurs utilisateur
  userModifiedRaceChanges: Record<string, any>,
  races: Array<{ id: string; [key: string]: any }>,
  justification: Array<{
    type: string,
    message: string,
    metadata: {
      sources: Array<{ url: string; description: string }>,
      createdAt: string
    }
  }>,
  autoValidate: boolean  // true pour validation automatique
}
```

### Structure des données

Les données sont structurées comme les propositions FFA :

```json
{
  "changes": {
    "name": { "old": null, "new": "Trail des Loups", "confidence": 1.0 },
    "city": { "old": null, "new": "Bonnefontaine", "confidence": 1.0 },
    "edition": {
      "old": null,
      "new": {
        "year": "2026",
        "startDate": "2026-04-26T09:00:00.000Z",
        "timeZone": "Europe/Paris",
        "races": [
          {
            "name": "Trail 10km",
            "distance": 10,
            "elevationGain": 200,
            "startDate": "2026-04-26T09:00:00.000Z",
            "categoryLevel1": "TRAIL",
            "categoryLevel2": "SHORT_TRAIL"
          }
        ]
      },
      "confidence": 1.0
    }
  }
}
```

### Agent

Les propositions manuelles sont créées par l'agent **"Manual Input Agent"** :
- Type : `SPECIFIC_FIELD`
- Créé automatiquement s'il n'existe pas
- `confidence` : 1.0 (100%)

### Validation automatique

Avec `autoValidate: true` :
- Statut initial : `APPROVED` (au lieu de `PENDING`)
- Tous les blocs marqués comme validés dans `approvedBlocks`
- Proposition prête pour application immédiate

## Validation des données

### Frontend (avant envoi)

Champs obligatoires vérifiés :
- Événement : `name`, `city`, `department`, `country`
- Édition : `year`, `startDate`, `timeZone`
- Au moins une course avec `name`, `distance` et `categoryLevel1`
- Au moins une source avec `url`

### Backend

Validation Express avec `express-validator` :
- `type` doit être `'NEW_EVENT'`
- `changes`, `userModifiedChanges`, `userModifiedRaceChanges` doivent être des objets
- `races` doit être un tableau
- `justification` doit être un tableau

## Exemples d'utilisation

### Cas 1 : Événement local découvert manuellement

Un utilisateur découvre un nouveau trail sur Facebook :

1. Clique sur "Créer une proposition"
2. Remplit :
   - Nom : "Trail des Trois Châteaux"
   - Ville : "Annecy"
   - Année : 2026
   - Date : 15 mars 2026
3. Ajoute 2 courses (10km, 21km)
4. Ajoute la source : URL du post Facebook
5. Clique "Enregistrer et valider"
6. → Proposition créée et validée, prête pour application

### Cas 2 : Événement avec plusieurs sources

Un utilisateur crée un événement documenté :

1. Remplit les informations de base
2. Ajoute plusieurs sources :
   - Site officiel : https://trail-example.com
   - Page FFA : https://bases.athle.fr/...
   - Annonce Facebook : https://facebook.com/...
3. Valide
4. → Les 3 sources sont sauvegardées dans `justification.metadata.sources`

## Architecture

### Frontend

- **Page** : `apps/dashboard/src/pages/proposals/ManualProposalCreate.tsx`
- **Service** : `apps/dashboard/src/services/api.ts` → `proposalsApi.createComplete()`
- **Route** : Ajoutée dans `apps/dashboard/src/App.tsx`

### Backend

- **Route** : `apps/api/src/routes/proposals.ts` → `POST /proposals/manual`
- **Validation** : `express-validator`
- **Logging** : Agent logs avec métadonnées de création

## Améliorations futures

- [ ] Prévisualisation avant validation
- [ ] Sauvegarde en brouillon (statut DRAFT)
- [ ] Import depuis URL (scraping automatique)
- [ ] Validation des URLs de sources (format)
- [ ] Géocodage automatique de l'adresse
- [ ] Suggestions de champs basées sur l'IA
- [ ] Historique des créations manuelles par utilisateur
