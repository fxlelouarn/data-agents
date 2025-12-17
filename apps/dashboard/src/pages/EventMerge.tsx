import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  TextField,
  ToggleButtonGroup,
  ToggleButton,
  Alert,
  Chip,
  Autocomplete,
  CircularProgress,
  Divider,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  FormControlLabel,
  Switch,
} from '@mui/material'
import {
  Merge as MergeIcon,
  Event as EventIcon,
  ArrowBack as ArrowBackIcon,
  Warning as WarningIcon,
  ContentCopy as ContentCopyIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material'
import { useMeilisearchAutocomplete, MeilisearchEvent } from '@/hooks/useMeilisearchAutocomplete'
import { useEventDetails, useCreateMergeProposal } from '@/hooks/useApi'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface EventData {
  id: number
  name: string
  slug: string | null
  city: string
  country: string
  status: string
  oldSlugId: number | null
  websiteUrl: string | null
  editions: Array<{
    id: number
    year: number
    startDate: string | null
    endDate: string | null
    status: string
    calendarStatus: string
    races: Array<{
      id: number
      name: string
      runDistance: number | null
      runPositiveElevation: number | null
      categoryLevel1: string | null
      categoryLevel2: string | null
    }>
  }>
}

const EventMerge: React.FC = () => {
  const navigate = useNavigate()

  // État pour les recherches
  const [leftSearch, setLeftSearch] = useState('')
  const [rightSearch, setRightSearch] = useState('')

  // IDs des événements sélectionnés
  const [leftEventId, setLeftEventId] = useState<number | null>(null)
  const [rightEventId, setRightEventId] = useState<number | null>(null)

  // Quel événement conserver
  const [keepEventId, setKeepEventId] = useState<number | null>(null)

  // Nouveau nom optionnel
  const [newEventName, setNewEventName] = useState('')

  // Option copie des éditions manquantes (activée par défaut)
  const [copyMissingEditions, setCopyMissingEditions] = useState(true)

  // Résultats Meilisearch
  const leftAutocomplete = useMeilisearchAutocomplete(leftSearch, 10)
  const rightAutocomplete = useMeilisearchAutocomplete(rightSearch, 10)

  // Détails des événements sélectionnés
  const { data: leftEvent, isLoading: leftLoading } = useEventDetails(leftEventId)
  const { data: rightEvent, isLoading: rightLoading } = useEventDetails(rightEventId)

  // Mutation pour créer la proposition
  const createMergeMutation = useCreateMergeProposal()

  // État pour le dialogue de confirmation de force
  const [forceDialogOpen, setForceDialogOpen] = useState(false)
  const [existingRedirectInfo, setExistingRedirectInfo] = useState<{
    oldSlugId: number
    eventExists: boolean
    eventName?: string
  } | null>(null)

  // Calculer l'heuristique : événement avec le plus d'éditions
  const suggestedKeepEventId = useMemo(() => {
    if (!leftEvent || !rightEvent) return null
    return (leftEvent.editions?.length || 0) >= (rightEvent.editions?.length || 0)
      ? leftEvent.id
      : rightEvent.id
  }, [leftEvent, rightEvent])

  // Calculer les éditions qui seront copiées
  const editionsToCopy = useMemo(() => {
    if (!leftEvent || !rightEvent || !keepEventId || !copyMissingEditions) return []

    const keepEvent = keepEventId === leftEvent.id ? leftEvent : rightEvent
    const duplicateEvent = keepEventId === leftEvent.id ? rightEvent : leftEvent

    const keepEventYears = new Set(keepEvent.editions?.map(e => e.year) || [])

    return (duplicateEvent.editions || [])
      .filter(e => !keepEventYears.has(e.year))
      .sort((a, b) => a.year - b.year)
  }, [leftEvent, rightEvent, keepEventId, copyMissingEditions])

  // Auto-sélectionner l'événement suggéré quand les deux sont chargés
  React.useEffect(() => {
    if (suggestedKeepEventId && keepEventId === null) {
      setKeepEventId(suggestedKeepEventId)
    }
  }, [suggestedKeepEventId, keepEventId])

  const handleLeftSelect = (_: any, value: MeilisearchEvent | null) => {
    if (value) {
      const id = parseInt(value.objectID, 10)
      setLeftEventId(id)
      setLeftSearch('')
      // Réinitialiser la sélection si on change un événement
      setKeepEventId(null)
    }
  }

  const handleRightSelect = (_: any, value: MeilisearchEvent | null) => {
    if (value) {
      const id = parseInt(value.objectID, 10)
      setRightEventId(id)
      setRightSearch('')
      // Réinitialiser la sélection si on change un événement
      setKeepEventId(null)
    }
  }

  const handleSubmit = async (forceOverwrite = false) => {
    if (!leftEvent || !rightEvent || !keepEventId) return

    const duplicateEventId = keepEventId === leftEvent.id ? rightEvent.id : leftEvent.id

    createMergeMutation.mutate({
      keepEventId,
      duplicateEventId,
      newEventName: newEventName.trim() || undefined,
      forceOverwrite,
      copyMissingEditions,
    }, {
      onSuccess: (response) => {
        setForceDialogOpen(false)
        setExistingRedirectInfo(null)
        navigate(`/proposals/${response.data.proposal.id}`)
      },
      onError: (error: any) => {
        // Vérifier si c'est une erreur de redirection existante qu'on peut forcer
        const errorData = error.response?.data
        if (errorData?.code === 'ALREADY_HAS_REDIRECT' && errorData?.details?.canForce) {
          setExistingRedirectInfo(errorData.details.existingRedirect)
          setForceDialogOpen(true)
        }
      }
    })
  }

  const handleForceConfirm = () => {
    handleSubmit(true)
  }

  const handleForceCancel = () => {
    setForceDialogOpen(false)
    setExistingRedirectInfo(null)
  }

  const canSubmit = leftEvent && rightEvent && keepEventId &&
    leftEventId !== rightEventId &&
    !createMergeMutation.isPending

  // Vérifier si l'événement à conserver a déjà un oldSlugId
  const keepEvent = keepEventId === leftEvent?.id ? leftEvent : rightEvent
  // Note: hasExistingRedirect est juste informatif, le backend vérifiera si l'oldSlugId
  // pointe vers un événement existant ou non
  const hasExistingRedirect = keepEvent?.oldSlugId !== null && keepEvent?.oldSlugId !== undefined

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/proposals')}
          variant="outlined"
          size="small"
        >
          Retour
        </Button>
        <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <MergeIcon />
          Fusion d'événements
        </Typography>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        Sélectionnez deux événements à fusionner. L'événement <strong>doublon</strong> sera marqué comme supprimé
        et son ID sera utilisé pour les redirections vers l'événement <strong>conservé</strong>.
      </Alert>

      {/* Sélection des événements */}
      <Grid container spacing={3}>
        {/* Colonne gauche */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Premier événement
            </Typography>

            <Autocomplete
              options={leftAutocomplete.events.filter(e => rightEventId ? parseInt(e.objectID, 10) !== rightEventId : true)}
              getOptionLabel={(option) => `${option.eventName || option.name} (${option.eventCity || option.city})`}
              loading={leftAutocomplete.loading}
              onInputChange={(_, value) => setLeftSearch(value)}
              onChange={handleLeftSelect}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Rechercher un événement..."
                  size="small"
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {leftAutocomplete.loading && <CircularProgress size={20} />}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
              renderOption={(props, option) => (
                <li {...props} key={option.objectID}>
                  <Box>
                    <Typography variant="body1">
                      {option.eventName || option.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {option.eventCity || option.city} - ID: {option.objectID}
                    </Typography>
                  </Box>
                </li>
              )}
              noOptionsText="Aucun résultat"
              sx={{ mb: 2 }}
            />

            {leftLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            )}

            {leftEvent && (
              <EventCard
                event={leftEvent}
                mergeStatus={keepEventId ? (keepEventId === leftEvent.id ? 'keep' : 'delete') : null}
              />
            )}
          </Paper>
        </Grid>

        {/* Colonne droite */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Deuxième événement
            </Typography>

            <Autocomplete
              options={rightAutocomplete.events.filter(e => leftEventId ? parseInt(e.objectID, 10) !== leftEventId : true)}
              getOptionLabel={(option) => `${option.eventName || option.name} (${option.eventCity || option.city})`}
              loading={rightAutocomplete.loading}
              onInputChange={(_, value) => setRightSearch(value)}
              onChange={handleRightSelect}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Rechercher un événement..."
                  size="small"
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {rightAutocomplete.loading && <CircularProgress size={20} />}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
              renderOption={(props, option) => (
                <li {...props} key={option.objectID}>
                  <Box>
                    <Typography variant="body1">
                      {option.eventName || option.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {option.eventCity || option.city} - ID: {option.objectID}
                    </Typography>
                  </Box>
                </li>
              )}
              noOptionsText="Aucun résultat"
              sx={{ mb: 2 }}
            />

            {rightLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            )}

            {rightEvent && (
              <EventCard
                event={rightEvent}
                mergeStatus={keepEventId ? (keepEventId === rightEvent.id ? 'keep' : 'delete') : null}
              />
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Erreur si même événement */}
      {leftEventId && rightEventId && leftEventId === rightEventId && (
        <Alert severity="error" sx={{ mt: 3 }}>
          Vous devez sélectionner deux événements différents.
        </Alert>
      )}

      {/* Section de configuration de la fusion */}
      {leftEvent && rightEvent && leftEventId !== rightEventId && (
        <Paper sx={{ p: 3, mt: 3 }}>
          <Typography variant="h6" gutterBottom>
            Configuration de la fusion
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Sélectionnez l'événement à <strong>conserver</strong>. L'autre sera marqué comme doublon.
          </Typography>

          <ToggleButtonGroup
            value={keepEventId}
            exclusive
            onChange={(_, value) => value && setKeepEventId(value)}
            sx={{ mb: 3, flexWrap: 'wrap', gap: 1 }}
          >
            <ToggleButton value={leftEvent.id} sx={{ px: 3, py: 1.5, flexDirection: 'column', alignItems: 'flex-start' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                <Typography variant="body2" fontWeight="bold">
                  Conserver le premier événement
                </Typography>
                {suggestedKeepEventId === leftEvent.id && (
                  <Chip size="small" label="Recommandé" color="success" />
                )}
              </Box>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {leftEvent.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                ID: {leftEvent.id} • {leftEvent.city} • {leftEvent.editions?.length || 0} édition(s)
              </Typography>
            </ToggleButton>
            <ToggleButton value={rightEvent.id} sx={{ px: 3, py: 1.5, flexDirection: 'column', alignItems: 'flex-start' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                <Typography variant="body2" fontWeight="bold">
                  Conserver le deuxième événement
                </Typography>
                {suggestedKeepEventId === rightEvent.id && (
                  <Chip size="small" label="Recommandé" color="success" />
                )}
              </Box>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {rightEvent.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                ID: {rightEvent.id} • {rightEvent.city} • {rightEvent.editions?.length || 0} édition(s)
              </Typography>
            </ToggleButton>
          </ToggleButtonGroup>

          {hasExistingRedirect && (
            <Alert severity="warning" sx={{ mb: 2 }} icon={<WarningIcon />}>
              <Typography variant="body2">
                L'événement sélectionné (<strong>{keepEvent?.name}</strong>) a déjà une redirection
                (oldSlugId: {keepEvent?.oldSlugId}).
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                Si cet oldSlugId ne correspond plus à un événement existant, l'écrasement sera automatique.
                Sinon, une confirmation vous sera demandée.
              </Typography>
            </Alert>
          )}

          <Divider sx={{ my: 2 }} />

          {/* Option copie des éditions manquantes */}
          <Box sx={{ mb: 3 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={copyMissingEditions}
                  onChange={(e) => setCopyMissingEditions(e.target.checked)}
                  color="primary"
                />
              }
              label={
                <Box>
                  <Typography variant="body1">
                    Copier les éditions manquantes
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Les éditions du doublon qui n'existent pas sur l'événement conservé seront copiées
                  </Typography>
                </Box>
              }
            />

            {copyMissingEditions && editionsToCopy.length > 0 && (
              <Alert
                severity="info"
                icon={<ContentCopyIcon />}
                sx={{ mt: 2 }}
              >
                <Typography variant="body2" fontWeight="bold" gutterBottom>
                  {editionsToCopy.length} édition(s) seront copiées :
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                  {editionsToCopy.map((edition) => (
                    <Chip
                      key={edition.id}
                      label={`${edition.year}${edition.startDate ? ` (${format(new Date(edition.startDate), 'dd/MM', { locale: fr })})` : ''}`}
                      size="small"
                      variant="outlined"
                      color="info"
                    />
                  ))}
                </Box>
              </Alert>
            )}

            {copyMissingEditions && editionsToCopy.length === 0 && keepEventId && (
              <Alert severity="success" sx={{ mt: 2 }}>
                Aucune édition à copier : toutes les années du doublon existent déjà sur l'événement conservé.
              </Alert>
            )}
          </Box>

          <Divider sx={{ my: 2 }} />

          <TextField
            fullWidth
            label="Nouveau nom (optionnel)"
            value={newEventName}
            onChange={(e) => setNewEventName(e.target.value)}
            placeholder={keepEvent?.name || ''}
            helperText="Laissez vide pour garder le nom de l'événement conservé"
            sx={{ mb: 3 }}
          />

          {/* Résumé de la fusion */}
          {keepEventId && (
            <Alert severity="warning" sx={{ mb: 3 }}>
              <Typography variant="body2">
                <strong>Résumé de la fusion :</strong>
              </Typography>
              <Typography variant="body2">
                • L'événement <strong>"{keepEventId === leftEvent.id ? rightEvent.name : leftEvent.name}"</strong> (ID: {keepEventId === leftEvent.id ? rightEvent.id : leftEvent.id}) sera marqué comme <strong>DELETED</strong>
              </Typography>
              <Typography variant="body2">
                • L'événement <strong>"{keepEvent?.name}"</strong> (ID: {keepEvent?.id}) recevra la redirection (oldSlugId)
              </Typography>
              {newEventName.trim() && (
                <Typography variant="body2">
                  • Le nom sera changé en <strong>"{newEventName.trim()}"</strong>
                </Typography>
              )}
              {copyMissingEditions && editionsToCopy.length > 0 && (
                <Typography variant="body2">
                  • <strong>{editionsToCopy.length} édition(s)</strong> seront copiées : {editionsToCopy.map(e => e.year).join(', ')}
                </Typography>
              )}
            </Alert>
          )}

          <Button
            variant="contained"
            color="primary"
            size="large"
            startIcon={createMergeMutation.isPending ? <CircularProgress size={20} color="inherit" /> : <MergeIcon />}
            onClick={() => handleSubmit(false)}
            disabled={!canSubmit}
          >
            {createMergeMutation.isPending ? 'Création en cours...' : 'Créer la proposition de fusion'}
          </Button>
        </Paper>
      )}

      {/* Dialog de confirmation pour forcer l'écrasement */}
      <Dialog
        open={forceDialogOpen}
        onClose={handleForceCancel}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon color="warning" />
          Redirection existante détectée
        </DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            <Typography variant="body1" paragraph>
              L'événement <strong>"{keepEvent?.name}"</strong> a déjà une redirection vers
              l'événement <strong>"{existingRedirectInfo?.eventName}"</strong> (ID: {existingRedirectInfo?.oldSlugId}).
            </Typography>
            <Alert severity="warning" sx={{ mb: 2 }}>
              Si vous continuez, cette redirection sera <strong>écrasée</strong> par la nouvelle
              (vers l'événement doublon ID: {keepEventId === leftEvent?.id ? rightEvent?.id : leftEvent?.id}).
            </Alert>
            <Typography variant="body2" color="text.secondary">
              L'ancienne redirection vers "{existingRedirectInfo?.eventName}" ne fonctionnera plus.
            </Typography>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleForceCancel} color="inherit">
            Annuler
          </Button>
          <Button
            onClick={handleForceConfirm}
            color="warning"
            variant="contained"
            disabled={createMergeMutation.isPending}
            startIcon={createMergeMutation.isPending ? <CircularProgress size={20} color="inherit" /> : <WarningIcon />}
          >
            {createMergeMutation.isPending ? 'Création...' : 'Forcer l\'écrasement'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// Composant pour afficher les détails d'un événement
const EventCard: React.FC<{
  event: EventData
  mergeStatus?: 'keep' | 'delete' | null
}> = ({ event, mergeStatus }) => {
  return (
    <Card
      variant="outlined"
      sx={{
        mt: 2,
        borderColor: mergeStatus === 'keep' ? 'success.main' : mergeStatus === 'delete' ? 'error.main' : undefined,
        borderWidth: mergeStatus ? 2 : 1,
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <EventIcon color="primary" />
          <Typography variant="h6">{event.name}</Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" gutterBottom>
          {event.city}, {event.country} • ID: {event.id}
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <Chip
            label={event.status}
            size="small"
            color={event.status === 'LIVE' ? 'success' : 'default'}
          />
          {event.oldSlugId && (
            <Chip
              label={`Redirigé depuis: ${event.oldSlugId}`}
              size="small"
              color="warning"
            />
          )}
        </Box>

        <Divider sx={{ my: 1 }} />

        <Typography variant="subtitle2" gutterBottom>
          {event.editions?.length || 0} édition(s)
        </Typography>

        {event.editions && event.editions.length > 0 && (
          <List dense disablePadding>
            {event.editions.slice(0, 5).map((edition) => (
              <ListItem key={edition.id} disablePadding sx={{ py: 0.5 }}>
                <ListItemText
                  primary={`${edition.year}`}
                  secondary={
                    edition.startDate
                      ? format(new Date(edition.startDate), 'dd MMM yyyy', { locale: fr })
                      : 'Date non définie'
                  }
                />
                <Chip
                  label={edition.calendarStatus}
                  size="small"
                  variant="outlined"
                  sx={{ ml: 1 }}
                />
              </ListItem>
            ))}
            {event.editions.length > 5 && (
              <ListItem disablePadding>
                <ListItemText
                  secondary={`+ ${event.editions.length - 5} autre(s) édition(s)`}
                />
              </ListItem>
            )}
          </List>
        )}

        {/* Indicateur de statut de fusion */}
        {mergeStatus && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              mt: 2,
              pt: 2,
              borderTop: 1,
              borderColor: 'divider'
            }}
          >
            {mergeStatus === 'keep' ? (
              <>
                <CheckCircleIcon color="success" />
                <Typography variant="body2" color="success.main" fontWeight="bold">
                  Sera conservé
                </Typography>
              </>
            ) : (
              <>
                <CancelIcon color="error" />
                <Typography variant="body2" color="error.main" fontWeight="bold">
                  Sera supprimé
                </Typography>
              </>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  )
}

export default EventMerge
