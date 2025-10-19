import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { CssBaseline, Box } from '@mui/material'
import { SnackbarProvider } from 'notistack'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { fr } from 'date-fns/locale'

import Layout from '@/components/Layout'
import AgentList from '@/pages/AgentList'
import AgentDetail from '@/pages/AgentDetail'
import AgentEdit from '@/pages/AgentEdit'
import AgentLogs from '@/pages/AgentLogs'
import ProposalList from '@/pages/ProposalList'
import ProposalDetail from '@/pages/ProposalDetail'
import GroupedProposalDetail from '@/pages/GroupedProposalDetail'
import RunList from '@/pages/RunList'
import RunDetail from '@/pages/RunDetail'
import Dashboard from '@/pages/Dashboard'
import Settings from '@/pages/Settings'
import TestDynamicForm from '@/pages/TestDynamicForm'

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
                <Layout>
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <Routes>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    
                    {/* Agents routes */}
                    <Route path="/agents" element={<AgentList />} />
                    <Route path="/agents/:id" element={<AgentDetail />} />
                    <Route path="/agents/:id/edit" element={<AgentEdit />} />
                    <Route path="/agents/:id/logs" element={<AgentLogs />} />
                    
                    {/* Proposals routes */}
                    <Route path="/proposals" element={<ProposalList />} />
                    <Route path="/proposals/group/:groupKey" element={<GroupedProposalDetail />} />
                    <Route path="/proposals/:id" element={<ProposalDetail />} />
                    
                    {/* Runs routes */}
                    <Route path="/runs" element={<RunList />} />
                    <Route path="/runs/:id" element={<RunDetail />} />
                    
                    {/* Settings route */}
                    <Route path="/settings" element={<Settings />} />
                    
                    {/* Test route */}
                    <Route path="/test-form" element={<TestDynamicForm />} />
                    
                    {/* Catch all - redirect to dashboard */}
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </Box>
              </Layout>
            </Router>
          </SnackbarProvider>
        </LocalizationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export default App