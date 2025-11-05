# Guide de test : Approbation partielle par bloc

## Objectif

Tester que seuls les changements des blocs approuvés sont appliqués lors de l'application d'une proposition.

## Scénario de test

### 1. Créer une proposition mixte (édition + courses)

Créer une proposition `EDITION_UPDATE` qui contient à la fois :
- Des changements d'édition (ex: `startDate`, `calendarStatus`)
- Des changements de courses (ex: `racesToAdd`, `races`)

```bash
# Exemple via l'API
POST /api/proposals
{
  "editionId": "12345",
  "fieldName": "startDate",
  "fieldValue": "2025-06-15",
  "type": "EDITION_UPDATE",
  "justification": "Test approbation partielle"
}
```

### 2. Vérifier la catégorisation des blocs

```bash
GET /api/proposals/:id/approved-blocks
```

Devrait retourner :
```json
{
  "success": true,
  "data": {
    "proposalId": "xxx",
    "approvedBlocks": {},
    "changesByBlock": {
      "edition": ["startDate", "calendarStatus"],
      "races": ["racesToAdd"]
    },
    "summary": [
      {
        "block": "edition",
        "isApproved": false,
        "fieldCount": 2,
        "fields": ["startDate", "calendarStatus"]
      },
      {
        "block": "races",
        "isApproved": false,
        "fieldCount": 1,
        "fields": ["racesToAdd"]
      }
    ]
  }
}
```

### 3. Approuver uniquement le bloc "Édition"

```bash
PUT /api/proposals/:id
{
  "status": "APPROVED",
  "reviewedBy": "Test User",
  "block": "edition"
}
```

### 4. Vérifier que le bloc est marqué comme approuvé

```bash
GET /api/proposals/:id/approved-blocks
```

Devrait retourner :
```json
{
  "approvedBlocks": {
    "edition": true
  },
  "summary": [
    {
      "block": "edition",
      "isApproved": true,
      ...
    },
    {
      "block": "races",
      "isApproved": false,
      ...
    }
  ]
}
```

### 5. Tenter d'appliquer la proposition

```bash
POST /api/proposals/:id/apply
{
  "selectedChanges": {
    "startDate": "2025-06-15",
    "calendarStatus": "CONFIRMED",
    "racesToAdd": [...]
  }
}
```

**Résultat attendu** :
- Seuls les changements du bloc "edition" (`startDate`, `calendarStatus`) sont appliqués
- Les changements du bloc "races" (`racesToAdd`) sont **filtrés**
- Le résultat contient :

```json
{
  "success": true,
  "data": {
    "success": true,
    "appliedChanges": {
      "startDate": "2025-06-15",
      "calendarStatus": "CONFIRMED"
    },
    "filteredChanges": {
      "removed": ["racesToAdd"],
      "approvedBlocks": {
        "edition": true
      }
    }
  }
}
```

### 6. Approuver le bloc "Courses"

```bash
PUT /api/proposals/:id
{
  "status": "APPROVED",
  "reviewedBy": "Test User",
  "block": "races"
}
```

### 7. Ré-appliquer la proposition

```bash
POST /api/proposals/:id/apply
{
  "selectedChanges": {
    "startDate": "2025-06-15",
    "calendarStatus": "CONFIRMED",
    "racesToAdd": [...]
  }
}
```

**Résultat attendu** :
- TOUS les changements sont maintenant appliqués
- Aucun filtre n'est appliqué car tous les blocs sont approuvés

```json
{
  "success": true,
  "data": {
    "success": true,
    "appliedChanges": {
      "startDate": "2025-06-15",
      "calendarStatus": "CONFIRMED",
      "racesToAdd": [...]
    }
  }
}
```

## Validation des logs

Pendant l'étape 5, les logs devraient contenir :
```
[INFO] Filtered out 1 changes from unapproved blocks: racesToAdd
```

## Test de régression

### Scénario 1 : Approbation globale (sans bloc spécifique)

```bash
PUT /api/proposals/:id
{
  "status": "APPROVED",
  "reviewedBy": "Test User"
  // PAS de paramètre "block"
}
```

**Résultat attendu** :
- `approvedBlocks` reste `{}`
- Lors de l'application, TOUS les changements sont appliqués (comportement historique)

### Scénario 2 : Proposition sans `approvedBlocks` (données existantes)

Pour les propositions existantes créées avant la migration :
- `approvedBlocks` est `null` ou `{}`
- L'application devrait fonctionner normalement (tous les changements appliqués)

## Vérification en base de données

```sql
-- Vérifier le champ approvedBlocks
SELECT id, "approvedBlocks", status 
FROM proposals 
WHERE id = 'xxx';

-- Devrait retourner quelque chose comme :
-- approvedBlocks: {"edition": true, "races": false}
```

## Points de vigilance

1. **Compatibilité ascendante** : Les propositions sans `approvedBlocks` doivent fonctionner
2. **Logs clairs** : Les changements filtrés doivent être loggés
3. **Interface utilisateur** : Afficher visuellement quels blocs sont approuvés
4. **Application idempotente** : Ré-appliquer une proposition ne doit pas causer d'erreur

## Résultat attendu global

✅ Seuls les changements des blocs approuvés sont appliqués  
✅ Les changements filtrés sont documentés dans le résultat  
✅ La rétrocompatibilité est préservée  
✅ Les logs sont clairs et informatifs  
