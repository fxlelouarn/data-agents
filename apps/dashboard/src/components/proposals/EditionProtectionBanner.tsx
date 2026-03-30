import React from 'react'
import { Alert, AlertTitle, Box, Chip, Stack } from '@mui/material'
import { Shield as ShieldIcon } from '@mui/icons-material'

interface EditionProtectionBannerProps {
  reasons: string[]
}

const REASON_LABELS: Record<string, (detail?: string) => string> = {
  isFeatured: () => 'Événement featured',
  customerType: (detail) => `Client ${detail || 'actif'}`,
  registrationOpen: () => 'Inscriptions ouvertes',
  hasAttendees: (detail) => `${detail || ''} inscrit(s) sur les courses`,
}

function formatReason(reason: string): string {
  const [key, detail] = reason.split(':')
  const formatter = REASON_LABELS[key]
  return formatter ? formatter(detail) : reason
}

export default function EditionProtectionBanner({ reasons }: EditionProtectionBannerProps) {
  if (reasons.length === 0) return null

  return (
    <Box sx={{ mb: 2 }}>
      <Alert
        severity="warning"
        icon={<ShieldIcon />}
        sx={(theme) => ({
          bgcolor: theme.palette.mode === 'dark'
            ? 'rgba(237, 108, 2, 0.12)'
            : 'rgb(255, 244, 229)',
        })}
      >
        <AlertTitle>Édition protégée</AlertTitle>
        Cette édition est protégée contre les modifications automatiques.
        Les changements validés manuellement seront appliqués malgré la protection.
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          {reasons.map((reason) => (
            <Chip
              key={reason}
              label={formatReason(reason)}
              size="small"
              color="warning"
              variant="outlined"
            />
          ))}
        </Stack>
      </Alert>
    </Box>
  )
}
