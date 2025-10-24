# Guide de finalisation : Édition inline des propositions

## ✅ Terminé

1. ✅ Schéma Prisma mis à jour avec les champs `userModifiedChanges`, `modificationReason`, `modifiedBy`, `modifiedAt`
2. ✅ Migration de base de données créée et appliquée
3. ✅ ProposalService mis à jour pour accepter les nouveaux champs
4. ✅ API mise à jour (endpoint PUT `/api/proposals/:id`)
5. ✅ ProposalApplicationService modifié pour prioriser `userModifiedChanges`
6. ✅ Composant FieldEditor créé (`apps/dashboard/src/components/proposals/FieldEditor.tsx`)

## 🔄 À finaliser manuellement

### 7. ChangesTable.tsx - Modifications à ajouter

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
