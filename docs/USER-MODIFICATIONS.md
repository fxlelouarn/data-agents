# Modifications Manuelles des Propositions

## Vue d'ensemble

Les utilisateurs peuvent **modifier manuellement** les valeurs proposées par les agents avant l'approbation. Cette fonctionnalité permet de corriger ou d'ajuster les données extraites automatiquement tout en conservant un historique complet des modifications.

## ✨ Fonctionnalités

### 1. Édition inline

Chaque valeur proposée par un agent peut être modifiée directement dans l'interface :
- **Bouton ✏️ "Modifier"** : Visible à côté de chaque champ
- **Champ adapté** : Type automatiquement détecté (date/nombre/texte)
- **Validation** : ✓ Enregistrer ou ✕ Annuler

### 2. Badge "Modifié"

Les valeurs modifiées manuellement sont clairement identifiées avec un badge orange "Modifié".

### 3. Traçabilité complète

Toutes les modifications sont enregistrées avec :
- **Qui** : Utilisateur ayant effectué la modification
- **Quand** : Date et heure de modification
- **Pourquoi** : Raison optionnelle de la modification
- **Quoi** : Valeur originale de l'agent + valeur modifiée

## 🎯 Cas d'usage

### Exemple : Correction de date

```
1. Agent Google propose : startDate = "2024-04-14"
2. User vérifie sur le site officiel
3. User clique sur ✏️ et modifie : startDate = "2024-04-15"
4. User approuve la proposition
5. Système applique : "2024-04-15" (priorité à la modification user)
```

## 🔄 Architecture technique

### Stockage des modifications

```prisma
model Proposal {
  changes             Json      // ✅ Propositions originales des agents
  userModifiedChanges Json?     // ✨ Modifications utilisateur
  modificationReason  String?   // Justification
  modifiedBy          String?   // Qui a modifié
  modifiedAt          DateTime? // Quand
}
```

### Logique d'application

Lors de l'application d'une proposition approuvée, les modifications utilisateur sont **prioritaires** :

```typescript
// Dans ProposalApplicationService
const finalChanges = {
  ...proposal.changes,              // Propositions agent
  ...proposal.userModifiedChanges   // Override avec modifs user
}
```

### Types de champs éditables

| Type | Champs concernés | Format |
|------|-------------------|--------|
| **Date** | `startDate`, `endDate`, `registrationOpeningDate`, etc. | `datetime-local` picker |
| **Nombre** | `price`, `runDistance`, `runPositiveElevation`, etc. | Input numérique |
| **Texte** | `name`, `city`, `websiteUrl`, etc. | Input texte |

### Composants frontend

- **FieldEditor.tsx** : Composant réutilisable d'édition inline
- **ChangesTable.tsx** : Tableau avec bouton modifier et badge
- **ProposalDetail.tsx** : Gestion du state `userModifiedChanges`

## 📝 Guide d'utilisation

### Étape 1 : Ouvrir une proposition

1. Aller dans **Propositions** > Sélectionner une proposition `PENDING`
2. Voir les valeurs proposées par l'agent

### Étape 2 : Modifier une valeur

1. Cliquer sur le bouton **✏️ Modifier** à côté du champ
2. Modifier la valeur dans le champ qui apparaît
3. Cliquer sur **✓** pour valider ou **✕** pour annuler

### Étape 3 : Approuver

1. Vérifier que le badge **"Modifié"** est visible
2. Cliquer sur **"Tout approuver"** ou approuver champ par champ
3. Les modifications utilisateur seront appliquées en priorité

## ✅ Avantages

- ✅ **Précision accrue** : Correction manuelle des erreurs d'agents
- ✅ **Traçabilité** : Historique complet des modifications
- ✅ **Flexibilité** : Modification partielle (certains champs seulement)
- ✅ **Transparence** : Badge visuel pour identifier les modifications
- ✅ **Priorité** : Modifications user toujours appliquées en priorité

