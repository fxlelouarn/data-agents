import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { CssBaseline, Box } from '@mui/material'
import { SnackbarProvider } from 'notistack'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { fr } from 'date-fns/locale'

import { AuthProvider } from '@/context/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import AgentList from '@/pages/AgentList'
import AgentCreate from '@/pages/AgentCreate'
import AgentDetail from '@/pages/AgentDetail'
import AgentEdit from '@/pages/AgentEdit'
import ProposalList from '@/pages/ProposalList'
import ProposalDetailDispatcher from '@/pages/proposals/ProposalDetailDispatcher'
import ProposalEditRedirect from '@/pages/proposals/ProposalEditRedirect'
import GroupedProposalDetailDispatcher from '@/pages/proposals/GroupedProposalDetailDispatcher'
import ManualProposalCreate from '@/pages/proposals/ManualProposalCreate'
import CreateProposalForExistingEvent from '@/pages/CreateProposalForExistingEvent'
import CreateProposalForEdition from '@/pages/CreateProposalForEdition'
import UpdateList from '@/pages/UpdateList'
import UpdateDetail from '@/pages/UpdateDetail'
import UpdateGroupDetail from '@/pages/UpdateGroupDetail'
import Settings from '@/pages/Settings'
import TestDynamicForm from '@/pages/TestDynamicForm'
import Users from '@/pages/Users'
import Statistics from '@/pages/Statistics'

// Create theme similar to Miles Republic style
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
      light: '#42a5f5',
      dark: '#1565c0',
    },
    secondary: {
      main: '#9c27b0',
      light: '#ba68c8',
      dark: '#7b1fa2',
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
    success: {
      main: '#2e7d32',
    },
    error: {
      main: '#d32f2f',
    },
    warning: {
      main: '#ed6c02',
    },
    info: {
      main: '#0288d1',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 600,
    },
    h5: {
      fontWeight: 600,
    },
    h6: {
      fontWeight: 500,
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          textTransform: 'none',
          fontWeight: 500,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
      },
    },
  },
})

// Create query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider theme={theme}>
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={fr}>
            <CssBaseline />
            <SnackbarProvider
              maxSnack={3}
              anchorOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
              autoHideDuration={6000}
            >
              <Router>
                <Routes>
                  {/* Route publique */}
                  <Route path="/login" element={<Login />} />
                  
                  {/* Routes protégées */}
                  <Route
                    path="/*"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <Routes>
                              <Route path="/" element={<Navigate to="/proposals" replace />} />
                              
                              {/* Proposals routes - VALIDATOR, EXECUTOR, ADMIN */}
                              <Route
                                path="/proposals"
                                element={
                                  <ProtectedRoute requiredRoles={['VALIDATOR', 'EXECUTOR', 'ADMIN']}>
                                    <ProposalList />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/proposals/create"
                                element={
                                  <ProtectedRoute requiredRoles={['VALIDATOR', 'EXECUTOR', 'ADMIN']}>
                                    <ManualProposalCreate />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/proposals/create-existing"
                                element={
                                  <ProtectedRoute requiredRoles={['VALIDATOR', 'EXECUTOR', 'ADMIN']}>
                                    <CreateProposalForExistingEvent />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/proposals/create-for-edition/:editionId"
                                element={
                                  <ProtectedRoute requiredRoles={['VALIDATOR', 'EXECUTOR', 'ADMIN']}>
                                    <CreateProposalForEdition />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/proposals/group/:groupKey"
                                element={
                                  <ProtectedRoute requiredRoles={['VALIDATOR', 'EXECUTOR', 'ADMIN']}>
                                    <GroupedProposalDetailDispatcher />
                                  </ProtectedRoute>
                                }
                              />
                              {/* ✅ PHASE 3: Route de redirection pour forcer l'édition via la vue groupée */}
                              <Route
                                path="/proposals/:proposalId/edit"
                                element={
                                  <ProtectedRoute requiredRoles={['VALIDATOR', 'EXECUTOR', 'ADMIN']}>
                                    <ProposalEditRedirect />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/proposals/:id"
                                element={
                                  <ProtectedRoute requiredRoles={['VALIDATOR', 'EXECUTOR', 'ADMIN']}>
                                    <ProposalDetailDispatcher />
                                  </ProtectedRoute>
                                }
                              />
                              
                              {/* Updates routes - EXECUTOR, ADMIN */}
                              <Route
                                path="/updates"
                                element={
                                  <ProtectedRoute requiredRoles={['EXECUTOR', 'ADMIN']}>
                                    <UpdateList />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/updates/group/:groupId"
                                element={
                                  <ProtectedRoute requiredRoles={['EXECUTOR', 'ADMIN']}>
                                    <UpdateGroupDetail />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/updates/:id"
                                element={
                                  <ProtectedRoute requiredRoles={['EXECUTOR', 'ADMIN']}>
                                    <UpdateDetail />
                                  </ProtectedRoute>
                                }
                              />
                              
                              {/* Agents routes - ADMIN only */}
                              <Route
                                path="/agents"
                                element={
                                  <ProtectedRoute requiredRoles={['ADMIN']}>
                                    <AgentList />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/agents/create"
                                element={
                                  <ProtectedRoute requiredRoles={['ADMIN']}>
                                    <AgentCreate />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/agents/:id"
                                element={
                                  <ProtectedRoute requiredRoles={['ADMIN']}>
                                    <AgentDetail />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/agents/:id/edit"
                                element={
                                  <ProtectedRoute requiredRoles={['ADMIN']}>
                                    <AgentEdit />
                                  </ProtectedRoute>
                                }
                              />
                              
                              {/* Settings route - ADMIN only */}
                              <Route
                                path="/settings"
                                element={
                                  <ProtectedRoute requiredRoles={['ADMIN']}>
                                    <Settings />
                                  </ProtectedRoute>
                                }
                              />
                              
                              {/* Users route - ADMIN only */}
                              <Route
                                path="/users"
                                element={
                                  <ProtectedRoute requiredRoles={['ADMIN']}>
                                    <Users />
                                  </ProtectedRoute>
                                }
                              />
                              
                              {/* Statistics route - accessible to all roles */}
                              <Route
                                path="/statistics"
                                element={
                                  <ProtectedRoute requiredRoles={['VALIDATOR', 'EXECUTOR', 'ADMIN']}>
                                    <Statistics />
                                  </ProtectedRoute>
                                }
                              />
                              
                              {/* Test route - ADMIN only */}
                              <Route
                                path="/test-form"
                                element={
                                  <ProtectedRoute requiredRoles={['ADMIN']}>
                                    <TestDynamicForm />
                                  </ProtectedRoute>
                                }
                              />
                              
                              {/* Catch all - redirect to proposals */}
                              <Route path="*" element={<Navigate to="/proposals" replace />} />
                            </Routes>
                          </Box>
                        </Layout>
                      </ProtectedRoute>
                    }
                  />
                </Routes>
              </Router>
            </SnackbarProvider>
          </LocalizationProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App