# Support des Timezones dans l'interface

## Problème résolu

Avant ces modifications, les dates étaient affichées et éditées en UTC dans l'interface, sans tenir compte de la timezone de l'édition ou de la course. Cela causait des problèmes d'affichage et d'édition incorrects.

## Solution implémentée

### 1. Utilitaire de conversion timezone (`apps/dashboard/src/utils/timezone.ts`)

Nouvelles fonctions helper pour gérer les conversions timezone:
- `utcToTimezone()` - Convertit une date UTC vers une timezone
- `timezoneToUtc()` - Convertit une date locale vers UTC
- `formatDateInTimezone()` - Formate une date dans une timezone spécifique
- `utcToDatetimeLocal()` - Convertit UTC vers le format datetime-local HTML
- `datetimeLocalToUtc()` - Convertit datetime-local vers UTC
- `COMMON_TIMEZONES` - Liste des timezones communes pour la sélection

### 2. Composants mis à jour

#### FieldEditor (`apps/dashboard/src/components/proposals/FieldEditor.tsx`)
- Nouveau paramètre `timezone` (optionnel, par défaut 'Europe/Paris')
- Les dates sont converties de UTC vers la timezone pour l'affichage
- Les dates éditées sont reconverties vers UTC avant sauvegarde

#### TimezoneEditor (`apps/dashboard/src/components/proposals/TimezoneEditor.tsx`)
- Nouveau composant dédié pour éditer le champ `timeZone`
- Dropdown avec sélection parmi les timezones communes
- Interface cohérente avec FieldEditor

#### ChangesTable (`apps/dashboard/src/components/proposals/ChangesTable.tsx`)
- Nouveau paramètre `timezone` (optionnel)
- Passe la timezone à tous les formatters et éditeurs
- Utilise TimezoneEditor pour le champ `timeZone`

#### RaceChangesSection (`apps/dashboard/src/components/proposals/RaceChangesSection.tsx`)
- Nouveau paramètre `timezone` (optionnel)
- Passe la timezone à tous les formatters

### 3. Logique métier

#### useProposalLogic (`apps/dashboard/src/hooks/useProposalLogic.ts`)
- `formatValue()` accepte maintenant un paramètre `timezone` optionnel
- `formatDateTime()` utilise la timezone pour formatter les dates
- Propage la timezone dans tous les cas d'usage

#### ProposalDetail & GroupedProposalDetail
- Extraction automatique de la timezone depuis `Edition.timeZone`
- Ordre de priorité: `selectedChanges.timeZone` (si modifiée) > `proposed` > `new` > `current` > 'Europe/Paris' (défaut)
- La timezone est passée à ChangesTable et RaceChangesSection
- **Le champ `timeZone` apparaît comme première ligne** dans le tableau des modifications
- Quand la timezone est modifiée, `editionTimezone` est automatiquement mis à jour et toutes les dates sont réaffichées

## Comportement

### Affichage des dates
- Les dates sont **stockées en UTC** dans la base de données
- Les dates sont **affichées dans la timezone** de l'édition/course
- Format d'affichage: `EEEE dd/MM/yyyy HH:mm` (ex: "lundi 01/10/2025 14:30")

### Édition des dates
1. L'utilisateur voit la date dans la timezone locale (Edition.timeZone)
2. L'utilisateur modifie la date dans cette même timezone
3. La date est automatiquement convertie en UTC avant sauvegarde
4. Les autres utilisateurs verront la date dans leur propre timezone

### Édition de la timezone
1. **Le champ `timeZone` apparaît comme première ligne** dans le tableau des modifications (ChangesTable)
2. Le champ affiche la timezone actuelle (valeur actuelle = valeur proposée)
3. Cliquer sur le bouton "Modifier" ouvre un dropdown de sélection
4. Le dropdown permet de choisir parmi les timezones communes
5. **Dès que la timezone est modifiée, toutes les dates dans le tableau sont immédiatement réaffichées** dans la nouvelle timezone
6. La modification est réactive : pas besoin de sauvegarder pour voir le changement d'affichage

## Timezones supportées

```typescript
'Europe/Paris'
'Europe/London'
'Europe/Berlin'
'Europe/Madrid'
'Europe/Rome'
'America/New_York'
'America/Los_Angeles'
'America/Chicago'
'Asia/Tokyo'
'Asia/Shanghai'
'Australia/Sydney'
'Pacific/Auckland'
'UTC'
```

## Dépendances ajoutées

- `date-fns-tz@2.0.1` - Compatible avec date-fns v2.30.0

## Exemples d'utilisation

### Dans un composant
```tsx
import { formatDateInTimezone } from '@/utils/timezone'

// Afficher une date UTC dans une timezone
const displayDate = formatDateInTimezone(
  '2025-10-25T12:00:00Z',
  'Europe/Paris'
)
// Résultat: "samedi 25/10/2025 14:00"
```

### Extraction de la timezone depuis les proposals
```tsx
const editionTimezone = useMemo(() => {
  if (!proposalData?.data?.changes) return 'Europe/Paris'
  const changes = proposalData.data.changes as any
  if (changes.timeZone) {
    if (typeof changes.timeZone === 'string') return changes.timeZone
    if (typeof changes.timeZone === 'object' && 'proposed' in changes.timeZone) 
      return changes.timeZone.proposed
  }
  return 'Europe/Paris'
}, [proposalData])
```

## Tests recommandés

1. ✅ Vérifier que le champ `timeZone` apparaît comme première ligne dans ChangesTable
2. ✅ Vérifier l'affichage des dates dans différentes timezones
3. ✅ Éditer une date et vérifier qu'elle est sauvegardée correctement en UTC
4. ✅ **Modifier la timezone et vérifier que les dates sont immédiatement réaffichées** dans la nouvelle timezone (sans recharger)
5. ✅ Éditer le champ timeZone avec le TimezoneEditor (dropdown)
6. ✅ Vérifier que les dates des courses utilisent la même timezone que l'édition
7. ✅ Vérifier que la modification de timezone est réactive dans ProposalDetail et GroupedProposalDetail

## Notes techniques

- Les conversions utilisent `date-fns-tz` qui est basé sur l'IANA timezone database
- Les inputs HTML `datetime-local` ne supportent pas nativement les timezones, d'où la nécessité de conversion manuelle
- La timezone par défaut est 'Europe/Paris' si aucune n'est spécifiée
