import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import {
  Settings, RefreshCw, Database, Clock, Loader2,
  CheckCircle, AlertCircle, ExternalLink, Calendar
} from 'lucide-react'
import SyncCard from './SyncCard'
import TablePreviewModal from './TablePreviewModal'
import ErrorLogModal from './ErrorLogModal'

export default function UtilitiesIndex() {
  // State
  const [syncStatus, setSyncStatus] = useState(null)
  const [syncHistory, setSyncHistory] = useState([])
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(null) // 'iiq', 'google', or 'all'
  const [selectedTable, setSelectedTable] = useState(null)
  const [selectedErrorLog, setSelectedErrorLog] = useState(null)
  const [error, setError] = useState(null)

  // Polling ref
  const pollingRef = useRef(null)

  // Fetch all data
  const fetchData = async () => {
    try {
      const [statusRes, historyRes, tablesRes] = await Promise.all([
        axios.get('/api/utilities/sync-status'),
        axios.get('/api/utilities/sync-history'),
        axios.get('/api/utilities/tables')
      ])
      setSyncStatus(statusRes.data)
      setSyncHistory(historyRes.data)
      setTables(tablesRes.data)

      // Check if any sync is running
      const iiqRunning = statusRes.data?.iiq?.status === 'running'
      const googleRunning = statusRes.data?.google?.status === 'running'

      if (iiqRunning || googleRunning) {
        startPolling()
      } else {
        stopPolling()
        setSyncing(null)
      }
    } catch (err) {
      console.error('Failed to fetch utilities data:', err)
      setError('Failed to load utilities data')
    } finally {
      setLoading(false)
    }
  }

  // Start polling for sync status
  const startPolling = () => {
    if (pollingRef.current) return // Already polling
    pollingRef.current = setInterval(fetchData, 3000) // Poll every 3 seconds
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

  // Handle sync trigger
  const handleSync = async (source) => {
    try {
      setSyncing(source)
      await axios.post(`/api/utilities/sync/${source}`)
      startPolling()
      // Immediately refresh to show running status
      await fetchData()
    } catch (err) {
      console.error(`Failed to trigger ${source} sync:`, err)
      const errorMsg = err.response?.data?.detail || `Failed to start ${source} sync`
      alert(errorMsg)
      setSyncing(null)
    }
  }

  // Handle Sync All
  const handleSyncAll = async () => {
    try {
      setSyncing('all')
      // Start IIQ first, Google will run after (sequentially via backend)
      await axios.post('/api/utilities/sync/iiq')
      startPolling()
      await fetchData()
      // Note: Google sync would need to be triggered after IIQ completes
      // For now, we'll just start IIQ and let user manually trigger Google if needed
    } catch (err) {
      console.error('Failed to trigger sync all:', err)
      const errorMsg = err.response?.data?.detail || 'Failed to start sync'
      alert(errorMsg)
      setSyncing(null)
    }
  }

  // Format duration
  const formatDuration = (seconds) => {
    if (!seconds) return '-'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
  }

  // Format timestamp - converts UTC to local timezone (EST)
  const formatTimestamp = (iso) => {
    if (!iso) return '-'
    // Ensure the timestamp is treated as UTC if no timezone specified
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

    // Format time in local timezone
    const time = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/New_York'  // EST/EDT
    })

    if (isToday) return `Today ${time}`
    if (isYesterday) return `Yesterday ${time}`
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'America/New_York'
    }) + ` ${time}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Settings className="h-6 w-6 text-slate-400" />
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Utilities</h1>
          </div>
          <p className="text-slate-500 dark:text-slate-400">
            Sync control, logs, and system management
          </p>
        </div>
        <button
          onClick={handleSyncAll}
          disabled={syncing}
          className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
            syncing
              ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {syncing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              Sync All
            </>
          )}
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SyncCard
            source="iiq"
            status={syncStatus?.iiq}
            onSync={handleSync}
            disabled={syncing}
          />
          <SyncCard
            source="google"
            status={syncStatus?.google}
            onSync={handleSync}
            disabled={syncing}
          />
          <SyncCard
            source="meraki"
            status={syncStatus?.meraki}
            onSync={handleSync}
            disabled={syncing}
          />
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
                  {syncHistory.slice(0, 10).map((log) => (
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
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                        }`}>
                          {log.triggered_by}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {log.status === 'success' ? (
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle className="h-4 w-4" />
                            Success
                          </span>
                        ) : log.status === 'error' ? (
                          <span className="flex items-center gap-1 text-red-600 dark:text-red-400" title={log.error_message}>
                            <AlertCircle className="h-4 w-4" />
                            Error
                          </span>
                        ) : log.status === 'running' ? (
                          <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Running
                          </span>
                        ) : (
                          <span className="text-slate-500">{log.status}</span>
                        )}
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

      {/* Cron Schedule Section */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
          Sync Schedule
        </h2>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div className="flex items-start gap-3">
            <Calendar className="h-5 w-5 text-slate-400 mt-0.5" />
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-slate-600 dark:text-slate-300">Google Sync:</span>
                <span className="font-medium text-slate-800 dark:text-slate-100">Daily at 9:00 PM EST</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-slate-600 dark:text-slate-300">IIQ Sync:</span>
                <span className="font-medium text-slate-800 dark:text-slate-100">Daily at 10:00 PM EST</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                Automated syncs run nightly (2:00/3:00 AM UTC). Use manual sync for immediate updates.
              </p>
            </div>
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
    </div>
  )
}
