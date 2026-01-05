import { RefreshCw, CheckCircle, AlertCircle, Clock, Loader2 } from 'lucide-react'

export default function SyncCard({ source, status, onSync, disabled }) {
  const sourceConfig = {
    iiq: {
      name: 'Incident IQ',
      color: 'blue',
      description: 'Assets, Users, Tickets'
    },
    google: {
      name: 'Google Admin',
      color: 'emerald',
      description: 'Device Telemetry, Users'
    },
    meraki: {
      name: 'Meraki',
      color: 'purple',
      description: 'Networks, Devices, SSIDs, Clients'
    }
  }

  const config = sourceConfig[source] || { name: source, color: 'slate', description: '' }

  const getStatusIcon = () => {
    if (!status) return <Clock className="h-5 w-5 text-slate-400" />

    switch (status.status) {
      case 'running':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
      case 'success':
        return <CheckCircle className="h-5 w-5 text-emerald-500" />
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />
      case 'on-demand':
        return <Clock className="h-5 w-5 text-purple-500" />
      default:
        return <Clock className="h-5 w-5 text-slate-400" />
    }
  }

  const getStatusText = () => {
    if (!status) return 'Unknown'

    switch (status.status) {
      case 'running':
        return 'Syncing...'
      case 'success':
        return 'Synced'
      case 'error':
        return 'Failed'
      case 'on-demand':
        return 'On-demand'
      case 'never':
        return 'Never synced'
      default:
        return status.status
    }
  }

  const getTimeAgo = () => {
    if (!status?.completed_at && !status?.started_at) return null
    if (status.status === 'on-demand') return null

    const timestamp = status.completed_at || status.started_at
    // Treat timestamp as UTC if no timezone specified
    let dateStr = timestamp
    if (!timestamp.endsWith('Z') && !timestamp.includes('+') && !timestamp.includes('-', 10)) {
      dateStr = timestamp + 'Z'
    }
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  const colorClasses = {
    blue: 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20',
    emerald: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/20',
    purple: 'border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/20',
    slate: 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20'
  }

  const isRunning = status?.status === 'running'
  const canSync = !isRunning && !disabled

  return (
    <div className={`rounded-xl border-2 p-5 ${colorClasses[config.color]}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">
            {config.name}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {config.description}
          </p>
        </div>
        {getStatusIcon()}
      </div>

      {/* Status */}
      <div className="flex items-center gap-2 mb-4">
        <span className={`text-sm font-medium ${
          status?.status === 'error' ? 'text-red-600 dark:text-red-400' :
          status?.status === 'success' ? 'text-emerald-600 dark:text-emerald-400' :
          status?.status === 'running' ? 'text-blue-600 dark:text-blue-400' :
          'text-slate-600 dark:text-slate-400'
        }`}>
          {getStatusText()}
        </span>
        {getTimeAgo() && (
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {getTimeAgo()}
          </span>
        )}
      </div>

      {/* Records processed */}
      {status?.records_processed > 0 && (
        <div className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          {status.records_processed.toLocaleString()} records
          {status.records_failed > 0 && (
            <span className="text-red-500 ml-1">
              ({status.records_failed} failed)
            </span>
          )}
        </div>
      )}

      {/* Error message */}
      {status?.error_message && (
        <div className="text-xs text-red-500 dark:text-red-400 mb-3 truncate">
          {status.error_message}
        </div>
      )}

      {/* Sync button */}
      <button
        onClick={() => onSync(source)}
        disabled={!canSync}
        className={`w-full py-2 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
          canSync
            ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-300'
            : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
        }`}
      >
        {isRunning ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Syncing...
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4" />
            Sync Now
          </>
        )}
      </button>
    </div>
  )
}
