import React, { createContext, useContext, useState, useCallback } from 'react'
import { useSnackbar } from 'notistack'

export interface DatabaseConfig {
  id: string
  name: string
  type: 'POSTGRESQL' | 'MYSQL' | 'SQLITE' | 'MONGODB' | 'EXTERNAL_API' | 'MILES_REPUBLIC'
  host: string
  port: number
  database: string
  username: string
  password: string
  sslMode: string
  isDefault: boolean
  isActive: boolean
  description?: string
  connectionUrl?: string
  ssl?: boolean // Keep for backward compatibility
  connectionString?: string // Keep for backward compatibility
}

interface DatabaseContextType {
  databases: DatabaseConfig[]
  testResults: Record<string, 'success' | 'error' | 'testing'>
  addDatabase: (config: Omit<DatabaseConfig, 'id'>) => DatabaseConfig
  updateDatabase: (id: string, updates: Partial<DatabaseConfig>) => void
  deleteDatabase: (id: string) => boolean
  setAsDefault: (id: string) => void
  toggleActive: (id: string) => void
  testConnection: (database: DatabaseConfig) => Promise<boolean>
  getActiveDatabases: () => DatabaseConfig[]
  getDefaultDatabase: () => DatabaseConfig | undefined
  hasActiveDatabases: () => boolean
  validateDatabase: (config: Partial<DatabaseConfig>) => string | null
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined)

export const useDatabases = () => {
  const context = useContext(DatabaseContext)
  if (!context) {
    throw new Error('useDatabases must be used within a DatabaseProvider')
  }
  return context
}

interface DatabaseProviderProps {
  children: React.ReactNode
}

export const DatabaseProvider: React.FC<DatabaseProviderProps> = ({ children }) => {
  const { enqueueSnackbar } = useSnackbar()
  
  // État centralisé des bases de données (vide au démarrage)
  const [databases, setDatabases] = useState<DatabaseConfig[]>([])

  const [testResults, setTestResults] = useState<Record<string, 'success' | 'error' | 'testing'>>({})

  const addDatabase = useCallback((config: Omit<DatabaseConfig, 'id'>) => {
    const newDb: DatabaseConfig = {
      ...config,
      id: `db-${Date.now()}`
    }
    
    // Si c'est la première base ou si elle est marquée par défaut
    if (databases.length === 0 || config.isDefault) {
      // Retirer le statut par défaut des autres
      setDatabases(prev => prev.map(db => ({ ...db, isDefault: false })))
    }
    
    setDatabases(prev => [...prev, newDb])
    enqueueSnackbar(`Base de données "${config.name}" ajoutée`, { variant: 'success' })
    
    return newDb
  }, [databases.length, enqueueSnackbar])

  const updateDatabase = useCallback((id: string, updates: Partial<DatabaseConfig>) => {
    setDatabases(prev => prev.map(db => 
      db.id === id ? { ...db, ...updates } : db
    ))
  }, [])

  const deleteDatabase = useCallback((id: string) => {
    setDatabases(prev => {
      const newDatabases = prev.filter(db => db.id !== id)
      
      // Si on supprime la base par défaut et qu'il reste des bases, 
      // définir la première comme nouvelle base par défaut
      if (prev.find(db => db.id === id)?.isDefault && newDatabases.length > 0) {
        newDatabases[0].isDefault = true
      }
      
      return newDatabases
    })
    
    enqueueSnackbar('Base de données supprimée', { variant: 'info' })
    return true
  }, [enqueueSnackbar])

  const setAsDefault = useCallback((id: string) => {
    setDatabases(prev => prev.map(db => ({
      ...db,
      isDefault: db.id === id
    })))
    enqueueSnackbar('Base de données par défaut modifiée', { variant: 'info' })
  }, [enqueueSnackbar])

  const toggleActive = useCallback((id: string) => {
    setDatabases(prev => prev.map(db => ({
      ...db,
      isActive: db.id === id ? !db.isActive : db.isActive
    })))
  }, [])

  const testConnection = useCallback(async (database: DatabaseConfig) => {
    setTestResults(prev => ({ ...prev, [database.id]: 'testing' }))
    
    try {
      // TODO: Remplacer par un appel API réel
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Simulation de succès/échec
      const success = Math.random() > 0.3
      
      if (success) {
        setTestResults(prev => ({ ...prev, [database.id]: 'success' }))
        enqueueSnackbar(`Connexion réussie à ${database.name}`, { variant: 'success' })
      } else {
        setTestResults(prev => ({ ...prev, [database.id]: 'error' }))
        enqueueSnackbar(`Échec de connexion à ${database.name}`, { variant: 'error' })
      }
      
      return success
    } catch (error) {
      setTestResults(prev => ({ ...prev, [database.id]: 'error' }))
      enqueueSnackbar(`Erreur de connexion à ${database.name}`, { variant: 'error' })
      return false
    }
  }, [enqueueSnackbar])

  // Helpers
  const getActiveDatabases = useCallback(() => databases.filter(db => db.isActive), [databases])
  
  const getDefaultDatabase = useCallback(() => databases.find(db => db.isDefault && db.isActive), [databases])
  
  const hasActiveDatabases = useCallback(() => databases.some(db => db.isActive), [databases])

  // Validation de base
  const validateDatabase = useCallback((config: Partial<DatabaseConfig>): string | null => {
    if (!config.name?.trim()) return 'Le nom est requis'
    if (!config.type) return 'Le type est requis'
    
    if (!config.connectionUrl) {
      if (!config.host?.trim()) return 'L\'hôte est requis'
      if (!config.database?.trim()) return 'Le nom de base de données est requis'
      if (!config.username?.trim()) return 'Le nom d\'utilisateur est requis'
    }
    
    return null
  }, [])

  const contextValue: DatabaseContextType = {
    databases,
    testResults,
    addDatabase,
    updateDatabase,
    deleteDatabase,
    setAsDefault,
    toggleActive,
    testConnection,
    getActiveDatabases,
    getDefaultDatabase,
    hasActiveDatabases,
    validateDatabase
  }

  return (
    <DatabaseContext.Provider value={contextValue}>
      {children}
    </DatabaseContext.Provider>
  )
}