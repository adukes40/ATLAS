import { useState } from 'react'
import axios from 'axios'
import { Cloud, Save, TestTube, Loader2, CheckCircle, XCircle, AlertCircle, Upload } from 'lucide-react'
import SyncPanel from '../../components/SyncPanel'
import useServiceSettings from '../../hooks/useServiceSettings'

export default function GoogleSettings() {
  const [credentialsFile, setCredentialsFile] = useState(null)

  const {
    settings,
    loading,
    saving,
    testing,
    testResult,
    hasSecrets,
    error,
    success,
    handleChange,
    handleTest,
    setSettings
  } = useServiceSettings('google', {
    fields: {
      google_admin_email: ''
    },
    secretFields: ['google_credentials_json'],
    mapResponse: (data) => ({
      google_admin_email: data.google_admin_email || ''
    })
  })

  // Handle file selection (special handling for credentials JSON)
  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          JSON.parse(event.target.result)
          setCredentialsFile(event.target.result)
        } catch (err) {
          setCredentialsFile(null)
        }
      }
      reader.readAsText(file)
    }
  }

  // Custom save handler that includes credentials file
  const handleSave = async () => {
    const toSave = {}
    if (settings.google_admin_email) toSave.google_admin_email = settings.google_admin_email
    if (credentialsFile) toSave.google_credentials_json = credentialsFile

    try {
      await axios.post('/api/settings', { settings: toSave })
      if (credentialsFile) {
        setCredentialsFile(null)
      }
      window.location.reload() // Refresh to show updated status
    } catch (err) {
      console.error('Failed to save settings:', err)
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
            <Cloud className="h-5 w-5 text-emerald-500" />
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
              Google Admin Settings
            </h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Configure Google Admin SDK for ChromeOS device telemetry.
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
        {/* Service Account Credentials */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Service Account Credentials (JSON)
            {hasSecrets.google_credentials_json && (
              <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">
                (configured)
              </span>
            )}
          </label>
          <div className="flex items-center gap-3">
            <label className="flex-1 relative">
              <input
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className={`w-full px-4 py-3 rounded-lg border-2 border-dashed transition-colors cursor-pointer ${
                credentialsFile
                  ? 'border-emerald-400 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                  : 'border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500'
              }`}>
                <div className="flex items-center justify-center gap-2 text-slate-600 dark:text-slate-400">
                  {credentialsFile ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400">New credentials loaded</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-5 w-5" />
                      <span>{hasSecrets.google_credentials_json ? 'Upload new credentials to replace' : 'Upload credentials JSON file'}</span>
                    </>
                  )}
                </div>
              </div>
            </label>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Download from Google Cloud Console &gt; IAM &gt; Service Accounts &gt; Keys
          </p>
        </div>

        {/* Admin Email */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Admin Email (for delegation)
          </label>
          <input
            type="email"
            name="google_admin_email"
            value={settings.google_admin_email}
            onChange={handleChange}
            placeholder="admin@yourdomain.com"
            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Super admin email used for domain-wide delegation
          </p>
        </div>

        {/* Setup Instructions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
          <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Setup Requirements
          </h4>
          <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1 list-disc list-inside">
            <li>Service account with domain-wide delegation enabled</li>
            <li>Scope: <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">https://www.googleapis.com/auth/admin.directory.device.chromeos.readonly</code></li>
            <li>For group membership: <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">https://www.googleapis.com/auth/admin.directory.group.member.readonly</code></li>
          </ul>
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
                  Successfully queried ChromeOS devices
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sync Management */}
      <SyncPanel service="google" />
    </div>
  )
}
