import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Box, CircularProgress } from '@mui/material'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRoles?: Array<'ADMIN' | 'VALIDATOR' | 'EXECUTOR'>
}

export default function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, hasRole } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh'
        }}
      >
        <CircularProgress />
      </Box>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Vérifier les rôles si requis
  if (requiredRoles && requiredRoles.length > 0) {
    if (!hasRole(...requiredRoles)) {
      return <Navigate to="/" replace />
    }
  }

  return <>{children}</>
}
