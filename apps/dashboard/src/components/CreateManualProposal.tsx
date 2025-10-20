import React from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent
} from '@mui/material'
import CreateEventForm from './CreateEventForm'
import EditEventForm from './EditEventForm'

interface CreateManualProposalProps {
  open: boolean
  onClose: () => void
  mode: 'NEW_EVENT' | 'EDIT_EVENT'
}

const CreateManualProposal: React.FC<CreateManualProposalProps> = ({ open, onClose, mode }) => {

  const getDialogTitle = () => {
    return mode === 'NEW_EVENT' 
      ? 'Création d\'un nouvel événement'
      : 'Édition d\'un événement existant'
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        {getDialogTitle()}
      </DialogTitle>
      
      <DialogContent sx={{ p: 0 }}>
        {mode === 'NEW_EVENT' ? (
          <CreateEventForm onClose={onClose} />
        ) : (
          <EditEventForm onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  )
}

export default CreateManualProposal