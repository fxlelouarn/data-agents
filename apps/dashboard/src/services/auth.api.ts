import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4001/api'

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: 'ADMIN' | 'VALIDATOR' | 'EXECUTOR'
  isActive: boolean
}

export interface LoginResponse {
  user: User
  token: string
}

export const authApi = {
  /**
   * Authentifie un utilisateur
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await axios.post(`${API_URL}/auth/login`, { email, password })
    return response.data.data
  },

  /**
   * Récupère les informations de l'utilisateur connecté
   */
  async me(token: string): Promise<User> {
    const response = await axios.get(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    return response.data.data
  },

  /**
   * Change le mot de passe de l'utilisateur connecté
   */
  async changePassword(token: string, oldPassword: string, newPassword: string): Promise<void> {
    await axios.put(
      `${API_URL}/auth/password`,
      { oldPassword, newPassword },
      { headers: { Authorization: `Bearer ${token}` } }
    )
  },

  /**
   * Liste tous les utilisateurs (ADMIN only)
   */
  async listUsers(token: string): Promise<User[]> {
    const response = await axios.get(`${API_URL}/auth/users`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    return response.data.data
  },

  /**
   * Crée un nouvel utilisateur (ADMIN only)
   */
  async createUser(
    token: string,
    data: {
      email: string
      password: string
      firstName: string
      lastName: string
      role: 'ADMIN' | 'VALIDATOR' | 'EXECUTOR'
    }
  ): Promise<User> {
    const response = await axios.post(`${API_URL}/auth/users`, data, {
      headers: { Authorization: `Bearer ${token}` }
    })
    return response.data.data
  },

  /**
   * Met à jour un utilisateur (ADMIN only)
   */
  async updateUser(
    token: string,
    userId: string,
    data: {
      firstName?: string
      lastName?: string
      role?: 'ADMIN' | 'VALIDATOR' | 'EXECUTOR'
      isActive?: boolean
    }
  ): Promise<User> {
    const response = await axios.put(`${API_URL}/auth/users/${userId}`, data, {
      headers: { Authorization: `Bearer ${token}` }
    })
    return response.data.data
  },

  /**
   * Réinitialise le mot de passe d'un utilisateur (ADMIN only)
   */
  async resetPassword(token: string, userId: string, newPassword: string): Promise<void> {
    await axios.post(
      `${API_URL}/auth/users/${userId}/reset-password`,
      { newPassword },
      { headers: { Authorization: `Bearer ${token}` } }
    )
  },

  /**
   * Supprime un utilisateur (ADMIN only)
   */
  async deleteUser(token: string, userId: string): Promise<void> {
    await axios.delete(`${API_URL}/auth/users/${userId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
  }
}
