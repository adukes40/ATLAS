import { useState, useEffect } from 'react'
import axios from 'axios'
import { Database, Save, TestTube, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

export default function IIQSettings() {
  const [settings, setSettings] = useState({
    iiq_url: '',
    iiq_token: '',
    iiq_site_id: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [hasToken, setHasToken] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Fetch current settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await axios.get('/api/settings')
        const data = res.data.settings || {}
        setSettings({
          iiq_url: data.iiq_url || '',
          iiq_token: '', // Never expose token
          iiq_site_id: data.iiq_site_id || '',
        })
        setHasToken(data.iiq_token?.configured || false)
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
    const { name, value } = e.target
    setSettings(prev => ({ ...prev, [name]: value }))
    setSuccess(null)
    setTestResult(null)
  }

  // Save settings
  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      // Only send non-empty values
      const toSave = {}
      if (settings.iiq_url) toSave.iiq_url = settings.iiq_url
      if (settings.iiq_token) toSave.iiq_token = settings.iiq_token
      if (settings.iiq_site_id) toSave.iiq_site_id = settings.iiq_site_id

      await axios.post('/api/settings', { settings: toSave })
      setSuccess('Settings saved successfully')
      if (settings.iiq_token) {
        setHasToken(true)
        setSettings(prev => ({ ...prev, iiq_token: '' }))
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  // Test connection
  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)

    try {
      const res = await axios.post('/api/settings/test/iiq')
      setTestResult(res.data)
    } catch (err) {
      setTestResult({
        success: false,
        message: err.response?.data?.detail || 'Test failed'
      })
    } finally {
      setTesting(false)
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
            <Database className="h-5 w-5 text-blue-500" />
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
              Incident IQ Settings
            </h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Configure connection to your IIQ instance for asset and user data.
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

      {/* Settings Form */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-5">
        {/* IIQ URL */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            IIQ Instance URL
          </label>
          <input
            type="url"
            name="iiq_url"
            value={settings.iiq_url}
            onChange={handleChange}
            placeholder="https://yourdistrict.incidentiq.com"
            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Your IIQ instance URL without trailing slash
          </p>
        </div>

        {/* API Token */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            API Token
            {hasToken && (
              <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">
                (configured)
              </span>
            )}
          </label>
          <input
            type="password"
            name="iiq_token"
            value={settings.iiq_token}
            onChange={handleChange}
            placeholder={hasToken ? "Enter new token to replace" : "Enter API token"}
            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Generate from IIQ Admin &gt; Developer Tools &gt; API Keys
          </p>
        </div>

        {/* Site ID */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Site ID
          </label>
          <input
            type="text"
            name="iiq_site_id"
            value={settings.iiq_site_id}
            onChange={handleChange}
            placeholder="UUID from IIQ"
            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
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

          <button
            onClick={handleTest}
            disabled={testing}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <TestTube className="h-4 w-4" />
            )}
            Test Connection
          </button>
        </div>

        {/* Test Result */}
        {testResult && (
          <div className={`p-4 rounded-lg flex items-start gap-3 ${
            testResult.success
              ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'
              : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
          }`}>
            {testResult.success ? (
              <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <p className={testResult.success ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}>
                {testResult.message}
              </p>
              {testResult.sample_data && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
                  Found {testResult.sample_data.total_assets?.toLocaleString()} assets
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
