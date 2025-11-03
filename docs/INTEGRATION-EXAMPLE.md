# Exemple d'Intégration des Composants Catégorisés

## Modifications à Apporter

### 1. Dans `GroupedProposalDetail.tsx`

#### Avant
```typescript
import EventChangesTable from '@/components/proposals/EventChangesTable'
import EditionChangesTable from '@/components/proposals/EditionChangesTable'

// ...dans le render
{isEventUpdateDisplay ? (
  <EventChangesTable
    title="Modification de l'événement"
    changes={consolidatedChanges}
    isNewEvent={false}
    selectedChanges={selectedChanges}
    onFieldSelect={handleSelectField}
    onFieldApprove={handleApproveField}
    onFieldModify={handleFieldModify}
    userModifiedChanges={userModifiedChanges}
    formatValue={formatValue}
    formatAgentsList={formatAgentsList}
    timezone={editionTimezone}
    disabled={!allPending || updateProposalMutation.isPending}
    actions={/* actions */}
  />
) : (
  <EditionChangesTable
    title={isNewEvent ? 'Données du nouvel événement' : 'Modification de l\'édition'}
    changes={consolidatedChanges}
    isNewEvent={isNewEvent}
    selectedChanges={selectedChanges}
    onFieldSelect={handleSelectField}
    onFieldApprove={handleApproveField}
    onFieldModify={handleFieldModify}
    userModifiedChanges={userModifiedChanges}
    formatValue={formatValue}
    formatAgentsList={formatAgentsList}
    timezone={editionTimezone}
    disabled={!allPending || updateProposalMutation.isPending}
    isEditionCanceled={isEditionCanceled}
    actions={/* actions */}
  />
)}
```

#### Après
```typescript
import CategorizedEventChangesTable from '@/components/proposals/CategorizedEventChangesTable'
import CategorizedEditionChangesTable from '@/components/proposals/CategorizedEditionChangesTable'

// ...dans le render
{isEventUpdateDisplay ? (
  <CategorizedEventChangesTable
    title="Modification de l'événement"
    changes={consolidatedChanges}
    isNewEvent={false}
    selectedChanges={selectedChanges}
    onFieldSelect={handleSelectField}
    onFieldApprove={handleApproveField}
    onFieldModify={handleFieldModify}
    userModifiedChanges={userModifiedChanges}
    formatValue={formatValue}
    formatAgentsList={formatAgentsList}
    timezone={editionTimezone}
    disabled={!allPending || updateProposalMutation.isPending || isEventDead}
    actions={allPending ? (
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          color="success"
          size="small"
          startIcon={<ApproveIcon />}
          onClick={handleApproveAll}
          disabled={updateProposalMutation.isPending || bulkArchiveMutation.isPending || isEventDead}
        >
          Tout approuver
        </Button>
        <Button
          variant="outlined"
          color="error"
          size="small"
          startIcon={<RejectIcon />}
          onClick={handleRejectAll}
          disabled={updateProposalMutation.isPending || bulkArchiveMutation.isPending || isEventDead}
        >
          Tout rejeter
        </Button>
        {!isNewEvent && eventId && (
          <Button
            variant="outlined"
            color="warning"
            size="small"
            onClick={() => setKillDialogOpen(true)}
            disabled={killEventMutation.isPending || isEventDead}
          >
            Tuer l'événement
          </Button>
        )}
      </Box>
    ) : isEventDead && !isNewEvent && eventId ? (
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          variant="contained"
          color="primary"
          size="small"
          onClick={handleReviveEvent}
          disabled={reviveEventMutation.isPending}
        >
          Ressusciter l'événement
        </Button>
      </Box>
    ) : undefined}
  />
) : (
  <CategorizedEditionChangesTable
    title={isNewEvent ? 'Données du nouvel événement' : 'Modification de l\'édition'}
    changes={consolidatedChanges}
    isNewEvent={isNewEvent}
    selectedChanges={selectedChanges}
    onFieldSelect={handleSelectField}
    onFieldApprove={handleApproveField}
    onFieldModify={handleFieldModify}
    userModifiedChanges={userModifiedChanges}
    formatValue={formatValue}
    formatAgentsList={formatAgentsList}
    timezone={editionTimezone}
    disabled={!allPending || updateProposalMutation.isPending || bulkArchiveMutation.isPending || isEventDead}
    isEditionCanceled={isEditionCanceled || isEventDead}
    actions={allPending ? (
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          color="success"
          size="small"
          startIcon={<ApproveIcon />}
          onClick={handleApproveAll}
          disabled={updateProposalMutation.isPending || bulkArchiveMutation.isPending || isEventDead}
        >
          Tout approuver
        </Button>
        <Button
          variant="outlined"
          color="error"
          size="small"
          startIcon={<RejectIcon />}
          onClick={handleRejectAll}
          disabled={updateProposalMutation.isPending || bulkArchiveMutation.isPending || isEventDead}
        >
          Tout rejeter
        </Button>
        {!isNewEvent && eventId && (
          <Button
            variant="outlined"
            color="warning"
            size="small"
            onClick={() => setKillDialogOpen(true)}
            disabled={killEventMutation.isPending || isEventDead}
          >
            Tuer l'événement
          </Button>
        )}
      </Box>
    ) : isEventDead && !isNewEvent && eventId ? (
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          variant="contained"
          color="primary"
          size="small"
          onClick={handleReviveEvent}
          disabled={reviveEventMutation.isPending}
        >
          Ressusciter l'événement
        </Button>
      </Box>
    ) : undefined}
  />
)}
```