## 🔗 Voir aussi

- [PROPOSAL-APPLICATION.md](./PROPOSAL-APPLICATION.md) - Service d'application des propositions
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Architecture globale du système

**Fichier** : `apps/dashboard/src/components/proposals/ChangesTable.tsx`

Ajouter juste après la ligne 78 (après `const [editingField, setEditingField] = useState<string | null>(null)`):

```typescript
  const handleStartEdit = (fieldName: string) => {
    if (!disabled && onFieldModify) {
      setEditingField(fieldName)
    }
  }
  
  const handleSaveEdit = (fieldName: string, newValue: any) => {
    if (onFieldModify) {
      onFieldModify(fieldName, newValue, 'Modifié manuellement')
    }
    setEditingField(null)
  }
  
  const handleCancelEdit = () => {
    setEditingField(null)
  }
  
  const getFieldType = (fieldName: string): 'text' | 'number' | 'date' | 'datetime-local' => {
    if (fieldName.includes('Date')) return 'datetime-local'
    if (fieldName.includes('Distance') || fieldName.includes('Elevation') || fieldName.includes('price')) return 'number'
    return 'text'
  }
```

**Dans renderFieldComparison**, remplacer la TableCell "Valeur proposée" (lignes 148-200) par:

```typescript
        <TableCell sx={{ width: isNewEvent ? '40%' : '35%', minWidth: 200 }}>
          {editingField === fieldName ? (
            <FieldEditor
              fieldName={fieldName}
              initialValue={selectedValue}
              fieldType={getFieldType(fieldName)}
              onSave={handleSaveEdit}
              onCancel={handleCancelEdit}
            />
          ) : (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              {hasMultipleValues ? (
                <FormControl size="small" sx={{ minWidth: 200, maxWidth: '100%', width: '100%' }}>
                  <Select
                    value={selectedChanges[fieldName] !== undefined ? JSON.stringify(selectedChanges[fieldName]) : (sortedOptions.length > 0 ? JSON.stringify(sortedOptions[0].value) : '')}
                    onChange={(e) => {
                      try {
                        const parsedValue = JSON.parse(e.target.value as string)
                        if (onFieldSelect) {
                          onFieldSelect(fieldName, parsedValue)
                        }
                      } catch (error) {
                        console.error('Error parsing selected value:', error)
                      }
                    }}
                    disabled={disabled}
                  >
                    {sortedOptions.map(({ value, supportingAgents, hasConsensus }, index) => (
                      <MenuItem key={index} value={JSON.stringify(value)}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <Box sx={{ flexGrow: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: hasConsensus ? 'bold' : 'normal' }}>
                              {formatValue(value, true)}
                            </Typography>
                            <Typography variant="caption" color="textSecondary">
                              {formatAgentsList(supportingAgents)}
                            </Typography>
                          </Box>
                          {hasConsensus && (
                            <Chip
                              size="small"
                              label={`${supportingAgents.length} agents`}
                              color="success"
                              variant="filled"
                              sx={{ ml: 1, fontSize: '0.75rem', height: '20px' }}
                            />
                          )}
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ) : (
                <Box
                  sx={{ 
                    color: change.options[0].proposedValue !== change.currentValue ? 'primary.main' : 'text.secondary',
                    fontWeight: change.options[0].proposedValue !== change.currentValue ? 500 : 400,
                    maxWidth: '100%'
                  }}
                >
                  {formatValue(change.options[0].proposedValue)}
                </Box>
              )}
              
              {/* Badge si modifié manuellement */}
              {userModifiedChanges[fieldName] && (
                <Chip
                  icon={<EditNoteIcon />}
                  label="Modifié"
                  size="small"
                  color="warning"
                  variant="outlined"
                />
              )}
              
              {/* Bouton modifier */}
              {onFieldModify && !disabled && (
                <Tooltip title="Modifier manuellement">
                  <IconButton
                    size="small"
                    onClick={() => handleStartEdit(fieldName)}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          )}
        </TableCell>
```

