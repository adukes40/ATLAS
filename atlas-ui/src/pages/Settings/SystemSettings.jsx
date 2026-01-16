import { useState, useEffect } from 'react'
import { Server, RefreshCw, Download, CheckCircle, XCircle, Clock, Loader2, AlertTriangle } from 'lucide-react'
import axios from 'axios'

// Helper to format relative time
const formatRelativeTime = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

// Helper to format date with user's timezone
const formatDateTime = (dateStr) => {
  if (!dateStr) return '-'
  const tz = localStorage.getItem('atlas_timezone') || 'America/New_York'
  const format = localStorage.getItem('atlas_time_format') || '12'
  const date = new Date(dateStr)
  return date.toLocaleString('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: format === '12'
  })
}

export default function SystemSettings() {
  const [version, setVersion] = useState(null)
  const [updateInfo, setUpdateInfo] = useState(null)
  const [updateLogs, setUpdateLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [updateOutput, setUpdateOutput] = useState(null)
  const [error, setError] = useState(null)

  // Fetch version and update info on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [versionRes, updateRes, logsRes] = await Promise.all([
          axios.get('/api/system/version'),
          axios.get('/api/system/updates/check'),
          axios.get('/api/system/updates/log')
        ])
        setVersion(versionRes.data)
        setUpdateInfo(updateRes.data)
        setUpdateLogs(logsRes.data)
      } catch (err) {
        console.error('Failed to fetch system info:', err)
        setError('Failed to load system information')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // Manual check for updates (bypasses cache)
  const handleCheckUpdates = async () => {
    setChecking(true)
    try {
      const res = await axios.get('/api/system/updates/check?force=true')
      setUpdateInfo(res.data)
      setError(null)
    } catch (err) {
      console.error('Failed to check for updates:', err)
      setError('Failed to check for updates')
    } finally {
      setChecking(false)
    }
  }

  // Apply update
  const handleApplyUpdate = async () => {
    if (!window.confirm('Are you sure you want to apply the update? The system will restart after updating.')) {
      return
    }

    setUpdating(true)
    setUpdateOutput(null)

    try {
      const res = await axios.post('/api/system/updates/apply')

      // Backend returns immediately with status "started"
      if (res.data.status === 'started') {
        setUpdateOutput({
          status: 'updating',
          message: res.data.message || 'Update started. Waiting for service to restart...'
        })

        // Poll for service to come back up
        const pollForService = async (attempts = 0) => {
          const maxAttempts = 60 // 2 minutes max
          const pollInterval = 2000 // 2 seconds

          if (attempts >= maxAttempts) {
            setUpdateOutput({
              status: 'failed',
              output: 'Timed out waiting for service to restart. Please check the server manually.'
            })
            setUpdating(false)
            return
          }

          try {
            const [versionRes, updateRes, logsRes] = await Promise.all([
              axios.get('/api/system/version'),
              axios.get('/api/system/updates/check?force=true'),
              axios.get('/api/system/updates/log')
            ])

            // Service is back up - check if version changed
            const newVersion = versionRes.data?.version
            const oldVersion = version?.version

            setVersion(versionRes.data)
            setUpdateInfo(updateRes.data)
            setUpdateLogs(logsRes.data)

            if (newVersion !== oldVersion) {
              setUpdateOutput({
                status: 'success',
                from_version: oldVersion,
                to_version: newVersion,
                output: 'Update completed successfully!'
              })
            } else {
              setUpdateOutput({
                status: 'success',
                message: 'Service restarted. Check update history for details.'
              })
            }
            setUpdating(false)
          } catch (e) {
            // Service still down, keep polling
            setTimeout(() => pollForService(attempts + 1), pollInterval)
          }
        }

        // Start polling after a brief delay for service to stop
        setTimeout(() => pollForService(0), 3000)
      }
    } catch (err) {
      console.error('Failed to apply update:', err)
      setUpdateOutput({
        status: 'failed',
        output: err.response?.data?.detail || err.message
      })
      setUpdating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <Server className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            System
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Version info and updates
          </p>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Current Version */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <h3 className="font-medium text-slate-800 dark:text-slate-100 mb-4">
          Current Version
        </h3>
        <div className="px-4 py-2 bg-slate-100 dark:bg-slate-900 rounded-lg inline-block">
          <span className="text-2xl font-mono font-bold text-slate-800 dark:text-slate-100">
            {version?.version || 'Unknown'}
          </span>
        </div>
      </div>

      {/* Update Status */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-slate-800 dark:text-slate-100">
            Update Status
          </h3>
          <button
            onClick={handleCheckUpdates}
            disabled={checking}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
            Check for Updates
          </button>
        </div>

        {/* Error from update check */}
        {updateInfo?.error ? (
          <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-red-800 dark:text-red-200">
                  Update Check Failed
                </h4>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                  {updateInfo.error}
                </p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                  Try running the update manually: <code className="bg-red-100 dark:bg-red-900/50 px-1 rounded">sudo /opt/atlas/update.sh</code>
                </p>
              </div>
            </div>
          </div>
        ) : updateInfo?.update_available ? (
          <div className="space-y-4">
            {/* Update Available Banner */}
            <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="flex items-start gap-3">
                <Download className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-amber-800 dark:text-amber-200">
                    Update Available
                  </h4>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    {updateInfo.changelog?.length || 0} new commit{updateInfo.changelog?.length !== 1 ? 's' : ''} on main branch
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Current: <span className="font-mono">{updateInfo.current_commit}</span> → Latest: <span className="font-mono">{updateInfo.latest_commit}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Changelog */}
            {updateInfo.changelog?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                  What's New
                </h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {updateInfo.changelog.map((commit, idx) => (
                    <div
                      key={commit.sha}
                      className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg"
                    >
                      <span className="font-mono text-xs text-slate-400 bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                        {commit.sha}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-800 dark:text-slate-200 truncate">
                          {commit.message}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {commit.author} • {formatRelativeTime(commit.date)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Update Button */}
            <div className="pt-2">
              <button
                onClick={handleApplyUpdate}
                disabled={updating}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Update Now
                  </>
                )}
              </button>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                The system will restart after updating. This may take a few minutes.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
            <CheckCircle className="h-5 w-5 text-emerald-500" />
            <div>
              <p className="font-medium text-emerald-800 dark:text-emerald-200">
                You're up to date
              </p>
              {updateInfo?.checked_at && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                  Last checked: {formatRelativeTime(updateInfo.checked_at)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Update Output (if just updated) */}
        {updateOutput && (
          <div className={`mt-4 p-4 rounded-lg border ${
            updateOutput.status === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
              : updateOutput.status === 'updating'
              ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800'
              : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {updateOutput.status === 'success' ? (
                <CheckCircle className="h-4 w-4 text-emerald-500" />
              ) : updateOutput.status === 'updating' ? (
                <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span className={`font-medium ${
                updateOutput.status === 'success'
                  ? 'text-emerald-800 dark:text-emerald-200'
                  : updateOutput.status === 'updating'
                  ? 'text-blue-800 dark:text-blue-200'
                  : 'text-red-800 dark:text-red-200'
              }`}>
                {updateOutput.status === 'success' ? 'Update Successful' :
                 updateOutput.status === 'updating' ? 'Updating...' : 'Update Failed'}
              </span>
            </div>
            {updateOutput.message && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                {updateOutput.message}
              </p>
            )}
            {updateOutput.from_version && updateOutput.to_version && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                {updateOutput.from_version} → {updateOutput.to_version}
              </p>
            )}
            {updateOutput.output && (
              <details className="mt-2">
                <summary className="text-sm text-slate-500 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300">
                  Show output
                </summary>
                <pre className="mt-2 p-3 bg-slate-900 text-slate-100 rounded text-xs overflow-x-auto max-h-64">
                  {updateOutput.output}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Update History */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <h3 className="font-medium text-slate-800 dark:text-slate-100 mb-4">
          Update History
        </h3>

        {updateLogs.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
            No update history yet
          </p>
        ) : (
          <div className="space-y-3">
            {updateLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center gap-4 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg"
              >
                {/* Status Icon */}
                <div className={`p-2 rounded-lg ${
                  log.status === 'success'
                    ? 'bg-emerald-100 dark:bg-emerald-900/30'
                    : log.status === 'failed'
                    ? 'bg-red-100 dark:bg-red-900/30'
                    : 'bg-amber-100 dark:bg-amber-900/30'
                }`}>
                  {log.status === 'success' ? (
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                  ) : log.status === 'failed' ? (
                    <XCircle className="h-4 w-4 text-red-500" />
                  ) : (
                    <Clock className="h-4 w-4 text-amber-500" />
                  )}
                </div>

                {/* Version Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-slate-800 dark:text-slate-200">
                      {log.from_version || log.from_commit}
                    </span>
                    <span className="text-slate-400">→</span>
                    <span className="font-mono text-sm text-slate-800 dark:text-slate-200">
                      {log.to_version || log.to_commit}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {formatDateTime(log.started_at)} • {log.triggered_by}
                  </p>
                </div>

                {/* Status Badge */}
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  log.status === 'success'
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                    : log.status === 'failed'
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                }`}>
                  {log.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
