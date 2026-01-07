import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import {
  Settings, RefreshCw, Database, Clock, Loader2,
  CheckCircle, AlertCircle, ExternalLink, Calendar, X
} from 'lucide-react'
import SyncCard from './SyncCard'
import TablePreviewModal from './TablePreviewModal'
import ErrorLogModal from './ErrorLogModal'
import ScheduleEditorModal from './ScheduleEditorModal'
import { useIntegrations } from '../../context/IntegrationsContext'

export default function UtilitiesIndex() {
  // State
  const [syncStatus, setSyncStatus] = useState(null)
  const [schedules, setSchedules] = useState({})
  const [syncHistory, setSyncHistory] = useState([])
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedTable, setSelectedTable] = useState(null)
  const [selectedErrorLog, setSelectedErrorLog] = useState(null)
  const [editingSchedule, setEditingSchedule] = useState(null)
  const [error, setError] = useState(null)

  // Integration context
  const { integrations } = useIntegrations()
  const enabledSources = ['iiq', 'google', 'meraki'].filter(s => integrations[s])

  // Polling ref
  const pollingRef = useRef(null)

  // Check if any sync is running (only enabled sources)
  const getRunningCount = () => {
    if (!syncStatus) return 0
    return enabledSources.filter(
      s => syncStatus[s]?.status === 'running'
    ).length
  }

  const getRunningSources = () => {
    if (!syncStatus) return []
    return enabledSources.filter(
      s => syncStatus[s]?.status === 'running'
    )
  }

  // Calculate ETA based on average durations
  const getETA = () => {
    const running = getRunningSources()
    if (running.length === 0) return null

    // Get max average duration of running syncs
    const durations = running.map(s => schedules[s]?.avg_duration_seconds || 300)
    const maxDuration = Math.max(...durations)

    // Estimate remaining time (rough - assumes just started)
    const mins = Math.ceil(maxDuration / 60)
    return `~${mins}m`
  }

  // Fetch all data
  const fetchData = async () => {
    try {
      const [statusRes, schedulesRes, historyRes, tablesRes] = await Promise.all([
        axios.get('/api/utilities/sync-status'),
        axios.get('/api/utilities/schedules'),
        axios.get('/api/utilities/sync-history'),
        axios.get('/api/utilities/tables')
      ])

      setSyncStatus(statusRes.data)
      setSchedules(schedulesRes.data)
      setSyncHistory(historyRes.data)
      setTables(tablesRes.data)

      // Check if any sync is running (only enabled sources)
      const anyRunning = enabledSources.some(
        s => statusRes.data[s]?.status === 'running'
      )

      if (anyRunning) {
        startPolling()
      } else {
        stopPolling()
      }
    } catch (err) {
      console.error('Failed to fetch utilities data:', err)
      setError('Failed to load utilities data')
    } finally {
      setLoading(false)
    }
  }

  // Start polling for sync status (5 second interval)
  const startPolling = () => {
    if (pollingRef.current) return // Already polling
    pollingRef.current = setInterval(fetchData, 5000)
  }

  // Stop polling
  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    fetchData()
    return () => stopPolling()
  }, [])

  // Handle single sync trigger - with immediate UI feedback
  const handleSync = async (source) => {
    // Optimistic UI update - immediately show as running
    setSyncStatus(prev => ({
      ...prev,
      [source]: { ...prev?.[source], status: 'running', started_at: new Date().toISOString() }
    }))
    startPolling()

    try {
      await axios.post(`/api/utilities/sync/${source}`)
      // Don't fetch immediately - the subprocess needs time to create its SyncLog
      // Let the 5-second polling naturally pick up the status
    } catch (err) {
      console.error(`Failed to trigger ${source} sync:`, err)
      const errorMsg = err.response?.data?.detail || `Failed to start ${source} sync`
      // Revert optimistic update on error
      await fetchData()
      alert(errorMsg)
    }
  }

  // Handle Sync All (parallel) - with immediate UI feedback
  const handleSyncAll = async () => {
    // Optimistic UI update - immediately show enabled sources as running
    const now = new Date().toISOString()
    setSyncStatus(prev => {
      const updated = { ...prev }
      enabledSources.forEach(source => {
        if (prev?.[source]?.status !== 'running') {
          updated[source] = { ...prev?.[source], status: 'running', started_at: now }
        }
      })
      return updated
    })
    startPolling()

    try {
      const res = await axios.post('/api/utilities/sync/all')
      if (res.data.skipped.length > 0) {
        const skippedNames = res.data.skipped.map(s => s.source.toUpperCase()).join(', ')
        console.log(`Skipped already running: ${skippedNames}`)
      }
      // Don't fetch immediately - the subprocesses need time to create their SyncLogs
      // Let the 5-second polling naturally pick up the status
    } catch (err) {
      console.error('Failed to trigger sync all:', err)
      const errorMsg = err.response?.data?.detail || 'Failed to start syncs'
      // Revert optimistic update on error
      await fetchData()
      alert(errorMsg)
    }
  }

  // Handle cancel
  const handleCancel = async (source) => {
    try {
      await axios.post(`/api/utilities/sync/${source}/cancel`)
      await fetchData()
    } catch (err) {
      console.error(`Failed to cancel ${source} sync:`, err)
      const errorMsg = err.response?.data?.detail || `Failed to cancel ${source} sync`
      alert(errorMsg)
    }
  }

  // Handle toggle enabled
  const handleToggleEnabled = async (source, enabled) => {
    try {
      await axios.put(`/api/utilities/schedules/${source}`, { enabled })
      await fetchData()
    } catch (err) {
      console.error(`Failed to update ${source} schedule:`, err)
    }
  }

  // Handle schedule save
  const handleSaveSchedule = async (source, hours) => {
    try {
      await axios.put(`/api/utilities/schedules/${source}`, { hours })
      await fetchData()
      setEditingSchedule(null)
    } catch (err) {
      console.error(`Failed to update ${source} schedule:`, err)
      throw err
    }
  }

  // Format duration
  const formatDuration = (seconds) => {
    if (!seconds) return '-'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
  }

  // Get display settings from localStorage
  const getDisplaySettings = () => ({
    timezone: localStorage.getItem('atlas_timezone') || 'America/New_York',
    hour12: localStorage.getItem('atlas_time_format') !== '24'
  })

  // Format timestamp - converts UTC to user's selected timezone
  const formatTimestamp = (iso) => {
    if (!iso) return '-'
    const { timezone, hour12 } = getDisplaySettings()
    let dateStr = iso
    if (!iso.endsWith('Z') && !iso.includes('+') && !iso.includes('-', 10)) {
      dateStr = iso + 'Z'
    }
    const date = new Date(dateStr)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const isYesterday = date.toDateString() === yesterday.toDateString()

    const time = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12,
      timeZone: timezone
    })

    if (isToday) return `Today ${time}`
    if (isYesterday) return `Yesterday ${time}`
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: timezone
    }) + ` ${time}`
  }

  // Get status badge color
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'success':
        return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
      case 'partial':
        return 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
      case 'error':
        return 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
      case 'cancelled':
        return 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
      case 'running':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
      default:
        return 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
    }
  }

  const runningCount = getRunningCount()
  const runningSources = getRunningSources()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Progress Banner - shown when syncs are running */}
      {runningCount > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
              <span className="font-medium text-blue-700 dark:text-blue-300">
                {runningCount} sync{runningCount > 1 ? 's' : ''} running: {runningSources.map(s => s.toUpperCase()).join(', ')}
              </span>
            </div>
            <span className="text-sm text-blue-600 dark:text-blue-400">
              ETA: {getETA()}
            </span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Settings className="h-6 w-6 text-slate-400" />
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Utilities</h1>
          </div>
          <p className="text-slate-500 dark:text-slate-400">
            Sync control, scheduling, and system management
          </p>
        </div>
        <button
          onClick={handleSyncAll}
          disabled={runningCount === enabledSources.length}
          className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
            runningCount === enabledSources.length
              ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          <RefreshCw className="h-4 w-4" />
          Sync All
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Sync Control Section */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
          Sync Control
        </h2>
        <div className={`grid grid-cols-1 gap-4 ${enabledSources.length === 3 ? 'md:grid-cols-3' : enabledSources.length === 2 ? 'md:grid-cols-2' : ''}`}>
          {integrations.iiq && (
            <SyncCard
              source="iiq"
              status={syncStatus?.iiq}
              schedule={schedules?.iiq}
              onSync={handleSync}
              onCancel={handleCancel}
              onToggleEnabled={handleToggleEnabled}
              onEditSchedule={setEditingSchedule}
            />
          )}
          {integrations.google && (
            <SyncCard
              source="google"
              status={syncStatus?.google}
              schedule={schedules?.google}
              onSync={handleSync}
              onCancel={handleCancel}
              onToggleEnabled={handleToggleEnabled}
              onEditSchedule={setEditingSchedule}
            />
          )}
          {integrations.meraki && (
            <SyncCard
              source="meraki"
              status={syncStatus?.meraki}
              schedule={schedules?.meraki}
              onSync={handleSync}
              onCancel={handleCancel}
              onToggleEnabled={handleToggleEnabled}
              onEditSchedule={setEditingSchedule}
            />
          )}
        </div>
      </section>

      {/* Sync History Section */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
          Recent Sync History
        </h2>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {syncHistory.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400">
              No sync history available. Run a sync to see history here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/50">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-300">Source</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-300">Started</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-300">Duration</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-300">Records</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-300">Trigger</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-300">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {syncHistory.slice(0, 15).map((log) => (
                    <tr key={log.id} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="py-3 px-4">
                        <span className={`font-medium ${
                          log.source === 'iiq' ? 'text-blue-600 dark:text-blue-400' :
                          log.source === 'google' ? 'text-emerald-600 dark:text-emerald-400' :
                          'text-purple-600 dark:text-purple-400'
                        }`}>
                          {log.source.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        {formatTimestamp(log.started_at)}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        {formatDuration(log.duration_seconds)}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        {log.records_processed?.toLocaleString() || '-'}
                        {log.records_failed > 0 && (
                          <button
                            onClick={() => setSelectedErrorLog(log)}
                            className="text-red-500 hover:text-red-600 dark:hover:text-red-400 ml-1 underline cursor-pointer"
                            title="Click to view error details"
                          >
                            ({log.records_failed} failed)
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          log.triggered_by === 'manual'
                            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                            : log.triggered_by === 'scheduled'
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                        }`}>
                          {log.triggered_by}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-1 rounded-full ${getStatusBadgeClass(log.status)}`}>
                          {log.status === 'running' && (
                            <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                          )}
                          {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Database Overview Section */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
          Database Overview
        </h2>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-300">Table</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-300">Rows</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-300">Last Updated</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-300"></th>
                </tr>
              </thead>
              <tbody>
                {tables.map((table) => (
                  <tr key={table.name} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-slate-400" />
                        <span className="font-medium text-slate-800 dark:text-slate-100">
                          {table.display_name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      {table.rows?.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      {table.name === 'network_cache' ? (
                        <span className="text-purple-600 dark:text-purple-400">Realtime</span>
                      ) : (
                        formatTimestamp(table.last_updated)
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setSelectedTable(table)}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex items-center gap-1"
                      >
                        Browse
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Table Preview Modal */}
      {selectedTable && (
        <TablePreviewModal
          table={selectedTable}
          onClose={() => setSelectedTable(null)}
        />
      )}

      {/* Error Log Modal */}
      {selectedErrorLog && (
        <ErrorLogModal
          log={selectedErrorLog}
          onClose={() => setSelectedErrorLog(null)}
        />
      )}

      {/* Schedule Editor Modal */}
      {editingSchedule && (
        <ScheduleEditorModal
          source={editingSchedule}
          schedule={schedules[editingSchedule]}
          onSave={handleSaveSchedule}
          onClose={() => setEditingSchedule(null)}
        />
      )}
    </div>
  )
}
