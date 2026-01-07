import { useState, useEffect } from 'react'
import axios from 'axios'
import { Wifi, Save, TestTube, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

export default function MerakiSettings() {
  const [settings, setSettings] = useState({
    meraki_api_key: '',
    meraki_org_id: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Fetch current settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await axios.get('/api/settings')
        const data = res.data.settings || {}
        setSettings({
          meraki_api_key: '',
          meraki_org_id: data.meraki_org_id || '',
        })
        setHasApiKey(data.meraki_api_key?.configured || false)
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
      const toSave = {}
      if (settings.meraki_api_key) toSave.meraki_api_key = settings.meraki_api_key
      if (settings.meraki_org_id) toSave.meraki_org_id = settings.meraki_org_id

      await axios.post('/api/settings', { settings: toSave })
      setSuccess('Settings saved successfully')
      if (settings.meraki_api_key) {
        setHasApiKey(true)
        setSettings(prev => ({ ...prev, meraki_api_key: '' }))
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
      const res = await axios.post('/api/settings/test/meraki')
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
            <Wifi className="h-5 w-5 text-purple-500" />
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
              Meraki Settings
            </h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Configure Cisco Meraki Dashboard API for network location data.
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
        {/* API Key */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            API Key
            {hasApiKey && (
              <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">
                (configured)
              </span>
            )}
          </label>
          <input
            type="password"
            name="meraki_api_key"
            value={settings.meraki_api_key}
            onChange={handleChange}
            placeholder={hasApiKey ? "Enter new key to replace" : "Enter Meraki API key"}
            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Generate from Meraki Dashboard &gt; Organization &gt; API Keys
          </p>
        </div>

        {/* Organization ID */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Organization ID
          </label>
          <input
            type="text"
            name="meraki_org_id"
            value={settings.meraki_org_id}
            onChange={handleChange}
            placeholder="e.g., 668784544664519004"
            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Find in Meraki Dashboard URL or via API
          </p>
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
                  Found {testResult.sample_data.total_networks} networks
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
