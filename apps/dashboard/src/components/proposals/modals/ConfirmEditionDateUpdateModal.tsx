import React from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box
} from '@mui/material'
import { Warning as WarningIcon } from '@mui/icons-material'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface ConfirmEditionDateUpdateModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  dateType: 'startDate' | 'endDate'
  currentEditionDate: string
  newRaceDate: string
  raceName: string
}

/**
 * Modale demandant si l'utilisateur veut mettre à jour Edition.startDate ou endDate
 * lorsqu'une course proposée sort de la plage temporelle de l'édition
 */
const ConfirmEditionDateUpdateModal: React.FC<ConfirmEditionDateUpdateModalProps> = ({
  open,
  onClose,
  onConfirm,
  dateType,
  currentEditionDate,
  newRaceDate,
  raceName
}) => {
  const formatDate = (dateString: string): string => {
    if (!dateString) return 'Date non disponible'
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) return 'Date invalide'
      return format(date, 'EEEE dd/MM/yyyy HH:mm', { locale: fr })
    } catch (error) {
      return 'Date invalide'
    }
  }
  
  const formattedCurrentDate = formatDate(currentEditionDate)
  const formattedNewDate = formatDate(newRaceDate)
  
  const isStartDate = dateType === 'startDate'
  const title = isStartDate 
    ? "Mettre à jour la date de début de l'édition ?"
    : "Mettre à jour la date de fin de l'édition ?"
  
  const message = isStartDate
    ? `La course "${raceName}" commence AVANT la date de début actuelle de l'édition.`
    : `La course "${raceName}" se termine APRÈS la date de fin actuelle de l'édition.`

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WarningIcon color="warning" />
        {title}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body1" gutterBottom>
            {message}
          </Typography>
          
          <Box sx={{ my: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {isStartDate ? 'Date de début actuelle' : 'Date de fin actuelle'} de l'édition :
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
              {formattedCurrentDate}
            </Typography>
            
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Date de la course "{raceName}" :
            </Typography>
            <Typography variant="body1" color="primary" sx={{ fontWeight: 'medium' }}>
              {formattedNewDate}
            </Typography>
          </Box>

          <Typography variant="body1">
            Voulez-vous mettre à jour la {isStartDate ? 'date de début' : 'date de fin'} de l'édition avec cette nouvelle date ?
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Non, garder la date actuelle
        </Button>
        <Button onClick={onConfirm} variant="contained" color="primary">
          Oui, mettre à jour l'édition
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default ConfirmEditionDateUpdateModal
