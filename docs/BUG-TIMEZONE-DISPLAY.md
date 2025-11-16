# Bug - Affichage incorrect de l'heure dans les propositions

## 🐛 Symptôme

Dans le dashboard (production), les propositions Google Search Date Agent affichent :
- **Affiché** : `dimanche 23/11/2025 01:00`
- **Attendu** : `dimanche 23/11/2025 00:00`

## 🔍 Cause racine

### Chaîne de données

1. **Google Agent propose** : `2025-11-23` (date uniquement, pas d'heure)
2. **Agent crée Date UTC** : `new Date('2025-11-23')` → `2025-11-22T23:00:00.000Z` (minuit heure française = 23h UTC)
3. **DB stocke** : `2025-11-22T23:00:00.000Z` (UTC)
4. **Dashboard lit** : `2025-11-22T23:00:00.000Z`
5. **Dashboard affiche** : Convertit en timezone... mais **quelle timezone** ?

### Problème

Le dashboard utilise `formatDateInTimezone(dateString, timezone, format)` pour afficher les dates.

**Code actuel** (`GroupedProposalDetailBase.tsx` ligne 450-468) :

```typescript
const editionTimezone = useMemo(() => {
  if (!workingGroup) return 'Europe/Paris'
  
  // Chercher timeZone dans userModifiedChanges (priorité)
  if (workingGroup.userModifiedChanges?.timeZone) {
    return workingGroup.userModifiedChanges.timeZone
  }
  
  // Sinon chercher dans consolidatedChanges
  const timeZoneChange = workingGroup.consolidatedChanges.find(c => c.field === 'timeZone')
  if (timeZoneChange?.selectedValue) {
    return timeZoneChange.selectedValue
  }
  if (timeZoneChange?.options[0]?.proposedValue) {
    return timeZoneChange.options[0].proposedValue
  }
  
  return 'Europe/Paris' // Fallback
}, [workingGroup])
```

**Le problème** : Pour une proposition `EDITION_UPDATE` qui **ne modifie que `startDate`**, il n'y a **pas de champ `timeZone` dans `consolidatedChanges`**.

Résultat : Le dashboard utilise le fallback `'Europe/Paris'`, mais...

**Wait, ça devrait fonctionner !** 🤔

L'événement "Trophée des 3C Calvisson" est en France, donc `'Europe/Paris'` est correct.

### Investigation plus profonde

Vérifions le code de `formatDateInTimezone` :

```typescript
// apps/dashboard/src/utils/timezone.ts
export function formatDateInTimezone(
  dateString: string,
  timezone: string,
  formatString: string
): string {
  const date = toZonedTime(dateString, timezone)
  return format(date, formatString, { locale: fr })
}
```

Utilise `date-fns-tz` avec `toZonedTime()`.

**Hypothèse** : Le bug vient peut-être du **navigateur de l'utilisateur** qui n'est pas en timezone française ?

Non, `toZonedTime()` force la timezone indépendamment du navigateur.

### Hypothèse corrigée

Le bug vient probablement de l'**absence de timezone dans les propositions** et d'un fallback incorrect.

**Test à faire** :
1. Logger `editionTimezone` dans le dashboard
2. Logger la date reçue depuis l'API
3. Vérifier si le timezone est bien passé à `formatDateInTimezone`

## 🔧 Solutions possibles

### Solution 1 : Enrichir les propositions avec `editionTimeZone`

Ajouter le timezone de l'édition dans l'enrichissement des propositions (`apps/api/src/routes/proposals.ts`) :

```typescript
async function enrichProposal(proposal: any) {
  // ... code existant ...
  
  if (proposal.editionId && edition) {
    proposalEnriched.editionTimeZone = edition.timeZone || 'Europe/Paris'
  }
  
  return proposalEnriched
}
```

**Avantages** :
- ✅ Le timezone est toujours disponible côté frontend
- ✅ Fonctionne pour tous les types de propositions
- ✅ Cohérent avec l'enrichissement existant (`eventName`, `eventCity`, etc.)

**Inconvénients** :
- Nécessite une requête supplémentaire pour récupérer l'édition (déjà fait ?)

### Solution 2 : Fallback intelligent dans le frontend

Si `timeZone` n'est pas dans `consolidatedChanges`, le récupérer depuis la **valeur actuelle de l'édition** :

```typescript
const editionTimezone = useMemo(() => {
  // ... code existant ...
  
  // Nouveau : Chercher dans les valeurs actuelles des changements
  const timeZoneChange = workingGroup.consolidatedChanges.find(c => c.field === 'timeZone')
  if (timeZoneChange?.currentValue) {
    return timeZoneChange.currentValue
  }
  
  return 'Europe/Paris' // Fallback
}, [workingGroup])
```

**Avantages** :
- ✅ Pas de changement backend
- ✅ Utilise la donnée déjà disponible

**Inconvénients** :
- ❌ Ne fonctionne que si `timeZone` est dans `consolidatedChanges` (même sans proposition)
- ❌ Complexité accrue dans le frontend

### Solution 3 : Toujours inclure `timeZone` dans les changements consolidés

Modifier la logique de consolidation pour **toujours inclure** `timeZone` avec la `currentValue`, même si aucun agent ne le propose :

```typescript
// Dans useProposalEditor ou lors de la consolidation
const essentialFields = ['timeZone', 'calendarStatus']

// Ajouter automatiquement ces champs avec currentValue si absents
for (const field of essentialFields) {
  if (!consolidatedChanges.some(c => c.field === field)) {
    const currentValue = getCurrentEditionValue(field)
    if (currentValue) {
      consolidatedChanges.push({
        field,
        options: [],
        currentValue,
        selectedValue: currentValue
      })
    }
  }
}
```

**Avantages** :
- ✅ Garantit que `timeZone` est toujours disponible
- ✅ Logique centralisée

**Inconvénients** :
- ❌ Nécessite d'avoir accès aux valeurs actuelles de l'édition
- ❌ Complexité dans la logique de consolidation

## 📝 Recommandation

**Solution 1 (enrichissement backend)** est la meilleure car :
1. Simple à implémenter
2. Cohérent avec l'enrichissement existant
3. Fonctionne pour tous les cas

## 🚀 Action Items

- [ ] Vérifier si `enrichProposal()` récupère déjà l'édition
- [ ] Ajouter `editionTimeZone` dans l'enrichissement
- [ ] Tester avec une proposition Google Search Date
- [ ] Vérifier les autres types de propositions (FFA, etc.)

## 📚 Fichiers concernés

- `apps/api/src/routes/proposals.ts` : `enrichProposal()`
- `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx` : `editionTimezone` useMemo
- `apps/dashboard/src/hooks/useProposalLogic.ts` : `formatDateTime()`
- `apps/dashboard/src/utils/timezone.ts` : `formatDateInTimezone()`
