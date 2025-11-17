import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  TextField,
  IconButton,
  Divider
} from '@mui/material'
import { 
  ArrowBack as BackIcon,
  Add as AddIcon,
  Delete as DeleteIcon
} from '@mui/icons-material'
import { useSnackbar } from 'notistack'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { fr } from 'date-fns/locale'
import { proposalsApi } from '@/services/api'

/**
 * Page de création manuelle d'une proposition NEW_EVENT
 * Tous les champs sont vides et doivent être remplis par l'utilisateur
 */
const ManualProposalCreate: React.FC = () => {
  const navigate = useNavigate()
  const { enqueueSnackbar } = useSnackbar()
  
  // État local pour les modifications utilisateur
  const [userModifiedChanges, setUserModifiedChanges] = React.useState<Record<string, any>>({
    // Valeurs par défaut pour les champs obligatoires
    country: 'France',
    timeZone: 'Europe/Paris'
  })
  const [userModifiedRaceChanges, setUserModifiedRaceChanges] = React.useState<Record<string, any>>({})
  const [races, setRaces] = React.useState<any[]>([])
  const [sources, setSources] = React.useState<Array<{ url: string; description: string }>>([
    { url: '', description: '' }
  ])
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  
  const handleFieldModify = (field: string, value: any) => {
    setUserModifiedChanges(prev => ({
      ...prev,
      [field]: value
    }))
  }
  
  const handleRaceFieldModify = (raceId: string, field: string, value: any) => {
    setUserModifiedRaceChanges(prev => ({
      ...prev,
      [raceId]: {
        ...(prev[raceId] || {}),
        [field]: value
      }
    }))
  }
  
  const handleAddRace = () => {
    const newRaceId = `new-${races.length}`
    const newRace = {
      id: newRaceId,
      field: newRaceId,
      options: [{
        proposalId: 'manual',
        agentName: 'Création manuelle',
        proposedValue: {
          name: '',
          distance: null,
          elevationGain: null,
          startDate: null
        },
        confidence: 1,
        createdAt: new Date().toISOString()
      }],
      currentValue: null,
      selectedValue: undefined
    }
    setRaces(prev => [...prev, newRace])
  }
  
  const handleDeleteRace = (raceId: string) => {
    setRaces(prev => prev.filter(r => r.id !== raceId))
    setUserModifiedRaceChanges(prev => {
      const { [raceId]: _, ...rest } = prev
      return rest
    })
  }
  
  const handleAddSource = () => {
    setSources(prev => [...prev, { url: '', description: '' }])
  }
  
  const handleRemoveSource = (index: number) => {
    setSources(prev => prev.filter((_, i) => i !== index))
  }
  
  const handleSourceChange = (index: number, field: 'url' | 'description', value: string) => {
    setSources(prev => prev.map((source, i) => 
      i === index ? { ...source, [field]: value } : source
    ))
  }
  
  const validateForm = (): string[] => {
    const errors: string[] = []
    
    // Champs Event obligatoires
    if (!userModifiedChanges.name?.trim()) errors.push('Le nom de l\'événement est requis')
    if (!userModifiedChanges.city?.trim()) errors.push('La ville est requise')
    if (!userModifiedChanges.department?.trim()) errors.push('Le département est requis')
    if (!userModifiedChanges.country?.trim()) errors.push('Le pays est requis')
    
    // Champs Edition obligatoires
    if (!userModifiedChanges.year) errors.push('L\'année est requise')
    if (!userModifiedChanges.startDate) errors.push('La date de début est requise')
    if (!userModifiedChanges.timeZone?.trim()) errors.push('Le fuseau horaire est requis')
    
    // Au moins une course
    if (races.length === 0) errors.push('Au moins une course doit être ajoutée')
    
    // Vérifier que les courses ont un nom, une distance et une catégorie
    races.forEach((race, index) => {
      const raceData = userModifiedRaceChanges[race.id]
      if (!raceData?.name?.trim()) {
        errors.push(`La course ${index + 1} doit avoir un nom`)
      }
      if (!raceData?.distance) {
        errors.push(`La course ${index + 1} doit avoir une distance`)
      }
      if (!raceData?.categoryLevel1) {
        errors.push(`La course ${index + 1} doit avoir une catégorie principale`)
      }
    })
    
    // Au moins une source avec URL
    const validSources = sources.filter(s => s.url.trim())
    if (validSources.length === 0) {
      errors.push('Au moins une source avec URL est requise')
    }
    
    return errors
  }
  
  const handleSaveAndValidate = async () => {
    const errors = validateForm()
    
    if (errors.length > 0) {
      errors.forEach(error => enqueueSnackbar(error, { variant: 'error' }))
      return
    }
    
    setIsSubmitting(true)
    
    try {
      // Construire le payload pour la proposition
      const payload = {
        type: 'NEW_EVENT' as const,
        changes: userModifiedChanges,
        userModifiedChanges,
        userModifiedRaceChanges,
        races: races.map(race => ({
          id: race.id,
          ...userModifiedRaceChanges[race.id]
        })),
        justification: [
          {
            type: 'manual_creation',
            message: 'Proposition créée manuellement',
            metadata: {
              sources: sources.filter(s => s.url.trim()),
              createdAt: new Date().toISOString()
            }
          }
        ],
        autoValidate: true // Valider automatiquement
      }
      
      // Appeler l'API pour créer et valider la proposition
      const response = await proposalsApi.createComplete(payload)
      
      enqueueSnackbar(
        response.message || 'Proposition créée et validée avec succès', 
        { variant: 'success' }
      )
      navigate('/proposals')
      
    } catch (error: any) {
      console.error('Erreur lors de la création:', error)
      const errorMessage = error.response?.data?.error || error.message || 'Erreur lors de la création de la proposition'
      enqueueSnackbar(errorMessage, { variant: 'error' })
    } finally {
      setIsSubmitting(false)
    }
  }
  
  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <Button
          startIcon={<BackIcon />}
          onClick={() => navigate('/proposals')}
          variant="outlined"
        >
          Retour
        </Button>
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          Créer une nouvelle proposition
        </Typography>
      </Box>
      
      {/* Info Alert */}
      <Alert severity="info" sx={{ mb: 3 }}>
        Remplissez tous les champs nécessaires pour créer manuellement une proposition NEW_EVENT.
        La proposition sera automatiquement validée et prête pour application.
      </Alert>
      
      {/* Content */}
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={fr}>
        <Box sx={{ display: 'flex', gap: 3 }}>
          {/* Main Content */}
          <Box sx={{ flex: 1 }}>
            {/* Informations de l'événement */}
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Informations de l'événement
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <TextField
                    fullWidth
                    label="Nom de l'événement"
                    value={userModifiedChanges.name || ''}
                    onChange={(e) => handleFieldModify('name', e.target.value)}
                    required
                  />
                  <TextField
                    fullWidth
                    label="Ville"
                    value={userModifiedChanges.city || ''}
                    onChange={(e) => handleFieldModify('city', e.target.value)}
                    required
                  />
                  <TextField
                    fullWidth
                    label="Département"
                    value={userModifiedChanges.department || ''}
                    onChange={(e) => handleFieldModify('department', e.target.value)}
                    required
                    placeholder="Ex: 39, 25, 74"
                  />
                  <TextField
                    fullWidth
                    label="Région"
                    value={userModifiedChanges.countrySubdivision || ''}
                    onChange={(e) => handleFieldModify('countrySubdivision', e.target.value)}
                    placeholder="Ex: Bourgogne-Franche-Comté"
                  />
                  <TextField
                    fullWidth
                    label="Pays"
                    value={userModifiedChanges.country || ''}
                    onChange={(e) => handleFieldModify('country', e.target.value)}
                    required
                  />
                  <TextField
                    fullWidth
                    label="Adresse complète"
                    value={userModifiedChanges.fullAddress || ''}
                    onChange={(e) => handleFieldModify('fullAddress', e.target.value)}
                    placeholder="Ex: Place de la Mairie, 39000 Lons-le-Saunier"
                  />
                  <TextField
                    fullWidth
                    label="Site web"
                    value={userModifiedChanges.websiteUrl || ''}
                    onChange={(e) => handleFieldModify('websiteUrl', e.target.value)}
                    placeholder="https://..."
                  />
                  <TextField
                    fullWidth
                    label="Facebook"
                    value={userModifiedChanges.facebookUrl || ''}
                    onChange={(e) => handleFieldModify('facebookUrl', e.target.value)}
                    placeholder="https://facebook.com/..."
                  />
                  <TextField
                    fullWidth
                    label="Instagram"
                    value={userModifiedChanges.instagramUrl || ''}
                    onChange={(e) => handleFieldModify('instagramUrl', e.target.value)}
                    placeholder="https://instagram.com/..."
                    sx={{ gridColumn: 'span 2' }}
                  />
                </Box>
              </CardContent>
            </Card>
            
            {/* Informations de l'édition */}
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Informations de l'édition
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <TextField
                    fullWidth
                    label="Année"
                    type="number"
                    value={userModifiedChanges.year || ''}
                    onChange={(e) => handleFieldModify('year', parseInt(e.target.value))}
                    required
                    placeholder="2025"
                  />
                  <TextField
                    fullWidth
                    label="Fuseau horaire"
                    value={userModifiedChanges.timeZone || ''}
                    onChange={(e) => handleFieldModify('timeZone', e.target.value)}
                    required
                    placeholder="Europe/Paris"
                  />
                  <DateTimePicker
                    label="Date de début"
                    value={userModifiedChanges.startDate ? new Date(userModifiedChanges.startDate) : null}
                    onChange={(date) => handleFieldModify('startDate', date?.toISOString())}
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        required: true
                      }
                    }}
                  />
                  <DateTimePicker
                    label="Date de fin"
                    value={userModifiedChanges.endDate ? new Date(userModifiedChanges.endDate) : null}
                    onChange={(date) => handleFieldModify('endDate', date?.toISOString())}
                    slotProps={{
                      textField: {
                        fullWidth: true
                      }
                    }}
                  />
                  <TextField
                    fullWidth
                    label="Statut"
                    select
                    value={userModifiedChanges.calendarStatus || ''}
                    onChange={(e) => handleFieldModify('calendarStatus', e.target.value)}
                    SelectProps={{ native: true }}
                    InputLabelProps={{ shrink: true }}
                  >
                    <option value=""></option>
                    <option value="SCHEDULED">Programmé</option>
                    <option value="CANCELLED">Annulé</option>
                    <option value="POSTPONED">Reporté</option>
                  </TextField>
                  <TextField
                    fullWidth
                    label="Organisateur"
                    value={userModifiedChanges.organizer || ''}
                    onChange={(e) => handleFieldModify('organizer', e.target.value)}
                    placeholder="Nom de l'organisateur"
                  />
                  <DateTimePicker
                    label="Ouverture des inscriptions"
                    value={userModifiedChanges.registrationOpeningDate ? new Date(userModifiedChanges.registrationOpeningDate) : null}
                    onChange={(date) => handleFieldModify('registrationOpeningDate', date?.toISOString())}
                    slotProps={{
                      textField: {
                        fullWidth: true
                      }
                    }}
                  />
                  <DateTimePicker
                    label="Clôture des inscriptions"
                    value={userModifiedChanges.registrationClosingDate ? new Date(userModifiedChanges.registrationClosingDate) : null}
                    onChange={(date) => handleFieldModify('registrationClosingDate', date?.toISOString())}
                    slotProps={{
                      textField: {
                        fullWidth: true
                      }
                    }}
                  />
                </Box>
              </CardContent>
            </Card>
            
            {/* Courses */}
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">Courses</Typography>
                  <Button
                    variant="contained"
                    onClick={handleAddRace}
                    size="small"
                    startIcon={<AddIcon />}
                  >
                    Ajouter une course
                  </Button>
                </Box>
                
                {races.length === 0 ? (
                  <Alert severity="warning">
                    Aucune course ajoutée. Cliquez sur "Ajouter une course" pour commencer.
                  </Alert>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {races.map((race, index) => {
                      const raceData = userModifiedRaceChanges[race.id] || {}
                      return (
                        <Card key={race.id} variant="outlined">
                          <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                              <Typography variant="subtitle1" fontWeight="bold">
                                Course {index + 1}
                              </Typography>
                              <IconButton
                                color="error"
                                onClick={() => handleDeleteRace(race.id)}
                                size="small"
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Box>
                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                              <TextField
                                fullWidth
                                label="Catégorie principale"
                                select
                                value={raceData.categoryLevel1 || ''}
                                onChange={(e) => handleRaceFieldModify(race.id, 'categoryLevel1', e.target.value)}
                                required
                                SelectProps={{ native: true }}
                                InputLabelProps={{ shrink: true }}
                              >
                                <option value="">Sélectionnez...</option>
                                <option value="RUNNING">Course à pied</option>
                                <option value="TRAIL">Trail</option>
                                <option value="WALK">Marche</option>
                                <option value="CYCLING">Cyclisme</option>
                                <option value="TRIATHLON">Triathlon</option>
                                <option value="FUN">Fun / Obstacle</option>
                                <option value="OTHER">Autre</option>
                              </TextField>
                              <TextField
                                fullWidth
                                label="Sous-catégorie (optionnel)"
                                select
                                value={raceData.categoryLevel2 || ''}
                                onChange={(e) => handleRaceFieldModify(race.id, 'categoryLevel2', e.target.value)}
                                SelectProps={{ native: true }}
                                InputLabelProps={{ shrink: true }}
                                disabled={!raceData.categoryLevel1}
                              >
                                <option value=""></option>
                                {raceData.categoryLevel1 === 'RUNNING' && (
                                  <>
                                    <option value="MARATHON">Marathon</option>
                                    <option value="HALF_MARATHON">Semi-marathon</option>
                                    <option value="KM10">10 km</option>
                                    <option value="KM5">5 km</option>
                                    <option value="LESS_THAN_5_KM">Moins de 5 km</option>
                                    <option value="ULTRA_RUNNING">Ultra</option>
                                    <option value="CROSS">Cross</option>
                                    <option value="VERTICAL_KILOMETER">Kilomètre vertical</option>
                                  </>
                                )}
                                {raceData.categoryLevel1 === 'TRAIL' && (
                                  <>
                                    <option value="ULTRA_TRAIL">Ultra trail</option>
                                    <option value="LONG_TRAIL">Trail long</option>
                                    <option value="SHORT_TRAIL">Trail court</option>
                                    <option value="DISCOVERY_TRAIL">Trail découverte</option>
                                    <option value="VERTICAL_KILOMETER">Kilomètre vertical</option>
                                  </>
                                )}
                                {raceData.categoryLevel1 === 'WALK' && (
                                  <>
                                    <option value="NORDIC_WALK">Marche nordique</option>
                                    <option value="HIKING">Randonnée</option>
                                  </>
                                )}
                                {raceData.categoryLevel1 === 'CYCLING' && (
                                  <>
                                    <option value="XC_MOUNTAIN_BIKE">VTT XC</option>
                                    <option value="ENDURO_MOUNTAIN_BIKE">VTT Enduro</option>
                                    <option value="GRAVEL_RACE">Gravel</option>
                                    <option value="ROAD_CYCLING_TOUR">Route</option>
                                    <option value="TIME_TRIAL">Contre-la-montre</option>
                                  </>
                                )}
                              </TextField>
                              <TextField
                                fullWidth
                                label="Nom de la course"
                                value={raceData.name || ''}
                                onChange={(e) => handleRaceFieldModify(race.id, 'name', e.target.value)}
                                required
                                placeholder="Ex: Trail 10km"
                              />
                              <TextField
                                fullWidth
                                label="Distance (km)"
                                type="number"
                                value={raceData.distance || ''}
                                onChange={(e) => handleRaceFieldModify(race.id, 'distance', parseFloat(e.target.value))}
                                required
                                placeholder="10"
                              />
                              <TextField
                                fullWidth
                                label="Dénivelé positif (m)"
                                type="number"
                                value={raceData.elevationGain || ''}
                                onChange={(e) => handleRaceFieldModify(race.id, 'elevationGain', parseInt(e.target.value))}
                                placeholder="200"
                              />
                              <DateTimePicker
                                label="Heure de départ"
                                value={raceData.startDate ? new Date(raceData.startDate) : null}
                                onChange={(date) => handleRaceFieldModify(race.id, 'startDate', date?.toISOString())}
                                slotProps={{
                                  textField: {
                                    fullWidth: true
                                  }
                                }}
                              />
                            </Box>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </Box>
                )}
              </CardContent>
            </Card>
          
          {/* Sources */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Sources</Typography>
                <Button
                  variant="outlined"
                  onClick={handleAddSource}
                  size="small"
                  startIcon={<AddIcon />}
                >
                  Ajouter une source
                </Button>
              </Box>
              
              <Alert severity="info" sx={{ mb: 2 }}>
                Ajoutez au moins une source (URL du site de l'événement, page FFA, etc.) pour documenter cette proposition.
              </Alert>
              
              {sources.map((source, index) => (
                <Box key={index} sx={{ mb: 2 }}>
                  {index > 0 && <Divider sx={{ my: 2 }} />}
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                    <Box sx={{ flex: 1 }}>
                      <TextField
                        fullWidth
                        label="URL"
                        value={source.url}
                        onChange={(e) => handleSourceChange(index, 'url', e.target.value)}
                        placeholder="https://..."
                        size="small"
                        sx={{ mb: 1 }}
                        required={index === 0}
                      />
                      <TextField
                        fullWidth
                        label="Description (optionnel)"
                        value={source.description}
                        onChange={(e) => handleSourceChange(index, 'description', e.target.value)}
                        placeholder="Site officiel, page FFA, etc."
                        size="small"
                      />
                    </Box>
                    {sources.length > 1 && (
                      <IconButton
                        color="error"
                        onClick={() => handleRemoveSource(index)}
                        size="small"
                      >
                        <DeleteIcon />
                      </IconButton>
                    )}
                  </Box>
                </Box>
              ))}
            </CardContent>
          </Card>
        </Box>
        
        {/* Sidebar */}
        <Box sx={{ width: 350 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Actions
              </Typography>
              
              <Button
                variant="contained"
                color="success"
                fullWidth
                onClick={handleSaveAndValidate}
                disabled={isSubmitting}
                sx={{ mb: 2 }}
              >
                {isSubmitting ? 'Enregistrement...' : 'Enregistrer et valider'}
              </Button>
              
              <Button
                variant="outlined"
                fullWidth
                onClick={() => navigate('/proposals')}
              >
                Annuler
              </Button>
              
              <Alert severity="info" sx={{ mt: 3 }}>
                <Typography variant="caption" component="div">
                  <strong>Champs obligatoires :</strong>
                </Typography>
                <Typography variant="caption" component="ul" sx={{ mt: 1, pl: 2 }}>
                  <li>Événement : nom, ville, département</li>
                  <li>Édition : année, date de début</li>
                  <li>Au moins une course avec :
                    <ul style={{ paddingLeft: '16px' }}>
                      <li>Nom</li>
                      <li>Distance (km)</li>
                      <li>Catégorie principale</li>
                    </ul>
                  </li>
                  <li>Au moins une source avec URL</li>
                </Typography>
              </Alert>
            </CardContent>
          </Card>
        </Box>
        </Box>
      </LocalizationProvider>
    </Box>
  )
}
export default ManualProposalCreate