### 8. ProposalDetail.tsx - Passer les nouveaux props

**Fichier** : `apps/dashboard/src/pages/ProposalDetail.tsx`

Ajouter dans le composant (après les autres states):

```typescript
const [userModifiedChanges, setUserModifiedChanges] = useState<Record<string, any>>({})

const handleFieldModify = (fieldName: string, newValue: any, reason?: string) => {
  setUserModifiedChanges(prev => ({
    ...prev,
    [fieldName]: newValue
  }))
  
  // Aussi mettre à jour dans selectedChanges
  setSelectedChanges(prev => ({
    ...prev,
    [fieldName]: newValue
  }))
}
```

Modifier l'appel à `<ChangesTable>` (ligne ~443):

```typescript
<ChangesTable
  title={isNewEvent ? 'Données du nouvel événement' : 'Modification de l\'édition'}
  changes={consolidatedChanges}
  isNewEvent={isNewEvent}
  selectedChanges={selectedChanges}
  formatValue={formatValue}
  formatAgentsList={formatAgentsList}
  onFieldApprove={(fieldName: string, value: any) => {
    setSelectedChanges({ ...selectedChanges, [fieldName]: value })
  }}
  onFieldReject={(fieldName: string) => {
    const newSelected = { ...selectedChanges }
    delete newSelected[fieldName]
    setSelectedChanges(newSelected)
  }}
  onFieldModify={handleFieldModify}
  userModifiedChanges={userModifiedChanges}
  disabled={safeProposal.status !== 'PENDING'}
  actions={/* ... actions existantes ... */}
/>
```

Modifier `handleApproveAll` pour envoyer `userModifiedChanges`:

```typescript
const handleApproveAll = React.useCallback(async () => {
  try {
    const changesToApprove = { ...proposalData!.data!.changes }
    Object.entries(selectedChanges).forEach(([field, selectedValue]) => {
      if (changesToApprove[field]) {
        changesToApprove[field] = selectedValue
      }
    })
    
    await updateProposalMutation.mutateAsync({
      id: proposalData!.data!.id,
      status: 'APPROVED',
      reviewedBy: 'Utilisateur',
      appliedChanges: changesToApprove,
      userModifiedChanges: Object.keys(userModifiedChanges).length > 0 ? userModifiedChanges : undefined,
      modificationReason: 'Modifications manuelles appliquées',
      modifiedBy: 'Utilisateur'
    })
  } catch (error) {
    console.error('Error approving proposal:', error)
  }
}, [proposalData, selectedChanges, userModifiedChanges, updateProposalMutation])
```

### 9. GroupedProposalDetail.tsx - Même logique

Appliquer les mêmes modifications que pour `ProposalDetail.tsx`.

### 10. Test du workflow

Une fois les modifications appliquées:

1. Démarrer le serveur dev: `npm run dev`
2. Ouvrir une proposition dans le dashboard
3. Cliquer sur l'icône ✏️ "Modifier" à côté d'une valeur
4. Modifier la valeur et cliquer ✓
5. Vérifier que le badge "Modifié" apparaît
6. Approuver la proposition
7. Vérifier dans la BD que `userModifiedChanges` est sauvegardé

## 🔍 Vérifications

```bash
# 1. Rebuild packages
npm run build

# 2. Vérifier types TypeScript
npm run tsc

# 3. Vérifier en base de données
psql data_agents -c "SELECT id, userModifiedChanges, modificationReason FROM proposals WHERE \"userModifiedChanges\" IS NOT NULL;"
```

## 📝 Notes

- Le type du champ est détecté automatiquement (date, nombre, texte)
- Les modifications utilisateur sont prioritaires sur les propositions agents
- L'historique complet est conservé (changes originaux + userModifiedChanges)
- Badge "Modifié" visible pour traçabilité
