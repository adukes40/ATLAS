/**
 * ATLAS Authentication Context
 * Provides auth state and functions for both local and Google OAuth authentication.
 */
import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const [oauthEnabled, setOauthEnabled] = useState(false)

  // Check auth status on mount
  useEffect(() => {
    checkAuth()

    // Check for auth error in URL (from failed OAuth callback)
    const params = new URLSearchParams(window.location.search)
    const authError = params.get('auth_error')
    if (authError) {
      setError(decodeURIComponent(authError))
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const checkAuth = async () => {
    try {
      const response = await fetch('/auth/me', {
        credentials: 'include'
      })
      const data = await response.json()

      if (data.authenticated) {
        setUser(data.user)
        setMustChangePassword(data.must_change_password || false)
        setError(null)
      } else {
        setUser(null)
        setMustChangePassword(false)
      }

      setOauthEnabled(data.oauth_enabled || false)
    } catch (err) {
      console.error('Auth check failed:', err)
      setUser(null)
      setMustChangePassword(false)
    } finally {
      setLoading(false)
    }
  }

  // Refresh auth state (used after password change)
  const refreshAuth = async () => {
    await checkAuth()
  }

  // Local username/password login
  const localLogin = async (username, password) => {
    setError(null)
    try {
      const response = await axios.post('/auth/local/login', {
        username,
        password,
      })

      if (response.data.success) {
        setUser(response.data.user)
        setMustChangePassword(response.data.must_change_password || false)
        return { success: true }
      }
    } catch (err) {
      const message = err.response?.data?.detail || 'Login failed'
      setError(message)
      return { success: false, error: message }
    }
  }

  // Google OAuth login - redirect to backend
  const googleLogin = () => {
    window.location.href = '/auth/login'
  }

  const logout = async () => {
    try {
      // Clear local state first
      setUser(null)
      setMustChangePassword(false)
      // Then redirect to logout endpoint
      window.location.href = '/auth/logout'
    } catch (err) {
      console.error('Logout failed:', err)
    }
  }

  const clearError = () => {
    setError(null)
  }

  const value = {
    user,
    loading,
    error,
    mustChangePassword,
    oauthEnabled,
    localLogin,
    googleLogin,
    login: googleLogin, // backward compatibility
    logout,
    checkAuth,
    refreshAuth,
    clearError,
    isAuthenticated: !!user
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
