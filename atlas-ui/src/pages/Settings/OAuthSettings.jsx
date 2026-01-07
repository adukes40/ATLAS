import { useState, useEffect } from 'react'
import axios from 'axios'
import { Key, Save, Loader2, CheckCircle, AlertCircle, ToggleLeft, ToggleRight } from 'lucide-react'

export default function OAuthSettings() {
  const [settings, setSettings] = useState({
    oauth_enabled: false,
    oauth_client_id: '',
    oauth_client_secret: '',
    oauth_allowed_domain: '',
    oauth_admin_group: '',
    oauth_user_group: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasSecret, setHasSecret] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Fetch current settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await axios.get('/api/settings')
        const data = res.data.settings || {}
        setSettings({
          oauth_enabled: data.oauth_enabled === 'true',
          oauth_client_id: data.oauth_client_id || '',
          oauth_client_secret: '',
          oauth_allowed_domain: data.oauth_allowed_domain || '',
          oauth_admin_group: data.oauth_admin_group || '',
          oauth_user_group: data.oauth_user_group || '',
        })
        setHasSecret(data.oauth_client_secret?.configured || false)
      } catch (err) {
        setError('Failed to load settings')
      } finally {
        setLoading(false)
      }
    }
    fetchSettings()
  }, [])

  // Handle input change
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
    setSuccess(null)
  }

  // Toggle OAuth
  const toggleOAuth = () => {
    setSettings(prev => ({ ...prev, oauth_enabled: !prev.oauth_enabled }))
    setSuccess(null)
  }

  // Save settings
  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const toSave = {
        oauth_enabled: settings.oauth_enabled ? 'true' : 'false',
      }
      if (settings.oauth_client_id) toSave.oauth_client_id = settings.oauth_client_id
      if (settings.oauth_client_secret) toSave.oauth_client_secret = settings.oauth_client_secret
      if (settings.oauth_allowed_domain) toSave.oauth_allowed_domain = settings.oauth_allowed_domain
      if (settings.oauth_admin_group) toSave.oauth_admin_group = settings.oauth_admin_group
      if (settings.oauth_user_group) toSave.oauth_user_group = settings.oauth_user_group

      await axios.post('/api/settings', { settings: toSave })
      setSuccess('Settings saved successfully')
      if (settings.oauth_client_secret) {
        setHasSecret(true)
        setSettings(prev => ({ ...prev, oauth_client_secret: '' }))
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Key className="h-5 w-5 text-amber-500" />
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
              OAuth / SSO Settings
            </h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Configure Google OAuth for single sign-on authentication.
          </p>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
          <CheckCircle className="h-5 w-5 flex-shrink-0" />
          {success}
        </div>
      )}

      {/* Enable/Disable Toggle */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-slate-800 dark:text-slate-100">
              Google OAuth
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {settings.oauth_enabled
                ? 'Users can sign in with Google. Local login is still available.'
                : 'Only local username/password login is available.'}
            </p>
          </div>
          <button
            onClick={toggleOAuth}
            className={`p-1 rounded-full transition-colors ${
              settings.oauth_enabled
                ? 'text-emerald-500 hover:text-emerald-600'
                : 'text-slate-400 hover:text-slate-500'
            }`}
          >
            {settings.oauth_enabled ? (
              <ToggleRight className="h-10 w-10" />
            ) : (
              <ToggleLeft className="h-10 w-10" />
            )}
          </button>
        </div>
      </div>

      {/* OAuth Settings Form */}
      <div className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-5 transition-opacity ${
        settings.oauth_enabled ? 'opacity-100' : 'opacity-50'
      }`}>
        <h3 className="font-medium text-slate-800 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700 pb-3">
          OAuth Configuration
        </h3>

        {/* Client ID */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Client ID
          </label>
          <input
            type="text"
            name="oauth_client_id"
            value={settings.oauth_client_id}
            onChange={handleChange}
            placeholder="xxx.apps.googleusercontent.com"
            disabled={!settings.oauth_enabled}
            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Client Secret */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Client Secret
            {hasSecret && (
              <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">
                (configured)
              </span>
            )}
          </label>
          <input
            type="password"
            name="oauth_client_secret"
            value={settings.oauth_client_secret}
            onChange={handleChange}
            placeholder={hasSecret ? "Enter new secret to replace" : "Enter client secret"}
            disabled={!settings.oauth_enabled}
            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            From Google Cloud Console &gt; APIs &gt; Credentials &gt; OAuth 2.0 Client
          </p>
        </div>

        {/* Allowed Domain */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Allowed Domain
          </label>
          <input
            type="text"
            name="oauth_allowed_domain"
            value={settings.oauth_allowed_domain}
            onChange={handleChange}
            placeholder="yourdomain.com"
            disabled={!settings.oauth_enabled}
            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Only emails from this domain can authenticate
          </p>
        </div>

        {/* Group Settings */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
          <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
            Role-Based Access (Google Groups)
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Users must be in one of these groups to access ATLAS. Admin group gets full access, User group gets read-only.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Admin Group
              </label>
              <input
                type="email"
                name="oauth_admin_group"
                value={settings.oauth_admin_group}
                onChange={handleChange}
                placeholder="atlas-admins@yourdomain.com"
                disabled={!settings.oauth_enabled}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                User Group (Read-Only)
              </label>
              <input
                type="email"
                name="oauth_user_group"
                value={settings.oauth_user_group}
                onChange={handleChange}
                placeholder="atlas-users@yourdomain.com"
                disabled={!settings.oauth_enabled}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}
