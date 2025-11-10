import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { authApi, User } from '../services/auth.api'

interface AuthContextType {
  user: User | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  hasRole: (...roles: Array<'ADMIN' | 'VALIDATOR' | 'EXECUTOR'>) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const TOKEN_KEY = 'data-agents-token'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Charger le token au démarrage
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY)
    if (storedToken) {
      setToken(storedToken)
      // Vérifier la validité du token
      authApi.me(storedToken)
        .then(userData => {
          setUser(userData)
        })
        .catch(() => {
          // Token invalide
          localStorage.removeItem(TOKEN_KEY)
          setToken(null)
        })
        .finally(() => {
          setIsLoading(false)
        })
    } else {
      setIsLoading(false)
    }
  }, [])

  const login = async (email: string, password: string) => {
    const { user: userData, token: newToken } = await authApi.login(email, password)
    
    setUser(userData)
    setToken(newToken)
    localStorage.setItem(TOKEN_KEY, newToken)
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem(TOKEN_KEY)
  }

  const hasRole = (...roles: Array<'ADMIN' | 'VALIDATOR' | 'EXECUTOR'>): boolean => {
    if (!user) return false
    if (user.role === 'ADMIN') return true // Admin a tous les droits
    return roles.includes(user.role)
  }

  const value: AuthContextType = {
    user,
    token,
    isLoading,
    isAuthenticated: !!user && !!token,
    login,
    logout,
    hasRole
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
