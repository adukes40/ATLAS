/**
 * ATLAS Authentication Context
 * Provides auth state and functions to the application.
 */
import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
        setError(null)
      } else {
        setUser(null)
      }
    } catch (err) {
      console.error('Auth check failed:', err)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const login = () => {
    // Redirect to backend OAuth login endpoint
    window.location.href = '/auth/login'
  }

  const logout = async () => {
    try {
      // Clear local state first
      setUser(null)
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
    login,
    logout,
    checkAuth,
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
