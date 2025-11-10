import React, { useState } from 'react'
import { useLocation, Link as RouterLink } from 'react-router-dom'
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Divider,
  Badge,
  useTheme,
  useMediaQuery,
  Tooltip,
  Avatar,
  Menu,
  MenuItem,
  Button,
} from '@mui/material'
import {
  Menu as MenuIcon,
  SmartToy as AgentIcon,
  Assignment as ProposalIcon,
  Update as UpdateIcon,
  MonitorHeart as HealthIcon,
  Settings as SettingsIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Person as PersonIcon,
  Logout as LogoutIcon,
  People as PeopleIcon,
} from '@mui/icons-material'
import { useProposals, useDatabases } from '@/hooks/useApi'
import { useAuth } from '@/context/AuthContext'

interface LayoutProps {
  children: React.ReactNode
}

const drawerWidth = 280
const collapsedWidth = 72

interface NavItem {
  text: string
  icon: React.ReactElement
  path: string
  badge?: number
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'))
  const location = useLocation()
  
  const { user, logout, hasRole } = useAuth()
  const { data: proposalsData } = useProposals({ status: 'PENDING' })
  const { data: databasesData } = useDatabases()
  const pendingProposals = proposalsData?.meta?.total || 0
  const activeDatabases = databasesData?.data?.filter(db => db.isActive) || []
  const hasActiveDatabases = activeDatabases.length > 0

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen)
  }
  
  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }
  
  const handleMenuClose = () => {
    setAnchorEl(null)
  }
  
  const handleLogout = () => {
    handleMenuClose()
    logout()
  }

  // Filtrer les items de navigation selon le rôle
  const allNavItems: NavItem[] = [
    { text: 'Propositions', icon: <ProposalIcon />, path: '/proposals', badge: pendingProposals },
    { text: 'Mises à jour', icon: <UpdateIcon />, path: '/updates' },
    { text: 'Agents', icon: <AgentIcon />, path: '/agents' },
    { text: 'Utilisateurs', icon: <PeopleIcon />, path: '/users' },
    { text: 'Administration', icon: <SettingsIcon />, path: '/settings' },
  ]
  
  const navItems = allNavItems.filter(item => {
    if (item.path === '/proposals') return hasRole('VALIDATOR', 'EXECUTOR', 'ADMIN')
    if (item.path === '/updates') return hasRole('EXECUTOR', 'ADMIN')
    if (item.path === '/agents') return hasRole('ADMIN')
    if (item.path === '/users') return hasRole('ADMIN')
    if (item.path === '/settings') return hasRole('ADMIN')
    return true
  })

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar sx={{ justifyContent: collapsed ? 'center' : 'space-between' }}>
        <Typography variant="h6" noWrap sx={{ fontWeight: 600, display: collapsed ? 'none' : 'block' }}>
          Data Agents
        </Typography>
        {!isMobile && (
          <IconButton size="small" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
        )}
      </Toolbar>
      <Divider />
      <List sx={{ flex: 1, px: collapsed ? 0 : 1 }}>
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path)
          const listButton = (
              <ListItemButton
                component={RouterLink}
                to={item.path}
                selected={isActive}
                sx={{
                  borderRadius: 2, 
                  mx: collapsed ? 0.5 : 1,
                  height: 48, // Hauteur fixe pour harmoniser
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  display: 'flex',
                  alignItems: 'center',
                  '&.Mui-selected': {
                    backgroundColor: theme.palette.primary.light + '20',
                    color: theme.palette.primary.main,
                  },
                  px: collapsed ? 1 : 2,
                }}
                onClick={isMobile ? handleDrawerToggle : undefined}
              >
                <ListItemIcon sx={{ 
                  color: isActive ? theme.palette.primary.main : 'inherit', 
                  minWidth: collapsed ? 0 : 40, 
                  justifyContent: 'center',
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  {item.badge ? <Badge badgeContent={item.badge} color="error">{item.icon}</Badge> : item.icon}
                </ListItemIcon>
                {!collapsed && (
                  <ListItemText 
                    primary={item.text} 
                    primaryTypographyProps={{ fontWeight: isActive ? 600 : 400 }}
                    sx={{ ml: 1 }}
                  />
                )}
              </ListItemButton>
          )
          return (
            <ListItem key={item.path} disablePadding sx={{ 
              mb: 0.5, 
              height: 48, // Même hauteur que le bouton
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {collapsed ? (
                <Tooltip title={item.text} placement="right" arrow>
                  {listButton}
                </Tooltip>
              ) : (
                listButton
              )}
            </ListItem>
          )
        })}
      </List>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <AppBar position="fixed" sx={{ width: { lg: `calc(100% - ${(collapsed ? collapsedWidth : drawerWidth)}px)` }, ml: { lg: `${collapsed ? collapsedWidth : drawerWidth}px` }, bgcolor: 'background.paper', color: 'text.primary', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <Toolbar>
          <IconButton color="inherit" onClick={handleDrawerToggle} sx={{ mr: 2, display: { lg: 'none' } }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
            {navItems.find(item => location.pathname === item.path || location.pathname.startsWith(item.path))?.text || 'Data Agents'}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <HealthIcon sx={{ 
                mr: 0.5, 
                fontSize: 16, 
                color: hasActiveDatabases ? theme.palette.success.main : theme.palette.warning.main 
              }} />
              <Typography variant="body2" color="text.secondary">
                {hasActiveDatabases 
                  ? `${activeDatabases.length} base${activeDatabases.length > 1 ? 's' : ''} connectée${activeDatabases.length > 1 ? 's' : ''}` 
                  : 'Aucune base de données connectée'
                }
              </Typography>
            </Box>
            
            {/* User menu */}
            <Button
              onClick={handleMenuOpen}
              startIcon={
                <Avatar sx={{ width: 28, height: 28, bgcolor: theme.palette.primary.main }}>
                  <PersonIcon sx={{ fontSize: 18 }} />
                </Avatar>
              }
              color="inherit"
              sx={{ textTransform: 'none' }}
            >
              {user?.firstName} {user?.lastName}
            </Button>
            
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleMenuClose}
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'right',
              }}
              transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
            >
              <MenuItem disabled>
                <Typography variant="body2" color="text.secondary">
                  {user?.email}
                </Typography>
              </MenuItem>
              <MenuItem disabled>
                <Typography variant="body2" color="text.secondary">
                  Rôle: {user?.role === 'ADMIN' ? 'Administrateur' : user?.role === 'VALIDATOR' ? 'Validateur' : 'Exécuteur'}
                </Typography>
              </MenuItem>
              <Divider />
              <MenuItem onClick={handleLogout}>
                <LogoutIcon sx={{ mr: 1 }} fontSize="small" />
                Déconnexion
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>
      <Box component="nav" sx={{ width: { lg: (collapsed ? collapsedWidth : drawerWidth) }, flexShrink: { lg: 0 } }}>
        <Drawer variant={isMobile ? 'temporary' : 'permanent'} open={isMobile ? mobileOpen : true} onClose={handleDrawerToggle} ModalProps={{ keepMounted: true }} sx={{ '& .MuiDrawer-paper': { boxSizing: 'border-box', width: (collapsed ? collapsedWidth : drawerWidth), borderRight: '1px solid', borderColor: 'divider' } }}>
          {drawer}
        </Drawer>
      </Box>
      <Box component="main" sx={{ flexGrow: 1, width: { lg: `calc(100% - ${(collapsed ? collapsedWidth : drawerWidth)}px)` }, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Toolbar />
        <Box sx={{ flex: 1, p: 3, bgcolor: 'background.default' }}>
          {children}
        </Box>
      </Box>
    </Box>
  )
}

export default Layout