### 2. Dans `ProposalDetail.tsx`

Les modifications sont identiques : remplacer les imports et les composants.

## Différences Visuelles

### Avant (sans catégorisation)
```
┌─────────────────────────────────────────────────┐
│ 📝 Modification de l'édition                    │
│ ─────────────────────────────────────────────── │
│                                                  │
│ Champ          │ Actuel      │ Proposé  │ Conf  │
│ ───────────────┼─────────────┼──────────┼────── │
│ startDate      │ 2024-06-15  │ 2024-... │ 95%   │
│ endDate        │ 2024-06-15  │ 2024-... │ 95%   │
│ timeZone       │ Europe/...  │ Europe/..│ 100%  │
│ calendarStatus │ TO_BE_CON...│ CONFIR...│ 90%   │
│ registration...│ -           │ 2024-... │ 85%   │
│ currency       │ EUR         │ EUR      │ 100%  │
│ federationId   │ -           │ FFA      │ 80%   │
│ ...            │ ...         │ ...      │ ...   │
└─────────────────────────────────────────────────┘
```

### Après (avec catégorisation)
```
┌─────────────────────────────────────────────────┐
│ 📋 Modifications de l'édition    [Actions →]    │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ 📅 Dates de l'édition    [3 champs]        ▼   │
│ ─────────────────────────────────────────────── │
│ Champ      │ Actuel      │ Proposé    │ Conf   │
│ ───────────┼─────────────┼────────────┼─────── │
│ startDate  │ 2024-06-15  │ 2024-06-20 │ 95%    │
│ endDate    │ 2024-06-15  │ 2024-06-20 │ 95%    │
│ timeZone   │ Europe/Pa...│ Europe/... │ 100%   │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ 💼 Statut et organisation [1 champ]        ▼   │
│ ─────────────────────────────────────────────── │
│ Champ          │ Actuel    │ Proposé    │ Conf │
│ ───────────────┼───────────┼────────────┼───── │
│ calendarStatus │ TO_BE_... │ CONFIRMED  │ 90%  │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ 👤 Inscriptions              [1 champ]     ▼   │
│ ─────────────────────────────────────────────── │
│ Champ               │ Actuel │ Proposé  │ Conf │
│ ────────────────────┼────────┼──────────┼───── │
│ registrationOpening │ -      │ 2024-... │ 85%  │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ 💰 Commerce                  [1 champ]     ▼   │
│ ─────────────────────────────────────────────── │
│ Champ    │ Actuel │ Proposé │ Conf             │
│ ─────────┼────────┼─────────┼───────────────── │
│ currency │ EUR    │ EUR     │ 100%             │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ 🤝 Partenariats              [1 champ]     ▼   │
│ ─────────────────────────────────────────────── │
│ Champ        │ Actuel │ Proposé │ Conf         │
│ ─────────────┼────────┼─────────┼───────────── │
│ federationId │ -      │ FFA     │ 80%          │
└─────────────────────────────────────────────────┘
```

## Avantages de la Catégorisation

### 1. **Clarté Visuelle**
- ✅ Organisation logique par thème
- ✅ Icônes pour identification rapide
- ✅ Compteur de champs par catégorie
- ✅ Description contextuelle

### 2. **Navigation Améliorée**
- ✅ Accordions collapsibles (mais tous ouverts par défaut)
- ✅ Scan rapide de toutes les modifications
- ✅ Focus possible sur une catégorie spécifique

### 3. **Filtrage Intelligent**
- ✅ Catégories vides automatiquement masquées
- ✅ Pas d'information inutile affichée
- ✅ Adapté au contenu de chaque proposition

### 4. **Compatibilité**
- ✅ Fonctionne avec Google Search Date Agent
- ✅ Fonctionne avec FFA Scraper Agent
- ✅ Pas de régression fonctionnelle
- ✅ API identique aux anciens composants

## Test de la Migration

### Étape 1 : Build
```bash
cd /Users/fx/dev/data-agents/apps/dashboard
npm run build
```

### Étape 2 : Vérifier les Types
Vérifier qu'aucune erreur TypeScript n'apparaît.

### Étape 3 : Test Visuel
1. Lancer l'application en mode dev
2. Ouvrir une proposition d'EDITION_UPDATE (Google Agent)
3. Vérifier l'affichage catégorisé
4. Ouvrir une proposition de NEW_EVENT (FFA Scraper)
5. Vérifier l'affichage catégorisé

### Étape 4 : Test Fonctionnel
- [ ] Sélectionner des valeurs dans les dropdowns
- [ ] Modifier manuellement un champ
- [ ] Approuver/Rejeter une proposition
- [ ] Vérifier que les éditeurs personnalisés fonctionnent (calendarStatus, timeZone)

## Rollback si Nécessaire

Si des problèmes apparaissent, il suffit de revenir aux anciens imports :

```typescript
// Rollback simple
import EventChangesTable from '@/components/proposals/EventChangesTable'
import EditionChangesTable from '@/components/proposals/EditionChangesTable'

// Et utiliser les anciens composants
<EventChangesTable {...props} />
<EditionChangesTable {...props} />
```

Les anciens composants restent disponibles et fonctionnels.

## Support

En cas de problème :
1. Vérifier les logs de la console
2. Vérifier que tous les imports sont corrects
3. Vérifier que `fieldCategories.ts` est bien importé
4. Consulter la documentation dans `docs/CATEGORIZED-CHANGES-USAGE.md`
