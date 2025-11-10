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

interface ConfirmDatePropagationModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  newStartDate: string
  affectedRacesCount: number
}

/**
 * Modale demandant si l'utilisateur veut répercuter la nouvelle Edition.startDate
 * sur toutes les courses de l'édition
 */
const ConfirmDatePropagationModal: React.FC<ConfirmDatePropagationModalProps> = ({
  open,
  onClose,
  onConfirm,
  newStartDate,
  affectedRacesCount
}) => {
  const formattedDate = format(new Date(newStartDate), 'EEEE dd/MM/yyyy HH:mm', { locale: fr })

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WarningIcon color="warning" />
        Propager la date aux courses ?
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body1" gutterBottom>
            Vous avez modifié la date de début de l'édition vers :
          </Typography>
          <Typography variant="h6" color="primary" sx={{ my: 1 }}>
            {formattedDate}
          </Typography>
          <Typography variant="body1">
            Voulez-vous répercuter cette nouvelle date sur les <strong>{affectedRacesCount} course{affectedRacesCount > 1 ? 's' : ''}</strong> proposée{affectedRacesCount > 1 ? 's' : ''} ?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Si vous choisissez "Oui", toutes les dates de début des courses seront remplacées par cette nouvelle date.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Non, laisser les courses inchangées
        </Button>
        <Button onClick={onConfirm} variant="contained" color="primary">
          Oui, propager aux courses
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default ConfirmDatePropagationModal
