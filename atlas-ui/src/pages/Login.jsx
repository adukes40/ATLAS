/**
 * ATLAS Login Page
 * Supports both local authentication and Google OAuth.
 * When OAuth is enabled, shows Google button primarily with toggle for local login.
 * When OAuth is disabled, shows local login form only.
 */
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { LogIn, AlertCircle, Shield, User, Lock, Loader2 } from 'lucide-react'

export default function Login() {
  const { localLogin, googleLogin, error, clearError, loading, oauthEnabled } = useAuth()
  const [showLocalLogin, setShowLocalLogin] = useState(!oauthEnabled)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [localLoading, setLocalLoading] = useState(false)

  const handleLocalLogin = async (e) => {
    e.preventDefault()
    setLocalLoading(true)
    await localLogin(username, password)
    setLocalLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 dark:text-slate-400">Checking authentication...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
      {/* Logo/Title */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-slate-800 dark:text-slate-100 mb-2">
          ATLAS
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          Asset, Telemetry, Location, & Analytics System
        </p>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 p-8">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-800 dark:text-red-200 font-medium">
                  Login Failed
                </p>
                <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                  {error}
                </p>
              </div>
              <button
                onClick={clearError}
                className="text-red-500 hover:text-red-700 dark:hover:text-red-300"
              >
                &times;
              </button>
            </div>
          </div>
        )}

        {/* Sign In Section */}
        <div className="text-center mb-6">
          <Shield className="h-12 w-12 text-blue-600 dark:text-blue-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">
            Sign in to continue
          </h2>
        </div>

        {/* OAuth + Local Toggle or Just Local */}
        {oauthEnabled && !showLocalLogin ? (
          <>
            {/* Google Sign In Button */}
            <button
              onClick={googleLogin}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg shadow-sm hover:shadow-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-all font-medium text-slate-700 dark:text-slate-200"
            >
              {/* Google Logo SVG */}
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Sign in with Google
            </button>

            {/* Toggle to local login */}
            <button
              onClick={() => setShowLocalLogin(true)}
              className="mt-4 w-full text-center text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            >
              Use local account instead
            </button>
          </>
        ) : (
          <>
            {/* Local Login Form */}
            <form onSubmit={handleLocalLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Username
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoComplete="username"
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter username"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter password"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={localLoading}
                className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {localLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                Sign In
              </button>
            </form>

            {/* Toggle back to OAuth if enabled */}
            {oauthEnabled && (
              <button
                onClick={() => setShowLocalLogin(false)}
                className="mt-4 w-full text-center text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Sign in with Google instead
              </button>
            )}
          </>
        )}

        {/* Domain Notice */}
        <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
          Authorized users only
        </p>
      </div>

      {/* Footer */}
      <p className="mt-8 text-xs text-slate-400 dark:text-slate-600">
        ATLAS - IT Operations Platform
      </p>
    </div>
  )
}
