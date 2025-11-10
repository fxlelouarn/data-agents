# Fonctionnalité : Affichage et sélection des matches rejetés (NEW_EVENT)

**Date** : 2025-11-10  
**Auteur** : Warp AI Assistant  
**Type** : Nouvelle fonctionnalité

## 📋 Résumé

Cette fonctionnalité permet à l'utilisateur de corriger manuellement les **faux négatifs** de l'algorithme de matching FFA. Lorsqu'une proposition NEW_EVENT est créée, le dashboard affiche les 3 meilleurs matches rejetés par l'algorithme. Si l'utilisateur reconnaît l'un d'entre eux, il peut convertir la proposition NEW_EVENT en EDITION_UPDATE.

## 🎯 Problème résolu

### Symptômes
L'algorithme de matching FFA peut parfois ne pas détecter un événement existant en raison de :
- Variations de noms (ex: "Trail des Loups #3" vs "Trail des loups")
- Différences de dates importantes (ex: 13 jours d'écart)
- Scores de matching juste en-dessous du seuil (ex: 0.74 < 0.75)

### Conséquence
Une proposition **NEW_EVENT** est créée alors que l'événement existe déjà dans Miles Republic.

### Solution
Afficher les 3 meilleurs candidats rejetés pour que l'utilisateur puisse manuellement sélectionner le bon événement.

## 🏗️ Architecture

### 1. Backend - Enrichissement des propositions

**Fichiers modifiés** :
- `apps/agents/src/ffa/matcher.ts`
- `apps/agents/src/ffa/types.ts`
- `apps/agents/src/FFAScraperAgent.ts`

**Principe** :
Le matcher FFA calcule déjà les top 3 matches. On stocke maintenant ces informations dans `MatchResult.rejectedMatches` :

```typescript
export interface MatchResult {
  type: 'EXACT_MATCH' | 'FUZZY_MATCH' | 'NO_MATCH'
  event?: { id: string, name: string, city: string, similarity: number }
  edition?: { id: string, year: string, startDate: Date | null }
  confidence: number
  rejectedMatches?: Array<{
    eventId: number
    eventName: string
    eventSlug: string
    eventCity: string
    eventDepartment: string
    editionId?: number
    editionYear?: string
    matchScore: number
    nameScore: number
    cityScore: number
    departmentMatch: boolean
    dateProximity: number
  }>
}
```

Les `rejectedMatches` sont ensuite stockés dans `proposal.justification[0].metadata.rejectedMatches`.

### 2. Backend - Endpoint de conversion

**Fichier** : `apps/api/src/routes/proposals.ts`

**Endpoint** : `POST /api/proposals/:id/convert-to-edition-update`

**Paramètres** :
```typescript
{
  eventId: number
  editionId: number
  eventName: string
  eventSlug: string
  editionYear: string
}
```

**Processus** :
1. Récupère la proposition NEW_EVENT originale
2. Se connecte à Miles Republic pour récupérer l'édition existante
3. Transforme les changes NEW_EVENT → EDITION_UPDATE avec valeurs `old` et `new`
4. **Fait le matching des courses par distance** (tolérance 5%)
5. Crée la nouvelle proposition EDITION_UPDATE
6. Archive la proposition NEW_EVENT originale

### 3. Frontend - Interface utilisateur

**Fichiers modifiés** :
- `apps/dashboard/src/components/proposals/new-event/RejectedMatchesCard.tsx` (nouveau)
- `apps/dashboard/src/pages/proposals/detail/new-event/NewEventDetail.tsx`
- `apps/dashboard/src/pages/proposals/detail/new-event/NewEventGroupedDetail.tsx`
- `apps/dashboard/src/hooks/useApi.ts`
- `apps/dashboard/src/services/api.ts`

**Composant** : `RejectedMatchesCard`

Affiche une **Card jaune** dans la colonne de droite avec :
- Les 3 meilleurs matches rejetés
- Pour chaque match :
  - Badge de position (#1, #2, #3)
  - Badge de score (coloré si ≥ 75%)
  - Badge "Même département" si applicable
  - Nom de l'événement (lien cliquable vers Miles Republic)
  - Ville, département, année de l'édition
  - Scores détaillés (nom, ville, date)
  - Bouton "Sélectionner" (ou "Pas d'édition" si désactivé)

## 🔄 Workflow utilisateur

1. **Ouverture d'une proposition NEW_EVENT**
   - Le dashboard affiche automatiquement la `RejectedMatchesCard` si des matches ont été trouvés

2. **Consultation des matches**
   - L'utilisateur peut cliquer sur le nom pour voir l'événement sur Miles Republic
   - Il peut analyser les scores pour comprendre pourquoi le match a été rejeté

3. **Sélection d'un match**
   - Clic sur "Sélectionner"
   - Confirmation avec le nom de l'événement
   - La proposition NEW_EVENT est archivée
   - Une nouvelle proposition EDITION_UPDATE est créée
   - Redirection automatique vers la nouvelle proposition

4. **Vérification de la conversion**
   - La colonne "Valeur actuelle" affiche les données de l'édition existante
   - La colonne "Valeur proposée" affiche les données FFA
   - Les courses sont déjà matchées (courses à ajouter vs courses à mettre à jour)

## 🎨 Design

### Card principale
```
⚠️ Événements similaires détectés

L'algorithme de matching a trouvé ces événements existants.
Si l'un d'entre eux correspond, sélectionnez-le pour
convertir cette proposition.

┌─────────────────────────────────────────────────────┐
│ #1  Score: 88%  Même département                    │
│                                                      │
│ Trail des Loups ↗                                   │
│ Bonnefontaine (39) • Édition 2026                   │
│ Nom: 95%  Ville: 82%  Date: 86%                     │
│                                          [Sélectionner]│
└─────────────────────────────────────────────────────┘

💡 Astuce : Si aucun de ces événements ne correspond,
vous pouvez ignorer cette alerte et approuver la création
du nouvel événement.
```

### Couleurs MUI
- Card : `warning.lighter` (jaune pâle)
- Bordure : `warning.light`
- Icône : `warning.main`
- Badge score ≥75% : `primary`
- Badge score <75% : `default`
- Badge département : `success` (vert)

## 🧪 Matching des courses

### Algorithme (identique à FFAScraperAgent)

1. **Matching par distance** (prioritaire) :
   - Convertit distances DB (km) → mètres
   - Tolérance : 5%
   - Exemple : 21.1km ↔ 21.097km = ✅ Match

2. **Fallback sur le nom** :
   - Si distance FFA = 0 ou non disponible
   - Compare les noms (inclusion)

3. **Vérification des mises à jour** :
   - Élévation (tolérance 10m)
   - Date/heure de départ (tolérance 1h)

### Résultat

- **`racesToAdd`** : Courses FFA non matchées → nouvelles courses
- **`racesToUpdate`** : Courses matchées avec différences → mises à jour

### Exemple

**Édition existante** :
- 10km (09:00)
- Semi-Marathon 21.1km (10:00, D+ 150m)

**Courses FFA** :
- 10km (09:30)
- Semi-Marathon 21.1km (10:00, D+ 200m)
- 5km (14:00)

**Après matching** :
- ✅ 10km → Mise à jour heure (09:00 → 09:30)
- ✅ Semi-Marathon → Mise à jour élévation (150m → 200m)
- ➕ 5km → Nouvelle course

## 📊 Métriques

### Données stockées par match rejeté

```json
{
  "eventId": 13446,
  "eventName": "Trail des Loups",
  "eventSlug": "trail-des-loups-13446",
  "eventCity": "Bonnefontaine",
  "eventDepartment": "39",
  "editionId": 44684,
  "editionYear": "2026",
  "matchScore": 0.88,
  "nameScore": 0.95,
  "cityScore": 0.82,
  "departmentMatch": true,
  "dateProximity": 0.86
}
```

## 🔍 Cas d'usage

### Cas 1 : Nom avec numéro d'édition
- **FFA** : "Trail des Loups #3"
- **DB** : "Trail des loups"
- **Score** : 0.74 (< 0.75) → NO_MATCH
- **Action** : L'utilisateur voit le match #1 à 74% et le sélectionne

### Cas 2 : Dates éloignées
- **FFA** : 26 avril 2026
- **DB** : 13 avril 2026 (13 jours d'écart)
- **Score** : 0.74 (pénalité temporelle)
- **Action** : L'utilisateur vérifie sur Miles Republic et confirme

### Cas 3 : Vrai nouveau événement
- **FFA** : "Semi-Marathon du Grand Nancy"
- **Matches** : Aucun score > 0.36
- **Action** : L'utilisateur ignore la card et approuve la création

## ⚠️ Limitations

1. **Édition obligatoire** : Le bouton "Sélectionner" est désactivé si l'édition n'existe pas dans Miles Republic pour l'année concernée

2. **Top 3 uniquement** : Seuls les 3 meilleurs matches sont affichés (pour éviter la surcharge cognitive)

3. **Pas de création d'édition** : La conversion ne peut créer que des EDITION_UPDATE, pas de nouvelles éditions

## 🔐 Sécurité

- ✅ Validation des paramètres (eventId, editionId, etc.)
- ✅ Vérification que la proposition est bien NEW_EVENT et PENDING
- ✅ Transaction atomique (archivage + création)
- ✅ Logging complet pour audit

## 📈 Améliorations futures

1. **Pagination** : Afficher plus de 3 matches si demandé
2. **Filtres** : Filtrer par score minimum, département, etc.
3. **Preview** : Prévisualiser les changements avant conversion
4. **Bulk action** : Convertir plusieurs propositions NEW_EVENT d'un coup
5. **Smart suggestions** : Utiliser l'historique utilisateur pour suggérer le meilleur match

## 📚 Documentation associée

- `apps/agents/src/ffa/MATCHING.md` - Documentation de l'algorithme de matching
- `WARP.md` - Stack technique et conventions UI (Material-UI)
- `docs/FIX-EDITION-NUMBER-SYMBOLS.md` - Fix nettoyage numéros d'édition
- `docs/CONFIDENCE-NEW-EVENT.md` - Système de confiance inversée

## 🎯 Impact

### Avant
- ❌ Faux négatifs → Doublons dans Miles Republic
- ❌ Travail manuel pour détecter et fusionner les doublons
- ❌ Perte de données lors de la fusion

### Après
- ✅ Correction manuelle des faux négatifs avant création
- ✅ Pas de doublons créés
- ✅ Enrichissement de l'édition existante
- ✅ Historique de décision utilisateur pour améliorer l'algorithme
