import { useState } from 'react'
import {
  RefreshCw, CheckCircle, AlertCircle, Clock, Loader2,
  X, Calendar, ToggleLeft, ToggleRight, Settings
} from 'lucide-react'

export default function SyncCard({
  source,
  status,
  schedule,
  onSync,
  onCancel,
  onToggleEnabled,
  onEditSchedule,
  disabled
}) {
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
      case 'partial':
        return <AlertCircle className="h-5 w-5 text-amber-500" />
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />
      case 'cancelled':
        return <X className="h-5 w-5 text-slate-500" />
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
      case 'partial':
        return 'Partial'
      case 'error':
        return 'Failed'
      case 'cancelled':
        return 'Cancelled'
      case 'never':
        return 'Never synced'
      default:
        return status.status
    }
  }

  const getTimeAgo = () => {
    if (!status?.completed_at && !status?.started_at) return null

    const timestamp = status.completed_at || status.started_at
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

  const formatDuration = (seconds) => {
    if (!seconds) return null
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
  }

  const formatNextRun = (isoString) => {
    if (!isoString) return 'Not scheduled'
    const date = new Date(isoString + 'Z')
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/New_York'
    })
  }

  const formatScheduleHours = (hours) => {
    if (!hours || hours.length === 0) return 'No hours set'
    return hours.map(h => {
      const period = h >= 12 ? 'PM' : 'AM'
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
      return `${hour12}${period}`
    }).join(', ')
  }

  const colorClasses = {
    blue: 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20',
    emerald: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/20',
    purple: 'border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/20',
    slate: 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20'
  }

  const isRunning = status?.status === 'running'
  const isEnabled = schedule?.enabled !== false
  const canSync = !isRunning && !disabled

  return (
    <div className={`rounded-xl border-2 p-5 ${colorClasses[config.color]} ${!isEnabled ? 'opacity-60' : ''}`}>
      {/* Header with Enable/Disable Toggle */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">
            {config.name}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {config.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <button
            onClick={() => onToggleEnabled(source, !isEnabled)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            title={isEnabled ? 'Disable scheduled syncs' : 'Enable scheduled syncs'}
          >
            {isEnabled ? (
              <ToggleRight className="h-6 w-6 text-emerald-500" />
            ) : (
              <ToggleLeft className="h-6 w-6 text-slate-400" />
            )}
          </button>
        </div>
      </div>

      {/* Disabled Badge */}
      {!isEnabled && (
        <div className="mb-3">
          <span className="text-xs px-2 py-1 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-full">
            Scheduling Disabled
          </span>
        </div>
      )}

      {/* Status */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-sm font-medium ${
          status?.status === 'error' ? 'text-red-600 dark:text-red-400' :
          status?.status === 'partial' ? 'text-amber-600 dark:text-amber-400' :
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

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        {/* Last Run */}
        <div className="text-slate-500 dark:text-slate-400">
          <span className="block text-slate-400 dark:text-slate-500">Last Run</span>
          {status?.completed_at ? (
            new Date(status.completed_at + 'Z').toLocaleString('en-US', {
              month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
              hour12: true, timeZone: 'America/New_York'
            })
          ) : '-'}
        </div>

        {/* Duration */}
        <div className="text-slate-500 dark:text-slate-400">
          <span className="block text-slate-400 dark:text-slate-500">Duration</span>
          {formatDuration(schedule?.avg_duration_seconds) || '-'}
        </div>

        {/* Records */}
        <div className="text-slate-500 dark:text-slate-400">
          <span className="block text-slate-400 dark:text-slate-500">Records</span>
          {status?.records_processed?.toLocaleString() || '-'}
          {status?.records_failed > 0 && (
            <span className="text-red-500 ml-1">({status.records_failed} failed)</span>
          )}
        </div>

        {/* Next Scheduled */}
        <div className="text-slate-500 dark:text-slate-400">
          <span className="block text-slate-400 dark:text-slate-500">Next Run</span>
          {isEnabled ? formatNextRun(schedule?.next_run) : 'Disabled'}
        </div>
      </div>

      {/* Schedule Display */}
      {schedule?.hours?.length > 0 && (
        <div className="text-xs text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          <span>{formatScheduleHours(schedule.hours)}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        {isRunning ? (
          <button
            onClick={() => onCancel(source)}
            className="flex-1 py-2 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
        ) : (
          <button
            onClick={() => onSync(source)}
            disabled={!canSync}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              canSync
                ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-300'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
            }`}
          >
            <RefreshCw className="h-4 w-4" />
            Sync Now
          </button>
        )}

        <button
          onClick={() => onEditSchedule(source)}
          className="py-2 px-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          title="Edit Schedule"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
